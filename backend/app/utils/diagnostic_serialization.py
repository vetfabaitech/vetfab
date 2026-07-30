"""Converts the internal `Diagnostic` dataclass (`app/models/diagnostic.py`)
to its Pydantic API shape (`DiagnosticSchema`, `app/schemas/diagnostics.py`).

A plain field-by-field mapping rather than `DiagnosticSchema.model_validate`
because the two shapes don't share attribute names 1:1 (`monaco_severity` on
the dataclass vs. `monacoSeverity` on the schema) -- centralized here so
`/lint` and the execution pipelines' result schemas do this identically.
"""

from app.models.diagnostic import Diagnostic
from app.schemas.diagnostics import DiagnosticSchema


def diagnostic_to_schema(d: Diagnostic) -> DiagnosticSchema:
    return DiagnosticSchema(
        file=d.file,
        line=d.line,
        column=d.column,
        message=d.message,
        severity=d.severity,
        monacoSeverity=int(d.monaco_severity),
        source=d.source,
        code=d.code,
    )
