Copy the SQLite file of a Webship Workspace project into the backups folder, and check that the copy is whole.

```
claude --permission-mode bypassPermissions """
# A Webship Workspace, container-based (DDEV by default), at ~/workspace/<folder>: the project <project>.
# The SQLite plugin placed cmd-tools-sqlite.sh in that folder: every step below is that tool or a read of its copy.

1. Run `bash cmd-tools-sqlite.sh <project> --list` and say the project's SQLite files. Stop there if it answers that
   the project keeps none, or has no runtime of the Workspace. With several, take the one asked for, or the first.
2. Run `bash cmd-tools-sqlite.sh <project> --file <path> --tables` and keep the number of tables.
3. Run `bash cmd-tools-sqlite.sh <project> --file <path> --export`, and take the path of the copy from what it prints.
4. Check the copy: `gunzip -t <copy>`, then that `gunzip -c <copy> | head -c 15` is "SQLite format 3".
5. Say where the copy is, its size, and whether each check passed. Import nothing, change nothing else.
"""
```

The text between the triple quotes is plain: it can be given to another AI command-line assistant as it is.
