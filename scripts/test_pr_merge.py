import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).with_name('pr-merge.py')
REPO = 'DankerMu/open-webui'
HEAD = 'a' * 40
BODY_107 = '<!-- intended-closing-issues: ["DankerMu/open-webui#107"] -->'
BODY_107_389 = '<!-- intended-closing-issues: ["DankerMu/open-webui#107", "DankerMu/open-webui#389"] -->'


def page(body='<!-- intended-closing-issues: [] -->', issues=(), *, cursor=None, more=False):
    return {
        'data': {
            'repository': {
                'nameWithOwner': REPO,
                'pullRequest': {
                    'id': 'PR_fixture_389',
                    'number': 389,
                    'url': 'https://github.com/DankerMu/open-webui/pull/389',
                    'state': 'OPEN',
                    'headRefOid': HEAD,
                    'body': body,
                    'closingIssuesReferences': {
                        'nodes': [{'number': number, 'repository': {'nameWithOwner': repo}} for repo, number in issues],
                        'pageInfo': {'hasNextPage': more, 'endCursor': cursor},
                    },
                },
            }
        }
    }


def run_guard(tmp_path, responses, *flags, repo=REPO, pr='389', head=HEAD):
    assert SCRIPT.is_file(), 'missing capability: scripts/pr-merge.py not implemented'
    log = tmp_path / 'gh-log.jsonl'
    fixtures = tmp_path / 'gh-responses.json'
    fixtures.write_text(json.dumps(responses))
    executable = tmp_path / 'gh'
    executable.write_text(
        f'#!{sys.executable}\n'
        'import json, os, pathlib, sys\n'
        'log = pathlib.Path(os.environ["FAKE_GH_LOG"])\n'
        'index = len(log.read_text().splitlines()) if log.exists() else 0\n'
        'with log.open("a") as stream:\n'
        '    stream.write(json.dumps(sys.argv[1:]) + "\\n")\n'
        'responses = json.loads(pathlib.Path(os.environ["FAKE_GH_RESPONSES"]).read_text())\n'
        'if index >= len(responses):\n'
        '    sys.stderr.write("unexpected gh invocation\\n")\n'
        '    sys.exit(99)\n'
        'response = responses[index]\n'
        'sys.stdout.write(response.get("stdout", json.dumps(response.get("json"))))\n'
        'sys.stderr.write(response.get("stderr", ""))\n'
        'if response.get("revoke"):\n'
        '    os.chmod(sys.argv[0], 0o600)\n'
        'sys.exit(response.get("exit", 0))\n'
    )
    executable.chmod(0o700)
    result = subprocess.run(
        [sys.executable, str(SCRIPT), '--repo', repo, '--pr', pr, '--head', head, *flags],
        env=dict(
            os.environ,
            PATH=str(tmp_path),  # only the fake gh: a disabled fake must never fall through to a real gh
            FAKE_GH_LOG=str(log),
            FAKE_GH_RESPONSES=str(fixtures),
        ),
        capture_output=True,
        text=True,
        timeout=30,
    )
    calls = [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []
    return result, calls


def assert_read_only(calls):
    assert calls
    assert all(call[:2] == ['api', 'graphql'] for call in calls), calls


def test_negated_prose_cannot_authorize_a_resolved_extra_closure(tmp_path):
    body = '<!-- intended-closing-issues: [] -->\nDoes not close #107; it remains open.'
    response = page(body, [('DankerMu/open-webui', 107)])

    result, calls = run_guard(tmp_path, [{'json': response}], '--merge')

    assert result.returncode != 0
    report = result.stdout + result.stderr
    assert 'expected: []' in report
    assert 'actual: ["dankermu/open-webui#107"]' in report
    assert 'extra: ["dankermu/open-webui#107"]' in report
    assert 'missing: []' in report
    assert_read_only(calls)


@pytest.mark.parametrize(
    ('body', 'issues', 'expected'),
    [
        ('<!-- intended-closing-issues: [] -->', [], '[]'),
        (
            '<!-- intended-closing-issues: ["DankerMu/open-webui#389"] -->',
            [('DankerMu/open-webui', 389)],
            '["dankermu/open-webui#389"]',
        ),
        (
            '<!-- intended-closing-issues: ["DANKERMU/OPEN-COMPUTER-USE#107", "dankermu/open-webui#107"] -->',
            [('DankerMu/open-webui', 107), ('DankerMu/open-computer-use', 107)],
            '["dankermu/open-computer-use#107", "dankermu/open-webui#107"]',
        ),
    ],
)
def test_check_only_accepts_complete_empty_exact_and_cross_repository_sets(tmp_path, body, issues, expected):
    result, calls = run_guard(tmp_path, [{'json': page(body, issues)}])

    assert result.returncode == 0, result.stderr
    assert f'expected: {expected}' in result.stdout
    assert f'actual: {expected}' in result.stdout
    assert 'extra: []' in result.stdout
    assert 'missing: []' in result.stdout
    assert_read_only(calls)


@pytest.mark.parametrize(
    ('issues', 'actual', 'extra'),
    [
        ([], '[]', '[]'),
        (
            [('DankerMu/open-computer-use', 107)],
            '["dankermu/open-computer-use#107"]',
            '["dankermu/open-computer-use#107"]',
        ),
    ],
)
def test_missing_intended_closure_does_not_match_same_number_in_another_repository(tmp_path, issues, actual, extra):
    body = '<!-- intended-closing-issues: ["DankerMu/open-webui#107"] -->'
    result, calls = run_guard(tmp_path, [{'json': page(body, issues)}], '--merge')

    assert result.returncode != 0
    report = result.stdout + result.stderr
    assert 'expected: ["dankermu/open-webui#107"]' in report
    assert f'actual: {actual}' in report
    assert f'extra: {extra}' in report
    assert 'missing: ["dankermu/open-webui#107"]' in report
    assert_read_only(calls)


@pytest.mark.parametrize(
    ('body', 'reason'),
    [
        ('Fixes #389', 'exactly one well-formed'),
        ('<!-- intended-closing-issues: [] -->\n<!-- intended-closing-issues: [] -->', 'exactly one well-formed'),
        ('<!-- intended-closing-issues: [] -->\n<!-- intended-closing-issues: [', 'exactly one well-formed'),
        ('<!-- intended-closing-issues [] -->', 'exactly one well-formed'),
        ('<!-- intended-closing-issues: [ -->', 'must contain a JSON array'),
        ('<!-- intended-closing-issues: {} -->', 'must contain a JSON array'),
        ('<!-- intended-closing-issues: null -->', 'must contain a JSON array'),
        ('<!-- intended-closing-issues: "#389" -->', 'must contain a JSON array'),
        ('<!-- intended-closing-issues: [389] -->', 'owner/repo#positive-number'),
        ('<!-- intended-closing-issues: ["#389"] -->', 'full owner/repo identity'),
        ('<!-- intended-closing-issues: ["open-webui#389"] -->', 'full owner/repo identity'),
        ('<!-- intended-closing-issues: ["DankerMu/open-webui#0"] -->', 'owner/repo#positive-number'),
        ('<!-- intended-closing-issues: ["DankerMu/open-webui#-1"] -->', 'owner/repo#positive-number'),
        ('<!-- intended-closing-issues: ["DankerMu/open-webui#1.0"] -->', 'owner/repo#positive-number'),
        (
            '<!-- intended-closing-issues: ["DankerMu/open-webui#107", "DANKERMU/OPEN-WEBUI#107"] -->',
            'duplicate intended issue: dankermu/open-webui#107',
        ),
    ],
)
def test_missing_ambiguous_or_malformed_intent_never_merges(tmp_path, body, reason):
    result, calls = run_guard(tmp_path, [{'json': page(body)}], '--merge')

    assert result.returncode != 0
    assert reason in result.stderr
    assert 'check passed' not in result.stdout
    assert_read_only(calls)


@pytest.mark.parametrize(
    ('field', 'value', 'reason'),
    [
        ('state', 'MERGED', 'target PR must be OPEN'),
        ('state', 'CLOSED', 'target PR must be OPEN'),
        ('headRefOid', 'b' * 40, 'head differs from the supplied reviewed head'),
        ('number', 390, 'different target repository/PR'),
        ('number', True, 'positive integer'),
        ('url', 'https://github.com/DankerMu/open-computer-use/pull/389', 'different target PR URL'),
        ('id', '', 'malformed PR metadata'),
        ('body', None, 'malformed PR metadata'),
    ],
)
def test_unverifiable_or_unreviewed_pr_never_merges(tmp_path, field, value, reason):
    response = page()
    response['data']['repository']['pullRequest'][field] = value
    result, calls = run_guard(tmp_path, [{'json': response}], '--merge')

    assert result.returncode != 0
    assert reason in result.stderr
    assert 'check passed' not in result.stdout
    assert_read_only(calls)


@pytest.mark.parametrize(
    ('repo', 'reason'),
    [('DankerMu/open-computer-use', 'different target repository/PR'), (None, 'malformed PR metadata')],
)
def test_response_must_bind_the_explicit_target_repository(tmp_path, repo, reason):
    response = page()
    response['data']['repository']['nameWithOwner'] = repo
    result, calls = run_guard(tmp_path, [{'json': response}], '--merge')

    assert result.returncode != 0
    assert reason in result.stderr
    assert_read_only(calls)


@pytest.mark.parametrize(
    ('response', 'reason'),
    [
        ({'exit': 4, 'stderr': 'authentication unavailable'}, 'reference acquisition failed (gh exit 4)'),
        ({'stdout': '{invalid'}, 'invalid JSON'),
        ({'json': None}, 'GraphQL errors or a malformed response'),
        ({'json': []}, 'GraphQL errors or a malformed response'),
        ({'json': {}}, 'null, partial or malformed PR metadata'),
        ({'json': {'data': None}}, 'null, partial or malformed PR metadata'),
        ({'json': {'data': {'repository': None}}}, 'null, partial or malformed PR metadata'),
        (
            {'json': {'data': {'repository': {'nameWithOwner': REPO, 'pullRequest': None}}}},
            'null, partial or malformed PR metadata',
        ),
        ({'json': dict(page(), errors=[{'message': 'partial references'}])}, 'GraphQL errors'),
        ({'json': dict(page(), errors=[])}, 'GraphQL errors'),
    ],
)
def test_api_failure_or_partial_response_cannot_become_empty_equality(tmp_path, response, reason):
    result, calls = run_guard(tmp_path, [response], '--merge')

    assert result.returncode != 0
    assert reason in result.stderr
    assert 'check passed' not in result.stdout
    assert_read_only(calls)


@pytest.mark.parametrize(
    ('connection', 'reason'),
    [
        (None, 'null, partial or malformed closing references'),
        ({}, 'null, partial or malformed closing references'),
        (
            {'nodes': None, 'pageInfo': {'hasNextPage': False, 'endCursor': None}},
            'malformed closing-reference pagination',
        ),
        ({'nodes': [], 'pageInfo': None}, 'null, partial or malformed closing references'),
        ({'nodes': [], 'pageInfo': {'hasNextPage': False}}, 'null, partial or malformed closing references'),
        (
            {'nodes': [], 'pageInfo': {'hasNextPage': 'false', 'endCursor': None}},
            'malformed closing-reference pagination',
        ),
        (
            {'nodes': [None], 'pageInfo': {'hasNextPage': False, 'endCursor': 'last'}},
            'malformed issue identity',
        ),
        (
            {'nodes': [{'number': 107}], 'pageInfo': {'hasNextPage': False, 'endCursor': 'last'}},
            'malformed issue identity',
        ),
        (
            {
                'nodes': [{'number': True, 'repository': {'nameWithOwner': REPO}}],
                'pageInfo': {'hasNextPage': False, 'endCursor': 'last'},
            },
            'positive integer',
        ),
    ],
)
def test_malformed_connection_or_issue_identity_is_not_a_complete_set(tmp_path, connection, reason):
    response = page()
    response['data']['repository']['pullRequest']['closingIssuesReferences'] = connection
    result, calls = run_guard(tmp_path, [{'json': response}], '--merge')

    assert result.returncode != 0
    assert reason in result.stderr
    assert 'check passed' not in result.stdout
    assert_read_only(calls)


def test_complete_pagination_compares_union_not_first_page(tmp_path):
    body = '<!-- intended-closing-issues: ["DankerMu/open-webui#107", "DankerMu/open-webui#389"] -->'
    responses = [
        {'json': page(body, [(REPO, 107)], cursor='first', more=True)},
        {'json': page(body, [(REPO, 389)], cursor='last')},
    ]
    result, calls = run_guard(tmp_path, responses)

    assert result.returncode == 0, result.stderr
    assert 'actual: ["dankermu/open-webui#107", "dankermu/open-webui#389"]' in result.stdout
    assert len(calls) == 2
    assert 'cursor=first' in calls[1]
    assert_read_only(calls)


def test_extra_closure_on_later_page_refuses_even_when_first_page_matches(tmp_path):
    body = '<!-- intended-closing-issues: ["DankerMu/open-webui#107"] -->'
    result, calls = run_guard(
        tmp_path,
        [
            {'json': page(body, [(REPO, 107)], cursor='first', more=True)},
            {'json': page(body, [(REPO, 389)], cursor='last')},
        ],
        '--merge',
    )

    assert result.returncode != 0
    assert 'extra: ["dankermu/open-webui#389"]' in result.stdout
    assert len(calls) == 2
    assert_read_only(calls)


@pytest.mark.parametrize(
    ('field', 'value', 'reason'),
    [
        ('id', 'PR_different', 'changed during pagination'),
        ('number', 390, 'different target repository/PR'),
        ('url', 'https://github.com/DankerMu/open-webui/pull/390', 'different target PR URL'),
        ('state', 'CLOSED', 'target PR must be OPEN'),
        ('headRefOid', 'b' * 40, 'head differs from the supplied reviewed head'),
        ('body', BODY_107, 'changed during pagination'),
    ],
)
def test_snapshot_drift_during_pagination_never_merges(tmp_path, field, value, reason):
    # Both pages declare the union of their references, so only the drifted field can refuse.
    second = page(BODY_107_389, [(REPO, 389)], cursor='last')
    second['data']['repository']['pullRequest'][field] = value
    result, calls = run_guard(
        tmp_path, [{'json': page(BODY_107_389, [(REPO, 107)], cursor='first', more=True)}, {'json': second}], '--merge'
    )

    assert result.returncode != 0
    assert reason in result.stderr
    assert 'check passed' not in result.stdout
    assert len(calls) == 2
    assert_read_only(calls)


@pytest.mark.parametrize(
    ('body', 'second_response', 'reason'),
    [
        (BODY_107, {'exit': 1}, 'reference acquisition failed (gh exit 1)'),
        (BODY_107, {'json': dict(page(BODY_107), errors=[{'message': 'page unavailable'}])}, 'GraphQL errors'),
        (BODY_107_389, {'json': page(BODY_107_389, [(REPO, 389)], cursor='first', more=True)}, 'did not progress'),
        (BODY_107_389, {'json': page(BODY_107_389, [(REPO, 389)], more=True)}, 'did not progress'),
        (
            BODY_107_389,
            {'json': page(BODY_107_389, [(REPO, 389)], cursor='', more=True)},
            'malformed closing-reference cursor',
        ),
        (BODY_107, {'json': page(BODY_107, cursor='second', more=True)}, 'did not progress'),
        (BODY_107, {'json': page(BODY_107)}, 'did not progress'),
        (BODY_107, {'json': page(BODY_107, [(REPO, 107)], cursor='last')}, 'overlapping closing-reference pages'),
    ],
)
def test_incomplete_nonprogressing_or_overlapping_pages_never_merge(tmp_path, body, second_response, reason):
    # Every page declares the union of references the pages yield, so only the guard under test can refuse.
    result, calls = run_guard(
        tmp_path,
        [{'json': page(body, [(REPO, 107)], cursor='first', more=True)}, second_response],
        '--merge',
    )

    assert result.returncode != 0
    assert reason in result.stderr
    assert 'check passed' not in result.stdout
    assert len(calls) == 2
    assert_read_only(calls)


def test_bounded_discovery_refuses_without_a_terminal_page(tmp_path):
    responses = [{'json': page(issues=[(REPO, index + 1)], cursor=f'page-{index}', more=True)} for index in range(100)]
    result, calls = run_guard(tmp_path, responses, '--merge')

    assert result.returncode != 0
    assert 'incomplete' in result.stderr
    assert 'check passed' not in result.stdout
    assert len(calls) == 100
    assert_read_only(calls)


@pytest.mark.parametrize('merge_exit', [0, 7])
def test_guarded_merge_checks_fresh_then_targets_only_reviewed_pr_and_propagates_failure(tmp_path, merge_exit):
    result, calls = run_guard(
        tmp_path, [{'json': page()}, {'exit': merge_exit, 'stdout': '', 'stderr': 'merge result'}], '--merge'
    )

    assert result.returncode == merge_exit
    assert 'expected: []' in result.stdout
    assert 'actual: []' in result.stdout
    assert len(calls) == 2
    assert calls[0][:2] == ['api', 'graphql']
    assert calls[1] == ['pr', 'merge', '389', '--repo', 'dankermu/open-webui', '--merge', '--match-head-commit', HEAD]
    if merge_exit:
        assert 'merge failed' in result.stderr


def test_merge_exec_failure_reports_unknown_outcome_without_retry(tmp_path):
    # The fake gh revokes its own execute bit after the check, so launching the merge raises OSError.
    result, calls = run_guard(tmp_path, [{'json': page(), 'revoke': True}], '--merge')

    assert result.returncode == 1
    assert 'check passed' in result.stdout
    assert 'merge outcome unknown' in result.stderr
    assert 'inspect the PR state before retrying' in result.stderr
    assert 'no retry attempted' in result.stderr
    assert len(calls) == 1
    assert calls[0][:2] == ['api', 'graphql']


@pytest.mark.parametrize(
    'inputs',
    [
        {'repo': ''},
        {'repo': 'open-webui'},
        {'repo': 'owner/repo/other'},
        {'pr': '0'},
        {'pr': '-1'},
        {'pr': 'true'},
        {'head': 'abc123'},
        {'head': 'z' * 40},
    ],
)
def test_invalid_explicit_inputs_refuse_before_contacting_github(tmp_path, inputs):
    result, calls = run_guard(tmp_path, [], '--merge', **inputs)

    assert result.returncode != 0
    assert calls == []


def test_central_cli_checks_explicit_ocu_target_without_a_copied_guard(tmp_path):
    response = page()
    response['data']['repository']['nameWithOwner'] = 'DankerMu/open-computer-use'
    response['data']['repository']['pullRequest']['url'] = 'https://github.com/DankerMu/open-computer-use/pull/389'
    result, calls = run_guard(tmp_path, [{'json': response}], repo='DankerMu/open-computer-use')

    assert result.returncode == 0, result.stderr
    assert 'check passed for dankermu/open-computer-use#389' in result.stdout
    assert_read_only(calls)


@pytest.mark.parametrize('flag', ['--admin', '--auto', '--retry', '--squash'])
def test_arbitrary_merge_or_bypass_flags_are_not_accepted(tmp_path, flag):
    result, calls = run_guard(tmp_path, [], '--merge', flag)

    assert result.returncode != 0
    assert calls == []
