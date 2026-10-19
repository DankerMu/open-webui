#!/usr/bin/env python3
"""Compare explicit closure intent with complete GitHub references before merging."""

import argparse
import json
import re
import subprocess
import sys

REPOSITORY = re.compile(r'[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?/[A-Za-z0-9_.-]+')
MARKER_START = re.compile(r'<!--\s*intended-closing-issues\b')
MARKER = re.compile(r'<!--\s*intended-closing-issues:\s*(.*?)\s*-->', re.DOTALL)
MAX_PAGES = 100
PAGE_SIZE = 100
COMMAND_TIMEOUT = 30
QUERY = """query($owner:String!,$name:String!,$number:Int!,$cursor:String){
  repository(owner:$owner,name:$name){
    nameWithOwner
    pullRequest(number:$number){
      id number url state headRefOid body
      closingIssuesReferences(first:100,after:$cursor){
        nodes{number repository{nameWithOwner}}
        pageInfo{hasNextPage endCursor}
      }
    }
  }
}"""


class Fail(Exception):
    pass


def repository_identity(value):
    if not isinstance(value, str) or not REPOSITORY.fullmatch(value) or value.split('/')[1] in {'.', '..'}:
        raise Fail('repository must be a full owner/repo identity')
    return value.lower()


def positive_number(value):
    if type(value) is not int or value < 1:
        raise Fail('issue/PR number must be a positive integer')
    return value


def intended_issues(body):
    starts = MARKER_START.findall(body)
    markers = MARKER.findall(body)
    if len(starts) != 1 or len(markers) != 1:
        raise Fail('require exactly one well-formed intended-closing-issues marker (missing, duplicate or malformed)')
    try:
        identities = json.loads(markers[0])
    except ValueError as error:
        raise Fail('intended-closing-issues must contain a JSON array') from error
    if not isinstance(identities, list):
        raise Fail('intended-closing-issues must contain a JSON array')
    result = set()
    for identity in identities:
        if not isinstance(identity, str) or identity.count('#') != 1:
            raise Fail('intended issue must be owner/repo#positive-number')
        repo, number = identity.split('#')
        if not re.fullmatch(r'[1-9][0-9]*', number):
            raise Fail('intended issue must be owner/repo#positive-number')
        normalized = f'{repository_identity(repo)}#{number}'
        if normalized in result:
            raise Fail(f'duplicate intended issue: {normalized}')
        result.add(normalized)
    return result


