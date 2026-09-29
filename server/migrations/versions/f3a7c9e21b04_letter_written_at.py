"""letter written date + make postmark editable

Revision ID: f3a7c9e21b04
Revises: d19a3f6c8e21
Create Date: 2026-09-29

Adds LetterDates.letter_written_at (the date on the letter itself, distinct
from postmarked_at's envelope postmark) -- both are now correctable via
PATCH /api/letters/{id}/journey (see schemas/letter.py's LetterJourneyUpdate).
"""
from alembic import op
import sqlalchemy as sa

revision = 'f3a7c9e21b04'
down_revision = 'd19a3f6c8e21'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('letterdates', sa.Column('letter_written_at', sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column('letterdates', 'letter_written_at')
