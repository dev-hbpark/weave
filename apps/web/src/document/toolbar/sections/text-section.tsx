import {
  Button,
  ColorPicker,
  ContextualToolbar as Bar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  NumberSlider,
  SegmentedControl,
} from "@weave/design-system";
import type {
  TextAlign,
  TextAttrs,
  TextStyle,
  TextWeight,
} from "@agocraft/core";
import {
  isMixed,
  MixedBadge,
  sharedValue,
  updateAll,
} from "../multi-edit.js";
import type { ToolbarSectionComponent } from "./types.js";

/** Curated font-family presets. The webfonts are loaded from Google Fonts
 *  in `apps/web/index.html`; each stack ends with a robust fallback so
 *  text renders even if the named family hasn't downloaded yet. */
const FONT_FAMILY_PRESETS = [
  {
    value:
      "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    label: "Inter",
  },
  {
    value:
      "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
    label: "Noto Sans KR",
  },
  {
    value:
      "'Playfair Display', Georgia, 'Times New Roman', Times, serif",
    label: "Playfair",
  },
  {
    value:
      "'Noto Serif KR', 'Source Han Serif K', Georgia, 'Apple SD Gothic Neo', serif",
    label: "Noto Serif KR",
  },
  {
    value:
      "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    label: "JetBrains Mono",
  },
  {
    value: "'Caveat', 'Comic Sans MS', cursive",
    label: "Caveat",
  },
] as const;

