# Slide Layout Presets — Product Spec v0.1

**Status**: Discovery (WI-030)
**Owner**: hbpark
**Created**: 2026-05-25

## 1. Problem

weave 사용자가 "Add slide" 를 눌렀을 때 빈 슬라이드 한 장이 등장한다. 사용자는 그 다음 무엇을 만들지 매번 처음부터 결정해야 한다. 일반 사용자의 데크 구성 시나리오는 의미 단위로 강하게 패턴화돼 있다 — 표지로 시작하고, 아젠다로 흐름을 잡고, 미션·문제·해결·가이드·클로징으로 진행. weave 가 이를 흡수하지 못하면 사용자는 (1) 매번 처음부터 레이아웃을 짜거나 (2) 다른 도구에서 만든 슬라이드를 weave 로 옮긴다.

## 2. Competitive landscape

| 도구 | 진입점 | 카테고리 깊이 | 변주 |
|---|---|---|---|
| Genially | "New" → template gallery | flat (200+) | 무작위 검색 |
| Canva | "+ Page" → "Layouts" 사이드패널 | 2-level (헤드라인/이미지/그리드/…) | 카테고리당 30+ |
| Gamma | AI prompt → 자동 생성 | n/a (AI) | 무한 |
| Figma Slides | "+" → 빈 슬라이드 only | 없음 | 없음 |
| Beautiful.ai | "+ Slide" → smart layout 16개 | flat | 컨텐츠 입력 후 자동 변형 |

**weave 의 포지셔닝**: 의미 단위 카테고리 (8개) × 변주 (~3개) 의 **shallow + curated** 흐름. AI 생성 (Gamma 류) 도 무한 검색 (Genially 류) 도 아닌, **"의미를 고르면 정돈된 시작점 3개"** 의 가운데 길.

## 3. The 8 categories (v1)

| Id | 한국어 | English | 사용 시점 |
|---|---|---|---|
| `cover` | 표지 | Cover | 데크 첫 슬라이드, 타이틀·부제·메타 |
| `agenda` | 아젠다 | Agenda | 데크 두 번째 슬라이드, 흐름 미리보기 |
| `timetable` | 타임테이블 | Timetable | 워크숍·일정·세션 데크 |
| `mission` | 미션 | Mission | 비전·미션·핵심 가치 슬라이드 |
| `problem` | 문제 정의 | Problem | 현황·페인 포인트·통계 |
| `solution` | 해결 방향 | Solution | 제안·방향·접근법 |
| `guide` | 가이드 | Guide | 단계별·체크리스트·튜토리얼 |
| `closing` | 클로징 | Closing | 데크 마지막, 감사·CTA·연락처 |

**선정 기준**: B2B 발표 · 워크숍 · 제안서 · 강의 4 시나리오에서 공통으로 ≥ 60% 등장하는 슬라이드 종류. "차트", "팀 소개", "포트폴리오" 등은 v1 out-of-scope (v1.x 후보).

**카테고리 추가/삭제 정책**: 카테고리는 open registry 로 박제하지만 v1 launch 까지는 위 8개로 동결. 새 카테고리 제안은 신규 DR + telemetry 데이터 (실사용 빈도) 가 필요.

## 4. The variants (~3 per category)

각 카테고리 안의 변주는 **시각 구성·정보 밀도·톤** 3축으로 분화한다. "내용 자체가 다른 카테고리"가 아니라 "같은 의미를 다르게 표현".

### 4.1 표지 (cover)

| Variant | 톤 | 구성 | child items |
|---|---|---|---|
| `cover.bold` | 비즈니스 | 좌측 정렬 큰 헤드라인 + 한 줄 부제 + 작은 메타 (날짜·작성자) | 1 title-text + 1 subtitle-text + 1 meta-text |
| `cover.hero` | 발표 | 중앙 정렬 큰 타이틀 + 부제 + 액센트 배경 도형 | 1 accent-shape + 1 title-text + 1 subtitle-text |
| `cover.asymmetric` | 디자인 | 왼쪽 1/3 액센트 컬러 영역 + 오른쪽 2/3 타이틀·부제 | 1 accent-shape + 1 title-text + 1 subtitle-text |

