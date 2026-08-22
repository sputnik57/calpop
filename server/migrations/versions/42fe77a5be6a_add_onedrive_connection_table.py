"""add_onedrive_connection_table

Revision ID: 42fe77a5be6a
Revises: 31dd35515eac
Create Date: 2026-08-22 17:28:02.543109

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '42fe77a5be6a'
down_revision = '31dd35515eac'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'onedriveconnection',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('account_email', sa.Text(), nullable=True),
        sa.Column('access_token', sa.Text(), nullable=True),
        sa.Column('refresh_token', sa.Text(), nullable=True),
        sa.Column('access_token_expires_at', sa.DateTime(), nullable=True),
        sa.Column('connected_by', sa.Integer(), sa.ForeignKey('user.id'), nullable=True),
        sa.Column('connected_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )


def downgrade():
    op.drop_table('onedriveconnection')
