# NotesMerge — Spécification technique

## Service de fusion collaborative de notes de cours

---

## 1. Vision produit

### Problème
Pendant un cours, chaque étudiant prend des notes différentes. Certains manquent des informations (distraction, retard, difficulté à suivre). Aucun étudiant n'a des notes complètes à lui seul, mais **collectivement** toute l'information est capturée.

### Solution
NotesMerge est une application web fullstack qui reçoit les notes de N étudiants pour un même cours, identifie ce que chaque étudiant a manqué par rapport aux autres, et retourne à chacun **ses propres notes enrichies** des informations manquantes — dans son format d'origine et son style d'écriture.

### Principe fondamental
On ne remplace pas les notes de l'étudiant. On **insère** les informations manquantes aux bons endroits, visuellement distinguées (marquage, couleur, annotation), pour que l'étudiant sache ce qui vient de lui et ce qui a été ajouté.

---

## 2. Architecture globale

```
┌──────────────────────────────────────────────────────────────────────┐
│                     FRONTEND — React SPA                             │
│                                                                      │
│  React 18 + TypeScript + Material UI + Zustand + RTK Query           │
│                                                                      │
│  Pages :                                                             │
│    /                        → Dashboard (liste des sessions)         │
│    /sessions/new            → Créer une session                      │
│    /sessions/:id            → Détail session + upload + résultats    │
│                                                                      │
└──────────────────────────┬───────────────────────────────────────────┘
                           │  HTTP / JSON + multipart
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     BACKEND — FastAPI                                 │
│                                                                      │
│  Python 3.12 + FastAPI + SQLAlchemy + PostgreSQL + Anthropic SDK     │
│                                                                      │
│  POST /api/sessions              → créer une session de cours        │
│  GET  /api/sessions              → lister les sessions               │
│  GET  /api/sessions/{id}         → détail + status                   │
│  POST /api/sessions/{id}/notes   → uploader ses notes                │
│  DELETE /api/sessions/{id}/notes/{student_id} → supprimer une note   │
│  POST /api/sessions/{id}/merge   → lancer la fusion                  │
│  GET  /api/sessions/{id}/results/{student_id} → télécharger résultat │
│                                                                      │
└──────────────┬───────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     PIPELINE DE FUSION (Background Task)             │
│                                                                      │
│  ┌──────────┐   ┌───────────┐   ┌──────────┐   ┌─────────────┐     │
│  │ INGEST   │──▶│ NORMALIZE │──▶│  MERGE   │──▶│  ENRICH     │     │
│  │          │   │ (Pandoc)  │   │ (Claude) │   │  (Claude)   │     │
│  └──────────┘   └───────────┘   └──────────┘   └─────────────┘     │
│                                                      │              │
│                                               ┌──────▼────────┐     │
│                                               │   EXPORT      │     │
│                                               │ (format orig) │     │
│                                               └───────────────┘     │
│                                                                      │
│  Exécuté via BackgroundTasks FastAPI (V1)                            │
│  Migrable vers Celery + Redis (V2) pour la scalabilité              │
└──────────────────────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     POSTGRESQL                                       │
│                                                                      │
│  Tables : sessions, student_notes, merge_results                     │
│  Les fichiers sont stockés sur le filesystem (chemin en BDD)         │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. Stack technique

### Backend

| Composant | Technologie |
|-----------|-------------|
| Langage | Python 3.12+ |
| Framework HTTP | FastAPI |
| ORM | SQLAlchemy 2.x (async, modèle déclaratif) |
| Base de données | PostgreSQL 16 |
| Migrations | Alembic |
| Validation | Pydantic v2 (intégré à FastAPI) |
| Upload fichiers | python-multipart (intégré à FastAPI) |
| Conversion formats | Pandoc (CLI, via subprocess) |
| Manipulation .docx | python-docx + lxml |
| Manipulation .odt | odfpy ou Pandoc |
| IA | anthropic (SDK Python officiel) |
| Tâches de fond | FastAPI BackgroundTasks (V1), Celery + Redis (V2) |
| Stockage fichiers | Filesystem local (`/data/uploads/`) — migrable vers S3 |
| Tests | pytest + pytest-asyncio + httpx |

### Frontend

| Composant | Technologie |
|-----------|-------------|
| Langage | TypeScript 5.x |
| Framework | React 18 |
| UI Library | Material UI (MUI) v6 |
| State management | Zustand (état local/UI) |
| API client | RTK Query (cache, polling, invalidation) |
| Routing | React Router v7 |
| Upload | react-dropzone |
| Build | Vite |
| Tests | Vitest + React Testing Library |

---

## 4. Modèle de données — PostgreSQL

### Schéma SQLAlchemy

```python
# backend/app/models.py

