# Engineering Plan — 테마 타이포그래피 & 폰트 공급 확장 (WI-136 / DR-087·088)

## 핵심 통찰

폰트 시스템을 **색상 시스템의 평행 복제**로 짓는다. 색상축 인프라가 이미 전부 있다:

| 색상 (기존) | 폰트 (이 플랜) |
| --- | --- |
| `theme-tokens.ts` — `THEME_COLOR_TOKENS` (tokenName↔varName) | `theme-font-tokens.ts` — `THEME_FONT_TOKENS` |
| `buildThemeTokenMap()` → 루트 `style.provider` Unit (`agocraft-mirror.ts:61`) | 같은 map에 `typography.*` 토큰 병합 |
| `[data-theme]` CSS 블록이 `--accent` 등 재정의 | `[data-theme]` 블록이 `--font-display/--font-sans/--font-mono` 재정의 |
| `useResolveColor()` 캐스케이드 (`resolver-context.tsx:75`) | `useResolveFont()` (같은 resolver core 재사용) |
| `TextAttrs.color: string \| StyleRef` (리터럴 hex / `var()` / 토큰 ref) | `TextAttrs.fontFamily: string \| StyleRef` |
| `ColorPicker` 테마 swatch row | 폰트 picker 테마 **역할 섹션** |
| `useTheme()` — 테마 선택 + localStorage 영속 | `useThemeTypography()` — 테마별 폰트 override + 영속 |

`--font-sans/--font-display/--font-mono`는 **이미 `tokens.css` base 레이어에 존재**(72~79줄). 지금은 `:root` base에만 있어 테마가 못 바꾼다 — 이걸 `[data-theme]` 블록으로 끌어올리면 "테마가 폰트를 안다"가 성립한다.

## Scope

1. **폰트 역할 토큰** — `typography.display`(제목) / `typography.body`(본문) / `typography.mono`(코드). 테마가 정의, 텍스트가 참조, 테마 전환 시 문서 변경 없이 폰트 전환(CSS가 처리).
2. **개별 override** — 텍스트는 역할 대신 특정 폰트 리터럴 스택으로 덮어쓸 수 있음. `fontFamily: string | StyleRef`.
3. **온디맨드 폰트 로더** — 큐레이션 카탈로그(한글 포함 30~50종) + 선택/미리보기 시에만 `<link>` 주입. `index.html`의 거대 정적 링크 제거(preconnect + 최소 기본셋만 유지).
4. **테마 타이포그래피 설정 UI** — 테마별 제목/본문/모노 폰트를 사용자가 지정·영속(`useThemeTypography`), 루트 inline CSS var로 적용.
5. **Google Fonts 하이브리드 찾아보기** — 큐레이션을 기본 노출면, Google Fonts 전체를 "모든 폰트 찾아보기" 백엔드 소스로.

**Out of scope (후속):** 사용자 폰트 파일 업로드(@font-face, 라이선스/검증 별도 트랙 — 사용자가 미선택), 가변폰트 축(weight 외 width/slant) UI, 폰트 페어링 추천 AI, 다국어 서브셋 자동 분할(latin/korean 외).

## Architecture (target)

### 데이터 모델

- **`apps/web/src/document/fonts/catalog.ts`** — 폰트 카탈로그 레지스트리(SSOT, `FONT_FAMILY_PRESETS` 대체):
  ```ts
  export interface FontEntry {
    readonly id: string;        // "inter", "noto-sans-kr"  (안정 키)
    readonly label: string;     // "Inter"
    readonly stack: string;     // 완전한 CSS font-family 스택(폴백 포함)
    readonly family: string;    // Google 로딩용 패밀리명 "Inter" (system이면 빈 문자열)
    readonly source: "system" | "google";
    readonly category: "sans" | "serif" | "mono" | "display" | "handwriting";
    readonly subsets: ReadonlyArray<"latin" | "korean">;
    readonly weights: ReadonlyArray<number>;  // 로드할 weight
  }
  export const FONT_CATALOG: ReadonlyArray<FontEntry>;          // 큐레이션 30~50종
  export const FONT_BY_ID: ReadonlyMap<string, FontEntry>;      // 파생 lookup
  export const FONT_BY_STACK: ReadonlyMap<string, FontEntry>;   // 리터럴 역참조
  export function fontLabel(stack: string): string;             // 카탈로그 → 라벨
  ```
