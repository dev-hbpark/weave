# WI-186 — OS 클립보드 weave 마커 + paste 라우팅 네이티브 이벤트 전환

- 상태: DONE (2026-06-12)
- 출처: WI-185 잔여 항목 ("내부 copy 1회가 세션 내내 OS 이미지를 가림") + DR-121 결정 4의 근본해결 예고
- 결정: DR-122
- 선행: WI-185 ⑰ (OS 이미지 paste, 키다운 프로브 라우팅)

## 문제

WI-185 ⑰의 paste 우선순위는 **키다운 시점의 내부 스토어 프로브**였다:
스토어 비면 preventDefault 생략 → 네이티브 `paste` → OS 이미지 ingest.
내부 스토어는 세션 내 한 번이라도 copy하면 비워지지 않으므로, **내부
copy 1회 후에는 사용자가 나중에 복사한 OS 스크린샷이 영원히 내부 paste에
가려졌다** (어느 쪽이 "더 최신 복사"인지 판별 수단이 없었음).

## 해결 — 마커 = 최신성 오라클 (상세는 DR-122)

1. **copy/cut 성공 시 OS 클립보드에 `weave:clipboard:v1` 텍스트 마커 기록**
   (`navigator.clipboard.writeText`, fire-and-forget). 클립보드 쓰기는
   전체 교체이므로, paste 시점의 마커 존재 = "weave copy가 최신" 판별.
2. **paste 라우팅을 네이티브 `paste` 이벤트로 이동** — 클립보드 내용을
   동기로 읽을 수 있는 유일한 지점. 라우팅 표:
   - 마커 있음 → 내부 paste 디스패치 (`dispatchClipboardVerb("paste")`)
   - 이미지 파일 + 마커 없음 → OS 이미지 ingest (기존 ⑰ 경로)
   - 둘 다 없음 + 내부 스토어 비어있지 않음 → 내부 paste (외부 텍스트
     복사가 마커를 덮은 경우의 폴백 — weave는 OS 텍스트 ingest가 없으므로
     WI-186 이전 동작과 동일)
3. **건강도 폴백**: 마커 쓰기가 한 번도 성공 못 했거나 최근 실패 →
   `osMarkerRoutingActive()` false → Cmd+V 키다운은 기존 WI-185 프로브
   라우팅 유지 (내부 우선). 클립보드 API가 죽어도 paste가 죽지 않는다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `src/document/clipboard/os-clipboard-marker.ts` | 신규 — 마커 상수/쓰기/건강도/이벤트 판별 |
| `src/document/clipboard/use-clipboard-commands.ts` | copy/cut 성공 시 `writeOsClipboardMarker()` |
| `src/document/tooltip/editor-hotkeys.ts` | `dispatchClipboardVerb` export + Cmd+V 가드: 마커 활성 → 항상 양보, 아니면 레거시 프로브 |
| `src/pages/design/hooks/use-os-paste-routing.ts` | 신규 — `use-os-image-paste.ts`를 일반화·대체(Decommission Sweep: 구 파일 삭제). 라우팅 표 ①②③ |
| `src/pages/DesignPage.tsx` | 훅 교체 (`useOsPasteRouting`) |
| `playwright.config.ts` | `permissions: ["clipboard-read","clipboard-write"]` — 헤드리스 Chromium은 권한 없이는 합성 Cmd+V에서 네이티브 paste 이벤트를 발화하지 않음 (실브라우저 실사용자 입력은 항상 발화) |

## e2e 스펙 정리 (같은 변경에서 — WI-072/WI-180 미갱신 스펙 잔재 해소)

- `clipboard-frame-crosstab.spec.ts` deep-copy, `editor-shortcuts.spec.ts`
  :190/:207 — 프레임을 선택한 채 paste하면 DR-118 계약상 **그 프레임
  안으로** 들어가는데, 스펙은 루트 형제를 기대 (DR-118 §알려진 이슈의
  pre-existing red와 같은 계열; WI-186과 무관하게 HEAD에서도 red 확인).
  copy 후 선택 해제로 계약 충돌 제거 — 스펙의 본래 목적(딥카피 id 신선성
  / paste 자동선택 / 다중선택 paste)은 그대로 유지.
- 함께 커밋: e2e `helpers.ts` `setSelection` 다중선택 버그 수정 (WI-185
  잔여 #2 — 존재하지 않는 `addMany` 프로브가 last-wins 단일로 붕괴 →
  단일은 `set`, 2+는 `setMany`) + batch3 스펙의 스펙-로컬 우회 헬퍼 제거.

## 검증 (Continuous Self-Verification)

- 단위: `os-clipboard-marker.test.ts` 8개 (건강도 천이 5 + 이벤트 판별 3)
  — 전체 vitest **1186/1186 green**.
- e2e 신규 `clipboard-os-marker.spec.ts` **3/3 green**:
  ① 마커 paste 이벤트 → 내부 디스패치, ② 내부 copy 후 OS 이미지(마커
  없음)가 이김 — **잔여 항목의 직접 검증**, ③ 실 Cmd+C가 실 클립보드에
  마커 기록(`readText` 폴링) 후 실 Cmd+V가 키다운 양보 → 네이티브 paste
  → 내부 라우팅 (전 경로 통합 검증).
- e2e 회귀: clipboard 4스펙+os-marker 15 passed/1 skipped,
  slide-deck-command-sweep + editor-mode-add-container + batch3 18 passed,
  editor-shortcuts 12 passed (잔여 1 red = :264 networkidle 플레이크,
  DR-118 기지 사항).
- tsc / biome / build / gates(lint·token·declarative·purity·inheritance·
  modeboundary) green.

## 잔여

- 마커 건강도는 탭-로컬: 크로스탭 transports로 페이로드만 받은 탭은
  레거시 라우팅 유지 (내부 paste 결과는 동일 — recency 해소만 그 탭에서
  직접 copy해야 활성화). 필요해지면 transports에 건강도 신호 동반.
- 외부 앱에 weave copy 후 붙여넣으면 `weave:clipboard:v1` 텍스트가
  보이는 트레이드오프 (DR-122 §대안 비교) — 실데이터 HTML 클립보드
  직렬화(Figma 방식)는 후속 후보.
