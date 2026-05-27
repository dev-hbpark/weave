// WI-026 Phase 6 — Command palette.
//
// Dialog-based palette that lists every CommandMetadata in the registry,
// filters by fuzzy substring across label / description / hotkey, and
// dispatches the selected entry via the host's `dispatch`. The palette
// itself is variant-free — adding new commands requires zero changes to
// this file.

import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../cn.js";
import { type CommandMetaLike, useCommandHostOrNull } from "./Command.js";
import { Dialog, DialogContent } from "./Dialog.js";
import { Kbd } from "./Kbd.js";

export interface CommandPaletteProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Optional category filter — palette only lists commands in this
   *  category. Default: list everything. */
  readonly category?: string;
  /** Initial placeholder text in the search input. */
  readonly placeholder?: string;
}

function pickLocalized(bag: Readonly<Record<string, string>> | undefined, locale: string): string {
  if (bag === undefined) return "";
  return bag[locale] ?? bag.en ?? Object.values(bag)[0] ?? "";
}

function matchScore(haystack: string, needle: string): number {
  if (needle.length === 0) return 1;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  // Exact / prefix wins; substring next; subsequence last.
  if (h === n) return 4;
  if (h.startsWith(n)) return 3;
  const idx = h.indexOf(n);
  if (idx >= 0) return 2;
  // Subsequence match.
  let i = 0;
  for (const ch of h) {
    if (ch === n[i]) i++;
    if (i === n.length) return 1;
  }
  return 0;
}

interface ScoredCommand {
  readonly meta: CommandMetaLike;
  readonly label: string;
  readonly description: string;
  readonly score: number;
  readonly enabled: boolean;
}

export function CommandPalette({
  open,
  onOpenChange,
  category,
  placeholder = "명령 검색…",
}: CommandPaletteProps): ReactNode {
  const host = useCommandHostOrNull();
  const [query, setQuery] = useState("");
  const [focusIdx, setFocusIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setFocusIdx(0);
    }
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current !== null) inputRef.current.focus();
  }, [open]);

  const filtered = useMemo<ReadonlyArray<ScoredCommand>>(() => {
    if (host === null) return [];
    const all = host.registry.list(category !== undefined ? { category } : undefined);
    const scored: ScoredCommand[] = [];
    for (const meta of all) {
      const label = pickLocalized(meta.label, host.locale);
      const description = pickLocalized(meta.description, host.locale);
      const hotkey = meta.hotkey?.keys ?? "";
      const score = Math.max(
        matchScore(label, query),
        matchScore(description, query),
        matchScore(hotkey, query),
      );
      if (query.length > 0 && score === 0) continue;
      scored.push({
        meta,
        label,
        description,
        score,
        enabled: host.registry.isEnabled(meta.id, host.context),
      });
    }
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
    });
    return scored;
  }, [host, category, query]);

  useEffect(() => {
    setFocusIdx(0);
  }, [query]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = filtered[focusIdx];
      if (pick === undefined || !pick.enabled || host === null) return;
      onOpenChange(false);
      host.dispatch(pick.meta.id);
    }
  };

  if (host === null) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        tone="overlay"
        size="md"
        aria-label="명령 팔레트"
        data-testid="command-palette"
        onKeyDown={onKey}
      >
        <div className="flex flex-col gap-3">
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder={placeholder}
            onChange={(e) => setQuery(e.currentTarget.value)}
            className={cn(
              "w-full h-11 px-3 rounded-[var(--radius-md)]",
              "bg-[color:var(--surface-1)] border border-[color:var(--surface-1-border)]",
              "text-[14px] text-[color:var(--text-strong)]",
              "placeholder:text-[color:var(--text-soft)]",
              "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
            )}
            data-testid="command-palette-input"
          />
          <ul
            className="grid gap-0.5 max-h-[60vh] overflow-y-auto"
            role="listbox"
            aria-label="검색 결과"
            data-testid="command-palette-list"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-[13px] text-[color:var(--text-soft)] italic">
                {query.length === 0 ? "명령이 없습니다" : "일치하는 명령이 없습니다"}
              </li>
            ) : (
              filtered.map((row, idx) => (
                <li
                  key={row.meta.id}
                  role="option"
                  aria-selected={idx === focusIdx}
                  aria-disabled={!row.enabled}
                  data-testid={`command-palette-item-${row.meta.id.replace(/\./g, "-")}`}
                  data-cmd-id={row.meta.id}
                  className={cn(
                    "flex items-center justify-between gap-3 px-3 py-2 rounded-[var(--radius-sm)] cursor-pointer",
                    idx === focusIdx
                      ? "bg-[color:var(--surface-2)] text-[color:var(--text-strong)]"
                      : "text-[color:var(--text-default)] hover:bg-[color:var(--surface-1)]",
                    !row.enabled && "opacity-40 cursor-not-allowed",
                  )}
                  onMouseEnter={() => setFocusIdx(idx)}
                  onClick={() => {
                    if (!row.enabled) return;
                    onOpenChange(false);
                    host.dispatch(row.meta.id);
                  }}
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-[14px] truncate">{row.label}</span>
                    {row.description !== "" ? (
                      <span className="text-[12px] text-[color:var(--text-soft)] truncate">
                        {row.description}
                      </span>
                    ) : null}
                  </div>
                  {row.meta.hotkey !== undefined ? (
                    <Kbd size="sm" combo>
                      {row.meta.hotkey.keys}
                    </Kbd>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
