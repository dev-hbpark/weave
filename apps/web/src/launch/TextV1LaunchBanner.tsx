// WI-029 R5 — In-app banner announcing the text item v1 launch.
//
// LG-001 Pillar 1 Product + Pillar 6 Communications conditional close.
// RISK-001 condition #6: banner is visible for 1 week post-launch then
// auto-retracts. User dismissal is also persisted (next mount silent).
//
// Source copy: `docs/launch/TEXT_V1_LAUNCH_NOTE.md` § "사용자에게 전달할 메시지".

import { Banner, type BannerProps, IconSparkle } from "@weave/design-system";
import { useEffect, useState } from "react";

const STORAGE_KEY = "weave.launch.text-v1.dismissed-at";
// T-0 (LG-001) = 2026-06-08. Auto-retract 1 week later (RISK-001 #6).
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
    headline: "텍스트 편집이 새로워졌습니다",
    body:
      "Figma·Canva 와 동일한 방식으로 텍스트를 다룰 수 있습니다. " +
      "코너 드래그는 박스만 조정 — 글자 크기는 PropertiesPanel 의 Size 슬라이더에서 변경하세요.",
    dismissLabel: "닫기",
  },
  en: {
    headline: "Text editing is upgraded",
    body:
      "Text now behaves the way Figma and Canva do. Corner drag adjusts the " +
      "box only — change font size in the PropertiesPanel Size slider.",
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

export interface TextV1LaunchBannerProps {
  /** Override the locale auto-detection (mostly for tests). */
  readonly locale?: Locale;
  /** Bypass persistence + auto-retract gate (for tests / storybooks). */
  readonly forceShow?: boolean;
  readonly className?: BannerProps["className"];
}

export function TextV1LaunchBanner({
  locale,
  forceShow = false,
  className,
}: TextV1LaunchBannerProps) {
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
      icon={<IconSparkle size={16} aria-hidden />}
      headline={copy.headline}
      dismissLabel={copy.dismissLabel}
      onDismiss={() => {
        setOpen(false);
        persistDismissed();
      }}
      {...(className !== undefined ? { className } : {})}
      data-testid="text-v1-launch-banner"
    >
      {copy.body}
    </Banner>
  );
}
