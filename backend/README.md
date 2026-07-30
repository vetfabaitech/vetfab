# HDL WebIDE Backend

FastAPI backend for the HDL WebIDE. This milestone implements the **real**
MVP execution pipeline: every `/api/v1/execute` spins up a fresh Docker
container, compiles+runs the design through whichever engine
`execution.simulator` names (**Verilator** by default, **Icarus Verilog**
kept as a second, backward-compatible engine), and (if a `.vcd`/`.fst` is
produced) extracts it and serves it directly to the frontend. See
`app/services/simulators/` for the simulator abstraction — `ExecutionManager`
never hardcodes an engine; it resolves a `SimulatorAdapter` via
`SimulatorFactory` from the payload and only ever calls `compile()`/`run()`
on it. Waveform *viewing* happens entirely client-side via
[Surfer](https://surfer-project.org/), a mature open-source Rust/WASM waveform
viewer embedded as an iframe (see `frontend/public/`) — there is no custom
waveform parser or renderer anywhere in this codebase.

MVP scope, deliberately excluded: Redis/Celery/RabbitMQ, a job queue or worker
pool, Kubernetes/horizontal scaling, auth, multi-user/project/workspace
management, compilation caching, and monitoring. One container per run,
one local user.

This backend also implements a **Verilog/SystemVerilog language
intelligence service** (autocomplete/hover/go-to-definition via svlangserver,
on-demand Verilator diagnostics, Verible formatting, and Surelog-driven
symbol/hierarchy indexing) -- see "Language intelligence service" below.
VHDL, mixed-language navigation, Vivado/XDC parsing, and AI features are
explicitly out of scope for this milestone.

## Folder Structure

```
backend/
├── Dockerfile                    # FastAPI + svlangserver + Verilator + Verible + Surelog image
├── docker/
│   ├── Dockerfile               # Verilator + Icarus Verilog execution image (unrelated -- per-run/terminal sandbox)
│   └── README.md                # How to build it
├── app/
│   ├── main.py                  # App factory, CORS, router wiring, exception handlers
│   ├── config.py                # Env-driven settings (CORS, Docker, LSP/workspace)
│   ├── api/                     # REST routers (HTTP request/response only)
│   │   ├── run.py               # POST /api/v1/run
│   │   ├── stop.py              # POST /api/v1/stop/{jobId}
│   │   ├── waveform.py          # GET  /api/v1/waveform/{jobId} and /{jobId}/raw
│   │   ├── terminal.py          # Reserved for future terminal REST endpoints
│   │   ├── workspace.py         # POST /api/v1/workspace/create|open|save|delete
│   │   ├── format.py            # POST /api/v1/format
│   │   ├── lint.py              # POST /api/v1/lint
│   │   └── index.py             # POST /api/v1/reindex, GET /api/v1/symbols|hierarchy
│   ├── websocket/                # WebSocket routers
│   │   ├── run_ws.py            # WS /ws/run/{jobId}
│   │   ├── terminal_ws.py       # WS /ws/terminal/{projectId}
│   │   └── lsp_ws.py            # WS /ws/lsp/{projectId} -- Monaco <-> svlangserver JSON-RPC proxy
│   ├── services/                 # Business logic, no FastAPI imports (execution/terminal pipeline)
│   │   └── simulators/           # SimulatorAdapter contract + Verilator/Icarus adapters + factory
│   ├── workspace/
│   │   └── manager.py           # Per-project on-disk workspace directories (create/open/save/delete)
│   ├── lsp/
│   │   ├── process.py           # One svlangserver subprocess + LSP stdio framing
│   │   └── manager.py           # One LspProcess per project; start/stop/restart/idle-reap
│   ├── diagnostics/
│   │   └── verilator.py         # On-demand `verilator --lint-only`, parsed into Monaco markers
│   ├── formatter/
│   │   └── verible.py           # On-demand `verible-verilog-format`
│   ├── indexer/
│   │   └── surelog.py           # Surelog (validation) + regex symbol/hierarchy scan -> SymbolCache
│   ├── cache/
│   │   └── symbol_cache.py      # In-memory WorkspaceIndex cache, one entry per project
│   ├── models/
│   │   ├── job.py               # In-memory Job dataclass (stand-in for DB row)
│   │   ├── workspace.py         # WorkspaceSession dataclass
│   │   ├── symbol.py            # ModuleSymbol/PackageSymbol/InstanceNode/... (Symbol Cache shape)
│   │   └── diagnostic.py        # Diagnostic dataclass + Monaco MarkerSeverity enum
│   ├── schemas/                  # Pydantic request/response models
│   │   ├── common.py            # JobStatus, HdlLanguage enums
│   │   ├── run.py               # RunRequest/RunResponse/StopResponse/HdlFile
│   │   ├── result.py            # ExecutionResult (final WS message payload)
│   │   ├── waveform.py          # WaveformResponse
│   │   ├── workspace.py         # /workspace/* request/response models
│   │   ├── diagnostics.py       # /lint request/response models
│   │   ├── format.py            # /format request/response models
│   │   └── index.py             # /reindex, /symbols, /hierarchy response models
│   └── utils/
│       ├── logger.py             # Logging configuration helpers
│       ├── exceptions.py         # JobNotFoundError, DockerExecutionError, LspProcessError, etc.
│       ├── lsp_framing.py        # LSP stdio Content-Length codec (shared by lsp/ and websocket/lsp_ws.py)
│       └── symbol_serialization.py  # Symbol Cache dataclasses -> Pydantic response schemas
├── requirements.txt
└── README.md
```

Routers depend on services via FastAPI `Depends(...)` — routers never contain
business logic, and services never import FastAPI types.

## Execution flow

There are two pipelines. **`/api/v1/execute` is what the frontend actually
uses** and supports simulator selection; `/api/v1/run` is a legacy flat
two-file pipeline kept for backward compatibility, always Icarus (its
request schema has no `simulator` field).

### `/api/v1/execute` (current, simulator-selectable)

1. `POST /api/v1/execute` validates Docker is reachable (else `500`) and
   registers a job in memory with the full `ProjectExecutionPayload`,
   returning `{ jobId, status: "queued" }` immediately.
2. The frontend opens `WS /ws/execute/{jobId}`. That connection drives the
   pipeline (`ExecutionManager.stream_execution`):
   - reconstructs the workspace from `payload.workspace.tree` + `payload.files`
     (no filesystem scan) and copies it into a **fresh** container
   - resolves `payload.execution.simulator` to a `SimulatorAdapter` via
     `SimulatorFactory` (`verilator` by default, `iverilog` also available;
     an unknown id fails the job cleanly instead of crashing)
   - `adapter.compile(...)` builds and runs that engine's compile command
     (Verilator: `verilator --binary --timing --Mdir obj_dir -o sim.out
     [--trace] [--top-module <testbench>] <files>`; Icarus: `iverilog -g2012
     -o sim.out <files>`) and parses its own diagnostic format into a
     structured `Diagnostic` list, streamed to the frontend alongside the raw
     text (see `app/services/simulators/`)
   - on compile failure: reports `status: "failed"` with `compilerOutput`/
     `stderr`/structured `diagnostics`, cleans up, stops — no simulation runs
   - on compile success: `adapter.run(...)` executes the compiled artifact
     (Verilator's native `obj_dir/sim.out`; Icarus's `vvp sim.out`)
   - if `execution.waveform.enabled`, looks for a `.vcd`/`.fst` file the
     testbench produced (unchanged regardless of engine — both honor the
     testbench's own `$dumpfile`/`$dumpvars` calls); if found, extracts it and
     holds the raw bytes on the in-memory `ExecutionJob`
   - always destroys the container, even on failure
3. `POST /api/v1/execute/{jobId}/stop` kills the job's container immediately;
   the pipeline notices on its next checkpoint and finishes cleanup.

### `/api/v1/run` (legacy, Icarus-only)

Same shape, but fixed to a flat `{ files: [{name, content}] }` request with
no simulator selection — always runs through `IcarusAdapter` directly. See
`ExecutionService`/`WS /ws/run/{jobId}`.

## REST API Endpoints

### `POST /api/v1/run`
Request:
```json
{
  "language": "verilog",
  "projectId": "project123",
  "tabId": "tab1",
  "files": [
    { "name": "design.v", "content": "..." },
    { "name": "tb.v", "content": "..." }
  ]
}
```
Response (`202 Accepted`): `{ "jobId": "...", "status": "queued" }`
Response (`500`): Docker daemon unreachable.

### `POST /api/v1/stop/{jobId}`
Response (`200 OK`): `{ "jobId": "...", "status": "terminated" }`
`404` if unknown job, `409` if already in a terminal state.

### `GET /api/v1/waveform/{jobId}`
Response (`200 OK`): `{ "jobId": "...", "hasWaveform": true | false }`
`404` if unknown job.

### `GET /api/v1/waveform/{jobId}/raw`
Returns the raw `.vcd` file content (`Content-Type: text/plain`) for the
frontend's embedded Surfer viewer to fetch directly. `404` if the job has no
waveform.

## WebSocket Endpoints

### `WS /ws/run/{jobId}`
JSON text frames, one of three shapes:

```jsonc
{"type": "log", "message": "Compilation Started"}                        // Logs panel only
{"type": "output", "stream": "compiler", "text": "..."}                  // Output panel only
                                        // stream is "compiler" | "stdout" | "stderr"
{"type": "result", "status": "completed", "stdout": "...", "stderr": "...",
 "compilerOutput": "...", "hasWaveform": true}                           // final message
```

Lifecycle log messages sent (`type: "log"`): `Request Received`,
`Creating Docker Container`, `Compilation Started`, `Compilation Finished`,
`Simulation Started`, `Simulation Finished`, `Cleaning Resources`,
`Container Destroyed`, `Execution Finished`.

The VCD content is **never** sent over this socket — only the `hasWaveform`
flag. The frontend fetches the raw file from `GET /api/v1/waveform/{jobId}/raw`.

### `WS /ws/terminal/{projectId}`
Real interactive terminal. One long-lived, isolated container per connection
(`hdl-term-{sessionId}`, not tied to job containers), attached to a real
`bash` TTY via `docker exec`, so Ctrl+C/Ctrl+L/Up-Down history are handled by
bash itself rather than reimplemented here. Protocol:

```jsonc
// client -> server, exactly one "init" first, then any number of input/resize
{"type": "init", "files": [{"name": "design.v", "content": "..."}], "cols": 80, "rows": 24}
{"type": "input", "data": "ls\n"}
{"type": "resize", "cols": 100, "rows": 32}

// server -> client
{"type": "ready"}
{"type": "output", "data": "...raw bytes incl. ANSI escapes..."}
{"type": "error", "message": "..."}
{"type": "exit"}
```

The container is seeded with the files sent in `init` and is destroyed when
the socket disconnects (or after `TERMINAL_IDLE_TIMEOUT` seconds as a safety
net for connections that never close cleanly). After each `/ws/run/{jobId}`
job finishes, `ExecutionService` best-effort mirrors that job's waveform and
compiler/sim output into any live terminal session for the same `projectId`
(see `ExecutionService._mirror_to_terminal_sessions`) -- this never affects
the run pipeline itself, even if the terminal container is gone or Docker
errors partway through.

## Language intelligence service

Real, per-project on-disk workspace directories (under `LSP_WORKSPACE_ROOT`,
not Supabase blobs or ephemeral Docker containers) back four Linux-native
tools, each invoked the way the LSP-service spec requires:

- **svlangserver**: one long-lived subprocess per open project (never
  shared), managed by `LspProcessManager` (start/stop/restart/idle-reap).
  `WS /ws/lsp/{projectId}` is a pure JSON-RPC proxy -- it re-frames each
  WebSocket text frame with an LSP `Content-Length` header and writes it to
  that project's svlangserver stdin, and vice versa for responses/
  notifications. Completion, hover, signature help, go-to-definition, find
  references, rename, and document/workspace symbols are all svlangserver's
  own LSP responses -- the backend never interprets them.
- **Verilator**: `POST /api/v1/lint` only -- writes the posted files into
  the workspace, runs `verilator --lint-only -Wall` fresh, and parses its
  stderr into Monaco-marker-shaped diagnostics. Never runs continuously; the
  frontend is expected to call this on save and/or after its own 800ms
  debounce (`VERILATOR_DEBOUNCE_MS`).
- **Verible**: `POST /api/v1/format` only -- formats one file
  (`verible-verilog-format`) on explicit request, never automatically.
- **Surelog**: `POST /api/v1/reindex` only (also lazily triggered by a
  `/symbols` or `/hierarchy` cache miss) -- validates the design and feeds a
  lightweight regex-based module/package/parameter/signal/instance scan
  (see `app/indexer/surelog.py` for why: full semantic extraction would
  need the `pyuhdm` UHDM bindings, out of scope for this MVP) into the
  `SymbolCache`. Never runs per-keystroke.

### REST endpoints

```
POST /api/v1/workspace/create   { projectId }
POST /api/v1/workspace/open     { projectId, files: [{ path, content }] }
POST /api/v1/workspace/save     { projectId, files: [{ path, content }] }
POST /api/v1/workspace/delete   { projectId }
POST /api/v1/format             { workspace, filename } -> { filename, formatted }
POST /api/v1/lint               { projectId, files } -> { projectId, diagnostics: [...] }
POST /api/v1/reindex            { projectId } -> { moduleCount, packageCount, errorCount, indexedAt }
GET  /api/v1/symbols?projectId=...    -> { modules, packages, indexedAt }
GET  /api/v1/hierarchy?projectId=...  -> { instanceTree, indexedAt }
```

### `WS /ws/lsp/{projectId}`

Bare JSON-RPC 2.0 objects, one per text frame, in either direction --
exactly what `vscode-ws-jsonrpc` sends/expects on the frontend. No custom
envelope. On first connection for a project, its svlangserver process is
started if not already running; on disconnect, only that one client detaches
-- the process itself keeps running for other tabs/until it's idle-reaped
(`LSP_IDLE_TIMEOUT`) or the project workspace is deleted.

### Running the toolchain locally

svlangserver/Verilator/Verible/Surelog are Linux-native. On Windows, either
run this backend inside `backend/Dockerfile` (see below) or under WSL --
plain `uvicorn` on Windows will serve `/workspace/*` and `/health` fine
(pure filesystem I/O) but 500 on `/lint`, `/format`, `/reindex`, and
`/ws/lsp`.

## Docker image

Build the execution image once (see `docker/README.md`) — it ships both
Verilator and Icarus Verilog, plus the C++ toolchain Verilator's `--binary`
compile step needs:
```bash
docker build -t hdl-webide-iverilog:latest backend/docker
```
**If you built this image before the Verilator migration, rebuild it** — the
old image has no C++ toolchain and Verilator compiles will fail. The image
name must match `DOCKER_IMAGE` in `.env`. Docker Desktop (or an equivalent
daemon) must be running for `/api/v1/execute` (or the legacy `/api/v1/run`)
to succeed.

Separately, build the backend's own image (Python + FastAPI + the four
language-intelligence tools above) to actually exercise the language
service locally on Windows:
```bash
docker build -t hdl-webide-backend:latest backend
docker run --rm -p 8000:8000 -v hdl-webide-workspaces:/data/workspaces hdl-webide-backend:latest
```
This image builds Surelog from source (no Debian package exists), so the
first build is slow; subsequent builds are cached unless `backend/Dockerfile`
changes.

## Environment variables

Copy `.env.example` to `.env` — see that file for the full list (CORS origins,
Docker image/timeout). No auth exists on this backend; these are connection
settings only. No AWS/S3 credentials are needed — waveforms are served
directly by this backend.

## Running the Server

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # on Windows
pip install -r requirements.txt
docker build -t hdl-webide-iverilog:latest docker
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`, with interactive docs at
`http://localhost:8000/docs`.

## What's still a stub

- **PostgreSQL persistence**: see `TODO(postgres)` comments in
  `execution_service.py` and `models/job.py`. Jobs (and their VCD bytes) live
  in an in-memory dict and are lost on restart.
- **Terminal REST endpoints** (`api/terminal.py`) are reserved but empty --
  e.g. for persisting command history later. The terminal itself is fully
  WebSocket-driven and real (see above), not a stub.
- **Surelog symbol/hierarchy extraction** (`app/indexer/surelog.py`) is a
  regex-based text scan, not a UHDM-based semantic extraction -- Surelog
  itself is invoked and its errors surface in `WorkspaceIndex.errors`, but
  building on its actual elaborated output needs the `pyuhdm` bindings
  (not part of this MVP's dependencies). Swapping this in later only means
  rewriting `_scan_file` in that one module.
- **`backend/Dockerfile`** has not been build-tested in this environment (no
  Docker daemon / Linux host was available while writing it) -- the
  Surelog-from-source step in particular may need dependency adjustments;
  check chipsalliance/Surelog's current `BUILDING.md` if the build fails.
