# DR-093 — fontSize 이중 표현 단일화 (fontSizeSpec = 단일 진실, fontSize = 동기 미러)

- 상태: ACCEPTED
- 날짜: 2026-06-07
- 관련: DR-082(value>1 가드), DR-091(에이전트 그라운딩), DR-092(토글 깜빡임)
- 트리거: px/ratio 이중 표현이 반복적으로 버그를 유발(에이전트 중첩 사이징, 토글 깜빡임, Quick 슬라이더가 stale px 표시) → "이중 표현 단일화"

## 문제

텍스트 크기가 **두 필드**에 존재했다: 권위 있는 `fontSizeSpec { kind, value }` 와 레거시 `fontSize`(bare px). 렌더러(`resolveFontSize`)는 spec 우선이지만, **UI/로직 곳곳이 bare `fontSize`를 진실로 읽어** 두 값이 어긋나면 버그가 났다(예: ratio 텍스트인데 Quick 슬라이더가 미러의 stale 24px 표시).

`fontSize`는 agocraft 스키마(벤더 tarball)의 일부라 제거는 재벤더가 필요 → 범위 밖.

## 결정 (재벤더 없이 weave 내 단일화)

**`fontSizeSpec`를 단일 진실로, `fontSize`는 절대 "읽지 않는" 동기 미러로.**

1. **항상 spec 존재**: `domain-kinds.ts` 텍스트 기본값에 `fontSizeSpec:{kind:'px',value:24}` 추가(미러 `fontSize:24` 유지). 구 문서는 agocraft `migrateFontSizeToSpec`가 이미 spec을 채움.
2. **단일 헬퍼** `apps/web/src/document/domains/text-font-size.ts`:
   - `displayFontSizePx(attrs, parentHeightPx)` — spec에서 표시 px 해석(ratio×부모높이 / px값). bare `fontSize`는 fallback일 뿐.
   - `fontSizeAttrsForPx(attrs, px, parentHeightPx)` — px 편집 시 **kind 보존**(ratio→responsive `px÷부모`, px→absolute) + 미러 동기화.
3. **모든 UI 읽기를 spec 해석으로**: `text-section.tsx`의 Quick/More 슬라이더 표시값을 `resolvedSizePx = sharedValue(displayFontSizePx(...))`로 교체(더는 bare `fontSize` 안 읽음). px↔% 토글의 curPx, MixedBadge도 동일.
4. **모든 px 쓰기를 kind 보존으로**: 슬라이더 `onValueChange`가 `updateAll(... {kind:'px'})`(강제 px) 대신 `batchPerItem + fontSizeAttrsForPx`로 **현재 kind 유지** → ratio 텍스트를 슬라이더로 조정해도 반응형 유지.

## 결과

- Quick 슬라이더 숫자가 항상 **렌더된 px와 일치**(ratio/에이전트 텍스트 포함). "24 표시 + kind ratio" 모순 제거.
- ratio 텍스트를 px 슬라이더로 조정해도 ratio 유지(반응형 보존).
- bare `fontSize`를 진실로 읽는 코드가 UI에서 사라져 **드리프트가 버그가 되는 통로를 차단**.
- `fontSize` 미러는 쓰기 시 항상 동기화(agocraft 라운드트립 호환 유지).

## 비범위 / 후속

- `fontSize` 필드 **완전 제거**는 agocraft 스키마 변경 + 재벤더 필요 → 후속.
- textRuns의 per-range `fontSize`(px)는 별도 축이라 그대로.
- 코너-resize(DR-022)는 이미 spec kind별 스케일을 보존 — 무변경.

## 검증

772 단위 테스트(신규 `text-font-size.test.ts` 7), typecheck·빌드·Biome 클린. 라이브 UI는 샌드박스 제약으로 별도.
