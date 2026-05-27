# FR-008 — Clipboard (copy / cut / paste) (FEASIBLE WITH TRADE-OFFS)

## Metadata

| Field | Value |
|---|---|
| ID | FR-008 |
| WI | WI-041 |
| Date | 2026-05-27 |
| Owner | hbpark |
| Verdict | **FEASIBLE WITH TRADE-OFFS** |

## Question

복사 / 자르기 / 붙여넣기를 4 target (Items / Frame / Rich text / Properties-only) 으로, 같은 origin 다른 탭 까지, 현재 state of the art (Browser Baseline + agocraft 의 patch 모델 + Lexical RichTextPlugin) 로 만들 수 있는가? 의 intrinsic limit 은? 의 unavoidable trade-off 는?

## State of the art

| Layer | 표준 / 라이브러리 | 평가 |
|---|---|---|
| BroadcastChannel | W3C HTML Living Standard | Widely Available (Chrome 54+, Firefox 38+, Safari 15.4+). Same-origin tabs 사이 message broadcast. payload 크기 무제한 (structured clone). |
| Clipboard API (`navigator.clipboard.{readText,writeText}`) | W3C Clipboard API | Widely Available (모든 modern browser). focus + secure context (HTTPS) 필요. |
| Clipboard API custom MIME (`write` + `ClipboardItem` with custom MIME) | Living Standard | Limited — Chrome 76+, Safari 17.4+ (web custom format), Firefox 127+. v1 의무 사용 안 함 (D4 가 BroadcastChannel 선택). |
| localStorage | W3C Web Storage | Universal. 5-10 MB origin quota. private mode 일부 브라우저 throw. |
| Lexical (Meta) | MIT, 0.21+ | RichTextPlugin 의 기본 paste handler 가 HTML/text mime 처리. composition* event 지원 (한글 IME). |
| agocraft Patch | 내부 (WI-018) | item.create variant 추가 의무 — D2 박제. |

3 가지 비교 (Figma / Notion / Canva):

- **Figma**: Cmd+C (Items/Frame), Cmd+X, Cmd+V (마우스 위치), Cmd+Opt+V (Paste Properties). Cross-tab 작동 (BroadcastChannel + Figma 내부 sync). Cross-design 작동.
- **Notion**: 블록 Cmd+C/X/V, Paste Special 부재 (Markdown paste 만 옵션). Cross-tab 부분 작동.
- **Canva**: Cmd+C/X/V, Paste Special 없음. cross-design paste 됨 (cloud 기반).

→ Figma 식 4 target + BroadcastChannel cross-tab + Paste Special dialog 가 product-tier 표준.

## 의존 분석

| 기술 | 평가 | 의존도 |
|---|---|---|
| BroadcastChannel | Widely Available, Baseline | 필수 (D4) |
| localStorage fallback | Universal | 필수 (private mode) |
| Clipboard.writeText (text/plain) | Widely Available | optional (외부 앱 보조 paste — v1 거부지만 text label 만 동시 write 검토) |
| structured clone (postMessage 용) | Baseline | 필수 (BroadcastChannel payload 무결성) |
| Lexical RichTextPlugin 기본 paste | MIT | 의존 — override 없음 (D7) |
| agocraft serializeItemSubtree | 신규 (HANDOFF-014) | 필수 |
| agocraft item.create patch (D2) | 신규 (HANDOFF-015) | 필수 |
| agocraft remapIds (D3) | 신규 (HANDOFF-016) | 필수 |
| `nanoid` / UUID v7 | agocraft 가 이미 사용 | 추가 의존 0 |
| design-system Dialog + RadioGroup | 기존 (Dialog OK, RadioGroup 확인 필요) | DS Triage 결과 별 |

기술적 conflict / Baseline gap **없음**. agocraft 측 신규 3 건은 도메인 자연 확장.

## Trade-off (7 sign)

