import { isSiYuanId } from '../references';

export type Inline =
    | { kind: "text" | "code" | "strong" | "emphasis"; text: string }
    | { kind: "link"; text: string; href: string };

export type TableAlignment = "left" | "center" | "right" | null;

export type MarkdownBlock =
    | { kind: "paragraph" | "quote"; content: Inline[] }
    | { kind: "heading"; level: number; content: Inline[] }
    | { kind: "code"; language: string; text: string }
    | { kind: "list"; ordered: boolean; start: number; items: Inline[][] }
    | { kind: "table"; header: Inline[][]; alignments: TableAlignment[]; rows: Inline[][][] }
    | { kind: "rule" };

function safeLink(value: string): string | null {
    if (!/^(?:https?:\/\/|siyuan:\/\/)/i.test(value) || /[\u0000-\u0020]/.test(value)) return null;
    try {
        const url = new URL(value);
        return ["http:", "https:", "siyuan:"].includes(url.protocol) ? value : null;
    } catch { return null; }
}

/** Only official block URIs may invoke SiYuan's native block preview. */
export function siyuanBlockId(href: string): string | undefined {
    if (/[\u0000-\u0020]/.test(href)) return;
    try {
        const url = new URL(href);
        if (url.protocol !== "siyuan:" || url.hostname.toLowerCase() !== "blocks" || url.username || url.password || url.port) return;
        const id = url.pathname.slice(1);
        return isSiYuanId(id) ? id : undefined;
    } catch { return; }
}

export function linkAttributes(href: string): Record<string, string | undefined> {
    const id = siyuanBlockId(href);
    return {
        href, target: /^siyuan:/i.test(href) ? undefined : "_blank", rel: "noopener noreferrer",
        "data-type": id ? "block-ref" : undefined, "data-id": id, "data-subtype": id ? "d" : undefined,
    };
}


/** Find a matching backtick run; unmatched runs remain ordinary cell text. */
function codeSpanEnd(text: string, start: number, length: number): number {
    const delimiter = "`".repeat(length);
    let end = text.indexOf(delimiter, start + length);
    while (end >= 0 && (text[end - 1] === "`" || text[end + length] === "`")) end = text.indexOf(delimiter, end + length);
    return end;
}

/** Produce text nodes, never HTML. Unsupported Markdown remains readable source text. */
export function inline(text: string): Inline[] {
    const result: Inline[] = [];
    let plain = "";
    const flush = () => { if (plain) { result.push({ kind: "text", text: plain }); plain = ""; } };
    let index = 0;
    while (index < text.length) {
        const char = text[index];
        if (char === "\\" && index + 1 < text.length && /[\\`*_{}\[\]()#+.!>~|\-]/.test(text[index + 1])) {
            plain += text[index + 1]; index += 2; continue;
        }
        if (char === "`") {
            let length = 1;
            while (text[index + length] === "`") length++;
            const delimiter = "`".repeat(length);
            const end = codeSpanEnd(text, index, length);
            if (end >= 0) {
                let value = text.slice(index + length, end).replace(/\n/g, " ");
                if (/^ .+ $/.test(value) && value.trim()) value = value.slice(1, -1);
                flush(); result.push({ kind: "code", text: value }); index = end + length; continue;
            }
            plain += delimiter; index += length; continue;
        }
        if ((char === "*" || char === "_") && text[index + 1] === char) {
            const delimiter = char.repeat(2);
            const end = text.indexOf(delimiter, index + 2);
            if (end > index + 2) {
                flush(); result.push({ kind: "strong", text: text.slice(index + 2, end) }); index = end + 2; continue;
            }
        }
        if (char === "*" && text[index + 1] && !/\s/.test(text[index + 1])) {
            const end = text.indexOf("*", index + 1);
            if (end > index + 1 && !/\s/.test(text[end - 1])) {
                flush(); result.push({ kind: "emphasis", text: text.slice(index + 1, end) }); index = end + 1; continue;
            }
        }
        if (char === "[" && text[index - 1] !== "!") {
            const labelEnd = text.indexOf("](", index + 1);
            const linkEnd = labelEnd >= 0 ? text.indexOf(")", labelEnd + 2) : -1;
            if (labelEnd > index && linkEnd > labelEnd + 2) {
                const href = safeLink(text.slice(labelEnd + 2, linkEnd));
                if (href) {
                    flush(); result.push({ kind: "link", text: text.slice(index + 1, labelEnd), href }); index = linkEnd + 1; continue;
                }
            }
        }
        plain += char; index++;
    }
    flush();
    return result;
}

const fence = (line: string) => /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
const heading = (line: string) => /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*$/.exec(line);
const listItem = (line: string) => /^ {0,3}(?:([-+*])|(\d{1,9})[.)])[ \t]+(.*)$/.exec(line);
const rule = (line: string) => /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(line);
const quote = (line: string) => /^ {0,3}>[ \t]?(.*)$/.exec(line);
const startsBlock = (line: string) => Boolean(fence(line) || heading(line) || listItem(line) || rule(line) || quote(line));

