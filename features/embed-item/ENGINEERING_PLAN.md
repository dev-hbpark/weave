# Engineering Plan — 임베드(YouTube) 아이템 kind `embed` (WI-139 / DR-094)

## 아키텍처

weave-로컬 도메인 kind(`qr`/`chart` 선례). agocraft 빌트인 아님 → `onUnknown:"preserve"`로 직렬화(직렬화 경로 무변경). 추가 = `domain-kinds.ts` SPECS 1엔트리 + 컴파일러 강제 exhaustiveness로 누락 방지.

**provider 레지스트리(Rule 6)** 가 핵심: URL → embed 변환을 kind 안에 if/switch로 박지 않고, provider별 어댑터 1파일. YouTube가 첫 provider. embed src는 **저장하지 않고** url+provider로 렌더 시 파생 → URL 편집이 곧 재파생.

### 데이터 모델 (`types.ts`)
```ts
export interface EmbedAttrs {
  readonly frame: ItemFrame;
  readonly url: string;            // 사용자 입력 원본 URL (canonical)
  readonly provider?: string;      // 파생 캐시: "youtube" | … (provider.id)
  readonly title?: string;         // 후속 oEmbed 메타
  readonly allowFullscreen?: boolean;
  readonly opacity?: number;
}
// DomainKind += "embed"; ItemAttrsByKind.embed = EmbedAttrs & WeaveCommonAttrs
```

### provider 레지스트리 (`document/embed/providers.ts`)
```ts
export interface EmbedProvider {
  readonly id: string;                       // "youtube"
  readonly label: string;                    // "YouTube"
  match(url: string): boolean;               // 이 provider가 처리하는 URL인가
  toEmbedUrl(url: string): string | null;    // iframe src (없으면 null)
}
export const EMBED_PROVIDERS: ReadonlyArray<EmbedProvider>;   // SSOT
export function resolveEmbed(url: string): { provider: EmbedProvider; embedUrl: string } | null;
```
- YouTube provider: `watch?v=`, `youtu.be/`, `embed/`, `shorts/`, `live/`에서 11자 video id 추출 → `https://www.youtube-nocookie.com/embed/<id>`(privacy 임베드 도메인). 순수 함수 → 단위 테스트 용이.

### 렌더러 (`domains/EmbedBlock.tsx`)
- `resolveEmbed(a.url)` → 있으면 `<iframe src allow="… encrypted-media; picture-in-picture; fullscreen" allowFullScreen={a.allowFullscreen}>` 절대 inset. 없으면 placeholder("YouTube URL을 붙여넣으세요").
- VideoBlock 컨테이너 패턴 재사용(opacity/shadow/borderRadius는 MVP에서 opacity만).
- iframe `sandbox`는 YouTube 임베드 동작 보장 위해 표준 `allow`만, src는 allow-list(provider)만 생성 → 임의 스크립트 주입 불가.

### SPECS 엔트리 (`domain-kinds.ts`)
```
embed: { kind:"embed", meta:{label:"임베드", tagline:"YouTube 등 영상 임베드", accentVar:"--domain-media-accent"},
  renderer: EmbedBlock, participatesInZorder: true,
  defaultAttrs: () => ({ frame: FULL_FRAME, url:"", allowFullscreen:true, opacity:1 }) }
```

### 툴바 섹션 (`toolbar/sections/embed-section.tsx`)
- URL 입력(붙여넣기) + 인식 결과 배지(provider/embed 유효 여부) + 전체화면 토글 + 불투명도. `register("embed", EmbedSection)`.

### 추가 메뉴 + 선택 크롬 + 에이전트
- DesignHeader 추가 메뉴: IconPlay, `onAddItem("embed")` + 드래그(`application/x-weave-add-kind`="embed").
- `use-selection-chrome-registry`: frame-default VM 목록에 `"embed"` 추가(리사이즈/회전).
- `weave-capabilities.ts` kind 엔트리(description+editableAttrs) + `weave-command-schemas.ts` kindEnum에 `"embed"`.

## Phases (각 단계 typecheck 게이트)

1. **types + provider 레지스트리 + 단위 테스트**(URL 파싱). 게이트: provider 테스트 green, tsc.
2. **EmbedBlock 렌더 + domains/index export + SPECS 엔트리**. 게이트: embed kind 아이템이 iframe/placeholder 렌더, tsc(exhaustiveness 통과).
3. **툴바 섹션 + 등록**. 게이트: embed 선택 시 URL 편집 패널.
4. **추가 메뉴 + 선택 크롬**. 게이트: 메뉴에서 추가, 리사이즈/회전 동작.
5. **에이전트 노출**(capabilities + schema enum) + 테스트(kind 등록, corner-radius null, provider). 게이트: 전체 스위트 + build green.

## Rule 6 / 원칙

- kind 분기 금지: provider는 레지스트리(어댑터/파일), URL→embed는 `resolveEmbed`. domain-kinds는 SSOT 1엔트리, 모든 소비자 파생.
- round-trip: EmbedAttrs는 agocraft 미지 → `onUnknown:preserve` 보존(직렬화 무변경). embed src 비저장으로 드리프트 없음.
- 보안: src는 provider allow-list만 생성. youtube-nocookie 임베드 도메인.

## 후속 (DR에 기록)

- oEmbed fetch(제목/썸네일), Vimeo 등 provider 추가, export/present용 썸네일 폴백, 자동재생/타임스탬프 옵션.
