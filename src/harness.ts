import type { ChildProcess } from "node:child_process";
import type { ModelChoice } from "./types";
import type { Writable } from "node:stream";

export interface HarnessOptions {
    command: string;
    args?: string[];
    nodePath?: string;
    nodeArgs?: string[];
    profile?: string;
    /** Harness state root (DSH_HOME), not the operating system HOME. */
    home?: string;
    cwd?: string;
    model: string;
    provider: string;
    reasoningEffort?: string;
    maxTokens?: number;
    env?: Record<string, string>;
    patches?: string[];
}

export interface ContentBlock {
    type: string;
    text?: string;
    [key: string]: unknown;
}

type NotificationListener = (method: string, params: any) => void;
type Pending = { resolve: (value: any) => void; reject: (error: Error) => void; timer?: ReturnType<typeof setTimeout> };
export interface HarnessExit { code: number | null; signal: NodeJS.Signals | null; expected: boolean }

export class HarnessRpcError extends Error {
    constructor(message: string, readonly code?: number) {
        super(message);
        this.name = "HarnessRpcError";
    }
}

/** The official SDK wire format is one JSON-RPC 2.0 object per UTF-8 line. */
export class HarnessClient {
    private child?: ChildProcess;
    private control?: Writable;
    private bridgeCancel = false;
    private pending = new Map<string, Pending>();
    private notifications = new Set<NotificationListener>();
    private logs = new Set<(message: string) => void>();
    private exits = new Set<(info: HarnessExit) => void>();
    private nextId = 0;
    private buffer = "";
    private stderrBuffer = "";
    private stderrTail = "";
    private startTask?: Promise<void>;
    private closeTask?: Promise<void>;
    private exitTask?: Promise<void>;
    private exited = false;
    private closing = false;
    private secrets: string[];

    constructor(readonly options: HarnessOptions) {
        this.secrets = Object.entries({ ...process.env, ...options.env })
            .filter(([key, value]) => /key|token|password|secret|authorization|credential/i.test(key) && value && value.length >= 8)
            .map(([, value]) => value!)
            .sort((a, b) => b.length - a.length);
    }

    /** Available after the per-launch bridge announces its native control channel. */
    get supportsCancel(): boolean { return this.bridgeCancel && !this.closing && !this.exited; }

    start(): Promise<void> {
        if (this.closing) return Promise.reject(new Error("Harness 客户端已关闭"));
        this.startTask ??= this.launch();
        return this.startTask;
    }

    private async launch(): Promise<void> {
        const { spawn } = require("node:child_process") as typeof import("node:child_process");
        const { delimiter, dirname } = require("node:path") as typeof import("node:path");
        const o = this.options;
        const cliArgs = [...(o.args ?? []), "--profile", o.profile || "sdk"];
        for (const patch of o.patches ?? []) cliArgs.push("--patch", patch);
        const command = o.nodePath || o.command;
        const args = o.nodePath ? [...(o.nodeArgs ?? []), o.command, ...cliArgs] : cliArgs;
        const env = { ...process.env, ...o.env };
        if (o.home) env.DSH_HOME = o.home;
        // GUI hosts often inherit a short PATH; make a configured Node usable by child tools.
        if (o.nodePath) env.PATH = `${dirname(o.nodePath)}${delimiter}${env.PATH ?? ""}`;
        this.child = spawn(command, args, {
            cwd: o.cwd || undefined,
            env,
            stdio: ["pipe", "pipe", "pipe", "pipe"],
            shell: false,
            windowsHide: true,
            detached: process.platform !== "win32",
        });
        const child = this.child;
        this.control = child.stdio[3] as Writable;
        this.control.on("error", () => { this.bridgeCancel = false; });
        this.control.on("close", () => { this.bridgeCancel = false; });
        this.exitTask = new Promise((resolve) => {
            child.once("close", (code, signal) => {
                this.exited = true;
                this.bridgeCancel = false;
                if (this.stderrBuffer) this.emitLog(this.stderrBuffer);
                this.stderrBuffer = "";
                const detail = this.stderrTail.trim();
                this.failPending(new Error(`Harness 进程已退出（${(signal || code) ?? "unknown"}）${detail ? `：${detail}` : ""}`));
                if (!this.closing) this.emitLog(`Harness 进程已退出（${(signal || code) ?? "unknown"}）`);
                for (const listener of this.exits) {
                    try { listener({ code, signal, expected: this.closing }); } catch { /* Contain consumer failures. */ }
                }
                resolve();
            });
        });
        child.stdout!.setEncoding("utf8");
        child.stderr!.setEncoding("utf8");
        child.stdout!.on("data", (chunk: string) => this.readFrames(chunk));
        child.stderr!.on("data", (chunk: string) => this.readStderr(chunk));
        child.stdin!.on("error", (error) => this.failPending(new Error(this.redact(error.message))));
        child.on("error", (error) => this.failPending(new Error(`无法启动 Harness：${this.redact(error.message)}`)));
        try {
            await this.request("initialize", {
                cwd: o.cwd || process.cwd(),
                model: o.model,
                provider: o.provider,
                ...(o.reasoningEffort ? { reasoningEffort: o.reasoningEffort } : {}),
                ...(o.maxTokens ? { maxTokens: o.maxTokens } : {}),
            }, 60_000);
        } catch (error) {
            await this.close();
            throw error;
        }
    }

