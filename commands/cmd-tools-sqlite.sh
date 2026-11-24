#!/usr/bin/env bash

# Installed by the SQLite plugin (plugins.sh --install sqlite); __WORKSPACE__ is the workspace it was installed into.
#
# The SQLite files of a project of this folder, opened in the project's own web container on the runtime the project
# is on: DDEV by default, Docker Compose, Podman, Kubernetes, Lando or Docksal through the Workspace's runtime layer.
# Their tables and sizes, a copy into the backups folder, a copy put back (the file as it is exported first), and the
# sqlite3 console where the container has the client (DDEV's).
#
#   bash cmd-tools-sqlite.sh <project>                         # what the file is, and what it holds
#   bash cmd-tools-sqlite.sh <project> --list                  # the project's SQLite files
#   bash cmd-tools-sqlite.sh <project> --tables                # the tables, largest first
#   bash cmd-tools-sqlite.sh <project> --export                # a copy into the backups folder
#   bash cmd-tools-sqlite.sh <project> --import <copy>         # replaces the file's database
#   bash cmd-tools-sqlite.sh <project> --file <path> --tables  # another of its files
#   bash cmd-tools-sqlite.sh <project> --help                  # every flag

# Bootstrap.
# Find the workspace tooling from this script, so a fresh clone needs no setup.
WORKSPACE_SCRIPTS="${WORKSPACE_SCRIPTS:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../core/scripts" && pwd)}";
source ${WORKSPACE_SCRIPTS}/bootstrap.sh || exit 1 ;

# Load workspace settings and extra lists.
eval $(parse_yaml ${WORKSPACE_CONFIG}/workspace.__WORKSPACE__.settings.yml);

ARGPARSE_DESCRIPTION="The SQLite files of a __WORKSPACE__ project: tables and sizes, a copy into the backups folder, a copy put back, and the sqlite3 console on DDEV"
# The args file comes with the plugin: core/scripts/plugins/sqlite/ is where plugins.sh --install puts it.
source ${WORKSPACE_SCRIPTS}/plugins/sqlite/args/arg-sqlite.sh || exit 1 ;

shift $#;

sqlite_tool ;
