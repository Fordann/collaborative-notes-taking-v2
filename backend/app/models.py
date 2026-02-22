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
    original_format: Mapped[str] = mapped_column(String(10))
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
