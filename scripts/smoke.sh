#!/usr/bin/env bash
# Generic smoke shares seed's resolved credentials and private transport lifetime.
source "${BASH_SOURCE[0]%/*}/seed.sh" || exit $?
seed_begin || exit $?
seed_account || exit $?
printf 'seed_email=%s\nseed_password=%s\n' "$SEED_EMAIL" "$SEED_PASSWORD" \
  > "$seed_scratch/secrets" || exit $?
seed_transport hurl --test smoke/*.hurl --variable base_url=http://localhost:8080 \
  --secrets-file "$seed_scratch/secrets"
