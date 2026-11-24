#!/usr/bin/env bash

# SQLite, the light database, for the Webship Workspace (@webship.co/workspace-sqlite, an engine of
# @webship.co/workspace-database): the SQLite files of a project, opened in the project's own web container.
#
# A SQLite database is a file of the project, and every runtime the Workspace runs mounts the project into the web
# container: DDEV at /var/www/html, the runtime layer's Docker Compose, Podman and Kubernetes too, Lando at /app,
# Docksal at /var/www. There PHP's SQLite3 (in every one of those images) lists the tables and copies the file through
# SQLite's own backup, which makes a consistent copy while the app writes; `ddev exec` reaches the container on each
# runtime. The sqlite3 client gives the console where the container has one (DDEV's web image). A small PHP helper is
# written into the project for one run, and removed after it. Nothing here is a person's.

# The places the frameworks keep their SQLite file, relative to the project (the base package reads the same ones).
SQLITE_DB_PLACES=(database/database.sqlite .tmp/data.db db.sqlite3 payload.db prisma/dev.db var/data.db storage/development.sqlite3 db/development.sqlite3 content/data/ghost-local.db content/data/ghost-dev.db content/data/ghost.db instance/app.db)

# Folders a SQLite file is often kept in, looked into without going deeper.
SQLITE_DB_FOLDERS=(. database data db storage var .tmp prisma instance content/data)

# The runtimes, as people write them.
function sqlite_runtime_title() {
  case "$1" in
    ddev) echo 'DDEV' ;; docker) echo 'Docker Compose' ;; podman) echo 'Podman' ;; kubernetes) echo 'Kubernetes' ;;
    lando) echo 'Lando' ;; docksal) echo 'Docksal' ;; *) echo "$1" ;;
  esac
}

# Is a file a SQLite database: its header, or an empty file where a framework names one (Laravel starts with one)?
function sqlite_is_db() {
  local f="$1" empty_ok="${2:-}" ;
  [ -f "${f}" ] || return 1 ;
  [ -s "${f}" ] || { [ -n "${empty_ok}" ] ; return $? ; } ;
  [ "$(head -c 15 "${f}" 2> /dev/null)" = 'SQLite format 3' ] ;
}

# What a project's .env names: Laravel's DB_DATABASE (with DB_CONNECTION=sqlite), Strapi's DATABASE_FILENAME, a
# file: or sqlite:/// URL. One path a line, as the file has it.
function sqlite_from_env() {
  local env="$1/.env" ;
  [ -f "${env}" ] || return 0 ;
  python3 - "${env}" "$1" 2> /dev/null <<'PY'
import os, re, sys
env, root = sys.argv[1], sys.argv[2]
vals = {}
for line in open(env, encoding='utf-8', errors='replace'):
    m = re.match(r'\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$', line)
    if m:
        vals[m.group(1)] = re.sub(r'^([\'"])(.*)\1$', r'\2', m.group(2))
out = []
if vals.get('DB_CONNECTION', '').lower() == 'sqlite' and vals.get('DB_DATABASE'): out.append(vals['DB_DATABASE'])
if vals.get('DATABASE_CLIENT', '').lower() == 'sqlite' and vals.get('DATABASE_FILENAME'): out.append(vals['DATABASE_FILENAME'])
for key in ('DATABASE_URL', 'DATABASE_URI'):
    v = vals.get(key, '')
    m = re.match(r'(?i)^file:(.+)$', v)
    if m:
        out.append(os.path.join('prisma', m.group(1)) if key == 'DATABASE_URL' and os.path.isdir(os.path.join(root, 'prisma')) else m.group(1))
        continue
    m = re.match(r'(?i)^sqlite:///(.+)$', v)
    if m: out.append(re.sub(r'^%kernel\.project_dir%/', '', m.group(1)))
for p in out: print(p)
PY
}

