const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
let pages = 0;
function check(directory) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', '.git'].includes(item.name)) continue;
    const file = path.join(directory, item.name);
    if (item.isDirectory()) { check(file); continue; }
    if (file.endsWith('.js')) execFileSync(process.execPath, ['--check', file]);
    if (!file.endsWith('.html')) continue;
    const html = fs.readFileSync(file, 'utf8');
    for (const [, code] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(code, { filename: file });
    for (const [, target] of html.matchAll(/(?:href|src)="([^"$`]+)"/g)) {
      if (/^(?:https?:|javascript:|#)/.test(target)) continue;
      const local = target.split('?')[0];
      if (!fs.existsSync(path.resolve(path.dirname(file), local))) throw new Error(`Missing asset: ${file}: ${local}`);
    }
    if (html.includes('http://localhost:3000/api')) throw new Error(`Hardcoded API host: ${file}`);
    pages++;
  }
}
check(path.join(root, 'backend'));
check(path.join(root, 'frontend'));
console.log(`JavaScript syntax and local asset links passed (${pages} HTML pages).`);
