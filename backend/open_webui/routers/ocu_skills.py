"""Administrator-uploaded OCU skill registry, mounted under /api/v1/ocu/skills.

Routes register unconditionally here; the workspace-enabled branch of the OCU
router decides whether this router is mounted at all.
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from open_webui.constants import ERROR_MESSAGES
from open_webui.models.access_grants import AccessGrantModel, AccessGrants
from open_webui.models.ocu_skills import OCU_SKILL_RESOURCE_TYPE, OcuSkillModel, OcuSkills
from open_webui.utils.auth import get_admin_user
from pydantic import BaseModel, Field

router = APIRouter()


class OcuSkillGrant(BaseModel):
    principal_type: str
    principal_id: str
    permission: str


class OcuSkillAdminItem(BaseModel):
    name: str
    description: str
    zip_sha256: str
    size: int
    created_by: str
    updated_at: int
    access_grants: list[OcuSkillGrant]


class OcuSkillAccessGrant(BaseModel):
    # Uploaded skills are read-only and sandboxes are never anonymous: any other grant could not take
    # effect, so it is rejected with 422 instead of being dropped.
    principal_type: Literal['user', 'group']
    principal_id: str = Field(min_length=1)
    permission: Literal['read']


class OcuSkillAccessForm(BaseModel):
    access_grants: list[OcuSkillAccessGrant]


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


@router.get('/admin', response_model=list[OcuSkillAdminItem], dependencies=[Depends(get_admin_user)])
async def list_admin_skills():
    skills = await OcuSkills.get_all()
    grants = await AccessGrants.get_grants_by_resources(OCU_SKILL_RESOURCE_TYPE, [skill.name for skill in skills])
    return [_admin_item(skill, grants[skill.name]) for skill in skills]


@router.post('/{name}/access', response_model=OcuSkillAdminItem, dependencies=[Depends(get_admin_user)])
async def update_skill_access(name: str, form_data: OcuSkillAccessForm):
    skill = await OcuSkills.get_by_name(name)
    if skill is None:
        raise _skill_not_found()
    grants = await AccessGrants.set_access_grants(OCU_SKILL_RESOURCE_TYPE, name, form_data.access_grants)
    return _admin_item(skill, grants)


@router.delete('/{name}', response_model=bool, dependencies=[Depends(get_admin_user)])
async def delete_skill(name: str):
    # Purge first, then 404: an orphaned grant or disable under an unknown name is removed too.
    if not await OcuSkills.delete_with_grants_and_disables(name):
        raise _skill_not_found()
    return True
