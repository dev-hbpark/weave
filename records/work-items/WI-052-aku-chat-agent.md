# WI-052 — 아쿠 (Aku) design-aware chat agent

## Metadata

| Field | Value |
|---|---|
| ID | WI-052 |
| Title | weave 캔버스에 떠 있는 어시스턴트 "아쿠" — 플로팅 런처 → 확장 채팅 패널 (프롬프트 + 스트리밍 응답 + 이미지 첨부 + 디자인 인식 편집) |
| Owner | hbpark |
| Status | **v1 완료 (mock transport + design-aware tools) + 발견성 iteration(라벨 pill + first-run coachmark) + 배치 iteration(기본 좌상단 + 드래그 이동 + 패널 리사이즈, localStorage 영속). e2e 8/8 봉인. 실제 모델 연결 deferred.** |
| Severity | P2 (신규 기능) |
| Created | 2026-05-30 |

## Why

사용자 요청: 에이전트("아쿠")와 대화하는 UI — 프롬프트 입력 + 서버 스트리밍 응답 표시 + 이미지 전달, 처음엔 플로팅 버튼 → 클릭 시 확장.

## Operator 결정 (착수 전 확인)

- **백엔드 = 지금은 mock, 실제는 나중에.** 전체 UI + 스트리밍 *프로토콜*을 로컬 mock transport 로 완성. 실제 모델(weave Vercel route → Claude SDK, 네이티브 스트리밍 + vision)은 문서화된 후속.
- **디자인 인식(캔버스 편집).** mock 토큰 스트림이어도 캔버스 편집은 **실제** — 전부 `editor.exec("weave.<verb>")` 경유라 undoable (weave History 계약). mock 이 tool-call 을 스크립트해 agent→canvas wire 를 e2e 로 증명, LLM 토큰만 가짜.
- **접근 = 개인/dev 전제.** auth 게이트 없음(weave 는 익명 공유 워크스페이스). LLM 엔드포인트의 prod 비용/남용 리스크는 RISK_NOTES 에 deferred 로 기록, 실제 route 출시 전 하드닝.

## Scope (v1 완료)

- 플로팅 런처(`AkuLauncher`) → 확장 패널(`AkuPanel`, design-system `Panel` floating). `DesignPage` providers 안에 mount, `<body>` portal, z-48.
- composer: design-system 신규 `Textarea`(DR-design-023) + 이미지 첨부(data URL, 썸네일, 4MB cap) + 전송/중지. Enter 전송 / Shift+Enter 줄바꿈. native textarea 라 캔버스 핫키와 충돌 없음.
- 스트리밍: `AkuTransport`(Strategy) + `createMockAkuTransport`(스크립트 토큰 스트림 + 의도 매칭 tool-call) + `useAkuConversation` 루프. 토큰 단위 렌더 + 중지.
- 디자인 인식: `createAkuTools` registry(Rule 6, name→executor map) — `readDocument`(snapshot) + addItem/setBackground/removeItem/updateItemText/insertSlidePreset, 전부 `editor.exec` 위임 → undoable.

## Acceptance

- [x] 런처 클릭 → 패널 확장 / 닫기 → 축소.
- [x] 프롬프트 전송 → 어시스턴트 응답 토큰 스트리밍.
- [x] 이미지 첨부 → 전송 메시지에 썸네일.
- [x] **디자인 인식 증명**: "배경을 파랑으로" → 문서 background 실제 변경(`#3b82f6`) **+ Cmd+Z 복원** (e2e).
- [x] composer 입력 중 캔버스 핫키 미발동 (e2e).
- [x] weave typecheck 0, Aku 파일 biome clean, Aku e2e 4/4 green.

## Deferred (후속)

- 실제 백엔드 `apps/web/api/aku.ts`(Vercel) → `@anthropic-ai/sdk` 스트리밍 + vision + tool-use 루프. mock 의 이벤트 shape == 실제 → `createClaudeAkuTransport` drop-in.
- 접근 제어(rate-limit / 공유 패스프레이즈) — 실제 route 공유 배포 전. (RISK_NOTES)

## Links

- Engineering Plan: `features/aku/ENGINEERING_PLAN.md`
- Decision log: `features/aku/DECISION_LOG.md`
- Risk notes: `features/aku/RISK_NOTES.md`
- Design review: `records/design-reviews/DR-design-023-aku-chat.md` (Textarea + IconArrowUp)
- 코드: `apps/web/src/features/aku/` · mount: `apps/web/src/pages/DesignPage.tsx` · e2e: `apps/web/e2e/aku-chat.spec.ts`
