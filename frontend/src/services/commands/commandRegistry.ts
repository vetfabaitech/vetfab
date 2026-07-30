import type { LogLevel } from "@/lib/types";

export interface CommandResultLine {
  text: string;
  level: LogLevel;
}

/** Actions the Command Console can dispatch to -- deliberately the app's
 * existing Run/Stop/Save/Export handlers (threaded down from `page.tsx`/
 * `useSaveAllFiles`/`useExportProject`), not a second implementation of any
 * of them. Compile/Format aren't included: those are scoped to the active
 * editor tab inside `MultiFileEditor`'s Quick Action Toolbar already, and
 * threading them out to a sibling bottom-panel tab isn't worth the plumbing
 * for what's meant to stay a lightweight project/simulation-level console. */
export interface CommandContext {
  onRun: () => void;
  onStop: () => void;
  onSaveAll: () => void;
  onExport: () => Promise<void> | void;
}

export interface CommandDefinition {
  name: string;
  description: string;
  run: (args: string[], ctx: CommandContext) => Promise<CommandResultLine[]> | CommandResultLine[];
}

/** No backend Tcl/structured-command surface exists yet (see this module's
 * companion doc in `CommandConsole.tsx`) -- this is a client-side dispatcher
 * over the app's own actions, with a shape (`name`/`args`/`run`) that a
 * future real Tcl or simulator-command backend could slot behind without
 * changing the console UI at all. */
export const COMMANDS: CommandDefinition[] = [
  {
    name: "help",
    description: "List available commands",
    run: () => COMMANDS.map((c) => ({ level: "info" as const, text: `${c.name.padEnd(10)} ${c.description}` })),
  },
  {
    name: "run",
    description: "Run the active/default testbench",
    run: (_args, ctx) => {
      ctx.onRun();
      return [{ level: "info", text: "Run requested." }];
    },
  },
  {
    name: "stop",
    description: "Stop the running simulation",
    run: (_args, ctx) => {
      ctx.onStop();
      return [{ level: "info", text: "Stop requested." }];
    },
  },
  {
    name: "save",
    description: "Save all files",
    run: (_args, ctx) => {
      ctx.onSaveAll();
      return [{ level: "success", text: "Saved all files." }];
    },
  },
  {
    name: "export",
    description: "Export the project as a zip",
    run: async (_args, ctx) => {
      await ctx.onExport();
      return [{ level: "success", text: "Project exported." }];
    },
  },
];

export function findCommand(name: string): CommandDefinition | undefined {
  return COMMANDS.find((c) => c.name === name.toLowerCase());
}