- **`apps/web/src/document/style/theme-font-tokens.ts`** — `theme-tokens.ts`와 평행:
  ```ts
  export const THEME_FONT_TOKENS = [
    { label: "제목", tokenName: "typography.display", varName: "--font-display" },
    { label: "본문", tokenName: "typography.body",    varName: "--font-sans" },
    { label: "모노", tokenName: "typography.mono",    varName: "--font-mono" },
  ] as const;
  export function buildFontTokenMap(): Record<string,string>;  // typography.* → var(--*)
  export function parseFontVarRef(s): {...} | null;
  export function toFontStyleRef(varName): StyleRef | null;
  ```
  → `buildThemeTokenMap()`와 병합되어 동일 루트 `style.provider` Unit에 들어간다(`agocraft-mirror.ts` 수정: color map + font map 합치기).
- **`TextAttrs.fontFamily`**: `string` → `string | StyleRef` 로 확장(색상 `color`와 동일 패턴). 역할 참조면 `ref("typography.body")`, 특정 폰트면 리터럴 스택. **신규 텍스트 기본값 = `ref("typography.body")`** (테마 반응형이 기본). 기존 문서의 리터럴 스택은 그대로 override로 유지(강제 마이그레이션 없음).

### 해석(resolution)

- **`useResolveFont(value, itemRef)`** — `resolver-context.tsx`에 `useResolveColor`와 같은 형태로 추가. resolver core(`resolver.ts`)는 토큰 네임스페이스 무관하므로 캐스케이드 로직 재사용; 반환값은 CSS font-family 문자열(`var(--font-sans)` 또는 리터럴). `TextBlock.tsx`에서 `fontFamily` 적용을 이 훅으로 교체(현재 `a.fontFamily` 직참조 → 해석값).
- StyleRef round-trip: agocraft serializer가 color StyleRef를 이미 무손실 직렬화하므로 폰트 토큰도 동일 경로. `onUnknown: "preserve"` 유지.

### 폰트 로더 (온디맨드, Rule 6 준수 — source별 어댑터 레지스트리)

- **`apps/web/src/document/fonts/font-loader.ts`**:
  ```ts
  // source → 로더 어댑터 레지스트리 (switch 금지)
  const LOADERS: Record<FontEntry["source"], (e: FontEntry) => void> = {
    system: () => {},                         // no-op
    google: (e) => injectGoogleLink(e),       // <link> 1회 주입, Set으로 dedup
  };
  export function ensureFontLoaded(entry: FontEntry): void; // 레지스트리 dispatch
  export function ensureFontsForStacks(stacks: Iterable<string>): void; // 문서 리하이드레이션
  ```
  - `injectGoogleLink`: `https://fonts.googleapis.com/css2?family=<Family>:wght@<weights>&display=swap` — 로드된 id를 모듈 `Set`으로 추적해 중복 주입 차단.
  - 호출 시점: (a) picker에서 폰트 선택, (b) 드롭다운에서 hover 미리보기(debounce), (c) **문서 오픈 시 used-font 리하이드레이션**.
- **`index.html`**: 거대 정적 `<link>` 제거. `preconnect` 2줄은 유지. 첫 페인트용 최소 기본셋(Inter, Noto Sans KR)만 정적 유지(FOUT 방지) — 나머지는 온디맨드.
- **used-font 리하이드레이션**: 문서 로드 경로(`use-design.ts` / `storage.ts` 로드 후)에서 전 텍스트 아이템의 `fontFamily`(역할 토큰은 해석 후) → 카탈로그 매핑 → `ensureFontsForStacks`. 재오픈 시 쓰던 폰트 자동 재로드.

### 테마 타이포그래피

