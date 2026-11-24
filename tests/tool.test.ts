/**
 * cmd-tools-sqlite.sh's functions against scaffolded projects, with `ddev` replaced by a recorder that does what the
 * PHP helper would do in the web container (copy the file for a backup, copy it back for a restore, print what it is
 * given for the rest): which files a project keeps, where they are opened, and what each flag runs. The helper itself
 * runs for real at the end, where this machine has PHP with SQLite3 (the CI runner has it; the workspace's machine
 * keeps PHP in its containers).
 */
import test, { after } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';

// Compiled, this test runs from dist/tests, so the package root is one folder further up.
const PKG = fs.existsSync(path.join(__dirname, '..', 'package.json')) ? path.join(__dirname, '..') : path.join(__dirname, '..', '..');
const FUN = path.join(PKG, 'scripts', 'functions', 'fun-sqlite.sh');
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-tool-'));
after(() => fs.rmSync(ROOT, { recursive: true, force: true }));

function write(rel: string, body: string | Buffer) {
  fs.mkdirSync(path.dirname(path.join(ROOT, rel)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, rel), body);
}
/** A file with SQLite's header, 100 bytes as SQLite's own first page starts; `fill` tells two of them apart. */
const sqliteFile = (fill = 'A') => Buffer.concat([Buffer.from('SQLite format 3\u0000', 'latin1'), Buffer.alloc(84, fill)]);

write('dev/laravel/.ddev/config.yaml', 'name: laravel\ntype: laravel\ndocroot: public\n');
write('dev/laravel/.env', 'APP_NAME=Laravel\nDB_CONNECTION=sqlite\nDB_DATABASE=/var/www/html/database/database.sqlite\n');
write('dev/laravel/database/database.sqlite', sqliteFile());
write('dev/strapi/compose.yaml', 'name: strapi\nx-webship:\n  runtime: docker\n  stack: php\n  database: "10.11"\n  port: 38001\nservices:\n  web:\n    image: webship-strapi-web\n');
write('dev/strapi/.tmp/data.db', sqliteFile());
write('dev/two/.ddev/config.yaml', 'name: two\n');
write('dev/two/db.sqlite3', sqliteFile());
write('dev/two/data/cache.sqlite', sqliteFile());
write('dev/two/data/notes.db', 'not a database, only a name that looks like one\n'.repeat(4));
write('dev/drupal/.ddev/config.yaml', 'name: drupal\ndocroot: web\n');
write('dev/drupal/web/sites/default/files/.ht.sqlite', sqliteFile());
write('dev/fresh/.ddev/config.yaml', 'name: fresh\n');
write('dev/fresh/database/database.sqlite', '');
write('dev/own/compose.yaml', 'services:\n  app:\n    image: node:22\n');
write('dev/own/database/database.sqlite', sqliteFile());
write('dev/landoown/.lando.yml', 'name: landoown\nrecipe: lamp\n');
write('dev/landoown/db.sqlite3', sqliteFile());
write('dev/nothing/.ddev/config.yaml', 'name: nothing\n');

/**
 * A shell with the plugin's functions, the two layer functions they ask (as the core's runtime layer answers them),
 * and `ddev` recorded into $LOG. `ddev exec "php <helper> <op> <file> [<other>]"` does what the helper would: a backup
 * copies the file, a restore copies the other back over it, the rest print $DDEV_EXEC_OUT; $FAIL_OP fails that op.
 */
