// Migration result Banner. Surfaces the outcome of the retro-active
// inline-media migration that `useMigrateInlineMedia` runs on mount.
//
// `idle` and `running` are intentionally suppressed (no banner): most
// migrations resolve within a second or two — surfacing a "running"
// banner would just flash. Once the cloud round-trip lands, the host
// shows a `done` (success) or `failed` (post-upload error) banner the
// user can dismiss. The banner does NOT auto-close — operational
// outcomes need explicit acknowledgement.
//
// Dismissal is per-mount state (not persisted): re-opening the same
// design after a migration is not currently a scenario — the source
// retains its inline data URLs until the user opens the migrated
// design separately. If retro-active dismiss persistence is ever
// needed, lift the `dismissed` state into a host store keyed on the
// source design id and the migration outcome id.

import { Banner } from "@weave/design-system";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { MigrationStatus } from "./use-migrate-inline-media.js";

export interface MigrationResultBannerProps {
  readonly status: MigrationStatus;
}

export function MigrationResultBanner({ status }: MigrationResultBannerProps): JSX.Element | null {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  if (status.kind === "idle" || status.kind === "running") return null;

  if (status.kind === "done") {
    return (
      <Banner
        tone="announcement"
        headline={`${status.uploaded}개 이미지를 서버로 옮겼어요`}
        onDismiss={() => setDismissed(true)}
        dismissLabel="닫기"
        data-testid="migration-result-banner"
      >
        <span>
          현재 디자인의 인라인 이미지가 서버 리소스로 변환되어{" "}
          <strong>새 디자인 "(migrated)"</strong> 로 저장됐어요. 원본은 그대로 유지됩니다.
        </span>
        <div className="mt-1">
          <Link
            to={`/design/${status.newDesignId}`}
            data-testid="migration-result-open"
            className="text-sm font-medium text-[color:var(--accent)] hover:text-[color:var(--accent-strong)] no-underline hover:underline"
          >
            새 디자인 열기 →
          </Link>
        </div>
      </Banner>
    );
  }

  // status.kind === "failed"
  const headline =
    status.uploaded === 0
      ? "이미지 마이그레이션에 실패했어요"
      : `이미지 ${status.uploaded}/${status.total}개 업로드 후 저장에 실패했어요`;
  return (
    <Banner
      tone="info"
      headline={headline}
      onDismiss={() => setDismissed(true)}
      dismissLabel="닫기"
      data-testid="migration-result-banner"
      data-status="failed"
    >
      네트워크 상태를 확인한 뒤 페이지를 다시 열면 자동으로 재시도합니다. 원본 디자인은 그대로
      유지됩니다.
    </Banner>
  );
}
