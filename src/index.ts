/**
 * SQLite, the light database, for Webship Workspace.
 *
 * The DATABASE menu on every project that keeps its data in SQLite files: for each file, its tables and sizes, a copy
 * into the backups folder, a copy put back, and the sqlite3 console where the project's web container has the client.
 * All of it is the database family's surface (@webship.co/workspace-database); this package is SQLite's engine, its
 * tool (cmd-tools-sqlite.sh, placed into the sites folders) and its AI items.
 */

import type { PluginApi } from '@webship.co/workspace-plugin-api';
import { registerDatabase } from '@webship.co/workspace-database';

import { sqliteEngine } from './lib/engine';

export { sqliteEngine };
export { sqliteFilesOf, sqliteFits, SQLITE_RUNTIMES } from './lib/engine';

/** The AI items the installer places: agents in ai-agents/, skills in ai-skills/, commands in ai-commands/, prompts in ai-prompts/. */
export const AGENTS: string[] = ['sqlite-helper'];
export const SKILLS: string[] = ['sqlite-database'];
export const AI_COMMANDS: string[] = ['sqlite-sizes'];
export const PROMPTS: string[] = ['sqlite-copy-and-check'];

export function register(api: PluginApi): void {
  registerDatabase(api, sqliteEngine);
}
