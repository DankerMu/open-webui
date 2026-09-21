# Design

Change surface: `scripts/ocu-stub.py`, `scripts/proxy-dev.sh`, stub-only smoke under `smoke/stub/` or `scripts/` (never `smoke/*.hurl`).
Must preserve: `make smoke` glob and CI layer3 smoke without a proxy/OCU checkout.
Must add/change: in-process HTTP stub with fixture chat states; launcher that names missing `OCU_CHECKOUT` / `deploy/proxy/` / proxy binary and exits non-zero.
Governing invariant: the stub never talks to Docker or a real OCU; missing overlay config is a named failure, never a skip.
Sibling surfaces: WebUI describe/launch routes (already map OcuUnreachable); later proxy allowlist (#22); `make smoke-proxy` (#23).
Seams under test: stub HTTP (describe/launch/files/outputs/header echo); launcher argv/env missing-prereq.
Required evidence: GET describe `running` fixture → 200 with that state; POST launch on `stopped` → subsequent describe `running`; GET `/files/{id}/page.html` → HTML fixture; launcher with `OCU_CHECKOUT=/no/such` → non-zero and stderr contains the path.
Non-goals: overlay nginx (#22); `make smoke-proxy` / CI checkout pin (#23); WebUI route changes.
Review focus: no Docker; header echo does not leak a real token into fixtures; launcher fail-loud; `make smoke` unaffected.