# A path a project gives, relative to the project: one in the container's project folder (/var/www/html, /app,
# /var/www) is the project's; one out of the project is none.
function sqlite_relative() {
  local dir="$1" p="$2" ;
  p="${p#/var/www/html/}" ; p="${p#/app/}" ; p="${p#/var/www/}" ;
  case "${p}" in /*) case "${p}" in "${dir}"/*) p="${p#${dir}/}" ;; *) return 1 ;; esac ;; esac
  p="$(python3 -c 'import os,sys; print(os.path.normpath(sys.argv[1]))' "${p}")" ;
  case "${p}" in ..|../*) return 1 ;; esac
  echo "${p#./}" ;
}

# The SQLite files of a project, relative to it, the named ones first: what .env names, the places the frameworks
# use, a Drupal site's sites/<site>/files/.ht.sqlite, and the SQLite files of a few folders (one level, never deeper).
function sqlite_files() {
  local dir="$1" p rel f seen="|" n=0 ;
  local -a named=() ;
  while read -r p ; do rel="$(sqlite_relative "${dir}" "${p}")" && named+=("${rel}") ; done < <(sqlite_from_env "${dir}") ;
  sqlite_take() {
    [ "${n}" -lt 8 ] || return 0 ;
    case "${seen}" in *"|$1|"*) return 0 ;; esac
    sqlite_is_db "${dir}/$1" "$2" || return 0 ;
    seen="${seen}$1|" ; n=$(( n + 1 )) ; echo "$1" ;
  }
  for rel in "${named[@]}" ; do sqlite_take "${rel}" yes ; done
  for rel in "${SQLITE_DB_PLACES[@]}" ; do sqlite_take "${rel}" yes ; done
  for f in "${dir}"/{web,docroot,.}/sites/*/files/.ht.sqlite ; do [ -f "${f}" ] && sqlite_take "$(sqlite_relative "${dir}" "${f}")" ; done
  for p in "${SQLITE_DB_FOLDERS[@]}" ; do
    for f in "${dir}/${p}"/*.sqlite "${dir}/${p}"/*.sqlite3 "${dir}/${p}"/*.db "${dir}/${p}"/*.db3 ; do
      [ -f "${f}" ] && sqlite_take "$(sqlite_relative "${dir}" "${f}")" ;
    done
  done
  unset -f sqlite_take ;
}

# The runtime whose web container opens the project's files: DDEV, or one of the runtime layer; nothing for a project
# with neither (a compose file of its own has no container the Workspace knows to open a file in).
function sqlite_runtime() {
  local dir="$1" found="" ;
  if declare -f rt_find_project > /dev/null ; then found="$(rt_find_project "${dir}" 2> /dev/null)" || found="" ; fi
  [ -n "${found}" ] && [ "${found#* }" != "${dir}" ] && found="" ;
  [ -z "${found}" ] && [ -f "${dir}/.ddev/config.yaml" ] && found="ddev ${dir}" ;
  [ -n "${found}" ] || return 1 ;
  case "${found%% *}" in
    ddev) echo ddev ;;
    *) [ -n "$(rt_meta runtime "${dir}")" ] || return 1 ; echo "${found%% *}" ;;
  esac
}

# Where the project's SQLite file is, as `<runtime>|<file>`: the file asked for (--file), else the first one found;
# or why there is none, on stderr.
function sqlite_locate() {
  local dir="$1" want="${2:-}" rt files ;
  [ "${want}" = '_none_' ] && want="" ;
  rt="$(sqlite_runtime "${dir}")" || { echo "${PROJECT_NAME} has no runtime of the Workspace (DDEV, or a project its runtime layer built): no container to open its SQLite files in." >&2 ; return 1 ; } ;
  if [ -n "${want}" ] ; then
    want="$(sqlite_relative "${dir}" "${want}")" || { echo "${2} is not a file of ${PROJECT_NAME}." >&2 ; return 1 ; } ;
    sqlite_is_db "${dir}/${want}" yes || { echo "${want} of ${PROJECT_NAME} is not a SQLite database." >&2 ; return 1 ; } ;
    echo "${rt}|${want}" ; return 0 ;
  fi
  files="$(sqlite_files "${dir}" | head -1)" ;
  [ -n "${files}" ] || { echo "${PROJECT_NAME} keeps no SQLite file the tool knows of: name one with --file <path>." >&2 ; return 1 ; } ;
  echo "${rt}|${files}" ;
}

# The PHP helper, written into the project for one run in its web container.
function sqlite_helper() {
  cat <<'PHP'
<?php
// Written by the Webship Workspace's SQLite plugin (cmd-tools-sqlite.sh) for one run in the project's web container,
// and removed by it after the run: it opens a SQLite file of the project with PHP's SQLite3.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
if (!class_exists('SQLite3')) { fwrite(STDERR, "The PHP of this container has no SQLite3 extension.\n"); exit(3); }
[$op, $file] = [$argv[1] ?? '', $argv[2] ?? ''];
if ($file === '' || !is_file($file)) { fwrite(STDERR, "No such SQLite file: $file\n"); exit(2); }
function open_db(string $f, bool $write = false): SQLite3 {
  try { $db = new SQLite3($f, $write ? SQLITE3_OPEN_READWRITE : SQLITE3_OPEN_READONLY); }
  catch (Throwable $e) { $db = new SQLite3($f, SQLITE3_OPEN_READWRITE); }
  $db->enableExceptions(true);
  $db->busyTimeout(10000);
  return $db;
}
function q(string $n): string { return '"' . str_replace('"', '""', $n) . '"'; }
function human(?int $b): string {
  if ($b === null) return '';
  $u = ['B', 'KB', 'MB', 'GB']; $i = 0; $v = $b;
  while ($v >= 1024 && $i < 3) { $v /= 1024; $i++; }
  return ($i ? ($v < 10 ? number_format($v, 1) : (string) round($v)) : (string) $v) . ' ' . $u[$i];
}
// A table the way the database clients print one: numbers and sizes to the right, the rest to the left.
function show(array $head, array $rows): void {
  $w = array_map('mb_strlen', $head);
  foreach ($rows as $r) foreach (array_values($r) as $i => $c) $w[$i] = max($w[$i], mb_strlen((string) $c));
  $cell = function ($c, int $i, bool $isHead) use ($w): string {
    $c = (string) $c;
    $right = !$isHead && (is_numeric($c) || preg_match('/^[0-9.]+ (B|KB|MB|GB)$/', $c));
    return str_pad($c, $w[$i] + strlen($c) - mb_strlen($c), ' ', $right ? STR_PAD_LEFT : STR_PAD_RIGHT);
  };
  $line = fn(array $cells, bool $isHead = false) => '| ' . implode(' | ', array_map(fn($c, $i) => $cell($c, $i, $isHead), array_values($cells), array_keys(array_values($cells)))) . ' |';
  $bar = '+' . implode('+', array_map(fn($x) => str_repeat('-', $x + 2), $w)) . '+';
  echo $bar, "\n", $line($head, true), "\n", $bar, "\n";
  foreach ($rows as $r) echo $line($r), "\n";
  echo $bar, "\n";
}
function tables(SQLite3 $db): array {
  $out = [];
  $r = $db->query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  while ($row = $r->fetchArray(SQLITE3_NUM)) $out[] = $row[0];
  return $out;
}
// The bytes of each table with its indexes, from SQLite's dbstat table where it has one; none where it has not.
function sizes(SQLite3 $db): array {
  $owner = [];
  $r = $db->query("SELECT name, tbl_name FROM sqlite_master WHERE type IN ('table', 'index')");
  while ($row = $r->fetchArray(SQLITE3_NUM)) $owner[$row[0]] = $row[1];
  $out = [];
  try {
    $r = $db->query('SELECT name, SUM(pgsize) FROM dbstat GROUP BY name');
    while ($row = $r->fetchArray(SQLITE3_NUM)) { $t = $owner[$row[0]] ?? $row[0]; $out[$t] = ($out[$t] ?? 0) + (int) $row[1]; }
  } catch (Throwable $e) { return []; }
  return $out;
}
try {
  switch ($op) {
    case 'tables':
      $db = open_db($file);
      $sz = sizes($db);
      $rows = [];
      foreach (tables($db) as $t) $rows[] = [$t, (int) $db->querySingle('SELECT COUNT(*) FROM ' . q($t)), $sz[$t] ?? null];
      usort($rows, fn($a, $b) => (($b[2] ?? 0) <=> ($a[2] ?? 0)) ?: strcmp($a[0], $b[0]));
      if (($argv[3] ?? '') === 'tsv') { foreach ($rows as $r) echo $r[0], "\t", $r[1], "\t", $r[2] ?? '', "\n"; break; }
      if ($rows) show(['Table', 'Rows', 'Size'], array_map(fn($r) => [$r[0], $r[1], human($r[2])], $rows));
      else echo "The database has no tables yet.\n";
      $bytes = (int) $db->querySingle('PRAGMA page_size') * (int) $db->querySingle('PRAGMA page_count');
      show(['Tables', 'The file'], [[count($rows), human($bytes)]]);
      break;
    case 'info':
      $db = open_db($file);
      $bytes = (int) $db->querySingle('PRAGMA page_size') * (int) $db->querySingle('PRAGMA page_count');
      show(['SQLite', 'Tables', 'Size', 'Page size', 'Journal', 'Encoding'], [[
        SQLite3::version()['versionString'], count(tables($db)), human($bytes), (int) $db->querySingle('PRAGMA page_size'),
        $db->querySingle('PRAGMA journal_mode'), $db->querySingle('PRAGMA encoding'),
      ]]);
      break;
    case 'query':
      $db = open_db($file, true);
      $r = $db->query($argv[3] ?? '');
      if ($r && $r->numColumns() > 0) {
        $head = []; for ($i = 0; $i < $r->numColumns(); $i++) $head[] = $r->columnName($i);
        $rows = []; while ($row = $r->fetchArray(SQLITE3_NUM)) $rows[] = array_map(fn($c) => $c === null ? 'NULL' : $c, $row);
        show($head, $rows);
      } else {
        echo $db->changes(), " row(s) changed.\n";
      }
      break;
    case 'backup':
      // SQLite's own backup: a consistent copy, while the app reads and writes.
      $src = open_db($file);
      $dst = new SQLite3($argv[3]);
      if (!$src->backup($dst)) { fwrite(STDERR, "The copy failed.\n"); exit(1); }
      $dst->close();
      echo "copied\n";
      break;
    case 'restore':
      // The copy back into the file, through the same backup: the app's connections see the new database. A copy
      // SQLite finds damaged is refused, and the file stays as it is.
      $src = open_db($argv[3]);
      $check = (string) $src->querySingle('PRAGMA quick_check');
      if ($check !== 'ok') { fwrite(STDERR, "The copy is damaged ($check): nothing was imported.\n"); exit(1); }
      $dst = open_db($file, true);
      if (!$src->backup($dst)) { fwrite(STDERR, "The copy back failed.\n"); exit(1); }
      echo "restored\n";
      break;
    default:
      fwrite(STDERR, "No such operation: $op\n");
      exit(2);
  }
} catch (Throwable $e) {
  fwrite(STDERR, $e->getMessage() . "\n");
  exit(1);
}
PHP
}

# PHP with the helper, in the project's web container (`ddev exec`, which the runtime layer gives its meaning off
# DDEV), from the project's folder. The helper is a file of the project for that run only.
function sqlite_php() {
  local helper=".webship-sqlite-$$.php" rc ;
  sqlite_helper > "${helper}" || return 1 ;
  ddev exec "php $(printf '%q ' "${helper}" "$@")" ;
  rc=$? ;
  rm -f "./${helper:?}" ;
  return ${rc} ;
}

# A file's name in an export's name: database/database.sqlite is database_database.sqlite.
function sqlite_slug() {
  local s="${1#./}" ; s="${s##.}" ; s="$(printf '%s' "${s}" | tr -c 'A-Za-z0-9._-' '_' | tr -s '_' | sed 's/\.\.*/./g; s/^[._]*//; s/[._]*$//')" ;
  echo "${s:-db}" | cut -c1-60 ;
}

