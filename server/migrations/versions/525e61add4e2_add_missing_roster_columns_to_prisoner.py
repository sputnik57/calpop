"""add_missing_roster_columns_to_prisoner

Revision ID: 525e61add4e2
Revises: 63e4196019db
Create Date: 2026-08-18 20:04:08.779734

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '525e61add4e2'
down_revision = '63e4196019db'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('prisoner', sa.Column('intake_number', sa.Integer(), nullable=True))
    op.add_column('prisoner', sa.Column('stage', sa.Integer(), nullable=True))
    op.add_column('prisoner', sa.Column('cdcr_db_verified', sa.Text(), nullable=True))
    op.add_column('prisoner', sa.Column('contract_status', sa.Text(), nullable=True))
    op.add_column('prisoner', sa.Column('date_of_contract', sa.Text(), nullable=True))
    op.add_column('prisoner', sa.Column('needs_green_book', sa.Text(), nullable=True))
    op.add_column('prisoner', sa.Column('language', sa.Text(), nullable=True))
    op.add_column('prisoner', sa.Column('review_notes', sa.Text(), nullable=True))
    op.add_column('prisoner', sa.Column('date_sponsor_assigned', sa.Text(), nullable=True))
    op.add_column('prisoner', sa.Column('letter_exchange_count', sa.Integer(), nullable=True))
    op.add_column('prisoner', sa.Column('step_received_count', sa.Integer(), nullable=True))
    op.add_column('prisoner', sa.Column('bph_date', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('prisoner', 'bph_date')
    op.drop_column('prisoner', 'step_received_count')
    op.drop_column('prisoner', 'letter_exchange_count')
    op.drop_column('prisoner', 'date_sponsor_assigned')
    op.drop_column('prisoner', 'review_notes')
    op.drop_column('prisoner', 'language')
    op.drop_column('prisoner', 'needs_green_book')
    op.drop_column('prisoner', 'date_of_contract')
    op.drop_column('prisoner', 'contract_status')
    op.drop_column('prisoner', 'cdcr_db_verified')
    op.drop_column('prisoner', 'stage')
    op.drop_column('prisoner', 'intake_number')
