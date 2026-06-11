# WI-188 — HTML 클립보드 직렬화 (Figma식 스탬프)

- 상태: DONE (2026-06-12)
- 출처: WI-186 잔여 ("외부 앱에 `weave:clipboard:v1` 텍스트 노출" 트레이드오프
  — 후속 후보로 예고된 실데이터 HTML 직렬화)
- 결정: DR-124
- 선행: WI-186 / DR-122 (마커 오라클), WI-041 (클립보드 페이로드 스키마)

## 문제

1. WI-186의 plain-text 마커는 weave copy 후 외부 앱에 붙여넣으면
   `weave:clipboard:v1` 문자열이 그대로 보였다.
2. 페이로드가 OS 클립보드에 없으므로, 인-메모리 스토어와 transports를
   놓친 탭(예: copy 이후에 연 탭, 새 세션)은 weave paste가 불가했다.

## 해결 — text/html 스탬프 + 임베디드 페이로드 (상세는 DR-124)

마커 쓰기를 `navigator.clipboard.write`(ClipboardItem `text/html`)로 승격:
빈 `<span data-weave-clipboard="v1" data-weave-payload="<base64(JSON)>">`.

- **외부 노출 해소**: text flavor를 쓰지 않으므로 plain-text 타깃은 아무것도
  받지 않고, rich-text 타깃은 보이지 않는 빈 span을 받는다 (Figma 패리티).
- **OS 클립보드 = 제3의 transport**: paste 라우터 분기 ①이 스탬프의
  페이로드를 추출, 로컬 스토어가 비었거나 timestamp가 더 오래됐으면
  `clipboardStore.write`로 채택 후 내부 paste 디스패치 → **fresh 탭이 OS
  클립보드만으로 paste 재구성** (신규 능력).
- 사전 실증 프로브 (2026-06-12, headless Chromium): async write sanitizer와
  paste 이벤트 `getData("text/html")` 모두 커스텀 data-* 속성을 보존
  (~1MB 속성값 무손실 왕복 확인, plain flavor 부재 시 getData("text/plain")
  = ""). Chromium이 `<html><body>` 래핑을 추가하므로 검출은 부분 문자열.
- **크기 캡** `MAX_OS_PAYLOAD_CHARS`(2M chars ≈ 1.5MB JSON): 초과(현실적으로
  data:-URL 이미지 폴백)면 마커-온리 스탬프로 격하 — recency는 여전히
  해소, fresh-탭 재구성만 그 페이로드에 한해 불가.
- **폴백 체인**: ClipboardItem 부재/write 거부 → 레거시 writeText 마커 →
  그것도 실패 → `failed` (DR-122 프로브 라우팅 격하). 검출은 HTML 스탬프와
  레거시 텍스트 마커 둘 다 인식(배포 스큐 호환).
- 외부 유입 페이로드 검증은 transports와 동일 규칙: 신규 공유
  `isValidIncomingClipboardPayload`(clipboard-types) — RISK-008 R4가 이
  transport에도 적용. DOMParser는 inert document(스크립트 미실행).

## 변경 파일

| 파일 | 변경 |
|---|---|
| `src/document/clipboard/os-clipboard-marker.ts` | HTML 스탬프 빌드/추출 + 리치 write 경로 + (WI-187) 건강도 transport |
| `src/document/clipboard/clipboard-types.ts` | `isValidIncomingClipboardPayload` 공유 추출 |
| `src/document/clipboard/{broadcast-channel,local-storage}-transport.ts` | 사설 validator 2벌 제거 → 공유본 사용 (Decommission Sweep; localStorage 쪽은 timestamp 검사가 추가돼 미세 강화) |
| `src/document/clipboard/use-clipboard-commands.ts` | copy/cut 성공 시 `writeOsClipboardMarker(clipboardStore.peek())` — 페이로드 동반 |
| `src/pages/design/hooks/use-os-paste-routing.ts` | 분기 ①에서 임베디드 페이로드 추출·채택(timestamp 신선도 비교) |
| `e2e/clipboard-items.spec.ts` | "빈 클립보드 no-op" 스펙이 OS 클립보드를 중화하도록 갱신 — 이전 테스트가 남긴 weave 스탬프는 이제 **합법적 paste 소스**라 스펙 의도("어디에도 페이로드 없음")와 충돌했음 |

## 검증

- 단위: 라운드트립(유니코드)/Chromium 래핑/크기 캡 격하/스키마 스큐 드롭/
  손상 base64/리치 write·폴백 — `os-clipboard-marker.test.ts` 19건,
  전체 vitest **1197/1197 green**.
- e2e `clipboard-os-marker.spec.ts` 5/5: ③ 실 Cmd+C → text/html 스탬프
  폴링 → 실 Cmd+V 내부 라우팅, **④ copy 이후에 연 fresh 탭이 OS 클립보드
  HTML 페이로드만으로 paste (id 재매핑 확인)** — 신규 능력의 직접 검증.
- e2e 회귀: clipboard 12 passed/1 skipped, slide-deck-command-sweep +
  editor-mode-add-container + batch3 18 passed, editor-shortcuts 12 passed
  (잔여 1 = networkidle 플레이크, DR-118 기지).
- tsc / biome / build / 게이트(declarative·modeboundary·inheritance·token·
  hostleak) green.

## 잔여

- 비-Chromium 엔진의 write-측 sanitizer 거동은 미실증(e2e는 Chromium 전용).
  폴백 체인이 안전망: 리치 write 실패 → 텍스트 마커 → 레거시 라우팅 —
  최악이 WI-186 동작.
- 마커-온리 격하(2M chars 초과) 페이로드는 fresh-탭 재구성 불가 — 수용
  (recency 해소는 유지).
