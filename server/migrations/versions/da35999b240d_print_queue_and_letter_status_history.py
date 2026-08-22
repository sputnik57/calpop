"""print_queue_and_letter_status_history

Revision ID: da35999b240d
Revises: 525e61add4e2
Create Date: 2026-08-22 14:29:12.323135

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'da35999b240d'
down_revision = '525e61add4e2'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('prisoner', sa.Column('queued_for_printing_at', sa.DateTime(), nullable=True))

    op.create_table(
        'letterstatushistory',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('letter_id', sa.Integer(), sa.ForeignKey('letter.id'), nullable=False),
        # Reuse the existing 'letterstatus' Postgres enum (created by the
        # initial schema migration) -- create_type=False so this doesn't try
        # to CREATE TYPE a second time.
        sa.Column('status', postgresql.ENUM(
            'intake', 'scanned', 'redacted', 'reviewed', 'assigned',
            'response_started', 'sponsor_submitted', 'revisions_requested',
            'approved', 'archived', 'queued_for_writing', 'queued_for_letter_scan',
            name='letterstatus', create_type=False,
        ), nullable=False),
        sa.Column('changed_at', sa.DateTime(), nullable=False),
        sa.Column('changed_by', sa.Integer(), sa.ForeignKey('user.id'), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
    )
    op.create_index('ix_letterstatushistory_letter_id', 'letterstatushistory', ['letter_id'])


def downgrade():
    op.drop_index('ix_letterstatushistory_letter_id', table_name='letterstatushistory')
    op.drop_table('letterstatushistory')
    op.drop_column('prisoner', 'queued_for_printing_at')
