// TEST TARGET: Verilator diagnostics (squiggles appear ~800ms after an edit,
// or immediately on Ctrl+S). This file contains DELIBERATE bugs -- expect:
//   [WIDTH]  4-bit narrow_src assigned to 8-bit wide_dst
//   [LATCH]  lat infers a latch (no else branch in combinational block)
// Do NOT include this file in a Run -- it exists only to trigger lint.
module lint_bugs(
    input  [3:0] narrow_src,
    input        en,
    input  [7:0] d,
    output [7:0] wide_dst,
    output reg [7:0] lat
);

assign wide_dst = narrow_src;     // WIDTH: 4-bit -> 8-bit

always @* begin                   // LATCH: no else -> lat holds state
    if (en)
        lat = d;
end

endmodule