import uuid
from datetime import datetime, date
from enum import Enum as PyEnum
from sqlalchemy import String, Text, Integer, DateTime, Date, ForeignKey, Enum, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class SessionStatus(PyEnum):
    COLLECTING = "collecting"
    MERGING = "merging"
    DONE = "done"
    ERROR = "error"


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    course_name: Mapped[str] = mapped_column(String(255))
    course_date: Mapped[date] = mapped_column(Date)
    status: Mapped[SessionStatus] = mapped_column(
        Enum(SessionStatus), default=SessionStatus.COLLECTING
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    notes: Mapped[list["StudentNote"]] = relationship(back_populates="session", cascade="all, delete-orphan")
    results: Mapped[list["MergeResult"]] = relationship(back_populates="session", cascade="all, delete-orphan")


class StudentNote(Base):
    __tablename__ = "student_notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"))
    student_id: Mapped[str] = mapped_column(String(100))
    student_name: Mapped[str] = mapped_column(String(255))
    original_format: Mapped[str] = mapped_column(String(10))   # "docx", "md", "txt", "odt"
    original_file_path: Mapped[str] = mapped_column(String(500))
    normalized_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped["Session"] = relationship(back_populates="notes")

    __table_args__ = (
        UniqueConstraint("session_id", "student_id", name="uq_session_student"),
    )


class MergeResult(Base):
    __tablename__ = "merge_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"))
    student_id: Mapped[str] = mapped_column(String(100))
    output_file_path: Mapped[str] = mapped_column(String(500))
    added_sections: Mapped[int] = mapped_column(Integer, default=0)
    summary: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped["Session"] = relationship(back_populates="results")
```

### Schémas Pydantic (API)

```python
# backend/app/schemas.py

from pydantic import BaseModel, Field
from datetime import date, datetime
from uuid import UUID


class SessionCreate(BaseModel):
    course_name: str = Field(..., min_length=1, max_length=255)
    course_date: date


class StudentNoteResponse(BaseModel):
    student_id: str
    student_name: str
    original_format: str
    uploaded_at: datetime

    model_config = {"from_attributes": True}


class MergeResultResponse(BaseModel):
    student_id: str
    added_sections: int
    summary: str

    model_config = {"from_attributes": True}


class SessionResponse(BaseModel):
    id: UUID
    course_name: str
    course_date: date
    status: str
    created_at: datetime
    updated_at: datetime
    error_message: str | None
    notes: list[StudentNoteResponse]
    results: list[MergeResultResponse]

    model_config = {"from_attributes": True}


class SessionListItem(BaseModel):
    id: UUID
    course_name: str
    course_date: date
    status: str
    notes_count: int
    created_at: datetime

    model_config = {"from_attributes": True}
```

---

## 5. Backend — API Endpoints

```python
# backend/app/routes/sessions.py

from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.post("/", response_model=SessionResponse, status_code=201)
async def create_session(data: SessionCreate, db: AsyncSession = Depends(get_db)):
    """Créer une nouvelle session de cours."""
    ...


@router.get("/", response_model=list[SessionListItem])
async def list_sessions(db: AsyncSession = Depends(get_db)):
    """Lister toutes les sessions, ordonnées par date de création desc."""
    ...


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(session_id: UUID, db: AsyncSession = Depends(get_db)):
    """Détail d'une session avec notes et résultats."""
    ...


