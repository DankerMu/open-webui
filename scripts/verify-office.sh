#!/usr/bin/env bash
set -euo pipefail
export PYTHON_DOTENV_DISABLED=1
# Builtins only and an empty CDPATH: see scripts/smoke-stub.sh.
case "${BASH_SOURCE[0]}" in */*) script_dir="${BASH_SOURCE[0]%/*}" ;; *) script_dir=. ;; esac
root="$(CDPATH='' cd -- "$script_dir/.." && pwd)"
python="${OFFICE_PYTHON:-$root/.venv/bin/python}"
if ! command -v "$python" >/dev/null 2>&1; then
  printf '%s\n' 'verify-office: missing prerequisite: Office Python interpreter' >&2
  exit 1
fi
CDPATH='' cd -- "$root"
exec "$python" "$root/scripts/verify-office.py" "$@"
