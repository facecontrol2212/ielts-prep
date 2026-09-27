"""Turn an authored content document into database rows.

Contract:

* **One transaction.** A document either lands completely or not at all.
* **Idempotent by slug.** Re-importing the same ``slug`` updates the test *in place*:
  the ``tests`` row keeps its id (so links, attempts and bookmarks survive) while its
  sections, groups, questions and answer keys are deleted and recreated. Question ids
  therefore change on every re-import — that is deliberate and documented; an attempt
  in progress against a re-imported test is not a supported state.
* **Refuses to destroy history.** If any attempt against the test has been submitted or
  scored, the import is refused unless ``force=True``.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models.attempt import Attempt, AttemptAnswer
from app.models.content import SpeakingQuestion
from app.models.enums import AttemptStatus
from app.models.test import AnswerKey, Question, QuestionGroup, Section, Test
from app.schemas.content import (
    ContentValidationError,
    GroupDoc,
    QuestionDoc,
    SectionDoc,
    SpeakingBankDocument,
    TestDocument,
    WritingPromptSetDocument,
    default_options,
    load_document,
)

__all__ = [
    "ImportRefused",
    "ImportSummary",
    "import_directory",
    "import_document",
    "import_file",
    "import_speaking_bank",
    "import_test",
    "import_writing_prompts",
    "iter_content_files",
]


class ImportRefused(RuntimeError):
    """The import would destroy scored student work and ``force`` was not set."""


@dataclass
class ImportSummary:
    """What one import call did. Printed by the CLI, returned by the admin endpoint."""

    kind: str
    slug: str
    action: str  # created | updated
    test_id: uuid.UUID | None = None
    skill: str | None = None
    sections: int = 0
    groups: int = 0
    questions: int = 0
    answer_keys: int = 0
    items: int = 0
    warnings: list[str] = field(default_factory=list)

    def describe(self) -> str:
        if self.kind == "test":
            return (
                f"{self.action:<8} {self.slug}  [{self.skill}]  "
                f"{self.sections} section(s), {self.groups} group(s), "
                f"{self.questions} question(s), {self.answer_keys} key(s)"
            )
        return f"{self.action:<8} {self.slug}  {self.items} item(s)"

    def as_dict(self) -> dict[str, Any]:
        return {
            "kind": self.kind,
            "slug": self.slug,
            "action": self.action,
            "test_id": self.test_id,
            "skill": self.skill,
            "sections": self.sections,
            "groups": self.groups,
            "questions": self.questions,
            "answer_keys": self.answer_keys,
            "items": self.items,
            "warnings": self.warnings,
        }


# --------------------------------------------------------------------------- tests


_PROTECTED_STATUSES = (AttemptStatus.SUBMITTED, AttemptStatus.SCORED)


def _protected_attempts(db: Session, test_id: uuid.UUID) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(Attempt)
            .where(Attempt.test_id == test_id, Attempt.status.in_(_PROTECTED_STATUSES))
        )
        or 0
    )


def import_test(db: Session, document: TestDocument, *, force: bool = False) -> ImportSummary:
    """Create or update the test described by ``document``."""
    existing = db.scalar(select(Test).where(Test.slug == document.slug))
    summary = ImportSummary(
        kind="test",
        slug=document.slug,
        action="created",
        skill=document.skill.value,
        warnings=list(document.evidence_problems()),
    )

    try:
        if existing is None:
            test = Test(slug=document.slug)
            db.add(test)
        else:
            test = existing
            summary.action = "updated"
            _guard_and_clear(db, test, force=force, summary=summary)

        _apply_test_fields(test, document, is_new=existing is None)
        db.flush()

        for section_doc in sorted(document.sections, key=lambda s: s.order):
            _build_section(db, test, section_doc, summary)

        db.flush()
        db.commit()
    except Exception:
        db.rollback()
        raise

    summary.test_id = test.id
    return summary


def _guard_and_clear(db: Session, test: Test, *, force: bool, summary: ImportSummary) -> None:
    """Refuse to clobber scored work, then delete the test's children."""
    protected = _protected_attempts(db, test.id)
    if protected and not force:
        raise ImportRefused(
            f"'{test.slug}' has {protected} submitted/scored attempt(s) against it. "
            f"Re-importing would rewrite the questions those attempts were scored on. "
            f"Pass force=True (CLI: --force) if you really mean to."
        )

    old_question_ids = list(
        db.scalars(
            select(Question.id).join(Section).where(Section.test_id == test.id)
        ).all()
    )
    if old_question_ids:
        orphans = (
            db.scalar(
                select(func.count())
                .select_from(AttemptAnswer)
                .where(AttemptAnswer.question_id.in_(old_question_ids))
            )
            or 0
        )
        if orphans:
            db.execute(
                delete(AttemptAnswer).where(AttemptAnswer.question_id.in_(old_question_ids))
            )
            summary.warnings.append(
                f"deleted {orphans} saved answer(s) that pointed at the replaced questions"
            )

    for section in list(test.sections):
        db.delete(section)
    test.sections = []
    db.flush()


