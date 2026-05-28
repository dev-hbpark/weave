// WI-033 P3 — In-app banner announcing the Figma-aligned frame UX.
//
// LG-001 / RISK-005 condition #5: banner is visible for 1 week
// post-launch then auto-retracts. User dismissal is also persisted
// (next mount silent). Same lifecycle shape as `TextV1LaunchBanner`
// — the two coexist during the launch week; consumers stack them
// vertically.
//
// Source copy: WI-033 P3 launch note draft. Two-locale (ko / en).

import { Banner, type BannerProps, IconCursor } from "@weave/design-system";
import { useEffect, useState } from "react";

const STORAGE_KEY = "weave.launch.figma-selection.dismissed-at";
// T-0 (LG-001) = 2026-06-08. Auto-retract 1 week later
// (RISK-005 condition #5 — same as RISK-001 #6).
const LAUNCH_AT = Date.parse("2026-06-08T00:00:00Z");
const RETRACT_AT = LAUNCH_AT + 7 * 24 * 60 * 60 * 1000;

type Locale = "ko" | "en";

function detectLocale(): Locale {
  if (typeof navigator === "undefined") return "ko";
  return navigator.language.toLowerCase().startsWith("ko") ? "ko" : "en";
}

interface Copy {
  readonly headline: string;
  readonly body: string;
  readonly dismissLabel: string;
}

const COPY: Readonly<Record<Locale, Copy>> = {
  ko: {
    headline: "프레임 선택 방식이 새로워졌습니다",
    body:
      "Figma 와 동일한 selection 모델로 정렬했습니다. " +
      "단순 클릭으로 부모 프레임 먼저 선택, Cmd/Ctrl-클릭으로 깊이 무관 leaf 직접 선택, " +
      "Enter/Shift+Enter 로 자식·부모 이동, Tab/Shift+Tab 으로 형제 순환, " +
      "우클릭에서 'Select layer' 로 겹친 프레임 선택. " +
      "기존 'Enter frame' 드릴인 모드는 제거되었습니다.",
    dismissLabel: "닫기",
  },
  en: {
    headline: "Frame selection is upgraded",
    body:
      "Selection now mirrors Figma. Plain click selects the parent frame first; " +
      "Cmd/Ctrl-click selects the leaf at any depth; Enter / Shift+Enter drill " +
      "down/up; Tab / Shift+Tab cycle siblings; right-click opens a 'Select " +
      "layer' picker for overlapping frames. The legacy 'Enter frame' drill-in " +
      "mode has been retired.",
    dismissLabel: "Dismiss",
  },
};

function readDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

function persistDismissed(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // ignore — banner stays silent for the session, reappears next mount
  }
}

export interface FigmaSelectionLaunchBannerProps {
  /** Override the locale auto-detection (mostly for tests). */
  readonly locale?: Locale;
  /** Bypass persistence + auto-retract gate (for tests / storybooks). */
  readonly forceShow?: boolean;
  readonly className?: BannerProps["className"];
}

export function FigmaSelectionLaunchBanner({
  locale,
  forceShow = false,
  className,
}: FigmaSelectionLaunchBannerProps) {
  const [open, setOpen] = useState<boolean>(false);
  const [resolvedLocale, setResolvedLocale] = useState<Locale>("ko");

  useEffect(() => {
    setResolvedLocale(locale ?? detectLocale());
    if (forceShow) {
      setOpen(true);
      return;
    }
    // Auto-retract window. Banner is silent before launch and after the
    // retract date, regardless of user interaction.
    const now = Date.now();
    if (now < LAUNCH_AT || now > RETRACT_AT) return;
    if (readDismissed()) return;
    setOpen(true);
  }, [locale, forceShow]);

  if (!open) return null;
  const copy = COPY[resolvedLocale];

  return (
    <Banner
      tone="announcement"
      icon={<IconCursor size={16} aria-hidden />}
      headline={copy.headline}
      dismissLabel={copy.dismissLabel}
      onDismiss={() => {
        setOpen(false);
        persistDismissed();
      }}
      {...(className !== undefined ? { className } : {})}
      data-testid="figma-selection-launch-banner"
    >
      {copy.body}
    </Banner>
  );
}
