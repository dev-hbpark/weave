// AKU composition-archetype catalog (WI-233) — the STRUCTURAL diversity axis,
// sibling to the design-style (palette/effect) axis in `design-styles.ts`. The
// design-style varies the LOOK (color, typography, shadow, effects); a slide can
// wear any style yet still come out as the same uniform stack of rectangular
// bands (header → body → columns → stat-row), because the layout rules optimize
// for fit-safety and offer no vocabulary for varying the MACRO composition. That
// is the convergence the operator hit: "everything goes into grid/flex, so every
// design looks the same".
//
// An archetype names a MACRO composition — how the slide as a WHOLE is organized
// (full-bleed hero, asymmetric split, layered overlap, big-number focal, …). It
// is deliberately PALETTE-AGNOSTIC and FIT-SAFETY-PRESERVING: it dictates the
// slide's overall shape, NOT how a content GROUP is internally arranged. Inside
// any group of 2+ items the agent still uses auto-layout (flex/grid) so nothing
// collides or overflows — the archetype only decides the arrangement of those
// groups across the slide, and explicitly licenses the off-grid moves (overlap,
// bleed, asymmetry, rotation, a single dominating focal element) that a uniform
// band stack never reaches. Rotating the archetype per generation (seeded, like
// the style re-roll) is what makes two runs of the SAME content + SAME style read
// as genuinely different layouts.

export interface CompositionArchetype {
  readonly id: string;
  /** Short KR label (appears in the directive). */
  readonly label: string;
  /** The concrete macro-structure recipe — pure STRUCTURE, no palette/effect
   *  (those come from the style spec). Describes how the whole slide is organized. */
  readonly recipe: string;
}

/** The macro-composition catalog. Each entry breaks out of the "uniform stack of
 *  rectangular bands" in a DIFFERENT way; several (full-bleed, overlap, diagonal,
 *  big-number, canvas-diagram) are intentionally NOT grid-of-bands so the agent
 *  has somewhere structural to go. Keep recipes palette-agnostic. */
