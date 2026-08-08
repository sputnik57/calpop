"""Script to generate migration file inside Docker container"""

MIGRATION_CODE = '''\
"""add remaining tables

Revision ID: fd11341bd08c
Revises: aabadb9631bf
Create Date: 2025-12-13 02:05:52.404203

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "fd11341bd08c"
down_revision = "aabadb9631bf"
branch_labels = None
depends_on = None


def upgrade():
    # Create new enum types using raw SQL (checkfirst equivalent)
    connection = op.get_bind()
    
    # Check and create enums if they don\'t exist
    enums_to_create = [
        ("submissionstatus", ["draft", "submitted", "revisions_requested", "approved"]),
        ("envelopestatus", ["queued", "processing", "completed", "failed"]),
        ("environmenttype", ["safe", "unsafe"]),
        ("submissionartifacttype", ["docx", "pdf", "txt"]),
        ("submissionartifactbackend", ["local", "onedrive"]),
    ]
    
    for enum_name, values in enums_to_create:
        result = connection.execute(sa.text(
            f"SELECT 1 FROM pg_type WHERE typname = \'{enum_name}\'"
        ))
        if result.fetchone() is None:
            values_str = ", ".join(f"\'{v}\'" for v in values)
            connection.execute(sa.text(f"CREATE TYPE {enum_name} AS ENUM ({values_str})"))
    
    # Define enums with create_type=False since we created them above
    content_format_enum = postgresql.ENUM("markdown", "html", "plaintext", name="contentformat", create_type=False)
    submission_status_enum = postgresql.ENUM("draft", "submitted", "revisions_requested", "approved", name="submissionstatus", create_type=False)
    envelope_status_enum = postgresql.ENUM("queued", "processing", "completed", "failed", name="envelopestatus", create_type=False)
    environment_enum = postgresql.ENUM("safe", "unsafe", name="environmenttype", create_type=False)
    submission_artifact_type_enum = postgresql.ENUM("docx", "pdf", "txt", name="submissionartifacttype", create_type=False)
    submission_artifact_backend_enum = postgresql.ENUM("local", "onedrive", name="submissionartifactbackend", create_type=False)

    op.create_table("letterversion",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("letter_id", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("content_format", content_format_enum, nullable=False, server_default="markdown"),
        sa.Column("autosave", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("version_label", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["letter_id"], ["letter.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["user.id"]),
        sa.PrimaryKeyConstraint("id")
    )
    op.create_foreign_key("fk_letter_latest_version", "letter", "letterversion", ["latest_version_id"], ["id"], ondelete="SET NULL")
    op.create_table("letterdates",
        sa.Column("letter_id", sa.Integer(), nullable=False),
        sa.Column("scanned_at", sa.DateTime(), nullable=True),
        sa.Column("picked_up_at", sa.DateTime(), nullable=True),
        sa.Column("postmarked_at", sa.DateTime(), nullable=True),
        sa.Column("response_started_at", sa.DateTime(), nullable=True),
        sa.Column("response_submitted_at", sa.DateTime(), nullable=True),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["letter_id"], ["letter.id"]),
        sa.PrimaryKeyConstraint("letter_id")
    )
    op.create_table("ocrartifact",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("letter_id", sa.Integer(), nullable=False),
        sa.Column("source_file_ref", sa.String(length=255), nullable=True),
        sa.Column("text", sa.Text(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("blocks", sa.JSON(), nullable=True),
        sa.Column("transformations", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["letter_id"], ["letter.id"]),
        sa.PrimaryKeyConstraint("id")
    )
    op.create_table("redactionevent",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("letter_id", sa.Integer(), nullable=False),
        sa.Column("method", sa.String(length=50), nullable=False),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("performed_by", sa.Integer(), nullable=True),
        sa.Column("performed_at", sa.DateTime(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["letter_id"], ["letter.id"]),
        sa.ForeignKeyConstraint(["performed_by"], ["user.id"]),
        sa.PrimaryKeyConstraint("id")
    )
    op.create_table("assignment",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("letter_id", sa.Integer(), nullable=False),
        sa.Column("sponsor_id", sa.Integer(), nullable=False),
        sa.Column("prisoner_id", sa.Integer(), nullable=False),
        sa.Column("assigned_by", sa.Integer(), nullable=True),
        sa.Column("assigned_at", sa.DateTime(), nullable=False),
        sa.Column("due_date", sa.DateTime(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["letter_id"], ["letter.id"]),
        sa.ForeignKeyConstraint(["sponsor_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["prisoner_id"], ["prisoner.id"]),
        sa.ForeignKeyConstraint(["assigned_by"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("letter_id", "sponsor_id", name="uq_assignment_letter_sponsor")
    )
    op.create_table("auditlog",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(length=100), nullable=False),
        sa.Column("resource_type", sa.String(length=100), nullable=True),
        sa.Column("resource_id", sa.Integer(), nullable=True),
        sa.Column("timestamp", sa.DateTime(), nullable=False),
        sa.Column("details", sa.JSON(), nullable=True),
        sa.Column("letter_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["actor_user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["letter_id"], ["letter.id"]),
        sa.PrimaryKeyConstraint("id")
    )
    op.create_table("envelopejob",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("batch_id", sa.String(length=100), nullable=False),
        sa.Column("prisoner_id", sa.Integer(), nullable=False),
        sa.Column("template_id", sa.String(length=100), nullable=True),
        sa.Column("environment", environment_enum, nullable=False),
        sa.Column("status", envelope_status_enum, nullable=False, server_default="queued"),
        sa.Column("pdf_ref", sa.String(length=255), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("letter_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["prisoner_id"], ["prisoner.id"]),
        sa.ForeignKeyConstraint(["letter_id"], ["letter.id"]),
        sa.PrimaryKeyConstraint("id")
    )
    op.create_index(op.f("ix_envelopejob_batch_id"), "envelopejob", ["batch_id"], unique=False)
    op.create_table("sponsorprisoner",
        sa.Column("sponsor_id", sa.Integer(), nullable=False),
        sa.Column("prisoner_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["sponsor_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["prisoner_id"], ["prisoner.id"]),
        sa.PrimaryKeyConstraint("sponsor_id", "prisoner_id")
    )
    op.create_table("submission",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("letter_id", sa.Integer(), nullable=False),
        sa.Column("sponsor_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("content_format", content_format_enum, nullable=False, server_default="markdown"),
        sa.Column("attachments", sa.JSON(), nullable=True),
        sa.Column("onedrive_item_id", sa.String(length=255), nullable=True),
        sa.Column("status", submission_status_enum, nullable=False, server_default="draft"),
        sa.Column("submitted_at", sa.DateTime(), nullable=True),
        sa.Column("revisions_requested_at", sa.DateTime(), nullable=True),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("revision_comment", sa.Text(), nullable=True),
        sa.Column("approval_comment", sa.Text(), nullable=True),
        sa.Column("reviewed_by", sa.Integer(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("current_version_id", sa.Integer(), nullable=True),
        sa.Column("autosave_version_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["letter_id"], ["letter.id"]),
        sa.ForeignKeyConstraint(["sponsor_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["reviewed_by"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("letter_id", "sponsor_id", name="uq_submission_letter_sponsor")
    )
    op.create_table("submissionversion",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("submission_id", sa.Integer(), nullable=False),
        sa.Column("author_id", sa.Integer(), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("content_format", content_format_enum, nullable=False, server_default="markdown"),
        sa.Column("autosave", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("version_label", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["submission_id"], ["submission.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id")
    )
    op.create_foreign_key("fk_submission_current_version", "submission", "submissionversion", ["current_version_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_submission_autosave_version", "submission", "submissionversion", ["autosave_version_id"], ["id"], ondelete="SET NULL")
    op.create_table("submissionartifact",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("submission_id", sa.Integer(), nullable=False),
        sa.Column("version_id", sa.Integer(), nullable=True),
        sa.Column("artifact_type", submission_artifact_type_enum, nullable=False),
        sa.Column("storage_backend", submission_artifact_backend_enum, nullable=False, server_default="local"),
        sa.Column("file_path", sa.String(length=255), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["submission_id"], ["submission.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["version_id"], ["submissionversion.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("submission_id", "artifact_type", "file_name", name="uq_submissionartifact_unique")
    )
    op.create_table("submissionstatushistory",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("submission_id", sa.Integer(), nullable=False),
        sa.Column("from_status", submission_status_enum, nullable=True),
        sa.Column("to_status", submission_status_enum, nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=True),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["submission_id"], ["submission.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id")
    )


def downgrade():
    op.drop_table("submissionstatushistory")
    op.drop_table("submissionartifact")
    op.drop_constraint("fk_submission_autosave_version", "submission", type_="foreignkey")
    op.drop_constraint("fk_submission_current_version", "submission", type_="foreignkey")
    op.drop_table("submissionversion")
    op.drop_table("submission")
    op.drop_table("sponsorprisoner")
    op.drop_index(op.f("ix_envelopejob_batch_id"), table_name="envelopejob")
    op.drop_table("envelopejob")
    op.drop_table("auditlog")
    op.drop_table("assignment")
    op.drop_table("redactionevent")
    op.drop_table("ocrartifact")
    op.drop_table("letterdates")
    op.drop_constraint("fk_letter_latest_version", "letter", type_="foreignkey")
    op.drop_table("letterversion")
    
    # Drop the new enum types we created
    connection = op.get_bind()
    for enum_name in ["submissionartifactbackend", "submissionartifacttype", "environmenttype", "envelopestatus", "submissionstatus"]:
        connection.execute(sa.text(f"DROP TYPE IF EXISTS {enum_name}"))
'''

if __name__ == "__main__":
    target = "/app/migrations/versions/fd11341bd08c_add_remaining_tables.py"
    with open(target, "w") as f:
        f.write(MIGRATION_CODE)
    print(f"Wrote {len(MIGRATION_CODE)} bytes to {target}")
