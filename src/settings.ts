import type { Settings } from './types';

export const DISPLAY_DETAILS = ['compact', 'balanced', 'full'] as const;

export function defaultSettings(): Settings {
  let command = 'dsh';
  let home = '';
  let cwd = '';
  let provider = 'deepseek-official', model = 'deepseek-flash';
  if (typeof require === 'function') {
    const fs = require('node:fs') as typeof import('node:fs');
    const os = require('node:os') as typeof import('node:os');
    const path = require('node:path') as typeof import('node:path');
    home = path.join(os.homedir(), '.dsh');
    cwd = path.join(home, 'workspaces', 'siyuan');
    const candidates = [
      '/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh',
      path.join(os.homedir(), '.local/bin/dsh'),
      path.join(os.homedir(), '.npm-global/bin/dsh'),
      '/opt/homebrew/bin/dsh', '/usr/local/bin/dsh',
    ];
    command = candidates.find(file => fs.existsSync(file)) || 'dsh';
    try {
      if (fs.readFileSync(path.join(home, '.credentials.yaml'), 'utf8').includes('deepseek-account-platform/default')) {
        provider = 'deepseek-account'; model = 'deepseek-flash';
      }
    } catch { /* No existing account: use the explicit API route. */ }
  }
  return { command, argsText: '[]', nodePath: '', profile: 'sdk', home, cwd,
    provider, model, reasoningEffort: '', displayDetail: 'full',
    mcpEnabled: false, mcpUrl: 'http://127.0.0.1:36806/mcp', mcpToken: '' };
}

export function normalizeSettings(raw: unknown, defaults = defaultSettings()): Settings {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const result = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof Settings)[]) {
    if (key === 'mcpToken') continue;
    if (typeof data[key] === typeof defaults[key]) (result as any)[key] = data[key];
  }
  if (!DISPLAY_DETAILS.includes(result.displayDetail)) result.displayDetail = defaults.displayDetail;
  return result;
}

export function parseArgs(text: string): string[] {
  let value: unknown;
  try { value = JSON.parse(text || '[]'); } catch { throw new Error('启动参数应为 JSON 字符串数组，例如 ["--flag"]。'); }
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) throw new Error('启动参数必须是 JSON 字符串数组。');
  return value;
}

export function validateSettings(settings: Settings): void {
  if (!DISPLAY_DETAILS.includes(settings.displayDetail)) throw new Error('信息展示仅支持简洁、适中、详细。');
  if (!settings.command.trim()) throw new Error('请先填写 Harness 可执行文件。');
  if (!settings.home.trim()) throw new Error('请填写 DSH_HOME，通常为用户目录下的 .dsh。');
  if (!settings.cwd.trim()) throw new Error('请填写 Agent 的工作目录。');
  if (!settings.profile.trim() || !settings.provider.trim() || !settings.model.trim()) throw new Error('profile、provider 和模型不能为空。');
  parseArgs(settings.argsText);
  if (settings.mcpEnabled) {
    const url = new URL(settings.mcpUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('MCP 地址必须为无内嵌凭据的 HTTP/HTTPS URL。');
  }
}
