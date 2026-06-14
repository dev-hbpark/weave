// AKU design-style catalog (DR-079; concrete-spec upgrade WI-228) — named,
// contemporary VISUAL STYLES the user picks, or the agent auto-selects from the
// content. Each style is a self-contained RECIPE (prose visual language) PLUS a
// concrete `spec`: literal palette + background + shadow + radius + fonts +
// signature effects. The prose alone let the agent GUESS the look, so output kept
// converging to one safe default; the concrete spec is the "design lock" — the
// agent applies these exact values instead of inferring them, and the per-request
// variation then varies only composition / density / emphasis (style-safe knobs),
// keeping the signature palette/effects fixed so the SAME style stays coherent
// run-to-run while clearly differing from a DIFFERENT style. A picked style also
// carries a small-think `register` (DR-043); in auto mode the agent picks the
// style so the server infers the register instead.

/** Aesthetic register archetypes — mirrors `@small-think/client` SubmitOptions.register. */
export type AkuRegister = "sober" | "editorial" | "expressive" | "playful";

export interface DesignStyleGroup {
  readonly id: string;
  /** Short KR group label (UI heading). */
  readonly label: string;
  /** KR — the content this group fits; drives the auto-mode content→style match. */
  readonly useCase: string;
}

/** The six use-case groups; each holds two individually-selectable styles. */
export const STYLE_GROUPS: ReadonlyArray<DesignStyleGroup> = [
  { id: "futuristic", label: "미래지향", useCase: "AI·금융·미래지향 서비스" },
  { id: "saas", label: "SaaS", useCase: "SaaS 제품 소개" },
  { id: "brand", label: "브랜드", useCase: "개성 강한 브랜드 사이트" },
  { id: "tech", label: "테크", useCase: "개발 도구·게임·보안" },
  { id: "productivity", label: "생산성", useCase: "관리 도구·생산성 서비스" },
  { id: "friendly", label: "친근", useCase: "교육·키즈·온보딩" },
];

/** The concrete "design lock" for a style — literal values the agent applies as-is
 *  (no guessing). All colors are literal CSS (hex / rgba) so the style reads the
 *  same regardless of the active theme; structural BODY text may still use
 *  var(--token). Fonts are families from the on-demand catalog. */
export interface StyleSpec {
  /** base canvas / slide background colour (the darkest/lightest ground). */
  readonly bg: string;
  /** panel / card surface colour (may be translucent). */
  readonly surface: string;
  /** primary accent (focal colour, key graphics). */
  readonly accent: string;
  /** secondary accent (gradients, second category, chips). */
  readonly accent2: string;
  /** heading / strong text colour. */
  readonly textStrong: string;
  /** body text colour. */
  readonly textBody: string;
  /** border / divider / hairline colour. */
  readonly line: string;
  /** the slide BASE background treatment (a decoration.fill recipe). */
  readonly background: string;
  /** card/panel shadow (a decoration.shadow recipe, or "none"). */
  readonly shadow: string;
  /** surface corner radius guidance in design-px. */
  readonly radius: string;
  /** heading + body font guidance (catalog families + weights). */
  readonly fonts: string;
  /** the one or two SIGNATURE effects that define the style. */
  readonly effects: string;
}

export interface DesignStyle {
  readonly id: string;
  /** Short KR chip label. */
  readonly label: string;
  /** STYLE_GROUPS id. */
  readonly groupId: string;
  /** The visual-language directive injected into the task (the prose recipe). */
  readonly recipe: string;
  /** The concrete design lock (palette / bg / shadow / fonts / effects). */
  readonly spec: StyleSpec;
  /** Small-think restraint policy for this style (DR-043). */
  readonly register: AkuRegister;
}

