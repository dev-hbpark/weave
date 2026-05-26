#!/usr/bin/env node
/**
 * Tree-shaking 3-gate check (FR-002, DR-015 §Why ¶3, [[feedback-tree-shaking-first]]):
 *
 *   1. ESM build 제공 ("module" or "exports" with import condition)
 *   2. "sideEffects": false (또는 부분적 sideEffects 명시 — 정직한 명시도 PASS)
 *   3. reflect-metadata 비의존 (transitive 검사)
 *
 * 검사 대상: lexical, @lexical/react, @lexical/yjs, yjs
 *
 * 실행: pnpm install 후 `node scripts/check-tree-shake-gate.mjs`
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const targets = ["lexical", "@lexical/react", "@lexical/yjs", "yjs"];
const root = process.cwd();
const nodeModules = join(root, "node_modules");

let allPass = true;

function checkPackage(name) {
  const pkgPath = join(nodeModules, name, "package.json");
  if (!existsSync(pkgPath)) {
    console.log(`  ${name}: SKIP (not installed — run pnpm install first)`);
    allPass = false;
    return;
  }

  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const hasModule = typeof pkg.module === "string";
  const hasExportsImport =
    pkg.exports && JSON.stringify(pkg.exports).includes('"import"');
  const esm = hasModule || hasExportsImport || pkg.type === "module";

  let sideEffects = "unknown";
  if (pkg.sideEffects === false) sideEffects = "false (BEST)";
  else if (Array.isArray(pkg.sideEffects))
    sideEffects = `partial (${pkg.sideEffects.length} entries — OK if CSS-only)`;
  else if (pkg.sideEffects === true) sideEffects = "TRUE (FAIL)";
  else sideEffects = "unspecified (treat as true → likely FAIL)";

  const deps = { ...(pkg.dependencies || {}), ...(pkg.peerDependencies || {}) };
  const reflectMeta = "reflect-metadata" in deps ? "PRESENT (FAIL)" : "absent (PASS)";

  const pass =
    esm &&
    (pkg.sideEffects === false || Array.isArray(pkg.sideEffects)) &&
    !("reflect-metadata" in deps);

  console.log(`\n  ${name}@${pkg.version}`);
  console.log(`    ESM: ${esm ? "PASS" : "FAIL"}`);
  console.log(`    sideEffects: ${sideEffects}`);
  console.log(`    reflect-metadata: ${reflectMeta}`);
  console.log(`    -> ${pass ? "PASS" : "FAIL"}`);
  if (!pass) allPass = false;
}

console.log("Tree-shaking 3-gate check (DR-015 / FR-002 / feedback-tree-shaking-first):");
for (const t of targets) checkPackage(t);

console.log(`\nOverall: ${allPass ? "PASS" : "FAIL"}`);
process.exit(allPass ? 0 : 1);
