"""Administrator-uploaded OCU skills: ZIP bytes in the DB, per-user disables."""

from __future__ import annotations

from open_webui.internal.db import Base, get_async_db_context
from pydantic import BaseModel, ConfigDict
from sqlalchemy import BigInteger, Column, LargeBinary, Text, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import deferred, undefer

OCU_SKILL_RESOURCE_TYPE = 'ocu_skill'


class OcuSkill(Base):
    __tablename__ = 'ocu_skill'

    name = Column(Text, primary_key=True)
    description = Column(Text, nullable=False)
    zip_sha256 = Column(Text, nullable=False)
    size = Column(BigInteger, nullable=False)
    # Deferred: list and enabled-set queries must never pull up to 50 MB of ZIP per row.
    data = deferred(Column(LargeBinary, nullable=False))
    created_by = Column(Text, nullable=False)
    created_at = Column(BigInteger, nullable=False)
    updated_at = Column(BigInteger, nullable=False)


class OcuSkillUserDisable(Base):
    __tablename__ = 'ocu_skill_user_disable'

    user_id = Column(Text, primary_key=True)
    skill_name = Column(Text, primary_key=True)


class OcuSkillModel(BaseModel):
    name: str
    description: str
    zip_sha256: str
    size: int
    created_by: str
    created_at: int
    updated_at: int

    model_config = ConfigDict(from_attributes=True)


class OcuSkillDataModel(OcuSkillModel):
    data: bytes


class OcuSkillTable:
    async def get_by_name(self, name: str, db: AsyncSession | None = None) -> OcuSkillDataModel | None:
        async with get_async_db_context(db) as db:
            row = await db.get(OcuSkill, name, options=[undefer(OcuSkill.data)])
            return OcuSkillDataModel.model_validate(row) if row else None

    async def get_all(self, db: AsyncSession | None = None) -> list[OcuSkillModel]:
        async with get_async_db_context(db) as db:
            result = await db.execute(select(OcuSkill).order_by(OcuSkill.name))
            return [OcuSkillModel.model_validate(row) for row in result.scalars().all()]


OcuSkills = OcuSkillTable()
