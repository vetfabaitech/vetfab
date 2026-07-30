# HDL execution image

Contains Verilator (the default run-pipeline engine) plus Icarus Verilog
(kept as a second, backward-compatible engine -- see
`app/services/simulators/`), Yosys, GHDL, git, make, and a C++ toolchain
(`build-essential`, required for Verilator's `--binary` compile step). Used
both as a fresh, short-lived sandbox per run (`hdl-run-{jobId}`,
created/destroyed per `/api/v1/execute` -- see `app/services/docker_service.py`)
and as the long-lived container backing each open integrated-terminal session
(`hdl-term-{sessionId}`, one per browser tab -- see `app/services/terminal_service.py`).

**If you built this image before the Verilator migration, rebuild it** --
the old image has no C++ toolchain, so Verilator's `--binary` step will fail
with a `make`/`g++` not-found error until you do:
```bash
docker build -t hdl-webide-iverilog:latest backend/docker
```

Waveform viewing is handled entirely in the browser (see the `Surfer`
integration in `frontend/public/`) -- this image does not render or export
any waveform images.

Build it once before running the backend, and rebuild after pulling changes
that touch this Dockerfile (e.g. new tools added for the terminal):

```bash
docker build -t hdl-webide-iverilog:latest backend/docker
```

The image name must match `DOCKER_IMAGE` in `backend/.env`.