export const DESIGN_STYLES: ReadonlyArray<DesignStyle> = [
  // ── 미래지향 — AI·금융·미래지향 ──
  {
    id: "glassmorphism",
    label: "글래스모피즘",
    groupId: "futuristic",
    register: "sober",
    recipe:
      "글래스모피즘 — 반투명 frosted-glass 패널(뒤 배경이 비치는 blur)에 얇은 1px 밝은 보더와 부드러운 그림자로 레이어드 깊이, 차갑고 맑은 팔레트에 은은한 빛 번짐. 콘텐츠는 떠 있는 유리 카드 위에 올려 정밀하고 미래적으로.",
    spec: {
      bg: "#0b1020",
      surface: "rgba(255,255,255,0.08)",
      accent: "#7cc4ff",
      accent2: "#a78bfa",
      textStrong: "#f1f5ff",
      textBody: "#c7d2e6",
      line: "rgba(255,255,255,0.20)",
      background:
        "linear-gradient 150° #0b1020 → #1a2348 (딥 블루-바이올렛, 코너에 #2a3a6a 은은한 광원)",
      shadow: "0 8px 32px rgba(0,0,0,0.35) (소프트)",
      radius: "16–20",
      fonts: "제목 Manrope 700 · 본문 Inter 400",
      effects:
        "유리 패널 = 반투명 surface 채움 + decoration.filter blur 14 + 1px rgba(255,255,255,0.25) 보더; 강조에 은은한 글로우",
    },
  },
  {
    id: "aurora",
    label: "오로라",
    groupId: "futuristic",
    register: "expressive",
    recipe:
      "오로라 그라데이션 — 딥/다크 바탕 위 보라·청록·자홍이 흐르는 오로라 메시 그라데이션과 소프트 글로우, 비비드하지만 매끄럽게. 텍스트는 밝게, 빛나는 단일 강조로 미래지향적으로.",
    spec: {
      bg: "#0a0a12",
      surface: "rgba(22,16,42,0.55)",
      accent: "#22d3ee",
      accent2: "#e879f9",
      textStrong: "#f5f3ff",
      textBody: "#cbd5e1",
      line: "rgba(168,139,250,0.30)",
      background:
        "linear-gradient 135° #7c3aed 0% → #06b6d4 50% → #db2777 100% 를 #0a0a12 위에 (오로라 메시)",
      shadow: "0 0 40px rgba(124,58,237,0.40) (글로우)",
      radius: "18",
      fonts: "제목 Poppins 700 · 본문 Inter 400",
      effects: "흐르는 3-stop 메시 배경 + 강조 요소에 0 0 24px accent 글로우",
    },
  },
  // ── SaaS — 제품 소개 ──
  {
    id: "bento",
    label: "벤토",
    groupId: "saas",
    register: "editorial",
    recipe:
      "벤토(Bento) 그리드 — 둥근 모서리 카드들을 크기를 달리해 모자이크로 배치, 카드마다 하나의 포인트(아이콘·숫자·미니차트), 넉넉하고 균일한 간격, 깔끔한 중립 팔레트에 브랜드 강조 1색.",
    spec: {
      bg: "#f4f5f7",
      surface: "#ffffff",
      accent: "#4f46e5",
      accent2: "#06b6d4",
      textStrong: "#0f172a",
      textBody: "#475569",
      line: "#e6e8ec",
      background: "단색 #f4f5f7 (밝은 중립)",
      shadow: "0 1px 3px rgba(15,23,42,0.08) (가벼움)",
      radius: "18–24 (둥근 카드)",
      fonts: "제목 Manrope 700 · 본문 Inter 400",
      effects: "크기 다른 둥근 카드 모자이크, 카드당 포인트 1개, accent는 한 카드에만",
    },
  },
  {
    id: "minimalism",
    label: "미니멀리즘",
    groupId: "saas",
    register: "sober",
    recipe:
      "미니멀리즘 — 극단적 여백, 거의 흑백에 단일 포인트 강조, 가는 타이포와 정밀한 정렬, 장식 최소. 조용하고 고급스럽게 하나의 메시지에 집중.",
    spec: {
      bg: "#ffffff",
      surface: "#ffffff",
      accent: "#111111",
      accent2: "#e11d48",
      textStrong: "#0a0a0a",
      textBody: "#52525b",
      line: "#ebebeb",
      background: "단색 #ffffff",
      shadow: "none (또는 0 1px 2px rgba(0,0,0,0.04) 극미세)",
      radius: "2–4 (크리스프)",
      fonts: "제목 Inter 600 · 본문 Inter 400",
      effects: "극단적 여백, 헤어라인 룰(#ebebeb 1px), 포인트색은 단 한 곳",
    },
  },
  // ── 브랜드 — 개성 강한 사이트 ──
  {
    id: "neo-brutalism",
    label: "네오 브루탈리즘",
    groupId: "brand",
    register: "expressive",
    recipe:
      "네오 브루탈리즘 — 두꺼운 검정 외곽선, 단단한 오프셋 드롭섀도(블러 없이), 비비드하게 충돌하는 색, 비대칭 raw 레이아웃, 큼직한 헤드라인. 거칠고 자신감 있게.",
    spec: {
      bg: "#ffde59",
      surface: "#ffffff",
      accent: "#ff5c00",
      accent2: "#2962ff",
      textStrong: "#000000",
      textBody: "#1a1a1a",
      line: "#000000",
      background: "단색 비비드 #ffde59 (또는 #b9fbc0 / #ff6b6b 중 1)",
      shadow: "6px 6px 0 #000000 (하드 오프셋, blur 0 spread 0)",
      radius: "0 (샤프)",
      fonts: "제목 Bebas Neue 또는 Montserrat 800 · 본문 Inter 500",
      effects: "3px 검정 보더 + 6px 하드 드롭섀도, 충돌하는 채도 높은 색면, 비대칭 배치",
    },
  },
  {
    id: "editorial",
    label: "에디토리얼",
    groupId: "brand",
    register: "editorial",
    recipe:
      "잡지 에디토리얼 — 큰 세리프 제목과 강한 타이포 위계, 컬럼 그리드와 넉넉한 여백, 절제된 거의 흑백 팔레트에 강조 1색, 얇은 룰/구분선. 차분하고 권위 있게.",
    spec: {
      bg: "#faf7f2",
      surface: "#faf7f2",
      accent: "#b91c1c",
      accent2: "#1a1a1a",
      textStrong: "#1a1a1a",
      textBody: "#3f3f3f",
      line: "#d6cfc4",
      background: "단색 따뜻한 페이퍼 #faf7f2",
      shadow: "none",
      radius: "0",
      fonts: "제목 Playfair Display 700 (세리프) · 본문 Lora 400",
      effects: "큰 세리프 제목, 컬럼 그리드, 얇은 룰(#d6cfc4), 강조는 #b91c1c 단 1색",
    },
  },
  // ── 테크 — 개발 도구·게임·보안 ──
  {
    id: "dark-ui",
    label: "다크 UI",
    groupId: "tech",
    register: "sober",
    recipe:
      "다크 UI — 짙은 차콜/블랙 바탕에 높은 대비의 밝은 텍스트, 한두 개의 형광/네온 강조, 모노스페이스 악센트, 정밀한 그리드와 또렷한 컴포넌트. 차분하고 기술적으로.",
    spec: {
      bg: "#0d1117",
      surface: "#161b22",
      accent: "#3fb950",
      accent2: "#58a6ff",
      textStrong: "#e6edf3",
      textBody: "#8b949e",
      line: "#30363d",
      background: "단색 차콜 #0d1117",
      shadow: "0 1px 0 rgba(255,255,255,0.04) inset 미세 (또는 none)",
      radius: "8–12",
      fonts: "제목 Inter 600 · 본문 Inter 400 · 코드/수치 JetBrains Mono",
      effects: "정밀 그리드, #161b22 표면 + #30363d 1px 보더, accent는 형광 1–2색",
    },
  },
  {
    id: "cyberpunk",
    label: "사이버펑크",
    groupId: "tech",
    register: "expressive",
    recipe:
      "사이버펑크 — 어두운 도시 바탕 위 네온 글로우, 글리치/스캔라인 질감, 고채도 대비와 테크 HUD 느낌의 라인·프레임. 강렬하고 미래도시처럼.",
    spec: {
      bg: "#0a0e1a",
      surface: "rgba(10,14,26,0.72)",
      accent: "#ff2bd6",
      accent2: "#00f0ff",
      textStrong: "#eafcff",
      textBody: "#9fb6c9",
      line: "#ff2bd6",
      background: "딥 #0a0e1a 에 코너 radial #1a0b2e 글로우 (어두운 도시)",
      shadow: "0 0 16px #00f0ff (네온 글로우)",
      radius: "2–6 (샤프 HUD)",
      fonts: "제목 Bebas Neue · 본문 Inter 400 · 수치 JetBrains Mono",
      effects: "네온 보더+글로우(마젠타/시안/라임 #c6ff00), HUD 프레임 라인, 고채도 대비",
    },
  },
  // ── 생산성 — 관리 도구·생산성 ──
  {
    id: "material",
    label: "머티리얼",
    groupId: "productivity",
    register: "sober",
    recipe:
      "머티리얼 디자인 — elevation 그림자로 표면 층을 구분, 선명한 프라이머리 색 + 중립 표면 톤, 일관된 8pt 그리드, 명확한 버튼/칩. 친숙하고 기능적으로.",
    spec: {
      bg: "#fafafa",
      surface: "#ffffff",
      accent: "#1976d2",
      accent2: "#e91e63",
      textStrong: "#212121",
      textBody: "#616161",
      line: "#e0e0e0",
      background: "단색 #fafafa",
      shadow: "0 2px 4px rgba(0,0,0,0.14) (elevation 2)",
      radius: "4–8 (8pt 그리드)",
      fonts: "제목 Roboto 500 · 본문 Roboto 400",
      effects: "elevation 그림자로 층 구분, 프라이머리 #1976d2 버튼/칩, 일관 8pt 간격",
    },
  },
  {
    id: "card-ui",
    label: "카드 UI",
    groupId: "productivity",
    register: "sober",
    recipe:
      "카드 UI — 정보를 카드 단위로 그룹화, 균일한 라운드·패딩·은은한 그림자, 스캔하기 쉬운 격자, 차분한 중립 팔레트에 상태색(성공/경고).",
    spec: {
      bg: "#f1f5f9",
      surface: "#ffffff",
      accent: "#0ea5e9",
      accent2: "#16a34a",
      textStrong: "#0f172a",
      textBody: "#64748b",
      line: "#e2e8f0",
      background: "단색 쿨 중립 #f1f5f9",
      shadow: "0 2px 8px rgba(15,23,42,0.06) (은은)",
      radius: "12–16",
      fonts: "제목 Inter 600 · 본문 Inter 400",
      effects: "균일 라운드 카드 격자, 상태색(성공 #16a34a / 경고 #f59e0b)만 포인트",
    },
  },
  // ── 친근 — 교육·키즈·온보딩 ──
  {
    id: "claymorphism",
    label: "클레이모피즘",
    groupId: "friendly",
    register: "playful",
    recipe:
      "클레이모피즘 — 말랑한 3D 클레이 질감(인셋+드롭 소프트 섀도로 통통한 입체), 둥글둥글한 형태, 파스텔 팔레트, 친근하고 장난스럽게.",
    spec: {
      bg: "#eef0ff",
      surface: "#f7f5ff",
      accent: "#a78bfa",
      accent2: "#fda4af",
      textStrong: "#3b3663",
      textBody: "#6b6794",
      line: "transparent",
      background: "파스텔 #eef0ff (또는 #fef0f5 ↔ #eafffb 부드러운 그라데이션)",
      shadow:
        "통통한 클레이 = 드롭 0 10px 18px rgba(160,140,220,0.35) + 인셋 0 -6px 12px rgba(255,255,255,0.7)",
      radius: "24–32 (아주 둥글게)",
      fonts: "제목 Fredoka One 또는 Poppins 700 · 본문 Nunito 400",
      effects: "통통한 인셋+드롭 소프트 섀도, 둥근 형태, 파스텔만, 보더 없음",
    },
  },
  {
    id: "3d-illustration",
    label: "3D 일러스트",
    groupId: "friendly",
    register: "playful",
    recipe:
      "3D 일러스트 — 부드러운 3D 캐릭터/오브제 일러스트가 주인공, 파스텔·캔디 팔레트, 둥근 형태와 넉넉한 여백, 밝고 친근하게. 이미지가 없으면 도형·그라데이션으로 3D 느낌의 입체 오브제를 구성.",
    spec: {
      bg: "#fff7ed",
      surface: "#ffffff",
      accent: "#fb7185",
      accent2: "#38bdf8",
      textStrong: "#1f2937",
      textBody: "#4b5563",
      line: "#f1e9df",
      background: "밝은 캔디 #fff7ed (또는 #f0f9ff)",
      shadow: "0 12px 24px rgba(251,113,133,0.20) (부드러운 컬러 섀도)",
      radius: "20–28",
      fonts: "제목 Poppins 700 · 본문 Nunito 400",
      effects:
        "radial-gradient 채운 둥근 오브제(구·블롭)로 3D 입체감, 캔디색 #fbbf24 포인트, 넉넉한 여백",
    },
  },
];

