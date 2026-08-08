"""focus_on_cpid

Revision ID: 4edc1141f56b
Revises: fd11341bd08c
Create Date: 2026-01-02 16:50:36.370818

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '4edc1141f56b'
down_revision = 'fd11341bd08c'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Add columns as nullable first
    op.add_column('assignment', sa.Column('prisoner_cpid', sa.String(length=100), nullable=True))
    op.add_column('envelopejob', sa.Column('prisoner_cpid', sa.String(length=100), nullable=True))
    op.add_column('letter', sa.Column('prisoner_cpid', sa.String(length=100), nullable=True))
    op.add_column('sponsorprisoner', sa.Column('prisoner_cpid', sa.String(length=100), nullable=True))

    # 2. Data Migration: Populate prisoner_cpid from prisoner.cpid using prisoner_id
    op.execute("UPDATE assignment SET prisoner_cpid = (SELECT cpid FROM prisoner WHERE prisoner.id = assignment.prisoner_id)")
    op.execute("UPDATE envelopejob SET prisoner_cpid = (SELECT cpid FROM prisoner WHERE prisoner.id = envelopejob.prisoner_id)")
    op.execute("UPDATE letter SET prisoner_cpid = (SELECT cpid FROM prisoner WHERE prisoner.id = letter.prisoner_id)")
    op.execute("UPDATE sponsorprisoner SET prisoner_cpid = (SELECT cpid FROM prisoner WHERE prisoner.id = sponsorprisoner.prisoner_id)")

    # 3. Set columns to NOT NULL where appropriate
    op.execute("ALTER TABLE assignment ALTER COLUMN prisoner_cpid SET NOT NULL")
    op.execute("ALTER TABLE envelopejob ALTER COLUMN prisoner_cpid SET NOT NULL")
    op.execute("ALTER TABLE letter ALTER COLUMN prisoner_cpid SET NOT NULL")
    op.execute("ALTER TABLE sponsorprisoner ALTER COLUMN prisoner_cpid SET NOT NULL")

    # 4. Drop OLD foreign keys that depend on prisoner.id
    op.drop_constraint(op.f('assignment_prisoner_id_fkey'), 'assignment', type_='foreignkey')
    op.drop_column('assignment', 'prisoner_id')
    
    op.drop_constraint(op.f('envelopejob_prisoner_id_fkey'), 'envelopejob', type_='foreignkey')
    op.drop_column('envelopejob', 'prisoner_id')
    
    op.drop_constraint(op.f('letter_prisoner_id_fkey'), 'letter', type_='foreignkey')
    op.drop_column('letter', 'prisoner_id')
    
    op.drop_constraint(op.f('sponsorprisoner_prisoner_id_fkey'), 'sponsorprisoner', type_='foreignkey')
    op.drop_column('sponsorprisoner', 'prisoner_id')

    # 5. Handle Prisoner table primary key change
    # First, drop the unique constraint on cpid (index name might vary, we use the one from the error log)
    op.execute("ALTER TABLE prisoner DROP CONSTRAINT IF EXISTS prisoner_cpid_key CASCADE")
    
    # Drop old ID index and PK
    op.drop_index(op.f('ix_prisoner_id'), table_name='prisoner')
    op.execute("ALTER TABLE prisoner DROP CONSTRAINT IF EXISTS prisoner_pkey CASCADE")
    op.drop_column('prisoner', 'id')
    
    # Create NEW PK on cpid
    op.execute("ALTER TABLE prisoner ADD PRIMARY KEY (cpid)")

    # 6. Create NEW foreign keys pointing to prisoner.cpid
    op.create_foreign_key(None, 'assignment', 'prisoner', ['prisoner_cpid'], ['cpid'])
    op.create_foreign_key(None, 'envelopejob', 'prisoner', ['prisoner_cpid'], ['cpid'])
    op.create_unique_constraint('uq_letter_prisoner_id', 'letter', ['prisoner_cpid', 'id'])
    op.create_foreign_key(None, 'letter', 'prisoner', ['prisoner_cpid'], ['cpid'])
    op.create_foreign_key(None, 'sponsorprisoner', 'prisoner', ['prisoner_cpid'], ['cpid'])


def downgrade():
    # Downgrade logic is complex, usually we'd restore IDs and recreate keys.
    # For now, we focus on getting upgrade right.
    pass
