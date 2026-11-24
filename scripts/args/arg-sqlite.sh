#!/usr/bin/env bash

argparse "$@" <<ARGEOF || exit 1
parser.add_argument('PROJECT_NAME',
                    help="The project's folder in this workspace folder.")
what = parser.add_mutually_exclusive_group()
what.add_argument('--console',
                  action='store_true',
                  default=False,
                  help="Open sqlite3 on the file, in the project's web container (DDEV's has the client). Type a statement ending with ; and Enter; Ctrl-D leaves.")
what.add_argument('--tables',
                  action='store_true',
                  default=False,
                  help="List the tables, largest first, with their rows (counted) and their sizes with their indexes. Reads only.")
what.add_argument('--info',
                  action='store_true',
                  default=False,
                  help="The file, where it is opened, its other SQLite files, SQLite's version, the tables, the size, the page size and the journal mode. What the tool does with no flag.")
what.add_argument('--list',
                  action='store_true',
                  default=False,
                  help="List the project's SQLite files, one a line: what .env names, the places the frameworks use, a few folders.")
what.add_argument('--export',
                  action='store_true',
                  default=False,
                  help="Copy the file into the backups folder of this workspace folder: <project>--sqlite--<file>--<when>.sqlite.gz, made by SQLite's own backup, consistent while the app writes. Past the keep: setting, the oldest go.")
what.add_argument('--import',
                  dest='IMPORT',
                  default="_none_",
                  help="Put a copy back into the file (a .sqlite, .sqlite3, .db or .db3 file, or one gzipped). The file as it is is exported into the backups folder first, and nothing is imported when that export fails.")
what.add_argument('--query',
                  dest='QUERY',
                  default="_none_",
                  help="Run one statement and print what it answers. A SELECT reads; anything else changes the database.")
parser.add_argument('--file',
                    dest='FILE',
                    default="_none_",
                    help="The SQLite file, relative to the project (the first one found when it is not given; --list says them).")
parser.add_argument('--tsv',
                    action='store_true',
                    default=False,
                    help="With --tables: one line per table, its name, rows and size in bytes, separated by tabs (what the dashboard reads).")
parser.add_argument('--to',
                    dest='TO',
                    default="_none_",
                    help="With --export: write the copy to this file (ending with .sqlite.gz) instead of the backups folder.")
parser.add_argument('--no-safety-export',
                    action='store_true',
                    default=False,
                    help="With --import: skip the export of the file made first. The export is there because an import that replaced an afternoon of work is a bad import: skipping it is a choice, not a default.")
ARGEOF
