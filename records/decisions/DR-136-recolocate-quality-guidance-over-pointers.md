# DR-136 — 품질-부담 가이드는 콜로케이션 우선, §N 포인터보다 (DR-131/DR-134 부분 supersede)

- **Status:** ACCEPTED (2026-06-13)
- **Work Item:** WI-213
- **Supersedes (부분):** DR-131(WI-206 편집노트 비대칭 슬림), DR-134(WI-209 per-kind §N 포인터화)
  — 두 DR의 *프롬프트-콘텐츠 dedup* 부분만 되돌린다. 도구 표면 de-list(DR-130/DR-132)는 유효.
- **Relates:** DR-048(생성정확성), DR-135, WI-212, HANDOFF-029, small-think DR-067

## 컨텍스트

DR-067("입력토큰 ≈ 턴수 × 정적 prefix")에 따라 prefix 최대 덩어리를 줄이는 트림 4탄
(WI-205/206/207/209)을 진행했다. HANDOFF-029 재측정에서 byo-ssh crPerTurn −33%(중앙)/
−16.5%(평균)로 토큰 효과는 확정됐으나, DR-048 육안 게이트에서 운영자가 **두 모드 공통
완성도 저하**를 판정했다. 로그 국소화: item.add 거부 17 / stale-id 3이 하드 신호, 그 너머의
완성도 저하는 텔레메트리에 안 잡힘.

## 결정 — 콜로케이션 > 단일소스-포인터 (품질-부담 가이드에 한해)

WI-209의 "사실 종류별 단일 소스 + §N 포인터"는 토큰 회계상 옳았으나 **틀린 추상**이었다:
per-kind 품질 가이드는 *중복*이 아니라 *콜로케이션*이다. 모델은 그 kind를 추론하는 순간에
규칙을 봐야 하며, 별도 domain 블록으로의 §N 교차참조는 Claude·GPT 모두 불완전하게 수행한다.

따라서:

| 가이드 종류 | 이전(WI-206/209) | 본 DR |
|---|---|---|
| per-kind 품질 산문 (text SIZING/PLACEMENT/COLOR, frame 슬라이드·배경·레이아웃, chart STYLE, line/poly) | itemKinds → domain §N 포인터 | **itemKinds 인라인 콜로케이션 복원** |
| 편집 도구 attrs (item.update/items.update) | slim 포인터(ATTRS_EDIT_NOTE) | **full ATTRS_WITH_TEXT_NOTE 복원** |
| 차트 생성 노트(item.add) | 6줄 스티어 | full CHART_ATTRS_NOTE 복원 |
| 도구 표면 allow-list (de-list 19개) | 축소 | **유지** (DR-130/132 — 무혐의, WI-212) |

대안 기각:
- ① 트림 전체 유지 + 산문 보강 없이 버티기 → 운영자 육안 판정이 회귀. 기각.
- ② 단일소스 방향만 뒤집기(domain→itemKinds 포인터) → 토큰 동일, 작업량만 큼. 1단계엔 과함.
- ③ 영역별 부분 복원(WI-212식, kind별 1줄) → 완성도는 *전반적*이라 부분 복원으로 부족.
  알려진-양호(트림 직전) 전량 복원이 1단계로 안전.

## 트레이드오프

- (+) 두 모델 완성도 회복(알려진-양호 상태 복귀) + 하드 에러(거부/stale-id) 직격.
- (+) WI-205/207 토큰 절감(광고 −16%)·WI-212 회귀 수정은 보존.
- (−) prefix +6–7K tok/턴 환원 → crPerTurn 개선 −33%→~−8%로 축소. **품질 우선의 의도된 반납.**
- (−) 임시 상태: 토큰을 다시 회수하려면 2단계(동적 광고)가 필요 — 본 DR은 그 전제.

## 후속 — 2단계 (동적 광고)

태스크가 실제 건드리는 kind/tool에만 full 가이드를 광고하고 나머지는 slim. 콜로케이션 품질을
유지하면서 평균 prefix를 다시 낮춘다 — 1단계의 토큰 반납을 회수하는 구조적 해법. 별도 WI/DR로
1단계 라이브 검증 후 착수.

## Verification

WI-213 SVL 참조: tsc 클린, biome 클린, aku/agent 191 + commands 151 + agent-surface coverage
green, 슬림 참조 0. 라이브 육안 게이트(양 모드 완성도 회복)는 운영 대기.

## Links

- WI-213 · DR-131(부분 superseded) · DR-134(부분 superseded) · DR-130 · DR-132 · DR-048 ·
  WI-212 · HANDOFF-029 · small-think DR-067
