"""letter journey tracking

Revision ID: d19a3f6c8e21
Revises: c7a19e4b2f08
Create Date: 2026-09-29

Adds the remaining fields of Rey's real paper "Letter Journey" checklist to
LetterDates (address_change_confirmed, uploaded_at, sponsor_reply_item_id,
sponsor_visit_* snapshot, informed_sponsor_at, sponsor_finished_at,
admin_reviewed_at, printed_at, mailed_at), plus a new LetterReminder table
for the plural "date(s) remind sponsor" log. See db/models.py's LetterDates
and LetterReminder docstrings for the full per-field auto/manual reasoning.
"""
from alembic import op
import sqlalchemy as sa

revision = 'd19a3f6c8e21'
down_revision = 'c7a19e4b2f08'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('letterdates', sa.Column('address_change_confirmed', sa.Boolean(), nullable=True))
    op.add_column('letterdates', sa.Column('uploaded_at', sa.DateTime(), nullable=True))
    op.add_column('letterdates', sa.Column('sponsor_reply_item_id', sa.Text(), nullable=True))
    op.add_column('letterdates', sa.Column('sponsor_visit_count', sa.Integer(), nullable=True))
    op.add_column('letterdates', sa.Column('sponsor_visit_actor_count', sa.Integer(), nullable=True))
    op.add_column('letterdates', sa.Column('sponsor_visit_seconds', sa.Integer(), nullable=True))
    op.add_column('letterdates', sa.Column('sponsor_visit_checked_at', sa.DateTime(), nullable=True))
    op.add_column('letterdates', sa.Column('informed_sponsor_at', sa.DateTime(), nullable=True))
    op.add_column('letterdates', sa.Column('sponsor_finished_at', sa.DateTime(), nullable=True))
    op.add_column('letterdates', sa.Column('admin_reviewed_at', sa.DateTime(), nullable=True))
    op.add_column('letterdates', sa.Column('printed_at', sa.DateTime(), nullable=True))
    op.add_column('letterdates', sa.Column('mailed_at', sa.DateTime(), nullable=True))

    op.create_table(
        'letterreminder',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('letter_id', sa.Integer(), sa.ForeignKey('letter.id'), nullable=False),
        sa.Column('reminded_at', sa.DateTime(), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('user.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )


def downgrade():
    op.drop_table('letterreminder')
    op.drop_column('letterdates', 'mailed_at')
    op.drop_column('letterdates', 'printed_at')
    op.drop_column('letterdates', 'admin_reviewed_at')
    op.drop_column('letterdates', 'sponsor_finished_at')
    op.drop_column('letterdates', 'informed_sponsor_at')
    op.drop_column('letterdates', 'sponsor_visit_checked_at')
    op.drop_column('letterdates', 'sponsor_visit_seconds')
    op.drop_column('letterdates', 'sponsor_visit_actor_count')
    op.drop_column('letterdates', 'sponsor_visit_count')
    op.drop_column('letterdates', 'sponsor_reply_item_id')
    op.drop_column('letterdates', 'uploaded_at')
    op.drop_column('letterdates', 'address_change_confirmed')
