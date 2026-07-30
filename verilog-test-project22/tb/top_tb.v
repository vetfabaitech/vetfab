// TEST TARGET: the Run pipeline + waveform viewer.
// Select "Testbench: Auto" (or pick this file) and press Run:
//   - Output panel: "ALU add result = 8" then "top_tb finished"
//   - Waveform panel: wave.vcd with clk/a/b/op/result visible
`timescale 1ns/1ps

module top_tb;

reg        clk = 0;
reg        we  = 0;
reg  [7:0] a, b;
reg  [1:0] op;
wire [7:0] result;

top dut(
    .clk(clk),
    .we(we),
    .a(a),
    .b(b),
    .op(op),
    .result(result)
);

always #5 clk <= ~clk;

initial begin
    $dumpfile("wave.vcd");
    $dumpvars(0, top_tb);

    a = 8'd5; b = 8'd3; op = 2'b00; we = 1;
    #10;
    $display("ALU add result = %0d", dut.alu_out);
    $display("regfile read   = %0d", result);

    op = 2'b01; #10;
    op = 2'b10; #10;
    op = 2'b11; #10;

    $display("top_tb finished");
    $finish;
end

endmodule
