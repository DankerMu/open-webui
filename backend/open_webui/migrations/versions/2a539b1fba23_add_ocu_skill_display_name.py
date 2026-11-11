"""add ocu_skill.display_name

Revision ID: 2a539b1fba23
Revises: f7a8b9c0d1e2
Create Date: 2026-11-11
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '2a539b1fba23'
down_revision: str | None = 'f7a8b9c0d1e2'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    columns = {c['name'] for c in sa.inspect(op.get_bind()).get_columns('ocu_skill')}
    if 'display_name' not in columns:
        op.add_column('ocu_skill', sa.Column('display_name', sa.Text(), nullable=True))


def downgrade() -> None:
    # Batch mode: Alembic cannot drop a SQLite column in place, so batch recreates the table.
    with op.batch_alter_table('ocu_skill') as batch_op:
        batch_op.drop_column('display_name')
