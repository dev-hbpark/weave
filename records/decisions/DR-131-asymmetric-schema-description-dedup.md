# DR-131 — 비대칭 스키마 description dedup: 생성은 full, 편집은 slim 포인터

- **Date:** 2026-06-13 · **Status:** Accepted (구현·단위검증 완료 · 라이브 품질검증 운영 대기) · **WI:** WI-206
- **Relates:** WI-205/DR-130(도구 표면 축소), DR-048(생성 노트=레이아웃 오용 방지), small-think DR-067

## Context

WI-205 트림 후에도 광고 스키마의 61%가 `item.add`/`item.update`/`items.update` 3개에 집중되고,
원인은 공유 `ATTRS_WITH_TEXT_NOTE`(2,451 tok)가 셋에 각각 직렬화(4,902 tok 순수 중복) + 같은
모델이 캐시된 WEAVE_CAPABILITIES/DOMAIN_KNOWLEDGE에도 존재(4중 기술). 전부 매 턴 재독 prefix.

순진한 해법(셋 다 슬림화)은 DR-048이 경고한 품질 회귀를 부른다: 생성 시 frame/layout 규칙을
모델이 못 보면 자식이 seed 크기로 떨어지고 사후 setLayout/update storm이 난다.

## Decision

**비대칭 dedup**을 채택한다:
- `weave.item.add` — **full note 유지**. 생성 정확성이 비용/품질을 좌우(DR-048)하고, attrs 모델의
  단일 권위 기술 지점으로 삼는다.
- `weave.item.update` / `weave.items.update` — attrs description을 **slim 포인터**로
  (add의 모델 참조 + 편집 고유 규칙 + DR-048 임계 frame/layout 규칙 1줄 인라인).

근거: 편집은 (a) 이미 생성된 아이템 대상이라 모델이 add 시 full note를 봤고, (b) 캐시 capabilities/
domain이 같은 모델을 prefix에 유지하며, (c) 편집은 "바꿀 attrs만" 부분 전송이라 전체 kind 카탈로그가
인라인일 필요가 낮다. 임계 규칙만 인라인 유지해 회귀 표면을 닫는다.

대안 기각: ①셋 다 슬림 → 생성 품질 회귀 위험(DR-048). ②capabilities로 완전 이관 → capabilities도
prefix라 추가 절감 없음 + 권위 분산. ③`items.update` 제거 → DR-130에서 이미 기각(고유 align/distribute).

## 트레이드오프

- (+) ~4,900 tok 절감(광고 스키마 ~16,973 → ~12,100, 추가 −29% / WI-205 누적 −38%) × 턴수.
- (+) 단일 소스(ATTRS_WITH_TEXT_NOTE full / ATTRS_EDIT_NOTE slim 2 const), 생성 경로 무변경.
- (−) 편집 품질은 슬림 포인터 + 캐시 모델 의존 → **라이브 검증 필수**(DR-048 판정: 총 턴↓·품질
  동등 이상). 회귀 시 롤백.
- (−) FREE surface도 같은 스키마를 쓰므로 편집 description 슬림은 전 flavor 적용(편집 모델은
  flavor 무관이라 무해).

## Verification (구현 시)

`weave-command-schemas` coverage/layout/kit 단위 그린 + tsc 클린 + 스키마 무게 프로브(~12K 확인)
+ 라이브 before/after(DR-046 텔레메트리 + 육안). 미통과 시 롤백.

## Links

- WI-206 · WI-205/DR-130 · DR-048 · small-think DR-067
