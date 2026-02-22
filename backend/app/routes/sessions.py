import os
from uuid import UUID

from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Session, StudentNote, MergeResult, SessionStatus
from app.schemas import SessionCreate, SessionResponse, SessionListItem, StudentNoteResponse
from app.utils.files import validate_file_extension, validate_file_size, get_upload_path
from app.pipeline.orchestrator import run_merge_pipeline
from app.config import settings

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.post("", response_model=SessionResponse, status_code=201)
async def create_session(data: SessionCreate, db: AsyncSession = Depends(get_db)):
    """Créer une nouvelle session de cours."""
    session = Session(
        course_name=data.course_name,
        course_date=data.course_date,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session, attribute_names=["notes", "results"])
    return session


@router.get("", response_model=list[SessionListItem])
async def list_sessions(db: AsyncSession = Depends(get_db)):
    """Lister toutes les sessions, ordonnées par date de création desc."""
    result = await db.execute(
        select(
            Session.id,
            Session.course_name,
            Session.course_date,
            Session.status,
            Session.created_at,
            func.count(StudentNote.id).label("notes_count"),
        )
        .outerjoin(StudentNote)
        .group_by(Session.id)
        .order_by(Session.created_at.desc())
    )
    rows = result.all()
    return [
        SessionListItem(
            id=row.id,
            course_name=row.course_name,
            course_date=row.course_date,
            status=row.status.value,
            notes_count=row.notes_count,
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(session_id: UUID, db: AsyncSession = Depends(get_db)):
    """Détail d'une session avec notes et résultats."""
    result = await db.execute(
        select(Session)
        .where(Session.id == session_id)
        .options(selectinload(Session.notes), selectinload(Session.results))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session introuvable")
    return session


@router.post("/{session_id}/notes", response_model=StudentNoteResponse)
async def upload_note(
    session_id: UUID,
    file: UploadFile = File(...),
    student_id: str = Form(...),
    student_name: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    """Uploader les notes d'un étudiant."""
    # Check session exists and is collecting
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session introuvable")
    if session.status != SessionStatus.COLLECTING:
        raise HTTPException(status_code=400, detail="La session n'accepte plus de notes")

    # Validate file
    try:
        ext = validate_file_extension(file.filename or "")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Read file content to check size
    content = await file.read()
    try:
        validate_file_size(len(content))
    except ValueError as e:
        raise HTTPException(status_code=413, detail=str(e))

    # Check for duplicate student_id
    existing = await db.execute(
        select(StudentNote).where(
            StudentNote.session_id == session_id,
            StudentNote.student_id == student_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Cet étudiant a déjà uploadé ses notes")

    # Check max notes per session
    count_result = await db.execute(
        select(func.count(StudentNote.id)).where(StudentNote.session_id == session_id)
    )
    count = count_result.scalar()
    if count >= settings.MAX_NOTES_PER_SESSION:
        raise HTTPException(status_code=400, detail=f"Maximum {settings.MAX_NOTES_PER_SESSION} notes par session")

    # Save file
    file_path = get_upload_path(str(session_id), student_id, file.filename or "notes." + ext)
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    with open(file_path, "wb") as f:
        f.write(content)

    # Create database entry
    note = StudentNote(
        session_id=session_id,
        student_id=student_id,
        student_name=student_name,
        original_format=ext,
        original_file_path=file_path,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return note


@router.delete("/{session_id}/notes/{student_id}", status_code=204)
async def delete_note(session_id: UUID, student_id: str, db: AsyncSession = Depends(get_db)):
    """Supprimer les notes d'un étudiant (tant que status == collecting)."""
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session introuvable")
    if session.status != SessionStatus.COLLECTING:
        raise HTTPException(status_code=400, detail="Impossible de supprimer pendant ou après la fusion")

    result = await db.execute(
        select(StudentNote).where(
            StudentNote.session_id == session_id,
            StudentNote.student_id == student_id,
        )
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note introuvable")

    # Delete file
    if os.path.exists(note.original_file_path):
        os.remove(note.original_file_path)

    await db.delete(note)
    await db.commit()


@router.post("/{session_id}/merge", status_code=202)
async def launch_merge(
    session_id: UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Lancer la fusion en arrière-plan."""
    result = await db.execute(
        select(Session)
        .where(Session.id == session_id)
        .options(selectinload(Session.notes))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session introuvable")
    if session.status == SessionStatus.MERGING:
        raise HTTPException(status_code=409, detail="Fusion déjà en cours")
    if session.status != SessionStatus.COLLECTING:
        raise HTTPException(status_code=400, detail="La session ne peut pas être fusionnée dans cet état")
    if len(session.notes) < 2:
        raise HTTPException(status_code=400, detail="Minimum 2 notes requises")

    background_tasks.add_task(run_merge_pipeline, session_id)
    return {"message": "Fusion lancée"}


@router.get("/{session_id}/results/{student_id}")
async def download_result(session_id: UUID, student_id: str, db: AsyncSession = Depends(get_db)):
    """Télécharger le fichier enrichi."""
    result = await db.execute(
        select(Session).where(Session.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session introuvable")
    if session.status != SessionStatus.DONE:
        raise HTTPException(status_code=404, detail="Fusion pas encore terminée")

    result = await db.execute(
        select(MergeResult).where(
            MergeResult.session_id == session_id,
            MergeResult.student_id == student_id,
        )
    )
    merge_result = result.scalar_one_or_none()
    if not merge_result:
        raise HTTPException(status_code=404, detail="Résultat introuvable")

    if not os.path.exists(merge_result.output_file_path):
        raise HTTPException(status_code=404, detail="Fichier résultat introuvable")

    # Determine media type
    ext = os.path.splitext(merge_result.output_file_path)[1].lower()
    media_types = {
        ".md": "text/markdown",
        ".txt": "text/plain",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".odt": "application/vnd.oasis.opendocument.text",
    }
    media_type = media_types.get(ext, "application/octet-stream")

    return FileResponse(
        merge_result.output_file_path,
        media_type=media_type,
        filename=os.path.basename(merge_result.output_file_path),
    )
