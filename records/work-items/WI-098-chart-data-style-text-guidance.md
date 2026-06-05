# WI-098 — 차트 데이터 구성 + 꾸미기 + 텍스트(=텍스트 아이템) 가이드 강화

| Field | Value |
|---|---|
| Status | Done (single-session, 2026-06-05) |
| Owner | hbpark |
| Decision | DR-067 |
| Relates | WI-077(차트/encoding), WI-078(overrides+관리 라벨), WI-092(직접조작), WI-094(부분편집) |

## Problem (operator, 2026-06-05)

차트의 데이터 구성과 "이쁘게 꾸미기"를 강화하고 싶다. 그리고 **차트가 텍스트를 실제 weave
텍스트 아이템으로 표시한다는 것**(bar/line/area + pie의 카테고리/축 라벨은 dataset에서 파생된
자동 관리 text child — DR-035)을 에이전트가 알고 적절히 활용해야 한다. 기존엔 capabilities에
`chart` itemKind가 없어 데이터/꾸미기/텍스트-아이템 모델이 충분히 안 가르쳐졌음.

## Change

세 지점(api·byo-ssh 공통):
1. `WEAVE_CAPABILITIES.itemKinds`에 **`chart` 신설** — DATA(컬럼 순서·타입 선택·≤~5 시리즈·
   encoding), STYLE(palette=테마 categorical 토큰, variant 도넛/스택/스무스, overrides 히어로
   강조, showLegend/Axis/opacity/barWidth, 카드 표면, AA), TEXT-AS-ITEMS(카테고리/축 라벨은
   자동관리 text item — 손수 추가/이동 금지, 텍스트 편집=데이터 편집, 스타일은 재지정 가능·유지;
   제목/요점/콜아웃/출처는 별도 text item으로 직접 추가).
2. `CHART_ATTRS_NOTE`(command 스키마)에 데이터/스타일/텍스트-아이템 라인 추가.
3. `WEAVE_DOMAIN_KNOWLEDGE` 규칙5에 CHARTS 전용 bullet.

(small-think 하네스에도 호스트-무관 일반 데이터-시각화 지침 — WI-027.)

## Acceptance

- capabilities에 chart itemKind(데이터/스타일/텍스트-아이템) 존재. ✔
- CHART_ATTRS_NOTE + 도메인지식에 "제목/요점은 별도 text, 관리 라벨은 재지정만" 명시. ✔
- 코드/동작 변경 없음(기존 엔진 동작 문서화). ✔

## Verification (2026-06-05, SVL gate)

- Typecheck clean; aku-agent 스위트 통과; biome clean(변경 파일).

See DR-067.
