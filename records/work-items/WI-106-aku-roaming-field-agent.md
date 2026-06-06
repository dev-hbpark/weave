# WI-106 — 아쿠 로밍 출동: 편집 프레임 위치로 이동 + 작업 애니메이션

| Field | Value |
|---|---|
| Status | Superseded by WI-107 (2026-06-06) — separate field-agent caused "two Akus"; unified into a single roaming launcher. Roam logic migrated to `useAkuRoam`. |
| Owner | hbpark |
| Feasibility | FR-022 (FEASIBLE) |
| Decision | DR-073 |
| Relates | WI-104(엔진/스프라이트) · WI-105(인터랙션 락) · use-weave-editor(changeStream) |

## Problem (operator, 2026-06-06)

아쿠가 편집이 일어나는 프레임 위치(랜덤)에 출동해 애니메이션으로 작업을 표현. 선택:
① 로밍(별도 출동 마스코트) · ② 활발(매 편집 랜덤) · ③ 경량(canvas2d).

## Change

- `apps/web/src/features/aku/field-agent-target.ts` — 순수 위치 로직:
  `roamPointInRect(rect, size, vw, vh, rng)`(rect 안 랜덤 점 → 뷰포트 클램프),
  `travelDir(prevX, nextX)`(이동 방향). 단위검증 대상.
- `apps/web/src/features/aku/AkuFieldAgent.tsx` — `{editor, active}`. active(streaming) 동안
  `editor.changeStream`(origins user-command) 구독 → `change.itemId` 디바운스(180ms) →
  `[data-frame-id]` rect → 랜덤 점으로 `transform` 트랜지션 이동(방향별 move-left/right
  스프라이트) → 도착 후 editing 스프라이트. canvas2d 경량 엔진. `pointer-events:none`,
  z-48, reduced-motion 시 미렌더.
- `AkuAssistant.tsx` — body portal에 `<AkuFieldAgent editor={editor} active={status==="streaming"} />`.

## Acceptance

- [x] streaming 중 편집 발생 시 해당 프레임 화면 rect 부근(랜덤)으로 아쿠가 이동 + 애니메이션.
- [x] 대상 변경 시에만 이동(버스트 디바운스), 화면 밖/미렌더는 스킵, 뷰포트 클램프.
- [x] 런처/패널 불변(별도 로밍), pointer-events 없음(락 스크림 안 막음), reduced-motion 시 없음.
- [x] producer(에디터/에이전트) 무수정 — changeStream 구독만.

## Verification (SVL gate — 2026-06-06)

- typecheck 0 · biome clean(변경 파일).
- 단위 `field-agent-target.test.ts`: rect 내 랜덤 점이 rect 범위 + 뷰포트 클램프 안에 듦
  (주입 rng) · `travelDir` dx 부호 매핑 · 작은/화면밖 rect 클램프.
- **통합(강제 active 임시 e2e → 원복)**: 아이템 편집(`editor.exec`) → `[data-aku-field]`가
  해당 `[data-frame-id]` rect 근처로 이동(transform 변화) 확인 · 스크린샷 육안 확인.
- 스트리밍 전체 turn은 라이브 에이전트 서버 의존(기존 패턴).

## Follow-up — 캔버스/스프라이트 비율 정합 (2026-06-06)

스프라이트 프레임이 portrait(362×724 ≈ 1:2)인데 렌더 박스가 정사각이라 contain-fit 좌우
여백이 컸음 → 렌더 박스를 **스프라이트 비율(1:2)에 맞춤**:
- 런처(WI-104): `w-30 h-30`(120²) → `w-15 h-30`(60×120, ratio 0.5) · rounded-lg.
- 필드에이전트: `ROAM_SIZE`(96²) → `ROAM_W 72 × ROAM_H 144`(0.5). `roamPointInRect`를
  폭·높이 분리로 일반화(단위 갱신).
- 검증: 런처 boundingBox 60×120(ratio 0.5) + 스크린샷으로 캐릭터가 박스를 꽉 채움(여백/찌그러짐
  없음) 확인 · tsc/biome 클린 · 아쿠 단위 65/65 · e2e 11/11.

See FR-022, DR-073.
