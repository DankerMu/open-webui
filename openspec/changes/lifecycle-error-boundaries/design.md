# Design

## Context

At OCU baseline `74f4b92b8764758c6156b40b3de9d90e4f66e4c2`, initial launch lookup maps DockerException to LaunchFailed(500, `engine lookup failed: ...`). Get/create and describe call the same raw lookup without that mapping. Launch preparation has four call sites and restarting readiness reloads in both its loop and final check. Other post-lookup reloads and retirement are explicitly outside #306.

## Goals / Non-Goals

Invariant: a Docker failure at a named request-lifecycle operation reaches its existing typed error consumer, without fabricating absence, continuing later engine actions or widening unrelated exception boundaries.

Must preserve: raw lookup for maintenance/publish/reaper callers; containers.get NotFound returning absence; reload NotFound remaining a failure rather than absence; initial launch500 mapping/message/cause; network NotFound/APIError categories and existing409 incompatibility; restart timeout504; paused migration guard; PR78 retirement409/order; lock and credential-context cleanup.

Non-goals: a general engine audit, creation/post-start verification/unpause-reload error changes, HTTP envelope flattening, MCP catch changes, WebUI never_created parsing, startup-test repair, automatic retry/rollback, dependencies, Docker images or LAN deployment.

## Decisions

Extract the existing initial-launch lookup translation into one small private Docker-error adapter that invokes a supplied step and catches only DockerException. Use it only at get/create lookup, describe lookup, initial launch lookup, the four existing launch preparation calls and the restarting readiness call. The existing lookup stage retains `engine lookup failed: ...`, status500, reason and cause. The raw lookup implementation and all other callers remain unchanged. This shares one error policy without adding an error class, retry framework or dynamic operation registry.

Keep all preparation calls in place, preserving the paused-migration precondition, mutate flags and action order instead of rearranging the launch state machine. Protect the restarting readiness call separately, covering polling and final reload but excluding subsequent retirement. New messages identify network preparation or restart readiness; status500/reason launch_failed and exception causes use the existing class.

Specific errors already converted to LifecycleError bypass these Docker-only catches. A preparation failure can occur after disconnect/connect mutations: preserve those existing effects and stop later launch actions, without claiming atomic preparation or adding rollback. Do not reuse \_verify_started_container as a wrapper: its rollback-stop behavior belongs to another boundary.

MCP production code remains unchanged: real tool invocation must return its existing `Error: <lifecycle message>` path (sub_agent's generic fallback is observably different). HTTP remains FastAPI's existing nested `{"detail":{"detail":message,"reason":reason}}`; tests assert that actual envelope, not a top-level-reason stub.

Add tests in a focused module instead of growing the oversized lifecycle/network suites; reuse their world/app fixtures without copying engine doubles. The app fixture owns a single-use MCP manager and class-identity rebinding; every added patch is restored through monkeypatch. Do not change production or test helpers merely to obtain green. Keep necessary production growth confined to the named guards; do not perform unrelated line-count refactoring in OCU's review-only size/complexity scope.

Sibling surfaces: the five MCP get/create consumers, internal describe/launch response helpers, raw lookup consumers, specific network/repair errors, restarting timeout, paused migration admission and sleeper retirement. References: docker_manager.py lookup1024–1054, network726–768/repair862–899, launch1793–1848; app.py1137–1163; test_lifecycle.py304–367 fixture ownership.

## Verification / Rollback

Use two vertical slices: lookup normalization RED→GREEN, then preparation/readiness RED→GREEN. Parent captures source/test hashes and base at execution, then runs all new cases with unchanged lifecycle/network regression controls. Test ordinal2 reload as readiness, not initial lookup; force the final-check path independently. Include a late preparation fault with expected partial membership but no subsequent start/delete or invented rollback.

Parent probes exercise actual service and MCP/HTTP consumers. A controlled missing-socket Docker SDK lookup can supplement injected-engine cases without contacting a real daemon; it is not a live-engine failure reproduction. Use isolated empty data, private HOME/DOCKER_CONFIG for any real SDK client, explicit private synthetic credentials and bounded fresh-process app lifetimes. Do not rely on the health-only startup test (#468) as proof that unmocked startup never contacts Docker. Preserve full probe code, hashes, outputs and cleanup.

Update the existing lifecycle decision after smoke proof. No migration or dependency change. Rollback reverts this focused source/tests/decision change; qualified image pins remain unchanged.
