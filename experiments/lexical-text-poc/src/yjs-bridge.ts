import * as Y from "yjs";

/**
 * In-memory bidirectional Yjs provider.
 *
 * 두 Y.Doc 을 서로의 update event 로 sync — 한 페이지 안에서 두 Lexical editor 가
 * 마치 두 사용자가 같은 문서를 편집하는 것처럼 동작하게 한다.
 *
 * 실제 weave production 에서는 @agocraft/sync 가 이 역할을 한다 (HANDOFF-010 §C).
 * 이 PoC 는 그 wire 가 동작할 환경을 시뮬레이션.
 */
export interface SharedYDocPair {
  readonly docA: Y.Doc;
  readonly docB: Y.Doc;
  destroy(): void;
}

export function createSharedYDocPair(): SharedYDocPair {
  const docA = new Y.Doc();
  const docB = new Y.Doc();

  let _suppressA = false;
  let _suppressB = false;

  const onUpdateA = (update: Uint8Array, origin: unknown) => {
    if (origin === "remote") return;
    _suppressB = true;
    Y.applyUpdate(docB, update, "remote");
    _suppressB = false;
  };

  const onUpdateB = (update: Uint8Array, origin: unknown) => {
    if (origin === "remote") return;
    _suppressA = true;
    Y.applyUpdate(docA, update, "remote");
    _suppressA = false;
  };

  docA.on("update", onUpdateA);
  docB.on("update", onUpdateB);

  return {
    docA,
    docB,
    destroy() {
      docA.off("update", onUpdateA);
      docB.off("update", onUpdateB);
      docA.destroy();
      docB.destroy();
    },
  };
}

/**
 * Quill Delta 호환 텍스트 attribute (DR-015 §Why ¶6, FR-002 §4 trade-off #4).
 * 실제 weave 의 PartialTextStyle 의 subset.
 */
export interface TextAttributes {
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly color?: string;
  readonly underline?: boolean;
}
