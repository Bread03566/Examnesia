"""add client_type to sessions for web vs native refresh flow isolation

Revision ID: 0007
Revises: 0006
"""
from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("sessions") as batch:
        batch.add_column(sa.Column("client_type", sa.String(10), nullable=False, server_default="web"))
        batch.create_check_constraint("ck_sessions_client_type", "client_type IN ('web', 'native')")


def downgrade() -> None:
    with op.batch_alter_table("sessions") as batch:
        batch.drop_constraint("ck_sessions_client_type", type_="check")
        batch.drop_column("client_type")
