"""add active flag to sponsor

A sponsor dropping is a real, expected event -- Rey: "Dan also dropped as a
sponsor. there should be a delete sponsor, or archive sponsor option." A
hard delete would lose contact info and OneDrive folder history for no
reason (nothing else has a foreign key to Sponsor.id, so it's technically
safe, but this project's existing convention for "this relationship ended"
is a status flag + note, not deletion -- see Prisoner.review_notes entries
like "dropped from CalPOP"). Archiving also matters functionally, not just
for record-keeping: an archived sponsor should stop being offered as an
upload destination in ScanLetterUpload.jsx's dropdown.

Revision ID: c7a19e4b2f08
Revises: b4f2e91a7c3d
Create Date: 2026-09-29

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c7a19e4b2f08'
down_revision = 'b4f2e91a7c3d'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'sponsor',
        sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade():
    op.drop_column('sponsor', 'active')
