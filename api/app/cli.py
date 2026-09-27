"""Content pipeline command line.

    uv run python -m app.cli validate content/reading/academic-01.json
    uv run python -m app.cli import content/reading/academic-01.json [--force]
    uv run python -m app.cli import-dir content/ [--force]
    uv run python -m app.cli seed-speaking content/speaking/questions.json [--prune]
    uv run python -m app.cli seed-bands

Every command prints what it created, what it updated and what failed and why, then exits
0 on success and 1 if anything failed. The database it talks to is ``settings.database_url``
(override with the ``DATABASE_URL`` environment variable).
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence
from pathlib import Path

from sqlalchemy.orm import Session

from app.schemas.content import ContentValidationError, SpeakingBankDocument, load_document
from app.services.importer import (
    ImportRefused,
    ImportSummary,
    import_document,
    import_speaking_bank,
    iter_content_files,
)

OK = "  ok   "
FAIL = " FAIL  "
WARN = " warn  "


def _session() -> Session:
    from app.core.db import SessionLocal

    return SessionLocal()


def _print_summaries(summaries: Sequence[ImportSummary]) -> None:
    for s in summaries:
        print(f"{OK}{s.describe()}")
        for w in s.warnings:
            print(f"{WARN}  {w}")


def _print_failure(path: Path | str, exc: Exception) -> None:
    print(f"{FAIL}{path}")
    if isinstance(exc, ContentValidationError):
        for problem in exc.problems:
            print(f"         - {problem}")
    else:
        print(f"         {type(exc).__name__}: {exc}")


# ------------------------------------------------------------------------ commands


def cmd_validate(args: argparse.Namespace) -> int:
    """Parse content files without touching the database."""
    paths = [p for target in args.paths for p in iter_content_files(target)]
    if not paths:
        print(f"{FAIL}no JSON files found in {', '.join(args.paths)}")
        return 1

    failed = 0
    for path in paths:
        try:
            document = load_document(path)
        except ContentValidationError as exc:
            _print_failure(path, exc)
            failed += 1
            continue
        detail = getattr(document, "kind", "?")
        if hasattr(document, "questions") and document.kind == "test":
            detail = f"test, {len(document.questions)} question(s)"
            for problem in document.evidence_problems():
                print(f"{WARN}{path}: {problem}")
        print(f"{OK}{path}  [{detail}]")

    print(f"\n{len(paths) - failed}/{len(paths)} file(s) valid")
    return 1 if failed else 0


def cmd_import(args: argparse.Namespace) -> int:
    path = Path(args.path)
    if not path.is_file():
        print(f"{FAIL}{path} is not a file")
        return 1
    try:
        document = load_document(path)
    except ContentValidationError as exc:
        _print_failure(path, exc)
        return 1

    with _session() as db:
        try:
            summaries = import_document(db, document, force=args.force)
        except ImportRefused as exc:
            db.rollback()
            _print_failure(path, exc)
            return 1
        except Exception as exc:  # noqa: BLE001 - surfaced to the operator
            db.rollback()
            _print_failure(path, exc)
            return 1
        _print_summaries(summaries)
    return 0


def cmd_import_dir(args: argparse.Namespace) -> int:
    paths = iter_content_files(args.path)
    if not paths:
        print(f"{FAIL}no JSON files found under {args.path}")
        return 1

    created = updated = 0
    failures: list[tuple[Path, Exception]] = []
    with _session() as db:
        for path in paths:
            try:
                document = load_document(path)
                summaries = import_document(db, document, force=args.force)
            except Exception as exc:  # noqa: BLE001 - collected and reported below
                db.rollback()
                failures.append((path, exc))
                continue
            print(f"{OK}{path}")
            for s in summaries:
                print(f"         {s.describe()}")
                for w in s.warnings:
                    print(f"{WARN}    {w}")
                created += s.action == "created"
                updated += s.action == "updated"

    print(f"\n{created} created, {updated} updated, {len(failures)} failed")
    for path, exc in failures:
        _print_failure(path, exc)
    return 1 if failures else 0


def cmd_seed_speaking(args: argparse.Namespace) -> int:
    try:
        document = load_document(args.path)
    except ContentValidationError as exc:
        _print_failure(args.path, exc)
        return 1
    if not isinstance(document, SpeakingBankDocument):
        print(f"{FAIL}{args.path} is a '{document.kind}' document, expected 'speaking_bank'")
        return 1

    with _session() as db:
        try:
            summary = import_speaking_bank(db, document, prune=args.prune)
        except Exception as exc:  # noqa: BLE001 - surfaced to the operator
            db.rollback()
            _print_failure(args.path, exc)
            return 1
        _print_summaries([summary])
    return 0


def cmd_seed_bands(_args: argparse.Namespace) -> int:
    """Load the raw-score -> band conversion tables (Agent A owns the data)."""
    try:
        from app.services.scoring.bands import seed_band_tables
    except ImportError as exc:
        print(f"{FAIL}band tables are not available yet: {exc}")
        print(
            "         Expected app.services.scoring.bands.seed_band_tables(db).\n"
            "         That module belongs to the scoring engine; run this again once it lands."
        )
        return 1

    with _session() as db:
        try:
            result = seed_band_tables(db)
        except Exception as exc:  # noqa: BLE001 - surfaced to the operator
            db.rollback()
            print(f"{FAIL}seed_band_tables failed: {type(exc).__name__}: {exc}")
            return 1
        db.commit()
    print(f"{OK}band tables seeded ({result if result is not None else 'done'})")
    return 0


# --------------------------------------------------------------------------- main


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="app.cli", description="IELTS content pipeline")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("validate", help="validate content files without importing")
    p.add_argument("paths", nargs="+")
    p.set_defaults(func=cmd_validate)

    p = sub.add_parser("import", help="import one content JSON file")
    p.add_argument("path")
    p.add_argument("--force", action="store_true", help="overwrite a test with scored attempts")
    p.set_defaults(func=cmd_import)

    p = sub.add_parser("import-dir", help="import every JSON file under a directory")
    p.add_argument("path")
    p.add_argument("--force", action="store_true", help="overwrite tests with scored attempts")
    p.set_defaults(func=cmd_import_dir)

    p = sub.add_parser("seed-speaking", help="load the speaking question bank")
    p.add_argument("path")
    p.add_argument("--prune", action="store_true", help="delete bank rows not in the file")
    p.set_defaults(func=cmd_seed_speaking)

    p = sub.add_parser("seed-bands", help="load the raw-score to band conversion tables")
    p.set_defaults(func=cmd_seed_bands)

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":  # pragma: no cover - entry point
    sys.exit(main())
