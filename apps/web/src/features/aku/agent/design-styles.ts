// AKU design-style catalog (DR-079) — replaces the abstract tone presets (DR-077)
// with named, contemporary VISUAL STYLES the user picks, or the agent auto-selects
// from the content. Each style is a self-contained RECIPE: a named style is a known
// visual language, and decomposing it into the 5 abstract tone axes lost fidelity
// (glassmorphism's frosted blur, cyberpunk's neon, claymorphism's puffy 3D). A
// per-request variation directive keeps WITHIN-style diversity without touching the
// style's signature — it varies composition / density / emphasis, never the style's
// palette or effects. A picked style also carries a small-think `register` (DR-043);
// in auto mode the agent picks the style so the server infers the register instead.

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

export interface DesignStyle {
  readonly id: string;
  /** Short KR chip label. */
  readonly label: string;
  /** STYLE_GROUPS id. */
  readonly groupId: string;
  /** The visual-language directive injected into the task (the `[디자인 스타일]` block). */
  readonly recipe: string;
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
      "글래스모피즘 — 반투명 frosted-glass 패널(뒤 배경이 비치는 blur)에 얇은 1px 밝은 보더와 부드러운 그림자로 레이어드 깊이, 차갑고 맑은 팔레트(쿨 블루·민트·라벤더)에 은은한 빛 번짐. 콘텐츠는 떠 있는 유리 카드 위에 올려 정밀하고 미래적으로.",
  },
  {
    id: "aurora",
    label: "오로라",
    groupId: "futuristic",
    register: "expressive",
    recipe:
      "오로라 그라데이션 — 딥/다크 바탕 위 보라·청록·자홍이 흐르는 오로라 메시 그라데이션과 소프트 글로우, 비비드하지만 매끄럽게. 텍스트는 밝게, 빛나는 단일 강조로 미래지향적으로.",
  },
  // ── SaaS — 제품 소개 ──
  {
    id: "bento",
    label: "벤토",
    groupId: "saas",
    register: "editorial",
    recipe:
      "벤토(Bento) 그리드 — 둥근 모서리 카드들을 크기를 달리해 모자이크로 배치, 카드마다 하나의 포인트(아이콘·숫자·미니차트), 넉넉하고 균일한 간격, 깔끔한 중립 팔레트에 브랜드 강조 1색. 스캔이 쉽고 모던하게.",
  },
  {
    id: "minimalism",
    label: "미니멀리즘",
    groupId: "saas",
    register: "sober",
    recipe:
      "미니멀리즘 — 극단적 여백, 거의 흑백에 단일 포인트 강조, 가는 타이포와 정밀한 정렬, 장식 최소. 조용하고 고급스럽게 하나의 메시지에 집중.",
  },
  // ── 브랜드 — 개성 강한 사이트 ──
  {
    id: "neo-brutalism",
    label: "네오 브루탈리즘",
    groupId: "brand",
    register: "expressive",
    recipe:
      "네오 브루탈리즘 — 두꺼운 검정 외곽선, 단단한 오프셋 드롭섀도(블러 없이), 비비드하게 충돌하는 색, 비대칭 raw 레이아웃, 큼직한 그로테스크/모노 헤드라인. 거칠고 자신감 있게.",
  },
  {
    id: "editorial",
    label: "에디토리얼",
    groupId: "brand",
    register: "editorial",
    recipe:
      "잡지 에디토리얼 — 큰 세리프 제목과 강한 타이포 위계, 컬럼 그리드와 넉넉한 여백, 절제된 거의 흑백 팔레트에 강조 1색, 얇은 룰/구분선. 차분하고 권위 있게.",
  },
  // ── 테크 — 개발 도구·게임·보안 ──
  {
    id: "dark-ui",
    label: "다크 UI",
    groupId: "tech",
    register: "sober",
    recipe:
      "다크 UI — 짙은 차콜/블랙 바탕에 높은 대비의 밝은 텍스트, 한두 개의 형광/네온 강조, 모노스페이스 악센트, 정밀한 그리드와 또렷한 컴포넌트. 차분하고 기술적으로.",
  },
  {
    id: "cyberpunk",
    label: "사이버펑크",
    groupId: "tech",
    register: "expressive",
    recipe:
      "사이버펑크 — 어두운 도시 바탕 위 네온(마젠타·시안·라임) 글로우, 글리치/스캔라인 질감, 고채도 대비와 테크 HUD 느낌의 라인·프레임. 강렬하고 미래도시처럼.",
  },
  // ── 생산성 — 관리 도구·생산성 ──
  {
    id: "material",
    label: "머티리얼",
    groupId: "productivity",
    register: "sober",
    recipe:
      "머티리얼 디자인 — elevation 그림자로 표면 층을 구분, 선명한 프라이머리 색 + 중립 표면 톤, 일관된 8pt 그리드, 명확한 버튼/칩. 친숙하고 기능적으로.",
  },
  {
    id: "card-ui",
    label: "카드 UI",
    groupId: "productivity",
    register: "sober",
    recipe:
      "카드 UI — 정보를 카드 단위로 그룹화, 균일한 라운드·패딩·은은한 그림자, 스캔하기 쉬운 격자, 차분한 중립 팔레트에 상태색(성공/경고). 정돈되고 읽기 쉽게.",
  },
  // ── 친근 — 교육·키즈·온보딩 ──
  {
    id: "claymorphism",
    label: "클레이모피즘",
    groupId: "friendly",
    register: "playful",
    recipe:
      "클레이모피즘 — 말랑한 3D 클레이 질감(인셋+드롭 소프트 섀도로 통통한 입체), 둥글둥글한 형태, 파스텔 팔레트, 친근하고 장난스럽게.",
  },
  {
    id: "3d-illustration",
    label: "3D 일러스트",
    groupId: "friendly",
    register: "playful",
    recipe:
      "3D 일러스트 — 부드러운 3D 캐릭터/오브제 일러스트가 주인공, 파스텔·캔디 팔레트, 둥근 형태와 넉넉한 여백, 밝고 친근하게. 이미지가 없으면 도형·그라데이션으로 3D 느낌의 입체 오브제를 구성.",
  },
];

