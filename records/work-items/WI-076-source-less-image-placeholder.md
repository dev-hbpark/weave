# WI-076 — 소스 없는 이미지 플레이스홀더 (선택적 중앙 캡션)

## Problem

이미지 아이템은 `attrs.src` 기본값이 빈 문자열(`""`)이라 데이터상 "소스 없는
이미지"는 이미 가능했지만, 두 가지가 막혀 있었다:

1. **렌더링** — `ImageBlock`이 `src=""`인 `<img>`를 그대로 그려 브라우저의 **깨진
   이미지 아이콘**이 노출됐다.
2. **추가 경로** — `MediaSrcDialog.submit()`이 빈 값을 거부해서(`URL을 입력하거나
   파일을 업로드해주세요`) **소스 없이 추가하는 길이 없었다.**

요구: 소스 없는 이미지는 플레이스홀더로 렌더하고, 필요하면 중앙에 텍스트 설명을
넣을 수 있어야 하며, 이 설정을 **아이템 추가 시점에도** 할 수 있어야 한다.

## Decision

- **캡션 저장소 = 기존 `alt` 재사용** (agocraft 스키마 변경 없음). `alt`는 "이
  이미지가 무엇인지"라서 플레이스홀더 라벨 의미와 정확히 일치하고, 소스가 있으면
  `<img alt>`로 a11y에만 쓰여 충돌이 없다. 직렬화 round-trip도 기존 그대로.
- **추가 진입점 = 기존 다이얼로그에 "소스 없이 추가" 버튼** + 선택적 "설명" 입력.
  별도 메뉴 항목 신설 대신 add/edit 흐름을 재사용해 최소 변경.

## Change (weave 단독, agocraft 불변)

- `ImageBlock.tsx` — `hasSrc` 게이트 추가. 소스 없으면 `<ImagePlaceholder alt>`
  (중립 프레임 + 이미지 글리프 + 선택적 중앙 캡션, 4줄 clamp) 렌더. 크롭 모드와
  더블클릭-크롭-진입은 `hasSrc`일 때만(소스 없는 크롭은 무의미).
- `MediaSrcDialog.tsx` — `initialAlt` prop + 캡션 `TextField`(image 한정) +
  `소스 없이 추가`(`media-src-skip`) 버튼. `onConfirm(src, alt?)`로 시그니처 확장.
- `DesignDialogs.tsx` / `DesignPage.tsx` — `mediaInitialAlt` 계산(edit 시 현재
  `alt` prefill) + `handleMediaConfirm(src, alt?)`이 add/edit 모두에 alt 반영.
- `use-item-add.ts` — `addNewItem(..., altOverride?)` 말미 파라미터 추가(image
  한정, 트림 후 비어있지 않을 때만 `attrs.alt` seed).
- `image-section.tsx` — 툴바 More 패널에 "설명" 입력 필드(생성 후에도 캡션 편집).

### 에이전트(아쿠) 스키마 반영

host `weave.item.add`는 `defaultAttrsFor("image")`(= `src:""`)에 attrsOverride만
병합하므로 **빈 src를 막는 검증이 없어 능력 자체는 이미 존재**했다. 누락된 건
*설명*뿐이라 에이전트가 이를 활용할 길이 없었다(에이전트는 src를 필수 URL로,
alt를 a11y 설명으로만 인식). 두 곳을 갱신:

- `weave-capabilities.ts` — `image` itemKind 설명에 "src는 OPTIONAL, 생략/빈
  문자열 → 소스 없는 플레이스홀더, 이때 alt가 중앙 캡션으로 렌더" 추가.
- `weave-command-schemas.ts` — `IMAGE_ATTRS_NOTE` 신설(text/qr/shape note와
  동일 패턴), `item.add`/`item.update`의 attrs 설명에 합성.

## Verification

- `pnpm --filter @weave/web typecheck` ✓
- `declarativecheck` ✓ (Rule 6 위반 없음 — 분기는 boolean `hasSrc`/`cropMode`,
  kind/mode discriminant 아님)
- unit 357 ✓
- e2e `media-src-dialog.spec.ts` 6/6 ✓ — 신규: 소스 없이 추가 → 캡션 플레이스홀더
  렌더(깨진 `<img>` 없음) → 이후 실제 소스 지정 시 `<img>`로 교체.
