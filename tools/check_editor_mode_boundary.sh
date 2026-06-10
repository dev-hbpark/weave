#!/usr/bin/env bash
#
# editor-mode layer-boundary gate (WI-166 / DR-114 §2b).
#
# The workspace spine says layer boundaries are BUILD-GRAPH RULES, not
# conventions. For `apps/web/src/document/editor-mode/` that contract is:
#
#   1. Consumers import `editor-mode/types.js` ONLY. Importing
#      `editor-mode/pieces/*`, `editor-mode/modes/*` or
#      `editor-mode/registry` from outside the module is a layer violation —
#      policies arrive by manual injection (Provider / props / function
#      arguments), never by a consumer resolving them itself.
#   2. The registry / Provider may be imported only by COMPOSITION ROOTS,
#      declared in `.editor-mode-roots` (one path per line, # = comment).
#   3. Policies are pure: no React import inside `editor-mode/` except
#      `EditorModeProvider.tsx` (the single React composition-root file).
#
# Usage:   bash tools/check_editor_mode_boundary.sh
# Env:     MODULE (default "apps/web/src/document/editor-mode")
#          ROOTS_FILE (default ".editor-mode-roots")
set -euo pipefail

MODULE="${MODULE:-apps/web/src/document/editor-mode}"
ROOTS_FILE="${ROOTS_FILE:-.editor-mode-roots}"

if [ ! -d "$MODULE" ]; then
  echo "OK: $MODULE not present — editor-mode boundary not enforced."
  exit 0
fi

COMPOSITION_ROOTS=()
if [ -f "$ROOTS_FILE" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in "" | "#"*) ;; *) COMPOSITION_ROOTS+=("$line") ;; esac
  done < "$ROOTS_FILE"
fi

is_composition_root() {
  local f="$1"
  for r in "${COMPOSITION_ROOTS[@]:-}"; do
    [ -z "$r" ] && continue
    [ "$f" = "$r" ] && return 0
  done
  return 1
}

violations=0

# Rule 1+2 — outside the module, only types may be imported; the registry /
# Provider only from declared composition roots. (pieces/modes: never.)
while IFS= read -r line; do
  file="${line%%:*}"
  case "$file" in "$MODULE"/*) continue ;; esac
  content="${line#*:}"; content="${content#*:}"
  if printf '%s' "$content" | grep -Eq "editor-mode/(pieces|modes)/"; then
    echo "  BOUNDARY: pieces/modes import outside editor-mode/ — $line"
    violations=$((violations + 1))
    continue
  fi
  if printf '%s' "$content" | grep -Eq "editor-mode/(registry|EditorModeProvider)"; then
    if ! is_composition_root "$file"; then
      echo "  BOUNDARY: registry/Provider import from a non-composition-root — $line"
      echo "            (declare composition roots in $ROOTS_FILE)"
      violations=$((violations + 1))
    fi
  fi
done < <(
  grep -rEn "from[[:space:]]+[\"'][^\"']*editor-mode/(pieces|modes|registry|EditorModeProvider)" \
    --include='*.ts' --include='*.tsx' \
    --exclude-dir='node_modules' --exclude-dir='dist' \
    apps packages 2>/dev/null || true
)

# Rule 3 — policy purity: no React inside editor-mode/ except the Provider
# (and the module's own tests, which exercise pure functions only but may
# import test renderers in the future — keep them out of the React ban).
while IFS= read -r line; do
  file="${line%%:*}"
  case "$file" in
    */EditorModeProvider.tsx | *.test.ts | *.test.tsx) continue ;;
  esac
  echo "  PURITY: React import inside editor-mode/ (policies are pure) — $line"
  violations=$((violations + 1))
done < <(
  grep -rEn "from[[:space:]]+[\"']react" \
    --include='*.ts' --include='*.tsx' \
    "$MODULE" 2>/dev/null || true
)

# Rule 4 — G4 (DR-114 §6, added in WI-166 P5): consumers never branch on
# the declarative CanvasMode tag. A `ctx.mode === "infinite" /
# "page-bounded"` comparison in a consumer is a mode branch that should be
# promoted to a policy field instead. The two literals are unique to
# CanvasMode, so a plain grep outside the module is precise. The module
# itself (pieces/modes compose the tag) and tests are exempt.
while IFS= read -r line; do
  file="${line%%:*}"
  case "$file" in
    "$MODULE"/* | *.test.ts | *.test.tsx) continue ;;
  esac
  echo "  G4: CanvasMode comparison outside editor-mode/ (promote the branch to a policy field) — $line"
  violations=$((violations + 1))
done < <(
  grep -rEn '\.mode[[:space:]]*[!=]==?[[:space:]]*"(infinite|page-bounded)"' \
    --include='*.ts' --include='*.tsx' \
    --exclude-dir='node_modules' --exclude-dir='dist' \
    apps packages 2>/dev/null || true
)

if [ "$violations" -gt 0 ]; then
  echo "FAIL: $violations editor-mode boundary violation(s) (DR-114 §2b)."
  exit 1
fi
echo "OK: editor-mode boundary clean (consumers import types only; policies pure; no G4 mode compares)."
