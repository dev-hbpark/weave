import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { cn } from "../cn.js";
import { type ThemeName, useTheme } from "../use-theme.js";

const THEMES: ReadonlyArray<{ name: ThemeName; label: string; hint: string }> = [
  { name: "aurora", label: "Aurora", hint: "premium glass + gradient" },
  { name: "mono", label: "Mono", hint: "Linear-grade sharp" },
  { name: "vivid", label: "Vivid", hint: "max playful" },
];

export function ThemeSwitcher({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <ToggleGroup.Root
      type="single"
      value={theme}
      onValueChange={(v) => {
        if (v === "aurora" || v === "mono" || v === "vivid") setTheme(v);
      }}
      aria-label="theme"
      className={cn(
        "inline-flex items-center rounded-[var(--radius-pill)]",
        "bg-[color:var(--surface-1)] backdrop-blur-[var(--surface-blur)]",
        "border border-[color:var(--surface-1-border)]",
        "p-1 gap-1",
        className,
      )}
    >
      {THEMES.map((t) => (
        <ToggleGroup.Item
          key={t.name}
          value={t.name}
          data-tip={t.hint}
          className={cn(
            "rounded-[var(--radius-pill)] h-8 px-3.5 text-[13px] font-medium",
            "text-[color:var(--text-soft)]",
            "transition-[color,background] duration-[var(--motion-normal)] ease-[var(--motion-spring-soft)]",
            "hover:text-[color:var(--text-strong)]",
            "data-[state=on]:text-[color:var(--text-on-accent)]",
            "data-[state=on]:bg-[image:var(--accent-gradient)]",
            "data-[state=on]:shadow-[var(--shadow-glow)]",
            "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
          )}
        >
          {t.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
