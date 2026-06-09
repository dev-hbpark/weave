// 아쿠 (Aku) — resume-on-reconnect decision (WI-151 / DR-109).
//
// PROBLEM: dim (AkuInteractionLock) and roaming (useAkuRoam) are both gated on a
// SINGLE local boolean — `status === "streaming"` in useAkuAgent. A live-socket
// reconnect keeps that boolean in memory, so dim+roaming persist. But a BROWSER
// REFRESH (or any full unmount) resets `status` to "idle", even though the server
// keeps an interrupted run alive for its grace window and re-runs it on reconnect
// (WI-034). The agent resumes editing the document, yet dim+roaming stay OFF.
//
// SIGNAL: the server pushes `queueStatus.jobs` = THIS client's own in-flight jobs
// (running + queued), keyed by the grace-stable clientId (`weave-client:<designId>`).
// A user Stop deletes the request from the server's `inflight` set, so a stopped
// run NEVER appears in `jobs`. Therefore an own job present == "a run is active and
// the user did NOT stop it" — exactly the requirement.
//
// DECISION: on a fresh page session the user has not yet driven the agent
// (`engaged === false`). If the server reports an own job while we sit idle and
// un-engaged, that job was started by a PRIOR page session and resumed by the
// server → ADOPT it (flip status to "streaming", lighting dim+roaming through the
// existing gate). When the adopted job leaves the queue (done / cancelled / grace
// expired) → RELEASE back to idle. A LOCAL run sets `engaged`, so it is owned by
// runTurn's lifecycle and never adopted/released here — the two never fight, and
// the tail of a just-finished local run is not mistaken for an orphan to adopt.

export type ResumeAction = "adopt" | "release" | "none";

export interface ResumeDecisionInput {
  /** `queueStatus.jobs.length` — this client's own running+queued jobs (0 if none/null). */
  readonly ownJobCount: number;
  /** Current AkuStatus — "idle" | "streaming". */
  readonly status: "idle" | "streaming";
  /** The user has driven the agent THIS page session (submit / stop / clear). Once true,
   *  every job is owned by the local run lifecycle, so adoption is disabled. */
  readonly engaged: boolean;
  /** We currently hold a server-adopted (resumed) run. */
  readonly resumed: boolean;
}

/** Decide whether to ADOPT a server-resumed run (light dim+roaming), RELEASE a
 *  previously-adopted run that has finished, or do nothing. Pure. */
export function decideResume(input: ResumeDecisionInput): ResumeAction {
  const { ownJobCount, status, engaged, resumed } = input;
  if (ownJobCount > 0 && status === "idle" && !engaged && !resumed) return "adopt";
  if (resumed && ownJobCount === 0) return "release";
  return "none";
}
