"""Uploaded-skill display names in the WebUI listings, and the internal registry contract that ignores them."""

from __future__ import annotations

import asyncio

from open_webui.test.ocu_harness import _session_headers, get_client
from open_webui.test.routers import test_ocu_skill_internal_routes, test_ocu_skills
from open_webui.test.routers.test_ocu_skill_internal_routes import _user_config
from open_webui.test.routers.test_ocu_skill_user_routes import _set_bypass, _toggle, _user_listing
from open_webui.test.routers.test_ocu_skills import ADMIN_PATH, EVERYONE_READ, SKILLS_PATH

# Shared fixtures, bound by name so pytest resolves them here; their modules own their definitions.
admin = test_ocu_skills.admin
member = test_ocu_skills.member
seeded_grants = test_ocu_skills.seeded_grants
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
