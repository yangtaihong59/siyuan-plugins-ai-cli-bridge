/** Built-plugin metadata-only acceptance; never reads document bodies or starts DSH. */
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const base = new URL(process.env.DSH_REF_KERNEL_URL || '');
if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1') throw new Error('Explicit local DSH_REF_KERNEL_URL is required.');
let requests = 0;
const readOnlyFetch = async (input, options) => {
  const url = new URL(typeof input === 'string' ? input : input.url, base);
  assert.equal(url.origin, base.origin);
  assert.equal(url.pathname, '/api/notebook/lsNotebooks');
  assert.equal(options?.method, 'POST');
  requests++;
  return fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
};
const nodeRequire = createRequire(import.meta.url), module = { exports: {} };
vm.runInNewContext(readFileSync('dist/index.js', 'utf8'), {
  module, exports: module.exports,
  require: id => id === 'siyuan' ? { Plugin: class {}, showMessage() {}, confirm() {}, getAllEditor: () => [], getFrontend: () => 'desktop' } : nodeRequire(id),
  process, console, Buffer, URL, setTimeout, clearTimeout, setInterval, clearInterval, fetch: readOnlyFetch,
}, { filename: 'notebook-built-plugin.js', timeout: 5000 });
assert.equal(typeof module.exports, 'function');
const plugin = new module.exports();
const report = { checks: {}, counts: {}, skipped: [] };
const check = (name, valid) => { report.checks[name] = valid; assert(valid, name); };
try {
  const response = await readOnlyFetch('/api/notebook/lsNotebooks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert(response.ok);
  const result = await response.json();
  assert.equal(result.code, 0);
  const notebooks = result.data?.notebooks;
  check('actualNotebookMetadataAvailable', Array.isArray(notebooks));
  const notebook = notebooks.find(item => !item.closed && (!item.encrypted || item.unlocked !== false));
  check('openNotebookAvailable', Boolean(notebook));
  const ref = await plugin.getNotebookReference(notebook.id);
  check('builtReaderReturnsNotebookIdentity', ref.kind === 'notebook' && ref.id === notebook.id);
  check('titleMatchesMetadata', ref.title === String(notebook.name || notebook.id).replace(/\s+/g, ' ').slice(0, 80));
  check('scopeExplicitlyContainsNoReadBodyClaim', ref.text.includes('范围引用') && ref.text.includes('尚未读取'));
  check('scopeDescriptionIsBounded', typeof ref.text === 'string' && ref.text.length < 256);
  const beforeInvalid = requests;
  await assert.rejects(() => plugin.getNotebookReference('../invalid'));
  check('invalidIdRejectedWithoutKernelRead', requests === beforeInvalid);
  let suffix = 0;
  let missing;
  do { missing = `19000101000000-${String(suffix++).padStart(7, '0')}`; }
  while (notebooks.some(item => item.id === missing));
  await assert.rejects(() => plugin.getNotebookReference(missing));
  check('missingNotebookRejected', true);
  const closed = notebooks.find(item => item.closed);
  if (closed) {
    await assert.rejects(() => plugin.getNotebookReference(closed.id));
    check('closedNotebookRejectedWithoutOpening', true);
  } else report.skipped.push('actualClosedNotebookAbsent');
  const locked = notebooks.find(item => !item.closed && item.encrypted && item.unlocked === false);
  if (locked) {
    await assert.rejects(() => plugin.getNotebookReference(locked.id));
    check('lockedNotebookRejectedWithoutUnlocking', true);
  } else report.skipped.push('actualLockedNotebookAbsent');
  check('onlyNotebookMetadataRequests', true);
  report.counts.notebooksListed = notebooks.length;
  report.counts.scopeCharacters = ref.text.length;
} catch {
  report.failed = true;
  process.exitCode = 1;
} finally {
  report.counts.metadataReads = requests;
  report.counts.documentBodyReads = 0;
  report.counts.modelConnections = 0;
  report.counts.noteWrites = 0;
  mkdirSync('.live-results', { recursive: true });
  writeFileSync('.live-results/notebook-read-report.json', JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
}