function run(script: string, env: Record<string, string> = {}): { code: number; out: string; log: string[] } {
  const log = path.join(ROOT, `log-${Math.random().toString(36).slice(2)}`);
  const src = `
LOG='${log}'
rec() { printf '%s\\n' "\$*" >> "\$LOG" ; }
function ddev() {
  rec ddev "\$@" ;
  [ "\$1" = exec ] || return 0 ;
  shift ; local line="\$*" ; eval "set -- \${line}" ;
  if [ "\$1" = php ] ; then
    [ -n "\${HELPER_COPY:-}" ] && cp "\$2" "\$HELPER_COPY" ;
    [ "\${FAIL_OP:-}" = "\$3" ] && { echo "the \$3 failed" >&2 ; return 1 ; } ;
    case "\$3" in
      backup) cp "\$4" "\$5" && echo copied ;;
      restore) cp "\$5" "\$4" && echo restored ;;
      *) [ -n "\${DDEV_EXEC_OUT:-}" ] && printf '%b' "\$DDEV_EXEC_OUT" ;;
    esac
  fi
  return 0 ; }
function rt_find_project() { local d="\${1:-\$PWD}" ; d="\$(cd "\$d" && pwd)" ;
  while [ "\$d" != / ] ; do
    if [ -f "\$d/compose.yaml" ] && grep -q '^x-webship:' "\$d/compose.yaml" ; then echo "\$(sed -n '/^x-webship:/,/^[^ ]/s/^  runtime: *//p' "\$d/compose.yaml" | head -1) \$d" ; return 0 ; fi
    [ -f "\$d/.ddev/config.yaml" ] && { echo "ddev \$d" ; return 0 ; } ;
    [ -f "\$d/.lando.yml" ] && { echo "lando \$d" ; return 0 ; } ;
    d="\$(dirname "\$d")" ;
  done ; return 1 ; }
function rt_meta() { [ -f "\$2/compose.yaml" ] && grep -q '^x-webship:' "\$2/compose.yaml" && sed -n '/^x-webship:/,/^[^ x]/s/^  '"\$1"': *//p' "\$2/compose.yaml" | head -1 | tr -d '"' ; return 0 ; }
source '${FUN}'
WORKSPACE_ROOT='${ROOT}' ; doc_name=dev ; backups='${ROOT}/backups' ; current_path='${ROOT}'
${script}`;
  const r = spawnSync('bash', ['-c', src], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: ROOT, ...env } });
  const lines = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean) : [];
  return { code: r.status === null ? -1 : r.status, out: `${r.stdout}${r.stderr}`, log: lines };
}
const helpersLeft = (p: string) => fs.readdirSync(path.join(ROOT, 'dev', p)).filter((f) => f.startsWith('.webship-sqlite-'));

test('the SQLite files of a project, the named ones first, each checked by its header; and the runtime that opens them', () => {
  const files = (p: string) => run(`sqlite_files '${ROOT}/dev/${p}'`).out.trim().split('\n').filter(Boolean);
  assert.deepStrictEqual(files('laravel'), ['database/database.sqlite'], 'what .env names, given as the container sees it');
  assert.deepStrictEqual(files('strapi'), ['.tmp/data.db']);
  assert.deepStrictEqual(files('two'), ['db.sqlite3', 'data/cache.sqlite'], 'a file named like a database that is not one is left out');
  assert.deepStrictEqual(files('drupal'), ['web/sites/default/files/.ht.sqlite']);
  assert.deepStrictEqual(files('fresh'), ['database/database.sqlite'], 'Laravel starts with an empty file at its place');
  assert.deepStrictEqual(files('nothing'), []);
  const rt = (p: string) => run(`sqlite_runtime '${ROOT}/dev/${p}'`);
  assert.strictEqual(rt('laravel').out.trim(), 'ddev');
  assert.strictEqual(rt('strapi').out.trim(), 'docker');
  assert.strictEqual(rt('own').code, 1, 'a compose file of its own names no web container the tool knows');
  assert.strictEqual(rt('landoown').code, 1, 'nor does a Landofile of its own');
  const at = (p: string, want = '') => run(`PROJECT_NAME=${p} ; sqlite_locate '${ROOT}/dev/${p}' '${want}'`);
  assert.strictEqual(at('laravel').out.trim(), 'ddev|database/database.sqlite');
  assert.strictEqual(at('two', 'data/cache.sqlite').out.trim(), 'ddev|data/cache.sqlite');
  assert.strictEqual(at('two', '/var/www/html/data/cache.sqlite').out.trim(), 'ddev|data/cache.sqlite', 'a path in the container is the project\'s');
  assert.match(at('two', 'data/notes.db').out, /data\/notes\.db of two is not a SQLite database\./);
  assert.match(at('two', '../laravel/database/database.sqlite').out, /is not a file of two\./);
  assert.match(at('own').out, /own has no runtime of the Workspace \(DDEV, or a project its runtime layer built\)/);
  assert.match(at('nothing').out, /nothing keeps no SQLite file the tool knows of: name one with --file <path>\./);
});

