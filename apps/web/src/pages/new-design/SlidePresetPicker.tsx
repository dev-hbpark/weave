// WI-030 — Slide preset picker Dialog.
//
// Triggered from DesignPage's Add menu when the user picks "슬라이드…". Shows
// the open `defaultPresetRegistry()` content:
//   - Left rail: scrollable category list. Reads from
//     `registry.listCategories()` so adding a category is data-only.
//   - Right grid: ~5 preset thumbnails for the selected category. Scrolls
//     independently of the left rail.
// Click → `editor.exec("weave.preset.insertSlide", { presetId })`, dialog
// closes, focus returns to the canvas.
//
// SOLID/GRASP:
//   • SRP — only navigates + dispatches. No state mutation; no preset
//     content branching.
//   • OCP — adding a category or preset = data in the registry, zero edit
//     here.
//   • Design System Triage Step 1 (Reused) — composes Dialog + Card from
//     `@weave/design-system`. No new primitive.
//
// Visibility: the panel-tone Dialog default uses `--surface-1` (6% alpha
// glass) which washes out over the aurora canvas. We replace that with a
// moderate-alpha dark slate (~72%) so the existing `backdrop-blur` reads
// as a true frosted-glass surface — the aurora behind still tints the
// surface slightly, but body text stays comfortably legible. Tuned by eye
// against the aurora theme; mono/vivid still work because the blur +
// dark-slate base is theme-independent (same approach as DropdownMenu).

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@weave/design-system";
import { useMemo, useState } from "react";
import { SlidePresetThumbnail } from "../../document/presets/__thumbnails__/SlidePresetThumbnail.js";
import { defaultPresetRegistry } from "../../document/presets/default-registry.js";
import {
  type Preset,
  type PresetCategory,
  resolveLocalizedText,
} from "../../document/presets/types.js";

const FROSTED_PANEL_CLASS =
  "bg-[rgba(15,23,42,0.72)] border-[color:var(--surface-overlay-border)]";

export interface SlidePresetPickerProps {
  readonly open: boolean;
  readonly onOpenChange: (next: boolean) => void;
  /** Called when the user picks a preset. The host dispatches the editor
   *  command and closes the dialog. The picker is intentionally not
   *  command-aware — keeps the component testable without a live editor. */
  readonly onPick: (presetId: string) => void;
  readonly locale?: "ko" | "en";
}

export function SlidePresetPicker({
  open,
  onOpenChange,
  onPick,
  locale = "ko",
}: SlidePresetPickerProps) {
  const registry = defaultPresetRegistry();
  const categories = useMemo(() => registry.listCategories(), [registry]);
  const initialCategoryId = categories[0]?.id ?? "";
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(initialCategoryId);

  const presets = useMemo(() => {
    return selectedCategoryId === "" ? [] : registry.listPresetsByCategory(selectedCategoryId);
  }, [registry, selectedCategoryId]);

  const headline = locale === "ko" ? "슬라이드" : "Choose a slide layout";
  const description =
    locale === "ko"
      ? "카테고리를 고르면 추천 시작점이 나타나요. 삽입 후 자유롭게 편집할 수 있습니다."
      : "Pick a category to see recommended starting points. Edit freely after insert.";

  const cancelLabel = locale === "ko" ? "취소" : "Cancel";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        size="lg"
        data-testid="slide-preset-picker"
        className={FROSTED_PANEL_CLASS}
      >
        <DialogHeader headline={headline} description={description} />

        <div className="grid grid-cols-[160px_1fr] gap-4 md:gap-6 min-h-[380px]">
          {/* Left rail — scrollable category list */}
          <nav
            aria-label={locale === "ko" ? "프리셋 카테고리" : "Preset categories"}
            className="flex flex-col gap-1 max-h-[60vh] overflow-y-auto pr-1"
            data-testid="preset-category-rail"
          >
            {categories.map((c) => (
              <CategoryChip
                key={c.id}
                category={c}
                locale={locale}
                selected={c.id === selectedCategoryId}
                onSelect={() => setSelectedCategoryId(c.id)}
              />
            ))}
          </nav>

          {/* Right grid — preset thumbnails, scroll independently */}
          <div
            className="grid grid-cols-1 md:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto pr-1 content-start"
            data-testid="preset-thumbnail-grid"
          >
            {presets.map((p) => (
              <PresetCard
                key={p.id}
                preset={p}
                locale={locale}
                onSelect={() => {
                  onPick(p.id);
                  onOpenChange(false);
                }}
              />
            ))}
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <button
              type="button"
              data-testid="slide-preset-picker-cancel"
              className="px-3 py-1.5 rounded-[var(--radius-sm)] text-[13px] text-[color:var(--text-soft)] hover:text-[color:var(--text-default)] focus-visible:outline-none focus-visible:[box-shadow:var(--focus-ring)]"
            >
              {cancelLabel}
            </button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoryChip({
  category,
  locale,
  selected,
  onSelect,
}: {
  readonly category: PresetCategory;
  readonly locale: "ko" | "en";
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const label = resolveLocalizedText(category.label, locale);
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid={`preset-category-${category.id}`}
      aria-pressed={selected}
      className={
        "text-left px-3 py-2 rounded-[var(--radius-sm)] text-[13px] border shrink-0 " +
        (selected
          ? "bg-[color:var(--accent-soft)] border-[color:var(--accent)]/40 text-[color:var(--text-strong)]"
          : "bg-transparent border-transparent text-[color:var(--text-default)] hover:bg-[color:var(--surface-overlay-2)]")
      }
    >
      {label}
    </button>
  );
}

function PresetCard({
  preset,
  locale,
  onSelect,
}: {
  readonly preset: Preset;
  readonly locale: "ko" | "en";
  readonly onSelect: () => void;
}) {
  const label = resolveLocalizedText(preset.label, locale);
  const description = preset.description
    ? resolveLocalizedText(preset.description, locale)
    : undefined;
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid={`preset-card-${preset.id}`}
      aria-label={label}
      className="text-left p-2 rounded-[var(--radius-md)] border border-[color:var(--surface-overlay-border)] bg-[color:var(--surface-overlay-2)] hover:border-[color:var(--accent)]/60 focus-visible:outline-none focus-visible:[box-shadow:var(--focus-ring)] transition-colors"
    >
      <SlidePresetThumbnail preset={preset} locale={locale} />
      <div className="mt-2 px-1">
        <div className="text-[12px] font-medium text-[color:var(--text-strong)]">{label}</div>
        {description ? (
          <div className="text-[11px] text-[color:var(--text-soft)] mt-0.5 line-clamp-2">
            {description}
          </div>
        ) : null}
      </div>
    </button>
  );
}
