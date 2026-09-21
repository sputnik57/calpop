from typing import List, Optional
from pathlib import Path, PurePosixPath
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse

from pydantic import BaseModel, Field

from auth.dependencies import require_admin, require_admin_or_sponsor
from config import get_settings
from services.library_service import LibraryService

router = APIRouter(tags=["library"])
settings = get_settings()


@router.get("/host-paths", response_model=dict)
def get_library_host_paths(user_context=Depends(require_admin_or_sponsor)):
    """
    The host-side (as opposed to in-container /app/library/...) path for each
    category, straight from .env's LIBRARY_*_PATH -- what Rey should actually
    navigate to on his own machine to add/find files, since the container
    path is meaningless outside Docker. Relative paths (translations default
    to ./data/ref/translations) are relative to docker-compose.yml's own
    directory, i.e. the project root -- not resolvable to an absolute path
    from inside the container, so shown as-is with a note in the frontend.
    "local" has no host path at all -- it's an ephemeral upload cache, not a
    host-synced folder (see library_local_root in config.py).
    """
    return {
        "curriculum": settings.library_curriculum_path,
        "history": settings.library_history_path,
        "local": None,
        "translations": settings.library_translations_path,
        # Same durable ./data bind mount as submissions/ -- shown relative to
        # docker-compose.yml's directory, like the other host-synced paths.
        "course_students": "./data/course_students",
    }


@router.get("/windows-path", response_model=dict)
def get_windows_path(path: str = Query(...), user_context=Depends(require_admin_or_sponsor)):
    """
    The \\\\wsl.localhost\\<distro>\\... FOLDER path (not the file) Windows apps
    (Word, Explorer) can open for a library file, so a document can be edited in place -- there is
    no in-app editor. Only for folders that actually live in the project on
    disk (Course Students, Curriculum, Translations); Local Files is an
    ephemeral container-only cache with no host path, and History points
    outside the project.
    """
    if not settings.host_project_dir or not settings.wsl_distro_name:
        raise HTTPException(status_code=503, detail="HOST_PROJECT_DIR / WSL_DISTRO_NAME aren't configured in .env")
    resolved = Path(path).resolve()
    mapping = [
        (settings.library_curriculum_root, settings.library_curriculum_path),
        (settings.library_translations_root, settings.library_translations_path),
        (settings.bilingual_output_root, "./data/course_students"),
    ]
    for root, host in mapping:
        if root and host and host.startswith("./") and resolved.is_relative_to(root.resolve()):
            rel = resolved.relative_to(root.resolve())
            host_full = PurePosixPath(settings.host_project_dir) / host[2:] / rel.parent.as_posix()  # folder only -- Word's Open box wants a folder, then you pick the file
            unc = "\\\\wsl.localhost\\" + settings.wsl_distro_name + str(host_full).replace("/", "\\")
            return {"windows_path": unc, "filename": resolved.name}
    raise HTTPException(status_code=404, detail="This file has no Windows path (Local Files is a temporary cache inside the app -- Download it instead).")


@router.post("/upload", response_model=dict)
async def upload_library_file(
    category: str = Query(..., description="'local' (ephemeral session cache) or 'course_students' (the durable Windows-exchange folder). Curriculum/history/translations are populated other ways."),
    file: UploadFile = File(...),
    user_context=Depends(require_admin_or_sponsor),
):
    """
    Receives a file via the browser's native file picker (a normal
    multipart upload -- the browser opens the OS file dialog itself, no
    server-side desktop access needed). This is a COPY: the original on the
    uploader's Windows drive is untouched.

    - `local`: Local Files ephemeral cache -- wiped on every backend restart
      (see main.py's startup_event), for past letters/reference material
      whose real home stays on Windows.
    - `course_students`: the durable Course Students folder (data/course_students),
      Rey's single exchange folder with Windows until everything lives in WSL
      (decided 20Sep2026). Never overwrites: a same-named file gets `_2`,
      `_3`... so a sync can't silently destroy a newer copy. Files are
      chmod-opened because the container runs as root and root-owned files
      under ./data can't otherwise be deleted/moved from WSL without sudo.
    """
    if category == "local":
        root = settings.library_local_root
    elif category == "course_students":
        root = settings.bilingual_output_root
    else:
        raise HTTPException(status_code=400, detail="Only 'local' and 'course_students' accept uploads")

    root.mkdir(parents=True, exist_ok=True)

    safe_name = Path(file.filename).name  # strip any path components the client might send
    if not safe_name:
        raise HTTPException(status_code=400, detail="Invalid filename")

    dest_path = root / safe_name
    if category == "course_students":
        import os
        os.chmod(root, 0o777)
        n = 2
        while dest_path.exists():
            dest_path = root / f"{Path(safe_name).stem}_{n}{Path(safe_name).suffix}"
            n += 1
    contents = await file.read()
    dest_path.write_bytes(contents)
    if category == "course_students":
        os.chmod(dest_path, 0o666)

    return {"saved": True, "filename": dest_path.name}


