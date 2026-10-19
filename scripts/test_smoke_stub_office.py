import tempfile
from pathlib import Path

import pytest
import smoke_stub_office as office


def test_assertion_failure_stops_child_and_removes_owned_fixture(tmp_path, monkeypatch):
    private_tmp = tmp_path / 'runtime'
    private_tmp.mkdir(mode=0o700)
    monkeypatch.setenv('TMPDIR', str(private_tmp))
    monkeypatch.setattr(tempfile, 'tempdir', str(private_tmp))
    canary = private_tmp / 'ocu-office-fixtures-unrelated.json'
    canary_bytes = b'{"unrelated": "preserve this fixture"}\n'
    canary.write_bytes(canary_bytes)
    expected = AssertionError('injected isolation assertion after real outputs admission')
    fixture_path = None
    fixture_bytes = None
    children = []
    stopped = []
    write_fixtures = office._write_fixtures
    start_stub = office.start_stub
    stop_stub = office.stop_stub
    outputs = office._outputs

    def observe_fixture(mapping):
        nonlocal fixture_path, fixture_bytes
        fixture_path = write_fixtures(mapping)
        fixture_bytes = fixture_path.read_bytes()
        return fixture_path

    def observe_start(script, env):
        child = start_stub(script, env)
        children.append(child)
        return child

    def observe_stop(proc, record):
        stop_stub(proc, record)
        contents = fixture_path.read_bytes() if fixture_path.exists() else None
        stopped.append((proc.pid, proc.poll(), contents))

    def fail_after_outputs(base, chat):
        outputs(base, chat)
        raise expected

    monkeypatch.setattr(office, '_write_fixtures', observe_fixture)
    monkeypatch.setattr(office, 'start_stub', observe_start)
    monkeypatch.setattr(office, 'stop_stub', observe_stop)
    monkeypatch.setattr(office, '_outputs', fail_after_outputs)
    try:
        with pytest.raises(AssertionError) as raised:
            office.assert_isolation_and_replay(Path(__file__).with_name('ocu-stub.py'))

        assert raised.value is expected
        for proc, _, _ in children:
            assert proc.poll() is not None
            assert (proc.pid, proc.returncode, fixture_bytes) in stopped
        assert canary.read_bytes() == canary_bytes
        assert not fixture_path.exists(), f'owned fixture remains after assertion failure: {fixture_path}'
    finally:
        try:
            for proc, _, record in children:
                try:
                    if proc.poll() is None:
                        proc.kill()
                        proc.wait(timeout=5)
                finally:
                    record.unlink(missing_ok=True)
        finally:
            if fixture_path is not None:
                fixture_path.unlink(missing_ok=True)
