# Risk Review — RISK-002 Slide layout presets

## Metadata

| Field | Value |
|---|---|
| ID | RISK-002 |
| Title | Slide layout presets (8 카테고리 × ~3 variant = 24 preset) 박제의 6 risk 평가 |
| Scope | feature (WI-030 의 build·launch 영향) |
| Reviewer agent | `risk-governance-orchestrator` |
| Triggering Work Item | WI-030 |
| Date | 2026-05-25 |
| Review-by | 2026-06-15 (Target date) |

## 입력 문서

- WI-030
- FR-003 (FEASIBLE WITH TRADE-OFFS — 3 trade-off 박제)
- `docs/product/SLIDE_PRESETS_SPEC.md`

## Categories assessed

- [ ] Privacy / data protection — N/A (preset 은 정적 코드, 사용자 데이터 비포함)
- [ ] Security implementation — N/A
- [ ] Security governance / compliance — N/A
- [ ] Payment / billing / refund — N/A
- [ ] AI safety — N/A (v1 AI 미포함)
- [x] **Legal / regulatory** — risk ⑥ (자산 라이센스)
- [x] **Ethics / brand trust** — risk ① (다양성 손실)
- [x] **Operations / SRE** — risk ②, ③, ④
- [x] **Accessibility / i18n** — risks ②, ⑤
- [ ] Supply chain — N/A (외부 라이브러리 의존 없음)

## Findings per risk

---

### Risk ① "정답" preset 으로 인한 사용자 다양성 손실

**Categories**: Brand trust

- **Impact level**: **Medium** — weave 의 모든 데크가 비슷해 보이는 "templatized" 외관이 brand 차별화를 약화. 사용자가 "weave 로 만든 슬라이드는 다 똑같다" 인식 발생 시 retention 영향.
- **Likelihood**: **Possible** — preset 사용률이 너무 높으면 (목표 50%+, 그러나 70%+ 도 가능) 변주 3개로는 다양성 부족.
- **Severity**: Medium × Possible = **Med**
- **Specific finding**: 24 preset 의 정적 박제 자체보다 **사용자가 preset 으로부터 얼마나 멀어지는가** 가 결정적. Beautiful.ai 의 16 layout 도 비슷한 문제를 가졌고, Canva 가 30+ variants/category 로 풀었던 동일한 패턴.
- **Required controls**:
  - **UI 카피**: preset 픽커의 헤드라인이 "이대로 시작" 이 아닌 **"추천 시작점"** 톤. "Edit freely after insert" 의 명시.
  - **child Item 의 즉시 편집성**: preset 삽입 직후 첫 텍스트 Item 이 자동 선택 + 인라인 편집 모드로 진입 (사용자가 즉시 변형하도록 유도).
  - **Telemetry**: preset 삽입 후 60 초 이내 child Item 의 텍스트 변경 횟수 측정. < 1 회 평균이면 "그대로 사용" 경향 → v1.x 에서 추가 변주 필요.
  - **v2 에서 user-defined preset 저장 채널** 명시 (사용자가 자신의 변형을 저장).
- **Owner**: `product-discovery-agent` + `design-system-agent`
- **Specialist citation**: SLIDE_PRESETS_SPEC.md §2 competitive landscape

---

### Risk ② preset 내부 텍스트의 contrast / typography 가 WCAG AA 미달

**Categories**: Accessibility/i18n

- **Impact level**: **High** — preset 의 default text color / size / background combination 이 WCAG AA (4.5:1 contrast, 14pt 이상 일반 텍스트, 18pt 이상 large) 미달 시, 모든 24 preset 이 동일 결함을 carry. 다수 사용자 영향.
- **Likelihood**: **Possible** — 디자인 의도 (e.g., accent text on accent background) 가 contrast 의도를 가릴 수 있음. 24 preset 의 매뉴얼 검증 누락 가능.
- **Severity**: High × Possible = **High**
- **Specific finding**: weave 의 design-system token (`--text-default`, `--text-soft`, `--accent`, …) 만 사용하면 contrast 가 자동 보장되지만, preset 의 일부 변주 (`cover.asymmetric` 의 accent-block 위 텍스트, `problem.stat-callout` 의 큰 통계 숫자) 가 token 외 색을 쓸 유혹이 큼.
- **Required controls**:
  - **CI gate**: 24 preset 의 모든 default text Item 의 (color × background) 조합이 contrast ≥ 4.5:1 인지 자동 검증. `tools/check_preset_contrast.ts` 신설.
  - **Token-only 정책**: preset 의 모든 색은 design-system token 으로만 정의 (no raw hex). 임의 색 금지.
  - **Font size 최소 12pt** (디자인 의도 상 작은 메타 라벨이라도 12pt 이하 금지).
  - **Test**: e2e 의 visual regression snapshot 외에도 `expect(getContrastRatio(textColor, bgColor)).toBeGreaterThanOrEqual(4.5)` assertion.
