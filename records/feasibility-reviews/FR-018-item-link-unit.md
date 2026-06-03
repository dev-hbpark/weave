# FR-018 — 아이템 링크 유닛 (URL 새 탭 열기 / 디자인 내 슬라이드 이동)

| Field | Value |
|---|---|
| ID | FR-018 |
| Date | 2026-06-04 |
| Work item | WI-090 (item-link-unit) — *생성 예정* |
| Verdict | **FEASIBLE** (일부 트레이드오프) |
| Status | Draft (검토용) |

## Question

**모든 아이템**(text·image·shape·line·qr·chart·frame)에 "링크 유닛"을 붙일 수 있는가.
프레젠테이션 모드에서 그 링크는 두 동작 중 하나:

1. **새 탭으로 특정 URL 열기**,
2. **디자인 내 특정 슬라이드로 이동**.

## 근본 구조 (왜 대부분 이미 가능한가)

weave는 이미 **InteractionBehavior 오픈 레지스트리(DR-009)** 를 갖고 있고, 그 위에:

- `HotspotAction` 유니온이 `external`(href) / `jump-camera`(targetId) / `next-camera` /
  `reveal`를 정의 (`apps/web/src/document/types.ts:383`).
- `ButtonTriggerBehavior` = "아이템 전체가 클릭 버튼 + HotspotAction" — **요청한 링크
  유닛과 사실상 동일한 모델** (`types.ts:430`).
- `dispatchHotspotAction` + `openExternalHref`(`window.open(href, "_blank",
  "noopener,noreferrer")`) — **새 탭 열기 이미 구현**
  (`interactions/hotspot-action.ts:39,44`).
- `weave.item.addBehavior` / `removeBehavior` / `behavior.update` — **모든 아이템**
  (`findItemDeep`)에 behavior를 Unit으로 부착·제거·수정, **History/undo 경유**
  (`document/commands.ts:1460,1491,1185`).
- 슬라이드 이동 런타임: 슬라이드 = `effectivePresentationOrder(design)`의 프레임이고
  각 슬라이드는 합성 카메라 타겟 id `present-${frameId}`를 가짐. `goToCameraId(id)`가
  그 id로 점프 (`PresentPage.tsx:199,272`).

즉 `addBehavior(itemId, { kind:"button-trigger", action:{ type:"external", href } })` 또는
`{ type:"jump-camera", targetId:"present-"+frameId }` 호출만으로 **데이터 모델·undo·직렬화는
전부 동작**한다. 다만 현재 이 경로는 **AI 에이전트(aku)만** 사용한다
(`features/aku/agent/weave-capabilities.ts:248`).

## Findings

| 영역 | 상태 |
|---|---|
| **링크 데이터 모델** | **이미 있음** — `ButtonTriggerBehavior` + `HotspotAction(external/jump-camera)`. 새 kind 불필요. |
| **모든 아이템에 부착** | **이미 있음** — `addBehavior`가 `findItemDeep`로 종류 무관 부착, undo/직렬화 포함. |
| **새 탭 URL 열기** | **이미 구현** — `openExternalHref` (`window.open(_blank, noopener)`). |
| **슬라이드 이동 런타임** | **이미 구현** — `goToCameraId("present-"+frameId)`. 단 대상 프레임이 `presentationOrder`에 든 발표 슬라이드여야 함. |
| **present에서 모든 아이템 클릭 발화** | **빠짐** — `button-trigger`가 카메라 타겟(슬라이드 프레임)에만 연결됨 (`PresentPage.tsx:577,614`). 루트 프리미티브(`rootPrimitiveScenes`)와 프레임 내부 자식(`PresentFrameTree`)은 클릭 핸들러 없음. |
| **registry 렌더 경로** | **orphaned** — `interactionRegistry.forItem`/어댑터 `renderOverlay`(hotspot)가 등록만 되고 **호출 소비자 0건**. 사실상 죽은 코드. |
| **저작 UI (수동)** | **빠짐** — 링크/인터랙션을 추가하는 수동 UI 없음. 툴바 섹션은 종류별 시각 속성뿐. 에이전트 전용. |
| **텍스트 인라인 하이퍼링크** | **부분 있음** — `TextAttrs.hyperlink`가 present에서 `<a target=_blank>` 래핑 (`domains/TextBlock.tsx:399`, `text-section.tsx:656`). URL 한정·텍스트 한정·슬라이드 이동 없음. |

## Trade-offs / 한계

- **슬라이드 이동 대상 제약**: `jump-camera`는 `cameraTargets`(= 발표 순서에 든 슬라이드)
  에서만 검색되므로(`goToCameraId`), 발표에서 제외된(`presentable:false`) 프레임으로는
  점프 불가. UI는 발표 슬라이드 목록만 노출해 이 제약을 자연스럽게 표현해야 한다.
- **슬라이드 재정렬 시 안정성**: 점프 타겟을 `present-${frameId}`(프레임 id 기반)로 저장하면
  슬라이드 순서를 바꿔도 안정적. 인덱스(step number) 기반이면 재정렬에 깨짐 → **id 기반 권장**.
- **텍스트 하이퍼링크 중복**: 텍스트는 인라인 `hyperlink`(URL만)와 아이템 레벨 링크
  (behavior)가 공존 가능 → 클릭 이중 처리 위험. 정책 결정 필요(DR-052 §결정 2).
- **orphaned 오버레이 처리**: 현재 `button-trigger`는 PresentPage가 `units`를 직접 읽는
  지름길이고(레지스트리 우회), hotspot 어댑터의 `renderOverlay`는 죽은 코드. 정석은
  레지스트리 경로를 present에 살려 "모든 아이템 × 모든 behavior"를 일관 디스패치 — Gap A를
  자연 해결하면서 Rule 6/오픈레지스트리 원칙에 부합.

## Verdict

**FEASIBLE** — 모델·디스패치·URL열기·슬라이드 점프 런타임이 이미 존재. 새 플랫폼 역량 불필요.
잔여 작업은 (A) present 런타임을 모든 아이템에 연결, (B) 종류 공통 저작 UI, (C) 슬라이드 타겟
선택기 세 가지이며 모두 기존 명령/런타임 재사용으로 달성 가능. 트레이드오프는 점프 대상 제약·텍스트
링크 중복 정책 두 가지로, 설계 결정(DR-052)으로 봉인한다.

## Cross-refs

- WI-090 (구현), DR-052 (button-trigger 재사용 + 레지스트리 present 경로 부활)
- DR-009 (InteractionBehavior 오픈 레지스트리), WI-029 (behavior 커맨드 / 텍스트 hyperlink)
- 관련 코드: `types.ts:383,430` · `hotspot-action.ts` · `commands.ts:1460` ·
  `PresentPage.tsx:199,272,577` · `interactions/registry.ts` · `render/PresentFrameTree.tsx`
