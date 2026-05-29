// Aku slash-command menu (WI-053) — feature-local (these are Aku composer
// actions, not host commands). Presentational: the composer owns open/query/
// active state and filtering; this renders the floating list above the input
// with arrow-navigable options. No emoji — label + hint text only.

export interface SlashCommandItem {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
}

export function SlashCommandMenu({
  items,
  activeIndex,
  onSelect,
  onHover,
}: {
  readonly items: ReadonlyArray<SlashCommandItem>;
  readonly activeIndex: number;
  readonly onSelect: (index: number) => void;
  readonly onHover: (index: number) => void;
}): JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <div
      role="listbox"
      aria-label="아쿠 명령"
      data-aku-slash-menu
      className="absolute bottom-full left-0 mb-1.5 w-full max-w-[320px] max-h-56 overflow-y-auto rounded-[var(--radius-md)] bg-[color:var(--surface-overlay)] border border-[color:var(--surface-overlay-border)] shadow-[var(--shadow-overlay)] p-1 z-10"
    >
      {items.map((it, i) => (
        <button
          key={it.id}
          type="button"
          role="option"
          aria-selected={i === activeIndex}
          data-aku-slash-option={it.id}
          // Use pointerdown so selection fires before the textarea blurs.
          onPointerDown={(e) => {
            e.preventDefault();
            onSelect(i);
          }}
          onMouseEnter={() => onHover(i)}
          className={`w-full flex items-baseline gap-2 text-left rounded-[var(--radius-sm)] px-2.5 py-1.5 ${
            i === activeIndex
              ? "bg-[color:var(--surface-2)] text-[color:var(--text-strong)]"
              : "text-[color:var(--text-default)]"
          }`}
        >
          <span className="text-[13px] font-medium">{it.label}</span>
          <span className="text-[11px] text-[color:var(--text-soft)] truncate">{it.hint}</span>
        </button>
      ))}
    </div>
  );
}
