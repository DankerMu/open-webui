"""Session TestClient for OCU router tests."""

from __future__ import annotations

import pytest
from open_webui.test_ocu_harness import bind_client, session_test_client


@pytest.fixture(scope='session')
def client():
    with session_test_client() as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def _bind_client(client):
    bind_client(client)
    yield
