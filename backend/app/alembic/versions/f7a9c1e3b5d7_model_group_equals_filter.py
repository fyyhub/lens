"""Add exact model-group sync filters.

Revision ID: f7a9c1e3b5d7
Revises: e8b5c2d9a4f7
"""

from collections.abc import Sequence

from alembic import op

revision: str = "f7a9c1e3b5d7"
down_revision: str | None = "e8b5c2d9a4f7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("model_groups") as batch_op:
        batch_op.drop_constraint("ck_model_groups_sync_filter_mode", type_="check")
        batch_op.create_check_constraint(
            "ck_model_groups_sync_filter_mode",
            "sync_filter_mode IN ('', 'contains', 'equals', 'regex')",
        )


def downgrade() -> None:
    with op.batch_alter_table("model_groups") as batch_op:
        batch_op.drop_constraint("ck_model_groups_sync_filter_mode", type_="check")
        batch_op.create_check_constraint(
            "ck_model_groups_sync_filter_mode",
            "sync_filter_mode IN ('', 'contains', 'regex')",
        )
