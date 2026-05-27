# RISK-008 — Clipboard (copy / cut / paste) (GO WITH CONDITIONS)

## Metadata

| Field | Value |
|---|---|
| ID | RISK-008 |
| WI | WI-041 |
| Date | 2026-05-27 |
| Owner | hbpark |
| Verdict | **GO WITH CONDITIONS** (7 risk → 모두 mitigated path 있음) |

## Scope

WI-041 / FR-008 / DR-019 의 4 target × cross-tab clipboard. 의 7 risk surface + condition.

## Risk 표

| # | Risk | Severity | Likelihood | Mitigation | Owner |
|---|---|---|---|---|---|
| R1 | **데이터 무결성 — relations.topology 재매핑 누락 시 frozen reference** (Master/Follower / Hotspot 의 source/targets 가 paste 후 원본 ItemId 참조 → cross-doc 시 깨짐) | High | Medium (HANDOFF-016 의 cover 안 하면 Confirmed) | HANDOFF-016 의 `remapIds` 가 Relations topology 까지 cover 의무. agocraft unit test 의 relation-registry cross-doc paste 케이스 의무. weave e2e 에서 Master-Follower 쌍 copy/paste → 정합성 확인. | agocraft (HANDOFF-016) |
| R2 | **History 정합 — paste 가 단일 transaction 으로 묶이지 않으면 Cmd+Z 가 부분 reverse** | High | Low (D2 의 item.create variant 가 cover) | D2 채택 (DR-019). agocraft 의 TransactionRunner 가 단일 patch 로 emit. weave e2e 의 "단일 Cmd+Z 로 paste 전체 reverse" 검증. | agocraft + weave |
| R3 | **CRDT 보류 영향 — paste 가 CRDT 재개 시점에 호환 가능한 patch shape 이어야 함** (WI-028 paused 상태지만 future) | Medium | Low | HANDOFF-015 의 Yjs bridge 처리 의무 (`applyPatchToYDoc` / `seedYDocFromDocument` / `deriveDocumentFromYDoc` 가 item.create 처리). sync 테스트 21+α PASS. | agocraft (HANDOFF-015) |
| R4 | **Cross-tab schema drift — 두 탭이 다른 release 일 때 paste silent drop** | Medium | Medium (release cycle 동안 사용자가 두 탭 열어둘 가능성 일반) | payload 의 `schemaVersion`, `appVersion` 필드 + version mismatch 시 silent drop + telemetry hook. v1.1 의 "탭 새로고침 필요" toast 추가 검토. | weave |
| R5 | **시스템 clipboard 권한 — `navigator.clipboard.read` 의 focus + user-gesture 의무** | Low | Low (우리 핸들러 우선 사용 → 권한 의존 0) | v1 은 BroadcastChannel + in-memory store 우선, system clipboard 는 text/plain write 만 (read 불사용). Paste Special 의 future "From clipboard" 항목만 read 의존 — 그 때 dedicated permission flow. | weave |
| R6 | **포커스 layer 혼선 — Lexical 안에서 Cmd+C 가 우리 핸들러로 잘못 잡히면 한글 IME 조합 중 텍스트 손실** | High | Medium (직접 박제: feedback react_portal_event_bubbling) | D7 의 focused-context 분기 + `useIsTextEditing` hook + `composition*` event guard. e2e (한글 IME smoke) 4-browser 의무. | weave |
| R7 | **Frame paste 의 children 폭주 — depth limit 부재 시 sub-tree 가 nested frame 포함 → exponential paste** | Medium | Low (nested frame 일반적이지 않음) | MAX_PASTE_NODES (기본 500) 게이트. copy 시점에 노드 카운트 → 초과 시 toast 로 거부. frontend-performance-agent 의 sign-off. | weave |

## Conditions for build (GO 의 의무사항)

1. **HANDOFF-014/015/016 land + agocraft vendor refresh** — 미land 시 P3+ Build 블로킹 (no compromise).
2. **HANDOFF-015 의 Yjs bridge 3 처리 PASS** — applyPatchToYDoc, seedYDocFromDocument, deriveDocumentFromYDoc 모두. sync test 21+ PASS.
3. **HANDOFF-016 의 Relations topology cover** — Master/Follower + Hotspot e2e PASS.
4. **payload schema field** — `schemaVersion: 1`, `appVersion: string`, `origin: string`, `timestamp: number` 의무.
5. **`useIsTextEditing` hook 단일 진실 (Rule 6)** — Lexical focus + InteractionMode 합성. inline mode check 금지.
6. **e2e gate**:
   - Items: 5 spec (copy/cut/paste, ContextMenu, cross-frame).
   - Frame deep + cross-tab: 3 spec.
   - Rich text: 3 spec (한글 IME 조합 케이스 포함).
   - Paste Special: 2 spec.
7. **MAX_PASTE_NODES 게이트** — 기본 500, frontend-performance-agent sign-off 후 조정.
8. **4-browser 수동 IME smoke (한 / 일)** — Chromium / Firefox / Safari / Edge. LG-002 condition.
9. **DR-design-017 발행** — Paste Special dialog 의 RadioGroup walk 결과 박제.
10. **AGENT_EVALUATION** — `clipboard-specialist` domain specialist 출현 여부 (`/bootstrap-domain --refresh` 후 evidence).

## Verdict

**GO WITH CONDITIONS** — 7 risk 모두 mitigated path 있음. 가장 큰 외부 의존은 agocraft HANDOFF 3건 (Condition #1~#3). 의 내부 risk 는 모두 e2e / hook / 게이트 로 cover. v1 launch (2026-06-08, LG-001) 안에 최소 P3 (Items single) land 가능 — P4~P6 는 LG-002 별도 진행 시 권장.

## Open questions

- BroadcastChannel 의 `weave.clipboard.v1` 채널명 의 future versioning 정책 (`v2` 분기 시점은?).
- `applicationsetText` 의 외부 앱 copy 시 text label 의 형식 — kind 별 (frame name / text plain / shape "Shape <N>") 의 표준.
- Cross-account paste 의 future 정책 — CRDT 재개 후 별도 RISK 신설.

## Links

- WI-041, FR-008, DR-019.
- agocraft WI-018, HANDOFF-014/015/016.
- WI-028 (CRDT paused) — R3 의 future 의존.
- WI-036 (multi-select) — Items multi-paste 시점.
- feedback `react_portal_event_bubbling` — R6 의 근거.
- feedback `react_strictmode_singleton_dispose` — clipboard store 의 안전 박제.
- LG-001 — text v1 launch gate (P3 까지 포함 시 conditional close 후보).
- LG-002 (TBD) — P4~P6 별도 launch gate.
