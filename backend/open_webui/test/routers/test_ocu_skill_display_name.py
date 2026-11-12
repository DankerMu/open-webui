"""Uploaded-skill display names: the admin route, the WebUI listings, and the internal contract that ignores them."""

from __future__ import annotations

import asyncio

import pytest
from open_webui.test.ocu_harness import _SelectRecorder, _session_headers, get_client
from open_webui.test.routers import test_ocu_skill_internal_routes, test_ocu_skills
from open_webui.test.routers.test_ocu_skill_internal_routes import _user_config
from open_webui.test.routers.test_ocu_skill_user_routes import _set_bypass, _toggle, _user_listing
from open_webui.test.routers.test_ocu_skills import (
    ADMIN_PATH,
    DESCRIPTION_B,
    EVERYONE_READ,
    INVOICE,
    SKILLS_PATH,
    _registry_state,
    _skill_zip_for,
    _upload,
)

# Shared fixtures, bound by name so pytest resolves them here; their modules own their definitions.
admin = test_ocu_skills.admin
member = test_ocu_skills.member
seeded_grants = test_ocu_skills.seeded_grants
registry = test_ocu_skills.registry
internal_key = test_ocu_skill_internal_routes.internal_key

INVOICE_DISPLAY_NAME = '发票生成'


def _store_display_name(name: str, display_name: str) -> None:
    from open_webui.internal.db import get_async_db
    from sqlalchemy import text

    async def write():
        async with get_async_db() as db:
            query = text('UPDATE ocu_skill SET display_name = :display_name WHERE name = :name')
            await db.execute(query, {'display_name': display_name, 'name': name})
            await db.commit()

    asyncio.run(write())


def _display_names(items: list[dict]) -> dict[str, str | None]:
    return {item['name']: item['display_name'] for item in items}


def _admin_listing(admin) -> list[dict]:
    response = get_client().get(ADMIN_PATH, headers=_session_headers(admin.id))
    assert response.status_code == 200, response.text
    return response.json()


