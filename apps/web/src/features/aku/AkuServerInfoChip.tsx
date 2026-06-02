// Header chip that surfaces the agent-server's announced config (mode + the model /
// speed knobs it is actually running with). The server sends this on connect over the
// reverse-MCP `ctl` channel (small-think serverInfo); it is DESCRIPTIVE only — never
// secrets. Design System Triage: REUSE — Badge (chip) + Tooltip (hover detail) from
// @weave/design-system; no new primitive/token.

import type { ServerInfo } from "@agocraft/agent-client";
import { Badge, Tooltip } from "@weave/design-system";
import type { JSX, ReactNode } from "react";

/** Drop the vendor prefix / trailing date so a model id fits a chip
 *  ("claude-sonnet-4-6" → "sonnet-4-6", "claude-haiku-4-5-20251001" → "haiku-4-5"). */
function shortModel(model: string): string {
  return model.replace(/^claude-/, "").replace(/-\d{6,}$/, "");
}

/** Ordered (label, value) rows for the hover tooltip — only the fields the server
 *  actually reported (absent = the server's default, so we don't invent a value). */
function detailRows(info: ServerInfo): ReadonlyArray<readonly [string, string]> {
  const rows: Array<readonly [string, string]> = [["mode", info.mode]];
  const push = (label: string, value: string | number | boolean | undefined): void => {
    if (value !== undefined) rows.push([label, String(value)]);
  };
  push("model", info.model);
  push("fallback", info.fallbackModel);
  push("effort", info.effort);
  push("thinking", info.thinking);
  push("max turns", info.maxTurns);
  push("max tokens", info.maxTokens);
  push("critique", info.critiquePasses);
  push("profile", info.profile);
  if (info.harnessExclude !== undefined && info.harnessExclude.length > 0) {
    rows.push(["harness excl.", info.harnessExclude.join(", ")]);
  }
  push("idle timeout", info.idleTimeoutMs !== undefined ? `${info.idleTimeoutMs}ms` : undefined);
  push("batch hint", info.batchHint);
  push("session", info.sessionId);
  return rows;
}

/** Compact chip label: mode, plus the short model when known (e.g. "byo-ssh · sonnet-4-6"). */
function chipLabel(info: ServerInfo): string {
  return info.model !== undefined && info.model !== ""
    ? `${info.mode} · ${shortModel(info.model)}`
    : info.mode;
}

export function AkuServerInfoChip({
  serverInfo,
}: {
  serverInfo: ServerInfo | null;
}): JSX.Element | null {
  if (serverInfo === null) return null;
  const tooltip: ReactNode = (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px] leading-4">
      {detailRows(serverInfo).map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-[color:var(--text-soft)]">{label}</dt>
          <dd className="font-mono text-[color:var(--text-strong)] break-all">{value}</dd>
        </div>
      ))}
    </dl>
  );
  return (
    <Tooltip content={tooltip} side="bottom" align="end">
      <Badge
        variant="info"
        size="xs"
        className="max-w-[140px] truncate cursor-default"
        data-testid="aku-server-info"
      >
        {chipLabel(serverInfo)}
      </Badge>
    </Tooltip>
  );
}
