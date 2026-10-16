"""Wait for the qualified DocumentServer entrypoint's final native startup phase."""

import time

from smoke_proxy_support import Fail
from verify_office_processes import wait_ready

NATIVE_FINAL_PHASE = """while :; do
pgrep -P 1 -f '^bash -c find .* [|] xargs tail -F$'
status=$?
case "$status" in
0) exit 0;;
1) sleep 0.1;;
*) exit "$status";;
esac
done"""


def wait_documentserver_ready(origin, container, docker, *, timeout=240):
    deadline = time.monotonic() + timeout

    def http_ready(label, path):
        try:
            wait_ready(origin + path, None, timeout=max(0, deadline - time.monotonic()))
        except Fail as error:
            raise Fail(f'DocumentServer {label} readiness: {error}') from None

    http_ready('healthcheck', '/healthcheck')
    http_ready('PPTX slide theme asset', '/sdkjs/slide/themes/themes.js')
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise Fail('DocumentServer native initialization readiness: shared deadline exceeded')
    try:
        # This immutable entrypoint starts its log follower only after cache/font restarts.
        pids = docker('exec', container, '/bin/sh', '-c', NATIVE_FINAL_PHASE, timeout=remaining).splitlines()
    except Fail as error:
        raise Fail(f'DocumentServer native initialization readiness: {error}') from None
    if len(pids) != 1 or not pids[0].isdigit():
        raise Fail('DocumentServer native initialization readiness: ambiguous final startup phase')
    http_ready('final healthcheck', '/healthcheck')
