import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const nodeRequire = createRequire(import.meta.url);
const code = readFileSync('dist/index.js', 'utf8');
const exposed = { Plugin: class {}, Dialog: class {}, showMessage() {}, confirm() {}, getAllEditor: () => [], getFrontend: () => 'desktop' };
const pluginModule = { exports: {} };
vm.runInNewContext(code, {
  module: pluginModule, exports: pluginModule.exports,
  require: id => id === 'siyuan' ? exposed : nodeRequire(id),
  process, console, Buffer, setTimeout, clearTimeout, setInterval, clearInterval, URL,
}, { filename: 'index.js', timeout: 5000 });
assert.equal(typeof pluginModule.exports, 'function');
assert.equal(typeof pluginModule.exports.prototype.onload, 'function');
console.log('CJS_PLUGIN_ENTRY_OK (native SiYuan UI not executed)');

// Browser/mobile hosts must load the same bundle without any Node require or process.
const calls = { docks: [], loaded: [], saved: [], commands: [], opened: [], nodeRequires: 0, disconnects: 0 };
const dockType = 'siyuan-plugins-ai-cli-bridgeai-dock';
const dockSelector = `.dock__item[data-type="${dockType}"]`;
let buttonReady = true;
let owner = 'leftDock';
const button = { getAttribute: key => key === 'data-index' ? '0' : key === 'data-type' ? dockType : null };
const document = {
  querySelector: selector => selector === dockSelector && buttonReady ? button : null,
  removeEventListener() {},
};
const layout = Object.fromEntries(['leftDock', 'rightDock', 'bottomDock'].map(side => [side, {
  data: {},
  // SiYuan 3.8.7 uses two .dock__items groups, including for the Bottom dock.
  elements: [0, 1].map(index => ({ contains: target => index === 0 && target === button && owner === side && buttonReady })),
  toggleModel(type, ...options) {
    // Preserve the host's real null-sensitive lookup: the old bare type fails here.
    const target = document.querySelector(`.dock__item[data-type="${type}"]`);
    const index = parseInt(target.getAttribute('data-index'));
    assert.equal(index, 0);
    assert.equal(owner, side, 'The current button location determines its owning dock');
    calls.opened.push({ side, type, options });
    this.data[type] = {};
  },
}]));
const browserModule = { exports: {} };
class WebHost {
  name = 'siyuan-plugins-ai-cli-bridge';
  docks = {};
  eventBus = { on() {}, off() {} };
  async loadData(name) { calls.loaded.push(name); return { openCodeUrl: 'https://example.com/agent', dockPosition: 'LeftBottom' }; }
  async saveData(name, data) { calls.saved.push({ name, data }); }
  addIcons() {}
  addDock(dock) {
    calls.docks.push(dock);
    const type = this.name + dock.type;
    assert.equal(type, dockType);
    this.docks[type] = dock;
    owner = dock.config.position.startsWith('Left') ? 'leftDock' : dock.config.position.startsWith('Bottom') ? 'bottomDock' : 'rightDock';
    // Keep the fixture empty to verify opening does not depend on data-map initialization.
    for (const value of Object.values(layout)) delete value.data[type];
    buttonReady = true;
  }
  addCommand(command) { calls.commands.push(command); }
}
vm.runInNewContext(code, {
  module: browserModule, exports: browserModule.exports,
  require: id => {
    if (id === 'siyuan') return { ...exposed, Plugin: WebHost, getFrontend: () => 'browser-desktop' };
    calls.nodeRequires++; throw new Error(`Web bundle attempted Node require: ${id}`);
  },
  console, URL, setTimeout, clearTimeout, setInterval, clearInterval,
  window: { siyuan: { layout } },
  document,
}, { filename: 'browser-plugin.js', timeout: 5000 });
const plugin = new browserModule.exports();
await plugin.onload();
assert.equal(calls.nodeRequires, 0);
assert.deepEqual(calls.loaded, ['ai-agent-bridge-config']);
assert.equal(calls.docks.length, 1);
assert.equal(calls.docks[0].type, 'ai-dock');
assert.equal(calls.docks[0].config.title, 'SiYuan DeepSeek Harness');
assert.equal(calls.docks[0].config.position, 'LeftBottom');
assert.equal(plugin.config.view, 'web');
assert.equal(plugin.config.openCodeUrl, 'https://example.com/agent');
assert.equal(plugin.controller, null);
await assert.rejects(() => plugin.setView('harness'), /桌面端/);
await plugin.setView('web', 'https://example.com/new');
assert.equal(calls.saved.at(-1).name, 'ai-agent-bridge-config');
assert.equal(plugin.config.openCodeUrl, 'https://example.com/new');
assert.deepEqual(calls.opened.at(-1), { side: 'leftDock', type: dockType, options: [true, false, false, true] });

