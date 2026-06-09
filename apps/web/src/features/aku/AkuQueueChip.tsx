// Header chip that surfaces the agent-server's live job queue (WI-034): how many design
// jobs are running / waiting server-wide, and — when this client has a job in flight — its
// own state ("실행 중" / "대기 N번째") with a cancel affordance. The server pushes this on the
// reverse-MCP `ctl` channel (small-think queueStatus); DESCRIPTIVE only (own task ids the
// client already knows). Design System Triage: REUSE — Badge + Tooltip + IconButton from
// @weave/design-system (same pattern as AkuServerInfoChip); no new primitive/token.

import type { QueueStatus } from "@agocraft/agent-client";
import { Badge, IconButton, Tooltip } from "@weave/design-system";
import type { JSX, ReactNode } from "react";

type BadgeVariant = "default" | "accent" | "success" | "warning" | "info";

/** The receiving client's own job (the server only sends this client's own jobs in `jobs`). */
function ownJob(status: QueueStatus): QueueStatus["jobs"][number] | undefined {
  // Prefer a running job, else the earliest queued one.
  return status.jobs.find((j) => j.state === "running") ?? status.jobs[0];
}

function chipLabel(status: QueueStatus, own: QueueStatus["jobs"][number] | undefined): string {
  if (own !== undefined) {
    return own.state === "running" ? "실행 중" : `대기 ${own.position ?? "?"}번째`;
  }
  // No job of ours, but the server is busy — show the load.
  return `대기열 ${status.running}·${status.queued}`;
}

function chipVariant(own: QueueStatus["jobs"][number] | undefined): BadgeVariant {
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
      {queueStatus.jobs.map((j) => (
        <div key={j.id} className="contents">
          <dt className="text-[color:var(--text-soft)]">내 작업</dt>
          <dd className="font-mono text-[color:var(--text-strong)]">
            {j.state === "running" ? "실행 중" : `대기 ${j.position ?? "?"}번째`}
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