| # | Trade-off | 평가 |
|---|---|---|
| T1 | Selection 모델이 v1 단일 선택만 | Items multi-paste 는 WI-036 land 후 자동 활성화 (commands 의 selection adapter 만 확장). v1 의 단일 paste 도 사용자 기대치 충족 (Figma 도 같은 default). |
| T2 | Cross-tab 의 schema version mismatch silent drop | 두 탭이 다른 release 일 때 paste 가 silent 거부됨. toast 없이 telemetry 만 — 사용자에게 "왜 안 됨" 의 mental model 약함. v1.1 에 "탭 새로고침 필요" toast 추가 검토. |
| T3 | External app paste 거부 (v1) | 사용자가 외부 이미지 / 텍스트 paste 기대 가능. v1 은 Paste Special 의 별도 "From clipboard" 항목 으로 분리 안내. v1.1 web custom format Baseline 후 활성화. |
| T4 | Lexical 의 paste 와 우리 paste 의 focused-context 분기 | contenteditable focused 일 때만 위임 — 분기 로직 e2e 박제 의무. IME 조합 중 Cmd+C 가 텍스트 손실 trigger 위험 (`composition*` event guard 필수). |
| T5 | Frame deep copy 의 폭주 위험 | nested frame 가 children 폭증 시 paste payload size 무제한 → BroadcastChannel quota 압박. MAX_PASTE_NODES (기본 500) 게이트로 차단. |
| T6 | History 의 단일 transaction 보장 의무 | paste 가 N 개 patch 로 쪼개지면 Cmd+Z 가 부분 reverse → user trust 손상. item.create variant (D2) 가 단일 patch 보장 → 의존성 high. |
| T7 | CRDT 재개 호환성 | WI-028 paused 상태지만 future 재개 시 Yjs bridge 가 item.create variant 처리 필요. HANDOFF-015 가 bridge 처리 의무 명시. |

## Intrinsic limits

| 한계 | 본질 |
|---|---|
| Cross-account paste 불가 | 두 사용자가 같은 BroadcastChannel 에 참여하지 않음. CRDT 재개 + presence layer 까지 가야 가능. v1 명시적 out of scope. |
| External app → weave paste (v1) | web custom format Baseline limited (Safari 17.4+ 만) — fallback (HTML/text) 으로 처리하면 정보 손실 큼. v1 의도적 거부. |
| Clipboard API `read()` 권한 | user-gesture + focus + HTTPS 의무 — paste 가 의도와 다르게 거부될 수 있음. v1 은 우리 store 우선 사용 → 권한 의존 0. |
| 한글 IME 조합 중 Cmd+C | composition*-aware. 조합 중 Cmd+C 는 silent ignore (브라우저 표준 동작). |

## Verdict

**FEASIBLE WITH TRADE-OFFS** — 모든 기술이 Baseline / Widely Available 범주. 의 trade-off 는 모두 mitigated path 있음 (T2/T3 는 v1.x 추가, T4/T5 는 e2e 게이트, T6/T7 은 D2 의 item.create variant 가 cover). intrinsic limit 은 v1 scope 밖이거나 사용자 인지 가능.

## Conditions for build

- **D2 (item.create variant) land 의무** — single-transaction Cmd+Z 보장의 근본.
- **D3 (remapIds) 의 Relations topology cover** — Master/Follower, Hotspot 등 cross-document copy 시 reference 무결성.
- **D4 (BroadcastChannel) 의 schema version 필드 의무** — silent drop 정책 명시.
- **D6 (Paste Special) 의 DS Triage walk 박제** — RadioGroup primitive 존재 확인 후 Step 2 Extended 또는 Step 3 Grew + DR-design-017.
- **D7 (Lexical 위임) 의 IME e2e gate** — `composition*` event 동안 우리 핸들러 비활성, 4-browser 수동 IME smoke (한 / 일).
- **MAX_PASTE_NODES 게이트** — Phase 4 의 비탈주 의무.
- **vendor agocraft refresh** — HANDOFF-014/015/016 완료 + `CURRENT_SCHEMA_VERSION 10` 확인.

## Specialist sign-off (pending)

- `library-adoption-supply-chain-governance-agent` — BroadcastChannel API + Lexical 의 paste override 가능성 (이미 의존 사실 확인). PR 시 추가 검증 의무.
- `standards-runtime-platform-intelligence-agent` — Clipboard API + BroadcastChannel + Web custom format 의 Baseline 평가 확인.
- `frontend-performance-agent` — BroadcastChannel payload size + paste 의 layout cost (MAX_PASTE_NODES 게이트 의 적정선 확인).

## Links

- WI-041 — 의 build 의무.
- DR-019 — D1~D7 결정.
- RISK-008 — risk + condition.
- agocraft WI-018 + FR-007 — split.
- HANDOFF-014/015/016 — agocraft 측 의존.
- WI-040 — mode gate (paste 의 enabledWhen 합성).
- WI-036 — multi-select (Items multi-paste 의 trigger).
- WI-028 — CRDT (재개 시 item.create variant 호환 의무, paused 상태).
