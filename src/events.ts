export interface UiEvent {
    type: "assistant" | "user" | "tool" | "status" | "turn-end" | "error" | "title";
    sessionId: string;
    seq?: number;
    turn?: number;
    step?: number;
    interrupted?: boolean;
    messageId?: string;
    text?: string;
    reasoning?: string;
    toolName?: string;
    toolCallId?: string;
    toolCalls?: { id: string; name: string; arguments?: unknown }[];
    status?: string;
    isError?: boolean;
}

const record = (value: any): value is Record<string, any> => value !== null && typeof value === "object" && !Array.isArray(value);

/** Current SDK notifications carry committed session events, not live token deltas. */
export function eventToUi(method: string, params: any): UiEvent | null {
    if (!record(params) || typeof params.sessionId !== "string") return null;
    const sessionId = params.sessionId;
    if (method === "session.status") return typeof params.status === "string" ? { type: "status", sessionId, status: params.status } : null;
    if (method !== "session.event" || !record(params.event)) return null;
    const event = params.event;
    const data = record(event.data) ? event.data : {};
    const common = { sessionId, ...(Number.isSafeInteger(event.seq) ? { seq: event.seq as number } : {}),
        ...(Number.isSafeInteger(data.turn) ? { turn: data.turn as number } : {}),
        ...(Number.isSafeInteger(data.step) ? { step: data.step as number } : {}) };
    if (event.type === "turn/end") {
        const reason = record(data.reason) ? data.reason : {};
        return {
            type: "turn-end", ...common,
            status: typeof reason.kind === "string" ? reason.kind : typeof data.reason === "string" ? data.reason : "unknown",
            ...(typeof reason.error?.message === "string" ? { text: reason.error.message } : {}),
        };
    }
    if (event.type === "session/title") {
        return typeof data.title === "string" ? { type: "title", ...common, text: data.title } : null;
    }
    if (event.type === "tool/call") {
        return {
            type: "tool", ...common,
            toolName: typeof data.toolName === "string" ? data.toolName : typeof data.name === "string" ? data.name : undefined,
            toolCallId: typeof data.callId === "string" ? data.callId : undefined,
            status: "running",
        };
    }
    const message = event.type === "user/message" ? data : record(data.message) ? data.message : undefined;
    if (!message || !Array.isArray(message.content)) return null;
    const type = event.type === "assistant/message" ? "assistant" : event.type === "user/message" ? "user" : event.type === "tool/result" ? "tool" : null;
    if (!type) return null;
    const text = message.content.filter((b: any) => record(b) && b.type === "text" && typeof b.text === "string").map((b: any) => b.text).join("\n");
    const reasoning = message.content.filter((b: any) => record(b) && b.type === "reasoning" && typeof b.text === "string").map((b: any) => b.text).join("\n");
    const toolCalls = message.content.filter((b: any) => record(b) && b.type === "tool-call" && typeof b.id === "string" && typeof b.name === "string")
        .map((b: any) => ({ id: b.id, name: b.name, arguments: b.arguments }));
    return {
        type, ...common,
        messageId: typeof message.id === "string" ? message.id : undefined,
        text,
        ...(data.interrupted === true ? { interrupted: true } : {}),
        ...(reasoning ? { reasoning } : {}),
        ...(toolCalls.length ? { toolCalls } : {}),
        ...(type === "tool" ? {
            toolCallId: typeof message.toolCallId === "string" ? message.toolCallId : message.source?.callId,
            isError: message.isError === true,
            status: message.isError ? "error" : "completed",
        } : {}),
    };
}