    request(method: string, params: any = {}, timeoutMs = 30_000): Promise<any> {
        const child = this.child;
        if (!child?.stdin || this.exited || child.stdin.destroyed || (this.closing && method !== "shutdown")) {
            return Promise.reject(new Error("Harness 进程未连接"));
        }
        return this.sendRequest(child.stdin, method, params, timeoutMs);
    }

    /** Resolves when the native agent accepts cancellation; session/wait confirms settlement. */
    async cancel(sessionId: string): Promise<void> {
        if (!this.supportsCancel || !this.control || this.control.destroyed) throw new Error("当前 Harness 未提供原生停止能力");
        await this.sendRequest(this.control, "session/cancel", { sessionId }, 5_000);
    }

    async listModels(): Promise<{ models: ModelChoice[]; errors: string[] }> {
        if (!this.control || this.control.destroyed) throw new Error("模型目录通道未连接");
        return this.sendRequest(this.control, "models/list", {}, 30_000);
    }

    private sendRequest(output: Writable, method: string, params: any, timeoutMs: number): Promise<any> {
        const id = `siyuan_${++this.nextId}`;
        return new Promise((resolve, reject) => {
            const timer = timeoutMs > 0 ? setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`Harness 请求超时：${method}（${timeoutMs} ms）；操作可能仍在执行，请勿自动重试写入`));
            }, timeoutMs) : undefined;
            this.pending.set(id, { resolve, reject, timer });
            try {
                output.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`, (error) => {
                    if (error) this.rejectPending(id, new Error(this.redact(error.message)));
                });
            } catch (error) {
                this.rejectPending(id, new Error(this.redact(error instanceof Error ? error.message : String(error))));
            }
        });
    }

    prompt(sessionId: string, contentBlocks: ContentBlock[]): Promise<{ messageId: string }> {
        return this.request("session/prompt", { sessionId, contentBlocks });
    }

    resume(sessionId: string): Promise<Record<string, never>> {
        return this.request("session/resume", { sessionId });
    }

    onNotification(callback: NotificationListener): () => void {
        this.notifications.add(callback);
        return () => this.notifications.delete(callback);
    }

    onLog(callback: (message: string) => void): () => void {
        this.logs.add(callback);
        return () => this.logs.delete(callback);
    }

    onExit(callback: (info: HarnessExit) => void): () => void {
        this.exits.add(callback);
        return () => this.exits.delete(callback);
    }

    close(): Promise<void> {
        this.closeTask ??= this.dispose();
        return this.closeTask;
    }

    private async dispose(): Promise<void> {
        this.closing = true;
        const child = this.child;
        if (!child) return;
        if (!this.exited) {
            try { await this.request("shutdown", {}, 1_500); } catch { /* A busy runtime can require forced termination. */ }
            child.stdin?.end();
            if (!(await this.waitForExit(750))) {
                this.kill("SIGTERM");
                if (!(await this.waitForExit(1_000))) {
                    this.kill("SIGKILL");
                    await this.waitForExit(1_000);
                }
            }
        }
        // POSIX tool children share this dedicated process group even if the leader exits early.
        // Once its owner has exited, no child may survive the client closing.
        if (process.platform !== "win32") this.kill("SIGKILL");
        this.failPending(new Error("Harness 客户端已关闭"));
        child.stdout?.destroy();
        child.stderr?.destroy();
        child.stdin?.destroy();
        this.control?.destroy();
        this.control = undefined;
        if (!this.exited) {
            // Do not report a successful close without observing the process actually exit.
            throw new Error(`Harness 进程 ${child.pid ?? "unknown"} 在 SIGKILL 后仍未退出，请检查系统进程状态`);
        }
        this.child = undefined;
    }

    private async waitForExit(ms: number): Promise<boolean> {
        if (this.exited) return true;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const done = await Promise.race([
            this.exitTask!.then(() => true),
            new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), ms); }),
        ]);
        if (timer) clearTimeout(timer);
        return done;
    }

    private kill(signal: NodeJS.Signals): void {
        const child = this.child;
        if (!child?.pid) return;
        try {
            if (process.platform === "win32") {
                const { spawn } = require("node:child_process") as typeof import("node:child_process");
                const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, shell: false, stdio: "ignore" });
                killer.on("error", () => { try { child.kill(signal); } catch { /* Already gone. */ } });
            } else process.kill(-child.pid, signal);
        } catch { try { child.kill(signal); } catch { /* Already gone. */ } }
    }

    private readFrames(chunk: string): void {
        this.buffer += chunk;
        let newline: number;
        while ((newline = this.buffer.indexOf("\n")) >= 0) {
            const line = this.buffer.slice(0, newline).trim();
            this.buffer = this.buffer.slice(newline + 1);
            if (!line) continue;
            let frame: any;
            try { frame = JSON.parse(line); } catch { this.emitLog(`忽略非 JSON-RPC 输出：${line}`); continue; }
            if (!frame || typeof frame !== "object" || frame.jsonrpc !== "2.0") continue;
            if (typeof frame.method === "string") {
                if (frame.id !== undefined) {
                    // Current official SDK has no approval requests; never silently approve future ones.
                    this.child?.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", id: frame.id, error: { code: -32601, message: "Client request method is unsupported" } })}\n`);
                    this.emitLog(`Harness 请求了尚未支持的交互：${frame.method}`);
                } else {
                    if (frame.method === "session.stream.ready") {
                        this.bridgeCancel = frame.params?.version === 1 && frame.params?.capabilities?.cancel === true;
                    }
                    for (const listener of this.notifications) {
                        try { listener(frame.method, frame.params ?? {}); } catch { /* Contain consumer failures. */ }
                    }
                }
            } else if (typeof frame.id === "string" || typeof frame.id === "number") {
                const pending = this.pending.get(String(frame.id));
                if (!pending) continue;
                this.pending.delete(String(frame.id));
                clearTimeout(pending.timer);
                if (frame.error) pending.reject(new HarnessRpcError(this.redact(String(frame.error.message || "Harness JSON-RPC 错误")), frame.error.code));
                else pending.resolve(frame.result);
            }
        }
        // A malformed peer must not grow renderer memory without bound.
        if (this.buffer.length > 8 * 1024 * 1024) {
            this.buffer = "";
            this.failPending(new Error("Harness 输出超过单帧 8 MiB 限制"));
            void this.close();
        }
    }

    private readStderr(chunk: string): void {
        this.stderrBuffer += chunk;
        let newline: number;
        while ((newline = this.stderrBuffer.indexOf("\n")) >= 0) {
            this.emitLog(this.stderrBuffer.slice(0, newline));
            this.stderrBuffer = this.stderrBuffer.slice(newline + 1);
        }
        if (this.stderrBuffer.length > 8_000) {
            this.emitLog(this.stderrBuffer);
            this.stderrBuffer = "";
        }
    }

    private redact(value: string): string {
        let text = value;
        for (const secret of this.secrets) text = text.split(secret).join("[REDACTED]");
        return text
            .replace(/\b(Bearer\s+)[^\s"',;]+/gi, "$1[REDACTED]")
            .replace(/\bsk-[a-zA-Z0-9_-]{8,}/g, "[REDACTED]")
            .replace(/((?:api[_-]?key|access[_-]?token|authorization|password|secret)\s*["']?\s*[=:]\s*["']?)[^\s"',;}]+/gi, "$1[REDACTED]")
            .slice(-2_000);
    }

    private emitLog(raw: string): void {
        const message = this.redact(raw).trim();
        if (!message) return;
        this.stderrTail = `${this.stderrTail}\n${message}`.slice(-4_000);
        for (const listener of this.logs) {
            try { listener(message); } catch { /* Contain consumer failures. */ }
        }
    }

    private rejectPending(id: string, error: Error): void {
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);
        clearTimeout(pending.timer);
        pending.reject(error);
    }

    private failPending(error: Error): void {
        for (const id of this.pending.keys()) this.rejectPending(id, error);
    }
}
