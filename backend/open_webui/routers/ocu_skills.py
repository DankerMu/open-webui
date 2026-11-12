"""Administrator-uploaded OCU skill registry, mounted under /api/v1/ocu/skills.

Routes register unconditionally here; the workspace-enabled branch of the OCU
router decides whether this router is mounted at all.
"""

from __future__ import annotations

import asyncio
import hmac
import os
import unicodedata
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from open_webui.config import BYPASS_ADMIN_ACCESS_CONTROL
from open_webui.constants import ERROR_MESSAGES
from open_webui.models.access_grants import AccessGrantModel, AccessGrants
from open_webui.models.ocu_skills import OCU_SKILL_RESOURCE_TYPE, OcuSkillModel, OcuSkillReadableModel, OcuSkills
from open_webui.models.users import UserModel, Users
from open_webui.utils.auth import get_admin_user, get_verified_user
from open_webui.utils.ocu_skill_zip import SkillZipError, validate_skill_zip
from pydantic import BaseModel, Field, StrictBool, StrictStr
from sqlalchemy.exc import IntegrityError

router = APIRouter()

MAX_UPLOAD_BYTES = 50 * 1024 * 1024
MAX_DISPLAY_NAME_LENGTH = 32
# OCU built-ins at the pinned revision 4dab0cf30be033ec95818c2108487a61b7213029 (design Decision 4):
# every skills/public/ directory, remotion, and every NATIVE_PROMPT_DESCRIPTIONS key, whose description
# OCU would force onto an upload of the same name.
RESERVED_SKILL_NAMES = frozenset(
    {
        'algorithmic-art',
        'artifacts-builder',
        'brand-guidelines',
        'canvas-design',
        'copy-editing',
        'describe-image',
        'doc-coauthoring',
        'docx',
        'file-reading',
        'frontend-design',
        'gitlab-explorer',
        'internal-comms',
        'mcp-builder',
        'pdf',
        'pdf-reading',
        'playwright-cli',
        'pptx',
        'product-marketing-context',
        'remotion',
        'single-cell-rna-qc',
        'skill-creator',
        'slack-gif-creator',
        'social-content',
        'sub-agent',
        'test-driven-development',
        'theme-factory',
        'webapp-testing',
        'writing-skills',
        'xlsx',
    }
)


class OcuSkillGrant(BaseModel):
    principal_type: str
    principal_id: str
    permission: str


class OcuSkillAdminItem(BaseModel):
    name: str
    description: str
    display_name: str | None
    zip_sha256: str
    size: int
    created_by: str
    updated_at: int
    access_grants: list[OcuSkillGrant]


class OcuSkillUploaded(BaseModel):
    name: str
    description: str
    zip_sha256: str
    size: int


class OcuSkillAccessGrant(BaseModel):
    # Uploaded skills are read-only and sandboxes are never anonymous: any other grant could not take
    # effect, so it is rejected with 422 instead of being dropped.
    principal_type: Literal['user', 'group']
    principal_id: str = Field(min_length=1)
    permission: Literal['read']


class OcuSkillAccessForm(BaseModel):
    access_grants: list[OcuSkillAccessGrant]


class OcuSkillDisplayNameForm(BaseModel):
    # Required StrictStr | None: {}, a number or a boolean is a client bug (422), never a silent clear.
    display_name: StrictStr | None


class OcuSkillUserItem(BaseModel):
    name: str
    description: str
    display_name: str | None
    enabled: bool


class OcuSkillToggleForm(BaseModel):
    # StrictBool: a JSON "false" string or 0 is a client bug, not a disable.
    enabled: StrictBool


class OcuInternalSkill(BaseModel):
    name: str
    description: str
    category: Literal['user']
    zip_sha256: str


class OcuInternalUserConfig(BaseModel):
    email: str
    enabled_skills: list[OcuInternalSkill]


def _admin_item(skill: OcuSkillModel, grants: list[AccessGrantModel]) -> OcuSkillAdminItem:
    return OcuSkillAdminItem(
        **skill.model_dump(include=set(OcuSkillAdminItem.model_fields) - {'access_grants'}),
        access_grants=[
            OcuSkillGrant(principal_type=g.principal_type, principal_id=g.principal_id, permission=g.permission)
            for g in grants
            if g.permission == 'read'
        ],
    )


def _skill_not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=ERROR_MESSAGES.NOT_FOUND)


def _admin_bypass(user: UserModel) -> bool:
    return user.role == 'admin' and BYPASS_ADMIN_ACCESS_CONTROL


def _user_item(skill: OcuSkillReadableModel) -> OcuSkillUserItem:
    return OcuSkillUserItem(
        name=skill.name, description=skill.description, display_name=skill.display_name, enabled=skill.enabled
    )


@router.get('/', response_model=list[OcuSkillUserItem])
async def list_skills(user=Depends(get_verified_user)):
    return [_user_item(skill) for skill in await OcuSkills.readable_skills(user.id, _admin_bypass(user))]


@router.post('/{name}/toggle', response_model=OcuSkillUserItem)
async def toggle_skill(name: str, form_data: OcuSkillToggleForm, user=Depends(get_verified_user)):
    # Unknown and unreadable share this one 404: the response never reveals an ungranted skill.
    readable = await OcuSkills.readable_skills(user.id, _admin_bypass(user), names=[name])
    if not readable:
        raise _skill_not_found()
    await OcuSkills.set_enabled(user.id, name, form_data.enabled)
    return _user_item(readable[0].model_copy(update={'enabled': form_data.enabled}))


