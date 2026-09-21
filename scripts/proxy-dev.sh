#!/usr/bin/env bash
# scripts/proxy-dev.sh — start the OCU overlay proxy against the harness + stub.
# Missing checkout, deploy/proxy/ config, or nginx/caddy is a named failure (never a skip).
set -euo pipefail
script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
if [ -z "${OCU_CHECKOUT:-}" ]; then
  OCU_CHECKOUT="$repo_root/../open-computer-use"
fi
proxy_dir="$OCU_CHECKOUT/deploy/proxy"

if [ ! -d "$OCU_CHECKOUT" ]; then
  echo "proxy-dev: missing OCU checkout: $OCU_CHECKOUT" >&2
  exit 2
fi
if [ ! -d "$proxy_dir" ]; then
  echo "proxy-dev: missing proxy config directory: $proxy_dir" >&2
  exit 2
fi

config=""
if [ -f "$proxy_dir/nginx.conf" ]; then
  config="$proxy_dir/nginx.conf"
elif [ -f "$proxy_dir/Caddyfile" ]; then
  config="$proxy_dir/Caddyfile"
else
  for f in "$proxy_dir"/*.conf; do
    if [ -f "$f" ]; then config="$f"; break; fi
  done
fi
if [ -z "$config" ]; then
  echo "proxy-dev: missing proxy config in $proxy_dir (expected nginx.conf, Caddyfile, or *.conf)" >&2
  exit 2
fi

nginx_bin="$(command -v nginx || true)"
caddy_bin="$(command -v caddy || true)"
if [ -z "$nginx_bin" ] && [ -z "$caddy_bin" ]; then
  echo "proxy-dev: missing proxy binary: nginx or caddy" >&2
  exit 2
fi

config_base="$(basename "$config")"
if [ "$config_base" = "Caddyfile" ]; then
  if [ -z "$caddy_bin" ]; then
    echo "proxy-dev: missing proxy binary: caddy" >&2
    exit 2
  fi
  exec "$caddy_bin" run --config "$config"
fi
if [ -z "$nginx_bin" ]; then
  echo "proxy-dev: missing proxy binary: nginx" >&2
  exit 2
fi
config_abs="$(cd "$(dirname "$config")" && pwd)/$(basename "$config")"
exec "$nginx_bin" -c "$config_abs" -g 'daemon off;'
