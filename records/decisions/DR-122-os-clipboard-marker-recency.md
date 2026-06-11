# DR-122 — OS 클립보드 마커 = paste 최신성 오라클

- 상태: 채택 (2026-06-12)
- 작업: WI-186
- 선행: DR-121 결정 4 (paste 우선순위 — 내부 우선 + 프로브 양보; 잔여로
  마커 방식을 근본해결로 예고). 본 DR이 그 잔여를 닫는다 — DR-121 결정
  4는 **레거시 폴백 모드로 격하되어 존속** (폐기 아님).

## 결정 1 — 마커 기록: copy/cut 성공 시 `navigator.clipboard.writeText("weave:clipboard:v1")`

클립보드 쓰기는 OS 클립보드 **전체 교체**다. 따라서:

- 내부 copy 직후: OS 클립보드 = 마커 → "weave copy가 최신".
- 이후 사용자가 다른 앱에서 이미지/텍스트 복사: 마커 소멸 → "외부
  복사가 최신".

paste 시점 마커 존재 여부가 곧 최신성 판별이 된다. 별도 타임스탬프
저장·비교 불필요.

## 결정 2 — 라우팅 지점: 키다운 프로브 → 네이티브 `paste` 이벤트

클립보드 **내용**을 권한 프롬프트 없이 동기로 읽을 수 있는 유일한
지점은 사용자 제스처가 만든 `paste` 이벤트의 `clipboardData`다.
(`navigator.clipboard.read()`는 비동기 + 권한 프롬프트 → 키다운에서
preventDefault 판단에 쓸 수 없음 — 기각 사유.)

마커 라우팅 활성 시 Cmd+V 키다운은 **항상 양보**하고, window `paste`
라우터(`use-os-paste-routing.ts`)가 결정한다:

| 우선순위 | 조건 | 행동 |
|---|---|---|
| ① | text/plain == 마커 | preventDefault + 내부 paste 디스패치 |
| ② | image 파일 존재 (마커 없음) | preventDefault + OS 이미지 ingest (WI-185 ⑰ 경로) |
| ③ | 둘 다 아님 + 내부 스토어 비어있지 않음 | preventDefault + 내부 paste (외부 텍스트가 마커를 덮은 경우 — weave는 OS 텍스트 ingest 없음 → 종전 동작 유지) |
| — | 텍스트 편집 표면 / 크롭 중 | 종전과 동일하게 불개입 (①③은 키다운과 같은 `isCroppingNow` 게이트) |

## 결정 3 — 건강도 폴백 (실패 격리)

`writeText`는 실패할 수 있다(API 부재, 권한 거부, 포커스 상실, 비보안
컨텍스트). 탭-로컬 건강도 `unknown|ok|failed`를 추적, **성공 1회
전까지/실패 후에는** Cmd+V 키다운이 기존 DR-121 결정 4 프로브 라우팅
(내부 우선)을 유지한다. 귀결:

- 클립보드 API가 죽어도 paste는 절대 죽지 않는다 (최악 = WI-186 이전
  동작으로 격하).
- copy 직후 즉시 Cmd+V(쓰기 promise 미해결) → `unknown` → 레거시 내부
  paste — copy-직후-paste의 올바른 결과와 일치 (경합 무해).
- 크로스탭 수신 탭은 `unknown` → 레거시 (내부 paste 결과 동일; recency
  해소만 미적용 — WI-186 §잔여).

## 결정 4 — e2e 환경: Playwright 전역 `permissions: ["clipboard-read","clipboard-write"]`

헤드리스 Chromium은 **clipboard-read 권한 없이는 합성 Cmd+V에서
네이티브 `paste` 이벤트를 발화하지 않는다** (디버그로 확정: 키다운은
양보됐는데 paste 이벤트 자체가 부재). 실브라우저의 신뢰된 사용자
입력은 항상 발화하므로(모든 캔버스 앱 paste의 플랫폼 계약), 권한
부여가 e2e를 현실과 일치시킨다. 부여하지 않으면 클립보드 스펙들이
마커 쓰기 promise와 다음 키 입력의 경합으로 pass/fail이 갈리는 플레이크가
된다.

## 대안 비교

- **항상 OS 우선**: 내부 다중 아이템/스타일 paste가 OS 텍스트 부스러기에
  밀림 — 기각.
- **`navigator.clipboard.read()` 키다운 프로브**: 비동기 + 권한 프롬프트
  → preventDefault 시점 판단 불가 — 기각.
- **실데이터 HTML 직렬화(Figma 방식, ClipboardItem text/html)**: 외부
  앱에 마커 텍스트가 보이는 트레이드오프까지 해소하지만 직렬화/보안
  표면이 큼 — 후속 후보로 보류 (WI-186 §잔여).

## 부수 정리 (같은 변경)

WI-072/WI-180 계약(선택된 프레임 = 명시적 paste 목적지) 미갱신 e2e 3건
(`clipboard-frame-crosstab` deep-copy, `editor-shortcuts` :190/:207 —
DR-118 §알려진 이슈 계열, HEAD에서도 red 확인)을 copy 후 선택 해제로
계약과 정렬. 스펙 목적(딥카피 id 신선성 / paste 자동선택 / 다중선택
paste)은 불변.
