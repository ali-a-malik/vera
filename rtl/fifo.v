// Synchronous FIFO, circular buffer.
// Writes ignored when full; reads ignored when empty.
// Simultaneous read+write (when neither full nor empty) leaves count unchanged.
module fifo #(parameter WIDTH = 8, parameter DEPTH = 8) (
  input  wire                   clk,
  input  wire                   rst,      // synchronous reset, active high
  input  wire                   wr_en,
  input  wire                   rd_en,
  input  wire [WIDTH-1:0]       din,
  output reg  [WIDTH-1:0]       dout,
  output wire                   full,
  output wire                   empty,
  output reg  [$clog2(DEPTH):0] count
);

  localparam PTR_W = $clog2(DEPTH);

  reg [WIDTH-1:0] mem [0:DEPTH-1];
  reg [PTR_W-1:0] wr_ptr;
  reg [PTR_W-1:0] rd_ptr;

  assign full  = (count == DEPTH);
  assign empty = (count == 0);

  wire do_write = wr_en && !full;
  wire do_read  = rd_en && !empty;

  always @(posedge clk) begin
    if (rst) begin
      wr_ptr <= 0;
      rd_ptr <= 0;
      count  <= 0;
      dout   <= 0;
    end else begin
      if (do_write) begin
        mem[wr_ptr] <= din;
        wr_ptr <= (wr_ptr == DEPTH-1) ? 0 : wr_ptr + 1;
      end
      if (do_read) begin
        dout <= mem[rd_ptr];
        rd_ptr <= (rd_ptr == DEPTH-1) ? 0 : rd_ptr + 1;
      end
      case ({do_write, do_read})
        2'b10: count <= count + 1;
        2'b01: count <= count - 1;
        default: count <= count;
      endcase
    end
  end

endmodule