# --info: the file, where it is opened, and what it holds.
function sqlite_info() {
  echo "Project:   ${doc_name}/${PROJECT_NAME}" ;
  echo "Database:  SQLite, the file ${SQLITE_DB_FILE} ($(du -h "${SQLITE_DB_FILE}" | cut -f1) on disk), opened in the web container of $(sqlite_runtime_title "${SQLITE_DB_RUNTIME}")" ;
  local others ; others="$(sqlite_files "$PWD" | grep -vxF "${SQLITE_DB_FILE}" | paste -sd, - | sed 's/,/, /g')" ;
  [ -n "${others}" ] && echo "Its other SQLite files (--file <path>): ${others}" ;
  sqlite_php info "${SQLITE_DB_FILE}" || return 1 ;
  echo "A client on this machine opens ${PWD}/${SQLITE_DB_FILE}: stop the app first if it writes." ;
}

# --tables: the tables, largest first. With --tsv: name, rows and bytes, separated by tabs.
function sqlite_tables() {
  if [ "${TSV}" = yes ] ; then sqlite_php tables "${SQLITE_DB_FILE}" tsv ; else sqlite_php tables "${SQLITE_DB_FILE}" ; fi
}

# This project's copies past the keep: setting go, the oldest first; never the copy an import is putting back
# (SQLITE_KEEP_SPARE).
function sqlite_keep() {
  local keep="${plugin_sqlite_keep:-0}" dir="${backups}/${doc_name}" old spare="" ;
  [[ "${keep}" =~ ^[0-9]+$ ]] && [ "${keep}" -gt 0 ] || return 0 ;
  [ -n "${SQLITE_KEEP_SPARE:-}" ] && spare="$(cd "$(dirname "${SQLITE_KEEP_SPARE}")" 2> /dev/null && pwd)/$(basename "${SQLITE_KEEP_SPARE}")" ;
  ls -1t "${dir}/${PROJECT_NAME}--sqlite--"*.sqlite.gz 2> /dev/null | tail -n +$(( keep + 1 )) | while read -r old ; do
    [ -n "${spare}" ] && [ "$(cd "$(dirname "${old}")" && pwd)/$(basename "${old}")" = "${spare}" ] && continue ;
    rm -f "${old:?}" && echo "Removed an older copy (keep: ${keep}): $(basename "${old}")" ;
  done
}