### 4.2 아젠다 (agenda)

| Variant | 톤 | 구성 | child items |
|---|---|---|---|
| `agenda.numbered` | 명료 | 좌측 큰 번호 (01-05) + 우측 항목명 5행 | 1 heading-text + 5 (number-text + label-text) pairs |
| `agenda.two-column` | 구조 | 좌측 "AGENDA" 큰 헤드라인 + 우측 5 항목 리스트 | 1 heading-text + 5 item-text |
| `agenda.card-grid` | 시각 | 4 카드 (2×2) — 각 카테고리명 + 짧은 설명 | 1 heading-text + 4 (card-shape + title-text + desc-text) |

### 4.3 타임테이블 (timetable)

| Variant | 톤 | 구성 | child items |
|---|---|---|---|
| `timetable.linear` | 단순 | "Time" / "Session" 2 컬럼, 5-6 행 | 1 heading + 2 column-headers + 10-12 cell-text |
| `timetable.two-track` | 병행 | 시간 + 트랙 A + 트랙 B 3 컬럼 | 1 heading + 3 column-headers + 12-18 cells |
| `timetable.gantt` | 시각 | 가로축 시간 + 세로축 항목 + 막대 도형 | 1 heading + 시간 라벨 + 4-5 (label + bar-shape) |

### 4.4 미션 (mission)

| Variant | 톤 | 구성 | child items |
|---|---|---|---|
| `mission.statement` | 강조 | 중앙 한 문장 큰 미션 텍스트 + 부제 | 1 big-text + 1 subtitle |
| `mission.three-values` | 구조 | 미션 헤드라인 + 3 가치 (제목 + 설명) 가로 배치 | 1 heading + 3 (value-title + value-desc) |
| `mission.quote` | 권위 | 큰 따옴표 + 미션 본문 + 출처/CEO 이름 | 1 quote-mark-shape + 1 body-text + 1 attribution-text |

### 4.5 문제 정의 (problem)

| Variant | 톤 | 구성 | child items |
|---|---|---|---|
| `problem.pain-points` | 분석 | "현재 상황" 헤드라인 + 3 페인 포인트 불릿 | 1 heading + 3 (icon-shape + pain-text) |
| `problem.before-after` | 대비 | 좌측 "오늘의 문제" + 우측 "왜 중요한가" 두 컬럼 | 1 heading + 2 (column-heading + body-text) |
| `problem.stat-callout` | 충격 | 큰 통계 숫자 ("70%") + 설명 텍스트 + 출처 | 1 big-stat-text + 1 description + 1 source-text |

### 4.6 해결 방향 (solution)

| Variant | 톤 | 구성 | child items |
|---|---|---|---|
| `solution.three-step` | 절차 | 3 단계 카드 + 화살표 | 1 heading + 3 (step-number + step-title + step-desc) + 2 arrow-shapes |
| `solution.compare` | 대조 | 2 컬럼 (Old way / New way) | 1 heading + 2 (column-heading + body-text) |
| `solution.hero` | 임팩트 | 큰 솔루션 헤드라인 + 부제 + 비주얼 placeholder | 1 visual-placeholder + 1 title + 1 subtitle |

### 4.7 가이드 (guide)

| Variant | 톤 | 구성 | child items |
|---|---|---|---|
| `guide.step-by-step` | 안내 | 4-5 단계 수직 리스트 + 각 단계 짧은 설명 | 1 heading + 4-5 (step-number + step-title + step-desc) |
| `guide.checklist` | 점검 | 체크박스 형태의 항목 리스트 (5-6) | 1 heading + 5-6 (checkbox-shape + item-text) |
| `guide.qa` | 대화 | Q + A 쌍 3개 | 1 heading + 3 (Q-text + A-text) |

### 4.8 클로징 (closing)

| Variant | 톤 | 구성 | child items |
|---|---|---|---|
| `closing.thank-you` | 격식 | 중앙 큰 "Thank you" + 연락처/CTA | 1 big-text + 1 contact-text |
| `closing.questions` | 대화 | "Questions?" + 부제 + 메타 | 1 big-text + 1 subtitle + 1 meta |
| `closing.cta-contacts` | 액션 | 좌측 CTA 헤드라인 + 우측 연락처 그리드 | 1 cta-text + 1 cta-subtitle + 3-4 contact-cells |