test('the tables, the info and a query: PHP in the project\'s web container, with a helper written for the run and removed after', () => {
  const helper = path.join(ROOT, 'helper.php');
  const tables = run(`PROJECT_NAME=laravel ; TABLES=yes ; TSV=yes ; DDEV_EXEC_OUT='users\\t3\\t8192\\n' ; HELPER_COPY='${helper}' ; sqlite_tool`);
  assert.strictEqual(tables.code, 0, tables.out);
  assert.strictEqual(tables.out, 'users\t3\t8192\n');
  assert.match(tables.log[0], /^ddev exec php \.webship-sqlite-\d+\.php tables database\/database\.sqlite tsv $/);
  assert.deepStrictEqual(helpersLeft('laravel'), [], 'the helper is gone after the run');
  const php = fs.readFileSync(helper, 'utf8');
  assert.match(php, /^<\?php\n/);
  assert.match(php, /if \(PHP_SAPI !== 'cli'\) \{ http_response_code\(404\); exit; \}/, 'a helper the web server reaches answers nothing');
  for (const op of ['tables', 'info', 'query', 'backup', 'restore']) assert.ok(php.includes(`case '${op}':`), `the helper does ${op}`);
  assert.match(php, /PRAGMA quick_check/, 'a copy is checked before it goes back');
  // The runtime layer's projects: the same, through the layer's ddev exec.
  const layer = run('PROJECT_NAME=strapi ; TABLES=yes ; sqlite_tool');
  assert.strictEqual(layer.code, 0, layer.out);
  assert.match(layer.log[0], /^ddev exec php \.webship-sqlite-\d+\.php tables \.tmp\/data\.db $/);
  const info = run('PROJECT_NAME=two ; sqlite_tool');
  assert.match(info.out, /^Project: {3}dev\/two$/m);
  assert.match(info.out, /^Database: {2}SQLite, the file db\.sqlite3 \(.+ on disk\), opened in the web container of DDEV$/m);
  assert.match(info.out, /^Its other SQLite files \(--file <path>\): data\/cache\.sqlite$/m);
  assert.match(info.log[0], / info db\.sqlite3 $/);
  const query = run(`PROJECT_NAME=two ; FILE=data/cache.sqlite ; QUERY="SELECT 'it''s'" ; sqlite_tool`);
  assert.match(query.log[0], / query data\/cache\.sqlite SELECT\\ \\'it\\'\\'s\\' $/, 'the statement goes over quoted');
  assert.deepStrictEqual(run('PROJECT_NAME=two ; LIST=yes ; sqlite_tool').out.trim().split('\n'), ['db.sqlite3', 'data/cache.sqlite']);
});

