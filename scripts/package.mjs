import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const manifest = JSON.parse(readFileSync('dist/plugin.json', 'utf8'));
if (pkg.name !== manifest.name || pkg.version !== manifest.version) throw new Error('package.json and plugin.json must have the same name and version.');
for (const name of ['index.js', 'index.css', 'plugin.json', 'icon.png', 'README.md', 'README_zh_CN.md', 'LICENSE']) {
  if (!existsSync(resolve('dist', name))) throw new Error(`Missing plugin artifact: ${name}`);
}
// Store-only ZIP, implemented with Node builtins for portable packaging.
let offset = 0;
const local = [], central = [];
const crc32 = data => {
  let crc = -1;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
};
const files = (directory, prefix = '') => readdirSync(directory).flatMap(name => {
  const path = `${directory}/${name}`, entry = `${prefix}${name}`;
  return statSync(path).isDirectory() ? files(path, `${entry}/`) : [{ path, name: entry }];
});
for (const file of files('dist')) {
  const data = readFileSync(file.path), name = Buffer.from(file.name);
  const checksum = crc32(data), head = Buffer.alloc(30), directory = Buffer.alloc(46);
  head.writeUInt32LE(0x04034b50); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x800, 6);
  head.writeUInt32LE(checksum, 14); head.writeUInt32LE(data.length, 18); head.writeUInt32LE(data.length, 22); head.writeUInt16LE(name.length, 26);
  directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(0x800, 8);
  directory.writeUInt32LE(checksum, 16); directory.writeUInt32LE(data.length, 20); directory.writeUInt32LE(data.length, 24);
  directory.writeUInt16LE(name.length, 28); directory.writeUInt32LE(offset, 42);
  local.push(head, name, data); central.push(directory, name); offset += head.length + name.length + data.length;
}
const end = Buffer.alloc(22), count = central.length / 2, directorySize = central.reduce((n, value) => n + value.length, 0);
end.writeUInt32LE(0x06054b50); end.writeUInt16LE(count, 8); end.writeUInt16LE(count, 10); end.writeUInt32LE(directorySize, 12); end.writeUInt32LE(offset, 16);
const { writeFileSync } = await import('node:fs');
writeFileSync('package.zip', Buffer.concat([...local, ...central, end]));
console.log(`Built package.zip (${count} files, v${pkg.version})`);
