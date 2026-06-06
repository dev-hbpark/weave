// WI-103 / DR-070 D3 — resolveAkuMood rule-table coverage. The priority order
// (connection trouble > live work > idle moods) and the activity-substring
// keying are the load-bearing logic; this locks them down.

import { describe, expect, it } from "vitest";
import { type AkuMoodInput, moodIntensity, resolveAkuMood } from "./mood.js";

const base: AkuMoodInput = {
  status: "idle",
  connectionState: "open",
  activity: null,
  celebrate: false,
  looking: false,
  sleeping: false,
};

describe("resolveAkuMood", () => {
  it("defaults to idle when nothing is happening", () => {
    expect(resolveAkuMood(base)).toBe("idle");
  });

  it("maps the streaming '생각' caption to thinking", () => {
    expect(resolveAkuMood({ ...base, status: "streaming", activity: "생각 중…" })).toBe("thinking");
  });

  it("maps the streaming '정리' caption to finalizing", () => {
    expect(resolveAkuMood({ ...base, status: "streaming", activity: "정리 중…" })).toBe(
      "finalizing",
    );
  });

  it("maps any other streaming caption (incl. tool-authored) to working", () => {
    expect(resolveAkuMood({ ...base, status: "streaming", activity: "배경색 변경 적용 중…" })).toBe(
      "working",
    );
    expect(resolveAkuMood({ ...base, status: "streaming", activity: null })).toBe("working");
  });

  it("maps connecting / reconnecting to the connecting mood", () => {
    expect(resolveAkuMood({ ...base, connectionState: "connecting" })).toBe("connecting");
    expect(resolveAkuMood({ ...base, connectionState: "reconnecting" })).toBe("connecting");
  });

  it("maps a broken connection to confused", () => {
    expect(resolveAkuMood({ ...base, connectionState: "error" })).toBe("confused");
    expect(resolveAkuMood({ ...base, connectionState: "closed" })).toBe("confused");
  });

  it("ranks connection trouble ABOVE live work", () => {
    // error + streaming → confused wins (connection rule is first)
    expect(
      resolveAkuMood({
        ...base,
        connectionState: "error",
        status: "streaming",
        activity: "생각 중…",
      }),
    ).toBe("confused");
  });

  it("ranks live work ABOVE idle transient moods", () => {
    expect(
      resolveAkuMood({ ...base, status: "streaming", activity: "생각 중…", celebrate: true }),
    ).toBe("thinking");
  });

  it("orders idle transients celebrate > sleeping > looking", () => {
    expect(resolveAkuMood({ ...base, celebrate: true, sleeping: true, looking: true })).toBe(
      "celebrating",
    );
    expect(resolveAkuMood({ ...base, sleeping: true, looking: true })).toBe("sleeping");
    expect(resolveAkuMood({ ...base, looking: true })).toBe("looking");
  });
});

describe("moodIntensity", () => {
  it("returns a 0..1 vigor for every mood", () => {
    for (const mood of [
      "idle",
      "connecting",
      "thinking",
      "working",
      "finalizing",
      "celebrating",
      "confused",
      "sleeping",
      "looking",
      "dragging",
    ] as const) {
      const v = moodIntensity(mood);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
