# WI-206 — Aku 도구 스키마 description 중복 제거 (attrs 모델 3중 → 1중)

- **Status:** Code+Unit DONE · 라이브 품질검증 운영 대기 · **DR:** DR-131 · **Relates:** WI-205/DR-130(도구 표면 축소), small-think DR-067(입력토큰=턴수×prefix), DR-048(생성 노트가 레이아웃 오용 방지 — 품질 리스크)

## Problem

WI-205/DR-130로 page 광고 스키마를 19,525 → 16,973 tok(−13%)까지 줄였으나, **잔여의 61%가
상위 3개 도구**에 몰려 있고 그 원인이 description 중복이다(실측):

| 도구 | total tok | 공유 attrs-bag description |
|---|---|---|
| `weave.item.add` | 4,136 | **2,451** |
| `weave.item.update` | 3,753 | **2,451** |
| `weave.items.update` | 3,933 | **2,451** |

`weave-command-schemas.ts`의 `ATTRS_WITH_TEXT_NOTE`(FRAME_BASE + FRAME_ATTRS + TEXT + QR +
CHART + SHAPE + IMAGE + VIDEO + EMBED + LINE 노트 합본, 2,451 tok)가 **세 도구에 각각 직렬화**
되어 광고된다 = 7,353 tok 중 **4,902가 순수 중복**. 게다가 같은 per-kind 모델이 `WEAVE_CAPABILITIES`
(itemKinds 설명) + `WEAVE_DOMAIN_KNOWLEDGE`(좌표 모델, 파일 17행이 "여기 AND 캐시 도메인지식에
모두 기술"이라 명시)에도 존재 — 사실상 **4중 기술**. 셋 다 매 턴 재독되는 캐시 prefix라 cacheRead를
직접 키운다.

## 구현 결과 (실측)

`ATTRS_BAG_PROPERTIES`(공유 typed properties) 추출 + `ATTRS_WITH_TEXT_NOTE`(full, item.add 유지)
/ `ATTRS_EDIT_NOTE`(slim, item.update·items.update) 분리. slim description은 포인터 + 편집 임계
규칙(frame 0..1·auto-layout override→setLayoutChild·text px·auto-height 금지·부분병합)만.

| 도구 | before | after |
|---|---|---|
| `weave.item.add` | 4,136 | **4,136** (full 유지) |
| `weave.item.update` | 3,753 | **1,562** (−2,191) |
| `weave.items.update` | 3,933 | **1,742** (−2,191) |
| **PAGE 광고 스키마 합** | 16,973 | **12,591** (−26%) |

WI-205 누적: 원본 19,525 → 12,591 = **−35.5%**. 검증: aku/editor-mode 294 그린, `tsc` 클린.

## Change (계획 — DR-131)

**비대칭 dedup(저리스크):**
- `weave.item.add`는 **full `ATTRS_WITH_TEXT_NOTE` 유지** — 생성 정확성이 가장 중요하고
  (DR-048: 생성 시 frame/layout 규칙 오용이 사후수정 storm을 부른다), 모델이 attrs 모델을
  처음 접하는 지점이다.
- `weave.item.update` / `weave.items.update`의 attrs-bag description을 **슬림 포인터**로 교체:
  "weave.item.add 의 attrsOverride 와 동일한 per-kind attrs 모델(생성 도구 / 캐시된 kinds
  레퍼런스 참조). 바꿀 attrs 만 보내라" + EDIT 고유 규칙(부분 attrs, `attrs:null` = unit 해제,
  frame 좌표=부모 0..1). 단, 슬림 포인터에 **DR-048 임계 규칙 1줄은 인라인 유지**(absolute 부모
  =명시 frame 필요 / auto-layout 부모=frame 생략) — 편집도 frame을 건드리므로.
- 구현: `ATTRS_WITH_TEXT_NOTE`(full, add용)와 `ATTRS_EDIT_NOTE`(slim, update용)를 분리한
  두 const로. 단일 소스 유지(중복 없음).

**기대 절감:** ~4,900 tok → 광고 스키마 16,973 → ~12,100 tok(추가 −29%; WI-205 누적 시
원본 19,525 대비 −38%). cacheRead ≈ ×턴수(평균 ~27~40)라 task당 입력 토큰 대폭↓.

## 품질 리스크 & 검증 (DR-048 교훈 — 필수)

description 슬림화는 "build 턴 줄이기"처럼 **순진하게 하면 품질 회귀**(에이전트가 편집 시 attrs를
오용 → 사후수정 storm)를 부를 수 있다. 따라서:

- [ ] add 경로는 손대지 않음(full note 유지) — 생성 품질 무회귀 보장.
- [ ] update 슬림 포인터에 임계 frame/layout 규칙 1줄 인라인 유지.
- [ ] 라이브 before/after: 동일 프롬프트 N건으로 **수정/생성 비율 + 총 턴 + 시각 품질** 비교
  (DR-046 텔레메트리 + 운영자 육안). DR-048 판정 규칙(총 턴↓ + 품질 동등 이상)을 통과해야 채택;
  회귀 시 롤백(슬림 포인터 → full note 복원).
- [ ] 단위: `weave-command-schemas.coverage.test.ts` / `.layout.test.ts` / `.kit.test.ts` 그린,
  `tsc --noEmit` 클린.

## Acceptance

- ATTRS_WITH_TEXT_NOTE(full) / ATTRS_EDIT_NOTE(slim) 분리, update 두 도구가 slim 사용. ✔
- 광고 스키마 ~12K 부근으로 감소 실측(프로브) — 12,591 tok. ✔
- 전 단위 스위트 그린(294) + tsc 클린. ✔
- 라이브 before/after가 DR-048 판정 통과(총 턴↓·품질 동등 이상) — 미통과 시 롤백. ☐(운영)

## Links

- DR-131 · WI-205/DR-130 · DR-048 · small-think DR-067/HANDOFF-029
- `apps/web/src/features/aku/agent/weave-command-schemas.ts` (ATTRS_WITH_TEXT_NOTE @364, item.update @813, items.update @1051)
