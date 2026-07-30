"""GET /api/v1/waveform/{jobId} -- waveform (VCD) availability + raw content."""

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.schemas.waveform import WaveformResponse
from app.services.waveform_service import WaveformService, get_waveform_service
from app.utils.exceptions import JobNotFoundError
from app.utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1", tags=["waveform"])


@router.get("/waveform/{jobId}", response_model=WaveformResponse)
async def get_waveform(
    jobId: str,
    waveform_service: WaveformService = Depends(get_waveform_service),
) -> WaveformResponse:
    """Return whether a job has a waveform available.

    `hasWaveform` is false until the job completes with a dumped `.vcd`/`.fst`
    (or if it never produced one). When true, fetch the raw file from
    GET /api/v1/waveform/{jobId}/raw.
    """

    try:
        has_waveform = waveform_service.has_waveform(jobId)
    except JobNotFoundError as exc:
        logger.warning("Waveform requested for unknown job %s", jobId)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return WaveformResponse(jobId=jobId, hasWaveform=has_waveform)


@router.get("/waveform/{jobId}/raw")
async def get_waveform_raw(
    jobId: str,
    waveform_service: WaveformService = Depends(get_waveform_service),
) -> Response:
    """Return the raw VCD file content for a job, for the frontend's embedded
    waveform viewer (Surfer) to fetch directly."""

    try:
        vcd_bytes = waveform_service.get_waveform_vcd(jobId)
    except JobNotFoundError as exc:
        logger.warning("Raw waveform requested for unknown job %s", jobId)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    if vcd_bytes is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Job '{jobId}' has no waveform")

    return Response(
        content=vcd_bytes,
        media_type="text/plain",
        headers={
            # Surfer's self-hosted build ships a service worker that opts itself
            # into Cross-Origin-Embedder-Policy: require-corp (frontend/public/surfer).
            # Under COEP, cross-origin resources must carry CORP to be embeddable/
            # fetchable, regardless of otherwise-valid CORS headers. Without this,
            # Surfer's WASM fetch of this VCD can be silently blocked by the browser.
            "Cross-Origin-Resource-Policy": "cross-origin",
            "Content-Disposition": 'inline; filename="wave.vcd"',
        },
    )