def _apply_test_fields(test: Test, document: TestDocument, *, is_new: bool) -> None:
    test.skill = document.skill
    test.variant = document.variant
    test.title = document.title
    test.description = document.description
    test.difficulty = document.difficulty
    test.duration_seconds = document.duration_seconds
    test.transfer_seconds = document.transfer_seconds
    test.question_count = document.question_count
    test.source = document.source
    if document.is_published is not None:
        test.is_published = document.is_published
    elif is_new:
        test.is_published = False


def _build_section(
    db: Session, test: Test, doc: SectionDoc, summary: ImportSummary
) -> Section:
    numbers = [q.number for q in doc.questions]
    section = Section(
        test_id=test.id,
        order=doc.order,
        title=doc.title,
        instructions=doc.instructions,
        passage_html=doc.passage_html,
        audio_url=doc.audio_url,
        transcript=doc.transcript,
        prompt_html=doc.prompt_html,
        image_url=doc.image_url,
        min_words=doc.min_words,
        start_question=doc.start_question or (min(numbers) if numbers else None),
        end_question=doc.end_question or (max(numbers) if numbers else None),
    )
    db.add(section)
    db.flush()
    summary.sections += 1

    for group_doc in sorted(doc.groups, key=lambda g: g.order):
        _build_group(db, section, group_doc, summary)
    return section


def _build_group(
    db: Session, section: Section, doc: GroupDoc, summary: ImportSummary
) -> QuestionGroup:
    # TFNG / YNNG have an implicit pool; materialise it so the frontend can render buttons.
    pool = [o.model_dump() for o in doc.options] if doc.options else default_options(doc.type)
    group = QuestionGroup(
        section_id=section.id,
        order=doc.order,
        type=doc.type,
        instructions=doc.instructions,
        word_limit=doc.word_limit,
        allow_number=doc.allow_number,
        options=pool,
        select_count=doc.select_count,
        content_html=doc.content_html,
        image_url=doc.image_url,
    )
    db.add(group)
    db.flush()
    summary.groups += 1

    for question_doc in sorted(doc.questions, key=lambda q: q.number):
        _build_question(db, section, group, doc, question_doc, summary)
    return group


def _build_question(
    db: Session,
    section: Section,
    group: QuestionGroup,
    group_doc: GroupDoc,
    doc: QuestionDoc,
    summary: ImportSummary,
) -> Question:
    # Only store options on the question when the author overrode the group pool, so the
    # exam payload stays small; TFNG/YNNG defaults are materialised on the group instead.
    question_options = [o.model_dump() for o in doc.options] if doc.options else None
    if question_options is None and group.options is None:
        question_options = default_options(doc.resolved_type(group_doc))

    question = Question(
        section_id=section.id,
        group_id=group.id,
        number=doc.number,
        type=doc.resolved_type(group_doc),
        prompt=doc.prompt,
        options=question_options,
        word_limit=doc.resolved_word_limit(group_doc),
        allow_number=doc.resolved_allow_number(group_doc),
        evidence=doc.evidence,
        audio_timestamp=doc.audio_timestamp,
    )
    db.add(question)
    db.flush()
    summary.questions += 1

    db.add(
        AnswerKey(
            question_id=question.id,
            accepted=list(doc.answer.accepted),
            match_mode=doc.resolved_match_mode(group_doc),
            allow_optional_article=doc.answer.allow_optional_article,
            explanation=doc.answer.explanation,
        )
    )
    summary.answer_keys += 1
    return question


