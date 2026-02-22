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