def _internal_key_accepted(request: Request) -> bool:
    """X-Internal-Api-Key equals a non-empty OCU_INTERNAL_TOKEN, read per request (design Decision 2).

    UTF-8 bytes on both sides: Starlette decodes header bytes as latin-1, and compare_digest
    raises TypeError on a non-ASCII str instead of returning False.
    """
    token = os.environ.get('OCU_INTERNAL_TOKEN', '').encode()
    supplied = request.headers.get('X-Internal-Api-Key', '').encode()
    return bool(token) and hmac.compare_digest(supplied, token)


# The internal routes take no session dependency: the key is the only authority, and every
# refusal is an empty 401 sent before any DB access, so a bad key learns nothing about skills.
@router.get('/api/internal/user-config/{email}', response_model=OcuInternalUserConfig)
async def internal_user_config(email: str, request: Request):
    if not _internal_key_accepted(request):
        return Response(status_code=status.HTTP_401_UNAUTHORIZED)
    # No db argument: under session sharing a caller session with uncommitted writes must not reach these.
    user = await Users.get_user_by_email(email)
    skills = [] if user is None else await OcuSkills.readable_skills(user.id, _admin_bypass(user))
    return OcuInternalUserConfig(
        email=email,
        enabled_skills=[
            OcuInternalSkill(name=s.name, description=s.description, category='user', zip_sha256=s.zip_sha256)
            for s in skills
            if s.enabled
        ],
    )


@router.get('/api/internal/skills/{name}/download')
async def internal_download_skill(name: str, request: Request):
    if not _internal_key_accepted(request):
        return Response(status_code=status.HTTP_401_UNAUTHORIZED)
    skill = await OcuSkills.get_by_name(name)
    if skill is None:
        raise _skill_not_found()
    return Response(content=skill.data, media_type='application/zip')


@router.get('/admin', response_model=list[OcuSkillAdminItem], dependencies=[Depends(get_admin_user)])
async def list_admin_skills():
    skills = await OcuSkills.get_all()
    grants = await AccessGrants.get_grants_by_resources(OCU_SKILL_RESOURCE_TYPE, [skill.name for skill in skills])
    return [_admin_item(skill, grants[skill.name]) for skill in skills]


@router.post('/{name}/access', response_model=OcuSkillAdminItem, dependencies=[Depends(get_admin_user)])
async def update_skill_access(name: str, form_data: OcuSkillAccessForm):
    skill = await OcuSkills.get_metadata(name)
    if skill is None:
        raise _skill_not_found()
    grants = await AccessGrants.set_access_grants(OCU_SKILL_RESOURCE_TYPE, name, form_data.access_grants)
    return _admin_item(skill, grants)


def _checked_display_name(display_name: str | None) -> str | None:
    """The trimmed name, or None to clear it; 400 with the broken rule as the detail (design Decision 3)."""
    trimmed = (display_name or '').strip()
    if not trimmed:
        return None
    if len(trimmed) > MAX_DISPLAY_NAME_LENGTH:
        detail = f'display name must be at most {MAX_DISPLAY_NAME_LENGTH} characters'
    elif '<' in trimmed or '>' in trimmed:
        # The OCU filter's mention label class is [^<>]*: an angle bracket would end the marker.
        detail = 'display name must not contain < or >'
    elif any(unicodedata.category(char) == 'Cc' for char in trimmed):
        detail = 'display name must not contain control characters'
    else:
        return trimmed
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


@router.post('/{name}/display-name', response_model=OcuSkillAdminItem, dependencies=[Depends(get_admin_user)])
async def update_skill_display_name(name: str, form_data: OcuSkillDisplayNameForm):
    skill = await OcuSkills.set_display_name(name, _checked_display_name(form_data.display_name))
    if skill is None:
        raise _skill_not_found()
    return _admin_item(skill, await AccessGrants.get_grants_by_resource(OCU_SKILL_RESOURCE_TYPE, name))


@router.delete('/{name}', response_model=bool, dependencies=[Depends(get_admin_user)])
async def delete_skill(name: str):
    # Purge first, then 404: an orphaned grant or disable under an unknown name is removed too.
    if not await OcuSkills.delete_with_grants_and_disables(name):
        raise _skill_not_found()
    return True


async def _read_capped_body(request: Request) -> bytes:
    # Streamed with a running count instead of multipart: Starlette spools a whole multipart file
    # before the handler runs, so a cap there would not bound what the server reads.
    chunks, total = [], 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail='skill ZIP exceeds 50 MB')
        chunks.append(chunk)
    return b''.join(chunks)


@router.post('/upload', response_model=OcuSkillUploaded)
async def upload_skill(request: Request, user=Depends(get_admin_user)):
    # No body parameter: FastAPI resolves get_admin_user before the handler reads a single byte.
    body = await _read_capped_body(request)
    try:
        name, description = await asyncio.to_thread(validate_skill_zip, body)
    except SkillZipError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if name in RESERVED_SKILL_NAMES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"'{name}' is a reserved built-in skill")
    try:
        skill = await OcuSkills.upsert(name=name, description=description, data=body, created_by=user.id)
    except IntegrityError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"skill '{name}' already exists") from exc
    return OcuSkillUploaded(**skill.model_dump(include=set(OcuSkillUploaded.model_fields)))
