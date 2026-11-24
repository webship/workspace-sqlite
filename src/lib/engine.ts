/**
 * SQLite, the light database, as an engine: the facts the family's DATABASE menu draws from.
 *
 * A SQLite database is a file of the project (Laravel's database/database.sqlite, Strapi's .tmp/data.db, Django's
 * db.sqlite3, Prisma's prisma/dev.db, a Drupal site's .ht.sqlite, what .env names): the family's base finds them and
 * checks each by its header. The tool, cmd-tools-sqlite.sh, opens a file in the project's own web container, which
 * mounts the project: PHP's SQLite3 there reads the tables and copies the file through SQLite's backup, on DDEV and on
 * the runtime layer's projects alike, and the sqlite3 client gives the console where the container has it (DDEV's).
 * A project with no runtime of the Workspace (a folder with a compose file of its own, or none) has no container to
 * open its file in: none of its files is offered.
 */

import { sqliteDetect, projectRuntime, readWebshipBlock } from '@webship.co/workspace-database';
import type { DatabaseEngine, DatabaseFound, DatabaseVerb } from '@webship.co/workspace-database';

/** The runtimes whose web container the tool opens a file in: DDEV, and those of the runtime layer. */
export const SQLITE_RUNTIMES = ['ddev', 'docker', 'podman', 'kubernetes', 'lando', 'docksal'];

/**
 * The runtime whose web container opens a project's files, or '': DDEV, or the runtime the Workspace built the
 * project on (its x-webship block says it). A Landofile, a `.docksal/` or a compose file of the project's own names
 * no web container the tool knows yet.
 */
export function sqliteRuntimeOf(projectDir: string): string {
  const rt = projectRuntime(projectDir);
  if (rt === 'ddev') return rt;
  return readWebshipBlock(projectDir) && SQLITE_RUNTIMES.includes(rt) ? rt : '';
}

/** The SQLite files of a project the tool can open: those of a project of DDEV or of the runtime layer. */
export function sqliteFilesOf(projectDir: string): DatabaseFound[] {
  const rt = sqliteRuntimeOf(projectDir);
  if (!rt) return [];
  return sqliteDetect(projectDir).map((d) => ({ ...d, runtime: rt }));
}

/**
 * What does not fit a file: the console needs the sqlite3 client, which only DDEV's web image carries; and a file
 * has no server to ask what runs now.
 */
export function sqliteFits(db: DatabaseFound, verb: DatabaseVerb): string {
  if (verb === 'console' && db.runtime !== 'ddev') {
    return 'The sqlite3 console: the web container of this runtime has no sqlite3 client yet (DDEV\'s has). Tables, export and import work here.';
  }
  if (verb === 'running') return 'SQLite runs inside the app, with no server to ask what runs now.';
  return '';
}

export const sqliteEngine: DatabaseEngine = {
  id: 'sqlite',
  title: 'SQLite',
  icon: 'tabler:file-database',
  script: 'cmd-tools-sqlite.sh',
  client: 'sqlite3',
  detect: sqliteFilesOf,
  // Adminer opens a SQLite file from the add-on's release for DDEV 1.24.10 and later only: not offered yet.
  admins: [],
  verbs: ['console', 'tables', 'export', 'import', 'info'],
  fits: sqliteFits,
  dumpExt: '.sqlite.gz',
  rowsAre: 'counted',
};
