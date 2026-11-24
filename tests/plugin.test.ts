/**
 * The plugin as the dashboard loads it: its manifest, the files the installer places, its settings and their labels,
 * and register(api), which joins the database family's DATABASE menu with SQLite, a section per file.
 */
import test, { after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

import * as plugin from '../src/index';
import { sqliteEngine, sqliteRuntimeOf, sqliteFits } from '../src/lib/engine';

// Compiled, this test runs from dist/tests, so the package root is one folder further up.
const PKG = fs.existsSync(path.join(__dirname, '..', 'package.json')) ? path.join(__dirname, '..') : path.join(__dirname, '..', '..');
const pkg = JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf8'));
const manifest = pkg.workspacePlugin;
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-plugin-'));
after(() => fs.rmSync(ROOT, { recursive: true, force: true }));

const SQLITE = Buffer.concat([Buffer.from('SQLite format 3\u0000', 'latin1'), Buffer.alloc(84, 'A')]);
const dir = (rel: string, files: Record<string, string | Buffer>) => {
  for (const [f, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(ROOT, rel, f)), { recursive: true });
    fs.writeFileSync(path.join(ROOT, rel, f), body);
  }
  return path.join(ROOT, rel);
};

test('the manifest names the plugin, its family, its setting, its tool and every file it ships, and the package carries them', () => {
  assert.strictEqual(manifest.name, 'sqlite');
  assert.strictEqual(manifest.label, 'SQLite');
  assert.strictEqual(manifest.family, 'databases');
  assert.ok(manifest.summary.length <= 160);
  assert.deepStrictEqual(manifest.typeActions, { database: ['sites'] });
  assert.deepStrictEqual(manifest.commands, { types: ['sites'], files: ['commands/cmd-tools-sqlite.sh'] });
  assert.strictEqual(path.basename(manifest.commands.files[0]), sqliteEngine.script, 'the tool the menu runs is the one the installer places');
  const files = [manifest.settingsTemplate, manifest.labels, ...manifest.commands.files, ...manifest.scripts.functions, ...manifest.scripts.args, ...manifest.features,
    ...Object.values(manifest.ai).flat() as string[]];
  for (const f of files) {
    assert.ok(fs.existsSync(path.join(PKG, f)), `${f} is in the repository`);
    assert.ok(pkg.files.includes(String(f).split('/')[0]), `${f} is published with the package`);
  }
  assert.strictEqual(manifest.settingsFile, 'plugin.sqlite.settings.yml');
  assert.strictEqual(manifest.suggests, undefined, 'the tool calls nothing but ddev, the core\'s own need');
  // A sibling is a version range, never a git URL (webship/workspace, core/docs/releases.md).
  assert.match(pkg.dependencies['@webship.co/workspace-database'], /^\^1\.\d+\.\d+$/);
  assert.strictEqual(pkg.engines.node, '>=24');
  assert.strictEqual(pkg.devDependencies['@types/node'], '^24.0.0');
});

test('the settings template holds the one key the labels name, and no value a person must change first', () => {
  const template = fs.readFileSync(path.join(PKG, manifest.settingsTemplate), 'utf8');
  const keys = [...template.matchAll(/^([a-z_]+):/gm)].map((m) => m[1]);
  assert.deepStrictEqual(keys, ['keep'], 'no admin: no web admin is offered for a SQLite file yet');
  assert.ok(!template.includes('CHANGE_ME'), 'the plugin is ready once installed');
  const labels = fs.readFileSync(path.join(PKG, manifest.labels), 'utf8');
  assert.deepStrictEqual([...labels.matchAll(/^([a-z_]+):/gm)].map((m) => m[1]), keys);
  assert.match(template, /^keep: 0$/m);
});

test('the engine: the SQLite files of a project on DDEV or on a runtime the Workspace built it on, its client, its copies', () => {
  assert.strictEqual(sqliteEngine.id, manifest.name);
  assert.strictEqual(sqliteEngine.client, 'sqlite3');
  assert.strictEqual(sqliteEngine.dumpExt, '.sqlite.gz');
  assert.deepStrictEqual(sqliteEngine.admins, []);
  assert.deepStrictEqual(sqliteEngine.verbs, ['console', 'tables', 'export', 'import', 'info']);
  const found = (rel: string, files: Record<string, string | Buffer>) => sqliteEngine.detect(dir(rel, files)).map((d) => [d.engine, d.via, d.runtime, d.file]);
  assert.deepStrictEqual(found('laravel', { '.ddev/config.yaml': 'name: laravel\n', '.env': 'DB_CONNECTION=sqlite\nDB_DATABASE=/var/www/html/database/database.sqlite\n', 'database/database.sqlite': SQLITE }),
    [['sqlite', 'file', 'ddev', 'database/database.sqlite']]);
  assert.deepStrictEqual(found('strapi', { 'compose.yaml': 'name: strapi\nx-webship:\n  runtime: docker\n  database: "10.11"\n', '.tmp/data.db': SQLITE }),
    [['sqlite', 'file', 'docker', '.tmp/data.db']], 'a project the Workspace built on Docker Compose');
  assert.deepStrictEqual(found('k8s', { 'compose.yaml': 'x-webship:\n  runtime: kubernetes\n', 'db.sqlite3': SQLITE, 'data/cache.sqlite': SQLITE }).map((d) => [d[2], d[3]]),
    [['kubernetes', 'db.sqlite3'], ['kubernetes', 'data/cache.sqlite']], 'a section per file');
  assert.deepStrictEqual(found('fresh', { '.ddev/config.yaml': 'name: fresh\n', 'database/database.sqlite': '' }).length, 1, 'Laravel starts with an empty file');
  assert.deepStrictEqual(found('own', { 'compose.yaml': 'services:\n  app:\n    image: node:22\n', 'database/database.sqlite': SQLITE }), [], 'a compose file of its own: no web container the tool knows');
  assert.deepStrictEqual(found('landoown', { '.lando.yml': 'name: landoown\nrecipe: lamp\n', 'db.sqlite3': SQLITE }), [], 'nor a Landofile of its own');
  assert.deepStrictEqual(found('text', { '.ddev/config.yaml': 'name: text\n', 'data/notes.db': 'only a name\n'.repeat(20) }), [], 'a file named like one is checked by its header');
  assert.strictEqual(sqliteRuntimeOf(path.join(ROOT, 'strapi')), 'docker');
  assert.strictEqual(sqliteRuntimeOf(path.join(ROOT, 'own')), '');
  // What does not fit: the console off DDEV, and running statements anywhere.
  const db = (runtime: string) => ({ engine: 'sqlite', version: '', via: 'file' as const, runtime, service: '', file: 'db.sqlite3' });
  assert.strictEqual(sqliteFits(db('ddev'), 'console'), '');
  assert.match(sqliteFits(db('docker'), 'console'), /no sqlite3 client yet/);
  assert.match(sqliteFits(db('ddev'), 'running'), /no server to ask what runs now/);
  assert.strictEqual(sqliteFits(db('podman'), 'tables'), '');
});

