import asyncio
import re
from uuid import UUID
from sqlalchemy import select
from app.database import get_async_session
from app.models import Session, StudentNote, MergeResult, SessionStatus
from app.pipeline.normalize import normalize_to_markdown
from app.pipeline.merge import identify_gaps
from app.pipeline.enrich import enrich_student_notes
from app.pipeline.export import export_to_original_format


def count_additions(enriched_md: str) -> int:
    """Count the number of [AJOUT] markers in the enriched markdown."""
    return len(re.findall(r'\[AJOUT\]', enriched_md))


def generate_summary(enriched_md: str) -> str:
    """Generate a brief summary of the additions."""
    additions = re.findall(r'\[AJOUT\]\s*(.+?)(?:\n|$)', enriched_md)
    if not additions:
        return "Aucun ajout nécessaire."
    topics = [a[:80] for a in additions[:5]]
    summary = f"{len(additions)} ajout(s) : " + " ; ".join(topics)
    if len(additions) > 5:
        summary += f" ... et {len(additions) - 5} autre(s)"
    return summary


async def update_session_status(db, session_id: UUID, status: SessionStatus, error_message: str | None = None):
    """Update the status of a session."""
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one()
    session.status = status
    if error_message is not None:
        session.error_message = error_message
    await db.flush()


async def get_session_notes(db, session_id: UUID) -> list[StudentNote]:
    """Get all notes for a session."""
    result = await db.execute(
        select(StudentNote).where(StudentNote.session_id == session_id)
    )
    return list(result.scalars().all())


async def run_merge_pipeline(session_id: UUID) -> None:
    """
    Pipeline principal, exécuté en background task.
    Met à jour le status de la session à chaque étape.
    En cas d'erreur, passe en status "error" avec le message.
    """
    async with get_async_session() as db:
        try:
            # 1. Passer en status "merging"
            await update_session_status(db, session_id, SessionStatus.MERGING)
            await db.commit()

            # 2. Normaliser toutes les notes en Markdown
            notes = await get_session_notes(db, session_id)
            for note in notes:
                normalized = await normalize_to_markdown(
                    note.original_file_path, note.original_format
                )
                note.normalized_content = normalized
            await db.commit()

            # 3. Appel Claude — Référentiel + identification des manques
            gaps = await identify_gaps(notes)

            # 4. Appel Claude — Enrichissement par étudiant (parallélisable)
            enrichment_tasks = [
                enrich_student_notes(note, gaps.get(note.student_id, []))
                for note in notes
            ]
            enriched_results = await asyncio.gather(*enrichment_tasks)

            # 5. Export dans le format original
            for note, enriched_md in zip(notes, enriched_results):
                output_path = await export_to_original_format(
                    enriched_md, note.original_file_path, note.original_format
                )
                result = MergeResult(
                    session_id=session_id,
                    student_id=note.student_id,
                    output_file_path=output_path,
                    added_sections=count_additions(enriched_md),
                    summary=generate_summary(enriched_md),
                )
                db.add(result)

            # 6. Passer en status "done"
            await update_session_status(db, session_id, SessionStatus.DONE)
            await db.commit()

        except Exception as e:
            await update_session_status(db, session_id, SessionStatus.ERROR, str(e))
            await db.commit()
            raise
