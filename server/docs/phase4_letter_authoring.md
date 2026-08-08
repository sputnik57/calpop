# Phase 4 Letter Authoring – Data Model & Migration Plan

## Scope

Phase 4 focuses exclusively on sponsor-authored responses for assigned prisoner letters. Incoming physical mail ingestion (Phase 5) remains unchanged. This plan maps the relational schema required to support draft storage, version history, status transitions, and exportable artifacts for sponsor submissions.

## Existing Entities (Reference)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `user` | Azure-authenticated accounts. `role` includes `admin`, `sponsor`, `auditor`. | `id`, `email`, `role` |
| `prisoner` | Canonical record per incarcerated person. | `id`, `cpid`, `first_name`, `last_name` |
| `letter` | Incoming prisoner letter metadata and processing state. | `id`, `prisoner_id`, `status`, `latest_version_id` |
| `letterversion` | Version history for scanned/redacted letter content. | `id`, `letter_id`, `content`, `content_format`, `autosave` |
| `assignment` | Links a `letter` to a `sponsor`. | `letter_id`, `sponsor_id`, `due_date` |
| `submission` | Sponsor-authored response metadata (currently minimal). | `letter_id`, `sponsor_id`, `content`, `status`, `attachments`, `onedrive_item_id` |

## Gaps & Required Enhancements

1. **Submission Draft Versioning** – Need autosave + labeled versions similar to `letterversion` but scoped to sponsor responses.
2. **Format Tracking** – Store authored format (markdown/html/plaintext) so conversions can be deterministic.
3. **Artifact History** – Preserve generated DOCX/PDF/TXT conversions with metadata for auditing and re-download.
4. **Status Transitions & Timeline** – Timestamp transitions for `draft → submitted → revisions_requested → approved`.
5. **Reviewer Feedback Loop** – Capture admin comments when requesting revisions.
6. **Assignment Guardrails** – Ensure one active submission per `(letter_id, sponsor_id)`; enforce via constraints.

## Proposed Schema Changes

### 1. `submission` Table Augmentation

Add columns:

| Column | Type | Notes |
|--------|------|-------|
| `title` | `String(255)` | Optional sponsor-facing title. |
| `content_format` | `Enum('markdown','html','plaintext')` | Default `markdown`. Mirrors `content_format_enum`. |
| `current_version_id` | `ForeignKey('submissionversion.id', ondelete='SET NULL')` | Pointer to latest committed version. |
| `autosave_version_id` | `ForeignKey('submissionversion.id', ondelete='SET NULL')` | Pointer to most recent autosave (optional). |
| `submitted_at`, `approved_at`, `revisions_requested_at` | `DateTime` | Track workflow timestamps. |
| `revision_comment` | `Text` | Admin comment when requesting revisions. |
| `approval_comment` | `Text` | Optional admin approval note. |

### 2. New `submissionversion` Table

Purpose: Full history of sponsor-edited content, including autosaves.

| Column | Type | Notes |
|--------|------|-------|
| `id` | PK | |
| `submission_id` | FK → `submission.id` (cascade delete) | |
| `author_id` | FK → `user.id` | Usually the sponsor; admins can inject edits. |
| `content` | `Text` | Raw markdown/html/plaintext per `content_format`. |
| `content_format` | Enum | Snapshot of format at save time. |
| `autosave` | `Boolean` | True for background autosaves. |
| `version_label` | `String(100)` | e.g., "Submitted v1", "Admin edits". |
| `created_at` | Timestamp | Inherited from `TimestampMixin`. |

Constraints & Indexes:
- Unique `(submission_id, created_at)` implicitly via PK ordering.
- Index on `(submission_id, autosave)` for quick retrieval of the latest autosave.

### 3. New `submissionartifact` Table

Purpose: Persist conversion outputs (DOCX/PDF/TXT) with checksum metadata.

| Column | Type | Notes |
|--------|------|-------|
| `id` | PK | |
| `submission_id` | FK → `submission.id` (cascade delete) | |
| `version_id` | FK → `submissionversion.id` (nullable) | Source version. |
| `artifact_type` | `Enum('docx','pdf','txt')` | |
| `storage_backend` | `Enum('local','onedrive')` | Optional for future phases. |
| `file_path` | `String(255)` | Path within `data/submissions/` or remote ID. |
| `file_name` | `String(255)` | Human-readable filename. |
| `sha256` | `String(64)` | Integrity check. |
| `created_by` | FK → `user.id` | Admin or sponsor who triggered generation. |
| `created_at` | Timestamp | |

### 4. New `submissionstatushistory` Table (optional but recommended)

| Column | Type | Notes |
|--------|------|-------|
| `id` | PK | |
| `submission_id` | FK → `submission.id` | |
| `from_status` | `submissionstatus` Enum | |
| `to_status` | Enum | |
| `actor_id` | FK → `user.id` | |
| `comment` | `Text` | e.g., revision notes. |
| `created_at` | Timestamp | |

This enables auditing beyond the raw timestamps, and aligns with SRS audit requirements.

### 5. Enum Alignment

Reuse `content_format_enum` defined in `server/db/models.py`. If `artifact_type` and `storage_backend` enums are new, define them at module top:

```python
submission_artifact_type_enum = Enum('docx', 'pdf', 'txt', name='submissionartifacttype')
submission_artifact_backend_enum = Enum('local', 'onedrive', name='submissionartifactbackend')
```

## Migration Plan

1. **Create Alembic Revision for Phase 4**
   - Generate new revision: `alembic revision -m "phase4_submission_workflow"`.
   - Implement upgrade to:
     - Alter `submission` table to add new columns & FKs.
     - Create tables `submissionversion`, `submissionartifact`, `submissionstatushistory` (if adopted now).
     - Define indexes & constraints (including `UniqueConstraint('submission_id', 'artifact_type', 'file_name', name='uq_submissionartifact_unique')`).
   - Implement downgrade reversing operations.

2. **Backfill Constraints**
   - Ensure existing data (if any) is compatible. For dev environments with empty tables, direct schema change is fine.

3. **Update SQLAlchemy Models**
   - Reflect new tables & relationships in `server/db/models.py` (add classes + relationships on `Submission`).
   - Update `__all__` / imports if needed.

4. **Seed Directories**
   - Ensure `data/submissions/` exists (already created by `ensure_data_directories`). Phase 4 will store conversion outputs there until OneDrive sync (Phase 9).

5. **Validation**
   - After migration, run `alembic upgrade head` and confirm schema via ``psql or SQLAlchemy inspection.

## Next Steps

- Wire CRUD services & repositories to use the new schema.
- Implement REST endpoints for sponsor draft autosave, submission, revision loops, and conversion download.
- Integrate with React sponsor UI (new editor view, status timeline, export controls).
- Extend audit logging to capture submission events and artifact generation.
