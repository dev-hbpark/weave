// DR-design-027 — Theme picker (replaces the inline ThemeSwitcher pill row).
//
// 10 themes no longer fit a flat ToggleGroup. This is a compact trigger
// (active-theme swatch + label + chevron) opening a Popover with a Dark /
// Light grouped grid of live preview swatches. Each preview tile is scoped
// with its own `data-theme` so it renders that theme's real tokens
// (--bg-page / --accent-gradient / --accent) without switching the document.
//
// Registry SSOT: ../themes.ts. a11y: the grid is a Radix single ToggleGroup,
// so options expose role="radio" (roving arrow-key focus); each item's
// `aria-label` is the theme label, keeping `getByRole("radio", {name})` stable.

import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { useState } from "react";
import { cn } from "../cn.js";
import { isThemeName, THEME_TONES, THEMES } from "../themes.js";
import { useTheme } from "../use-theme.js";
import { IconCheck, IconChevronDown } from "./Icon.js";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover.js";

const TONE_LABEL: Record<(typeof THEME_TONES)[number], string> = {
  dark: "다크",
  light: "라이트",
};

export function ThemePicker({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const active = THEMES.find((t) => t.name === theme) ?? THEMES[0];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="테마 선택"
          data-testid="theme-picker"
          data-tip="테마"
          data-tip-kbd={active.label}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-[var(--radius-pill)] pl-1.5 pr-2.5",
            "bg-[color:var(--surface-1)] backdrop-blur-[var(--surface-blur)]",
            "border border-[color:var(--surface-1-border)]",
            "text-[13px] font-medium text-[color:var(--text-soft)]",
            "transition-[color,background,border-color] duration-[var(--motion-normal)] ease-[var(--motion-spring-soft)]",
            "hover:text-[color:var(--text-strong)] hover:border-[color:var(--surface-2-border)]",
            "focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
            className,
          )}
        >
          <span
            aria-hidden
            className={cn(
              "h-6 w-6 rounded-[var(--radius-pill)] bg-[image:var(--accent-gradient)]",
              "border border-[color:var(--surface-2-border)] shadow-[var(--shadow-glow)]",
            )}
          />
          <span className="hidden sm:inline">{active.label}</span>
          <IconChevronDown size={14} />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[280px] px-3 py-3">
        <ToggleGroup.Root
          type="single"
          value={theme}
          onValueChange={(v) => {
            if (isThemeName(v)) {
              setTheme(v);
              setOpen(false);
            }
          }}
          aria-label="테마"
          className="flex flex-col gap-3"
        >
          {THEME_TONES.map((tone) => (
            <div key={tone} className="flex flex-col gap-1.5">
              <p className="px-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--text-overlay-muted)]">
                {TONE_LABEL[tone]}
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {THEMES.filter((t) => t.tone === tone).map((t) => (
                  <ToggleGroup.Item
                    key={t.name}
                    value={t.name}
                    aria-label={t.label}
                    data-testid={`theme-option-${t.name}`}
                    data-tip={t.hint}
                    className={cn(
                      "group relative flex items-center gap-2 rounded-[var(--radius-sm)] p-1.5",
                      "border border-[color:var(--surface-overlay-border)] bg-[color:var(--surface-overlay-2)]",
                      "transition-[border-color,background] duration-[var(--motion-fast)] ease-[var(--motion-spring-soft)]",
                      "hover:border-[color:var(--surface-overlay-border-strong)]",
                      "focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
                      "data-[state=on]:border-[color:var(--accent)]",
                    )}
                  >
                    {/* Live preview scoped to THIS theme via data-theme. */}
                    <span
                      data-theme={t.name}
                      aria-hidden
                      className={cn(
                        "relative h-8 w-10 shrink-0 overflow-hidden rounded-[var(--radius-xs)]",
                        "border border-[color:var(--border-default)] bg-[color:var(--bg-page)]",
                      )}
                    >
                      <span className="absolute inset-x-1 top-1 h-1.5 rounded-full bg-[image:var(--accent-gradient)]" />
                      <span className="absolute bottom-1 left-1 h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
                      <span className="absolute bottom-1 left-3.5 h-1.5 w-3 rounded-full bg-[color:var(--text-soft)]" />
                    </span>
                    <span className="text-[12px] font-medium text-[color:var(--text-overlay)]">
                      {t.label}
                    </span>
                    <span
                      aria-hidden
                      className="absolute right-1.5 top-1.5 text-[color:var(--accent)] opacity-0 transition-opacity group-data-[state=on]:opacity-100"
                    >
                      <IconCheck size={14} />
                    </span>
                  </ToggleGroup.Item>
                ))}
              </div>
            </div>
          ))}
        </ToggleGroup.Root>
      </PopoverContent>
    </Popover>
  );
}
