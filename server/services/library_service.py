import logging
import os
from pathlib import Path
from typing import List, Dict, Any, Optional
from config import get_settings
from docx import Document
import PyPDF2

logger = logging.getLogger("calpop.library")
settings = get_settings()

class LibraryService:
    @staticmethod
    def list_files(root_path: Optional[Path]) -> List[Dict[str, Any]]:
        if not root_path:
            return []
            
        abs_target = os.path.abspath(str(root_path))
        print(f"DEBUG: Library Scanning -> {abs_target}", flush=True)
        
        target_obj = Path(abs_target)
        if not target_obj.exists():
            print(f"DEBUG: Path does not exist -> {abs_target}", flush=True)
            return []
            
        if not target_obj.is_dir():
            print(f"DEBUG: Path is not a directory -> {abs_target}", flush=True)
            return []
        
        files = []
        try:
            for entry in target_obj.iterdir():
                if entry.name.startswith('.'):
                    continue
                
                # Basic metadata
                files.append({
                    "name": entry.name,
                    "is_dir": entry.is_dir(),
                    "path": str(entry.absolute()),
                    "extension": entry.suffix.lower().lstrip('.'),
                    "size": entry.stat().st_size if entry.is_file() else 0,
                    "modified": entry.stat().st_mtime
                })
            print(f"DEBUG: Found {len(files)} items in {abs_target}", flush=True)
        except Exception as e:
            print(f"DEBUG: Error reading {abs_target}: {e}", flush=True)
            return []
        
        # Sort by folder first, then name
        return sorted(files, key=lambda x: (not x["is_dir"], x["name"].lower()))

    @staticmethod
    def get_file_content(file_path: Path) -> Dict[str, Any]:
        """Returns metadata and raw content (if applicable) for a file."""
        print(f"DEBUG: get_file_content -> {file_path}", flush=True)
        if not file_path.exists() or not file_path.is_file():
            print(f"DEBUG: Not a file or not found -> {file_path}", flush=True)
            raise FileNotFoundError(f"File not found: {file_path}")
        
        ext = file_path.suffix.lower()
        
        # Security check: Ensure file is within one of the library roots
        # (This is important to prevent path traversal)
        allowed = False
        if settings.library_curriculum_root and file_path.resolve().is_relative_to(settings.library_curriculum_root.resolve()):
            allowed = True
        if settings.library_history_root and file_path.resolve().is_relative_to(settings.library_history_root.resolve()):
            allowed = True
            
        if not allowed:
             raise PermissionError("Access denied to file outside library roots")

        # For DOCX, we might want to return text or HTML
        # For PDF, we probably just return the path to a static server entry
        
        preview = None
        # Normalized handlers
        if ext in [".docx", ".doc"]:
            preview = LibraryService.extract_text_preview(file_path, "docx")
        elif ext == ".pdf":
            preview = LibraryService.extract_text_preview(file_path, "pdf")
        elif ext in [".jpg", ".jpeg", ".png", ".webp", ".gif"]:
            # Special case for images: return the path as preview so frontend can use it in <img>
            preview = f"__IMAGE__:{str(file_path)}"
        elif ext in [".txt", ".md", ".json", ".csv", ".log", ".xml"]:
            preview = LibraryService.extract_text_preview(file_path, "text")
        else:
            # Fallback for unknown extensions: Try reading as text if file size is reasonable (< 1MB)
            if file_path.stat().st_size < 1024 * 1024:
                 preview = LibraryService.extract_text_preview(file_path, "text")

        return {
            "name": file_path.name,
            "path": str(file_path),
            "extension": ext.lstrip('.'),
            "size": file_path.stat().st_size,
            "preview": preview
        }

    @staticmethod
    def extract_text_preview(file_path: Path, file_type: str, max_chars: int = 50000) -> Optional[str]:
        try:
            if file_type == "docx":
                import mammoth
                with open(file_path, "rb") as docx_file:
                    result = mammoth.convert_to_html(docx_file)
                    html = result.value
                    # Wrap in basic styling for the dark mode preview
                    styled_html = f'<div class="docx-content">{html}</div>'
                    return styled_html
            
            elif file_type == "pdf":
                with open(file_path, "rb") as f:
                    pdf_reader = PyPDF2.PdfReader(f)
                    full_text = []
                    # More pages for pdf preview now
                    for i in range(min(10, len(pdf_reader.pages))):
                        full_text.append(pdf_reader.pages[i].extract_text())
                content = "\n".join(full_text)
                return content[:max_chars] if len(content) > max_chars else content
            
            elif file_type == "text":
                with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                    content = f.read(max_chars)
                    return content
        except Exception as e:
            print(f"Error extracting preview for {file_path}: {e}")
            return None
        return None