- **정적 기본**: `tokens.css`의 `--font-sans/--font-display/--font-mono`를 각 `[data-theme]` 블록으로 이동/오버라이드. 정체성이 분명한 테마만 별도 폰트 지정(예: `paper`=세리프 본문, `webtoon`=둥근 산세리프, 나머지는 base 상속). base `:root` 폴백은 유지.
- **사용자 override (런타임)**: `useThemeTypography()` 훅(`useTheme` 평행) — 테마별 {display, body, mono} 폰트 id를 localStorage(`weave.typography.<theme>`)에 영속하고, 문서 루트에 inline `style.setProperty("--font-display", entry.stack)`로 적용 + 해당 폰트 `ensureFontLoaded`. 테마 전환 시 그 테마의 저장값 재적용. → "테마 관리에서 폰트 관리"의 실체.

### UI

- **폰트 picker 업그레이드** (`text-section.tsx` 449~501 교체):
  - 최상단 **"테마 역할"** 섹션: 제목/본문/모노 → 선택 시 `fontFamily = ref("typography.*")` (역할 바인딩, 테마 반응형).
  - **큐레이션 카탈로그** 섹션: category별 그룹 + 검색 + hover 미리보기(해당 폰트 온디맨드 로드 후 라벨을 그 폰트로 렌더).
  - **"모든 폰트 찾아보기"** → Google Fonts browse 모달.
  - `isMixed` / "여러 폰트" 동작 유지. chart 라벨 에디터(WI-078)도 같은 카탈로그 사용하므로 공유 컴포넌트로 추출 검토.
- **테마 타이포그래피 설정**: `ThemePicker` 인근에 `TypographyPicker`(또는 ThemePicker 내 탭) — 현재 테마의 제목/본문/모노 폰트 지정, `useThemeTypography`로 적용·영속.

### Google Fonts 하이브리드 찾아보기

- 큐레이션 카탈로그 = 기본 노출(빠름·한글 검증·품질 보증). "모든 폰트 찾아보기" = 전체 백엔드.
- **소스 전략(결정 필요 — DR-088)**: 
  - (권장) **번들 스냅샷 JSON** — Google Fonts 메타데이터 스냅샷을 빌드에 동봉. API 키·런타임 쿼터·CORS 부담 없음. 분기별 갱신.
  - (대안) Google Fonts Developer API 런타임 조회 — 최신성↑이나 API 키 관리 + 쿼터 + 키 노출 리스크.
  - 선택된 임의 폰트는 ad-hoc `FontEntry`로 변환 → `ensureFontLoaded` → 리터럴 override로 저장. 문서에 쓰이면 used-font 리하이드레이션이 재오픈 시 재로드.

## Phases (순차, 각 단계 typecheck + e2e + self-verification 게이트)

### Phase 1 — 폰트 카탈로그 레지스트리 + 온디맨드 로더
- `fonts/catalog.ts`(우선 기존 6종 + 카탈로그 30~50종으로 확장), `fonts/font-loader.ts`(source 어댑터 레지스트리), `fontFamilyLabel` → `fontLabel` 이관(`font-presets.ts` deprecate/삭제 — **Decommission Sweep**: 호출처 text-section + chart 라벨 동시 갱신).
- `index.html` 정적 거대 링크 제거, preconnect + 최소 기본셋 유지.
- picker는 아직 평면 리스트라도 카탈로그 기반으로 작동 + 선택 시 온디맨드 로드.
- 게이트: 기존 폰트 선택 무회귀, 선택 시 네트워크에서 해당 폰트만 로드(DevTools 확인), 안 쓰는 폰트 미로드.

### Phase 2 — 폰트 역할 토큰 + 캐스케이드 해석
- `theme-font-tokens.ts`, `agocraft-mirror.ts` 토큰맵 병합, `useResolveFont`, `TextAttrs.fontFamily: string | StyleRef`, `TextBlock` 해석 적용, serializer round-trip 테스트, 신규 텍스트 기본값 = body 역할.
- 게이트: 역할 바인딩 텍스트가 `--font-sans` 해석; StyleRef 저장/로드 무손실(round-trip 테스트 green); 기존 리터럴 fontFamily 보존.

### Phase 3 — 테마별 정적 타이포그래피
- `tokens.css`: `--font-*`를 `[data-theme]` 블록으로 이동, 정체성 테마에 폰트 오버라이드 부여(design-system RULE 토큰 추가 → **Design System Triage** + DR-design 검토).
- 게이트: 테마 전환 시 역할 바인딩 텍스트의 폰트가 문서 변경 없이 전환(View Transition과 호환).

