---
description: The SQLite files of a Webship Workspace project — their size and their largest tables, with cmd-tools-sqlite.sh. Reads only.
argument-hint: <folder> <project>
---

# /sqlite-sizes

How big are the SQLite files of a project of a Webship Workspace (container-based, DDEV by default), and which of
their tables take the room. The SQLite plugin (`@webship.co/workspace-sqlite`) placed the tool used here in the
project's workspace folder; it opens each file in the project's own web container.

The first word is the workspace folder (`dev`, `test`, `sandboxes`, …), the second the project: $ARGUMENTS

```bash
cd ~/workspace/<folder>
bash cmd-tools-sqlite.sh <project> --list                    # the project's SQLite files
bash cmd-tools-sqlite.sh <project> --file <path> --info      # for each: SQLite's version, tables, size, journal mode
bash cmd-tools-sqlite.sh <project> --file <path> --tables    # for each: the tables, largest first
```

Then say, in a few lines:

- each file, where the project keeps it, and the runtime it is opened on;
- its size and its number of tables;
- its five largest tables, with their size (indexes in it) and rows (counted), and which of them hold caches, logs or
  sessions that the app can empty itself;
- when the tool answers that the project keeps no SQLite file, or has no runtime of the Workspace: that, and nothing
  more.

Change nothing: no copy, no import, no `--query` that writes.
