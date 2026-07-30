"use client";

import { useRef } from "react";
import { useExplorerStore } from "@/store/explorerStore";
import { IconNewFile, IconNewFolder, IconUpload, IconWorkspace } from "@/components/Explorer/icons";

const QUICK_FILES: { label: string; name: string; content: string }[] = [
  { label: "New Verilog File", name: "design.v", content: "module design(\n\n);\n\nendmodule\n" },
  { label: "New SystemVerilog File", name: "design.sv", content: "module design(\n\n);\n\nendmodule\n" },
  { label: "New VHDL File", name: "design.vhd", content: "entity design is\nend entity design;\n\narchitecture rtl of design is\nbegin\nend architecture rtl;\n" },
];

/** Shown in place of the plain "No file open" empty state specifically when
 * the workspace has zero files anywhere (see MultiFileEditor's
 * `isWorkspaceEmpty` check) -- a genuinely blank "New Workspace > Empty
 * Workspace" or a freshly-scaffolded project with everything deleted.
 * Disappears the moment any file exists, same as the plain empty state it
 * replaces (both are driven by the same `showEmptyState` condition). */
export default function WelcomeScreen() {
  const rootId = useExplorerStore((s) => s.rootId);
  const createAndOpenFile = useExplorerStore((s) => s.createAndOpenFile);
  const createFolder = useExplorerStore((s) => s.createFolder);
  const uploadFiles = useExplorerStore((s) => s.uploadFiles);

  const uploadInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-editor-bg px-6 text-center">
      <IconWorkspace className="h-10 w-10 text-accent" />
      <div>
        <p className="text-sm font-semibold text-text-primary">Welcome to HDL WebIDE</p>
        <p className="mt-1 text-xs text-text-muted">Start coding instantly.</p>
      </div>

      <div className="flex flex-col gap-2">
        {QUICK_FILES.map((qf) => (
          <button
            key={qf.name}
            type="button"
            onClick={() => createAndOpenFile(rootId, qf.name, qf.content)}
            className="flex w-64 items-center gap-2.5 rounded-md border border-panel-border bg-surface-1 px-3 py-2 text-left text-xs font-medium text-text-primary transition-colors duration-200 hover:border-accent/50 hover:bg-surface-hover"
          >
            <IconNewFile className="h-4 w-4 shrink-0 text-text-muted" />
            {qf.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => createFolder(rootId)}
          className="flex w-64 items-center gap-2.5 rounded-md border border-panel-border bg-surface-1 px-3 py-2 text-left text-xs font-medium text-text-primary transition-colors duration-200 hover:border-accent/50 hover:bg-surface-hover"
        >
          <IconNewFolder className="h-4 w-4 shrink-0 text-text-muted" />
          New Folder
        </button>
        <button
          type="button"
          onClick={() => uploadInputRef.current?.click()}
          className="flex w-64 items-center gap-2.5 rounded-md border border-panel-border bg-surface-1 px-3 py-2 text-left text-xs font-medium text-text-primary transition-colors duration-200 hover:border-accent/50 hover:bg-surface-hover"
        >
          <IconUpload className="h-4 w-4 shrink-0 text-text-muted" />
          Upload Files
        </button>
      </div>

      <input
        ref={uploadInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) void uploadFiles(e.target.files, rootId);
          e.target.value = "";
        }}
      />
    </div>
  );
}
