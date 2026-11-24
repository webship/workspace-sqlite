/**
 * What this plugin needs from the workspace it is added to and from the machine (the manifest's `needs`, and no
 * `suggests`). The workspace reads them: github.com/webship/workspace, core/workspace-app/PLUGINS.md.
 */
import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

// Compiled, this test runs from dist/tests, so the package root is one folder further up.
const PKG = fs.existsSync(path.join(__dirname, '..', 'package.json')) ? path.join(__dirname, '..') : path.join(__dirname, '..', '..');
const manifest = JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf8')).workspacePlugin;
const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

test('the manifest says what the plugin needs: a sites folder for its tool and the AI folders for its items; nothing on the machine beyond the core\'s own', () => {
  assert.deepStrictEqual(manifest.needs, { plugins: [['dev', 'test', 'demos', 'sandboxes', 'projects'], 'ai-agents', 'ai-skills', 'ai-commands', 'ai-prompts'] });
  for (const kind of Object.keys(manifest.ai)) assert.ok(manifest.ai[kind].length > 0, `it ships ${kind}, which is why it needs the folder they are placed in`);
  assert.strictEqual(manifest.suggests, undefined);
  const sources = ['commands', 'scripts', 'src'].flatMap((d) => (fs.existsSync(path.join(PKG, d)) ? walk(path.join(PKG, d)) : [])).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  assert.doesNotMatch(sources, /\bdocker (compose|exec|run)\b/, 'no docker call of its own: the file is opened through the runtime layer');
  assert.doesNotMatch(sources, /^\s*(sqlite3|php) /m, 'no sqlite3 or PHP on this machine: both run in the project\'s web container');
  // ddev is the core's own need; the plugin's tool calls it, and the runtime layer answers it off DDEV.
  assert.match(sources, /ddev exec /);
  assert.match(fs.readFileSync(path.join(PKG, 'README.md'), 'utf8'), /^## What it needs$/m, 'and the README says so');
});
