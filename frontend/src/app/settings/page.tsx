"use client";

import Link from "next/link";
import { useStoresHydrated } from "@/hooks/useStoresHydrated";
import { useSyncThemeClass } from "@/hooks/useSyncThemeClass";
import { useSettingsStore, type AppTheme, type CompilerId } from "@/store/settingsStore";
import { IconArrowLeft } from "@/components/icons";

const TAB_WIDTHS = [2, 4, 8];
const COMPILERS: { value: CompilerId; label: string }[] = [
  { value: "iverilog", label: "Icarus Verilog" },
  { value: "verilator", label: "Verilator" },
  { value: "vivado", label: "Xilinx Vivado" },
  { value: "modelsim", label: "ModelSim" },
];

/** Dedicated Settings page (GitHub-style: the header's combined account
 * menu links here instead of popping a modal) -- replaces the old
 * PreferencesDialog. Same `useSettingsStore` backing, same sections, just
 * laid out as a full page with its own back-to-IDE header. */
export default function SettingsPage() {
  const hydrated = useStoresHydrated();

  if (!hydrated) {
    return (
      <div className="flex h-screen items-center justify-center bg-app-bg">
        <p className="text-sm text-text-muted">Loading settings…</p>
      </div>
    );
  }

  return <SettingsPageContent />;
}

function SettingsPageContent() {
  useSyncThemeClass();
  const settings = useSettingsStore();

  return (
    <div className="min-h-screen bg-app-bg text-text-primary">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-panel-border bg-header-bg px-5">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm font-medium text-text-secondary transition-colors duration-200 hover:text-text-primary"
        >
          <IconArrowLeft className="h-4 w-4" />
          Back to IDE
        </Link>
        <span className="text-text-muted">/</span>
        <h1 className="text-sm font-semibold text-text-primary">Settings</h1>
      </header>

      <div className="mx-auto max-w-2xl px-6 py-8">
        <Section title="Appearance">
          <Row label="Theme">
            <SegmentedControl
              value={settings.appTheme}
              options={[
                { value: "dark", label: "Dark" },
                { value: "light", label: "Light" },
              ]}
              onChange={(v) => settings.update({ appTheme: v as AppTheme })}
            />
          </Row>
        </Section>

        <Section title="Editor">
          <Row label={`Font Size (${settings.fontSize}px)`}>
            <input
              type="range"
              min={10}
              max={24}
              step={1}
              value={settings.fontSize}
              onChange={(e) => settings.update({ fontSize: Number(e.target.value) })}
              className="w-40 accent-[var(--color-accent)]"
              aria-label="Editor font size"
            />
          </Row>
          <Row label="Tab Width">
            <SegmentedControl
              value={String(settings.tabWidth)}
              options={TAB_WIDTHS.map((w) => ({ value: String(w), label: String(w) }))}
              onChange={(v) => settings.update({ tabWidth: Number(v) })}
            />
          </Row>
          <ToggleRow label="Word Wrap" checked={settings.wordWrap} onChange={(v) => settings.update({ wordWrap: v })} />
          <ToggleRow label="Minimap" checked={settings.minimap} onChange={(v) => settings.update({ minimap: v })} />
          <ToggleRow
            label="Line Numbers"
            checked={settings.lineNumbers}
            onChange={(v) => settings.update({ lineNumbers: v })}
          />
        </Section>

        <Section title="Editor Behavior">
          <ToggleRow label="Auto Save" checked={settings.autoSave} onChange={(v) => settings.update({ autoSave: v })} />
          <ToggleRow
            label="Format on Save"
            checked={settings.formatOnSave}
            onChange={(v) => settings.update({ formatOnSave: v })}
          />
          <ToggleRow
            label="Smooth Scrolling"
            checked={settings.smoothScrolling}
            onChange={(v) => settings.update({ smoothScrolling: v })}
          />
        </Section>

        <Section title="Terminal">
          <Row label={`Font Size (${settings.terminalFontSize}px)`}>
            <input
              type="range"
              min={10}
              max={20}
              step={1}
              value={settings.terminalFontSize}
              onChange={(e) => settings.update({ terminalFontSize: Number(e.target.value) })}
              className="w-40 accent-[var(--color-accent)]"
              aria-label="Terminal font size"
            />
          </Row>
          <ToggleRow
            label="Cursor Blink"
            checked={settings.terminalCursorBlink}
            onChange={(v) => settings.update({ terminalCursorBlink: v })}
          />
        </Section>

        <Section title="Workspace" last>
          <Row label="Default Compiler">
            <select
              value={settings.defaultCompiler}
              onChange={(e) => settings.update({ defaultCompiler: e.target.value as CompilerId })}
              aria-label="Default compiler"
              className="rounded-md border border-panel-border bg-app-bg px-2 py-1 text-xs text-text-primary outline-none transition-colors duration-200 hover:border-text-muted focus:border-accent"
            >
              {COMPILERS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Default Sim Timeout">
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                max={600}
                value={settings.defaultSimTimeoutSec}
                onChange={(e) => settings.update({ defaultSimTimeoutSec: Math.max(1, Number(e.target.value) || 1) })}
                aria-label="Default simulation timeout in seconds"
                className="w-16 rounded-md border border-panel-border bg-app-bg px-2 py-1 text-xs text-text-primary outline-none transition-colors duration-200 hover:border-text-muted focus:border-accent"
              />
              <span className="text-xs text-text-muted">sec</span>
            </div>
          </Row>
          <p className="mt-1 text-[11px] leading-relaxed text-text-muted">
            Default Compiler now drives Run/Run All: Verilator and Icarus Verilog both execute for real, selected
            per run via this setting. Vivado/ModelSim aren&apos;t implemented yet — selecting one fails the run with
            a clear error instead of silently running something else. Default Sim Timeout is still not wired up;
            the backend uses a fixed per-step timeout (DOCKER_EXEC_TIMEOUT) regardless of this value.
          </p>
        </Section>

        <div className="flex justify-end border-t border-panel-border pt-4">
          <button
            type="button"
            onClick={() => settings.resetDefaults()}
            className="text-xs font-medium text-text-muted transition-colors duration-200 hover:text-text-primary"
          >
            Reset to Defaults
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children, last }: { title: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={`rounded-lg border border-panel-border bg-surface-1 p-4 ${last ? "" : "mb-4"}`}>
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-text-muted">{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-text-secondary">{label}</span>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Row label={label}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${checked ? "bg-accent" : "bg-surface-hover"}`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </Row>
  );
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-panel-border bg-app-bg p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded px-2.5 py-1 text-xs font-medium transition-colors duration-200 ${
            value === opt.value ? "bg-accent text-white" : "text-text-muted hover:text-text-primary"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