# ------------------------------------------------------------------------ speaking


def import_speaking_bank(
    db: Session, document: SpeakingBankDocument, *, prune: bool = False
) -> ImportSummary:
    """Upsert the speaking question bank, keyed on the question text.

    ``prune=True`` also deletes bank rows that the file no longer contains.
    """
    summary = ImportSummary(kind="speaking_bank", slug="speaking-bank", action="updated")
    try:
        existing = {q.question.strip().casefold(): q for q in db.scalars(select(SpeakingQuestion))}
        seen: set[str] = set()
        created = 0
        updated = 0

        for doc in document.questions:
            key = doc.question.strip().casefold()
            seen.add(key)
            row = existing.get(key)
            if row is None:
                row = SpeakingQuestion(question=doc.question)
                db.add(row)
                created += 1
            else:
                updated += 1
            row.part = doc.part
            row.topic = doc.topic
            row.cue_points = list(doc.cue_points) if doc.cue_points else None
            row.model_answer = doc.model_answer
            row.useful_phrases = [p.model_dump() for p in doc.useful_phrases] or None
            row.band_target = doc.band_target

        if prune:
            stale = [row for key, row in existing.items() if key not in seen]
            for row in stale:
                db.delete(row)
            if stale:
                summary.warnings.append(f"pruned {len(stale)} question(s) no longer in the file")

        db.commit()
    except Exception:
        db.rollback()
        raise

    summary.items = len(document.questions)
    summary.action = "created" if not updated else "updated"
    summary.warnings.append(f"{created} new, {updated} updated")
    return summary


# ------------------------------------------------------------------------- writing


def import_writing_prompts(
    db: Session, document: WritingPromptSetDocument, *, force: bool = False
) -> list[ImportSummary]:
    """Each prompt becomes a one-section, zero-question writing test."""
    return [
        import_test(db, prompt.to_test_document(document.variant), force=force)
        for prompt in document.prompts
    ]


# ------------------------------------------------------------------------ dispatch


def import_document(db: Session, document: Any, *, force: bool = False) -> list[ImportSummary]:
    """Import any content document, dispatching on its ``kind``."""
    if isinstance(document, TestDocument):
        return [import_test(db, document, force=force)]
    if isinstance(document, SpeakingBankDocument):
        return [import_speaking_bank(db, document)]
    if isinstance(document, WritingPromptSetDocument):
        return import_writing_prompts(db, document, force=force)
    raise ContentValidationError([f"unknown document type {type(document).__name__}"])


def import_file(db: Session, path: str | Path, *, force: bool = False) -> list[ImportSummary]:
    """Validate and import a single JSON file."""
    return import_document(db, load_document(path), force=force)


def iter_content_files(root: str | Path) -> list[Path]:
    """Every content JSON file under ``root``, in a stable order."""
    base = Path(root)
    if base.is_file():
        return [base]
    return sorted(p for p in base.rglob("*.json") if not p.name.startswith("."))


def import_directory(
    db: Session, root: str | Path, *, force: bool = False
) -> tuple[list[ImportSummary], list[tuple[Path, Exception]]]:
    """Import every JSON file under ``root``. Returns ``(summaries, failures)``.

    A bad file does not stop the run: everything importable is imported and the failures
    are reported together at the end.
    """
    summaries: list[ImportSummary] = []
    failures: list[tuple[Path, Exception]] = []
    for path in iter_content_files(root):
        try:
            summaries.extend(import_file(db, path, force=force))
        except Exception as exc:  # noqa: BLE001 - reported, not swallowed
            failures.append((path, exc))
    return summaries, failures
