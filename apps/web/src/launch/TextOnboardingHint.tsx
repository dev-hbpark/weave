// WI-029 R5 — OnboardingCoachmark wrapper for the first text-frame creation.
//
// LG-001 Pillar 1 Product: explains the 3-mode resize toggle (Auto-W /
// Auto-H / Fixed) once per user. The coachmark anchors to the SegmentedControl
// at the top of the text PropertiesPanel section.
//
// One-shot — `OnboardingCoachmark`'s persistKey records the dismissal in
// localStorage. The component below is a thin locale + copy wrapper around
// the design-system primitive; it does not implement persistence itself.

import { OnboardingCoachmark } from "@weave/design-system";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

type Locale = "ko" | "en";

function detectLocale(): Locale {
  if (typeof navigator === "undefined") return "ko";
  return navigator.language.toLowerCase().startsWith("ko") ? "ko" : "en";
}

interface Copy {
  readonly headline: string;
  readonly autoW: string;
  readonly autoH: string;
  readonly fixed: string;
  readonly dismissLabel: string;
}

const COPY: Readonly<Record<Locale, Copy>> = {
  ko: {
    headline: "새로운 점",
    autoW: "↔ Auto-W — 글자 입력하면 박스가 가로로 자동 확장",
    autoH: "↕ Auto-H — 폭 고정, 줄바꿈에 따라 세로 자동",
    fixed: "□ Fixed — 폭·세로 모두 고정, 넘치는 텍스트는 잘림",
    dismissLabel: "닫기",
  },
  en: {
    headline: "What's new",
    autoW: "↔ Auto-W — typing widens the box horizontally",
    autoH: "↕ Auto-H — fixed width, height grows with line wrap",
    fixed: "□ Fixed — width + height locked, overflow truncates",
    dismissLabel: "Got it",
  },
};

export interface TextOnboardingHintProps {
  /** Anchor — the SegmentedControl mounted above the text PropertiesPanel. */
  readonly anchor: ReactElement;
  /** Override locale (mostly for tests). */
  readonly locale?: Locale;
  /** Bypass persistence (for storybooks). */
  readonly forceShow?: boolean;
}

export function TextOnboardingHint({ anchor, locale, forceShow = false }: TextOnboardingHintProps) {
  const [resolved, setResolved] = useState<Locale>("ko");
  useEffect(() => {
    setResolved(locale ?? detectLocale());
  }, [locale]);
  const copy = COPY[resolved];

  return (
    <OnboardingCoachmark
      persistKey="text-3-mode-toggle-v1"
      anchor={anchor}
      icon={<span aria-hidden>💡</span>}
      headline={copy.headline}
      dismissLabel={copy.dismissLabel}
      side="bottom"
      forceShow={forceShow}
    >
      <ul className="m-0 list-none p-0 space-y-1">
        <li>{copy.autoW}</li>
        <li>{copy.autoH}</li>
        <li>{copy.fixed}</li>
      </ul>
    </OnboardingCoachmark>
  );
}
