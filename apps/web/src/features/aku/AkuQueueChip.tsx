// Header chip that surfaces the agent-server's live job queue (WI-034 / WI-035): how many design
// jobs are running / waiting server-wide, and — in a hover list — EVERY client's jobs (a shared
// queue, WI-035), with this client's own job ("실행 중" / "대기 N번째") carrying a cancel affordance.
// The server pushes this on the reverse-MCP `ctl` channel (small-think queueStatus); other
// clients' jobs are anonymized (state + position only, no id/owner/content). Design System Triage:
// REUSE — Badge + Tooltip + IconButton from @weave/design-system (same pattern as AkuServerInfoChip);
// no new primitive/token.

import type { QueueStatus } from "@agocraft/agent-client";
import { Badge, IconButton, Tooltip } from "@weave/design-system";
import type { JSX, ReactNode } from "react";

type BadgeVariant = "default" | "accent" | "success" | "warning" | "info";
type Job = QueueStatus["jobs"][number];

/** THIS client's own job (jobs is a GLOBAL list as of WI-035 — filter to own first). */
function ownJob(status: QueueStatus): Job | undefined {
  const mine = status.jobs.filter((j) => j.own);
  // Prefer a running job, else the earliest queued one.
  return mine.find((j) => j.state === "running") ?? mine[0];
}

/** Own jobs first, then other clients' — preserves queue order within each group. */
function orderedJobs(status: QueueStatus): ReadonlyArray<Job> {
  return [...status.jobs].sort((a, b) => Number(b.own) - Number(a.own));
}

function jobStateLabel(j: Job): string {
  return j.state === "running" ? "실행 중" : `대기 ${j.position ?? "?"}번째`;
}

function chipLabel(status: QueueStatus, own: Job | undefined): string {
  if (own !== undefined) return jobStateLabel(own);
  // No job of ours, but the server is busy — show the shared load.
  return `대기열 ${status.running}·${status.queued}`;
}

function chipVariant(own: Job | undefined): BadgeVariant {
  if (own === undefined) return "default";
  return own.state === "running" ? "info" : "warning";
}

export function AkuQueueChip({
  queueStatus,
  onCancel,
}: {
  queueStatus: QueueStatus | null;
  onCancel: (taskId: string) => void;
}): JSX.Element | null {
  // Render nothing when the server is idle and we have no job — keep the header uncluttered.
  if (queueStatus === null) return null;
  const own = ownJob(queueStatus);
  if (queueStatus.running === 0 && queueStatus.queued === 0 && own === undefined) return null;

  const tooltip: ReactNode = (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px] leading-4">
      <div className="contents">
        <dt className="text-[color:var(--text-soft)]">실행 중</dt>
        <dd className="font-mono text-[color:var(--text-strong)]">{queueStatus.running}</dd>
      </div>
      <div className="contents">
        <dt className="text-[color:var(--text-soft)]">대기</dt>
        <dd className="font-mono text-[color:var(--text-strong)]">{queueStatus.queued}</dd>
      </div>
      {orderedJobs(queueStatus).map((j) => (
        <div key={j.id} className="contents">
          <dt
            className={j.own ? "text-[color:var(--text-strong)]" : "text-[color:var(--text-soft)]"}
          >
            {j.own ? "내 작업" : "다른 작업"}
          </dt>
          <dd
            className={
              j.own
                ? "font-mono text-[color:var(--text-strong)]"
                : "font-mono text-[color:var(--text-soft)]"
            }
          >
            {jobStateLabel(j)}
          </dd>
        </div>
      ))}
    </dl>
  );

  return (
    <span className="inline-flex items-center gap-1">
      <Tooltip content={tooltip} side="bottom" align="end">
        <Badge
          variant={chipVariant(own)}
          size="xs"
          className="cursor-default"
          data-testid="aku-queue"
        >
          {chipLabel(queueStatus, own)}
        </Badge>
      </Tooltip>
      {own !== undefined && (
        <IconButton
          variant="danger"
          size="sm"
          aria-label="이 작업 취소"
          onClick={() => onCancel(own.id)}
          data-testid="aku-queue-cancel"
        >
          ✕
        </IconButton>
      )}
    </span>
  );
}
