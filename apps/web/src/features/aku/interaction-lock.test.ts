// WI-105 / DR-072 — interaction-lock mechanics (jsdom).

import { afterEach, describe, expect, it } from "vitest";
import { installInteractionLock, isAkuSurface } from "./interaction-lock.js";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("isAkuSurface", () => {
  it("matches inside the panel/launcher, not elsewhere", () => {
    document.body.innerHTML = `<div data-aku-panel><button id="p"></button></div><div data-aku-launcher id="l"></div><div id="x"></div>`;
    expect(isAkuSurface(document.getElementById("p"))).toBe(true);
    expect(isAkuSurface(document.getElementById("l"))).toBe(true);
    expect(isAkuSurface(document.getElementById("x"))).toBe(false);
    expect(isAkuSurface(null)).toBe(false);
  });
});

describe("installInteractionLock", () => {
  it("sets #root inert and reverses on cleanup", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const cleanup = installInteractionLock({ rootEl: root, isExempt: isAkuSurface });
    expect(root.hasAttribute("inert")).toBe(true);
    cleanup();
    expect(root.hasAttribute("inert")).toBe(false);
  });

  it("blocks keydown from non-exempt targets, lets the Aku surface through", () => {
    document.body.innerHTML = `<div data-aku-panel><input id="in" /></div><div id="out" tabindex="0"></div>`;
    const root = document.createElement("div");
    document.body.appendChild(root);
    const reached: string[] = [];
    const appListener = (e: Event): void => {
      reached.push((e.target as Element).id);
    };
    window.addEventListener("keydown", appListener); // bubble-phase, like the editor hotkeys

    const cleanup = installInteractionLock({ rootEl: root, isExempt: isAkuSurface });
    document
      .getElementById("out")
      ?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true }));
    document
      .getElementById("in")
      ?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true }));

    expect(reached).toEqual(["in"]); // "out" blocked at capture; "in" (panel) passed

    cleanup();
    // after cleanup the guard is gone — both reach the app listener again
    document
      .getElementById("out")
      ?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true }));
    expect(reached).toEqual(["in", "out"]);
    window.removeEventListener("keydown", appListener);
  });

  it("blocks wheel (zoom) from non-exempt targets", () => {
    document.body.innerHTML = `<div id="out"></div>`;
    const root = document.createElement("div");
    document.body.appendChild(root);
    let appWheel = 0;
    const appListener = (): void => {
      appWheel += 1;
    };
    window.addEventListener("wheel", appListener);

    const cleanup = installInteractionLock({ rootEl: root, isExempt: isAkuSurface });
    document
      .getElementById("out")
      ?.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true }));
    expect(appWheel).toBe(0);

    cleanup();
    window.removeEventListener("wheel", appListener);
  });
});
