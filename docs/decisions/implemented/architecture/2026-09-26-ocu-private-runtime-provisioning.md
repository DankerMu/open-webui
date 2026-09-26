---
id: 2026-09-26-ocu-private-runtime-provisioning
title: Explicit private runtime provisioning and stop-only retention
kind: architecture
status: implemented
date: 2026-09-26
supersedes: none
references: 2026-09-22-ocu-lifecycle-lock-and-launch-semantics, 2026-09-25-ocu-proxy-only-compose-topology, 2026-09-25-ocu-sandbox-egress-guard, issue-26, issue-33, issue-36, issue-79
---

# Explicit private runtime provisioning and stop-only retention

## Problem

A bootstrap configuration must agree with proxy-only routing and explicit sandbox launch. Selecting historical source/images or omitting replacement-environment fields can produce a valid file that fails deployment or starts an unwanted terminal CLI.

## Decision

Bootstrap requires an operator-selected full source SHA matching the checkout, runtime image references and an HTTP(S) public origin without path, credentials, query, fragment or trailing slash. The public OCU base is that origin plus `/ocu`; authorization uses `http://open-webui:8080/api/v1/ocu/auth` on the control network. The core replacement environment carries `/ocu` and `OCU_SANDBOX_NO_AUTOSTART=1`; no deployment-local source patch implements terminal policy.

The existing production parser validates the explicitly supplied IPv4/CIDR egress list. Unset fails; empty remains deny-all. Control and sandbox networks remain distinct, and gateway publication follows the sandbox network contract.

Root-only provisioning generates separate fresh credentials and distributes one internal token to WebUI, OCU and proxy. Provider credentials stay in their separately supplied protected file. Runtime/admin outputs are mode0600, either pre-existing output causes refusal, and temporary files are removed on exit. Operator inputs must be representable by the existing single-line consumers; unsafe values fail before publication. Version reports exclude credentials. Provisioning is not a two-file transaction or an existing-configuration migration service.

Retention stops managed running sandboxes at the configured continuous-runtime limit without deleting their containers or data. An absent age defaults to168hours; explicit empty is invalid. Stopped workspaces require explicit launch under the lifecycle decision.

## Alternatives considered

- **Historical source/image defaults** — cannot establish that current auth, routing and lifecycle contracts are present.
- **Embedding provider credentials in generated runtime files or reports** — expands the secret distribution boundary without a consumer need.
- **Implicit restart after retention** — defeats explicit stop/launch semantics.
- **Replacing the old terminal patch with another patch** — duplicates the supported no-autostart environment contract.

## Consequences

Operators supply image references, but image provenance and offline materials still require issue33. Existing configurations require deliberate operator migration rather than overwrite. Actual Compose resolution, service startup and168-hour data-preservation acceptance remain issue36; fake CLI evidence does not certify the engine. DNS issue79 remains mandatory before full all-egress readiness.
