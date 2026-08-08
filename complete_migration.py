# Read the existing migration file
with open('/app/migrations/versions/2cc20c84d1d5_initial_schema_fixed_order.py', 'r') as f:
    lines = f.readlines()

# Find where to insert the remaining tables (after "Created user, prisoner, letter")
insert_index = None
for i, line in enumerate(lines):
    if "print('Created user, prisoner, letter')" in line:
        insert_index = i
        break

if insert_index is None:
    print("ERROR: Could not find insertion point")
    exit(1)

# Prepare the remaining tables SQL
remaining_tables = """
    # 3. Create letterversion (depends on letter, user)
    op.create_table('letterversion',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('letter_id', sa.Integer(), nullable=False),
    sa.Column('content', sa.Text(), nullable=False),
    sa.Column('content_format', sa.Enum('markdown', 'html', 'plaintext', name='contentformat'), nullable=False),
    sa.Column('autosave', sa.Boolean(), nullable=False),
    sa.Column('created_by', sa.Integer(), nullable=True),
    sa.Column('version_label', sa.String(length=100), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['user.id'], ),
    sa.ForeignKeyConstraint(['letter_id'], ['letter.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )

    # 4. Create submission (depends on letter, user)
    op.create_table('submission',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('letter_id', sa.Integer(), nullable=False),
    sa.Column('sponsor_id', sa.Integer(), nullable=False),
    sa.Column('title', sa.String(length=255), nullable=True),
    sa.Column('content', sa.Text(), nullable=True),
    sa.Column('content_format', sa.Enum('markdown', 'html', 'plaintext', name='contentformat'), nullable=False),
    sa.Column('attachments', sa.JSON(), nullable=True),
    sa.Column('onedrive_item_id', sa.String(length=255), nullable=True),
    sa.Column('status', sa.Enum('draft', 'submitted', 'revisions_requested', 'approved', name='submissionstatus'), nullable=False),
    sa.Column('submitted_at', sa.DateTime(), nullable=True),
    sa.Column('revisions_requested_at', sa.DateTime(), nullable=True),
    sa.Column('approved_at', sa.DateTime(), nullable=True),
    sa.Column('revision_comment', sa.Text(), nullable=True),
    sa.Column('approval_comment', sa.Text(), nullable=True),
    sa.Column('reviewed_by', sa.Integer(), nullable=True),
    sa.Column('reviewed_at', sa.DateTime(), nullable=True),
    sa.Column('current_version_id', sa.Integer(), nullable=True),
    sa.Column('autosave_version_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['letter_id'], ['letter.id'], ),
    sa.ForeignKeyConstraint(['reviewed_by'], ['user.id'], ),
    sa.ForeignKeyConstraint(['sponsor_id'], ['user.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('letter_id', 'sponsor_id', name='uq_submission_letter_sponsor')
    )

    # 5. Create submissionversion (depends on submission, user)
    op.create_table('submissionversion',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('submission_id', sa.Integer(), nullable=False),
    sa.Column('author_id', sa.Integer(), nullable=True),
    sa.Column('content', sa.Text(), nullable=False),
    sa.Column('content_format', sa.Enum('markdown', 'html', 'plaintext', name='contentformat'), nullable=False),
    sa.Column('autosave', sa.Boolean(), nullable=False),
    sa.Column('version_label', sa.String(length=100), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['author_id'], ['user.id'], ),
    sa.ForeignKeyConstraint(['submission_id'], ['submission.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )

    # 6. Create all other dependent tables
    op.create_table('assignment',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('letter_id', sa.Integer(), nullable=False),
    sa.Column('sponsor_id', sa.Integer(), nullable=False),
    sa.Column('prisoner_id', sa.Integer(), nullable=False),
    sa.Column('assigned_by', sa.Integer(), nullable=True),
    sa.Column('assigned_at', sa.DateTime(), nullable=False),
    sa.Column('due_date', sa.DateTime(), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['assigned_by'], ['user.id'], ),
    sa.ForeignKeyConstraint(['letter_id'], ['letter.id'], ),
    sa.ForeignKeyConstraint(['prisoner_id'], ['prisoner.id'], ),
    sa.ForeignKeyConstraint(['sponsor_id'], ['user.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('letter_id', 'sponsor_id', name='uq_assignment_letter_sponsor')
    )

    op.create_table('auditlog',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('actor_user_id', sa.Integer(), nullable=True),
    sa.Column('action', sa.String(length=100), nullable=False),
    sa.Column('resource_type', sa.String(length=100), nullable=True),
    sa.Column('resource_id', sa.Integer(), nullable=True),
    sa.Column('timestamp', sa.DateTime(), nullable=False),
    sa.Column('details', sa.JSON(), nullable=True),
    sa.Column('letter_id', sa.Integer(), nullable=True),
    sa.ForeignKeyConstraint(['actor_user_id'], ['user.id'], ),
    sa.ForeignKeyConstraint(['letter_id'], ['letter.id'], ),
    sa.PrimaryKeyConstraint('id')
    )

    op.create_table('envelopejob',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('batch_id', sa.String(length=100), nullable=False),
    sa.Column('prisoner_id', sa.Integer(), nullable=False),
    sa.Column('template_id', sa.String(length=100), nullable=True),
    sa.Column('environment', sa.Enum('safe', 'unsafe', name='environmenttype'), nullable=False),
    sa.Column('status', sa.Enum('queued', 'processing', 'completed', 'failed', name='envelopestatus'), nullable=False),
    sa.Column('pdf_ref', sa.String(length=255), nullable=True),
    sa.Column('completed_at', sa.DateTime(), nullable=True),
    sa.Column('error', sa.Text(), nullable=True),
    sa.Column('letter_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['letter_id'], ['letter.id'], ),
    sa.ForeignKeyConstraint(['prisoner_id'], ['prisoner.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_envelopejob_batch_id'), 'envelopejob', ['batch_id'], unique=False)

    op.create_table('letterdates',
    sa.Column('letter_id', sa.Integer(), nullable=False),
    sa.Column('scanned_at', sa.DateTime(), nullable=True),
    sa.Column('picked_up_at', sa.DateTime(), nullable=True),
    sa.Column('postmarked_at', sa.DateTime(), nullable=True),
    sa.Column('response_started_at', sa.DateTime(), nullable=True),
    sa.Column('response_submitted_at', sa.DateTime(), nullable=True),
    sa.Column('approved_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['letter_id'], ['letter.id'], ),
    sa.PrimaryKeyConstraint('letter_id')
    )

    op.create_table('ocrartifact',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('letter_id', sa.Integer(), nullable=False),
    sa.Column('source_file_ref', sa.String(length=255), nullable=True),
    sa.Column('text', sa.Text(), nullable=True),
    sa.Column('confidence', sa.Float(), nullable=True),
    sa.Column('blocks', sa.JSON(), nullable=True),
    sa.Column('transformations', sa.JSON(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['letter_id'], ['letter.id'], ),
    sa.PrimaryKeyConstraint('id')
    )

    op.create_table('redactionevent',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('letter_id', sa.Integer(), nullable=False),
    sa.Column('method', sa.String(length=50), nullable=False),
    sa.Column('score', sa.Float(), nullable=True),
    sa.Column('performed_by', sa.Integer(), nullable=True),
    sa.Column('performed_at', sa.DateTime(), nullable=False),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['letter_id'], ['letter.id'], ),
    sa.ForeignKeyConstraint(['performed_by'], ['user.id'], ),
    sa.PrimaryKeyConstraint('id')
    )

    op.create_table('sponsorprisoner',
    sa.Column('sponsor_id', sa.Integer(), nullable=False),
    sa.Column('prisoner_id', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['prisoner_id'], ['prisoner.id'], ),
    sa.ForeignKeyConstraint(['sponsor_id'], ['user.id'], ),
    sa.PrimaryKeyConstraint('sponsor_id', 'prisoner_id')
    )

    op.create_table('submissionartifact',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('submission_id', sa.Integer(), nullable=False),
    sa.Column('version_id', sa.Integer(), nullable=True),
    sa.Column('artifact_type', sa.Enum('docx', 'pdf', 'txt', name='submissionartifacttype'), nullable=False),
    sa.Column('storage_backend', sa.Enum('local', 'onedrive', name='submissionartifactbackend'), nullable=False),
    sa.Column('file_path', sa.String(length=255), nullable=False),
    sa.Column('file_name', sa.String(length=255), nullable=False),
    sa.Column('sha256', sa.String(length=64), nullable=True),
    sa.Column('created_by', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['user.id'], ),
    sa.ForeignKeyConstraint(['submission_id'], ['submission.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['version_id'], ['submissionversion.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('submission_id', 'artifact_type', 'file_name', name='uq_submissionartifact_unique')
    )

    op.create_table('submissionstatushistory',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('submission_id', sa.Integer(), nullable=False),
    sa.Column('from_status', sa.Enum('draft', 'submitted', 'revisions_requested', 'approved', name='submissionstatus'), nullable=True),
    sa.Column('to_status', sa.Enum('draft', 'submitted', 'revisions_requested', 'approved', name='submissionstatus'), nullable=False),
    sa.Column('actor_id', sa.Integer(), nullable=True),
    sa.Column('comment', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['actor_id'], ['user.id'], ),
    sa.ForeignKeyConstraint(['submission_id'], ['submission.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )

    # 7. Add circular foreign keys AFTER all tables exist
    op.create_foreign_key('fk_letter_latest_version', 'letter', 'letterversion', ['latest_version_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key('fk_submission_autosave_version', 'submission', 'submissionversion', ['autosave_version_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key('fk_submission_current_version', 'submission', 'submissionversion', ['current_version_id'], ['id'], ondelete='SET NULL')
"""

# Insert the remaining tables before the print statement
lines.insert(insert_index, remaining_tables)

# Write back
with open('/app/migrations/versions/2cc20c84d1d5_initial_schema_fixed_order.py', 'w') as f:
    f.writelines(lines)

print("Migration file updated with all remaining tables!")
