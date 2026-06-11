# DR-124 — HTML 클립보드 직렬화 (Figma식 스탬프 + 임베디드 페이로드)

- 상태: 채택 (2026-06-12)
- 작업: WI-188
- 선행: DR-122 §대안 비교 ("실데이터 HTML 직렬화 — 후속 후보로 보류").
  본 DR이 그 보류를 닫는다. DR-122의 마커=최신성 오라클 모델과 라우팅
  표는 그대로 유지 — 마커의 **운반 형식**과 **적재 내용**만 승격.

## 사전 실증 프로브 (2026-06-12, headless Chromium) — 플랫폼 계약

스코프 결정 전에 스크래치 e2e 스펙으로 실측 (1회 실행 후 삭제):

1. async `navigator.clipboard.write`(ClipboardItem `text/html`)의 write
   sanitizer는 **커스텀 `data-*` 속성을 보존**한다.
2. paste 이벤트 `getData("text/html")`도 보존한다 — **~1MB 속성값
   무손실 왕복** 확인 (1,000,212 chars).
3. text flavor를 쓰지 않으면 `getData("text/plain")` === `""` —
   plain-text 타깃에 아무것도 노출되지 않음.
4. Chromium은 쓴 HTML을 `<html><head>…<body>`로 재래핑 → 검출은 정확
   일치가 아니라 **부분 문자열**이어야 함.

→ 검증 결과: 실데이터 직렬화 FEASIBLE. 마커-온리 HTML로 스코프를
줄일 이유 없음.

## 결정 1 — 스탬프 형식: 빈 span + data-* 속성

```html
<meta charset="utf-8"><span data-weave-clipboard="v1" data-weave-payload="<base64(JSON)>"></span>
```

- **외부 노출 해소** (WI-186 잔여 트레이드오프): plain flavor 부재 →
  텍스트 타깃은 무반응, rich-text 타깃은 보이지 않는 빈 span (Figma
  패리티).
- base64 문자집합(`A-Za-z0-9+/=`)은 속성-안전 — 이스케이프 불필요.
- 페이로드 인코딩: TextEncoder → chunked `String.fromCharCode` → btoa
  (유니코드 안전; "한글 + emoji 🎨" 라운드트립 단위 검증).
- 검출(`clipboardEventHasOsMarker`)은 `data-weave-clipboard="v1"` 부분
  문자열 **또는** 레거시 text/plain 마커 — 배포 스큐 호환 (이전 빌드
  탭이 쓴 텍스트 마커도 인식).

## 결정 2 — OS 클립보드 = 제3의 transport

paste 라우터 분기 ①이 `extractOsClipboardPayload`로 임베디드 페이로드를
추출하고, **로컬 스토어가 비었거나 timestamp가 더 오래됐으면**
`clipboardStore.write`로 채택 후 내부 paste를 디스패치한다.

- 신규 능력: **copy 이후에 연 fresh 탭**(BroadcastChannel·localStorage
  transports 모두 미수신)이 OS 클립보드만으로 paste 재구성 (e2e ④ 직접
  검증 — id 재매핑 포함).
- 채택된 페이로드의 `origin`은 외래 UUID ≠ SESSION_ORIGIN → 페이로드
  transports의 자기-방송 가드가 재방송 루프를 차단.
- 외부 유입 검증은 기존 transports와 **동일 규칙**: 공유
  `isValidIncomingClipboardPayload`(clipboard-types로 추출, 사설 validator
  2벌 Decommission Sweep). 스키마 스큐는 조용히 드롭 (RISK-008 R4).
- DOMParser 파싱은 inert document — 스크립트 미실행, 리소스 미로딩
  (보안 표면 우려에 대한 답).

## 결정 3 — 크기 캡 + 폴백 체인 (모든 실패가 기존 동작으로 격하)

- `MAX_OS_PAYLOAD_CHARS = 2_000_000` (≈1.5MB JSON; 프로브 실증 1MB에
  여유 마진). 초과(현실적으로 data:-URL 이미지 폴백) → **마커-온리
  스탬프로 격하**: recency 해소는 유지, fresh-탭 재구성만 그 페이로드에
  한해 불가.
- 폴백 체인: `clipboard.write`(rich) 거부/ClipboardItem 부재 → 레거시
  `writeText` 텍스트 마커 → 그것도 실패 → `failed`(DR-122 건강도 격하).
  **paste는 어떤 단계에서도 죽지 않는다** — 최악이 WI-186, 그 아래
  최악이 WI-185 동작.

## 결정 4 — 계약 변경: "빈 클립보드 Cmd+V = no-op"은 더 이상 무조건이 아님

OS 클립보드의 weave HTML 스탬프는 이제 **합법적 paste 소스**다.
이 계약을 고정하는 스펙(clipboard-items "no-op" 스펙)은 OS 클립보드를
먼저 중화해야 본래 의도("어디에도 페이로드 없음 → no-op")를 검증한다.
이전 테스트/세션이 남긴 스탬프로 인한 red는 버그가 아니라 신규 계약의
올바른 발현.

## 대안 비교

- **마커-온리 HTML (페이로드 미적재)**: 노출 해소만 하고 fresh-탭
  재구성 능력을 포기 — 프로브가 실데이터 운반의 FEASIBLE을 실증한
  이상 스코프를 줄일 근거 없음. 기각.
- **text/plain flavor에 base64 동봉**: 외부 노출 문제가 그대로 (더
  커짐) — 기각.
- **`web text/weave` 커스텀 MIME (Web Custom Formats)**: 가장 깨끗하나
  `clipboardData.getData`로 동기 읽기 불가(async read 전용) → DR-122
  결정 2의 동기-읽기 제약과 충돌 — 기각.
- **압축(gzip) 후 적재**: CompressionStream은 async → 동기 paste 경로와
  충돌하고, 2M chars 캡 내에서 압축이 필요한 페이로드는 이미지 data:-URL
  뿐이라 실익 작음 — 기각 (필요 시 후속).

## 부수 정리 (같은 변경)

- `broadcast-channel-transport.ts` / `local-storage-transport.ts`의 사설
  `isValidIncoming` 2벌 제거 → 공유 `isValidIncomingClipboardPayload`
  (localStorage 쪽은 timestamp 검사가 추가돼 미세 강화 — 실동작 변화
  없음).
- e2e: 수동 `browser.newContext()`는 config의 `use.permissions`를
  상속하지 않음 — `context.grantPermissions(["clipboard-read",
  "clipboard-write"])` 명시 필요 (크로스탭 스펙 함정).

## 잔여

- 비-Chromium 엔진의 write-측 sanitizer 거동 미실증 (e2e Chromium 전용).
  폴백 체인이 안전망 — 최악이 WI-186 동작.
