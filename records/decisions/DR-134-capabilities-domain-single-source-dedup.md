# DR-134 — per-kind 모델 3중 기술 dedup (catalogue/rules 단일 소스 분리)

- **Status:** ACCEPTED (2026-06-13)
- **Work Item:** WI-209
- **Relates:** DR-131/WI-206(스키마 description 비대칭 dedup — 본 DR은 그 "남은 레버"),
  DR-130/WI-205, DR-132/WI-207, DR-048(생성정확성 — create 경로 보호),
  small-think DR-067(입력토큰 ≈ 턴수 × 정적 prefix)

## 컨텍스트

WI-206 이후 per-turn 정적 prefix의 남은 최대 덩어리는 **같은 per-kind attrs 모델의
3중 기술**이었다: `WEAVE_CAPABILITIES.itemKinds`(~7.2K tok) ↔ `weave.item.add`의
full attrs note(스키마, ~2.4K) ↔ `WEAVE_DOMAIN_KNOWLEDGE`(~6.0K)가 텍스트
사이징/배치 규칙, 프레임 슬라이드 의미론, 차트 모델, PaintSpec을 거의 그대로
중복 보유 — 전부 매 턴 cacheRead로 재독된다.

## 결정 — 사실 종류별 단일 소스 배정

| 사실 종류 | 단일 소스 | 나머지는 |
|---|---|---|
| per-kind FIELD 카탈로그 (attrs 필드·값·유닛) | `itemKinds` | 포인터 |
| 종단 RULES (구조·사이징·색·저작·커맨드 규율) | `WEAVE_DOMAIN_KNOWLEDGE` | 포인터 (§N 참조) |
| 생성-시점 계약 | `item.add` full note — **불변** (DR-048) | — |
| PaintSpec union | `unitKinds.decoration.fill` | shape/frame FILL은 포인터 |
| 차트 전체 모델 | `chart.add` 스키마 + `itemKinds.chart` | item.add 노트는 스티어만 |

구체 변경:

1. **`itemKinds.frame`** 4불릿 → 2불릿: 내부 중복(불릿1↔2가 presentable:false·
   nested-grouping·shape-for-panel 반복) + domain §0/§5 중복 제거. presentable:false는
   #1 footgun이라 **인라인 1회 유지**(WI-206 비대칭 원칙: 오용 비용 큰 임계 규칙은 남긴다).
2. **`itemKinds.text`**: SIZING의 shared-frame budget 문단(domain §2 거의 원문),
   SIZING ROLES 불릿 전체, PLACEMENT의 width-binding/sliver/roomy-cell 산문(domain §3),
   COLOR 역할 테이블(domain §4) 삭제 → §N 포인터. **textRuns/OUTLINE/OVERFLOW/STYLE/
   LAYOUT 필드 카탈로그는 유지**(domain이 스펙하지 않는 유일 소스).
3. **domain 블록이 흡수한 것**(단일 소스가 되기 위해 — 정보 삭제 아님):
   §2 caption 18–22px 규칙, §3 flex-ROW sliver 위험(WI-149/DR-104 — itemKinds에만
   있었음) + DR-098 자동 Fixed-box 사실.
4. **domain §1 LINE/POLY EXCEPTION** 6줄→4줄(itemKinds.line이 full 모델 보유),
   **§5 CHARTS** 12줄→7줄(판단 + 2대 footgun만; 모델은 chart itemKind).
5. **`CHART_ATTRS_NOTE`(item.add)** ~35줄→6줄: 차트는 item.add로 만들지 않는데(스티어가
   존재 이유) full 모델을 그 도구에 실어 매 턴 재독 — chart.add 자체 typed 스키마 +
   캐시된 itemKinds.chart가 동일 내용 보유. 스티어 + edit-merge 계약(deep-merge/
   null-clear/palette-wholesale — itemKinds.chart STYLE에도 명문화)만 남김.
6. **PaintSpec**: angle(deg, 0=up)/cx·cy(own bbox) 의미를 `decoration.fill` unitKind로
   이동, shape FILL은 포인터.

## 효과 (실측, chars/3.6 추정)

- itemKinds 25,984 → 19,006 chars (−27%), item.add 스키마 16,543 → 14,104 (−15%),
  domain +55 / unitKinds +145 (흡수분). **순 per-turn prefix −~9.2K chars ≈ −2.5K tok.**
- WI-205+206+207 누적 위에 합산: 광고 스키마 합 64,227 → 61,788 chars.

## 거부한 대안

- **item.add full note 슬림화**: DR-048/DR-131이 명시적으로 보호하는 생성 경로 —
  차트(생성 도구가 따로 있는 유일 kind) 외에는 손대지 않음.
- **TASK_PRIMER 트림**: WI-078이 per-task 최신성(recency)의 측정된 효과로 잠근 표면.

## 품질 게이트 / 롤백

WI-206과 동일한 라이브 게이트(HANDOFF-029 재측정에 합산): 총 턴 + 수정/생성 비율 +
육안 품질이 DR-048 판정(동등 이상) 통과해야 확정. 회귀 시그니처별 롤백 단위:
텍스트 사이징/배치 회귀 → itemKinds.text 절 복원; 슬라이드 구조 회귀 →
itemKinds.frame 복원; 차트 회귀 → CHART_ATTRS_NOTE 복원 (각각 독립 커밋-리버트 가능한
단일 파일 영역).