const STYLE_BY_ID = new Map(DESIGN_STYLES.map((s) => [s.id, s]));

/** Resolve a style by id (undefined for null/unknown → 자동). */
export function styleById(id: string | null | undefined): DesignStyle | undefined {
  return id == null ? undefined : STYLE_BY_ID.get(id);
}

const STYLES_BY_GROUP = new Map<string, ReadonlyArray<DesignStyle>>(
  STYLE_GROUPS.map((g) => [g.id, DESIGN_STYLES.filter((s) => s.groupId === g.id)]),
);

/** Pick one concrete style WITHIN a category (STYLE_GROUPS id), chosen by `seed`. The
 *  user selects a category (미래지향 / SaaS / …); the specific style (글래스모피즘 /
 *  오로라 / …) is hidden and resolved here. `seed` advances per generation, so a held
 *  category re-rolls its concrete style on each generate / regenerate. */
export function randomStyleInGroup(groupId: string, seed: number): DesignStyle | undefined {
  const styles = STYLES_BY_GROUP.get(groupId);
  if (styles === undefined || styles.length === 0) return undefined;
  return pick(styles, seed, 1);
}

/** Resolve the composer's style selection to a concrete style. The selection is a
 *  CATEGORY (STYLE_GROUPS id) → a seeded random style within it. A legacy concrete
 *  style id still resolves directly so stored sessions / regenerate keep working.
 *  null → 자동 (the agent picks from content). */
