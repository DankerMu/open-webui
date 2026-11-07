"""Administrator-uploaded OCU skills: ZIP bytes in the DB, per-user disables."""

from __future__ import annotations

import hashlib
import time
import uuid

from open_webui.internal.db import Base, get_async_db_context
from open_webui.models.access_grants import AccessGrant
from pydantic import BaseModel, ConfigDict
from sqlalchemy import BigInteger, Column, LargeBinary, Text, delete, select, update
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


async def _purge_grants_and_disables(db: AsyncSession, name: str) -> None:
    await db.execute(
        delete(AccessGrant).where(AccessGrant.resource_type == OCU_SKILL_RESOURCE_TYPE, AccessGrant.resource_id == name)
    )
    await db.execute(delete(OcuSkillUserDisable).where(OcuSkillUserDisable.skill_name == name))


class OcuSkillTable:
    async def get_by_name(self, name: str, db: AsyncSession | None = None) -> OcuSkillDataModel | None:
        async with get_async_db_context(db) as db:
            row = await db.get(OcuSkill, name, options=[undefer(OcuSkill.data)])
            return OcuSkillDataModel.model_validate(row) if row else None

    async def get_all(self, db: AsyncSession | None = None) -> list[OcuSkillModel]:
        async with get_async_db_context(db) as db:
            result = await db.execute(select(OcuSkill).order_by(OcuSkill.name))
            return [OcuSkillModel.model_validate(row) for row in result.scalars().all()]

    async def delete_with_grants_and_disables(self, name: str, db: AsyncSession | None = None) -> bool:
        """Delete the row, its grants and every disable in one commit; return whether the row existed.

        The grant and disable deletes run even without a row, so a grant orphaned by an access
        update racing a delete is purged by the next delete of that name.
        """
        async with get_async_db_context(db) as db:
            result = await db.execute(delete(OcuSkill).where(OcuSkill.name == name))
            await _purge_grants_and_disables(db, name)
            await db.commit()
            return result.rowcount > 0

    async def upsert(
        self, *, name: str, description: str, data: bytes, created_by: str, db: AsyncSession | None = None
    ) -> OcuSkillModel:
        """Replace an existing skill in place, or insert a first upload with one user:* read grant.

        One commit. The UPDATE runs first and never loads the old data: a replace keeps created_by,
        created_at, grants and disables. A first upload purges orphaned grants and disables of its
        name. A concurrent first upload between the UPDATE and the INSERT raises IntegrityError, and
        closing the session rolls the purge back with it. AccessGrants.set_access_grants is not used
        because it commits in its own session.
        """
        now = int(time.time())
        row = OcuSkill(
            name=name,
            description=description,
            zip_sha256=hashlib.sha256(data).hexdigest(),
            size=len(data),
            data=data,
            created_by=created_by,
            created_at=now,
            updated_at=now,
        )
        grant = AccessGrant(
            id=str(uuid.uuid4()),
            resource_type=OCU_SKILL_RESOURCE_TYPE,
            resource_id=name,
            principal_type='user',
            principal_id='*',
            permission='read',
            created_at=now,
        )
        replace = {key: getattr(row, key) for key in ('data', 'zip_sha256', 'size', 'description', 'updated_at')}
        async with get_async_db_context(db) as db:
            # synchronize_session=False: the 'auto' default may add a SELECT or RETURNING to the UPDATE.
            result = await db.execute(
                update(OcuSkill)
                .where(OcuSkill.name == name)
                .values(**replace)
                .execution_options(synchronize_session=False)
            )
            if result.rowcount:
                row = (await db.execute(select(OcuSkill).where(OcuSkill.name == name))).scalar_one()
            else:
                await _purge_grants_and_disables(db, name)
                db.add_all([row, grant])
            await db.commit()
            return OcuSkillModel.model_validate(row)


OcuSkills = OcuSkillTable()
