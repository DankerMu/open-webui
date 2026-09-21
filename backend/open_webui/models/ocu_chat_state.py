"""Per-chat OCU workspace state: revision cursor and UI preferences."""

from __future__ import annotations

import time
from typing import Any

from open_webui.internal.db import Base, get_async_db_context
from pydantic import BaseModel, ConfigDict
from sqlalchemy import JSON, BigInteger, Column, Integer, Text
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
                row = OcuChatState(
                    chat_id=chat_id,
                    last_seen_revision=0,
                    prefs=prefs,
                    updated_at=now,
                )
                db.add(row)
            else:
                row.prefs = prefs
                row.updated_at = now
            await db.commit()
            await db.refresh(row)
            return OcuChatStateModel.model_validate(row)

    async def advance_cursor(self, chat_id: str, revision: int, db: AsyncSession | None = None) -> OcuChatStateModel:
        async with get_async_db_context(db) as db:
            row = await db.get(OcuChatState, chat_id)
            if row is None:
                row = OcuChatState(
                    chat_id=chat_id,
                    last_seen_revision=revision,
                    prefs={},
                    updated_at=int(time.time_ns()),
                )
                db.add(row)
                await db.commit()
                await db.refresh(row)
                return OcuChatStateModel.model_validate(row)
            if revision > row.last_seen_revision:
                row.last_seen_revision = revision
                row.updated_at = int(time.time_ns())
                await db.commit()
                await db.refresh(row)
            return OcuChatStateModel.model_validate(row)


OcuChatStates = OcuChatStateTable()