export const COMPOSITION_ARCHETYPES: ReadonlyArray<CompositionArchetype> = [
  {
    id: "full-bleed-hero",
    label: "풀블리드 히어로",
    recipe:
      "슬라이드 전체를 덮는 단일 배경(이미지/색면/그라데이션) 위에 텍스트를 한쪽 모서리(좌하단·우하단 등)에 오버레이 — 격자 없이 하나의 큰 포컬에 집중. 배경 위 텍스트엔 스크림/대비로 가독 확보. 균등 밴드 분할 금지.",
  },
  {
    id: "asymmetric-split",
    label: "비대칭 분할",
    recipe:
      "화면을 비대칭 2분할(예 0.38:0.62 또는 0.3:0.7) — 넓은 쪽은 큰 비주얼/색면/차트, 좁은 쪽은 텍스트 스택. 두 쪽의 무게가 다르게. 1:1 균등 컬럼은 피하고 한쪽이 분명히 지배하게.",
  },
  {
    id: "editorial-columns",
    label: "매거진 컬럼",
    recipe:
      "잡지식 다단(2~3 컬럼) 그리드 + 큰 제목/드롭캡과 강한 타이포 위계, 넉넉한 거터와 여백, 얇은 룰/구분선으로 컬럼을 가름. 텍스트가 흐르되 정렬은 엄격하게.",
  },
  {
    id: "big-number-focal",
    label: "빅 넘버 포컬",
    recipe:
      "하나의 거대한 수치/한 단어가 화면을 압도(화면 폭의 절반 이상) + 작은 캡션/라벨만 곁들임, 사방 여백. 나머지 정보는 작고 조용하게 주변에. 데이터 슬라이드의 단일 핵심에 적합.",
  },
  {
    id: "layered-overlap",
    label: "레이어드 오버랩",
    recipe:
      "요소들을 의도적으로 겹쳐 z-깊이 연출 — 카드가 이미지/색면을 일부 덮고, 큰 도형이 텍스트 블록 뒤로 살짝 빠져나오고, 배지/칩이 패널 경계를 가로지름. 모든 겹침은 의도적이고 가독 처리(스크림/대비) 동반.",
  },
  {
    id: "sidebar-shell",
    label: "사이드바 셸",
    recipe:
      "좁은 세로 사이드바(인덱스·섹션명·강조 색띠·아이콘 열) + 넓은 메인 영역. 사이드바는 강조색으로 채워 앵커 역할, 메인은 콘텐츠. 대시보드/목차/섹션 슬라이드에 적합.",
  },
  {
    id: "diagonal-flow",
    label: "대각선 흐름",
    recipe:
      "구성 축을 대각선으로 — 요소·구분선·이미지 밴드가 좌상→우하(또는 반대)로 흐르고, 회전된 액센트 도형/띠로 동세. 수평·수직 격자의 정적인 느낌을 깨뜨림. 텍스트 자체는 수평 유지해 가독 확보.",
  },
  {
    id: "bento-mosaic",
    label: "벤토 모자이크",
    recipe:
      "크기가 다른 둥근 타일들의 모자이크 — 일부는 columnSpan/rowSpan으로 크게(히어로 타일), 타일마다 하나의 포인트(아이콘·수치·미니차트·짧은 라벨). 균일 카드 격자가 아니라 의도적으로 크기를 달리.",
  },
  {
    id: "centered-stage",
    label: "센터 스테이지",
    recipe:
      "모든 요소를 중앙에 모으고 사방으로 넉넉한 여백 — 대칭 구도, 하나의 메시지가 무대 중앙에. 표지·클로징·선언형 한 문장 슬라이드에 적합. 채우려 하지 말고 여백을 디자인 요소로.",
  },
  {
    id: "canvas-diagram",
    label: "풀캔버스 다이어그램",
    recipe:
      "슬라이드 전체가 하나의 다이어그램(타임라인·플로우·동심원·벤·2×2·퍼널 등) — 도형·선·화살표가 공간을 쓰고 텍스트는 라벨로만. 격자에 욱여넣지 말고 관계를 공간으로 표현. 관계형 콘텐츠에 적합.",
  },
];

const ARCHETYPE_BY_ID = new Map(COMPOSITION_ARCHETYPES.map((a) => [a.id, a]));

/** Resolve an archetype by id (undefined for null/unknown). */
export function archetypeById(id: string | null | undefined): CompositionArchetype | undefined {
  return id == null ? undefined : ARCHETYPE_BY_ID.get(id);
}

function pick<T>(list: ReadonlyArray<T>, seed: number, step: number): T {
  const n = list.length;
  const idx = ((Math.floor(seed / step) % n) + n) % n;
  return list[idx] as T;
}

/** Deterministically pick the macro-composition archetype for a generation `seed`
 *  (step 1 → rotates EVERY seed, so a held style re-rolls its structure each run). */
export function archetypeForSeed(seed: number): CompositionArchetype {
  return pick(COMPOSITION_ARCHETYPES, seed, 1);
}

/** The macro-composition directive fragment, injected into the per-request
 *  variation. Names the archetype + recipe and restates the fit-safety boundary:
 *  groups stay in auto-layout, the MACRO shape follows the archetype. */
export function composeArchetypeDirective(seed: number): string {
  const a = archetypeForSeed(seed);
  return (
    `구도(매크로): ${a.label} — ${a.recipe}` +
    " 콘텐츠 그룹 내부(2+ 항목)는 auto-layout(flex/grid)으로 정렬·충돌방지를 유지하되, 슬라이드 전체의 짜임새는 위 archetype을 따르세요 — 모든 슬라이드를 동일한 밴드 스택(헤더→본문→컬럼→스탯행)으로 찍어내지 말 것. archetype은 구도만 지시하며 팔레트·폰트·효과는 스타일 스펙을 그대로 따릅니다."
  );
}
