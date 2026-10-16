#!/usr/bin/env bash
set -euo pipefail
export PYTHON_DOTENV_DISABLED=1
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
python="${OFFICE_PYTHON:-$root/.venv/bin/python}"
if ! command -v "$python" >/dev/null 2>&1; then
  printf '%s\n' 'verify-office: missing prerequisite: Office Python interpreter' >&2
  exit 1
fi
cd "$root"
exec "$python" "$root/scripts/verify-office.py" "$@"
