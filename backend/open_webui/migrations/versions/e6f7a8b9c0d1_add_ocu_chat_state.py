"""add ocu_chat_state

Revision ID: e6f7a8b9c0d1
Revises: d4c1a8e37b62
Create Date: 2026-09-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'e6f7a8b9c0d1'
down_revision: str | None = 'd4c1a8e37b62'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if 'ocu_chat_state' not in inspector.get_table_names():
        op.create_table(
            'ocu_chat_state',
            sa.Column('chat_id', sa.Text(), primary_key=True),
            sa.Column('last_seen_revision', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('prefs', sa.JSON(), nullable=False, server_default='{}'),
            sa.Column('updated_at', sa.BigInteger(), nullable=False),
        )


def downgrade() -> None:
    op.drop_table('ocu_chat_state')