/** Split structural pipes only. The table lexer also unescapes a literal pipe
 * inside code/strong spans, while all other Markdown is left to inline(). */
function tableRow(line: string): { cells: string[]; hasPipe: boolean } {
    const text = line.trim();
    const cells: string[] = [];
    let cell = "", index = 0, codeEnd = -1, firstPipe = -1, lastPipe = -1;
    while (index < text.length) {
        const char = text[index];
        if (char === "\\" && index + 1 < text.length) {
            cell += text[index + 1] === "|" ? "|" : text.slice(index, index + 2);
            index += 2; continue;
        }
        if (char === "`" && index >= codeEnd) {
            let length = 1;
            while (text[index + length] === "`") length++;
            const end = codeSpanEnd(text, index, length);
            if (end >= 0) codeEnd = end + length;
            cell += "`".repeat(length); index += length; continue;
        }
        if (char === "|" && index >= codeEnd) {
            if (firstPipe < 0) firstPipe = index;
            lastPipe = index;
            cells.push(cell.trim()); cell = "";
        } else cell += char;
        index++;
    }
    cells.push(cell.trim());
    if (firstPipe === 0) cells.shift();
    if (lastPipe === text.length - 1 && lastPipe >= 0) cells.pop();
    return { cells, hasPipe: firstPipe >= 0 };
}

function tableHeader(lines: string[], index: number, streaming: boolean) {
    if (index + 1 >= lines.length || streaming && index + 1 === lines.length - 1) return null;
    const header = tableRow(lines[index]), delimiter = tableRow(lines[index + 1]);
    if ((!header.hasPipe && !delimiter.hasPipe) || !header.cells.length || header.cells.length !== delimiter.cells.length
        || !delimiter.cells.every(cell => /^:?-+:?$/.test(cell))) return null;
    const alignments: TableAlignment[] = delimiter.cells.map(cell => cell.startsWith(":")
        ? cell.endsWith(":") ? "center" : "left" : cell.endsWith(":") ? "right" : null);
    return { header: header.cells.map(inline), alignments };
}

export function parseMarkdown(text: string, streaming = false): MarkdownBlock[] {
    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    const blocks: MarkdownBlock[] = [];
    let index = 0;
    while (index < lines.length) {
        if (!lines[index].trim()) { index++; continue; }
        const opening = fence(lines[index]);
        if (opening && !(opening[1][0] === "`" && opening[2].includes("`"))) {
            const delimiter = opening[1][0];
            const length = opening[1].length;
            const language = opening[2].trim().split(/\s+/)[0] || "";
            const code: string[] = [];
            index++;
            while (index < lines.length) {
                const closing = /^ {0,3}([`~]+)[ \t]*$/.exec(lines[index]);
                if (closing && closing[1].length >= length && [...closing[1]].every(char => char === delimiter)) { index++; break; }
                code.push(lines[index++]);
            }
            blocks.push({ kind: "code", language, text: code.join("\n") });
            continue;
        }
        const title = heading(lines[index]);
        if (title) {
            blocks.push({ kind: "heading", level: title[1].length, content: inline(title[2].replace(/[ \t]+#+[ \t]*$/, "")) });
            index++; continue;
        }
        if (rule(lines[index])) { blocks.push({ kind: "rule" }); index++; continue; }
        const quoted = quote(lines[index]);
        if (quoted) {
            const content: string[] = [];
            while (index < lines.length) {
                const line = quote(lines[index]);
                if (!line) break;
                content.push(line[1]); index++;
            }
            blocks.push({ kind: "quote", content: inline(content.join("\n")) }); continue;
        }
        const firstItem = listItem(lines[index]);
        if (firstItem) {
            const ordered = firstItem[2] !== undefined;
            const items: Inline[][] = [];
            while (index < lines.length) {
                const item = listItem(lines[index]);
                if (!item || (item[2] !== undefined) !== ordered || rule(lines[index])) break;
                const content = [item[3]];
                index++;
                while (index < lines.length && lines[index].trim() && /^ {2,}\S/.test(lines[index]) && !startsBlock(lines[index])) content.push(lines[index++].trimStart());
                items.push(inline(content.join("\n")));
            }
            blocks.push({ kind: "list", ordered, start: ordered ? Number(firstItem[2]) : 1, items }); continue;
        }
        const table = tableHeader(lines, index, streaming);
        if (table) {
            const rows: Inline[][][] = [];
            index += 2;
            while (index < lines.length && lines[index].trim() && !startsBlock(lines[index])) {
                const cells = tableRow(lines[index++]).cells;
                rows.push(table.header.map((_, column) => inline(cells[column] || "")));
            }
            blocks.push({ kind: "table", ...table, rows }); continue;
        }
        const paragraph = [lines[index++]];
        while (index < lines.length && lines[index].trim() && !startsBlock(lines[index]) && !tableHeader(lines, index, streaming)) paragraph.push(lines[index++]);
        blocks.push({ kind: "paragraph", content: inline(paragraph.join("\n")) });
    }
    return blocks;
}
