# Risk Review — RISK-003 Corner radius direct-drag (PoC)

## Metadata

| Field | Value |
|---|---|
| ID | RISK-003 |
| Title | Corner radius direct-drag PoC 의 3 risk |
| Scope | feature (WI-031 의 PoC) |
| Reviewer agent | `risk-governance-orchestrator` |
| Triggering Work Item | WI-031 |
| Date | 2026-05-25 |
| Review-by | 2026-06-01 |

## Categories assessed

- [ ] Privacy — N/A
- [ ] Security — N/A
- [ ] Payment — N/A
- [ ] AI — N/A
- [ ] Legal — N/A
- [x] **Ethics / brand trust** — risk ①
- [x] **Operations / SRE** — risk ②
- [x] **Accessibility** — risk ③
- [ ] Supply chain — N/A

## Findings

### Risk ① Resize handle 과 cornerRadius handle 시각 혼동

**Categories**: Brand trust

- **Impact**: **Medium** — 사용자가 resize 의도로 코너를 잡았는데 cornerRadius 가 변하면 "맞지 않은 동작" 인식. 신뢰 손실.
- **Likelihood**: **Possible** — 핸들 크기·위치 차별이 모호하면 oops 빈발.
- **Severity (no controls)**: Med
- **Controls**:
  - Resize handle = 코너 외각 정사각 (현재). cornerRadius handle = 코너 안쪽 (frame 내부 ~12-16px) 작은 dot. 명확한 spatial separation.
  - Hover affordance — 핸들마다 다른 cursor (resize = `nw-resize`, cornerRadius = `radial`). Tooltip 0.5s delay: "코너 반경 조절".
  - Edit mode 진입 후 cornerRadius handle 의 등장에 200ms fade-in (사용자 인지 시간).
- **Severity (with controls)**: Low.

### Risk ② Drag 의 60Hz 가 mergeKey 미적용 시 history 폭주

**Categories**: Ops / SRE

- **Impact**: **High** — 1 초 드래그 = 60 history entry. Cmd+Z 60 번 눌러야 원복. 사용자가 사실상 "되돌리기 불가" 인식.
- **Likelihood**: **Certain** (mergeKey 누락 시).
- **Severity (no controls)**: High.
- **Controls**:
  - `mergeKey = "propertyDrag:cornerRadius:" + itemId` 의무. 같은 mergeKey 의 patch 가 historyMergeWindowMs (현재 ~500ms 추정) 안에서 자동 collapse.
  - Unit test: 60 patch emit → history.length += 1 검증.
  - e2e: 드래그 후 Cmd+Z 1 번 = 0 으로 복귀.
- **Severity (with controls)**: Low.

### Risk ③ Keyboard / accessibility 손실

**Categories**: Accessibility

- **Impact**: **Medium** — direct-drag 만으로는 키보드 사용자가 cornerRadius 조절 불가. WCAG 2.1.1 위반 가능.
- **Likelihood**: **Certain** (PropertiesPanel 슬라이더가 그대로 존재하지 않으면).
- **Severity (no controls)**: High.
- **Controls**:
  - **PropertiesPanel 의 borderRadius slider 보존**. 키보드 사용자는 슬라이더로 동일 결과 도달. WCAG 2.1.1 충족.
  - cornerRadius handle 에 `aria-label="코너 반경 조절"` + `role="slider"` + `aria-valuenow`/`aria-valuemin`/`aria-valuemax` 명시. Arrow keys 로 0.05 increment 지원 (focus 시).
- **Severity (with controls)**: Low.

## Severity matrix

| ID | Risk | Severity (no controls) | Severity (with controls) |
|---|---|---|---|
| ① | Handle 시각 혼동 | Med | Low |
| ② | 60Hz history 폭주 | High | Low |
| ③ | 키보드 손실 | High | Low |

**Aggregate verdict** = **GO WITH CONDITIONS** (3 condition 모두 controls 박제 시 Low).

## Conditions for GO

1. Resize handle 과 cornerRadius handle 의 명확한 spatial separation + cursor / tooltip 차별.
2. mergeKey 의무 + history.length += 1 unit test.
3. PropertiesPanel 슬라이더 보존 + handle 의 keyboard interaction (arrow keys).
