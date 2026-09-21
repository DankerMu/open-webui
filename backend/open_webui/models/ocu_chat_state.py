"""Per-chat OCU workspace state: revision cursor and UI preferences."""

from __future__ import annotations

import time
from typing import Any

from open_webui.internal.db import Base, get_async_db_context
from pydantic import BaseModel, ConfigDict
from sqlalchemy import JSON, BigInteger, Column, Integer, Text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession


class OcuChatState(Base):
    __tablename__ = 'ocu_chat_state'

    chat_id = Column(Text, primary_key=True)
    last_seen_revision = Column(Integer, nullable=False, default=0, server_default='0')
    prefs = Column(JSON, nullable=False, default=dict, server_default='{}')
    updated_at = Column(BigInteger, nullable=False)


class OcuChatStateModel(BaseModel):
    chat_id: str
    last_seen_revision: int
    prefs: dict[str, Any]
    updated_at: int

    model_config = ConfigDict(from_attributes=True)


class OcuChatStateTable:
    async def _load(self, db: AsyncSession, chat_id: str) -> OcuChatState | None:
        return await db.get(OcuChatState, chat_id, populate_existing=True)

    async def _advance_row(self, db: AsyncSession, chat_id: str, revision: int, now: int) -> int:
        result = await db.execute(
            update(OcuChatState)
            .where(OcuChatState.chat_id == chat_id, OcuChatState.last_seen_revision < revision)
            .values(last_seen_revision=revision, updated_at=now)
        )
        return result.rowcount or 0

    async def get(self, chat_id: str, db: AsyncSession | None = None) -> OcuChatStateModel | None:
        async with get_async_db_context(db) as db:
            row = await db.get(OcuChatState, chat_id)
            return OcuChatStateModel.model_validate(row) if row else None

    async def upsert_prefs(
        self, chat_id: str, prefs: dict[str, Any], db: AsyncSession | None = None
    ) -> OcuChatStateModel:
        async with get_async_db_context(db) as db:
            now = int(time.time_ns())
            row = await db.get(OcuChatState, chat_id)
            if row is None:
                db.add(
                    OcuChatState(
                        chat_id=chat_id,
                        last_seen_revision=0,
                        prefs=prefs,
                        updated_at=now,
                    )
                )
                try:
                    await db.commit()
                except IntegrityError:
                    await db.rollback()
                    if await self._load(db, chat_id) is None:
                        raise
                    await db.execute(
                        update(OcuChatState).where(OcuChatState.chat_id == chat_id).values(prefs=prefs, updated_at=now)
                    )
                    await db.commit()
            else:
                await db.execute(
                    update(OcuChatState).where(OcuChatState.chat_id == chat_id).values(prefs=prefs, updated_at=now)
                )
                await db.commit()
            row = await self._load(db, chat_id)
            assert row is not None
            return OcuChatStateModel.model_validate(row)

    async def advance_cursor(self, chat_id: str, revision: int, db: AsyncSession | None = None) -> OcuChatStateModel:
        async with get_async_db_context(db) as db:
            now = int(time.time_ns())
            row = await db.get(OcuChatState, chat_id)
            if row is None:
                db.add(
                    OcuChatState(
                        chat_id=chat_id,
                        last_seen_revision=revision,
                        prefs={},
                        updated_at=now,
                    )
                )
                try:
                    await db.commit()
                except IntegrityError:
                    await db.rollback()
                    if await self._load(db, chat_id) is None:
                        raise
                    await self._advance_row(db, chat_id, revision, now)
                    await db.commit()
            else:
                await self._advance_row(db, chat_id, revision, now)
                await db.commit()
            row = await self._load(db, chat_id)
            assert row is not None
            return OcuChatStateModel.model_validate(row)


OcuChatStates = OcuChatStateTable()
