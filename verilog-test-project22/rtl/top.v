// TEST TARGET: cross-file navigation hub.
//  - F12 (Go to Definition) on "alu" (line with u_alu)     -> rtl/alu.v
//  - F12 on "regfile" (line with u_rf)                     -> rtl/regfile.sv
//  - F12 on "alu_out" anywhere                             -> its wire declaration below
//  - Hover "alu" / "regfile"                               -> module signature popup
//  - Ctrl+Space after typing "al"                          -> completion suggests alu
//  - Ctrl+Shift+O                                          -> outline: top, signals, instances
module top(
    input        clk,
    input        we,
    input  [7:0] a,
    input  [7:0] b,
    input  [1:0] op,
    output [7:0] result
);

wire [7:0] alu_out;

alu u_alu(
    .a(a),
    .b(b),
    .op(op),
    .y(alu_out)
);

regfile #(.DEPTH(4), .WIDTH(8)) u_rf(
    .clk(clk),
    .we(we),
    .waddr(2'b00),
    .raddr(2'b00),
    .wdata(alu_out),
    .rdata(result)
);

endmodule
