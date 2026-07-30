"use client";

import { useState } from "react";
import { ProjectLanguage, PROJECT_LANGUAGE_LABEL } from "@/services/workspace/languageTemplates";

interface NewProjectDialogProps {
  kind: ProjectLanguage;
  onCancel: () => void;
  onCreate: (projectName: string) => void;
}

/** Prompts for a project name before scaffolding a Verilog/SystemVerilog/
 * VHDL project (src/tb/constraints/docs + README, see
 * services/workspace/scaffold.ts) -- same modal chrome as
 * CloseTabConfirmDialog/ImportRejectedDialog. */
export default function NewProjectDialog({ kind, onCancel, onCreate }: NewProjectDialogProps) {
  const [name, setName] = useState("my_project");

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed);
  };

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50" onClick={onCancel} role="presentation">
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`New ${PROJECT_LANGUAGE_LABEL[kind]}`}
        className="w-80 overflow-hidden rounded-lg border border-panel-border bg-surface-1 shadow-elevated"
      >
        <div className="border-b border-panel-border px-4 py-2.5">
          <h2 className="text-sm font-semibold text-text-primary">New {PROJECT_LANGUAGE_LABEL[kind]}</h2>
        </div>
        <div className="px-4 py-4">
          <label className="text-xs font-medium text-text-secondary" htmlFor="new-project-name">
            Project name
          </label>
          <input
            id="new-project-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") onCancel();
            }}
            className="mt-1.5 w-full rounded-md border border-panel-border bg-editor-bg px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
          />
          <p className="mt-2 text-[11px] text-text-muted">Creates src/, tb/, constraints/, docs/ and a README.</p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-panel-border px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors duration-200 hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!name.trim()}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors duration-200 hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
