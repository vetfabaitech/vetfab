"""LSP stdio wire format: `Content-Length: <n>\\r\\n\\r\\n<n bytes of UTF-8 JSON>`.

svlangserver (like every LSP server) speaks this framing over its stdin/
stdout, not raw JSON lines. Monaco's side (vscode-ws-jsonrpc) instead sends
one bare JSON object per WebSocket text frame. `lsp/process.py` and
`websocket/lsp_ws.py` both import this module so there is exactly one place
that knows how to encode/decode the stdio framing in either direction.
"""

import asyncio
import json
from typing import Any

_HEADER_ENCODING = "ascii"
_CONTENT_ENCODING = "utf-8"


def encode_message(payload: dict[str, Any]) -> bytes:
    """Serialize one JSON-RPC message with its Content-Length header, ready
    to write directly to an LSP server's stdin."""

    body = json.dumps(payload).encode(_CONTENT_ENCODING)
    header = f"Content-Length: {len(body)}\r\n\r\n".encode(_HEADER_ENCODING)
    return header + body


async def read_message(reader: asyncio.StreamReader) -> dict[str, Any] | None:
    """Read one framed JSON-RPC message from an LSP server's stdout.

    Returns None on a clean EOF (the process exited). Raises
    `asyncio.IncompleteReadError` if the stream closes mid-message.
    """

    content_length: int | None = None
    while True:
        line = await reader.readline()
        if not line:
            return None  # EOF before any header -- process exited cleanly
        line = line.strip()
        if not line:
            break  # blank line: end of headers
        name, _, value = line.decode(_HEADER_ENCODING).partition(":")
        if name.strip().lower() == "content-length":
            content_length = int(value.strip())

    if content_length is None:
        raise ValueError("LSP message missing Content-Length header")

    body = await reader.readexactly(content_length)
    return json.loads(body.decode(_CONTENT_ENCODING))
