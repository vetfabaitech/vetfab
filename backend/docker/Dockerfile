FROM debian:bookworm-slim

# verilator/iverilog: compile+simulate -- both are real run-pipeline engines
# now (see app/services/simulators/), selected per-job via
# ProjectExecutionPayload.execution.simulator; Verilator is the default.
# build-essential: Verilator's `--binary` compile step verilates the design
#   to C++ and then invokes `make`/g++ to link a native executable -- unlike
#   iverilog (a self-contained bytecode compiler), Verilator needs a real
#   C++ toolchain in the image to produce a runnable binary at all.
# Everything else here is exposed via the integrated terminal only:
#   yosys/ghdl             - synthesis, VHDL
#   git/make/cmake          - build tooling
#   python3/python3-pip     - scripting
#   less/tree/hostname/diffutils - common Linux utilities not in the -slim base
#   curl/ca-certificates    - needed only to fetch verible below (not runtime tools)
# gtkwave is intentionally NOT installed: it's a GUI app requiring an X11
# display, which this headless container doesn't have, so it couldn't render
# anything if invoked -- waveform viewing is handled by Surfer in the browser.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        verilator \
        iverilog \
        build-essential \
        yosys \
        ghdl \
        git \
        make \
        cmake \
        python3 \
        python3-pip \
        less \
        tree \
        hostname \
        diffutils \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Verible (verible-verilog-format, verible-verilog-lint): not packaged for
# Debian, so pull the pinned static release build directly from GitHub.
RUN VERIBLE_VERSION="v0.0-4080-ga0a8d8eb" \
    && curl -fsSL -o /tmp/verible.tar.gz \
        "https://github.com/chipsalliance/verible/releases/download/${VERIBLE_VERSION}/verible-${VERIBLE_VERSION}-linux-static-x86_64.tar.gz" \
    && tar -xzf /tmp/verible.tar.gz -C /tmp \
    && mv "/tmp/verible-${VERIBLE_VERSION}/bin/"* /usr/local/bin/ \
    && rm -rf /tmp/verible*

WORKDIR /workspace

CMD ["sleep", "infinity"]
