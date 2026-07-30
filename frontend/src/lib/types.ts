export type HdlLanguage = "verilog" | "vhdl";

export type LogLevel = "info" | "success" | "error" | "warning";

export interface LogEntry {
  id: string;
  text: string;
  level: LogLevel;
  /** `Date.now()` at creation -- populated by every `makeLog()` call site;
   * optional only so older in-memory entries from before this field existed
   * don't need a migration. Powers the Simulation Log panel's timestamp
   * column. */
  timestamp?: number;
}

export const DEFAULT_VERILOG_CODE = `module hello;
initial begin
    $display("Hello World");
end
endmodule
`;

export const DEFAULT_TESTBENCH_CODE = `module tb;
initial begin
    $dumpfile("wave.vcd");
    $dumpvars(0, tb);
    #10 $finish;
end
endmodule
`;
