// 아쿠 minimized edit-indicator — the "아쿠가 편집 중…" pill is the CLOSED-panel face
// of a running edit: shown only when `showStatus`, carrying the same stop control
// as the panel composer. The lock scrim itself stays whenever `locked`, regardless
// of the pill. Client-rendered (jsdom) because the component runs DOM effects
// (installInteractionLock) in useEffect.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AkuInteractionLock } from "./AkuInteractionLock.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("AkuInteractionLock — minimized edit indicator", () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it("renders nothing while idle (not locked)", () => {
    act(() => root.render(<AkuInteractionLock locked={false} />));
    expect(host.querySelector("[data-aku-lock]")).toBeNull();
    expect(host.textContent).not.toContain("아쿠가 편집 중");
  });

  it("shows the pill + a working stop button when the panel is CLOSED", () => {
    const onStop = vi.fn();
    const onOpen = vi.fn();
    act(() =>
      root.render(<AkuInteractionLock locked showStatus onStop={onStop} onOpen={onOpen} />),
    );

    expect(host.querySelector("[data-aku-lock]")).not.toBeNull();
    const pill = host.querySelector('[role="status"]');
    expect(pill?.textContent).toContain("아쿠가 편집 중");

    const stop = host.querySelector('button[aria-label="중지"]') as HTMLButtonElement | null;
    expect(stop).not.toBeNull();
    act(() => stop?.click());
    expect(onStop).toHaveBeenCalledTimes(1);
    // Stopping is independent of opening — the stop button must not re-open.
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("re-opens the panel when the pill text is clicked (launcher parity)", () => {
    const onOpen = vi.fn();
    act(() =>
      root.render(<AkuInteractionLock locked showStatus onStop={vi.fn()} onOpen={onOpen} />),
    );

    const open = host.querySelector(
      'button[aria-label="아쿠 패널 열기"]',
    ) as HTMLButtonElement | null;
    expect(open?.textContent).toContain("아쿠가 편집 중");
    act(() => open?.click());
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("keeps the lock scrim but HIDES the pill when the panel is open", () => {
    act(() => root.render(<AkuInteractionLock locked showStatus={false} onStop={vi.fn()} />));
    // Scrim still engaged (blocks concurrent edits) …
    expect(host.querySelector("[data-aku-lock]")).not.toBeNull();
    // … but no floating status pill — the open panel owns progress + stop.
    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(host.textContent).not.toContain("아쿠가 편집 중");
  });
});
