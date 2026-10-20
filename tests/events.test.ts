import { describe, expect, it } from "vitest";
import { eventToUi } from "../src/events";

function event(type: string, data: any) {
    return eventToUi("session.event", { sessionId: "s1", event: { type, data, seq: 8, time: 123 } });
}

describe("official durable SDK events", () => {
    it("reads the different user and assistant message envelopes", () => {
        expect(event("user/message", { id: "u1", role: "user", content: [{ type: "text", text: "问题" }] })).toMatchObject({ type: "user", sessionId: "s1", seq: 8, messageId: "u1", text: "问题" });
        expect(event("assistant/message", { message: { id: "a1", role: "assistant", content: [{ type: "reasoning", text: "推理" }, { type: "text", text: "答案" }, { type: "tool-call", id: "t1", name: "search", arguments: { q: "test" } }] } })).toMatchObject({ type: "assistant", text: "答案", reasoning: "推理", toolCalls: [{ id: "t1", name: "search", arguments: { q: "test" } }] });
    });

    it("keeps tool failures and their durable call identity", () => {
        expect(event("tool/call", { callId: "t1", name: "search" })).toMatchObject({ type: "tool", toolName: "search", toolCallId: "t1", status: "running" });
        expect(event("tool/result", { message: { id: "r1", toolCallId: "t1", isError: true, content: [{ type: "text", text: "denied" }] } })).toMatchObject({ type: "tool", toolCallId: "t1", isError: true, status: "error", text: "denied" });
    });

    it("does not report a failed turn as completed", () => {
        expect(event("turn/end", { reason: { kind: "error", error: { message: "provider unavailable", code: "NETWORK" } } })).toMatchObject({ type: "turn-end", status: "error", text: "provider unavailable" });
        expect(event("turn/end", { reason: { kind: "aborted", reason: { kind: "user" } } })).toMatchObject({ type: "turn-end", status: "aborted" });
    });

    it("maps status and title while ignoring unrelated or malformed events", () => {
        expect(eventToUi("session.status", { sessionId: "s1", status: "running" })).toEqual({ type: "status", sessionId: "s1", status: "running" });
        expect(event("session/title", { title: "会话标题" })).toMatchObject({ type: "title", text: "会话标题" });
        expect(event("request/header", { model: "deepseek" })).toBeNull();
        expect(eventToUi("session.event", null)).toBeNull();
        expect(event("assistant/message", { message: { content: [null, 1, { type: "text" }] } })).toMatchObject({ type: "assistant", text: "" });
    });
});
