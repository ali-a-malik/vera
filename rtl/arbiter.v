// 2-requester round-robin arbiter. Registered grants, one-hot or none.
// Solo requester is granted next cycle. Under contention the grant
// alternates: whoever won last loses the next contested cycle.
module arbiter (
  input  wire clk,
  input  wire rst,    // synchronous reset, active high
  input  wire req0,
  input  wire req1,
  output reg  gnt0,
  output reg  gnt1
);

  reg last;  // who won the last contested cycle (0 or 1)

  always @(posedge clk) begin
    if (rst) begin
      gnt0 <= 0;
      gnt1 <= 0;
      last <= 1;   // first contested grant goes to req0
    end else begin
      gnt0 <= 0;
      gnt1 <= 0;
      case ({req0, req1})
        2'b10: gnt0 <= 1;
        2'b01: gnt1 <= 1;
        2'b11: begin
          if (last) begin gnt0 <= 1; last <= 0; end
          else      begin gnt1 <= 1; last <= 1; end
        end
        default: ;
      endcase
    end
  end

endmodule