- **Owner**: `design-system-agent` + `accessibility-agent`
- **Specialist citation**: WI-030 §AC "Accessibility: 모든 프리셋의 텍스트 contrast WCAG AA"

---

### Risk ③ Bundle size 회귀 (preset 박제 후 점진 증가)

**Categories**: Ops / SRE

- **Impact level**: **Low** — FR-003 § F3 추정 ~15 KB gz. weave main bundle 의 현재 ~272 KB gz 대비 +5%. Lighthouse 영향 ≤ 50 ms.
- **Likelihood**: **Unlikely (v1)** — 24 preset 만 박제. **Possible (v2)** — user-defined preset / illustration 자산 / 카테고리 추가 시 증가.
- **Severity**: Low × Unlikely = **Low** (v1) / Medium × Possible = **Med** (v2)
- **Specific finding**: v1 의 24 preset 은 안전하지만, v2 의 확장이 누적되면 main bundle 이 무거워짐. 카테고리 추가 정책 부재 시 무제한 증가.
- **Required controls**:
  - **Bundle budget CI gate**: preset registry + 모든 preset 정의 ≤ 60 KB gz. 초과 시 build 실패.
  - **v2 시 lazy chunk 정책**: 사용자가 preset 픽커를 열기 전까지 preset 코드 미로드. Picker open 이벤트 → dynamic `import()` 1회.
  - **카테고리 추가 정책**: 신규 카테고리는 DR + telemetry 데이터 (사용 빈도) 가 필요 (WI-030 §3 박제).
- **Owner**: `frontend-perf-agent`
- **Specialist citation**: FR-003 §F3, WI-030 §AC "Bundle budget"

---

### Risk ④ Schema 변화 시 24 preset 의 동시 breakage

**Categories**: Ops / SRE

- **Impact level**: **Medium** — agocraft 의 TextAttrs / ItemAttrs schema 가 변경되면 24 preset 의 child Item 정의가 같은 PR 에서 같이 업데이트 안 되면 build/runtime fail.
- **Likelihood**: **Possible** — WI-029 가 schemaVersion 6→9 로 4 회 bump 했음. agocraft 의 추가 schema 변화 가능.
- **Severity**: Medium × Possible = **Med**
- **Specific finding**: preset = 정적 코드 = schema dependency. agocraft 의 `defaultTextAttrs` / `createTextAttrs` 같은 helper 를 통해 정의하면 schema bump 시 자동 따라감.
- **Required controls**:
  - **Helper 의무**: preset 의 모든 child Item 은 `createTextAttrs` / `createShapeAttrs` 같은 agocraft 의 factory 사용 의무. raw object literal 금지.
  - **Type check**: preset factory 의 반환 타입이 `Item<DomainKind>` 로 엄격 typed. agocraft schema 변경 시 typecheck 가 24 preset 모두에 즉시 깨짐 (조기 감지).
  - **Unit test**: 24 preset 모두에 대해 "factory 호출 → 유효 AgocraftItem 반환" smoke test.
- **Owner**: `frontend-architecture-agent`
- **Specialist citation**: WI-029 의 schema bump 이력 (memory `project_weave_wi029_*_phase_a/b/c`)

---

### Risk ⑤ i18n 확장 비용 (24 preset × N 언어)

**Categories**: Accessibility/i18n

