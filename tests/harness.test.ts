import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HarnessClient, HarnessRpcError } from "../src/harness";

let directory: string;
let script: string;
const clients: HarnessClient[] = [];

beforeEach(async () => {
    directory = await realpath(await mkdtemp(join(tmpdir(), "siyuan-harness-rpc-")));
    script = join(directory, "fake server.mjs");
    await writeFile(script, `
import readline from 'node:readline';
import {spawn} from 'node:child_process';
import {Socket} from 'node:net';
const lines = readline.createInterface({input: process.stdin});
let incoming;
const send = (frame) => process.stdout.write(JSON.stringify({jsonrpc:'2.0',...frame})+'\\n');
if(process.env.TEST_NATIVE_BRIDGE) {
  const control = readline.createInterface({input:new Socket({fd:3,readable:true,writable:false})});
  control.on('line',line=>{const frame=JSON.parse(line);if(frame.method==='models/list'){send({id:frame.id,result:{models:[{provider:'configured',providerName:'Configured',id:'native-model',name:'Native model',reasoning:['off','high']}],errors:[]}});return;}send({id:frame.id,result:{}});send({method:'test.cancelled',params:{sessionId:frame.params.sessionId}});});
  send({method:'session.stream.ready',params:{version:1,capabilities:{assistantStream:true,cancel:true}}});
}
lines.on('line', line => {
  const frame = JSON.parse(line);
  if (!frame.method) {incoming = frame; return;}
  const reply = result => send({id:frame.id,result});
  if(frame.method === 'initialize') {reply({serverInfo:{name:'fake'}}); return;}
  if(frame.method === 'inspect') {reply({args:process.argv.slice(2),home:process.env.DSH_HOME,cwd:process.cwd(),params:frame.params,pid:process.pid}); return;}
  if(frame.method === 'session/prompt') {
    process.stdout.write('harmless startup line\\n');
    send({method:'session.event',params:{sessionId:frame.params.sessionId,event:{type:'assistant/message',seq:1,data:{message:{id:'a',role:'assistant',content:[{type:'text',text:'你好'}]}}}}});
    reply({messageId:'message-1'}); return;
  }
  if(frame.method === 'ask-client') {send({id:'server-1',method:'approve',params:{}}); setTimeout(()=>reply(incoming),20); return;}
  if(frame.method === 'fail') {send({id:frame.id,error:{code:-32000,message:'API_KEY='+process.env.TEST_API_KEY}}); return;}
  if(frame.method === 'log') {process.stderr.write('Bearer '+process.env.TEST_API_KEY+'\\n'+'x'.repeat(5000)+'\\n'); reply({}); return;}
  if(frame.method === 'crash') {setTimeout(()=>process.exit(7),5); return;}
  if(frame.method === 'spawn-child') {
    const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000);process.send('ready')"],{stdio:['ignore','ignore','ignore','ipc']});
    child.once('message',()=>reply({pid:child.pid}));return;
  }
  if(frame.method === 'shutdown') {if(process.env.HANG_SHUTDOWN)return;reply({});setTimeout(()=>process.exit(0),10); return;}
  if(frame.method === 'hang') return;
  if(frame.method === 'delay') {setTimeout(()=>reply({done:true}),40);return;}
  reply({});
});
`);
});

afterEach(async () => {
    await Promise.all(clients.splice(0).map(client => client.close()));
    await rm(directory, { recursive: true, force: true });
});

function create(extra = {}) {
    const client = new HarnessClient({ command: script, nodePath: process.execPath, cwd: directory, model: "fake", provider: "fake", ...extra });
    clients.push(client);
    return client;
}

