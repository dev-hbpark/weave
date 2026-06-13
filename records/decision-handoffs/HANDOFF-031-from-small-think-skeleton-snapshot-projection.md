# HANDOFF-031 — (from small-think) design.snapshot에 스켈레톤 view + scoped read 구현 요청

- **From:** small-think (계약·주입·측정 소유) · **To:** weave (doc 형태·투영 소유)
- **Date:** 2026-06-13 · **Status:** DEFERRED (선택적 후속 — small-think WI-058 MVP가 동일
  절감 달성, 재-vendor 0) · **Replies-to-context:** HANDOFF-029
- **갱신(2026-06-13):** `design.snapshot` 핸들러가 vendored agocraft 브리지에 있어 본 요청은
  agocraft 변경 + 재-vendor가 필요. cacheRead 절감 지점은 주입측(small-think
  renderDocumentContext)이라, small-think가 받은 full-doc를 거기서 스켈레톤 투영해 동일
  −33%를 재-vendor 0으로 달성(WI-058/DR-072 MVP). **본 핸드오프는 per-kind 권위 투영이
  필요해질 때(예: label/구조 규칙을 kind별로 정교화) 픽업하는 선택적 후속으로 보류.** 아래
  스펙은 그때 유효.
- **small-think:** WI-058 / DR-072 · **근거:** small-think DR-067 + 입력토큰 곡선 실측

## 왜 (1줄)

턴당 주입 스냅샷이 doc-크기에 선형 성장 → 총 입력에 2차항(107턴 태스크 입력의 37%).
스켈레톤 투영으로 평탄화하면 −15%(57턴)~−33%(107턴). DR-007상 투영은 doc 형태를 아는
weave가 소유해야 함(small-think는 `snapshot.json` opaque).

## 요청 — `design.snapshot` 툴 확장

현재 weave agent-client가 등록한 `design.snapshot`은 입력 `{}` → 전체 doc json 반환.
아래 두 파라미터를 추가(둘 다 옵셔널, 미지정 시 현행 full = 하위호환):

### 1. `view: "skeleton" | "full"` (기본 full)

`view:"skeleton"` → per-item 구조 투영만 반환:

```jsonc
{ "id": "...", "kind": "frame|text|image|shape|chart|line|...",
  "frame": { "x":0..1, "y":0..1, "width":0..1, "height":0..1 },   // 부모 기준 bbox
  "containerId": "<parent id | null(root)>",
  "layout": { "kind":"flex-row|flex-col|grid|absolute", ... } ,    // 있을 때만, 요약
  "presentable": true|false,                                       // 슬라이드 vs 레이아웃그룹
  "label": "<식별용 짧은 미리보기>" }
```

- **KEEP**: id, kind, frame(bbox), containerId, layout(방향+요약), presentable, label.
- **label 규칙**(식별 가능하게, ~40자): text→텍스트 앞부분, image/video→src basename,
  chart→`chartType + series수`, shape→shape kind(rectangle/ellipse/poly), frame→없음/역할.
- **DROP**: textRuns/styles 전문, PaintSpec stops, dataset rows, points 배열, decoration units
  상세, palette, overrides, 그 외 content 본체.
- 목표: item당 수백 bytes → 수십 bytes. 트리 구조(containerId)는 보존해 계층 추론 가능.

### 2. `itemId` (또는 `subtree`) — scoped full read

`design.snapshot { itemId: "<id>" }` → 그 아이템(또는 subtree) **full** 디테일만 반환.
얇은 스켈레톤에서 에이전트가 정밀 편집 직전 해당 아이템만 읽게 하는 안전판
(전체 doc full 재독 → tool_result 재유입 방지). `view` 미지정 시 scoped는 full로 간주.

## 설계 제약 (weave 측)

- **Rule 6**: per-kind 스켈레톤 투영은 레지스트리(`SNAPSHOT_PROJECTORS[kind]` 같은 한 kind
  한 어댑터), `switch(kind)` 금지. 기존 직렬화/도메인 렌더러 레지스트리 재사용 가능하면 그쪽.
- **단일 소스**: label/구조 필드 추출은 기존 doc 모델에서 파생(중복 기술 금지).
- 스켈레톤도 **round-trip 식별성** 불필요(읽기 전용 투영) — 단 id는 정확해야 편집 타깃 가능.

## small-think 측 (본 핸드오프 외, WI-058에서 진행)

- 계약 `{ view?, itemId? }` 추가(`@small-think/design` types), 자동 주입 경로만
  `view:"skeleton"` 요청, config `SMALL_THINK_SNAPSHOT_VIEW`, cap backstop 유지.
- weave 미구현 동안에도 graceful(파라미터 무시→full 반환→현행 동작).

## 합의 필요 / 측정

- label 규칙·layout 요약 형태는 weave 재량(식별성만 충족). 확정 시 회신(또는 DR).
- 구현 후 small-think가 HANDOFF-029 방식 재측정: crPerTurn fit 기울기 573→~0(2차항 소멸),
  총 −15~33%, DR-048 품질(턴수·수정/생성·`design.snapshot{full}` 호출빈도=역효과 신호·육안).
- 회신: weave 구현 DR/WI 번호 + 스켈레톤 실제 형태 예시 1건을 본 핸드오프 또는 small-think
  `records/decision-handoffs/` 인박스로.

— small-think 전문: `workspace/small-think/records/work-items/WI-058-skeleton-snapshot-injection.md`,
`records/decisions/DR-072-skeleton-snapshot-projection.md`
