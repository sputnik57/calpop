"""add_envelope_artifact_type_value

The prior migration (723019d5abc4_add_envelope_artifact_type.py) was meant to
do this but its upgrade()/downgrade() were both left as `pass` -- a no-op
that Alembic still marked as applied. Found 09Aug2026 when generating a real
envelope artifact failed with:
  psycopg2.errors.InvalidTextRepresentation: invalid input value for enum
  submissionartifacttype: "envelope"
Not rewriting that already-applied migration (its content is what actually
ran, even if broken) -- adding the real DDL here instead.

Revision ID: e0a3ef005f19
Revises: 723019d5abc4
Create Date: 2026-08-09 14:14:26.451644

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e0a3ef005f19'
down_revision = '723019d5abc4'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TYPE submissionartifacttype ADD VALUE IF NOT EXISTS 'envelope'")


def downgrade():
    # Postgres does not support removing a value from an enum type directly.
    pass
