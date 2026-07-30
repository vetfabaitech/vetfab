// TEST TARGET: Verible formatting (POST /api/v1/format).
// This file is deliberately mangled -- after formatting, indentation and
// spacing should normalize while behavior stays identical.
module   unformatted    (input logic clk,input logic rst,
      input  logic[7:0]   din   ,output logic [7:0]dout);
  logic [7:0]stage1;logic[7:0] stage2;
always_ff@(posedge clk or posedge rst)begin
if(rst)begin stage1<=8'h0;stage2<=8'h0;dout<=8'h0;end
      else    begin
   stage1<=din;stage2<=stage1;
            dout<=stage2;end
end
endmodule
