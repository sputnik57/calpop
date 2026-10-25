"""waiting for sponsor status

Revision ID: b7e3f9a2d415
Revises: a6d2e8f1c390
Create Date: 2026-10-25

Adds 'waiting_for_sponsor' to the letterstatus enum: a scanned letter from
someone with no sponsor yet, held in the sponsor backlog (Rey, 25Oct2026).
Replaces "Assign Sponsor Queue" at scan-confirm, which only ever set
queued_for_letter_scan -- the same status as routing to a real sponsor.
"""
from alembic import op

revision = 'b7e3f9a2d415'
down_revision = 'a6d2e8f1c390'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TYPE letterstatus ADD VALUE IF NOT EXISTS 'waiting_for_sponsor'")


def downgrade():
    # Postgres can't drop a single enum value; letters using it would need
    # moving to another status first. Left in place on downgrade.
    pass
