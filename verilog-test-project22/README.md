# Verilog language-intelligence test project

Open this folder in the IDE (Explorer -> Open Folder icon -> select
`verilog-test-project`) with the Docker backend running
(`run-all.bat`, mode 1). Each file states its purpose in a header comment.

NOTE: the folder is named `messy/` (not `test/`) on purpose -- svlangserver's
indexer excludes `**/test/**` by default.

## 1. Navigation & hover (svlangserver) -- use rtl/top.v

| Action | Where | Expected |
|---|---|---|
| Go to Definition (F12 / right-click) | the word `alu` on the `alu u_alu(` line | jumps to `rtl/alu.v` |
| Go to Definition | the word `regfile` on the `regfile ... u_rf(` line | jumps to `rtl/regfile.sv` |
| Go to Definition | `alu_out` inside the port connections | jumps to its `wire` declaration above |
| Hover | `alu` / `regfile` instance lines | popup with the module's signature |
| Ctrl+Space | type `al` on a blank line, trigger completion | suggests `alu` (plus keywords) |
| Ctrl+Shift+O | anywhere in top.v | outline listing module/signals/instances |

Known limitation (not a bug): **Go to References and Rename always return
nothing** -- svlangserver does not implement those two LSP features.

## 2. Diagnostics (Verilator) -- use rtl/lint_bugs.v

Open the file, make any small edit (e.g. add a space) or press Ctrl+S.
Within ~1s expect two squiggles, hover them for messages:

- `[WIDTH]` on the `assign wide_dst = narrow_src;` line (4-bit -> 8-bit)
- `[LATCH]` on the `always @*` block (missing else branch)

Fix one (e.g. add `else lat = 8'h0;`) and the squiggle should clear on the
next lint pass.

## 3. Formatting (Verible) -- use messy/unformatted.sv

The file is deliberately mangled. Format it via the REST API (save first):

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/v1/format `
  -ContentType "application/json" `
  -Body '{"workspace":"local-project","filename":"messy/unformatted.sv"}'
```

Expect normalized indentation/spacing in the `formatted` field.

## 4. Symbols & hierarchy (Surelog indexer)

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/v1/reindex `
  -ContentType "application/json" -Body '{"projectId":"local-project"}'
Invoke-RestMethod "http://localhost:8000/api/v1/symbols?projectId=local-project"
Invoke-RestMethod "http://localhost:8000/api/v1/hierarchy?projectId=local-project"
```

Expect: modules `alu`, `regfile`, `top`, `lint_bugs`, `unformatted`, `top_tb`;
`regfile` carries parameters DEPTH/WIDTH; hierarchy shows
`top_tb -> dut(top) -> u_alu(alu), u_rf(regfile)`.

## 5. Run + waveform -- use tb/top_tb.v

Press **Run** (Testbench: Auto). Expect in the Output panel:

```
ALU add result = 8
top_tb finished
```

and a waveform (`wave.vcd`) in the Waveform panel with clk/a/b/op/result.

## 6. Terminal

Open the integrated terminal; at the `root@webide:/workspace$` prompt:

```sh
ls              # shows the project files
iverilog -g2012 -o sim.out rtl/alu.v rtl/regfile.sv rtl/top.v tb/top_tb.v
vvp sim.out     # same two $display lines as the Run button
```

## Troubleshooting

- No squiggles/hover at all: check the browser DevTools Network tab for an
  open WebSocket to `/ws/lsp/local-project`, and `docker logs vetfab-backend`
  for `svlangserver started`.
- Stale behavior after backend changes: `docker restart vetfab-backend`,
  then reload the browser tab (svlangserver processes are per-project and
  survive page reloads).
