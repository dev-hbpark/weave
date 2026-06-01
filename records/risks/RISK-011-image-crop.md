# RISK-011 — Interactive image crop risk (GO WITH CONDITIONS)

## Metadata

| Field | Value |
|---|---|
| ID | RISK-011 |
| WI | WI-074 |
| Date | 2026-06-02 |
| Owner | hbpark |
| Verdict | **GO WITH CONDITIONS** |

## Scope

DR-029의 인라인 크롭 모드 + `SelectionLayer` 핸들 위임 + `weave.image.setCrop` +
**크롭 회전(D6, 캔바식 straighten)**. 회전은 agocraft `ImageCrop.rotation` 신설 + 고아
`ImageAttrs.rotation` 제거를 수반 → **크로스프로젝트 + 재벤더**(HANDOFF-021). src 미변경.

## Risk inventory

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | 크롭 모드 `overflow:visible` 전체 이미지가 인접 frame/item 위로 넘쳐 콘텐츠 가림 | Med | Med | 크롭 중 해당 이미지 z 상승 + 바깥 dim 마스크; 단일 활성 크롭(`useIsCropping`); 확정/취소 모든 경로에서 즉시 `overflow:hidden` 복귀(R4). |
| 2 | pan/zoom 중 핸들(SelectionLayer RAF 투영) ↔ 인라인 이미지(design 좌표) 드리프트 | Med | Med | 이미지·윈도우를 design 좌표 인라인으로 일원화(투영 한 곳), 핸들만 기존 오버레이 재사용; zoom≠1 상태 크롭 e2e. |
| 3 | 크롭 `resolveHandles`가 일반 resize/rotate 핸들과 동시 표시/충돌 | Med | Med | cropMode 시 호출부(`NestedFrame`)가 크롭 핸들만 반환(상호배타), 일반 핸들 미노출. `SelectionLayer` 내부 모드 무지(Rule 6). |
| 4 | cropMode가 텍스트 `isEditing` 등 다른 편집 모드와 동시 활성 | Low | Med | `useIsCropping`/`useIsTextEditing` 상호 배제, 더블클릭 진입이 도메인별 단일. |
| 5 | 전역 게이트 누락 소비처 → 크롭 중 마퀴/핫키 오작동(삭제·이동 등 데이터 변형) | Med | High | 마퀴·러버밴드·`editor-hotkeys` **세 소비처 명시 배선** + 각 게이트 e2e. `useIsCropping`이 단일 소스. |
| 6 | invalid crop(`w·h=0`, `x+w>1`)로 렌더 NaN/이미지 사라짐 | Low | Med | 커맨드 클램프+`invalid-input`, UI 드래그 단계 클램프(`0≤x`, `x+w≤1` …). |
| 7 | cover 이중변환으로 "확정 결과 ≠ 모드 중 미리보기" 혼동(종횡비 불일치 이미지) | Med | Med | v1은 **모드 내 일치 보장**(DR-029 D1) 명시; 원본 픽셀 정밀 크롭은 후속. 종횡비 동일 케이스는 일치. |
| 8 | full attrs 재구성 규약 위반 → 크롭 patch가 opacity/shadow/fit 덮어씀 | Low | High | `cropRatio`만 교체한 **완전한** ImageAttrs 재구성([[feedback_weave_item_attrs_full_replace]]); 크롭 후 타 속성 보존 e2e. |
| 9 | 외부 이미지 콘텐츠(SSRF/mixed content) 신규 노출 | Low | Low | 크롭은 `src` 미변경 — 기존 이미지 ingestion/표시 정책 그대로. 신규 표면 아님. |
| 10 | 익명 전역 공유 워크스페이스에서 한 사용자의 크롭이 전원에게 즉시 반영 | Low | Low | 기존 공유 패러다임과 동일(모든 편집이 그러함). 크롭 고유 리스크 아님 — History/Undo로 복원 가능. |
| 11 | (회전) cover-zoom 오산 → 회전 시 크롭 윈도우에 빈 모서리(투명) 노출 | Med | Med | `coverZoom(θ, imgAspect, windowAspect)` = 회전 bbox가 윈도우를 덮는 최소 배율; 경계 θ(±45°)·극단 종횡비 유닛테스트 + 시각 e2e. |
| 12 | (회전) 고아 `ImageAttrs.rotation` 제거가 직렬화/타 코드 파손 | Low | Med | 팩토리·렌더러·weave 미사용 + 미기록 확정(탐색). agocraft가 round-trip 무손실 테스트로 게이트(마이그레이션 불요). |
| 13 | (회전) 재벤더 절차로 다른 weave 소비처 회귀 | Low | Med | core-only repack(검증된 우회, FR-013 선례); 재벤더 후 weave 전체 유닛+e2e+build green 게이트. |
| 14 | (회전) frame 회전 ↔ 크롭 콘텐츠 회전 사용자 혼동 | Med | Low | 크롭 모드 중 frame rotate 핸들 미노출, straighten dial은 크롭 컨트롤바에 한정(D4/D6 상호배타). |

## Governance / privacy / legal

신규 개인정보·법적 노출 없음. 사용자 자기 콘텐츠의 표시 영역 변경이며 src·저장·전송 경로
불변. 전역 공유 가시성은 기존 워크스페이스 패러다임(변동 없음).

## Conditions

1. **Build acceptance 전부 PASS**: typecheck + unit + prod build + e2e(`image-crop.spec.ts`
   진입/확정/Undo/취소/에이전트).
2. **게이트 회귀 0**: 기존 마퀴·러버밴드·핫키 e2e 유지 + 크롭 중 비활성 e2e 추가(R5).
3. **속성 보존 검증**: 크롭 후 opacity/shadow/fit/borderRadius 불변 e2e(R8).
4. **overflow 복귀 보장**: 확정·ESC·바깥클릭 모든 이탈 경로에서 `overflow:hidden` 복귀 +
   z 원복(R1) — self-verification 브라우저 관측.
5. **(회전) agocraft 게이트**: `ImageCrop.rotation` 추가 + `ImageAttrs.rotation` 제거가 agocraft
   round-trip 무손실 테스트 통과 + 재벤더 후 weave 전체 유닛/e2e/build green(R12·R13). cover-zoom
   경계 θ 유닛테스트(R11).

## Verdict

**GO WITH CONDITIONS** — 14 risk 중 다수가 설계로 완화(인라인 좌표 일원화, 상호배타 핸들,
단일 게이트, src 불변). 잔여 고임팩트는 R5(게이트 누락)·R8(attrs 규약)으로 조건의 e2e 게이트로
박제. R7(cover 이중변환)은 v1 범위 한정 수용. **회전(R11–R14)은 agocraft 변경+재벤더를 끌어와
크로스프로젝트 리스크가 0→Low로 상승** — agocraft round-trip 무손실 + 재벤더 후 weave 회귀 0이
추가 조건(C5). 회전 미포함 비회전 크롭은 여전히 weave-local로 선출시 가능(단계 분리).

## Links

- WI-074, FR-014, DR-029, `features/image-crop/ENGINEERING_PLAN.md`.
- 선례: RISK-009(corner-radius), RISK-008(clipboard 게이트), DR-023(selection chrome).