describe("Harness JSON-RPC subprocess", () => {
    it("reads the native model catalog over the bridge channel without sending prompts", async () => {
        const client = create({ env: { TEST_NATIVE_BRIDGE: "1" } });
        await client.start();
        expect(await client.listModels()).toEqual({ models: [{provider: 'configured', providerName: 'Configured', id: 'native-model', name: 'Native model', reasoning: ['off', 'high']}], errors: [] });
        expect(await client.request("inspect")).toHaveProperty("pid");
    });
    it("uses the bridge's separate control channel for native cancellation and reclaims it on close", async () => {
        const client = create({ env: { TEST_NATIVE_BRIDGE: "1" } });
        const notices: any[] = [];
        client.onNotification((method, params) => notices.push({ method, params }));
        await client.start();
        expect(client.supportsCancel).toBe(true);
        await client.cancel("s-precise");
        await client.request("inspect");
        expect(notices).toContainEqual({ method: "test.cancelled", params: { sessionId: "s-precise" } });
        await client.close();
        expect(client.supportsCancel).toBe(false);
        await expect(client.cancel("s-precise")).rejects.toThrow("未提供原生停止");
    });

    it("does not claim native cancellation without the versioned bridge handshake", async () => {
        const client = create();
        await client.start();
        expect(client.supportsCancel).toBe(false);
        await expect(client.cancel("s1")).rejects.toThrow("未提供原生停止");
        expect(await client.request("inspect")).toHaveProperty("pid");
    });

    it("launches without shell expansion and passes profile, overlays, environment and prompt identity", async () => {
        const client = create({ home: join(directory, "isolated home"), patches: ["a patch.yml", "$(touch SHOULD_NOT_EXIST).yml"] });
        const notifications: any[] = [];
        client.onNotification(() => { throw new Error("UI callback failure"); });
        client.onNotification((method, params) => notifications.push({ method, params }));
        await Promise.all([client.start(), client.start()]);
        const details = await client.request("inspect", { example: "保留中文" });
        expect(details).toMatchObject({ args: ["--profile", "sdk", "--patch", "a patch.yml", "--patch", "$(touch SHOULD_NOT_EXIST).yml"], home: join(directory, "isolated home"), cwd: directory, params: { example: "保留中文" } });
        expect(await client.prompt("s1", [{ type: "text", text: "hi" }])).toEqual({ messageId: "message-1" });
        expect(notifications[0]).toMatchObject({ method: "session.event", params: { sessionId: "s1", event: { data: { message: { content: [{ text: "你好" }] } } } } });
        await client.resume("s1");
    });

    it("times out an unresolved request and keeps the protocol usable", async () => {
        const client = create();
        await client.start();
        await expect(client.request("hang", {}, 30)).rejects.toThrow("操作可能仍在执行");
        expect(await client.request("inspect")).toHaveProperty("pid");
    });

    it("allows an unlimited wait with a non-positive timeout", async () => {
        const client = create();
        await client.start();
        expect(await client.request("delay", {}, 0)).toEqual({ done: true });
        expect(await client.request("delay", {}, -1)).toEqual({ done: true });
    });

    it("rejects pending requests when the runtime dies", async () => {
        const client = create();
        const exits: any[] = [];
        client.onExit(info => exits.push(info));
        await client.start();
        await expect(client.request("crash")).rejects.toThrow("7");
        await expect(client.request("inspect")).rejects.toThrow("未连接");
        expect(exits).toEqual([{ code: 7, signal: null, expected: false }]);
    });

    it("redacts errors and bounds stderr logs", async () => {
        const secret = "not-a-real-test-secret-123456";
        const client = create({ env: { TEST_API_KEY: secret } });
        const logs: string[] = [];
        client.onLog(message => logs.push(message));
        await client.start();
        const failure = await client.request("fail").catch(error => error);
        expect(failure).toBeInstanceOf(HarnessRpcError);
        expect(failure.code).toBe(-32000);
        expect(failure.message).not.toContain(secret);
        await client.request("log");
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(logs.join("\n")).not.toContain(secret);
        expect(logs.some(line => line.includes("[REDACTED]"))).toBe(true);
        expect(logs.every(line => line.length <= 2000)).toBe(true);
    });

    it("rejects unsupported server requests without approving them", async () => {
        const client = create();
        await client.start();
        expect(await client.request("ask-client")).toMatchObject({ id: "server-1", error: { code: -32601 } });
    });

    it("reclaims an uncooperative process and rejects its pending work", async () => {
        const client = create({ env: { HANG_SHUTDOWN: "1" } });
        await client.start();
        const { pid } = await client.request("inspect");
        const pending = expect(client.request("hang")).rejects.toThrow(/已退出|已关闭/);
        await Promise.all([client.close(), client.close()]);
        await pending;
        expect(() => process.kill(pid, 0)).toThrow();
    }, 10_000);

    it.skipIf(process.platform === "win32")("reclaims owned tool children after a graceful runtime exit", async () => {
        const client = create();
        await client.start();
        const { pid } = await client.request("spawn-child");
        expect(() => process.kill(pid, 0)).not.toThrow();
        await client.close();
        let alive = true;
        for (let attempt = 0; attempt < 20 && alive; attempt++) {
            try { process.kill(pid, 0); await new Promise(resolve => setTimeout(resolve, 20)); } catch { alive = false; }
        }
        expect(alive).toBe(false);
    });

    it("handles a missing executable without leaving a pending initialize", async () => {
        const client = create({ command: join(directory, "missing"), nodePath: undefined });
        await expect(client.start()).rejects.toThrow("无法启动 Harness");
    });
});