test('an export copies the file with SQLite\'s backup into the backups folder, gzipped, the file in its name; past keep: the oldest go', () => {
  const ex = run('PROJECT_NAME=laravel ; EXPORT=yes ; sqlite_tool');
  assert.strictEqual(ex.code, 0, ex.out);
  assert.match(ex.log[0], /^ddev exec php \.webship-sqlite-\d+\.php backup database\/database\.sqlite \.webship-sqlite-export-\d+\.sqlite $/);
  const made = fs.readdirSync(path.join(ROOT, 'backups', 'dev')).filter((f) => f.startsWith('laravel--'));
  assert.strictEqual(made.length, 1);
  assert.match(made[0], /^laravel--sqlite--database_database\.sqlite--\d{4}(-\d\d){5}\.sqlite\.gz$/);
  assert.deepStrictEqual(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, 'backups', 'dev', made[0]))), sqliteFile());
  assert.match(ex.out, /^Exported: .*laravel--sqlite--database_database\.sqlite--.*\.sqlite\.gz \(.+\)$/m);
  assert.deepStrictEqual(fs.readdirSync(path.join(ROOT, 'dev', 'laravel')).filter((f) => f.startsWith('.webship-sqlite')), [], 'no copy is left in the project');
  // A Drupal site's .ht.sqlite: its name in the export loses the dot it starts with.
  assert.match(run('PROJECT_NAME=drupal ; EXPORT=yes ; sqlite_tool').out, /drupal--sqlite--web_sites_default_files_\.ht\.sqlite--/);
  // keep: 2, with three older copies there.
  ['2026-01-01-00-00-00', '2026-01-02-00-00-00', '2026-01-03-00-00-00'].forEach((s, i) => {
    const f = path.join(ROOT, 'backups', 'dev', `two--sqlite--db.sqlite3--${s}.sqlite.gz`);
    fs.writeFileSync(f, zlib.gzipSync(sqliteFile()));
    const t = new Date(Date.UTC(2026, 0, 1 + i));
    fs.utimesSync(f, t, t);
  });
  const kept = run('PROJECT_NAME=two ; EXPORT=yes ; plugin_sqlite_keep=2 ; sqlite_tool');
  assert.strictEqual(kept.code, 0, kept.out);
  assert.strictEqual(fs.readdirSync(path.join(ROOT, 'backups', 'dev')).filter((f) => f.startsWith('two--')).length, 2);
  assert.match(kept.out, /Removed an older copy \(keep: 2\): two--sqlite--db\.sqlite3--2026-01-01-00-00-00\.sqlite\.gz/);
  // Elsewhere with --to; a copy that fails is said, and leaves nothing.
  const to = path.join(ROOT, 'elsewhere.sqlite.gz');
  assert.strictEqual(run(`PROJECT_NAME=laravel ; EXPORT=yes ; TO='${to}' ; sqlite_tool`).code, 0);
  assert.ok(fs.existsSync(to));
  assert.match(run(`PROJECT_NAME=laravel ; EXPORT=yes ; TO='${ROOT}/x.sql.gz' ; sqlite_tool`).out, /An export is a \.sqlite\.gz file/);
  const failed = run('PROJECT_NAME=strapi ; EXPORT=yes ; FAIL_OP=backup ; sqlite_tool');
  assert.strictEqual(failed.code, 1);
  assert.match(failed.out, /The copy failed\./);
  assert.deepStrictEqual(fs.readdirSync(path.join(ROOT, 'backups', 'dev')).filter((f) => f.startsWith('strapi--')), []);
});

