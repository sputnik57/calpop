"""add_sponsor_name_and_queue_statuses

Revision ID: 63e4196019db
Revises: e8f184ca2d6a
Create Date: 2026-08-09 19:10:45.002985

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '63e4196019db'
down_revision = 'e8f184ca2d6a'
branch_labels = None
depends_on = None


def upgrade():
    # Plaintext (not encrypted) -- deliberately queryable, e.g. WHERE sponsor_name
    # != 'Course', to build the write-queue vs. letter-scan-queue routing.
    # Synced from the roster's 'Sponsor' Excel column, which is authoritative.
    op.add_column('prisoner', sa.Column('sponsor_name', sa.Text(), nullable=True))

    # Two new Letter statuses for the Envelope Mgt routing decision:
    # - queued_for_writing: no real external sponsor (blank / "Course" sentinel /
    #   brand new person) -> admin writes directly.
    # - queued_for_letter_scan: a real named sponsor is assigned -> letter content
    #   needs scanning, manual redaction, and posting to that sponsor's OneDrive
    #   (Letter Mgt tab, built later -- this just marks the letter for that queue).
    op.execute("ALTER TYPE letterstatus ADD VALUE IF NOT EXISTS 'queued_for_writing'")
    op.execute("ALTER TYPE letterstatus ADD VALUE IF NOT EXISTS 'queued_for_letter_scan'")


def downgrade():
    # Postgres doesn't support removing enum values or columns cleanly here
    # without risking data loss; deliberate no-op, same as the last enum migration.
    pass
