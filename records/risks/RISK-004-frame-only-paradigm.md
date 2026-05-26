# Risk Review — RISK-004 Frame-only paradigm shift

## Metadata

| Field | Value |
|---|---|
| ID | RISK-004 |
| Title | 4 도메인 → 단일 frame kind paradigm shift 의 6 risk |
| Scope | project (WI-032 의 v1 launch 영향) |
| Reviewer agent | `risk-governance-orchestrator` |
| Triggering Work Item | WI-032 |
| Date | 2026-05-25 |
| Review-by | 2026-06-08 (T-0) |

## 입력 문서

- WI-032 (이 risk review 의 source)
- FR-005 (FEASIBLE WITH TRADE-OFFS — 3 trade-off, R1+R2 scope reduction 권장)
- `docs/product/FRAME_ONLY_PARADIGM_SPEC.md`
- LG-001 (v1 launch gate — T-0 2026-06-08, conditional ready)

## Categories assessed

- [x] **Privacy / data protection** — risk ① (마이그레이션 무손실)
- [ ] Security implementation — N/A
- [ ] Payment / billing — N/A
- [ ] AI safety — N/A
- [x] **Legal / regulatory** — risk ⑥ (광고 surface 의 4 flavor 약속 변경)
- [x] **Ethics / brand trust** — risk ② (inline 편집 UX 일시 후퇴), risk ④ (사용자 churn)
- [x] **Operations / SRE** — risks ①, ③, ⑤
- [x] **Accessibility / i18n** — risk ② (기존 inline 편집 의 한국어 IME 흐름 변화)
- [ ] Supply chain — N/A

## Findings

---

### Risk ① 마이그레이션 데이터 손실 — **2026-05-25 Phase 3c 검증 시 manifest 발견 + 즉시 fix**

**Categories**: Privacy / Ops

- **Impact**: **High** — 기존 디자인 데이터 (slide title, bullets, canvas shapes, doc heading, paragraphs, media caption) 가 변환 중 일부 손실되면 사용자 자산 영구 손실. v1 launch 시점에 LandingPage / Demo 등 공개 surface 가 영향.
- **Likelihood**: **Resolved** — 2026-05-25 발견 시점: `serializer.fromJSON` (storage.ts 의 v5 read path) 가 schema 에 등록되지 않은 kind Item 자체를 drop. Phase 3b 의 schemaRefs cleanup 결과로 production data-loss path 활성화 상태. **같은 세션에 fix**: storage.ts 의 loadDesign 흐름이 fromJSON 이전 raw JSON migration 적용 (`migrateLegacyKindsToFrame` 가 `AgocraftDocument`-cast 된 raw JSON 받음 — id brand string 의 structural 호환 활용). fromJSON 에 도달하는 시점에는 frame kind 만 존재. **`frame-only-migration.spec.ts` 2 spec PASS 로 fix 검증**.
- **Severity (no controls)**: High × Possible = **High**
- **Controls**:
  - 자동 backup — 마이그레이션 직전, 원본 v9 디자인을 `weave.design.v9-backup.<id>` localStorage 키로 1 주 보관. KV 의 경우 `shared:v9-backup:<id>` 키로 보관.
  - Unit test 의무 — 4 변환 각각의 round-trip 테스트 (legacy 데이터 → 변환 → frame paradigm → 동일 시각 footprint).
  - Visual regression e2e — 같은 legacy 디자인을 두 paradigm 에서 렌더한 결과의 pixel-diff < threshold.
  - Soft-launch — v1 launch -2 일에 한 사용자 (hbpark) 의 실제 디자인에 마이그레이션 dry-run. 결과 OK 시 launch.
  - Rollback path — schema v10 → v9 의 역변환 helper (간단하지 않음, 도형 array 가 사라진 경우 손실. backup 키 복원이 안전).
  - **storage.ts 의 loadDesign 흐름 fix 의무 (2026-05-25 발견)**: `serializer.fromJSON` 호출 *전* 에 raw JSON migration 적용. 즉 v5 blob 의 raw `document.root.children` 의 kind 가 legacy 인 경우 raw JSON 레벨에서 변환 (kind="frame" + child primitive Items 의 raw shape) 후 fromJSON 호출. 또는 schema 에 legacy 4 kinds 를 register 한 후 fromJSON 통과 후 마이그.