test('an import reads the copy whole first, copies the file as it is, never prunes the copy it puts back, and puts it back through the backup', () => {
  const dir = path.join(ROOT, 'backups', 'dev');
  fs.mkdirSync(dir, { recursive: true });
  const older = (name: string, body: Buffer, day: number) => {
    const f = path.join(dir, name);
    fs.writeFileSync(f, body);
    const t = new Date(Date.UTC(2026, 0, day));
    fs.utimesSync(f, t, t);
    return f;
  };
  const db = path.join(ROOT, 'dev', 'strapi', '.tmp', 'data.db');
  // keep: 1, and an older copy of the project's own put back: the before-import copy spares it.
  const copy = older('strapi--sqlite--tmp_data.db--2026-01-01-00-00-00.sqlite.gz', zlib.gzipSync(sqliteFile('B')), 1);
  const imp = run(`PROJECT_NAME=strapi ; IMPORT='${copy}' ; plugin_sqlite_keep=1 ; sqlite_tool`);
  assert.strictEqual(imp.code, 0, imp.out);
  assert.match(imp.log[0], / backup \.tmp\/data\.db \.webship-sqlite-export-\d+\.sqlite $/, 'the file as it is, copied first');
  assert.match(imp.log[1], / restore \.tmp\/data\.db \.webship-sqlite-import-\d+\.sqlite $/);
  assert.deepStrictEqual(fs.readFileSync(db), sqliteFile('B'), 'the copy is back in the file');
  assert.ok(fs.existsSync(copy), 'the copy being put back is not pruned');
  assert.match(imp.out, /^Imported strapi--sqlite--tmp_data\.db--2026-01-01-00-00-00\.sqlite\.gz\.$/m);
  const before = fs.readdirSync(dir).filter((f) => f.startsWith('strapi--sqlite--tmp_data.db--before-import--'));
  assert.strictEqual(before.length, 1);
  assert.deepStrictEqual(zlib.gunzipSync(fs.readFileSync(path.join(dir, before[0]))), sqliteFile(), 'the before-import copy holds the file as it was');
  assert.deepStrictEqual(helpersLeft('strapi'), []);
  // A copy that is not whole, one that is not SQLite's, one of another kind: refused before anything runs.
  const whole = zlib.gzipSync(Buffer.concat([sqliteFile('C'), Buffer.alloc(4096, 'C')]));
  const half = older('strapi--sqlite--tmp_data.db--2026-01-02-00-00-00.sqlite.gz', whole.subarray(0, Math.floor(whole.length / 2)), 2);
  const refused = run(`PROJECT_NAME=strapi ; IMPORT='${half}' ; sqlite_tool`);
  assert.strictEqual(refused.code, 1, refused.out);
  assert.match(refused.out, /could not be read whole \(gzip\): nothing was imported\./);
  assert.deepStrictEqual(refused.log, []);
  assert.deepStrictEqual(fs.readFileSync(db), sqliteFile('B'), 'the file is untouched');
  write('dumps/text.db.gz', zlib.gzipSync('hello\n'));
  assert.match(run(`PROJECT_NAME=strapi ; IMPORT='dumps/text.db.gz' ; sqlite_tool`).out, /text\.db\.gz is not a SQLite database: nothing was imported\./);
  write('dumps/server.sql.gz', zlib.gzipSync('CREATE TABLE t (id int);\n'));
  assert.match(run(`PROJECT_NAME=strapi ; IMPORT='dumps/server.sql.gz' ; sqlite_tool`).out, /A copy of a SQLite file is a \.sqlite, \.sqlite3, \.db or \.db3 file, or one of those gzipped/);
  // A copy SQLite refuses to put back (the helper's check): the import fails, and says so.
  write('dumps/plain.sqlite', sqliteFile('D'));
  const bad = run(`PROJECT_NAME=strapi ; IMPORT='dumps/plain.sqlite' ; NO_SAFETY_EXPORT=yes ; FAIL_OP=restore ; sqlite_tool`);
  assert.strictEqual(bad.code, 1, bad.out);
  assert.match(bad.out, /The import failed\./);
  assert.doesNotMatch(bad.out, /^Imported/m);
  assert.strictEqual(bad.log.length, 1, 'no copy first with --no-safety-export');
  // When the copy of the file as it is fails, nothing is put back.
  const safety = run(`PROJECT_NAME=strapi ; IMPORT='dumps/plain.sqlite' ; FAIL_OP=backup ; sqlite_tool`);
  assert.strictEqual(safety.code, 1);
  assert.match(safety.out, /The export of the file as it is failed: nothing was imported\./);
  assert.deepStrictEqual(fs.readFileSync(db), sqliteFile('B'));
});

