// Aku floating-tip controller (WI-053) — the "fairy gives a tip via a speech
// bubble" behavior. Deliberately ANTI-CLIPPY: at most one tip per enabled
// session, only when the panel is closed (and the first-run coachmark is done),
// rate-limited across sessions, auto-hiding, dismissible, with a "그만 보기"
// that turns it off for good. Persisted at `weave.aku.tips`.

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "weave.aku.tips";
/** Idle-closed time before a tip nudges. */
const DELAY_MS = 7000;
/** How long a shown tip stays before auto-hiding. */
const AUTO_HIDE_MS = 14000;
/** Minimum gap between tips across sessions. */
const COOLDOWN_MS = 1000 * 60 * 60 * 4;

const TIPS: ReadonlyArray<string> = [
  "프레임을 선택하고 ‘자동 레이아웃 적용’이라고 하면 정렬을 맡겨드려요.",
  "‘배경을 파란색으로 바꿔줘’처럼 말하면 캔버스를 바로 수정해요.",
  "이미지를 붙여넣어(⌘V) 아쿠에게 보여줄 수 있어요.",
  "‘텍스트 추가’, ‘슬라이드 추가’ 같은 편집도 대화로 처리해요.",
  "아쿠가 만든 변경은 ‘이 변경 되돌리기’로 한 번에 되돌릴 수 있어요.",
  "입력창에 ‘/’ 를 입력하면 빠른 명령을 쓸 수 있어요.",
];

interface TipState {
  off?: boolean;
  lastAt?: number;
  idx?: number;
}

function read(): TipState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === null ? {} : (JSON.parse(raw) as TipState);
  } catch {
    return {};
  }
}
function write(s: TipState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore quota / private-mode
  }
}

export interface UseAkuTips {
  /** The tip to show right now, or null. */
  readonly tip: string | null;
  /** Hide the current tip (cooldown still applies). */
  dismiss(): void;
  /** Turn tips off permanently ("그만 보기"). */
  disableForever(): void;
}

/** `enabled` should be true only when the panel is CLOSED and the first-run
 *  coachmark has already been seen — the caller owns that gate. */
export function useAkuTips({ enabled }: { readonly enabled: boolean }): UseAkuTips {
  const [tip, setTip] = useState<string | null>(null);
  const shownThisMount = useRef(false);

  const dismiss = useCallback(() => setTip(null), []);
  const disableForever = useCallback(() => {
    setTip(null);
    write({ ...read(), off: true });
  }, []);

  useEffect(() => {
    if (!enabled || shownThisMount.current) {
      // Panel opened (or already nudged) — make sure nothing lingers.
      if (!enabled) setTip(null);
      return;
    }
    const state = read();
    if (state.off === true) return;
    const now = Date.now();
    if (state.lastAt !== undefined && now - state.lastAt < COOLDOWN_MS) return;

    const showTimer = setTimeout(() => {
      const idx = (read().idx ?? 0) % TIPS.length;
      shownThisMount.current = true;
      setTip(TIPS[idx] ?? null);
      write({ ...read(), lastAt: Date.now(), idx: (idx + 1) % TIPS.length });
    }, DELAY_MS);

    return () => clearTimeout(showTimer);
  }, [enabled]);

  // Auto-hide a shown tip.
  useEffect(() => {
    if (tip === null) return;
    const hideTimer = setTimeout(() => setTip(null), AUTO_HIDE_MS);
    return () => clearTimeout(hideTimer);
  }, [tip]);

  return { tip, dismiss, disableForever };
}