- **Impact level**: **Medium** — 한국어 + 영어 = 박제 시 작업량 ≈ 24 × 6 child × 2 lang ≈ 288 문자열 박제. 일본어/중국어 추가 시 같은 양. 번역 품질 또한 brand impact.
- **Likelihood**: **Certain** (확장 발생 시).
- **Severity**: Medium × Certain → **Med** (controls 적용 시 Low)
- **Specific finding**: 각 preset 의 child Item 텍스트가 `LocalizedText` (WI-026) 패턴이라면 새 언어 추가 = 새 키 추가만. 코드 변경 0. 단 번역 품질이 사용자 신뢰의 핵심.
- **Required controls**:
  - **i18n 패턴 의무**: preset 의 모든 default 텍스트는 `LocalizedText { ko, en, ... }` 형식. raw 문자열 금지.
  - **Fallback 정책**: 키 없음 시 `en` → `ko` 순. 영어 fallback 항상 보장.
  - **새 언어 추가 = 데이터 PR**: 번역만 PR (코드 0 줄). Native speaker review 의무.
- **Owner**: `design-system-agent` (LocalizedText 정착) + future native reviewer
- **Specialist citation**: WI-026 (CommandMetadata 의 LocalizedText 정착)

---

### Risk ⑥ 자산 라이센스 (v1 도형만, v2 이미지/일러스트 도입 시)

**Categories**: Legal / regulatory

- **Impact level**: **Low (v1)** — v1 의 preset 은 도형 + 텍스트 + design-system token 만 사용. 외부 라이센스 의존 0.
- **Likelihood**: **N/A (v1)** / **Possible (v2)** — v2 에서 사진/일러스트 도입 시.
- **Severity**: Low × N/A = **Low** (v1).
- **Specific finding**: v1 은 라이센스 위험 없음. v2 의 illustration 도입 시 (a) Unsplash/Pexels 같은 free license 사용, (b) 자체 제작, (c) 라이센스 구매 — 정책 박제 필요.
- **Required controls**:
  - **v1 정책**: preset 내부에 외부 자산 (image src, font URL, illustration) 금지. design-system token + 기본 도형만.
  - **v2 박제**: 자산 도입 시 LICENSE 박제 (각 자산의 라이센스 텍스트), `LICENSES.md` 갱신, 사용 가능 시나리오 명시.
- **Owner**: `legal-compliance-agent` (v2 시)
- **Specialist citation**: WI-030 §Out of scope "preset 내부의 이미지 자산"

---

## Severity matrix

| ID | Risk | Severity (no controls) | Severity (with controls) |
|---|---|---|---|
| ① | 다양성 손실 | Med | Med |
| ② | Contrast / WCAG | High | Low |
| ③ | Bundle size 회귀 | Low (v1) | Low |
| ④ | Schema breakage | Med | Low |
| ⑤ | i18n 확장 비용 | Med | Low |
| ⑥ | 자산 라이센스 | Low (v1) / Med (v2) | Low |

**Aggregate verdict** = **GO WITH CONDITIONS**. 6 risk 중 Severity High = 1 (risk ②), controls 적용 후 Low 로 mitigation. 나머지는 Low/Med, accepted.

## Conditions for GO

1. **CI: preset contrast check** — 24 preset 의 모든 text/bg 조합 WCAG AA (4.5:1) ≥ 자동 검증.
2. **Policy: token-only color** — preset 의 색은 design-system token 만. raw hex 금지.
3. **Policy: helper-only attrs** — preset child Item 의 attrs 는 agocraft factory (`createTextAttrs` 류) 의무.
4. **Policy: LocalizedText 의무** — preset 의 모든 default 텍스트는 `{ ko, en }`.
5. **CI: bundle budget** — preset registry + 정의 ≤ 60 KB gz.
6. **UI: "추천 시작점" 카피** — picker 의 헤드라인이 "이대로 시작" 아닌 톤. + preset 삽입 직후 첫 텍스트 inline-edit 자동 진입.
7. **Telemetry**: preset 삽입 후 60 초 이내 child 텍스트 변경 횟수 측정. v1 launch 후 30 일 데이터 가지고 v1.x 변주 확장 판단.

## Review checkpoints

- T-0 (2026-06-15 target launch): conditions 1-6 PASS 확인. condition 7 telemetry wire 확인.
- T+30d: telemetry 데이터로 risk ① re-evaluate. v1.x 카테고리/변주 추가 판단.
