import { afterEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, readlink, lstat, readFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const script = resolve(dirname(fileURLToPath(import.meta.url)), '../scripts/make_dev_link.js');
const temporary: string[] = [];
const servers: ChildProcess[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(accept => { if (server.exitCode !== null) accept(); else { server.once('exit', () => accept()); server.kill(); } })));
  await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

async function fixture() {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'harness-install-')));
  temporary.push(directory);
  await mkdir(join(directory, 'dev'));
  await writeFile(join(directory, 'dev/index.js'), 'module.exports = {};');
  const workspaces = [join(directory, 'workspace one'), join(directory, 'workspace two')];
  await Promise.all(workspaces.map(path => mkdir(join(path, 'data/plugins'), { recursive: true })));
  return { directory, workspaces, target: (index: number) => join(workspaces[index], 'data/plugins/siyuan-plugins-ai-cli-bridge') };
}

async function api(workspaces: unknown[]) {
  let requests = 0;
  let serverErrors = '';
  // Keep the mock API outside Vitest's worker so Node worker socket behavior cannot affect the installer.
  const server = spawn(process.execPath, ['--input-type=module', '--eval', `
    import { createServer } from 'node:http';
    const server = createServer((request, response) => {
      if (request.method !== 'POST' || request.url !== '/api/system/getWorkspaces') { response.writeHead(404); response.end(); return; }
      console.error('REQUEST');
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ code: 0, data: ${JSON.stringify(workspaces)} }));
    });
    server.listen(0, '127.0.0.1', () => console.log('http://127.0.0.1:' + server.address().port));
  `], { stdio: ['ignore', 'pipe', 'pipe'] });
  servers.push(server);
  server.stderr!.on('data', data => { serverErrors += data; requests += String(data).split('REQUEST').length - 1; });
  const url = await new Promise<string>((accept, reject) => {
    const timeout = setTimeout(() => reject(new Error('Mock API did not start')), 3000);
    server.stdout!.once('data', data => { clearTimeout(timeout); accept(String(data).trim()); });
    server.once('error', error => { clearTimeout(timeout); reject(error); });
    server.once('exit', code => { clearTimeout(timeout); reject(new Error(`Mock API exited ${code}: ${serverErrors}`)); });
  });
  return { url, requests: () => requests };
}

function run(directory: string, options: { args?: string[]; env?: Record<string, string>; input?: string; tty?: boolean } = {}) {
  // A real Node child runs the shipped script. TTY overrides exercise its prompt using bounded piped input.
  const args = options.tty ? ['--input-type=module', '--eval', `Object.defineProperty(process.stdin, 'isTTY', { value: true }); Object.defineProperty(process.stdout, 'isTTY', { value: true }); process.argv = ['node', ${JSON.stringify(script)}, ...${JSON.stringify(options.args || [])}]; await import(${JSON.stringify(pathToFileURL(script).href)});`] : [script, ...(options.args || [])];
  const child = spawn(process.execPath, args, { cwd: directory, env: { ...process.env, SIYUAN_PLUGIN_DIR: '', SIYUAN_API_URL: '', ...options.env }, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', data => output += data);
  child.stderr.on('data', data => output += data);
  child.stdin.end(options.input || '');
  return new Promise<{ code: number | null; output: string }>((accept, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(new Error(`Installer did not exit: ${output}`)); }, 8000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => { clearTimeout(timeout); accept({ code, output }); });
  });
}

