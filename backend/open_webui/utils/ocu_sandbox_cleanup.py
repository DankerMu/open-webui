"""Best-effort OCU sandbox deletion after WebUI chats are deleted.

Chat-deletion paths call `schedule_sandbox_cleanup` with the ids whose own
database delete succeeded, or delete a user's chats through `delete_user_chats`.
The OCU requests run in one background task and never delay, fail or alter the
deletion that scheduled them.
"""

from __future__ import annotations

import asyncio
import logging
import os

from open_webui.internal.db import get_async_db_context
from open_webui.models.chats import Chat, Chats
from open_webui.utils.ocu_client import OcuClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

log = logging.getLogger(__name__)

CLEANUP_CONCURRENCY = 4

# The event loop holds tasks only weakly; this set keeps each one alive until it finishes.
_background_tasks: set[asyncio.Task] = set()


def _workspace_enabled() -> bool:
    # Same parse as routers/ocu_workspaces.py; read here so model-layer callers need not import a router.
    return os.getenv('ENABLE_OCU_WORKSPACE', 'False').lower() == 'true'


def _warn(chat_id: str, exc: Exception) -> None:
    # Class name and HTTP status only: exception text from the transport is not ours to vouch for.
    status = getattr(exc, 'status', None)
    failure = type(exc).__name__ if status is None else f'{type(exc).__name__} status={status}'
    log.warning('OCU sandbox cleanup failed for chat %s: %s', chat_id, failure)


async def _delete_one(client, semaphore: asyncio.Semaphore, chat_id: str) -> None:
    async with semaphore:
        try:
            await client.delete_sandbox(chat_id)
        except Exception as exc:
            _warn(chat_id, exc)


async def _delete_sandboxes(chat_ids: list[str]) -> None:
    semaphore = asyncio.Semaphore(CLEANUP_CONCURRENCY)
    try:
        async with OcuClient() as client:
            await asyncio.gather(*(_delete_one(client, semaphore, chat_id) for chat_id in chat_ids))
    except Exception as exc:
        # Missing OCU configuration or a session that failed to close; per-chat failures are logged above.
        for chat_id in chat_ids:
            _warn(chat_id, exc)


def schedule_sandbox_cleanup(chat_ids: list[str]) -> None:
    """Request OCU deletion of each chat's sandbox in the background; a no-op when the workspace is off."""
    if not chat_ids or not _workspace_enabled():
        return
    task = asyncio.get_running_loop().create_task(_delete_sandboxes(list(chat_ids)))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


async def _chat_ids(query, db: AsyncSession | None) -> list[str] | None:
    """Run an id query; None when the database read fails, so the caller schedules nothing."""
    try:
        async with get_async_db_context(db) as session:
            return list((await session.execute(query)).scalars().all())
    except Exception as exc:
        log.warning('OCU sandbox cleanup skipped: chat id query failed: %s', type(exc).__name__)
        return None


async def delete_user_chats(user_id: str, folder_id: str | None = None, db: AsyncSession | None = None) -> bool:
    """Delete all of a user's chats, or only those in `folder_id`, and schedule their sandbox cleanup.

    The candidate ids are read before the delete with the delete's own filter. After the delete
    reports success, only candidates that no longer exist are scheduled: a chat moved out of the
    folder in between survives and must keep its sandbox. The delete commits on its own, so
    cleanup is scheduled whatever the caller does next. A failed id query schedules nothing and
    leaves the delete and its result as they are.
    """
    candidates = select(Chat.id).filter_by(user_id=user_id)
    if folder_id is not None:
        candidates = candidates.filter_by(folder_id=folder_id)
    chat_ids = await _chat_ids(candidates, db)
    if folder_id is None:
        deleted = await Chats.delete_chats_by_user_id(user_id, db=db)
    else:
        deleted = await Chats.delete_chats_by_user_id_and_folder_id(user_id, folder_id, db=db)
    if deleted and chat_ids:
        surviving = await _chat_ids(select(Chat.id).where(Chat.id.in_(chat_ids)), db)
        if surviving is not None:
            schedule_sandbox_cleanup(sorted(set(chat_ids) - set(surviving)))
    return deleted
