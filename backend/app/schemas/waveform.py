"""Request/response schemas for the /waveform endpoints."""

from pydantic import BaseModel


class WaveformResponse(BaseModel):
    """Response for GET /api/v1/waveform/{jobId}.

    The raw VCD content itself is served separately by
    GET /api/v1/waveform/{jobId}/raw once `hasWaveform` is true.
    """

    jobId: str
    hasWaveform: bool
