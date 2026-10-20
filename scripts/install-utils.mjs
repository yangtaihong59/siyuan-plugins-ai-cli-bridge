import { existsSync, lstatSync, readlinkSync, symlinkSync, cpSync, readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { createInterface } from 'node:readline';

async function chooseWorkspace(workspaces, mode) {
  if (workspaces.length === 0) throw new Error('未检测到思源工作区，请启动思源，或指定 --workspace /absolute/path。');
  console.log(`检测到 ${workspaces.length} 个思源工作区：`);
  workspaces.forEach((workspace, index) => console.log(`  [${index + 1}] ${workspace.path}`));
  if (workspaces.length === 1) return workspaces[0].path;
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    const command = mode === 'link' ? 'make-link' : 'make-install';
    const commands = workspaces.map(workspace => `  pnpm ${command} --workspace '${workspace.path.replace(/'/g, "'\\''")}'`).join('\n');
    throw new Error(`当前终端无法交互选择，请使用以下命令之一：\n${commands}`);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await new Promise((accept, reject) => {
      rl.once('close', () => reject(new Error('未收到工作区选择，已取消安装。')));
      rl.once('SIGINT', () => reject(new Error('已取消安装。')));
      rl.question(`请选择工作区 [1-${workspaces.length}]（q 退出）：`, accept);
    });
    const value = answer.trim();
    if (/^(q|quit|exit)$/i.test(value)) throw new Error('已取消安装。');
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > workspaces.length) {
      throw new Error(`无效的工作区编号：${value || '（空）'}，请输入 1-${workspaces.length}，未进行安装。`);
    }
    return workspaces[Number(value) - 1].path;
  } finally {
    rl.close();
  }
}

export async function install(mode) {
  const args = process.argv.slice(2);
  const flag = args.indexOf('--workspace');
  let plugins = process.env.SIYUAN_PLUGIN_DIR;
  if (flag >= 0) {
    if (!args[flag + 1] || args[flag + 1].startsWith('--')) throw new Error('--workspace 需要一个工作区路径。');
    plugins = join(resolve(args[flag + 1]), 'data/plugins');
  }
  if (!plugins) {
    const base = process.env.SIYUAN_API_URL || 'http://127.0.0.1:6806';
    const response = await fetch(new URL('/api/system/getWorkspaces', base), { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`SiYuan HTTP ${response.status}`);
    const result = await response.json();
    if (result.code !== 0) throw new Error(result.msg || 'Cannot discover workspace');
    const workspaces = Array.isArray(result.data) ? result.data.filter(item => typeof item?.path === 'string' && item.path.trim()) : [];
    plugins = join(await chooseWorkspace(workspaces, mode), 'data/plugins');
  }
  if (!existsSync(plugins)) throw new Error(`插件目录不存在：${plugins}`);
  const target = join(plugins, JSON.parse(readFileSync(new URL('../plugin.json', import.meta.url), 'utf8')).name), source = resolve(mode === 'link' ? 'dev' : 'dist');
  if (!existsSync(join(source, 'index.js'))) throw new Error(`请先运行 ${mode === 'link' ? 'pnpm dev' : 'pnpm build'}。`);
  let present;
  try { present = lstatSync(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (present) {
    if (mode === 'link' && present.isSymbolicLink() && resolve(dirname(target), readlinkSync(target)) === source) { console.log(`已关联：${target}`); return; }
    throw new Error(`目标已存在，未覆盖：${target}。先在思源禁用插件并手动移开旧安装。`);
  }
  if (mode === 'link') symlinkSync(source, target, 'dir');
  else cpSync(source, target, { recursive: true, errorOnExist: true, force: false });
  console.log(`${mode === 'link' ? '已关联' : '已安装'}：${target}\n在思源：设置 → 集市 → 已下载 → 启用 SiYuan DeepSeek Harness。`);
}