export function resolveStyleSelection(
  selectionId: string | null | undefined,
  seed: number,
): DesignStyle | undefined {
  if (selectionId == null) return undefined;
  return randomStyleInGroup(selectionId, seed) ?? styleById(selectionId);
}

/** The small-think register for a picked style; undefined for 자동 (the server then
 *  infers the register from content, since the agent chooses the style). */
export function styleToRegister(id: string | null | undefined): AkuRegister | undefined {
  return styleById(id)?.register;
}

/** Render the concrete design lock as a compact, apply-as-is block (WI-228) — the
 *  literal values PLUS a worked scaffold mapping the spec onto a real slide (the
 *  text-agent form of a few-shot example: the agent reads instructions, not
 *  images, so a concrete "spec → slide" recipe anchors application better than a
 *  rendered picture). */
function renderSpec(s: StyleSpec): string {
  return (
    "\n[디자인 스펙 — 아래 값을 그대로 적용(추측·기본값 금지), 표현 영역엔 literal 색을 직접 baking]" +
    `\n· 팔레트: 배경 ${s.bg} · 표면 ${s.surface} · 강조 ${s.accent} / ${s.accent2} · 제목 ${s.textStrong} · 본문 ${s.textBody} · 선 ${s.line}` +
    `\n· 배경 처리: ${s.background}` +
    `\n· 표면 그림자: ${s.shadow} · 모서리 반경: ${s.radius}px` +
    `\n· 폰트: ${s.fonts}` +
    `\n· 시그니처 효과: ${s.effects}` +
    "\n· 적용(표지): 슬라이드 base를 위 ‘배경 처리’로 채우고 → 제목을 제목색·제목폰트로 크게 → 히어로/큰 숫자/구분 바 등 강조 영역에 강조색+시그니처 효과 → 부가 정보는 표면색 카드(+그림자, 반경)에." +
    "\n· 적용(본문): 콘텐츠 그룹을 표면색 카드/밴드에 올려 그림자로 깊이를 주고, 포인트(아이콘·수치·강조어)에만 강조색·효과를 — 나머지는 팔레트의 중립색으로 절제."
  );
}

