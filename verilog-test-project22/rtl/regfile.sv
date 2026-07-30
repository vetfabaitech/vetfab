// TEST TARGET: SystemVerilog indexing + parameters in symbols.
// GET /api/v1/symbols should list this module with parameters DEPTH/WIDTH.
// F12 on "regfile" in top.v should jump here (cross-extension: .v -> .sv).
module regfile #(
    parameter int DEPTH = 4,
    parameter int WIDTH = 8
) (
    input  logic             clk,
    input  logic             we,
    input  logic [1:0]       waddr,
    input  logic [1:0]       raddr,
    input  logic [WIDTH-1:0] wdata,
    output logic [WIDTH-1:0] rdata
);

logic [WIDTH-1:0] mem [DEPTH];

always_ff @(posedge clk) begin
    if (we) mem[waddr] <= wdata;
end

assign rdata = mem[raddr];

endmodule
