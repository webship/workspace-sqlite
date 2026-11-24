---
name: sqlite-database
description: The SQLite files of a Webship Workspace project, as the SQLite plugin (`@webship.co/workspace-sqlite`) gives them — which projects keep their data in SQLite and where the files are (Laravel, Strapi, Django, Prisma, Payload, Rails, Ghost, Flask, a Drupal site's .ht.sqlite, what .env names), every entry of the DATABASE menu and the `cmd-tools-sqlite.sh` flag it runs, the copies in the backups folder, the runtimes, and the plugin's settings. Use when a person asks about a project's SQLite file, sqlite3, its size, its tables, a copy of it or putting one back, or what the DATABASE menu does.
---

# SQLite in a Webship Workspace

The Webship Workspace is container-based (DDEV by default). The SQLite plugin (`@webship.co/workspace-sqlite`, an
engine of `@webship.co/workspace-database`) puts a **DATABASE** menu on every project row that keeps its data in a
SQLite file, a section per file, and places its tool, `cmd-tools-sqlite.sh`, into every sites folder (dev, test,
demos, sandboxes, projects, …). Every entry of the menu runs that tool in a screen session, from the project's
workspace folder.

## Which projects

The tool opens a file in the project's own web container, which mounts the project: PHP's SQLite3 there reads it and
copies it through SQLite's backup. So a project's SQLite files are offered when the project runs on DDEV, or on a
runtime the Workspace built it on (Docker Compose, Podman, Kubernetes, Lando, Docksal: its `x-webship:` block says
which). Its files are found, at most eight, each checked by its header:

| Where | Whose |
| --- | --- |
| What `.env` names | Laravel's `DB_DATABASE` with `DB_CONNECTION=sqlite`, Strapi's `DATABASE_FILENAME`, a `file:./dev.db` or `sqlite:///%kernel.project_dir%/var/data.db` URL (Prisma, Symfony) |
| The places the frameworks use | `database/database.sqlite`, `.tmp/data.db`, `db.sqlite3`, `payload.db`, `prisma/dev.db`, `var/data.db`, `storage/development.sqlite3`, `db/development.sqlite3`, `content/data/ghost*.db`, `instance/app.db` |
| A Drupal site's | `sites/<site>/files/.ht.sqlite` |
| A few folders, one level deep | `*.sqlite`, `*.sqlite3`, `*.db`, `*.db3` in the project, `database/`, `data/`, `db/`, `storage/`, `var/`, `.tmp/`, `prisma/`, `instance/` |

The row's caption says `SQLite`; the menu's header for each file names the file and the runtime. A project whose
database server is MariaDB, MySQL or PostgreSQL gets that plugin's section in the same menu, with that plugin
installed.

## The DATABASE menu

| Entry | The tool's flag | What it does |
| --- | --- | --- |
| Console (sqlite3) | `--console` | sqlite3 on the file, in the project's web container: DDEV's has the client; elsewhere the menu says it does not fit yet |
| Tables and sizes | `--tables` (the modal reads `--tables --tsv`) | The tables, largest first, with rows (counted) and size (indexes in it). Reads only |
| Export to the backups folder | `--export` | `<backups>/<folder>/<project>--sqlite--<the file>--<when>.sqlite.gz`, made by SQLite's own backup |
| Import a dump… | `--import <copy>` | Lists the copies of the backups folder; asks first; checks that the copy is whole, copies the file as it is, then puts the copy back |
| Connection details | `--info` | The file, the runtime, SQLite's version, the tables, the size, the page size and the journal mode |

The tool also takes `--list` (the project's SQLite files), `--file <path>` (the file, on every command; the first one
found when it is not given), `--query "<statement>"` (prints what it answers), `--to <path.sqlite.gz>` with `--export`,
and `--no-safety-export` with `--import`. Run `bash cmd-tools-sqlite.sh <project> --help` for every flag. There is no
running-statements entry: SQLite runs inside the app, with no server to ask.

## Copies and imports

- A copy is consistent while the app writes: SQLite's backup makes it, in the project's web container.
- `--import` takes a `.sqlite`, `.sqlite3`, `.db` or `.db3` file, or one gzipped. It reads the copy whole and asks
  SQLite to check it before anything changes, copies the file as it is into the backups folder first
  (`…--before-import--<when>.sqlite.gz`), and puts nothing back when either fails. The copy goes back through the
  same backup, so the app's open connections see the new database.
- The import form lists the copies of this engine in the backups folder, this project's first.

## Runtimes

| Runtime | The file is opened | The console |
| --- | --- | --- |
| DDEV | In the web container, with `ddev exec` | sqlite3, with a prompt |
| Docker Compose, Podman, Kubernetes, Lando, Docksal (a project the Workspace built there) | In the web container, through the runtime layer's `ddev exec` | Not yet: the layer's web image has no sqlite3 client |
| A compose file, a Landofile or a `.docksal/` of the project's own | Not yet: no web container the tool knows | Not yet |

No web admin is offered yet: Adminer opens a SQLite file only from the add-on's releases for DDEV 1.24.10 and later.

## Settings

`core/config/plugin.sqlite.settings.yml`, also on the plugin's page in Settings:

| Key | What it is |
| --- | --- |
| `keep:` | How many copies of one project's SQLite files the backups folder keeps; the oldest go when a new one is made, never the copy an import is putting back. `0` keeps every one |
