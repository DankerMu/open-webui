"""Administrator-uploaded OCU skill registry, mounted under /api/v1/ocu/skills.

Routes register unconditionally here; the workspace-enabled branch of the OCU
router decides whether this router is mounted at all.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from open_webui.models.access_grants import AccessGrants
from open_webui.models.ocu_skills import OCU_SKILL_RESOURCE_TYPE, OcuSkills
from open_webui.utils.auth import get_admin_user
from pydantic import BaseModel

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


@router.get('/admin', response_model=list[OcuSkillAdminItem], dependencies=[Depends(get_admin_user)])
async def list_admin_skills():
    skills = await OcuSkills.get_all()
    grants = await AccessGrants.get_grants_by_resources(OCU_SKILL_RESOURCE_TYPE, [skill.name for skill in skills])
    return [
        OcuSkillAdminItem(
            **skill.model_dump(exclude={'created_at'}),
            access_grants=[
                OcuSkillGrant(principal_type=g.principal_type, principal_id=g.principal_id, permission=g.permission)
                for g in grants[skill.name]
                if g.permission == 'read'
            ],
        )
        for skill in skills
    ]
