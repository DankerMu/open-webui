"""Administrator-uploaded OCU skills: ZIP bytes in the DB, per-user disables."""

from __future__ import annotations

import hashlib
import time
import uuid

from open_webui.internal.db import Base, get_async_db_context
from open_webui.models.access_grants import AccessGrant, AccessGrants
from pydantic import BaseModel, ConfigDict
from sqlalchemy import BigInteger, Column, LargeBinary, Text, delete, insert, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import deferred, undefer

OCU_SKILL_RESOURCE_TYPE = 'ocu_skill'


class OcuSkill(Base):
    __tablename__ = 'ocu_skill'

    name = Column(Text, primary_key=True)
    description = Column(Text, nullable=False)
    # Administrator-set label for the WebUI only; NULL shows the English name.
    display_name = Column(Text, nullable=True)
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
    display_name: str | None
    zip_sha256: str
    size: int
    created_by: str
    created_at: int
    updated_at: int

    model_config = ConfigDict(from_attributes=True)


class OcuSkillDataModel(OcuSkillModel):
    data: bytes


class OcuSkillReadableModel(BaseModel):
    name: str
    description: str
    display_name: str | None
    zip_sha256: str
    enabled: bool


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

    async def get_metadata(self, name: str, db: AsyncSession | None = None) -> OcuSkillModel | None:
        async with get_async_db_context(db) as db:
            row = await db.get(OcuSkill, name)
            return OcuSkillModel.model_validate(row) if row else None

    async def set_display_name(
        self, name: str, display_name: str | None, db: AsyncSession | None = None
    ) -> OcuSkillModel | None:
        """Write only display_name (NULL clears it) and return the row; None when no skill has that name.

        One UPDATE, then a metadata read that leaves the deferred data unloaded; updated_at stays,
        because the label is not part of the skill's content.
        """
        async with get_async_db_context(db) as db:
            # synchronize_session=False: the 'auto' default may add a SELECT or RETURNING to the UPDATE.
            result = await db.execute(
                update(OcuSkill)
                .where(OcuSkill.name == name)
                .values(display_name=display_name)
                .execution_options(synchronize_session=False)
            )
            if not result.rowcount:
                return None
            await db.commit()
            return await self.get_metadata(name, db=db)

    async def readable_skills(
        self, user_id: str, bypass: bool, names: list[str] | None = None, db: AsyncSession | None = None
    ) -> list[OcuSkillReadableModel]:
        """The one readable/enabled-set definition (design Decision 6), ordered by name.

        A skill is readable when it exists and either bypass is set or the existing access-grant
        filter (wildcard, direct user, group membership) grants read; it is enabled when the user
        has no disable row for it. `names` narrows the set to those names.
        """
        columns = (OcuSkill.name, OcuSkill.description, OcuSkill.display_name, OcuSkill.zip_sha256)
        query = select(*columns).order_by(OcuSkill.name)
        if names is not None:
            query = query.where(OcuSkill.name.in_(names))
        async with get_async_db_context(db) as db:
            rows = (await db.execute(query)).all()
            if not bypass:
                granted = await AccessGrants.get_accessible_resource_ids(
                    user_id, OCU_SKILL_RESOURCE_TYPE, [row.name for row in rows], 'read', db=db
                )
                rows = [row for row in rows if row.name in granted]
            disable = OcuSkillUserDisable
            readable = [row.name for row in rows]
            query = select(disable.skill_name).where(disable.user_id == user_id, disable.skill_name.in_(readable))
            disabled = set(await db.scalars(query))
            return [OcuSkillReadableModel(**row._mapping, enabled=row.name not in disabled) for row in rows]

    async def set_enabled(self, user_id: str, name: str, enabled: bool, db: AsyncSession | None = None) -> None:
        """Delete (enable) or insert (disable) the user's disable row; both are idempotent.

        The disable INSERTs without reading first, so a concurrent double toggle is safe on any database.
        """
        async with get_async_db_context(db) as db:
            if enabled:
                disable = OcuSkillUserDisable
                await db.execute(delete(disable).where(disable.user_id == user_id, disable.skill_name == name))
                await db.commit()
                return
            try:
                await db.execute(insert(OcuSkillUserDisable).values(user_id=user_id, skill_name=name))
                await db.commit()
            except IntegrityError:
                # Only the (user_id, skill_name) primary key can conflict: the row is already there.
                await db.rollback()

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
