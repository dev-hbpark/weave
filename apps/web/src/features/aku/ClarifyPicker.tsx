// Pre-generation media-type picker. The small-think server asks — before creating a
// design — which media item types (image / video / qr / …, derived from weave's live
// capabilities) to incorporate; this surfaces the question as toggle chips and resolves
// the agent's `onClarify` promise with the user's pick. Feature-local chat UI (like
// AkuTokenSetup), composing the design-system Button.

import type { ClarifyRequest } from "@agocraft/agent-client";
import { Button } from "@weave/design-system";
import { useState } from "react";

// Localized labels for the generic item-type names the server sends. Unknown types
// fall back to the option's own label (the raw kind name).
const TYPE_LABEL: Record<string, string> = {
  image: "이미지",
  video: "동영상",
  qr: "QR 코드",
  qrcode: "QR 코드",
  icon: "아이콘",
  gif: "GIF",
  chart: "차트",
  map: "지도",
  audio: "오디오",
  embed: "임베드",
  sticker: "스티커",
};

export function ClarifyPicker({
  request,
  onSubmit,
}: {
  readonly request: ClarifyRequest;
  readonly onSubmit: (types: readonly string[]) => void;
}): JSX.Element {
  // Default: everything selected (the user trims down what they don't want).
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(request.options.map((o) => o.type)),
  );
  const toggle = (type: string): void =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });

  return (
    <div
      className="grid gap-2 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface)] p-3"
      data-aku-clarify
    >
      <p className="text-[12px] font-medium text-[color:var(--text-strong)]">
        디자인에 어떤 미디어를 넣을까요?
      </p>
      <div className="flex flex-wrap gap-1.5">
        {request.options.map((o) => {
          const on = selected.has(o.type);
          return (
            <button
              key={o.type}
              type="button"
              onClick={() => toggle(o.type)}
              aria-pressed={on}
              title={o.description}
              className={`rounded-[var(--radius-sm)] border px-2.5 py-1 text-[12px] transition-colors ${
                on
                  ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--text-strong)]"
                  : "border-[color:var(--border)] text-[color:var(--text-soft)]"
              }`}
            >
              {TYPE_LABEL[o.type] ?? o.label}
            </button>
          );
        })}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="subtle" size="md" onClick={() => onSubmit([])}>
          미디어 없이
        </Button>
        <Button variant="primary" size="md" onClick={() => onSubmit([...selected])}>
          이대로 생성
        </Button>
      </div>
    </div>
  );
}
