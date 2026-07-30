import { ScaffoldFile } from "@/services/workspace/scaffold";

export type ProjectLanguage = "verilog" | "systemverilog" | "vhdl";

export const PROJECT_LANGUAGE_LABEL: Record<ProjectLanguage, string> = {
  verilog: "Verilog Project",
  systemverilog: "SystemVerilog Project",
  vhdl: "VHDL Project",
};

function buildReadme(projectName: string, kind: ProjectLanguage): string {
  const label = PROJECT_LANGUAGE_LABEL[kind];
  return `# ${projectName}

${label} scaffold.

## Layout

- \`src/\` -- design sources
- \`tb/\` -- testbenches
- \`constraints/\` -- timing/pin constraints
- \`docs/\` -- notes

Run \`top_tb\` to simulate.
`;
}

function verilogFiles(projectName: string): ScaffoldFile[] {
  const src = `module top(
    input  wire clk,
    input  wire rst_n,
    output reg  led
);
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) led <= 1'b0;
        else        led <= ~led;
    end
endmodule
`;
  const tb = `\`timescale 1ns/1ps
module top_tb;
    reg clk = 0;
    reg rst_n = 0;
    wire led;

    top dut (
        .clk(clk),
        .rst_n(rst_n),
        .led(led)
    );

    always #5 clk = ~clk;

    initial begin
        $dumpfile("top_tb.vcd");
        $dumpvars(0, top_tb);
        rst_n = 0;
        #12 rst_n = 1;
        #100 $finish;
    end
endmodule
`;
  return [
    { folder: "src", name: "top.v", content: src },
    { folder: "tb", name: "top_tb.v", content: tb },
    { folder: "", name: "README.md", content: buildReadme(projectName, "verilog") },
  ];
}

function systemVerilogFiles(projectName: string): ScaffoldFile[] {
  const src = `module top(
    input  logic clk,
    input  logic rst_n,
    output logic led
);
    always_ff @(posedge clk or negedge rst_n) begin
        if (!rst_n) led <= 1'b0;
        else        led <= ~led;
    end
endmodule
`;
  const tb = `\`timescale 1ns/1ps
module top_tb;
    logic clk = 0;
    logic rst_n = 0;
    logic led;

    top dut (
        .clk(clk),
        .rst_n(rst_n),
        .led(led)
    );

    always #5 clk = ~clk;

    initial begin
        $dumpfile("top_tb.vcd");
        $dumpvars(0, top_tb);
        rst_n = 0;
        #12 rst_n = 1;
        #100 $finish;
    end
endmodule
`;
  return [
    { folder: "src", name: "top.sv", content: src },
    { folder: "tb", name: "top_tb.sv", content: tb },
    { folder: "", name: "README.md", content: buildReadme(projectName, "systemverilog") },
  ];
}

function vhdlFiles(projectName: string): ScaffoldFile[] {
  const src = `library ieee;
use ieee.std_logic_1164.all;

entity top is
    port (
        clk   : in  std_logic;
        rst_n : in  std_logic;
        led   : out std_logic
    );
end entity top;

architecture rtl of top is
begin
    process(clk, rst_n)
    begin
        if rst_n = '0' then
            led <= '0';
        elsif rising_edge(clk) then
            led <= not led;
        end if;
    end process;
end architecture rtl;
`;
  const tb = `library ieee;
use ieee.std_logic_1164.all;

entity top_tb is
end entity top_tb;

architecture sim of top_tb is
    signal clk   : std_logic := '0';
    signal rst_n : std_logic := '0';
    signal led   : std_logic;
begin
    dut: entity work.top
        port map (
            clk   => clk,
            rst_n => rst_n,
            led   => led
        );

    clk <= not clk after 5 ns;

    stimulus: process
    begin
        rst_n <= '0';
        wait for 12 ns;
        rst_n <= '1';
        wait for 100 ns;
        assert false report "simulation finished" severity failure;
    end process;
end architecture sim;
`;
  return [
    { folder: "src", name: "top.vhd", content: src },
    { folder: "tb", name: "top_tb.vhd", content: tb },
    { folder: "", name: "README.md", content: buildReadme(projectName, "vhdl") },
  ];
}

/** Starter `src/tb/README` content for a new language project -- folder
 * structure itself is built by `buildProjectScaffold` (scaffold.ts), this
 * only supplies what goes inside it. */
export function buildLanguageProjectFiles(kind: ProjectLanguage, projectName: string): ScaffoldFile[] {
  switch (kind) {
    case "verilog":
      return verilogFiles(projectName);
    case "systemverilog":
      return systemVerilogFiles(projectName);
    case "vhdl":
      return vhdlFiles(projectName);
  }
}
