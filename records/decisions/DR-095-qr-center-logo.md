# DR-095 — QR 중앙 로고(아이콘) 오버레이

- 상태: ACCEPTED
- 날짜: 2026-06-07
- 관련: [WI-140](../work-items/WI-140-qr-center-logo.md), 선행 [WI-058](../work-items/WI-058-qr-code-item.md) / [FR-012](../feasibility-reviews/FR-012-qr-code-item.md)
- 선례: qr/chart/embed(weave-로컬 kind 확장), image(blob resource 저장)

## 맥락

WI-058이 로고를 v1에서 제외(FR-012: "EC=H 필요"). 단일 SVG 렌더라 오버레이 추가는 저비용.
신규 kind가 아닌 **`qr` kind 확장**. 핵심은 "스캔되는 QR을 양산하지 않는다".

## 결정

1. **`QrAttrs.logo?` 필드로 확장**(신규 kind 아님). `{ iconId, scale?, padding? }`만 저장,
   `onUnknown:"preserve"`로 직렬화 무변경. 렌더는 기존 SVG 위에 오버레이만 추가.

2. **v1 = 내장 아이콘 화이트리스트만.** 디자인시스템 `Icon*`에서 선택 → 저장은 `iconId` 문자열뿐.
   **사용자 업로드는 v2로 분리**(blob resource + 전역 공유 워크스페이스 보안·쿼터 검토 필요,
   `apps/web/CLAUDE.md` 보안 모델). data-URL 인라인 저장 금지(문서 비대화).

3. **스캔성 3중 방어를 기능 정의에 포함**(옵션 아님):
   - 로고 크기 **전체 면적 ~20% 이하 클램프**(가로 ≤ 0.25). UI 초과 확대 불가.
   - 로고 ON 시 **EC 자동 상향**(최소 Q, 권장 H) + 경고.
   - 로고 뒤 **녹아웃**(배경색 둥근 사각형)으로 모듈 분리.

4. **모듈 비제거(matrix 불변)**: 매트릭스는 그대로 생성하고 로고가 시각적으로 덮는다. EC 복원에
   의존 → qr-matrix 로직/테스트 무변경, 로고는 순수 렌더 레이어.

## Touch points (qr 미러)

types(`QrAttrs.logo`) · QrBlock(녹아웃 rect + 아이콘 오버레이, 중앙 배치, scale 클램프) ·
qr-section(아이콘 피커 + 크기 슬라이더 + EC 자동상향/경고) · command-schemas(QR_ATTRS_NOTE) ·
e2e(로고 on/off + Cmd+Z). `isDomainItem`·seed·domain-kinds SPECS 무변경(기존 qr).

## 디자인 시스템

아이콘 피커가 신규면 `records/design-reviews/DR-design-NNN`로 협업. 기존 GridPicker/Select
(DR-design-021)로 extend 가능하면 트리아지 reuse/extend 단계에서 종결.

## 트레이드오프 / 결과

- (+) 브랜드 식별↑, 저비용(SVG 오버레이 1장), kind 확장이라 직렬화/렌더 게이트 무변경.
- (+) 내장 아이콘만이라 blob/보안/쿼터 리스크 0, 무손실 라운드트립.
- (−) **EC 강제 상향 → 데이터 용량 감소**(같은 크기에 더 적은 데이터). 긴 URL은 모듈 밀도↑.
- (−) **스캔성은 인쇄 크기·스캐너 품질에 여전히 의존** — 크기 클램프로 완화하나 보장 아님.
  (안내 문구 + 권장 사용법 제공.)
- (−) **사용자 업로드 미지원**(v1) — 내장 세트로만. 업로드는 v2.

## 후속

- v2: 사용자 이미지 업로드(blob resource), 로고 위치/모양 옵션, export 캡처 검증.
