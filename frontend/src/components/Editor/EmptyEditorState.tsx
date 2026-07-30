import { IconFilesActivity } from "@/components/Explorer/icons";

export default function EmptyEditorState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-editor-bg px-6 text-center">
      <IconFilesActivity className="h-10 w-10 text-border-subtle" />
      <p className="text-sm text-text-muted">No file open</p>
      <p className="text-xs text-text-muted">Select a file from the Explorer to begin editing</p>
    </div>
  );
}