/** A one-line concrete signature for the AUTO catalog (palette + font, no full spec). */
function specSignature(s: StyleSpec): string {
  return `배경 ${s.bg}·강조 ${s.accent}/${s.accent2}·${s.fonts.replace(/ · 본문.*/, "").replace("제목 ", "")}`;
}

/** Commit tail — hold the LOCKED spec (palette/fonts/effects) and keep structural
 *  body text on tokens; the variation varies only composition. */
const COMMIT_TAIL =
  " 위 스펙의 팔레트·배경·그림자·반경·폰트·효과에 일관되게 커밋하세요 — 배경·히어로·강조 영역엔 스펙의 literal 색/효과를 직접 적용하고, 본문 텍스트 등 구조 색만 var(--token)으로 두세요. 현재 활성 테마의 룩에 끌려가지 마세요.";

// ── Per-request within-style variation (keeps diversity without breaking the style) ──
// Style-safe knobs only: composition / density / emphasis — NOT palette or effects
// (those are the locked signature). Deterministic in the seed (unit-tested).
const VAR_COMPOSITION = [
  "비대칭 구도로",
  "중앙 정렬로",
  "그리드 정렬로",
  "대각선 흐름으로",
] as const;
const VAR_DENSITY = ["여백을 넉넉하게", "적당한 밀도로", "타이트하게 패킹해"] as const;
const VAR_EMPHASIS = ["강조를 한 곳에 집중해", "강조를 절제해", "과감한 포컬 포인트로"] as const;