function fontFamilyLabel(stack: string): string {
  const hit = FONT_FAMILY_PRESETS.find((p) => p.value === stack);
  if (hit !== undefined) return hit.label;
  const first = stack.split(",")[0]?.replace(/['"]/g, "").trim() ?? stack;
  return first;
}

export const TextSection: ToolbarSectionComponent = ({
  editor,
  items,
  ids,
}) => {
  const fontFamily = sharedValue<string>(
    items,
    (it) => (it.attrs as unknown as TextAttrs).fontFamily,
  );
  const fontSize = sharedValue<number>(
    items,
    (it) => (it.attrs as unknown as TextAttrs).fontSize,
  );
  const fontWeight = sharedValue<TextWeight>(
    items,
    (it) => (it.attrs as unknown as TextAttrs).fontWeight,
  );
  const fontStyle = sharedValue<TextStyle>(
    items,
    (it) => (it.attrs as unknown as TextAttrs).fontStyle,
  );
  const color = sharedValue<string>(
    items,
    (it) => (it.attrs as unknown as TextAttrs).color,
  );
  const background = sharedValue<string | undefined>(
    items,
    (it) => (it.attrs as unknown as TextAttrs).background,
  );
  const textAlign = sharedValue<TextAlign>(
    items,
    (it) => (it.attrs as unknown as TextAttrs).textAlign,
  );
  const opacity = sharedValue<number>(
    items,
    (it) => (it.attrs as unknown as TextAttrs).opacity,
  );
  const bgHasValue = !isMixed(background) && background !== undefined;
  return (
    <>
      <Bar.Section label="Family">
        <div className="inline-flex items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="md"
                data-testid="text-font-family-trigger"
                style={{
                  fontFamily: isMixed(fontFamily) ? undefined : fontFamily,
                }}
              >
                {isMixed(fontFamily)
                  ? "여러 폰트"
                  : fontFamilyLabel(fontFamily)}
                &nbsp;▾
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={6}>
              {FONT_FAMILY_PRESETS.map((p) => (
                <DropdownMenuItem
                  key={p.value}
                  onSelect={() =>
                    updateAll(editor, ids, (prev) => ({
                      attrs: { ...prev.attrs, fontFamily: p.value },
                    }))
                  }
                  data-testid={`text-font-family-${p.label.replace(/\s+/g, "-")}`}
                >
                  <span style={{ fontFamily: p.value }}>{p.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <MixedBadge visible={isMixed(fontFamily)} />
        </div>
      </Bar.Section>
      <Bar.Divider />
      <Bar.Section label="Font">
        <div className="inline-flex items-center gap-1.5">
          <SegmentedControl<TextWeight>
            value={isMixed(fontWeight) ? "normal" : fontWeight}
            onValueChange={(v) =>
              updateAll(editor, ids, (prev) => ({
                attrs: { ...prev.attrs, fontWeight: v },
              }))
            }
            options={[
              { value: "normal", label: "R" },
              { value: "bold", label: "B" },
            ]}
            aria-label="Font weight"
          />
          <SegmentedControl<TextStyle>
            value={isMixed(fontStyle) ? "normal" : fontStyle}
            onValueChange={(v) =>
              updateAll(editor, ids, (prev) => ({
                attrs: { ...prev.attrs, fontStyle: v },
              }))
            }
            options={[
              { value: "normal", label: "—" },
              { value: "italic", label: "I" },
            ]}
            aria-label="Font style"
          />
          <MixedBadge visible={isMixed(fontWeight) || isMixed(fontStyle)} />
        </div>
      </Bar.Section>
      <Bar.Divider />
      <Bar.Section label="Size">
        <div className="inline-flex items-center">
          <NumberSlider
            value={isMixed(fontSize) ? 24 : fontSize}
            onValueChange={(v) =>
              updateAll(editor, ids, (prev) => ({
                attrs: { ...prev.attrs, fontSize: v },
              }))
            }
            min={8}
            max={200}
            step={1}
            format={(v) => `${Math.round(v)}px`}
            aria-label="Font size"
          />
          <MixedBadge visible={isMixed(fontSize)} />
        </div>
      </Bar.Section>
      <Bar.Divider />
      <Bar.Section label="Align">
        <div className="inline-flex items-center">
          <SegmentedControl<TextAlign>
            value={isMixed(textAlign) ? "left" : textAlign}
            onValueChange={(v) =>
              updateAll(editor, ids, (prev) => ({
                attrs: { ...prev.attrs, textAlign: v },
              }))
            }
            options={[
              { value: "left", label: "L" },
              { value: "center", label: "C" },
              { value: "right", label: "R" },
              { value: "justify", label: "J" },
            ]}
            aria-label="Text align"
          />
          <MixedBadge visible={isMixed(textAlign)} />
        </div>
      </Bar.Section>
      <Bar.Divider />
      <Bar.Section label="Color">
        <div className="inline-flex items-center">
          <ColorPicker
            value={isMixed(color) ? "#cccccc" : color}
            onValueCommit={(v) =>
              updateAll(editor, ids, (prev) => ({
                attrs: { ...prev.attrs, color: v },
              }))
            }
            onValueChange={() => { /* commit-only */ }}
          />
          <MixedBadge visible={isMixed(color)} />
        </div>
      </Bar.Section>
      <Bar.Section label="Background">
        <div className="inline-flex items-center gap-1.5">
          <ColorPicker
            value={
              isMixed(background) ? "#cccccc" : (background ?? "#ffffff")
            }
            onValueCommit={(v) =>
              updateAll(editor, ids, (prev) => ({
                attrs: { ...prev.attrs, background: v },
              }))
            }
            onValueChange={() => { /* commit-only */ }}
          />
          <MixedBadge visible={isMixed(background)} />
          {bgHasValue ? (
            <Button
              variant="subtle"
              size="md"
              onClick={() =>
                updateAll(editor, ids, (prev) => {
                  const next = { ...prev.attrs } as Record<string, unknown>;
                  delete next.background;
                  return {
                    attrs: next as Readonly<Record<string, unknown>>,
                  };
                })
              }
              data-testid="text-bg-clear"
              aria-label="배경 비우기"
              title="배경 비우기 (투명)"
            >
              ×
            </Button>
          ) : null}
        </div>
      </Bar.Section>
      <Bar.Divider />
      <Bar.Section label="Opacity">
        <div className="inline-flex items-center">
          <NumberSlider
            value={isMixed(opacity) ? 1 : opacity}
            onValueChange={(v) =>
              updateAll(editor, ids, (prev) => ({
                attrs: { ...prev.attrs, opacity: v },
              }))
            }
            min={0}
            max={1}
            step={0.01}
            format={(v) => `${Math.round(v * 100)}%`}
            aria-label="Text opacity"
          />
          <MixedBadge visible={isMixed(opacity)} />
        </div>
      </Bar.Section>
    </>
  );
};
