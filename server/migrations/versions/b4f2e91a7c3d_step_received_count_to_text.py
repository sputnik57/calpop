"""step_received_count from integer to encrypted text

Rey's real roster values for this field are free text ("Step 4", "3
circles", "Intro"), not bare numbers -- an Integer column silently dropped
every one of them on import (int("Step 4") raises, caught and turned into
NULL with no error shown). Found 29Sep2026 while tracing why Current Step
values were never transferring from an upload. Rey confirmed: keep the text
as-is, don't force it into numbers.

The Python-side type change (Integer -> EncryptedString, matching this
model's stated default of encrypting anything tied to a specific person) is
in db/models.py. EncryptedString's impl is Text (db/encrypted_types.py), so
this migration only needs to widen the SQL column -- it does NOT encrypt the
one existing value (SFN568's "4") itself, since that only happens via the
ORM's process_bind_param on a real write. That row is re-saved through the
app immediately after this migration runs, as a separate step, so it isn't
left as unencrypted plaintext in a now-Text column.

Revision ID: b4f2e91a7c3d
Revises: 42fe77a5be6a
Create Date: 2026-09-29

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b4f2e91a7c3d'
down_revision = '42fe77a5be6a'
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column(
        'prisoner', 'step_received_count',
        existing_type=sa.Integer(),
        type_=sa.Text(),
        postgresql_using='step_received_count::text',
    )


def downgrade():
    # Will raise on any non-numeric value ("Step 4", "Intro", "3 circles")
    # rather than silently discard it -- correct behavior given this data is
    # now expected to be free text, not a safety net worth pretending exists.
    op.alter_column(
        'prisoner', 'step_received_count',
        existing_type=sa.Text(),
        type_=sa.Integer(),
        postgresql_using='step_received_count::integer',
    )
