import os
from pathlib import Path
from app.config import settings

ALLOWED_EXTENSIONS = {"docx", "md", "txt", "odt"}


def validate_file_extension(filename: str) -> str:
    """Validate and return the file extension (without dot)."""
    ext = Path(filename).suffix.lower().lstrip(".")
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"Formats acceptés : {', '.join('.' + e for e in ALLOWED_EXTENSIONS)}")
    return ext


def validate_file_size(size: int) -> None:
    """Validate file size against max limit."""
    max_bytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024
    if size > max_bytes:
        raise ValueError(f"Fichier trop volumineux (max {settings.MAX_FILE_SIZE_MB} Mo)")


def get_upload_path(session_id: str, student_id: str, filename: str) -> str:
    """Get the upload path for a student's notes."""
    upload_dir = Path(settings.UPLOAD_DIR) / str(session_id) / student_id
    upload_dir.mkdir(parents=True, exist_ok=True)
    return str(upload_dir / filename)