def _access_update(admin) -> dict:
    path, headers = f'{SKILLS_PATH}/a/access', _session_headers(admin.id)
    response = get_client().post(path, json={'access_grants': [EVERYONE_READ]}, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def _toggled(user, name: str) -> dict:
    response = _toggle(user, name, False)
    assert response.status_code == 200, response.text
    return response.json()


def test_every_webui_listing_carries_a_null_display_name_for_an_existing_skill(admin, member, seeded_grants):
    assert _display_names(_admin_listing(admin)) == {'a': None, 'b': None}
    assert _access_update(admin)['display_name'] is None
    assert _display_names(_user_listing(member)) == {'a': None}
    toggled = _toggled(member, 'a')
    assert (toggled['name'], toggled['enabled'], toggled['display_name']) == ('a', False, None)


def test_a_stored_display_name_reaches_every_webui_listing(admin, member, seeded_grants, monkeypatch):
    _store_display_name('a', INVOICE_DISPLAY_NAME)
    # Bypass lets the administrator's granted list hold both skills: one named, one not.
    _set_bypass(monkeypatch, True)

    assert _display_names(_admin_listing(admin)) == {'a': INVOICE_DISPLAY_NAME, 'b': None}
    assert _access_update(admin)['display_name'] == INVOICE_DISPLAY_NAME
    assert _display_names(_user_listing(admin)) == {'a': INVOICE_DISPLAY_NAME, 'b': None}
    assert _display_names(_user_listing(member)) == {'a': INVOICE_DISPLAY_NAME}
    toggled = _toggled(member, 'a')
    assert (toggled['name'], toggled['enabled'], toggled['display_name']) == ('a', False, INVOICE_DISPLAY_NAME)


def test_internal_user_config_keeps_its_keys_when_a_skill_has_a_display_name(member, seeded_grants, internal_key):
    _store_display_name('a', INVOICE_DISPLAY_NAME)

    config = _user_config(member.email, internal_key)

    assert set(config) == {'email', 'enabled_skills'}
    assert [item['name'] for item in config['enabled_skills']] == ['a']
    assert [set(item) for item in config['enabled_skills']] == [{'name', 'description', 'category', 'zip_sha256'}]


LENGTH_DETAIL = 'display name must be at most 32 characters'
ANGLE_DETAIL = 'display name must not contain < or >'
CONTROL_DETAIL = 'display name must not contain control characters'


def _set(user, name: str, body):
    headers = {} if user is None else _session_headers(user.id)
    return get_client().post(f'{SKILLS_PATH}/{name}/display-name', json=body, headers=headers)


def _admin_display_name(admin, name: str = 'a') -> str | None:
    return _display_names(_admin_listing(admin))[name]


def _admin_item_for(admin, name: str) -> dict:
    return {item['name']: item for item in _admin_listing(admin)}[name]


@pytest.mark.parametrize('submitted', ['\u3000 发票生成\t\n', ' 发票生成'], ids=['ideographic-and-edge-cc', 'leading'])
def test_set_trims_and_writes_only_the_display_name(admin, seeded_grants, submitted):
    from open_webui.models.ocu_skills import OcuSkills

    before_item, before_state = _admin_item_for(admin, 'a'), _registry_state()
    before_row = asyncio.run(OcuSkills.get_metadata('a'))

    response = _set(admin, 'a', {'display_name': submitted})

    assert response.status_code == 200, response.text
    body = response.json()
    assert body == {**before_item, 'display_name': INVOICE_DISPLAY_NAME}
    assert body == _admin_item_for(admin, 'a')
    assert (body['updated_at'], body['access_grants']) == (seeded_grants['now'], [EVERYONE_READ])
    after_row = asyncio.run(OcuSkills.get_metadata('a'))
    assert after_row == before_row.model_copy(update={'display_name': INVOICE_DISPLAY_NAME})
    assert _registry_state() == before_state


@pytest.mark.parametrize(
    'submitted,stored',
    [
        ('发' * 32, '发' * 32),
        ('  ' + '发' * 32 + '  ', '发' * 32),
        ('发票|生成', '发票|生成'),
        # Cf (format) characters are not Cc: zero-width space and joiner pass (design Decision 3).
        ('发\u200b票', '发\u200b票'),
        ('发\u200d票', '发\u200d票'),
    ],
    ids=['32-cjk', '32-cjk-padded', 'pipe', 'zwsp', 'zwj'],
)
def test_accepted_names_are_stored_as_trimmed(admin, seeded_grants, submitted, stored):
    response = _set(admin, 'a', {'display_name': submitted})

    assert response.status_code == 200, response.text
    assert response.json()['display_name'] == stored
    assert _admin_display_name(admin) == stored


def test_display_names_need_not_be_unique(admin, seeded_grants):
    for name in ('a', 'b'):
        response = _set(admin, name, {'display_name': INVOICE_DISPLAY_NAME})
        assert response.status_code == 200, response.text

    assert _display_names(_admin_listing(admin)) == {'a': INVOICE_DISPLAY_NAME, 'b': INVOICE_DISPLAY_NAME}


@pytest.mark.parametrize(
    'submitted,detail',
    [
        ('发' * 33, LENGTH_DETAIL),
        ('发<票', ANGLE_DETAIL),
        ('发>票', ANGLE_DETAIL),
        ('发\n票', CONTROL_DETAIL),
        ('发\t票', CONTROL_DETAIL),
        # NUL is neither a line break nor a tab: the rule is Unicode category Cc, not a blacklist.
        ('发\x00票', CONTROL_DETAIL),
    ],
    ids=['33-cjk', 'lt', 'gt', 'newline', 'tab', 'nul'],
)
def test_rule_violation_is_400_with_its_reason_and_keeps_the_name(admin, seeded_grants, submitted, detail):
    _store_display_name('a', INVOICE_DISPLAY_NAME)

    response = _set(admin, 'a', {'display_name': submitted})

    assert (response.status_code, response.json()) == (400, {'detail': detail})
    assert _admin_display_name(admin) == INVOICE_DISPLAY_NAME


@pytest.mark.parametrize('submitted', ['', '   ', '\t', None], ids=['empty', 'spaces', 'tab', 'null'])
def test_clear_stores_null(admin, seeded_grants, submitted):
    _store_display_name('a', INVOICE_DISPLAY_NAME)

    response = _set(admin, 'a', {'display_name': submitted})

    assert response.status_code == 200, response.text
    assert response.json()['display_name'] is None
    assert _admin_display_name(admin) is None


@pytest.mark.parametrize(
    'body', [{}, {'display_name': 123}, {'display_name': True}, []], ids=['missing', 'number', 'boolean', 'array']
)
def test_malformed_body_is_422_and_keeps_the_name(admin, seeded_grants, body):
    _store_display_name('a', INVOICE_DISPLAY_NAME)

    assert _set(admin, 'a', body).status_code == 422
    assert _admin_display_name(admin) == INVOICE_DISPLAY_NAME


def test_unknown_name_is_404_after_validation_and_creates_nothing(admin, seeded_grants):
    from open_webui.models.ocu_skills import OcuSkills

    # Body validation (422), then the rule (400), then the setter (404).
    assert _set(admin, 'ghost', {}).status_code == 422
    rejected = _set(admin, 'ghost', {'display_name': '<x>'})
    assert (rejected.status_code, rejected.json()) == (400, {'detail': ANGLE_DETAIL})

    response = _set(admin, 'ghost', {'display_name': INVOICE_DISPLAY_NAME})

    assert response.status_code == 404
    assert asyncio.run(OcuSkills.get_metadata('ghost')) is None
    assert list(_display_names(_admin_listing(admin))) == ['a', 'b']


@pytest.mark.parametrize('body', [{'display_name': '新名'}, {}], ids=['valid-body', 'missing-key'])
@pytest.mark.parametrize('caller', ['user-role', 'no-session'])
def test_non_admin_is_401_before_the_body_and_keeps_the_name(admin, member, seeded_grants, caller, body):
    _store_display_name('a', INVOICE_DISPLAY_NAME)

    response = _set(member if caller == 'user-role' else None, 'a', body)

    assert response.status_code == 401
    assert _admin_display_name(admin) == INVOICE_DISPLAY_NAME


def test_set_does_not_select_skill_data(admin, seeded_grants):
    with _SelectRecorder() as recorder:
        response = _set(admin, 'a', {'display_name': INVOICE_DISPLAY_NAME})

    assert response.status_code == 200, response.text
    recorder.assert_no_skill_data_select()


@pytest.mark.usefixtures('registry')
def test_replace_upload_keeps_the_display_name(admin):
    assert _upload(admin, _skill_zip_for(INVOICE)).status_code == 200
    assert _set(admin, INVOICE, {'display_name': INVOICE_DISPLAY_NAME}).status_code == 200
    before = _admin_item_for(admin, INVOICE)

    assert _upload(admin, _skill_zip_for(INVOICE, description=DESCRIPTION_B)).status_code == 200

    after = _admin_item_for(admin, INVOICE)
    assert after['display_name'] == INVOICE_DISPLAY_NAME
    assert after['zip_sha256'] != before['zip_sha256'] and after['description'] == DESCRIPTION_B


@pytest.mark.usefixtures('registry')
def test_delete_then_reupload_starts_without_a_display_name(admin):
    assert _upload(admin, _skill_zip_for(INVOICE)).status_code == 200
    assert _set(admin, INVOICE, {'display_name': INVOICE_DISPLAY_NAME}).status_code == 200

    deleted = get_client().delete(f'{SKILLS_PATH}/{INVOICE}', headers=_session_headers(admin.id))
    assert (deleted.status_code, deleted.json()) == (200, True)
    assert _upload(admin, _skill_zip_for(INVOICE)).status_code == 200

    assert _admin_display_name(admin, INVOICE) is None