@router.get("/list", response_model=List[dict])
def list_library_files(
    category: str = Query(..., description="curriculum, history, local, translations, or course_students"),
    subpath: Optional[str] = Query(None, description="Optional relative path within the category root"),
    user_context=Depends(require_admin_or_sponsor)
):
    if category == "curriculum":
        root = settings.library_curriculum_root
    elif category == "history":
        root = settings.library_history_root
    elif category == "local":
        root = settings.library_local_root
    elif category == "translations":
        root = settings.library_translations_root
    elif category == "course_students":
        root = settings.bilingual_output_root
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
    elif settings.library_local_root and file_path.resolve().is_relative_to(settings.library_local_root.resolve()):
        is_safe = True
    elif settings.library_translations_root and file_path.resolve().is_relative_to(settings.library_translations_root.resolve()):
        is_safe = True
    elif file_path.resolve().is_relative_to(settings.bilingual_output_root.resolve()):
        is_safe = True  # Add Spanish output -- download only, not a browsable library tab

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



class TranslateDocumentRequest(BaseModel):
    path: str = Field(..., description="Library file path, as returned by /list")
    no_personal_info_confirmed: bool = Field(
        ...,
        description="Must be true. Structural gate, not a UI hint -- the endpoint refuses otherwise. The document's text goes to Google Cloud Translate, so this is the explicit statement that it's public program material (curriculum/worksheets) with no names, addresses, or other identifying details. The server can't verify that; the flag exists so sending it is always a deliberate act.",
    )


_ocr_service = None


@router.post("/translate-to-spanish", response_model=dict)
def translate_library_document_to_spanish(
    payload: TranslateDocumentRequest,
    user_context=Depends(require_admin),
):
    """
    Bilingual copy of an open Reference Hub document -- each English paragraph
    followed by its Spanish translation, via Google Cloud Translate (added
    20Sep2026). Saved as `{name}_bilingual.docx` in settings.bilingual_output_root
    (data/course_students) -- never beside the source, whichever library
    folder that came from.
    """
    global _ocr_service
    from services.ocr_service import OCRService
    from services.document_translation_service import translate_document

    if not payload.no_personal_info_confirmed:
        raise HTTPException(
            status_code=400,
            detail="Cloud translation requires confirming the document has no personal or identifying information (no_personal_info_confirmed must be true).",
        )

    src = Path(payload.path)
    if not src.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    roots = [settings.library_curriculum_root, settings.library_history_root,
             settings.library_local_root, settings.library_translations_root]
    resolved = src.resolve()
    if not any(r and resolved.is_relative_to(r.resolve()) for r in roots):
        raise HTTPException(status_code=403, detail="Access denied")
    if "_bilingual" in src.stem.lower():
        raise HTTPException(status_code=400, detail="This already looks like a bilingual copy.")

    if _ocr_service is None:
        _ocr_service = OCRService()
    try:
        result = translate_document(
            src, "bilingual",
            lambda texts: _ocr_service.translate_texts_cloud(texts, target_language="es", source_language="en"),
            out_dir=settings.bilingual_output_root,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except PermissionError:
        raise HTTPException(status_code=500, detail="Can't write next to the original -- folder isn't writable")

    out = result["path"]
    return {
        "saved": True,
        "name": out.name,
        "path": str(out),
        "extension": out.suffix.lstrip("."),
        "translated": result["translated"],
        "skipped": result["skipped"],
    }