# --export: a copy of the file into the backups folder (or --to). $1: the file ('' for the backups folder), $2: what
# it is for.
function sqlite_export() {
  local file="$1" what="${2:-}" tmp=".webship-sqlite-export-$$.sqlite" ;
  if [ -z "${file}" ] ; then
    mkdir -p "${backups}/${doc_name}" || return 1 ;
    file="${backups}/${doc_name}/${PROJECT_NAME}--sqlite--$(sqlite_slug "${SQLITE_DB_FILE}")--${what:+${what}--}$(date -u +%Y-%m-%d-%H-%M-%S).sqlite.gz" ;
  fi
  case "${file}" in *.sqlite.gz) ;; *) echo "An export is a .sqlite.gz file: ${file}" ; return 1 ;; esac
  echo "Copying the SQLite file ${SQLITE_DB_FILE} of ${PROJECT_NAME} ($(sqlite_runtime_title "${SQLITE_DB_RUNTIME}")) to ${file}" ;
  rm -f "./${tmp:?}" ;
  sqlite_php backup "${SQLITE_DB_FILE}" "${tmp}" > /dev/null && sqlite_is_db "${tmp}" yes \
    || { rm -f "./${tmp:?}" ; echo "The copy failed." ; return 1 ; } ;
  gzip -c "${tmp}" > "${file}" || { rm -f "./${tmp:?}" "${file:?}" ; echo "The copy could not be written." ; return 1 ; } ;
  rm -f "./${tmp:?}" ;
  echo "Exported: ${file} ($(du -h "${file}" | cut -f1))" ;
  sqlite_keep ;
}