### Phase 4 — 테마 타이포그래피 설정 UI
- `useThemeTypography` 훅(테마별 영속 + 루트 inline var 적용 + ensureFontLoaded), `TypographyPicker` UI.
- 게이트: 테마 폰트 커스터마이즈 → 새로고침/재오픈 시 영속; 테마 전환 시 각 테마 저장값 재적용.

### Phase 5 — 폰트 picker UX 업그레이드 + used-font 리하이드레이션
- picker: 역할 섹션 + category 그룹 + 검색 + hover 미리보기; 문서 오픈 시 `ensureFontsForStacks`.
- 게이트: 카탈로그에서 선택·미리보기 로드 정상; 폰트 쓴 문서 재오픈 시 자동 재로드(새로고침 후 FOUT 후 정착).

### Phase 6 — Google Fonts 하이브리드 찾아보기
- 번들 스냅샷(또는 API) browse 모달, 임의 폰트 ad-hoc 로드 + 리터럴 저장.
- 게이트: 임의 폰트 선택 → 로드·적용·영속·재오픈 재로드.

## SOLID / GRASP / 코드구조 규칙 준수

- **Rule 6 (kind 분기 금지)**: 폰트 로더는 `source → adapter` 레지스트리. 카탈로그/토큰은 배열 SSOT + 파생 Map lookup. picker 섹션은 category 그룹 순회(switch 없음). 모드 게이트는 hook(`useResolveFont`, `useThemeTypography`).
- **OCP**: 폰트 추가 = 카탈로그 1엔트리. 역할 추가 = `THEME_FONT_TOKENS` 1엔트리 + `[data-theme]` var. 소스 추가(예: self-host) = 로더 어댑터 1개.
- **round-trip identity + `onUnknown: preserve`**: fontFamily StyleRef는 color 경로 재사용으로 보장.
- **History 계약**: fontFamily 변경은 기존 `weave.<verb>`(text 속성 update) 경유 — `editor.exec`만, `setAgoDoc` 직접 금지. Cmd+Z 무손실 e2e 추가.

## Risks (요약 — RISK_NOTES로 승격 예정)

- **성능/네트워크**: 다폰트 → 온디맨드 + hover debounce + 한글 서브셋은 필요 시에만. 첫 페인트 최소 기본셋 정적 유지.
- **FOUT/CLS**: `display=swap`. ratio 폰트 사이징이 이미 반응형이라 레이아웃 영향 제한적.
- **개인정보(GDPR)**: `fonts.googleapis.com`가 클라이언트 IP를 Google에 노출. 향후 **셀프호스팅** 옵션 검토 — privacy-data-protection-agent 사인오프 항목으로 기록. 사용자 계정 없는 공유 워크스페이스(현행)에선 위험 낮으나 공개 전 재검토.
- **Google Fonts API 키**: 번들 스냅샷 권장으로 키·쿼터·CORS 회피.
- **라이선스**: Google Fonts(OFL/Apache) 무료 상업 사용 가능. 업로드 폰트는 out of scope라 라이선스 검증 트랙 불필요.
- **카탈로그 품질**: 한글 지원 폰트는 파일 크기 큼 → 큐레이션 시 한글셋 별도 표기, weight 제한.

## Decommission Sweep

- `font-presets.ts`(`FONT_FAMILY_PRESETS`, `fontFamilyLabel`) → `fonts/catalog.ts`로 대체, 호출처(text-section, chart 라벨 에디터 WI-078) 동시 이관 후 삭제.
- `index.html` 정적 거대 `<link>` 제거(같은 변경에서).
- 관련 테스트(폰트 picker spec)는 새 카탈로그/역할 표면으로 커버리지 이전(이동, red 방치 금지).

## 후속 기록 (플랜 승인 시 생성)

- **DR-087** — 폰트 역할 토큰 + `fontFamily: string | StyleRef` 결합, 신규 텍스트 기본=body 역할.
- **DR-088** — 정적 링크 → 온디맨드 로더 전환 + Google Fonts 소스 전략(번들 스냅샷 vs API).
- **DR-design-NNN** — `[data-theme]` 타이포그래피 토큰 추가(Design Review).
