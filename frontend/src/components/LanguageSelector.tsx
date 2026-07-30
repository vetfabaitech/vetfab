"use client";

import { HdlLanguage } from "@/lib/types";
import { IconChevronDown } from "./icons";

interface LanguageSelectorProps {
  value: HdlLanguage;
  onChange: (language: HdlLanguage) => void;
}

const LANGUAGE_OPTIONS: { value: HdlLanguage; label: string }[] = [
  { value: "verilog", label: "Verilog" },
  { value: "vhdl", label: "VHDL" },
];

export default function LanguageSelector({ value, onChange }: LanguageSelectorProps) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as HdlLanguage)}
        aria-label="Select HDL language"
        className="appearance-none rounded-lg border border-transparent bg-transparent py-1.5 pl-3 pr-8 text-sm font-medium text-text-primary outline-none transition-colors duration-200 hover:bg-surface-hover focus:border-accent"
      >
        {LANGUAGE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <IconChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
    </div>
  );
}
