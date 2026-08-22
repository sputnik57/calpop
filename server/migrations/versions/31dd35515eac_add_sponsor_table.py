"""add_sponsor_table

Revision ID: 31dd35515eac
Revises: 9f2f4748093e
Create Date: 2026-08-22 16:39:45.493364

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '31dd35515eac'
down_revision = '9f2f4748093e'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'sponsor',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('pseudonym', sa.Text(), nullable=True),
        sa.Column('email', sa.Text(), nullable=True),
        sa.Column('phone', sa.Text(), nullable=True),
        sa.Column('sponsor_type', sa.Text(), nullable=False, server_default='individual'),
        sa.Column('onedrive_folder_link', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )


def downgrade():
    op.drop_table('sponsor')