test('register(api) joins the DATABASE menu: one slot, SQLite\'s actions under its own name, and no web admin page', () => {
  const calls: any = { rowMenus: {}, actions: [], pages: [], fragments: 0 };
  const lib: any = { esc: (s: unknown) => String(s), iconHtml: () => '', NAME_RE: /^[a-z0-9_-]+$/i, workspaceDir: () => ROOT, isValidWorkspace: () => true, listProjects: () => [] };
  plugin.register({
    name: 'sqlite', config: {}, lib, capabilities: new Set(['row-menu-body']),
    settings: { file: 'plugin.sqlite.settings.yml', read: () => ({}), set() {}, setList() {} }, appliesTo: () => true,
    addRowMenu: (slot: string, spec: any) => { calls.rowMenus[slot] = spec; },
    addAction: (name: string) => calls.actions.push(name), addFragment: () => { calls.fragments += 1; },
    addPage: (re: RegExp) => calls.pages.push(re), addCss() {}, addTypeAction() {}, addAssistantContext() {},
  } as any);
  assert.deepStrictEqual(calls.rowMenus, { database: { label: 'DATABASE', row: 0 } });
  assert.ok(['console', 'export', 'import', 'import-form', 'info', 'tables', 'tables-form'].every((a) => calls.actions.includes(a)));
  assert.strictEqual(calls.fragments, 1);
  assert.deepStrictEqual(calls.pages, [], 'no web admin, so no page that opens one');
  assert.deepStrictEqual([plugin.AGENTS, plugin.SKILLS, plugin.AI_COMMANDS, plugin.PROMPTS], [['sqlite-helper'], ['sqlite-database'], ['sqlite-sizes'], ['sqlite-copy-and-check']]);
});

test('the tool, its functions and its arguments are bash that parses, and the tool names its folder for the installer to fill in', () => {
  const tool = fs.readFileSync(path.join(PKG, 'commands', 'cmd-tools-sqlite.sh'), 'utf8');
  assert.match(tool, /workspace\.__WORKSPACE__\.settings\.yml/);
  assert.match(tool, /\$\{WORKSPACE_SCRIPTS\}\/plugins\/sqlite\/args\/arg-sqlite\.sh/);
  assert.match(tool, /^sqlite_tool ;$/m);
  const args = fs.readFileSync(path.join(PKG, 'scripts', 'args', 'arg-sqlite.sh'), 'utf8');
  for (const flag of ['--console', '--tables', '--tsv', '--info', '--list', '--export', '--to', '--file', '--import', '--no-safety-export', '--query']) {
    assert.ok(args.includes(`'${flag}'`), `${flag} is an argument`);
  }
  // The heredoc the arguments are read from is not quoted: no dollar sign or backtick may be in it.
  assert.ok(!/[$`]/.test(args.replace('argparse "$@" <<ARGEOF || exit 1', '')), 'no $ or ` in the parser');
  for (const f of ['commands/cmd-tools-sqlite.sh', 'scripts/functions/fun-sqlite.sh', 'scripts/args/arg-sqlite.sh']) {
    assert.strictEqual(spawnSync('bash', ['-n', path.join(PKG, f)]).status, 0, `${f} parses`);
  }
  // Sourced by bootstrap for every cmd-*.sh: only functions and two lists, every name the plugin's own.
  const fun = fs.readFileSync(path.join(PKG, 'scripts', 'functions', 'fun-sqlite.sh'), 'utf8');
  for (const m of fun.matchAll(/^function ([a-z_]+)\(\)/gm)) assert.match(m[1], /^sqlite_/, `${m[1]} carries the plugin's name`);
  assert.deepStrictEqual([...fun.matchAll(/^([A-Z_]+)=/gm)].map((m) => m[1]), ['SQLITE_DB_PLACES', 'SQLITE_DB_FOLDERS']);
});
