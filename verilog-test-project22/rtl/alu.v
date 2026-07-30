// TEST TARGET: Go to Definition / Hover / Completion.
// From top.v, F12 on "alu" should jump HERE. Hovering "alu" in top.v
// should show this module's signature.
module alu(
    input  [7:0] a,
    input  [7:0] b,
    input  [1:0] op,
    output reg [7:0] y
);

always @* begin
    case (op)
        2'b00: y = a + b;
        2'b01: y = a - b;
        2'b10: y = a & b;
        default: y = a | b;
    endcase
end

endmodule
