# WI-152 — 전역 공유 큐 뷰 소비 (모든 클라이언트의 작업을 큐 칩에 표시 + own 필터링)

Status: **Done** (코드/단위 검증 완료 · 배포 후 멀티클라이언트 확인 권장)
Owner: hbpark
Updated: 2026-06-09
관련: 생산측 [small-think WI-035](../../small-think/records/work-items/WI-035-global-shared-queue-view.md)/[DR-056](../../small-think/records/decisions/DR-056-global-shared-queue-view.md) · [DR-110](../decisions/DR-110-global-queue-view-consume.md) · 보완 [WI-151](WI-151-aku-resume-dim-roaming-on-reconnect.md)(resume — jobs가 전역이 되며 own 필터 필요)

## Problem

small-think WI-035로 `queueStatus.jobs`가 **전역**(모든 클라이언트의 running+queued, foreign는 `own:false`로
익명화)이 된다. weave 소비측을 맞춰: (1) 큐 칩이 전역 목록을 own/타인 구분해 표시하고, (2) 기존에 `jobs`를
"own-only"로 가정하던 코드가 **own 필터**를 쓰도록 고친다(안 그러면 남의 작업에 딤이 켜지거나 오라벨/오취소).

## 변경 (touch points)

- **수정** `apps/web/src/features/aku/AkuQueueChip.tsx`
  - `ownJob`: `jobs.filter(j => j.own)` 후 running 우선 → 내 작업만 칩 라벨/취소 대상.
  - tooltip: `orderedJobs`(own 먼저)로 **전체 작업** 행 표시 — own="내 작업"(강조), foreign="다른 작업"(dim).
    foreign는 state+position만(익명). 취소 버튼은 own에만.
- **수정** `apps/web/src/features/aku/agent/use-aku-agent.ts`
  - resume 효과 `ownJobCount`: `queueStatus?.jobs.filter(j => j.own).length`(전역 중 내 것만 → false-adopt 방지).
  - `stop()` adopted-cancel 루프: `if (job.own)`만 cancel(foreign "other:N"은 절대 취소 안 함).
- **수정** `apps/web/src/features/aku/agent/agent-resume.ts` — 주석/`ownJobCount` 설명을 "전역 jobs + own 필터"로 갱신(순수 함수 시그니처 무변경).

와이어 타입(`QueueStatus.own:boolean`)은 이미 존재 → **재벤더 불필요**. 구 서버(own-only)와도 호환(필터 no-op).

## 검증

- `npx vitest run src/features/aku` → 161 passed(resume 9 포함). 타입체크 0. biome 클린.
- **남은 확인**: 2 클라이언트 동시 접속 → 한쪽 작업이 다른 쪽 칩 tooltip에 "다른 작업"으로 보이고, 내 딤/취소는
  내 작업에만 적용되는지.

## 배포 순서

**weave 먼저(또는 동시) → small-think**. 신규 weave는 구 서버와 호환되므로 먼저 배포해도 안전하고, 구 weave +
신 서버 조합의 false-adopt/오라벨을 피한다(WI-035 배포 순서 참조).

## 한계 / 후속

- 큐 칩은 hover tooltip 목록(현행 패턴 REUSE). 작업을 지속 "모니터링"하려면 click Popover로의 승격이 더
  나음(design-system Popover 존재) — 후속 폴리시.
