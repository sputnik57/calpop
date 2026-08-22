"""add_literature_only_flag

Revision ID: 9f2f4748093e
Revises: da35999b240d
Create Date: 2026-08-22 15:12:01.258481

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '9f2f4748093e'
down_revision = 'da35999b240d'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('prisoner', sa.Column('literature_only', sa.Boolean(), nullable=True, server_default=sa.false()))


def downgrade():
    op.drop_column('prisoner', 'literature_only')
