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


class OneDriveStorageService(StorageService):
    """
    Microsoft Graph API backend -- for deployments (like Rey's) uploading
    redacted letters to other sponsors' OneDrive folders. NOT IMPLEMENTED
    YET: the Graph API integration is scoped for a later build step (see
    implementation_plan.md, "Letter Mgt planning") pending an auth-approach
    decision (app-only client-credentials vs. delegated login). Selecting
    storage_backend=onedrive today raises clearly rather than silently
    falling back to local disk.
    """

    def __init__(self, *_args, **_kwargs):
        raise NotImplementedError(
            "OneDrive storage backend is not implemented yet -- "
            "see implementation_plan.md for status. Set STORAGE_BACKEND=local "
            "(the default) until this is built."
        )

    def create_folder(self, path: str) -> str:
        raise NotImplementedError

    def upload_file(self, folder_path: str, filename: str, content: bytes) -> str:
        raise NotImplementedError

    def list_folder(self, path: str) -> List[StorageItem]:
        raise NotImplementedError

    def download_file(self, ref: str) -> bytes:
        raise NotImplementedError


def get_storage_service(settings) -> StorageService:
    """Factory -- the only place that branches on backend selection.
    `settings` is the app's Settings instance (config.get_settings())."""
    backend = getattr(settings, "storage_backend", "local")
    if backend == "local":
        return LocalStorageService(settings.data_root / "storage")
    if backend == "onedrive":
        return OneDriveStorageService()
    raise ValueError(f"Unknown storage_backend: {backend!r}")