- **Severity (with controls)**: Low (현재 fix 부재 → **High**, fix 후 Low).

---

### Risk ② Inline 편집 UX 일시 후퇴

**Categories**: Brand / Accessibility/i18n

- **Impact**: **Medium** — slide 의 EditableText title 인라인 single-click 편집 → 일반 text primitive 의 Lexical double-click 편집. 사용자가 "왜 갑자기 한 번에 안 들어가지?" 인식. canvas-design 의 shape 추가도 변화 (이제 일반 shape primitive 의 `weave.item.add`).
- **Likelihood**: **Certain** — paradigm shift 의 직접 결과.
- **Severity (no controls)**: Medium × Certain = **Med**
- **Controls**:
  - In-app announcement — 마이그레이션 직후 frame 선택 시 onboarding tooltip "텍스트는 더블클릭으로 편집".
  - WI-029 의 LexicalTextEditor 가 한국어 IME 검증된 상태이므로 i18n 영향은 거의 0 (text primitive 의 IME 는 이미 PASS).
  - v1.x 에 "frame label 인라인 편집" 회복 — frame.attrs.label 을 캔버스에 작은 텍스트로 노출, single-click 편집.
- **Severity (with controls)**: Low.

---

### Risk ③ v1 launch (2026-06-08) 일정 위반

**Categories**: Ops / SRE

- **Impact**: **High** — LG-001 의 T-0 가 미뤄지면 마케팅 / 사용자 약속 / Ops 영향. WI-029 의 텍스트 v1 도 같이 미뤄짐.
- **Likelihood**: **Possible** — FR-005 §F4 에서 2 주 일정 빠듯, R1+R2 채택해도 3 일 마진 only.
- **Severity (no controls)**: High × Possible = **High**
- **Controls**:
  - **R1 채택 (의무)** — Flavor 4 → 1 축소를 v1.x 로 미룸. Wizard 는 4 flavor 그대로, 내부적으론 모두 frame paradigm. v1 단축.
  - **R2 채택 (의무)** — 29 e2e 의 단계적 갱신. slide 관련 critical e2e 만 v1 전, canvas/doc/media 관련은 v1.x.
  - 일일 checkpoint — D1-D14 의 daily standup (self-review or 1 agent review).
  - Contingency — D11 시점에 D5-D6 Phase 3 가 미완 시 v1 launch postpone 결정 (T-0 -3 일).
  - **Phase 7 deferred trigger** — Phase 7 (LG-001 재평가) 가 critical path 가 아니므로 launch 직후 진행 가능.
- **Severity (with controls)**: Medium × Possible = **Med**.

---

### Risk ④ 사용자 churn — 익숙한 4 도메인 분류 사라짐

**Categories**: Brand

- **Impact**: **Medium** — 기존 사용자가 "slide / canvas / doc / media" mental model 을 가졌다면 frame 단일은 처음에 추상적으로 느껴짐. 익숙하지 않으면 churn.
- **Likelihood**: **Conditional** — 현재 weave 는 alpha 단계, 실 사용자 0 (hbpark + 내부). v1 launch 전 한 사용자의 mental model 만 영향.
- **Severity (no controls)**: Medium × Conditional → **Med**
- **Controls**:
  - 사용자 (hbpark) 의 명시적 결정으로 진행 — paradigm shift 자체가 사용자 의도와 정렬.
  - WI-030 preset 시스템이 살아 있어 "표지 / 아젠다 / 미션…" 의 semantic 카테고리는 유지. 사용자가 카테고리로 mental model 회복 가능.
  - ThumbnailPanel 의 `frame.attrs.label` 옵션으로 "표지" 같은 라벨 보존.
- **Severity (with controls)**: Low.

---

### Risk ⑤ Sync (WI-028) 호환 — Y.Doc 의 frame kind 마이그레이션

**Categories**: Ops / SRE

