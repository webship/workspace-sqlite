# @webship.co/workspace-sqlite

SQLite, the light database, for the [Webship Workspace](https://github.com/webship/workspace), the container-based
development workspace (DDEV by default): the **DATABASE** menu on every project row that keeps its data in a SQLite
file, a section per file, and its tool, `cmd-tools-sqlite.sh`, on DDEV and on the runtimes the Workspace builds a
project on (Docker Compose, Podman, Kubernetes, Lando, Docksal). An engine of
[`@webship.co/workspace-database`](https://github.com/webship/workspace-database), which draws the menu.

A SQLite database is a file of the project: Laravel's `database/database.sqlite`, Strapi's `.tmp/data.db`, Django's
`db.sqlite3`, Payload's `payload.db`, Prisma's `prisma/dev.db`, a Drupal site's `sites/default/files/.ht.sqlite`, or
the file `.env` names. The tool opens it in the project's own web container, which mounts the project: PHP's SQLite3
there reads it and copies it through SQLite's own backup, so a copy is consistent while the app writes. Nothing is
installed on this machine for it.

## Use it

```bash
cd ~/workspace
bash core/scripts/plugins.sh --require github:webship/workspace-sqlite
bash core/scripts/plugins.sh --activate sqlite --with-needs
bash core/scripts/plugins.sh --install sqlite
```

The install places `cmd-tools-sqlite.sh` into every sites folder (dev, test, demos, sandboxes, projects, …), its bash
functions and arguments under `core/scripts/plugins/sqlite/`, its settings file, its AI items and its webship-js
feature. Restart the dashboard to load it.

## Which files

A project's SQLite files are found the way the base finds them, at most eight, each checked by its header (an empty
file counts only where a framework names one: Laravel starts with one):

| Where | Whose |
| --- | --- |
| What `.env` names | Laravel's `DB_DATABASE` with `DB_CONNECTION=sqlite`, Strapi's `DATABASE_FILENAME` with `DATABASE_CLIENT=sqlite`, a `file:` URL (Prisma) or a `sqlite:///` URL (Symfony) |
| The places the frameworks use | `database/database.sqlite`, `.tmp/data.db`, `db.sqlite3`, `payload.db`, `prisma/dev.db`, `var/data.db`, `storage/development.sqlite3`, `db/development.sqlite3`, `content/data/ghost*.db`, `instance/app.db` |
| A Drupal site's | `sites/<site>/files/.ht.sqlite`, under the docroot |
| A few folders, one level deep | `*.sqlite`, `*.sqlite3`, `*.db`, `*.db3` in the project, `database/`, `data/`, `db/`, `storage/`, `var/`, `.tmp/`, `prisma/`, `instance/`, `content/data/` |

## The DATABASE menu

On such a row the caption says `SQLite` (with the project's database server beside it when it has one, such as
`SQLite + MariaDB 10.11`), and the menu has a section per file, its header naming the file and the runtime:

| Entry | The tool's flag | What it does |
| --- | --- | --- |
| Console (sqlite3) | `--console` | sqlite3 on the file, in a screen, with its prompt: DDEV's web container has the client |
| Tables and sizes | `--tables` | The tables, largest first, with rows (counted) and size (indexes in it, from SQLite's `dbstat`), in the modal |
| Export to the backups folder | `--export` | `<backups>/<folder>/<project>--sqlite--<the file>--<when>.sqlite.gz`, made by SQLite's own backup |
| Import a dump… | `--import <copy>` | The copies of the backups folder, this project's first; asks first; reads the copy whole and has SQLite check it, copies the file as it is, then puts the copy back |
| Connection details | `--info` | The file, the runtime, SQLite's version, the tables, the size, the page size, the journal mode, the project's other SQLite files |

Each entry runs the tool in a screen session from the project's workspace folder: read it on the Screens page. There
is no running-statements entry: SQLite runs inside the app, with no server to ask. No web admin is offered yet (see
below).

## The tool

```bash
cd ~/workspace/dev
bash cmd-tools-sqlite.sh mysite                              # --info: the file, where it is opened, what it holds
bash cmd-tools-sqlite.sh mysite --list                       # the project's SQLite files, one a line
bash cmd-tools-sqlite.sh mysite --tables                     # the tables, largest first (--tsv: name, rows, bytes)
bash cmd-tools-sqlite.sh mysite --file data/cache.sqlite --tables
bash cmd-tools-sqlite.sh mysite --console                    # DDEV
bash cmd-tools-sqlite.sh mysite --query "SELECT COUNT(*) FROM users"
bash cmd-tools-sqlite.sh mysite --export                     # into the backups folder; --to <path.sqlite.gz> elsewhere
bash cmd-tools-sqlite.sh mysite --import <copy>              # .sqlite, .sqlite3, .db, .db3, or one gzipped
```

`--file <path>` names the file on every command (the first one found when it is not given); a path as the container
sees it (`/var/www/html/database/database.sqlite`) is taken too. An import takes nothing it cannot read whole, nothing
that is not a SQLite database, and nothing SQLite finds damaged (`PRAGMA quick_check`); it copies the file as it is
into the backups folder first (`…--before-import--<when>.sqlite.gz`), and puts nothing back when that copy fails;
`--no-safety-export` skips that copy. The copy goes back through SQLite's backup too, so the app's open connections
see the new database. The helper the tool runs in the container is written into the project for that run only, and
answers nothing to a web request.

## Settings

`core/config/plugin.sqlite.settings.yml`, also on the plugin's page in Settings:

| Key | Default | What it is |
| --- | --- | --- |
| `keep` | `0` | How many copies of one project's SQLite files the backups folder keeps; the oldest go when a new one is made, never the copy an import is putting back. `0` keeps every one |

## Runtimes

| | DDEV | Docker Compose | Kubernetes | Podman, Lando, Docksal | A compose file, a Landofile or a `.docksal/` of its own |
| --- | --- | --- | --- | --- | --- |
| The menu on the row, a section per file | Yes | Yes | Yes | Not yet run | Not yet: no web container the tool knows |
| Tables and sizes, connection details, a query | Yes | Yes | Yes | Not yet run | Not yet |
| Export, then import | Yes | Yes | Yes | Not yet run | Not yet |
| Console | Yes, with a prompt | Not yet: no sqlite3 in the web image | Not yet | Not yet | Not yet |

"Yes" means it was run on a real project of that runtime, a shop's tables and a view in a SQLite file, from the
terminal and from the dashboard: a DDEV project with a Laravel-style `database/database.sqlite` (named in `.env`)
beside DDEV's MariaDB, and a project the Workspace built on Docker Compose with a Strapi-style `.tmp/data.db` and a
second file, `data/cache.sqlite`, and one it built on a kind cluster with Prisma's `prisma/dev.db` (`.env`:
`DATABASE_URL="file:./dev.db"`). Podman, Lando and Docksal take the same runtime layer's `ddev exec`
and were not run yet.

How each is reached:

| Runtime | The file is opened | The console |
| --- | --- | --- |
| DDEV | PHP in the web container, with `ddev exec` (SQLite 3.40 in DDEV's image) | `ddev exec sqlite3`, with a prompt (in a screen session too: `script` gives it a terminal of its own) |
| Docker Compose, Podman, Kubernetes, Lando, Docksal (a project the Workspace built there) | PHP in the web container, through the runtime layer's `ddev exec` (the php stack's image: PHP 8.3, SQLite 3.46) | Not yet |

## What does not fit yet

- **The console off DDEV.** The runtime layer's web image has PHP's SQLite3 but no sqlite3 client, so the menu says
  so in its place, and `--query` answers instead.
- **A web admin.** Adminer opens a SQLite file only from the add-on's releases for DDEV 1.24.10 and later, and only
  with a login of its own set up for it; on other runtimes the core cannot declare a service for a project yet.
- **A compose file, a Landofile or a `.docksal/` of the project's own.** The tool knows no web container to open the
  file in there, so their files get no section.
- **Copies of one file only, in the import form.** The form lists every SQLite copy of the project; each copy's name
  carries its file (`--sqlite--database_database.sqlite--`), so pick the one of the file being replaced.

## What it needs

On the machine: what the core needs (DDEV, and the runtime CLIs of the projects you have). Nothing else: PHP and
sqlite3 run in the project's web container. `ddev` is the core's own need, and off DDEV the runtime layer answers it.

In the workspace (`needs`): a sites folder for the tool (`dev`, `test`, `demos`, `sandboxes` or `projects`; the
first is added when none is there), and the AI folders its items are placed in: `ai-agents`, `ai-skills`,
`ai-commands` and `ai-prompts`. `--with-needs` adds what is missing first.

## The items it carries

Each lands in the folder of its kind, when that folder is an active workspace folder, and is installed into an AI CLI
from there (Claude Code by default):

| What | Lands in | What it is for |
| --- | --- | --- |
| The agent `sqlite-helper` | `ai-agents/` | Says which SQLite files a project keeps and what each holds, lists their tables and sizes, copies a file and checks the copy, and puts one back only when asked |
| The skill `sqlite-database` | `ai-skills/` | Which projects keep SQLite files and where, every entry of the DATABASE menu and its flag, the runtimes, the setting |
| The command `/sqlite-sizes` | `ai-commands/` | `/sqlite-sizes <folder> <project>`: each file's size and its largest tables. Reads only |
| The prompt `sqlite-copy-and-check` | `ai-prompts/` | The launch command of a session that copies a file and checks the copy |

The item bodies are plain Markdown any AI command-line assistant can follow. How they are laid out and checked:
[docs/plugin-items-pattern.md](docs/plugin-items-pattern.md).

## What the package holds

| Path | What it is |
| --- | --- |
| `src/` | `register(api)`: SQLite's engine for `registerDatabase` (`src/lib/engine.ts`): which files, on which runtimes, and what does not fit |
| `commands/cmd-tools-sqlite.sh` | The tool, placed into the sites folders (`__WORKSPACE__` filled in) |
| `scripts/functions/fun-sqlite.sh`, `scripts/args/arg-sqlite.sh` | Its functions (the PHP helper among them) and its arguments, placed under `core/scripts/plugins/sqlite/` |
| `config/plugin.sqlite.settings.yml`, `config/settings.labels.yml` | The settings template and its labels |
| `ai/` | The agent, the skill, the command and the prompt |
| `features/sqlite.feature` | The webship-js scenarios, run by the dashboard's suite and in CI |
| `tests/` | The manifest, the engine, the menu, the tool against scaffolded projects, the PHP helper where PHP is there, the items |

## What comes later

- The console on the runtime layer's projects, once its web image carries sqlite3.
- A web admin for a SQLite file.
- The files of a compose file, a Landofile or a `.docksal/` of the project's own.
- An import form that lists the copies of the file being replaced first.
- A `VACUUM` entry, and the size a file would have after it.

## Develop it

```bash
npm install     # builds dist/ (TypeScript)
npm run lint
npm test        # the manifest, the engine, the menu, the tool's functions against scaffolded projects, the items
```
