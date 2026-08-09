"""encrypt_prisoner_pii_columns

Revision ID: e8f184ca2d6a
Revises: e0a3ef005f19
Create Date: 2026-08-09 16:54:27.492505

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e8f184ca2d6a'
down_revision = 'e0a3ef005f19'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('prisoner', sa.Column('cdcr_number', sa.Text(), nullable=True))
    op.add_column('prisoner', sa.Column('housing', sa.Text(), nullable=True))
    # Widen to TEXT -- AES-256-GCM ciphertext (base64, nonce+tag overhead) is
    # longer than the plaintext ever was, so the old VARCHAR limits would
    # truncate encrypted values.
    op.alter_column('prisoner', 'first_name', type_=sa.Text())
    op.alter_column('prisoner', 'last_name', type_=sa.Text())
    op.alter_column('prisoner', 'facility', type_=sa.Text())
    op.alter_column('prisoner', 'address', type_=sa.Text())
    op.alter_column('prisoner', 'city', type_=sa.Text())
    op.alter_column('prisoner', 'state', type_=sa.Text())
    op.alter_column('prisoner', 'zip', type_=sa.Text())


def downgrade():
    # Not reversible via pure DDL: existing values are ciphertext at this
    # point, and decrypting them back down to plaintext (to safely narrow
    # the columns again) requires the app's encryption key, not just SQL.
    # cdcr_number also has no prior column to revert to. Deliberate no-op.
    pass
