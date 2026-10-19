import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).with_name('pr-merge.py')
REPO = 'DankerMu/open-webui'
HEAD = 'a' * 40


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
        'sys.exit(response.get("exit", 0))\n'
    )
    executable.chmod(0o700)
    result = subprocess.run(
        [sys.executable, str(SCRIPT), '--repo', repo, '--pr', pr, '--head', head, *flags],
        env=dict(
            os.environ,
            PATH=str(tmp_path) + os.pathsep + os.environ['PATH'],
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
    'body',
    [
        'Fixes #389',
        '<!-- intended-closing-issues: [] -->\n<!-- intended-closing-issues: [] -->',
        '<!-- intended-closing-issues: [] -->\n<!-- intended-closing-issues: [',
        '<!-- intended-closing-issues [] -->',
        '<!-- intended-closing-issues: [ -->',
        '<!-- intended-closing-issues: {} -->',
        '<!-- intended-closing-issues: null -->',
        '<!-- intended-closing-issues: "#389" -->',
        '<!-- intended-closing-issues: [389] -->',
        '<!-- intended-closing-issues: ["#389"] -->',
        '<!-- intended-closing-issues: ["open-webui#389"] -->',
        '<!-- intended-closing-issues: ["DankerMu/open-webui#0"] -->',
        '<!-- intended-closing-issues: ["DankerMu/open-webui#-1"] -->',
        '<!-- intended-closing-issues: ["DankerMu/open-webui#1.0"] -->',
        '<!-- intended-closing-issues: ["DankerMu/open-webui#107", "DANKERMU/OPEN-WEBUI#107"] -->',
    ],
)
def test_missing_ambiguous_or_malformed_intent_never_merges(tmp_path, body):
    result, calls = run_guard(tmp_path, [{'json': page(body)}], '--merge')

    assert result.returncode != 0
    assert 'pr-merge:' in result.stderr
    assert 'check passed' not in result.stdout
    assert_read_only(calls)


@pytest.mark.parametrize(
    ('field', 'value'),
    [
        ('state', 'MERGED'),
        ('state', 'CLOSED'),
        ('headRefOid', 'b' * 40),
        ('number', 390),
        ('number', True),
        ('url', 'https://github.com/DankerMu/open-computer-use/pull/389'),
        ('id', ''),
        ('body', None),
    ],
)
def test_unverifiable_or_unreviewed_pr_never_merges(tmp_path, field, value):
    response = page()
    response['data']['repository']['pullRequest'][field] = value
    result, calls = run_guard(tmp_path, [{'json': response}], '--merge')

    assert result.returncode != 0
    assert 'check passed' not in result.stdout
    assert_read_only(calls)


@pytest.mark.parametrize('repo', ['DankerMu/open-computer-use', None])
def test_response_must_bind_the_explicit_target_repository(tmp_path, repo):
    response = page()
    response['data']['repository']['nameWithOwner'] = repo
    result, calls = run_guard(tmp_path, [{'json': response}], '--merge')

    assert result.returncode != 0
    assert_read_only(calls)


@pytest.mark.parametrize(
    'response',
    [
        {'exit': 4, 'stderr': 'authentication unavailable'},
        {'stdout': '{invalid'},
        {'json': None},
        {'json': []},
        {'json': {}},
        {'json': {'data': None}},
        {'json': {'data': {'repository': None}}},
        {'json': {'data': {'repository': {'nameWithOwner': REPO, 'pullRequest': None}}}},
        {'json': dict(page(), errors=[{'message': 'partial references'}])},
        {'json': dict(page(), errors=[])},
    ],
)
def test_api_failure_or_partial_response_cannot_become_empty_equality(tmp_path, response):
    result, calls = run_guard(tmp_path, [response], '--merge')

    assert result.returncode != 0
    assert 'check passed' not in result.stdout
    assert_read_only(calls)


@pytest.mark.parametrize(
    'connection',
    [
        None,
        {},
        {'nodes': None, 'pageInfo': {'hasNextPage': False, 'endCursor': None}},
        {'nodes': [], 'pageInfo': None},
        {'nodes': [], 'pageInfo': {'hasNextPage': False}},
        {'nodes': [], 'pageInfo': {'hasNextPage': 'false', 'endCursor': None}},
        {'nodes': [None], 'pageInfo': {'hasNextPage': False, 'endCursor': 'last'}},
        {'nodes': [{'number': 107}], 'pageInfo': {'hasNextPage': False, 'endCursor': 'last'}},
        {
            'nodes': [{'number': True, 'repository': {'nameWithOwner': REPO}}],
            'pageInfo': {'hasNextPage': False, 'endCursor': 'last'},
        },
    ],
)
def test_malformed_connection_or_issue_identity_is_not_a_complete_set(tmp_path, connection):
    response = page()
    response['data']['repository']['pullRequest']['closingIssuesReferences'] = connection
    result, calls = run_guard(tmp_path, [{'json': response}], '--merge')

    assert result.returncode != 0
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
    ('field', 'value'),
    [
        ('id', 'PR_different'),
        ('number', 390),
        ('url', 'https://github.com/DankerMu/open-webui/pull/390'),
        ('state', 'CLOSED'),
        ('headRefOid', 'b' * 40),
        ('body', '<!-- intended-closing-issues: ["DankerMu/open-webui#107"] -->'),
    ],
)
def test_snapshot_drift_during_pagination_never_merges(tmp_path, field, value):
    second = page(issues=[(REPO, 389)], cursor='last')
    second['data']['repository']['pullRequest'][field] = value
    result, calls = run_guard(
        tmp_path, [{'json': page(issues=[(REPO, 107)], cursor='first', more=True)}, {'json': second}], '--merge'
    )

    assert result.returncode != 0
    assert 'check passed' not in result.stdout
    assert len(calls) == 2
    assert_read_only(calls)


@pytest.mark.parametrize(
    'second_response',
    [
        {'exit': 1},
        {'json': dict(page(), errors=[{'message': 'page unavailable'}])},
        {'json': page(issues=[(REPO, 389)], cursor='first', more=True)},
        {'json': page(issues=[(REPO, 389)], more=True)},
        {'json': page(issues=[(REPO, 389)], cursor='', more=True)},
        {'json': page(cursor='second', more=True)},
        {'json': page()},
        {'json': page(issues=[(REPO, 107)], cursor='last')},
    ],
)
def test_incomplete_nonprogressing_or_overlapping_pages_never_merge(tmp_path, second_response):
    result, calls = run_guard(
        tmp_path,
        [{'json': page(issues=[(REPO, 107)], cursor='first', more=True)}, second_response],
        '--merge',
    )

    assert result.returncode != 0
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
