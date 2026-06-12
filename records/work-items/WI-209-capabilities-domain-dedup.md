# WI-209 — per-kind attrs 모델 3중 기술 dedup (itemKinds ↔ item.add note ↔ domain)

- **Status:** DONE (2026-06-13) · **DR:** DR-134 · **Relates:** WI-205/206/207,
  small-think DR-067/HANDOFF-029
- **Origin:** 운영자 요청 "아쿠에이전트 편집의 입력 토큰이 너무 많이 쓰이는데 이거 더
  줄이고싶어" 잔여-레버 메뉴에서 ①(per-kind 3중기술 dedup) 선택.

## Change

- `features/aku/agent/weave-capabilities.ts`
  - itemKinds.frame: 4불릿 → 2불릿 (slide/필름스트립/그루핑 규칙 → domain §0/§5 포인터;
    presentable:false 임계 규칙 인라인 유지; 필드 카탈로그 유지)
  - itemKinds.text: SIZING budget·SIZING ROLES·PLACEMENT 산문·COLOR 테이블 →
    domain §2/§3/§4 포인터; textRuns/OUTLINE/OVERFLOW/STYLE/LAYOUT 유지
  - itemKinds.shape FILL → decoration.fill unitKind 포인터 (PaintSpec 상세 그쪽으로 이동)
  - itemKinds.chart STYLE에 deep-merge/null-clear/palette-wholesale 명문화
  - domain §1 LINE/POLY 슬림, §2 caption 흡수, §3 flex-row sliver + DR-098 흡수,
    §5 CHARTS 슬림
- `features/aku/agent/weave-command-schemas.ts` — CHART_ATTRS_NOTE ~35줄→6줄
  (스티어 + edit-merge 계약만; full 모델은 chart.add 스키마 + itemKinds.chart)

## 효과 (임시 프로브 실측, chars)

| 블록 | before | after |
|---|---|---|
| itemKinds | 25,984 | 19,006 (−27%) |
| item.add 스키마 | 16,543 | 14,104 (−15%) |
| domain | 21,611 | 21,666 (+흡수) |
| unitKinds | 3,374 | 3,519 (+흡수) |

순 per-turn prefix **−~9.2K chars ≈ −2.5K tok**.

## SVL

- aku/agent + editor-mode 26파일 301 green (capabilities-coverage 10,
  command-schemas.layout 포함), `tsc --noEmit` 클린, biome 2파일 클린.
- 정보 소실 0 검증: 삭제한 모든 규칙은 단일 소스에 존재(flex-row sliver·DR-098·
  caption은 domain에 신규 흡수 — 이전엔 itemKinds에만 있었음).

## 운영 후속

- 라이브 품질 게이트는 WI-206과 합산(HANDOFF-029 재측정, DR-048 판정).
- 회귀 시 영역별 복원(DR-134 §롤백).
