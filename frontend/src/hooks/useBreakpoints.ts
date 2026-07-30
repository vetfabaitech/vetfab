"use client";

import { useEffect, useRef } from "react";
import type { Monaco } from "@monaco-editor/react";
import type { editor as MonacoEditorNS } from "monaco-editor";
import { editorManager } from "@/services/editor/EditorManager";
import { useBreakpointStore, breakpointsForFile } from "@/store/breakpointStore";

/** Wires Monaco gutter clicks to breakpoint toggling and keeps glyph-margin
 * dot decorations in sync with `breakpointStore` for whichever file is
 * active -- mounted once from `MultiFileEditor`, after its own tab-switch
 * effect (so the model swap has already happened by the time this reapplies
 * decorations for the new tab; effects in one component run in declaration
 * order). There was no precedent for gutter click handling anywhere in this
 * codebase before this hook (confirmed) -- only `EditorManager.flashLine`'s
 * unrelated transient line-highlight decoration existed. */
export function useBreakpoints(monaco: Monaco | null, editorReady: boolean, activeTabId: string | null): void {
  const decorationsRef = useRef<MonacoEditorNS.IEditorDecorationsCollection | null>(null);

  // Monaco's onMouseDown listener is attached once per editor instance and
  // must never itself go stale as tabs switch -- read the active file via a
  // ref rather than depending on `activeTabId` (which would mean tearing
  // down and re-attaching the listener on every tab switch).
  const activeTabIdRef = useRef(activeTabId);
  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  useEffect(() => {
    if (!monaco || !editorReady) return;
    const editor = editorManager.getEditorInstance();
    if (!editor) return;
    const sub = editor.onMouseDown((e) => {
      if (e.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) return;
      const fileId = activeTabIdRef.current;
      const line = e.target.position?.lineNumber;
      if (!fileId || !line) return;
      useBreakpointStore.getState().toggle(fileId, line);
    });
    return () => sub.dispose();
  }, [monaco, editorReady]);

  useEffect(() => {
    if (!monaco || !editorReady || !activeTabId) {
      decorationsRef.current?.clear();
      return;
    }
    const editor = editorManager.getEditorInstance();
    if (!editor) return;

    const applyDecorations = () => {
      const breakpoints = breakpointsForFile(useBreakpointStore.getState().breakpoints, activeTabId);
      const decorations: MonacoEditorNS.IModelDeltaDecoration[] = breakpoints.map((bp) => ({
        range: new monaco.Range(bp.line, 1, bp.line, 1),
        options: {
          glyphMarginClassName: bp.enabled ? "breakpoint-glyph" : "breakpoint-glyph breakpoint-glyph-disabled",
          glyphMarginHoverMessage: { value: bp.enabled ? "Breakpoint" : "Breakpoint (disabled)" },
        },
      }));
      if (decorationsRef.current) decorationsRef.current.set(decorations);
      else decorationsRef.current = editor.createDecorationsCollection(decorations);
    };

    applyDecorations();
    const unsubscribe = useBreakpointStore.subscribe(applyDecorations);
    return () => unsubscribe();
  }, [monaco, editorReady, activeTabId]);
}