const STYLE_BY_ID = new Map(DESIGN_STYLES.map((s) => [s.id, s]));

/** Resolve a style by id (undefined for null/unknown → 자동). */
export function styleById(id: string | null | undefined): DesignStyle | undefined {
  return id == null ? undefined : STYLE_BY_ID.get(id);
}

/** The small-think register for a picked style; undefined for 자동 (the server then
 *  infers the register from content, since the agent chooses the style). */
export function styleToRegister(id: string | null | undefined): AkuRegister | undefined {
  return styleById(id)?.register;
}

/** Commit tail — hold the style, keep structural text colours on tokens, and vary the
 *  concrete palette/composition each run within the style. */
const COMMIT_TAIL =
  " 이 스타일에 레이아웃·타이포·여백·색·효과까지 일관되게 커밋하세요. 배경·히어로·강조 영역엔 스타일의 색/효과를, 본문 텍스트 등 구조 색만 var(--token)으로 두세요 — 현재 활성 테마의 룩에 끌려가지 마세요.";

// ── Per-request within-style variation (keeps diversity without breaking the style) ──
// Style-safe knobs only: composition / density / emphasis — NOT palette or effects
// (those are the style's signature). Deterministic in the seed (unit-tested).
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
 *  differs run-to-run (and on regenerate) without losing its identity. */
export function variationLine(seed: number): string {
  return (
    `\n\n[이번 변주 #${seed}] ${pick(VAR_COMPOSITION, seed, 1)} · ${pick(VAR_DENSITY, seed, 2)} · ` +
    `${pick(VAR_EMPHASIS, seed, 3)}. 스타일은 그대로 유지하되 직전 생성과 분명히 다른 구체 팔레트값·구도로.`
  );
}

/** Build the `[디자인 스타일]` task block for a picked style (recipe + commit + variation). */
export function composeStyleTask(style: DesignStyle, seed: number): string {
  return `\n\n[디자인 스타일] ${style.recipe}${COMMIT_TAIL}${variationLine(seed)}`;
}

/** Build the AUTO directive — the agent reads the content and picks the best-fit style
 *  from the catalog (grouped by use-case), then commits to it. */
export function autoStyleDirective(seed: number): string {
  const catalog = STYLE_GROUPS.map((g) => {
    const labels = DESIGN_STYLES.filter((s) => s.groupId === g.id)
      .map((s) => s.label)
      .join(" / ");
    return `· ${g.useCase} → ${labels}`;
  }).join("\n");
  return (
    "\n\n[디자인 스타일: 자동] 콘텐츠의 도메인·목적·오디언스를 먼저 분석하고, 아래에서 가장 잘 맞는 스타일 " +
    "하나를 골라 그 스타일로 일관되게 디자인하세요(고른 스타일 이름을 응답에 한 줄로 밝혀주세요):\n" +
    `${catalog}${COMMIT_TAIL}${variationLine(seed)}`
  );
}