function pick<T>(list: ReadonlyArray<T>, seed: number, step: number): T {
  const n = list.length;
  const idx = ((Math.floor(seed / step) % n) + n) % n;
  return list[idx] as T;
}

/** The `[이번 변주]` block — rotates style-safe knobs by `seed` so the SAME style
 *  differs run-to-run (and on regenerate) WITHOUT touching the locked palette/effects. */
export function variationLine(seed: number): string {
  return (
    `\n\n[이번 변주 #${seed}] ${pick(VAR_COMPOSITION, seed, 1)} · ${pick(VAR_DENSITY, seed, 2)} · ` +
    `${pick(VAR_EMPHASIS, seed, 3)}. 스펙의 팔레트·폰트·효과는 고정, 구도/밀도/강조 배치만 직전 생성과 분명히 다르게.`
  );
}

/** Build the `[디자인 스타일]` task block for a picked style (recipe + concrete spec +
 *  commit + variation). */
export function composeStyleTask(style: DesignStyle, seed: number): string {
  return `\n\n[디자인 스타일] ${style.recipe}${renderSpec(style.spec)}${COMMIT_TAIL}${variationLine(seed)}`;
}

/** Build the AUTO directive — the agent reads the content and picks the best-fit style
 *  from the catalog (grouped by use-case, each with a one-line concrete signature),
 *  then commits to that style's full look. */
export function autoStyleDirective(seed: number): string {
  const catalog = STYLE_GROUPS.map((g) => {
    const styles = DESIGN_STYLES.filter((s) => s.groupId === g.id)
      .map((s) => `${s.label}(${specSignature(s.spec)})`)
      .join(" / ");
    return `· ${g.useCase} → ${styles}`;
  }).join("\n");
  return (
    "\n\n[디자인 스타일: 자동] 콘텐츠의 도메인·목적·오디언스를 먼저 분석하고, 아래에서 가장 잘 맞는 스타일 " +
    "하나를 골라 그 스타일의 팔레트·폰트·효과에 일관되게 커밋하세요(고른 스타일 이름을 응답에 한 줄로 밝혀주세요):\n" +
    `${catalog}${COMMIT_TAIL}${variationLine(seed)}`
  );
}
