# HDL WebIDE Backend + Verilog/SystemVerilog language-intelligence image.
#
# Distinct from `docker/Dockerfile` (the ephemeral per-run/per-terminal user
# code sandbox) -- this is the image the FastAPI service itself runs in.
# svlangserver, Verilator, Verible, and Surelog are native Linux tools with
# no first-class Windows build, so on a Windows dev host this image (or WSL)
# is required for anything under app/lsp, app/diagnostics, app/formatter, or
# app/indexer to actually work; the pure-filesystem endpoints (workspace
# CRUD) run fine under plain `uvicorn` on any OS.
#
# Build once, rebuild after changing this file or requirements.txt:
#   docker build -t hdl-webide-backend:latest backend
FROM python:3.12-slim-bookworm AS base

# -- OS packages ---------------------------------------------------------
# verilator: Debian bookworm's packaged release (matches docker/Dockerfile).
# nodejs prerequisites (curl/gnupg) + build toolchain for Surelog (built
# from source below -- Surelog isn't packaged for Debian and its CMake build
# needs a JDK to generate its ANTLR4 grammar).
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        verilator \
        git \
        make \
        cmake \
        ninja-build \
        build-essential \
        default-jre-headless \
        uuid-dev \
        zlib1g-dev \
        tclsh \
        python3 \
        python3-dev \
        curl \
        ca-certificates \
        gnupg \
    && rm -rf /var/lib/apt/lists/*

# Node.js (LTS, via NodeSource) -- required to run svlangserver, which is an
# npm package (https://github.com/imc-trading/svlangserver).
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# svlangserver: published on npm as @imc-trading/svlangserver (the bare
# name "svlangserver" does not exist on the registry). The package's bin
# entry is still named `svlangserver`, so SVLANGSERVER_CMD stays unchanged.
# Installed globally so it's on PATH for LspProcessManager
# (see app/lsp/process.py) to spawn per-project, one process each.
RUN npm install -g @imc-trading/svlangserver

# Verible (verible-verilog-format -- the only Verible tool this service
# uses, per app/formatter/verible.py): not packaged for Debian, pull the
# same pinned static release build used by docker/Dockerfile.
RUN VERIBLE_VERSION="v0.0-4080-ga0a8d8eb" \
    && curl -fsSL -o /tmp/verible.tar.gz \
        "https://github.com/chipsalliance/verible/releases/download/${VERIBLE_VERSION}/verible-${VERIBLE_VERSION}-linux-static-x86_64.tar.gz" \
    && tar -xzf /tmp/verible.tar.gz -C /tmp \
    && mv "/tmp/verible-${VERIBLE_VERSION}/bin/"* /usr/local/bin/ \
    && rm -rf /tmp/verible*

# Surelog: no prebuilt Debian package, so build from source, checking out
# the most recent tag (i.e. the latest stable release, not a dev branch) at
# build time. This step is slow (Surelog pulls its own third-party deps via
# CMake FetchContent) -- if it fails, check chipsalliance/Surelog's current
# BUILDING.md for any new build-dependency requirements.
# orderedmultidict: required by UHDM's code generator (checked in
# third_party/UHDM/CMakeLists.txt) -- build-time only.
RUN pip install --no-cache-dir orderedmultidict
RUN git clone --depth 1 https://github.com/chipsalliance/Surelog.git /tmp/surelog-src \
    && cd /tmp/surelog-src \
    && LATEST_TAG=$(git ls-remote --tags --refs origin | awk -F/ '{print $3}' | sort -V | tail -n1) \
    && git fetch --depth 1 origin "tag" "${LATEST_TAG}" \
    && git checkout "${LATEST_TAG}" \
    && git submodule update --init --recursive --depth 1 \
    && make release PREFIX=/usr/local -j"$(nproc)" \
    && make install PREFIX=/usr/local \
    && rm -rf /tmp/surelog-src

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Real, per-project on-disk workspaces (see app/workspace/manager.py) --
# override LSP_WORKSPACE_ROOT to mount this as a volume for persistence
# across container restarts.
ENV LSP_WORKSPACE_ROOT=/data/workspaces
RUN mkdir -p /data/workspaces

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
