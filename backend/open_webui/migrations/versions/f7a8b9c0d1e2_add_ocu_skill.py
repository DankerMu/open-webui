"""add ocu_skill and ocu_skill_user_disable

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-11-07
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'f7a8b9c0d1e2'
down_revision: str | None = 'e6f7a8b9c0d1'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    tables = sa.inspect(op.get_bind()).get_table_names()
    if 'ocu_skill' not in tables:
        op.create_table(
            'ocu_skill',
            sa.Column('name', sa.Text(), primary_key=True),
            sa.Column('description', sa.Text(), nullable=False),
            sa.Column('zip_sha256', sa.Text(), nullable=False),
            sa.Column('size', sa.BigInteger(), nullable=False),
            sa.Column('data', sa.LargeBinary(), nullable=False),
            sa.Column('created_by', sa.Text(), nullable=False),
            sa.Column('created_at', sa.BigInteger(), nullable=False),
            sa.Column('updated_at', sa.BigInteger(), nullable=False),
        )
    if 'ocu_skill_user_disable' not in tables:
        op.create_table(
            'ocu_skill_user_disable',
            sa.Column('user_id', sa.Text(), primary_key=True),
            sa.Column('skill_name', sa.Text(), primary_key=True),
        )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM access_grant WHERE resource_type = 'ocu_skill'"))
    op.drop_table('ocu_skill_user_disable')
    op.drop_table('ocu_skill')