# --import <copy>: the file as it is, exported first; then the copy put back into it, through SQLite's backup.
function sqlite_import() {
  local src="$1" tmp=".webship-sqlite-import-$$.sqlite" ;
  case "${src}" in /*) ;; *) src="${current_path:-$PWD}/${src}" ;; esac
  [ -f "${src}" ] || { echo "No such file: ${src}" ; return 1 ; } ;
  case "${src}" in *.sqlite|*.sqlite3|*.db|*.db3|*.sqlite.gz|*.sqlite3.gz|*.db.gz|*.db3.gz) ;; *) echo "A copy of a SQLite file is a .sqlite, .sqlite3, .db or .db3 file, or one of those gzipped: ${src}" ; return 1 ;; esac
  # The copy is read whole, and checked, before anything else: the file is replaced only by a copy that is all there.
  rm -f "./${tmp:?}" ;
  case "${src}" in
    *.gz) gunzip -c "${src}" > "${tmp}" || { rm -f "./${tmp:?}" ; echo "$(basename "${src}") could not be read whole (gzip): nothing was imported." ; return 1 ; } ;;
    *) cp "${src}" "${tmp}" || { rm -f "./${tmp:?}" ; echo "$(basename "${src}") could not be read: nothing was imported." ; return 1 ; } ;;
  esac
  sqlite_is_db "${tmp}" yes || { rm -f "./${tmp:?}" ; echo "$(basename "${src}") is not a SQLite database: nothing was imported." ; return 1 ; } ;
  if [ "${NO_SAFETY_EXPORT}" != yes ] ; then
    SQLITE_KEEP_SPARE="${src}" sqlite_export '' before-import || { rm -f "./${tmp:?}" ; echo "The export of the file as it is failed: nothing was imported." ; return 1 ; } ;
  fi
  echo "Putting $(basename "${src}") back into ${SQLITE_DB_FILE} of ${PROJECT_NAME} ($(sqlite_runtime_title "${SQLITE_DB_RUNTIME}"))" ;
  sqlite_php restore "${SQLITE_DB_FILE}" "${tmp}" > /dev/null || { rm -f "./${tmp:?}" ; echo "The import failed." ; return 1 ; } ;
  rm -f "./${tmp:?}" ;
  echo "Imported $(basename "${src}")." ;
  [ "${NO_SAFETY_EXPORT}" != yes ] && echo "The file as it was is the before-import export above, in ${backups}/${doc_name}." ;
  return 0 ;
}

# A command with a terminal of its own, when its input is a terminal and its output is not: a screen session of the
# dashboard logs what a command prints through a pipe, and a client with no terminal shows no prompt. util-linux's
# script gives it one; anywhere else the command runs as it is.
function sqlite_with_terminal() {
  if [ -t 0 ] && [ ! -t 1 ] && script --version 2> /dev/null | grep -q util-linux ; then
    script -qefc "$(printf '%q ' "$@")" /dev/null ;
  else
    "$@" ;
  fi
}

# --console: sqlite3 on the file, in the project's web container: DDEV's has the client.
function sqlite_console() {
  if [ "${SQLITE_DB_RUNTIME}" != ddev ] ; then
    echo "The sqlite3 console: the web container of $(sqlite_runtime_title "${SQLITE_DB_RUNTIME}") has no sqlite3 client yet (DDEV's has). --tables, --query, --export and --import work here." ;
    return 1 ;
  fi
  sqlite_with_terminal ddev exec sqlite3 -header -column "${SQLITE_DB_FILE}" ;
}

# The tool: one action on a SQLite file of a project of this workspace folder.
function sqlite_tool() {
  declare -f trim_project_name > /dev/null && trim_project_name ;
  local dir="${WORKSPACE_ROOT}/${doc_name}/${PROJECT_NAME}" where ;
  [ -d "${dir}" ] || { echo "No such project: ${doc_name}/${PROJECT_NAME}" ; return 1 ; } ;
  dir="$(cd "${dir}" && pwd)" ;
  where="$(sqlite_locate "${dir}" "${FILE:-}")" || return 1 ;
  IFS='|' read -r SQLITE_DB_RUNTIME SQLITE_DB_FILE <<< "${where}" ;
  cd "${dir}" || return 1 ;
  case ":${PATH}:" in *":${HOME}/.local/bin:"*) ;; *) [ -d "${HOME}/.local/bin" ] && PATH="${PATH}:${HOME}/.local/bin" ;; esac
  if [ "${CONSOLE}" = yes ] ; then sqlite_console ;
  elif [ "${TABLES}" = yes ] ; then sqlite_tables ;
  elif [ "${EXPORT}" = yes ] ; then sqlite_export "$( [ "${TO:-_none_}" = '_none_' ] || echo "${TO}" )" ;
  elif [ "${IMPORT:-_none_}" != '_none_' ] ; then sqlite_import "${IMPORT}" ;
  elif [ "${QUERY:-_none_}" != '_none_' ] ; then sqlite_php query "${SQLITE_DB_FILE}" "${QUERY}" ;
  elif [ "${LIST}" = yes ] ; then sqlite_files "${dir}" ;
  else sqlite_info ; fi
}
