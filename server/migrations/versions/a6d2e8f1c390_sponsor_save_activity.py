"""sponsor save activity

Revision ID: a6d2e8f1c390
Revises: f3a7c9e21b04
Create Date: 2026-10-25

Adds a snapshot of the sponsor's saves on the reply doc to LetterDates:
first save, last save, number of saves, and when it was last checked. Read
on demand from OneDrive's version history. Per Rey (25Oct2026), the save
count is a good indicator of a sponsor's activity, not proof of it. Kept
per letter so a later admin view can roll it up per sponsor.
"""
from alembic import op
import sqlalchemy as sa

revision = 'a6d2e8f1c390'
down_revision = 'f3a7c9e21b04'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('letterdates', sa.Column('sponsor_first_save_at', sa.DateTime(), nullable=True))
    op.add_column('letterdates', sa.Column('sponsor_last_save_at', sa.DateTime(), nullable=True))
    op.add_column('letterdates', sa.Column('sponsor_save_count', sa.Integer(), nullable=True))
    op.add_column('letterdates', sa.Column('sponsor_saves_checked_at', sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column('letterdates', 'sponsor_saves_checked_at')
    op.drop_column('letterdates', 'sponsor_save_count')
    op.drop_column('letterdates', 'sponsor_last_save_at')
    op.drop_column('letterdates', 'sponsor_first_save_at')