// This is the exact host failure the v0.2.0 build hit when it passed a bare type.
assert.throws(() => layout.leftDock.toggleModel('ai-dock', true, false, false, true), /Cannot read properties of null \(reading 'getAttribute'\)/);

// A registered button can be opened before the dock has instantiated its model.
delete layout.leftDock.data[dockType];
const beforeFirstOpen = calls.opened.length;
assert.equal(plugin.openDock(), true);
assert.equal(calls.opened.length, beforeFirstOpen + 1);
assert.equal(calls.opened.at(-1).type, dockType);

// Moving the button must override the original saved LeftBottom placement.
owner = 'bottomDock';
layout.bottomDock.data[dockType] = layout.leftDock.data[dockType];
delete layout.leftDock.data[dockType];
assert.equal(plugin.openDock(), true);
assert.equal(calls.opened.at(-1).side, 'bottomDock');
const beforeCommand = calls.opened.length;
calls.commands[0].callback();
assert.equal(calls.opened.length, beforeCommand + 1);
assert.equal(calls.opened.at(-1).side, 'bottomDock');

// Registration and teardown may leave a brief interval without a usable button.
buttonReady = false;
const beforeMissingButton = calls.opened.length;
assert.equal(plugin.openDock(), false);
assert.equal(calls.opened.length, beforeMissingButton);
buttonReady = true;
plugin.canHarness = true;
plugin.controller = { state: { busy: true }, disconnect: async () => calls.disconnects++, destroy: async () => {} };
const saves = calls.saved.length;
await assert.rejects(() => plugin.setView('web'), /停止当前生成/);
assert.equal(calls.saved.length, saves);
plugin.controller.state.busy = false;
await plugin.setView('web');
assert.equal(calls.disconnects, 1);
plugin.onunload();
const afterUnload = calls.opened.length;
assert.equal(plugin.openDock(), false);
assert.equal(calls.opened.length, afterUnload);
assert.equal(calls.nodeRequires, 0);
console.log('CJS_CANONICAL_DOCK_OPEN_MOVE_FIRST_OPEN_AND_MISSING_BUTTON_GUARDS_OK');
console.log('CJS_WEB_WITHOUT_NODE_AND_SWITCH_GUARDS_OK (mock host, no model or note access)');

// A view save that completes after unload must not reopen the dock or render again.
const late = new browserModule.exports();
await late.onload();
let finishSave;
let enterSave;
const saveEntered = new Promise(resolve => { enterSave = resolve; });
let reopen = 0;
late.saveData = () => new Promise(resolve => { finishSave = resolve; enterSave(); });
late.openDock = () => reopen++;
const panel = { inert: false, replaceChildren() {} };
late.panels.set(panel, {});
const switching = late.setView('web', 'https://example.com/deferred');
await saveEntered;
assert.equal(panel.inert, true);
late.onunload();
finishSave();
await switching;
assert.equal(reopen, 0);
assert.equal(late.config.openCodeUrl, 'https://example.com/agent');

// Unloading before configuration resolves must not register any new dock.
const delayed = new browserModule.exports();
let finishLoad;
delayed.loadData = () => new Promise(resolve => { finishLoad = resolve; });
const beforeDocks = calls.docks.length;
const loading = delayed.onload();
delayed.onunload(); finishLoad(null); await loading;
assert.equal(calls.docks.length, beforeDocks);
console.log('CJS_DEFERRED_SAVE_AND_LOAD_UNLOAD_GUARDS_OK');