def gh(arguments, *, capture=True):
    try:
        return subprocess.run(
            ['gh', *arguments], capture_output=capture, text=True, timeout=COMMAND_TIMEOUT, check=False
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise Fail('gh unavailable or command timed out; no retry attempted') from error


def fetch_page(repo, number, cursor):
    owner, name = repo.split('/')
    arguments = [
        'api',
        'graphql',
        '-f',
        f'query={QUERY}',
        '-f',
        f'owner={owner}',
        '-f',
        f'name={name}',
        '-F',
        f'number={number}',
    ]
    if cursor is not None:
        arguments.extend(['-f', f'cursor={cursor}'])
    response = gh(arguments)
    if response.returncode:
        raise Fail(f'GitHub reference acquisition failed (gh exit {response.returncode})')
    try:
        payload = json.loads(response.stdout)
    except ValueError as error:
        raise Fail('GitHub returned invalid JSON') from error
    if not isinstance(payload, dict) or 'errors' in payload:
        raise Fail('GitHub returned GraphQL errors or a malformed response')
    return payload


def snapshot(payload, repo, number, head):
    try:
        repository = payload['data']['repository']
        pull = repository['pullRequest']
        fields = tuple(pull[key] for key in ('id', 'number', 'url', 'state', 'headRefOid', 'body'))
        name = repository['nameWithOwner']
    except (KeyError, TypeError) as error:
        raise Fail('GitHub returned null, partial or malformed PR metadata') from error
    if not all(isinstance(value, str) for value in (name, *fields[:1], *fields[2:])) or not fields[0]:
        raise Fail('GitHub returned malformed PR metadata')
    if repository_identity(name) != repo or positive_number(fields[1]) != number:
        raise Fail('GitHub returned a different target repository/PR')
    if fields[2].lower() != f'https://github.com/{repo}/pull/{number}':
        raise Fail('GitHub returned a different target PR URL')
    if fields[3] != 'OPEN':
        raise Fail('target PR must be OPEN')
    if fields[4] != head:
        raise Fail('target PR head differs from the supplied reviewed head')
    return (name, *fields), pull


def reference_page(pull, cursor, seen_cursors):
    try:
        connection = pull['closingIssuesReferences']
        nodes = connection['nodes']
        info = connection['pageInfo']
        more, end = info['hasNextPage'], info['endCursor']
    except (KeyError, TypeError) as error:
        raise Fail('GitHub returned null, partial or malformed closing references') from error
    if not isinstance(nodes, list) or len(nodes) > PAGE_SIZE or type(more) is not bool:
        raise Fail('GitHub returned malformed closing-reference pagination')
    if end is not None and (not isinstance(end, str) or not end):
        raise Fail('GitHub returned malformed closing-reference cursor')
    if (more and (not nodes or end is None or end in seen_cursors)) or (cursor is not None and not nodes):
        raise Fail('closing-reference pagination did not progress')
    identities = set()
    for node in nodes:
        try:
            identity = f'{repository_identity(node["repository"]["nameWithOwner"])}#{positive_number(node["number"])}'
        except (KeyError, TypeError) as error:
            raise Fail('GitHub returned null, partial or malformed issue identity') from error
        if identity in identities:
            raise Fail('GitHub returned duplicate closing references')
        identities.add(identity)
    return identities, more, end


def closing_sets(repo, number, head):
    first_snapshot = None
    expected, actual = set(), set()
    cursor = None
    seen_cursors = set()
    for _ in range(MAX_PAGES):
        current, pull = snapshot(fetch_page(repo, number, cursor), repo, number, head)
        if first_snapshot is None:
            first_snapshot = current
            expected = intended_issues(pull['body'])
        elif current != first_snapshot:
            raise Fail('PR identity/body/head/state changed during pagination')
        identities, more, end = reference_page(pull, cursor, seen_cursors)
        if actual.intersection(identities):
            raise Fail('GitHub returned overlapping closing-reference pages')
        actual.update(identities)
        if not more:
            return expected, actual
        seen_cursors.add(end)
        cursor = end
    raise Fail(f'closing references incomplete after {MAX_PAGES} pages; refusing partial comparison')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', required=True, help='explicit owner/repo target')
    parser.add_argument('--pr', required=True, type=int, help='positive target PR number')
    parser.add_argument('--head', required=True, help='full reviewed 40-character commit SHA')
    parser.add_argument('--merge', action='store_true', help='merge only after a fresh successful check')
    args = parser.parse_args()
    try:
        repo = repository_identity(args.repo)
        number = positive_number(args.pr)
        if not re.fullmatch(r'[0-9a-fA-F]{40}', args.head):
            raise Fail('--head must be a full 40-character commit SHA')
        head = args.head.lower()
        expected, actual = closing_sets(repo, number, head)
        for label, values in (
            ('expected', expected),
            ('actual', actual),
            ('extra', actual - expected),
            ('missing', expected - actual),
        ):
            sys.stdout.write(f'{label}: {json.dumps(sorted(values))}\n')
        if expected != actual:
            raise Fail('closing-reference sets differ; no merge attempted')
        sys.stdout.write(f'closing-reference check passed for {repo}#{number} at {head}\n')
        sys.stdout.flush()
        if args.merge:
            try:
                response = gh(
                    ['pr', 'merge', str(number), '--repo', repo, '--merge', '--match-head-commit', head], capture=False
                )
            except Fail as error:
                # GitHub may have merged before the launch error or timeout surfaced.
                raise Fail(
                    'merge outcome unknown (gh unavailable or command timed out); '
                    'inspect the PR state before retrying; no retry attempted'
                ) from error
            if response.returncode:
                sys.stderr.write(f'pr-merge: merge failed (gh exit {response.returncode}); no retry attempted\n')
                return response.returncode if response.returncode > 0 else 1
        return 0
    except Fail as error:
        sys.stderr.write(f'pr-merge: {error}\n')
        return 1


if __name__ == '__main__':
    sys.exit(main())
