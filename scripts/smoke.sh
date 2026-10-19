#!/usr/bin/env bash
# Generic smoke shares seed's resolved credentials and private transport lifetime.
# Anchor to this script's checkout before credentials exist: an unanchored
# smoke/*.hurl would expand in the caller's cwd and hand the secrets file to a
# foreign fixture set (or find none), and a bare `bash smoke.sh` has no slash to
# strip for locating seed.sh. Builtins only: an external dirname that fails
# inside $(...) would silently resolve the root to /. Empty CDPATH because an
# exported CDPATH would resolve the relative `scripts/..` against a foreign
# directory (and echo the result).
case "${BASH_SOURCE[0]}" in */*) smoke_dir="${BASH_SOURCE[0]%/*}" ;; *) smoke_dir=. ;; esac
CDPATH='' cd -- "$smoke_dir/.." || exit $?
source scripts/seed.sh || exit $?
seed_begin || exit $?
seed_account || exit $?
printf 'seed_email=%s\nseed_password=%s\n' "$SEED_EMAIL" "$SEED_PASSWORD" \
  > "$seed_scratch/secrets" || exit $?
seed_transport hurl --test smoke/*.hurl --variable base_url=http://localhost:8080 \
  --secrets-file "$seed_scratch/secrets"
