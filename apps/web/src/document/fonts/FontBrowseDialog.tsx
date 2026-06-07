// WI-136 Phase 6 — "모든 폰트 찾아보기" browse dialog.
//
// Backed by the bundled GOOGLE_FONTS_SNAPSHOT (no API key). Search + grouped-by-
// nothing flat list; hovering a row loads that font for preview, selecting it
// fires `onPick` with the ad-hoc FontEntry (the caller stores entry.stack as a
// per-item override). Results are capped so a long list stays responsive.

import { Dialog, DialogContent, DialogHeader, TextField } from "@weave/design-system";
import { useMemo, useState } from "react";
import { registerAdHocFont } from "./adhoc-registry.js";
import { FONT_CATEGORY_LABEL, type FontEntry } from "./catalog.js";
import { ensureFontLoaded } from "./font-loader.js";
import { GOOGLE_FONTS_SNAPSHOT } from "./google-fonts-snapshot.js";

const MAX_RESULTS = 200;

export interface FontBrowseDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onPick: (entry: FontEntry) => void;
}

export function FontBrowseDialog({ open, onOpenChange, onPick }: FontBrowseDialogProps) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list =
      needle === ""
        ? GOOGLE_FONTS_SNAPSHOT
        : GOOGLE_FONTS_SNAPSHOT.filter((f) => f.label.toLowerCase().includes(needle));
    return list.slice(0, MAX_RESULTS);
  }, [query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent tone="overlay" size="md" data-testid="font-browse-dialog">
        <DialogHeader
          compact
          headline="모든 폰트 찾아보기"
          description="Google Fonts에서 선택하세요. 선택한 폰트만 그때 불러옵니다."
        />
        <TextField
          label="검색"
          autoFocus
          placeholder="폰트 이름 검색…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="font-browse-search"
        />
        <div className="mt-3 flex max-h-[50vh] flex-col overflow-y-auto">
          {results.map((f) => (
            <button
              key={f.id}
              type="button"
              onPointerEnter={() => ensureFontLoaded(f)}
              onClick={() => {
                ensureFontLoaded(f);
                // Persist so it resolves by id/stack on reopen and can serve as
                // a theme role default (TypographyPicker).
                registerAdHocFont(f);
                onPick(f);
                onOpenChange(false);
              }}
              data-testid={`font-browse-${f.id}`}
              className={[
                "flex items-center justify-between gap-3 rounded-[var(--radius-sm)] px-2.5 py-2 text-left",
                "outline-none hover:bg-[color:var(--surface-overlay-2)]",
                "focus-visible:bg-[color:var(--surface-overlay-2)]",
              ].join(" ")}
            >
              <span
                className="text-[15px] text-[color:var(--text-overlay)]"
                style={{ fontFamily: f.stack }}
              >
                {f.label}
              </span>
              <span className="shrink-0 text-[11px] text-[color:var(--text-overlay-muted)]">
                {FONT_CATEGORY_LABEL[f.category]}
              </span>
            </button>
          ))}
          {results.length === 0 ? (
            <p className="px-2.5 py-6 text-center text-[13px] text-[color:var(--text-overlay-muted)]">
              검색 결과가 없습니다.
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
