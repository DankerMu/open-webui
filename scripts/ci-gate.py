#!/usr/bin/env python3
"""CI gate decisions for .github/workflows/ci.yml (standard library only: these jobs have no venv).

usage:
  ci-gate.py classify --expected-files N   stdin: one '<path>\\t<previous path or empty>' row per PR file
                                            prints 'code=true' or 'code=false' for $GITHUB_OUTPUT
  ci-gate.py verdict                       env NEEDS (the needs context as JSON), EVENT, CODE
                                            exits 1 naming every required job that did not pass
Any other command line exits 2.
"""

from __future__ import annotations

import json
import os
import sys

# Every job `All checks passed` needs; a job missing here or there fails the verdict.
REQUIRED_JOBS = (
    'changes',
    'layer1-fast-checks',
    'layer2-backend-tests',
    'layer2-frontend-tests',
    'layer3-runtime-smoke',
    'layer3-browser',
    'layer4-anti-drift',
    'layer5-secret-scan',
    'lockfile-consistency',
    'layer6-diff-size-guard',
)
# Skipped by design on push events.
PR_ONLY_JOBS = ('lockfile-consistency', 'layer6-diff-size-guard')
# Skipped by design on a docs-only pull request.
CODE_JOBS = ('layer2-backend-tests', 'layer2-frontend-tests', 'layer3-runtime-smoke', 'layer3-browser')


def is_docs(path: str) -> bool:
    # CHANGELOG.md is read at runtime (backend/open_webui/env.py), so it is code.
    if path == 'CHANGELOG.md':
        return False
    if path.startswith(('docs/', 'openspec/')):
        return True
    # Only top-level Markdown: a .md under a code directory may be read by that code.
    return '/' not in path and path.endswith('.md')


def classify(listing: str, expected_files: int) -> bool:
    """True when the code jobs must run. Renames count their old path too."""
    rows = [line.split('\t') for line in listing.splitlines() if line]
    # The pull request files API stops at 3000 entries: an incomplete list is never docs-only.
    if not rows or len(rows) != expected_files:
        return True
    paths = [path for row in rows for path in row if path]
    return not all(is_docs(path) for path in paths)


def failures(needs: dict, event: str, code: str) -> list[str]:
    """Every required job that did not pass. GitHub counts a skipped required check as
    passing, so a skip passes only by design: PR-only jobs on push, code jobs on docs-only PRs."""
    bad = []
    if code not in ('true', 'false'):
        bad.append(f'changes: classification output is {code!r}, expected true or false')
    bad.extend(f'{job}: not a known required job' for job in needs if job not in REQUIRED_JOBS)
    for job in REQUIRED_JOBS:
        if job not in needs:
            bad.append(f'{job}: missing from needs')
            continue
        result = needs[job].get('result')
        if result == 'success':
            continue
        if result == 'skipped':
            if job in PR_ONLY_JOBS and event != 'pull_request':
                continue
            if job in CODE_JOBS and event == 'pull_request' and code == 'false':
                continue
        bad.append(f'{job}: {result}')
    return bad


def usage(message: str) -> int:
    sys.stderr.write(f'ci-gate: {message}\n')
    return 2


def main(argv: list[str]) -> int:
    if len(argv) == 3 and argv[0] == 'classify' and argv[1] == '--expected-files':
        if not argv[2].isdigit():
            return usage(f'--expected-files must be a non-negative integer, got {argv[2]!r}')
        code = classify(sys.stdin.read(), int(argv[2]))
        sys.stdout.write(f'code={"true" if code else "false"}\n')
        return 0
    if argv == ['verdict']:
        try:
            needs = json.loads(os.environ['NEEDS'])
            event, code = os.environ['EVENT'], os.environ['CODE']
        except (KeyError, json.JSONDecodeError) as error:
            return usage(f'verdict needs NEEDS (JSON), EVENT and CODE: {error!r}')
        bad = failures(needs, event, code)
        for line in bad:
            sys.stdout.write(f'::error::{line}\n')
        return 1 if bad else 0
    return usage(f'unknown command line {argv!r}')


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