**총 24 프리셋**. 평균 child Item 수 ≈ 6 (최소 2 — `mission.statement` / 최대 14 — `timetable.two-track`).

## 5. Coordinate convention

모든 child Item 의 `frame` 은 slide frame 의 **0..1 ratio**. 절대 px 없음. 이렇게 하면:
- 슬라이드 해상도 (16:9 1920×1080, 4:3, 9:16 등) 가 바뀌어도 비례 유지.
- 사용자가 슬라이드 frame 을 resize 해도 child 가 비례 따라감 (현재 ItemFrame 동작과 일관).

각 변주의 정확한 coordinate 는 Engineering Plan 의 부록에 명시.

## 6. i18n strategy

- 카테고리 / 프리셋 / child text 의 기본 라벨은 `LocalizedText` (WI-026): `{ ko: "...", en: "..." }`.
- 사용자가 preset 을 삽입하면 child Item 들의 텍스트는 **현재 UI 언어** 의 문자열로 seed.
- 향후 일본어/중국어는 같은 `LocalizedText` 에 키만 추가.

## 7. Visual examples

각 프리셋의 silhouette 은 token-only DOM 미리보기로 메뉴에 표시. 정확한 미리보기 SVG 는 디자인팀 협업 시 확정 (DR-design-XXX 후보).

```
[cover.bold]                  [cover.hero]                 [cover.asymmetric]
┌────────────────────┐       ┌────────────────────┐       ┌─┬──────────────┐
│ ▆                  │       │       ▆▆▆          │       │█│              │
│ Big Headline       │       │   Big Headline     │       │█│ Big Headline │
│ ────               │       │     ────────       │       │█│ ────         │
│ Subtitle           │       │     Subtitle       │       │█│ Subtitle     │
│ 2026 · author      │       │                    │       │█│              │
└────────────────────┘       └────────────────────┘       └─┴──────────────┘
```

(상세 silhouette 는 Engineering Plan + DR-design 에서 정의.)

## 8. Open questions for Feasibility (FR-003)

- **F1.** `weave.item.add` 가 단일 Item 만 stage 하는데 multi-item batch 가 단일 history transaction 으로 가능한가? `PendingCreations` 의 multi-stage + 단일 `item.children` patch 로 풀이 가능해 보이지만, history 의 단일 entry 보증을 검증해야 함.
- **F2.** preset 의 child Item 들이 모두 sibling (slide frame 의 직접 child) 이어야 하는가, 아니면 slide frame 이 group 처럼 child container 로 동작하는가? 현재 paradigm 은 후자 (Figma Frame 처럼).
- **F3.** 24 preset × 평균 6 child = ~144 Item 정의의 코드 양. Bundle budget 60 KB gz 가 현실적인가?
- **F4.** preset 의 텍스트 Item 들이 WI-029 Phase 1 schema 를 가정. WI-029 의 R-잔여 PR 가 머지되기 전 v1 launch 가능한가?
- **F5.** 3-level menu (kind → category → variant) 가 design-system 의 `DropdownMenu` + `SubMenu` 로 풀리는가, 아니면 새 primitive 필요한가?

## 9. Success metrics (v1 launch +30d)

- 새 슬라이드 추가의 ≥ 50% 가 preset 경로 사용 (vs. 빈 슬라이드).
- 카테고리별 사용 분포 측정 — 표지/아젠다/클로징 = top 3 예상.
- preset 삽입 후 90초 이내 사용자가 slide 의 child Item 텍스트를 1회 이상 편집 (= 실제로 활용).

## 10. v1.x / v2 backlog

- 사용자 정의 preset 저장 (cloud)
- preset 자연어 검색
- AI 기반 preset 추천 ("이 데크의 다음 슬라이드로는...")
- 카테고리 추가 — "차트", "팀 소개", "포트폴리오", "비교", "타임라인"
- 프리셋의 light/dark variant
- 일본어/중국어 추가
- canvas-design / block-doc kind 의 preset
