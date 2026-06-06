# WI-117 — 아쿠 작업 종류별 스프라이트 (추가=spell-right / 수정=spell-left / 정리=puff)

| Field | Value |
|---|---|
| Status | Built (single-session, 2026-06-06) |
| Owner | hbpark |
| Decision | DR-070 (expression mood 레지스트리 — 본 작업은 행(row) 추가) |
| Relates | WI-103/WI-104(expression/엔진) · WI-111(활동 단계) |

## Problem (operator, 2026-06-06)

작업 종류별로 아쿠 스프라이트를 다르게 보여주고 싶다:
- **아이템 추가** → right-spell, **업데이트(수정)** → left-spell, **정리 중** → puff.

## Change

- 신규 시트 3종(각 3120×724 = 6프레임 520×724, 투명): `public/aku/sprites/spell-right.png`,
  `spell-left.png`, `puff.png`.
- `mood.ts`: `AkuMood`에 `adding`/`updating` 추가. 스트리밍 `activity` 캡션의 한국어 substring으로
  분기(레지스트리 행 추가, Rule 6) — `"추가"`→adding, `"수정"`→updating(우선순위: 생각 > 정리 >
  추가 > 수정 > 일반 working). 캡션은 `WEAVE_COMMAND_LABELS`가 만든 "아이템 추가/수정 적용 중…"에서 옴.
- `gpu-sprite-renderer.tsx` `SPRITES`: `adding`→spell-right, `updating`→spell-left, `finalizing`→puff
  (기존 idea에서 변경). `working`(그 외 편집: 배경 변경/삭제/설정)은 idea 유지.
- `phrases.ts`에 adding/updating 말풍선 추가, `MOOD_INTENSITY`에 두 mood 추가.

## Acceptance

- [x] 아이템 추가(캡션 "추가") 시 spell-right 스프라이트.
- [x] 아이템 수정(캡션 "수정") 시 spell-left 스프라이트.
- [x] 정리 중(캡션 "정리") 시 puff 스프라이트.
- [x] 그 외 편집(배경 변경/삭제 등)은 기존 idea 유지. 우선순위 충돌 없음.

## Verification (SVL gate — 2026-06-06)

- tsc 0 · biome check . clean · 아쿠 단위 93/93(mood 신규 케이스 포함) · 아쿠 e2e 12/12.
- mood 매핑은 `mood.test.ts`로 단위 검증("추가"→adding, "수정"→updating, "배경색 변경/삭제"→working,
  "정리"→finalizing). 실제 스프라이트 재생은 streaming(reverse-MCP 서버) 필요 → 시트는 기존과 동일
  규격(3120×724)이라 엔진이 동일 경로로 로드.

See DR-070.
