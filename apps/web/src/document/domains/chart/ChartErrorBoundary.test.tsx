// WI-172 — render-layer backstop: a throwing chart renders the per-item error
// placeholder instead of propagating and unmounting the whole canvas tree
// (which is what cascade-failed agent execs after the "Invalid data provider"
// crash). Client-rendered (jsdom) because React error boundaries do not run in
// SSR — renderToStaticMarkup would just rethrow.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChartErrorBoundary } from "./ChartErrorBoundary.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Bomb(): never {
  throw new Error("Invalid data provider.");
}

describe("ChartErrorBoundary (WI-172)", () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    // React logs the caught error (twice, dev double-render) — keep the test
    // output clean; componentDidCatch's own log is asserted below.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it("renders children when nothing throws", () => {
    act(() => {
      root.render(
        <ChartErrorBoundary chartItemId="chart-1" opacity={1}>
          <span data-testid="chart-child">ok</span>
        </ChartErrorBoundary>,
      );
    });
    expect(host.querySelector('[data-testid="chart-child"]')).not.toBeNull();
    expect(host.querySelector('[data-chart-error="true"]')).toBeNull();
  });

  it("a throwing child renders the error placeholder (canvas stays alive) + logs the item id", () => {
    act(() => {
      root.render(
        <ChartErrorBoundary chartItemId="chart-1" opacity={0.5}>
          <Bomb />
        </ChartErrorBoundary>,
      );
    });
    const fallback = host.querySelector('[data-chart-error="true"]') as HTMLElement | null;
    expect(fallback).not.toBeNull();
    expect(fallback?.textContent).toContain("차트 — 표시 오류");
    expect(fallback?.style.opacity).toBe("0.5");
    // the diagnostic log carries the failing item's id
    expect(
      vi
        .mocked(console.error)
        .mock.calls.some((args) => typeof args[0] === "string" && args[0].includes("chart-1")),
    ).toBe(true);
  });
});