@router.post("/{session_id}/notes", response_model=StudentNoteResponse)
async def upload_note(
    session_id: UUID,
    file: UploadFile = File(...),
    student_id: str = Form(...),
    student_name: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Uploader les notes d'un étudiant.
    Validation :
      - Session existe et status == "collecting"
      - Format autorisé : .docx, .md, .txt, .odt
      - Taille max : 10 Mo
      - Pas de doublon student_id dans la session
    """
    ...


@router.delete("/{session_id}/notes/{student_id}", status_code=204)
async def delete_note(session_id: UUID, student_id: str, db: AsyncSession = Depends(get_db)):
    """Supprimer les notes d'un étudiant (tant que status == collecting)."""
    ...


@router.post("/{session_id}/merge", status_code=202)
async def launch_merge(
    session_id: UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Lancer la fusion en arrière-plan.
    Pré-conditions : minimum 2 notes, status == "collecting".
    Retourne immédiatement 202.
    """
    background_tasks.add_task(run_merge_pipeline, session_id)
    ...


@router.get("/{session_id}/results/{student_id}")
async def download_result(session_id: UUID, student_id: str, db: AsyncSession = Depends(get_db)):
    """Télécharger le fichier enrichi. Retourne FileResponse avec le bon Content-Type."""
    ...
```

---

## 6. Backend — Pipeline de fusion

### 6.1 Orchestrateur

```python
# backend/app/pipeline/orchestrator.py

import asyncio
from uuid import UUID
from app.database import get_async_session
from app.models import SessionStatus, MergeResult
from app.pipeline.normalize import normalize_to_markdown
from app.pipeline.merge import identify_gaps
from app.pipeline.enrich import enrich_student_notes
from app.pipeline.export import export_to_original_format


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
```

### 6.2 Normalisation (Pandoc)

```python
# backend/app/pipeline/normalize.py

import subprocess


async def normalize_to_markdown(file_path: str, format: str) -> str:
    """Convertit un fichier en Markdown via Pandoc."""

    if format in ("md", "txt"):
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()

    # .docx et .odt → Pandoc
    result = subprocess.run(
        ["pandoc", file_path, "-t", "markdown", "--wrap=none"],
        capture_output=True, text=True, timeout=30
    )
    if result.returncode != 0:
        raise RuntimeError(f"Pandoc error: {result.stderr}")

    return result.stdout
```

### 6.3 Merge — Identification des manques (Claude)

```python
# backend/app/pipeline/merge.py

import anthropic
import json
from app.config import settings

client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

MERGE_SYSTEM_PROMPT = """Tu es un assistant spécialisé dans la fusion de notes de cours.

Tu reçois les notes de plusieurs étudiants pour un même cours.
Chaque étudiant a capturé des informations différentes.

Ta tâche en deux étapes :

ÉTAPE 1 — RÉFÉRENTIEL
Construis le référentiel complet du cours en fusionnant toutes les notes.
Organise-le par sections thématiques dans l'ordre chronologique du cours.
Pour chaque information, note quel(s) étudiant(s) l'ont capturée.

ÉTAPE 2 — ANALYSE DES MANQUES
Pour chaque étudiant, identifie les informations présentes dans le
référentiel mais absentes de ses notes. Pour chaque manque, indique :
- L'information manquante (texte complet, prêt à être inséré)
- Après quelle section/paragraphe de SES notes elle devrait être insérée
  (utilise le titre de section ou les premiers mots du paragraphe comme ancre)
- La source (quel autre étudiant avait cette information)

Réponds UNIQUEMENT en JSON valide, sans blocs markdown, selon le schéma fourni."""


async def identify_gaps(notes: list) -> dict:
    """Envoie toutes les notes à Claude et retourne les manques par étudiant."""

    notes_text = ""
    for note in notes:
        notes_text += f"\n### Étudiant: {note.student_name} (id: {note.student_id})\n"
        notes_text += note.normalized_content + "\n"

    schema = json.dumps({
        "referentiel": {
            "sections": [
                {"title": "string", "content": "string", "captured_by": ["studentId"]}
            ]
        },
        "gaps": {
            "<studentId>": [
                {
                    "missing_content": "string — le texte à insérer",
                    "insert_after": "string — ancre textuelle dans les notes de l'étudiant",
                    "source_students": ["studentId"],
                    "topic": "string — sujet en quelques mots"
                }
            ]
        }
    }, indent=2, ensure_ascii=False)

    response = client.messages.create(
        model=settings.CLAUDE_MODEL,
        max_tokens=8192,
        temperature=0,
        system=MERGE_SYSTEM_PROMPT,
        messages=[{
            "role": "user",
            "content": f"## Notes des étudiants\n{notes_text}\n\n## Schéma de réponse attendu\n{schema}"
        }]
    )

    raw = response.content[0].text
    raw = raw.strip().removeprefix("```json").removesuffix("```").strip()
    data = json.loads(raw)
    return data.get("gaps", {})
```

### 6.4 Enrichissement par étudiant (Claude)

```python
# backend/app/pipeline/enrich.py

ENRICH_SYSTEM_PROMPT = """Tu es un assistant qui enrichit les notes d'un étudiant.

Tu reçois :
1. Les notes originales de l'étudiant (en Markdown)
2. Une liste d'informations manquantes à insérer (en JSON)

Règles :
- Insère chaque information manquante à l'endroit indiqué par "insert_after"
- Adapte le style d'écriture à celui de l'étudiant (niveau de détail,
  vocabulaire, utilisation d'abréviations, longueur des phrases)
- Marque CHAQUE ajout avec le préfixe "[AJOUT] " au début du paragraphe
  pour que l'étudiant puisse distinguer ses notes des ajouts
- Ne modifie JAMAIS le texte original de l'étudiant
- Si tu ne trouves pas l'ancre exacte, insère à l'endroit le plus logique

Retourne le document Markdown complet avec les ajouts intégrés."""


async def enrich_student_notes(note, gaps: list) -> str:
    """Produit le Markdown enrichi pour un étudiant."""

    if not gaps:
        return note.normalized_content

    response = client.messages.create(
        model=settings.CLAUDE_MODEL,
        max_tokens=8192,
        temperature=0.3,
        system=ENRICH_SYSTEM_PROMPT,
        messages=[{
            "role": "user",
            "content": (
                f"## Notes originales de {note.student_name}\n\n"
                f"{note.normalized_content}\n\n"
                f"## Informations manquantes à insérer\n\n"
                f"{json.dumps(gaps, ensure_ascii=False, indent=2)}"
            )
        }]
    )

    return response.content[0].text
```

### 6.5 Export dans le format original

```python
# backend/app/pipeline/export.py

import subprocess
from pathlib import Path


async def export_to_original_format(
    enriched_md: str,
    original_file_path: str,
    original_format: str,
) -> str:
    """Reconvertit le Markdown enrichi dans le format original."""

    original = Path(original_file_path)
    output_dir = original.parent / "output"
    output_dir.mkdir(exist_ok=True)

    md_path = output_dir / "enriched.md"
    md_path.write_text(enriched_md, encoding="utf-8")
    output_path = output_dir / f"enriched{original.suffix}"

    if original_format == "md":
        output_path.write_text(enriched_md, encoding="utf-8")

    elif original_format == "txt":
        subprocess.run(
            ["pandoc", str(md_path), "-t", "plain", "-o", str(output_path)],
            capture_output=True, text=True, timeout=30, check=True,
        )

    elif original_format == "docx":
        # --reference-doc conserve les styles du document original
        subprocess.run(
            ["pandoc", str(md_path), f"--reference-doc={original_file_path}", "-o", str(output_path)],
            capture_output=True, text=True, timeout=30, check=True,
        )

    elif original_format == "odt":
        subprocess.run(
            ["pandoc", str(md_path), "-o", str(output_path)],
            capture_output=True, text=True, timeout=30, check=True,
        )

    return str(output_path)
```

---

## 7. Frontend — Architecture

### 7.1 Structure du projet

```
frontend/
├── src/
│   ├── main.tsx                          # Point d'entrée React
│   ├── App.tsx                           # Router principal
│   │
│   ├── api/
│   │   ├── store.ts                      # Configuration Redux store (RTK Query uniquement)
│   │   └── sessionsApi.ts                # Endpoints RTK Query
│   │
│   ├── stores/
│   │   └── uiStore.ts                    # Zustand — état UI (snackbar, dialogs)
│   │
│   ├── pages/
│   │   ├── DashboardPage.tsx             # Liste des sessions
│   │   ├── NewSessionPage.tsx            # Formulaire création session
│   │   └── SessionDetailPage.tsx         # Upload, status, résultats
│   │
│   ├── components/
│   │   ├── SessionCard.tsx               # Carte résumé d'une session
│   │   ├── NoteUploader.tsx              # Zone de drop + formulaire étudiant
│   │   ├── NotesList.tsx                 # Liste des notes uploadées
│   │   ├── MergeButton.tsx               # Bouton lancer fusion
│   │   ├── MergeProgress.tsx             # Indicateur de progression
│   │   ├── ResultsPanel.tsx              # Résultats + boutons download
│   │   └── Layout.tsx                    # AppBar + navigation
│   │
│   └── theme/
│       └── theme.ts                      # Configuration MUI theme
│
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

### 7.2 RTK Query — API Slice

```typescript
// frontend/src/api/sessionsApi.ts

import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

interface Session {
  id: string;
  course_name: string;
  course_date: string;
  status: "collecting" | "merging" | "done" | "error";
  created_at: string;
  updated_at: string;
  error_message: string | null;
  notes: StudentNote[];
  results: MergeResult[];
}

interface StudentNote {
  student_id: string;
  student_name: string;
  original_format: string;
  uploaded_at: string;
}

interface MergeResult {
  student_id: string;
  added_sections: number;
  summary: string;
}

interface SessionCreate {
  course_name: string;
  course_date: string;
}

export const sessionsApi = createApi({
  reducerPath: "sessionsApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/api" }),
  tagTypes: ["Session", "SessionList"],
  endpoints: (builder) => ({

    listSessions: builder.query<Session[], void>({
      query: () => "/sessions",
      providesTags: ["SessionList"],
    }),

    getSession: builder.query<Session, string>({
      query: (id) => `/sessions/${id}`,
      providesTags: (result, error, id) => [{ type: "Session", id }],
    }),

    createSession: builder.mutation<Session, SessionCreate>({
      query: (body) => ({ url: "/sessions", method: "POST", body }),
      invalidatesTags: ["SessionList"],
    }),

    uploadNote: builder.mutation<StudentNote, { sessionId: string; formData: FormData }>({
      query: ({ sessionId, formData }) => ({
        url: `/sessions/${sessionId}/notes`,
        method: "POST",
        body: formData,
      }),
      invalidatesTags: (result, error, { sessionId }) => [{ type: "Session", id: sessionId }],
    }),

    deleteNote: builder.mutation<void, { sessionId: string; studentId: string }>({
      query: ({ sessionId, studentId }) => ({
        url: `/sessions/${sessionId}/notes/${studentId}`,
        method: "DELETE",
      }),
      invalidatesTags: (result, error, { sessionId }) => [{ type: "Session", id: sessionId }],
    }),

    launchMerge: builder.mutation<void, string>({
      query: (sessionId) => ({
        url: `/sessions/${sessionId}/merge`,
        method: "POST",
      }),
      invalidatesTags: (result, error, sessionId) => [{ type: "Session", id: sessionId }],
    }),
  }),
});

export const {
  useListSessionsQuery,
  useGetSessionQuery,
  useCreateSessionMutation,
  useUploadNoteMutation,
  useDeleteNoteMutation,
  useLaunchMergeMutation,
} = sessionsApi;
```

### 7.3 Zustand — UI Store

```typescript
// frontend/src/stores/uiStore.ts

import { create } from "zustand";

interface UIState {
  snackbar: { open: boolean; message: string; severity: "success" | "error" | "info" };
  showSnackbar: (message: string, severity?: "success" | "error" | "info") => void;
  closeSnackbar: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  snackbar: { open: false, message: "", severity: "info" },
  showSnackbar: (message, severity = "info") =>
    set({ snackbar: { open: true, message, severity } }),
  closeSnackbar: () =>
    set((state) => ({ snackbar: { ...state.snackbar, open: false } })),
}));
```

### 7.4 Polling pendant le merge

```typescript
// Dans SessionDetailPage.tsx

const { data: session } = useGetSessionQuery(sessionId, {
  // Poll toutes les 3s pendant le merge, désactivé sinon
  pollingInterval: session?.status === "merging" ? 3000 : 0,
});
```

### 7.5 Composants — Comportement attendu

**NoteUploader** :
- Zone drag & drop (react-dropzone) avec icône MUI `CloudUpload`
- Champs `TextField` pour student_id et student_name
- Validation client : extensions `.docx/.md/.txt/.odt`, taille <10 Mo
- Upload via `useUploadNoteMutation`
- Snackbar confirmation / erreur

**NotesList** :
- `List` MUI avec chaque note : nom étudiant, format (Chip), date upload
- Bouton delete (IconButton `Delete`) si `status === "collecting"`

**MergeButton** :
- `Button` MUI variant `contained`, couleur `primary`
- Désactivé si `notes.length < 2` ou `status !== "collecting"`
- Loading state via `CircularProgress` pendant le merge

**MergeProgress** :
- Affiché quand `status === "merging"`
- `LinearProgress` indéterminé + `Typography` "Fusion en cours..."
- Polling automatique (cf. 7.4)

**ResultsPanel** :
- Affiché quand `status === "done"`
- Pour chaque étudiant : `Card` MUI avec summary, added_sections (Chip), bouton `Button` "Télécharger"
- Le bouton pointe vers `/api/sessions/{id}/results/{studentId}` (download direct)
- Si `status === "error"` : `Alert` MUI severity `error` avec le message

---

## 8. Structure du projet (monorepo)

```
notes-merge/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                       # FastAPI app, CORS, lifespan
│   │   ├── config.py                     # Settings Pydantic (env vars)
│   │   ├── database.py                   # Engine + async session factory SQLAlchemy
│   │   ├── models.py                     # Modèles SQLAlchemy
│   │   ├── schemas.py                    # Schémas Pydantic
│   │   │
│   │   ├── routes/
│   │   │   └── sessions.py
│   │   │
│   │   ├── pipeline/
│   │   │   ├── __init__.py
│   │   │   ├── orchestrator.py
│   │   │   ├── normalize.py
│   │   │   ├── merge.py
│   │   │   ├── enrich.py
│   │   │   └── export.py
│   │   │
│   │   └── utils/
│   │       ├── files.py
│   │       └── tokens.py
│   │
│   ├── alembic/
│   │   ├── alembic.ini
│   │   └── versions/
│   │
│   ├── tests/
│   │   ├── conftest.py                   # Fixtures (test DB, test client httpx)
│   │   ├── fixtures/                     # Fichiers .docx/.md/.txt/.odt de test
│   │   ├── test_routes.py
│   │   ├── test_normalize.py
│   │   ├── test_merge.py
│   │   └── test_integration.py
│   │
│   ├── requirements.txt
│   ├── pyproject.toml
│   └── Dockerfile
│
├── frontend/
│   ├── src/                              # (cf. section 7.1)
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── Dockerfile
│
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 9. Variables d'environnement

```bash
# .env

# Backend
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-sonnet-4-5-20250514
DATABASE_URL=postgresql+asyncpg://notesmerge:password@localhost:5432/notesmerge
UPLOAD_DIR=/data/uploads
MAX_FILE_SIZE_MB=10
MAX_NOTES_PER_SESSION=10

# Frontend (build-time)
VITE_API_BASE_URL=http://localhost:8000
```

---

## 10. Docker Compose

```yaml
# docker-compose.yml

services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: notesmerge
      POSTGRES_USER: notesmerge
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql+asyncpg://notesmerge:password@db:5432/notesmerge
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      UPLOAD_DIR: /data/uploads
    volumes:
      - uploads:/data/uploads
    depends_on:
      - db

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    depends_on:
      - backend

volumes:
  pgdata:
  uploads:
```

---

## 11. Marquage visuel des ajouts

### En Markdown / txt

```markdown
> **[AJOUT]** Sartre affirme que « l'existence précède l'essence » :
> l'homme n'a pas de nature prédéfinie, il se construit par ses choix.
> *(Source : notes de Bob)*
```

### En .docx

- Paragraphe avec fond vert pâle (`#E8F5E9`)
- Préfixe `[AJOUT]` en gras, couleur `#2E7D32`
- Note de source en italique gris à la fin

### En .odt

- Même logique via les styles ODF

---

## 12. Gestion d'erreurs

| Situation | Code HTTP | Comportement |
|-----------|-----------|-------------|
| Format non supporté | 400 | "Formats acceptés : .docx, .md, .txt, .odt" |
| Fichier corrompu | 400 | "Impossible de lire le fichier" |
| Fichier trop volumineux | 413 | "Fichier trop volumineux (max 10 Mo)" |
| Doublon student_id | 409 | "Cet étudiant a déjà uploadé ses notes" |
| Pandoc échoue | 500 | Log erreur, retry 1 fois |
| Claude JSON invalide | 500 | Retry avec prompt de correction (max 2) |
| Claude timeout (>60s) | 504 | Permettre re-merge |
| Ancre introuvable | — | Insère à la fin de la section la plus proche |
| Session introuvable | 404 | "Session introuvable" |
| Merge avec <2 notes | 400 | "Minimum 2 notes requises" |
| Merge déjà en cours | 409 | "Fusion déjà en cours" |
| Résultat pas prêt | 404 | "Fusion pas encore terminée" |

Frontend : erreurs affichées via `Snackbar` + `Alert` MUI.

---

## 13. Contraintes et limites (V1)

- **Maximum 10 étudiants** par session (contexte Claude)
- **Texte uniquement** : images/schémas ignorés dans le merge (conservés dans l'original)
- **Pas de temps réel** : merge lancé manuellement, suivi par polling
- **Pas d'authentification** (V1) : à ajouter en V2 (OAuth / JWT)
- **Pas de websocket** (V1) : polling RTK Query. Migrable en V2.

---

## 14. Plan d'implémentation (ordre recommandé)

### Étape 1 — Setup projet
- Monorepo `backend/` + `frontend/`
- Docker Compose (PostgreSQL)
- Backend : FastAPI + SQLAlchemy async + Alembic, première migration
- Frontend : Vite + React + MUI + RTK Query + Zustand, routing, theme

### Étape 2 — CRUD Sessions
- Backend : endpoints create / list / get session
- Frontend : DashboardPage + NewSessionPage + navigation Layout

### Étape 3 — Upload de notes
- Backend : endpoint upload (multipart) + validation + stockage fichier + delete
- Frontend : SessionDetailPage + NoteUploader (drag & drop) + NotesList

### Étape 4 — Pipeline normalisation
- `normalize.py` : conversion Pandoc → Markdown
- Tests unitaires 4 formats

### Étape 5 — Pipeline merge (cœur IA)
- `merge.py` : prompt Claude + parsing JSON
- `enrich.py` : prompt Claude par étudiant
- `orchestrator.py` : chaîne complète
- Tests avec fichiers fixtures

### Étape 6 — Export + téléchargement
- `export.py` : reconversion format original via Pandoc
- Endpoint download résultat (FileResponse)
- Frontend : ResultsPanel + boutons download

### Étape 7 — Intégration complète
- BackgroundTasks pour le merge
- Polling frontend (RTK Query pollingInterval)
- MergeProgress + gestion status error
- Test end-to-end complet

### Étape 8 — Polish
- Gestion d'erreurs exhaustive
- CORS configuration
- Dockerfiles + docker-compose fonctionnel
- README

---

## 15. Commandes de développement

```bash
# ---- Backend ----
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
docker compose up db -d
alembic upgrade head
uvicorn app.main:app --reload --port 8000
pytest -v

# ---- Frontend ----
cd frontend
npm install
npm run dev        # Vite dev server port 5173
npm run build
npm run test

# ---- Tout en un ----
docker compose up --build
```

---

## 16. Critères de succès (Definition of Done)

- [ ] `docker compose up` lance l'application complète (frontend + backend + DB)
- [ ] Un utilisateur peut créer une session depuis l'interface web
- [ ] 4 fichiers de test (un par format) peuvent être uploadés via drag & drop
- [ ] Le pipeline normalise correctement les 4 formats en Markdown
- [ ] Claude identifie correctement les informations manquantes par étudiant
- [ ] Les ajouts sont rédigés dans le style de chaque étudiant
- [ ] Les ajouts sont visuellement marqués `[AJOUT]` dans le document final
- [ ] Chaque étudiant peut télécharger son fichier dans son format d'origine
- [ ] Le polling frontend reflète l'avancement du merge en quasi temps réel
- [ ] Le pipeline complet s'exécute en moins de 2 minutes pour 4 étudiants
- [ ] Les erreurs sont affichées proprement (Snackbar / Alert MUI)
- [ ] Le .docx original conserve ses styles après enrichissement