describe('workspace installation through the shipped CLI', () => {
  it('lists all known workspaces in non-TTY mode and gives explicit commands without installing', async () => {
    const fixtureData = await fixture();
    const server = await api(fixtureData.workspaces.map((path, index) => ({ path, closed: index === 1 })));
    const result = await run(fixtureData.directory, { env: { SIYUAN_API_URL: server.url } });
    expect(result.code).not.toBe(0);
    expect(result.output).toContain('当前终端无法交互选择');
    for (const path of fixtureData.workspaces) expect(result.output).toContain(`pnpm make-link --workspace '${path}'`);
    await expect(lstat(fixtureData.target(0))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(lstat(fixtureData.target(1))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('automatically links a single known workspace even when closed', async () => {
    const fixtureData = await fixture();
    const server = await api([{ path: fixtureData.workspaces[1], closed: true }]);
    const result = await run(fixtureData.directory, { env: { SIYUAN_API_URL: server.url } });
    expect(result.code).toBe(0);
    expect(await readlink(fixtureData.target(1))).toBe(join(fixtureData.directory, 'dev'));
  });

  it('selects the numbered workspace in an interactive terminal, including a closed workspace', async () => {
    const fixtureData = await fixture();
    const server = await api(fixtureData.workspaces.map((path, index) => ({ path, closed: index === 1 })));
    const result = await run(fixtureData.directory, { env: { SIYUAN_API_URL: server.url }, tty: true, input: '2\n' });
    expect(result.code, result.output).toBe(0);
    expect(result.output).toContain('请选择工作区');
    expect(await readlink(fixtureData.target(1))).toBe(join(fixtureData.directory, 'dev'));
    await expect(lstat(fixtureData.target(0))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each([['q\n', '已取消安装'], ['3\n', '无效的工作区编号'], ['abc\n', '无效的工作区编号'], ['\n', '无效的工作区编号'], ['', '未收到工作区选择']])('rejects cancellation or invalid interactive choice %j without writing', async (input, message) => {
    const fixtureData = await fixture();
    const server = await api(fixtureData.workspaces.map(path => ({ path })));
    const result = await run(fixtureData.directory, { env: { SIYUAN_API_URL: server.url }, tty: true, input });
    expect(result.code).not.toBe(0);
    expect(result.output).toContain(message);
    for (let index = 0; index < 2; index++) await expect(lstat(fixtureData.target(index))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('prefers --workspace over the plugin environment and API, and safely repeats an existing matching link', async () => {
    const fixtureData = await fixture();
    const server = await api([]);
    const options = { args: ['--workspace', fixtureData.workspaces[1]], env: { SIYUAN_PLUGIN_DIR: join(fixtureData.workspaces[0], 'data/plugins'), SIYUAN_API_URL: server.url } };
    expect((await run(fixtureData.directory, options)).code).toBe(0);
    expect((await run(fixtureData.directory, options)).code).toBe(0);
    expect(server.requests()).toBe(0);
    expect(await readlink(fixtureData.target(1))).toBe(join(fixtureData.directory, 'dev'));
    await expect(lstat(fixtureData.target(0))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('uses SIYUAN_PLUGIN_DIR without API discovery', async () => {
    const fixtureData = await fixture();
    const server = await api([]);
    const result = await run(fixtureData.directory, { env: { SIYUAN_PLUGIN_DIR: join(fixtureData.workspaces[0], 'data/plugins'), SIYUAN_API_URL: server.url } });
    expect(result.code).toBe(0);
    expect(server.requests()).toBe(0);
    expect(await readlink(fixtureData.target(0))).toBe(join(fixtureData.directory, 'dev'));
  });

  it('refuses to overwrite an existing installation and preserves its files', async () => {
    const fixtureData = await fixture();
    await mkdir(fixtureData.target(0));
    await writeFile(join(fixtureData.target(0), 'keep.txt'), 'existing installation');
    const result = await run(fixtureData.directory, { args: ['--workspace', fixtureData.workspaces[0]] });
    expect(result.code).not.toBe(0);
    expect(result.output).toContain('目标已存在，未覆盖');
    expect(await readFile(join(fixtureData.target(0), 'keep.txt'), 'utf8')).toBe('existing installation');
  });

  it('rejects a missing --workspace argument instead of falling back to another destination', async () => {
    const fixtureData = await fixture();
    const result = await run(fixtureData.directory, { args: ['--workspace'], env: { SIYUAN_PLUGIN_DIR: join(fixtureData.workspaces[0], 'data/plugins') } });
    expect(result.code).not.toBe(0);
    expect(result.output).toContain('--workspace 需要一个工作区路径');
    await expect(lstat(fixtureData.target(0))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