test('the console: sqlite3 in DDEV\'s web container; on the runtime layer\'s projects it is said not to fit yet', () => {
  const ddev = run('PROJECT_NAME=two ; CONSOLE=yes ; FILE=data/cache.sqlite ; sqlite_tool');
  assert.strictEqual(ddev.code, 0, ddev.out);
  assert.deepStrictEqual(ddev.log, ['ddev exec sqlite3 -header -column data/cache.sqlite']);
  const layer = run('PROJECT_NAME=strapi ; CONSOLE=yes ; sqlite_tool');
  assert.strictEqual(layer.code, 1);
  assert.match(layer.out, /The sqlite3 console: the web container of Docker Compose has no sqlite3 client yet \(DDEV's has\)\. --tables, --query, --export and --import work here\./);
  assert.deepStrictEqual(layer.log, []);
});

/** PHP with SQLite3 on this machine, for the helper's own test. */
const PHP = (() => {
  const r = spawnSync('php', ['-r', 'exit(class_exists("SQLite3") && method_exists("SQLite3", "backup") ? 0 : 1);'], { encoding: 'utf8' });
  return r.status === 0;
})();

test('the helper itself, in PHP: tables with their rows and sizes, a consistent copy, a copy put back, a damaged copy refused', { skip: !PHP && 'this machine has no PHP with SQLite3' }, () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'php-'));
  const helper = path.join(dir, 'helper.php');
  fs.writeFileSync(helper, run('sqlite_helper').out);
  const php = (...args: string[]) => spawnSync('php', [helper, ...args], { encoding: 'utf8', cwd: dir });
  const sql = (file: string, statements: string) => spawnSync('php', ['-r', `$db = new SQLite3(${JSON.stringify(file)}); $db->exec(${JSON.stringify(statements)});`], { encoding: 'utf8', cwd: dir });
  const db = path.join(dir, 'app.sqlite');
  const rows = Array.from({ length: 300 }, (_, i) => `(${i}, '${'x'.repeat(200)}')`).join(',');
  assert.strictEqual(sql(db, `CREATE TABLE posts (id INTEGER PRIMARY KEY, body TEXT); CREATE INDEX posts_body ON posts (body); INSERT INTO posts VALUES ${rows}; CREATE TABLE tags (name TEXT); INSERT INTO tags VALUES ('a'), ('b');`).status, 0);
  const tsv = php('tables', db, 'tsv');
  assert.strictEqual(tsv.status, 0, tsv.stderr);
  const lines = tsv.stdout.trim().split('\n').map((l) => l.split('\t'));
  assert.deepStrictEqual(lines.map((l) => [l[0], l[1]]), [['posts', '300'], ['tags', '2']], 'largest first, rows counted');
  if (lines[0][2]) assert.ok(Number(lines[0][2]) > Number(lines[1][2] || 0), 'sizes from dbstat, indexes in them');
  assert.match(php('tables', db).stdout, /\| Table +\| Rows +\| Size +\|/);
  assert.match(php('info', db).stdout, /\| SQLite +\| Tables +\| Size +\| Page size +\| Journal +\| Encoding +\|/);
  assert.match(php('query', db, 'SELECT COUNT(*) AS n FROM tags').stdout, /\| n +\|\n\+-+\+\n\| 2 +\|/);
  // A copy, then a change, then the copy put back.
  const copy = path.join(dir, 'copy.sqlite');
  assert.strictEqual(php('backup', db, copy).stdout.trim(), 'copied');
  assert.strictEqual(sql(db, 'DELETE FROM posts; DROP TABLE tags; CREATE TABLE added (x);').status, 0);
  assert.strictEqual(php('restore', db, copy).stdout.trim(), 'restored');
  assert.deepStrictEqual(php('tables', db, 'tsv').stdout.trim().split('\n').map((l) => l.split('\t').slice(0, 2)), [['posts', '300'], ['tags', '2']], 'the added table is gone, the rest is back');
  // A damaged copy: its pages overwritten past the first. Refused, and the file stays as it is.
  const damaged = path.join(dir, 'damaged.sqlite');
  const buf = fs.readFileSync(copy);
  buf.fill(0x5a, 4096, Math.min(buf.length, 4096 * 4));
  fs.writeFileSync(damaged, buf);
  const refused = php('restore', db, damaged);
  assert.notStrictEqual(refused.status, 0);
  assert.match(refused.stderr, /damaged|malformed|not a database/i);
  assert.deepStrictEqual(php('tables', db, 'tsv').stdout.trim().split('\n').map((l) => l.split('\t').slice(0, 2)), [['posts', '300'], ['tags', '2']]);
  assert.match(php('tables', path.join(dir, 'missing.sqlite')).stderr, /No such SQLite file/);
});
