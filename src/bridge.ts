import source from './runtime/stream-bridge.cjs?raw';

export const bridgeSource = source;

/** JSON strings are valid YAML scalars, including paths with spaces or colons. */
export function bridgePatch(path: string): string {
    return `- insert:\n    - id: siyuan-stream-bridge\n      name: ${JSON.stringify(path)}\n`;
}