- **Impact**: **Medium** — Y.Doc 에 저장된 4 도메인 entry 가 새 schema 와 충돌하면 collaborative session 깨짐.
- **Likelihood**: **Unlikely** — WI-028 sync 가 paused (SYNC_ENABLED=false), 실제 cloud collaborative session 0.
- **Severity (no controls)**: Medium × Unlikely → **Low**.
- **Controls**:
  - SYNC_ENABLED=false 유지 (v1 launch).
  - 마이그레이션 helper 가 `agocraft-mirror.ts` 의 `applyPatchToYDoc` / `deriveDocumentFromYDoc` 에도 적용. 첫 로드 시 Y.Doc 도 v9 → v10 변환.
  - Y.Doc 마이그레이션 unit test (sync 21 test 의 확장).
- **Severity (with controls)**: Low.

---

### Risk ⑥ LandingPage / 광고 surface 의 4 flavor 약속 변경

**Categories**: Legal/광고 정확성, Brand

- **Impact**: **Low** — 현재 LandingPage 가 "slide / canvas / doc / media 4 flavor" 를 광고. flavor 가 단순화되면 광고 surface 와 실제 product 의 불일치.
- **Likelihood**: **Certain** (R1 채택하지 않으면) / **Conditional** (R1 채택 시 = wizard 의 4 flavor 광고 유지).
- **Severity (no controls)**: Low × Certain → **Low**
- **Controls**:
  - R1 채택 — wizard 는 4 flavor 그대로 노출. 내부적으로 모두 frame. 광고와 실제 일치 유지.
  - LandingPage 갱신은 v1.x 의 Phase 5 (flavor 축소) 와 동시 진행.
- **Severity (with controls)**: Low.

---

## Severity matrix

| ID | Risk | Severity (no controls) | Severity (with controls) |
|---|---|---|---|
| ① | 데이터 손실 | High | Low |
| ② | Inline 편집 UX 후퇴 | Med | Low |
| ③ | v1 일정 위반 | High | Med |
| ④ | 사용자 churn | Med | Low |
| ⑤ | Sync 호환 | Low | Low |
| ⑥ | 광고 surface | Low | Low |

**Aggregate verdict** = **GO WITH CONDITIONS**. 6 risk 중 controls 적용 후:
- Severity High → 0
- Severity Medium → 1 (risk ③ 일정)
- Severity Low → 5

## Conditions for GO

1. **자동 backup 의무** (R1①) — 마이그레이션 직전, v9 디자인 1 주 보관 (`weave.design.v9-backup.<id>`). 1 주 후 자동 삭제 또는 사용자 명시적 삭제.
2. **마이그레이션 무손실 단위 테스트** (R1①) — 4 변환 각각 + 4 도메인 mix 의 round-trip.
3. **Visual regression** (R1①) — 같은 legacy 디자인의 마이그레이션 전/후 시각 동일 e2e.
4. **R1 (flavor wizard 유지) 채택** (R3) — v1 launch 전 wizard 의 4 flavor 광고는 변경 안 함. 내부적으로 frame paradigm.
5. **R2 (e2e 단계적 갱신) 채택** (R3) — critical slide/preset e2e 만 v1 전, 나머지 v1.x.
6. **일일 checkpoint + D11 시점 contingency 결정** (R3) — D11 (launch -3 일) 까지 Phase 3 (4 *Block 제거) 미완 시 v1 launch postpone.
7. **Phase 7 (LG-001 재평가) launch 직후 진행** (R3) — critical path 가 아니므로 v1 launch 안 막음.
8. **WI-029 LexicalTextEditor 의 IME 보존** (R2) — 한국어 IME 가 text primitive 의 일반 편집에서도 작동 (이미 PASS).

## Review checkpoints

- D7 (2026-06-01): Phase 1+2 (frame kind + 마이그레이션) 완료 확인. backup + unit test PASS.
- D11 (2026-06-04): Phase 3+4 (코드 cleanup + preset 적용) 완료 확인. **contingency 결정 point**.
- T-0 (2026-06-08): LG-001 launch. conditional 8 항목 close 확인.
- T+7d (2026-06-15): v9 backup 삭제. 사용자 churn / 데이터 손실 incident 검토.
