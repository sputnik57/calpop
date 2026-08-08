from typing import List, Optional
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse

from auth.dependencies import require_admin_or_sponsor
from config import get_settings
from services.library_service import LibraryService

router = APIRouter(tags=["library"])
settings = get_settings()

@router.get("/list", response_model=List[dict])
def list_library_files(
    category: str = Query(..., description="curriculum or history"),
    subpath: Optional[str] = Query(None, description="Optional relative path within the category root"),
    user_context=Depends(require_admin_or_sponsor)
):
    if category == "curriculum":
        root = settings.library_curriculum_root
    elif category == "history":
        root = settings.library_history_root
    else:
        raise HTTPException(status_code=400, detail="Invalid category")
    
    if not root or not root.exists():
        return []

    target_path = root
    if subpath:
        # Normalize and split subpath to join safely
        parts = [p for p in subpath.replace('\\', '/').split('/') if p and p != '..']
        target_path = root.joinpath(*parts)
        
        # Final safety check
        target_abs = str(target_path.absolute())
        root_abs = str(root.absolute())
        print(f"DEBUG API: checking if {target_abs} starts with {root_abs}", flush=True)
        if not target_abs.startswith(root_abs):
             raise HTTPException(status_code=403, detail="Invalid path traversal")

    return LibraryService.list_files(target_path)

@router.get("/file")
def get_library_file(
    path: str = Query(...),
    download: bool = False,
    user_context=Depends(require_admin_or_sponsor)
):
    file_path = Path(path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    # Security check: Ensure file is within library roots
    is_safe = False
    if settings.library_curriculum_root and file_path.resolve().is_relative_to(settings.library_curriculum_root.resolve()):
        is_safe = True
    elif settings.library_history_root and file_path.resolve().is_relative_to(settings.library_history_root.resolve()):
        is_safe = True

    if not is_safe:
        raise HTTPException(status_code=403, detail="Access denied")

    return FileResponse(
        path=file_path,
        filename=file_path.name if download else None,
        media_type="application/octet-stream" if download else None
    )

@router.get("/file-info", response_model=dict)
def get_library_file_info(
    path: str = Query(...),
    user_context=Depends(require_admin_or_sponsor)
):
    try:
        return LibraryService.get_file_content(Path(path))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except PermissionError:
        raise HTTPException(status_code=403, detail="Access denied")

