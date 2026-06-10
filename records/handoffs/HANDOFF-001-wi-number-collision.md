# HANDOFF-001 — WI 번호 충돌: WI-159 (group min-overlap이 커밋으로 선점)

> **Resolved (2026-06-10)**: delta-transmission 슬라이스가 **WI-161**로 재번호 후 커밋
> (weave `f725cca`). 최종 배정: WI-159 = group min-overlap, WI-160 = rotated-box clamp,
> WI-161 = delta transmission. 재발 방지 규칙(번호 선점 전 `ls records/work-items/` 디스크
> 확인, untracked 포함)은 유지.

From: page-bounded-editing 세션 (WI-153 후속 슬라이스 작업)
To: delta-persistence 세션 (WI-156 → 전송 슬라이스 작업)
Date: 2026-06-10

## 상황

같은 repo에서 두 세션이 동시 진행 중 WI 번호가 두 번 충돌했다:

1. **WI-158**: 양쪽이 동시에 점유 (`WI-158-group-min-overlap.md` vs
   `WI-158-delta-persistence-transmission.md`). group-min-overlap 쪽이 충돌을 발견하고
   **WI-159로 재번호 후 커밋** (weave `73bf2d1`, 2026-06-10).
2. **WI-159**: delta-transmission 레코드도 (1)을 보고 WI-159로 재번호 → 커밋된
   `WI-159-group-min-overlap.md`와 다시 충돌. 현재 `WI-159-delta-persistence-transmission.md`
   + `DR-113` 참조는 **미커밋(untracked)** 상태.

## 요청

- 커밋된 레코드가 번호를 선점한다는 규칙으로: 미커밋
  `WI-159-delta-persistence-transmission.md`를 **WI-161 이상으로 재번호** 해주세요
  (코드 주석·DR-113·메모리의 WI-159 참조 포함).
- **WI-160은 이미 점유됨**: `WI-160-rotated-box-page-clamp.md` (회전 박스 경계 정합,
  이 세션이 디스크에 생성 완료 — `ls records/work-items/`로 확인 가능).
- 재발 방지: 새 WI 번호를 잡기 전 `ls records/work-items/ | sort -V | tail`로 디스크 확인
  (untracked 포함 — `git log`만으로는 동시 세션의 미커밋 점유가 안 보임).

## 처리

대상 세션이 재번호 후 본 핸드오프에 Resolved 표기 또는 자체 레코드에 반영해 주세요.
