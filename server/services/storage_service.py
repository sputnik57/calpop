"""
Pluggable storage backend for anything CalPOP needs to file away outside the
database -- currently just redacted letters headed to a sponsor's folder, but
written generically because a second thing (curriculum reference, past-letter
archives) could show up later.

Why this exists: OneDrive is Rey's own deployment's choice, not a CalPOP
requirement. A future user running this app with no Microsoft 365 tenant --
or no cloud storage at all -- should be able to run on plain local disk
without any code changes, just a config flip. So nothing outside this module
is allowed to import the Microsoft Graph SDK or know an item has a
`onedrive_item_id`; everything else talks to `StorageService` and a logical
folder path (e.g. "SponsorName/exchange3"), never a backend-specific ID.

Mirrors the existing `ocr_provider` config pattern (config.py) -- one
setting picks the implementation, callers never branch on backend.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import List, Optional


@dataclass
class StorageItem:
    """One entry returned by list_folder -- deliberately backend-agnostic.

    `ref` is opaque and backend-specific (a local path string for
    LocalStorageService, a Graph API item ID for OneDriveStorageService) --
    round-trip it back into download_file, never parse it.
    """
    name: str
    ref: str
    is_folder: bool
    size: Optional[int] = None
    modified_at: Optional[datetime] = None


class StorageService(ABC):
    """
    Folder-oriented storage backend. Paths are logical, slash-separated,
    and relative to the backend's own root (a local directory for
    LocalStorageService, a configured root folder for OneDriveStorageService)
    -- callers never see or manage that root themselves.
    """

    @abstractmethod
    def create_folder(self, path: str) -> str:
        """Create `path` (and any missing parent segments). Idempotent --
        calling this on an existing folder is not an error. Returns an
        opaque backend ref for the created/existing folder."""

    @abstractmethod
    def upload_file(self, folder_path: str, filename: str, content: bytes) -> str:
        """Write `content` as `filename` inside `folder_path`, creating the
        folder if needed. Returns an opaque backend ref for the file."""

    @abstractmethod
    def list_folder(self, path: str) -> List[StorageItem]:
        """List immediate children of `path`. Empty list if the folder
        exists but is empty; raises FileNotFoundError if it doesn't exist.
        This is also the read path for kanban-style reporting on where
        letters are in the pipeline (see implementation_plan.md)."""

    @abstractmethod
    def download_file(self, ref: str) -> bytes:
        """Fetch the content behind an opaque ref returned by upload_file
        or list_folder."""


class LocalStorageService(StorageService):
    """Default backend -- plain files under a root directory. What a
    deployment with no cloud storage account uses; also what local dev/tests
    use regardless of what a given deployment picks in production."""

    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def _resolve(self, path: str) -> Path:
        # Logical paths are always relative to `root` -- reject anything
        # that would escape it (leading slash, `..` segments).
        target = (self.root / path).resolve()
        if self.root.resolve() not in target.parents and target != self.root.resolve():
            raise ValueError(f"Path escapes storage root: {path!r}")
        return target

    def create_folder(self, path: str) -> str:
        target = self._resolve(path)
        target.mkdir(parents=True, exist_ok=True)
        return str(target)

    def upload_file(self, folder_path: str, filename: str, content: bytes) -> str:
        folder = self._resolve(folder_path)
        folder.mkdir(parents=True, exist_ok=True)
        dest = folder / filename
        dest.write_bytes(content)
        return str(dest)

    def list_folder(self, path: str) -> List[StorageItem]:
        target = self._resolve(path)
        if not target.exists():
            raise FileNotFoundError(f"No such folder: {path!r}")
        items = []
        for entry in sorted(target.iterdir()):
            stat = entry.stat()
            items.append(StorageItem(
                name=entry.name,
                ref=str(entry),
                is_folder=entry.is_dir(),
                size=None if entry.is_dir() else stat.st_size,
                modified_at=datetime.fromtimestamp(stat.st_mtime),
            ))
        return items

    def download_file(self, ref: str) -> bytes:
        return Path(ref).read_bytes()


def get_storage_service(settings, db=None) -> StorageService:
    """Factory -- the only place that branches on backend selection.
    `settings` is the app's Settings instance (config.get_settings()).
    `db` is required when storage_backend=onedrive (needed to read/refresh
    the stored OAuth connection -- see services/onedrive_service.py); the
    local backend doesn't touch the database at all."""
    backend = getattr(settings, "storage_backend", "local")
    if backend == "local":
        return LocalStorageService(settings.data_root / "storage")
    if backend == "onedrive":
        if db is None:
            raise ValueError("storage_backend=onedrive requires a db session")
        from services.onedrive_service import OneDriveStorageService  # avoid import cycle
        return OneDriveStorageService(settings, db)
    raise ValueError(f"Unknown storage_backend: {backend!r}")
