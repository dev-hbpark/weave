import { describe, expect, it } from "vitest";
import { decideResume } from "./agent-resume.js";

describe("decideResume (WI-151 / DR-109)", () => {
  // ADOPT — a fresh page session (not engaged), idle, with a server-resumed own job.
  it("ADOPTS an orphan run after a refresh (own job, idle, not engaged, not resumed)", () => {
    expect(decideResume({ ownJobCount: 1, status: "idle", engaged: false, resumed: false })).toBe(
      "adopt",
    );
  });

  it("ADOPTS a merely-QUEUED resumed job too (jobs counts running + queued)", () => {
    // ownJobCount > 0 regardless of running vs queued — dim while queued matches a
    // normal local submit, which shows streaming immediately while waiting.
    expect(decideResume({ ownJobCount: 2, status: "idle", engaged: false, resumed: false })).toBe(
      "adopt",
    );
  });

  // NO ADOPT — once the user has driven the agent this session, jobs are local-owned.
  it("does NOT adopt after the user engaged this session (local run lifecycle owns it)", () => {
    expect(decideResume({ ownJobCount: 1, status: "idle", engaged: true, resumed: false })).toBe(
      "none",
    );
  });

  it("does NOT adopt the tail of a finished LOCAL run (engaged true, job still draining)", () => {
    // The exact false-dim case: runTurn set status idle but queueStatus hasn't cleared.
    expect(decideResume({ ownJobCount: 1, status: "idle", engaged: true, resumed: false })).toBe(
      "none",
    );
  });

  it("does NOT adopt when there is no own job", () => {
    expect(decideResume({ ownJobCount: 0, status: "idle", engaged: false, resumed: false })).toBe(
      "none",
    );
  });

  it("does NOT re-adopt while already streaming (avoids churn)", () => {
    expect(
      decideResume({ ownJobCount: 1, status: "streaming", engaged: false, resumed: true }),
    ).toBe("none");
  });

  // RELEASE — an adopted run that has left the queue (done / cancelled / grace expired).
  it("RELEASES an adopted run when its job leaves the queue", () => {
    expect(
      decideResume({ ownJobCount: 0, status: "streaming", engaged: false, resumed: true }),
    ).toBe("release");
  });

  it("keeps an adopted run while its job is still present", () => {
    expect(
      decideResume({ ownJobCount: 1, status: "streaming", engaged: false, resumed: true }),
    ).toBe("none");
  });

  it("does not release when nothing was adopted", () => {
    expect(decideResume({ ownJobCount: 0, status: "idle", engaged: false, resumed: false })).toBe(
      "none",
    );
  });
});
