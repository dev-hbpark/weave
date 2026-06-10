#!/usr/bin/env bash
# DR-008 supporting check — forbids `export const Tokens = { ... }` style object
# catalogues that defeat tree-shaking (CODE_STRUCTURE_DESIGN_RULES Rule 2).
#
# Allowed: `export const SomethingToken = token<...>("...")`
# Allowed: `export const ALL_FOOS = [...] as const` (data array, not a catalogue of singletons)
# Forbidden: `export const Tokens = { Renderer: ..., Clock: ... }`
# Forbidden: `export default { ... }` in library packages (apps/* exempted via path filter)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

violations=0

# Search every packages/ src dir for the forbidden patterns.
while IFS= read -r match; do
  echo "  $match"
  violations=$((violations + 1))
done < <(
  grep -rEn --include='*.ts' --include='*.tsx' \
    -e '^export[[:space:]]+const[[:space:]]+[A-Z][A-Za-z0-9_]*[[:space:]]*=[[:space:]]*\{$' \
    -e '^export[[:space:]]+default[[:space:]]+\{$' \
    packages/*/src 2>/dev/null || true
)

if [ "$violations" -gt 0 ]; then
  echo "" >&2
  echo "FAIL: $violations object-catalogue / default-mega-object export(s) found." >&2
  echo "      Rewrite as named const exports (DR-008, CODE_STRUCTURE_DESIGN_RULES Rule 2)." >&2
  exit 1
fi

echo "OK: no object-catalogue exports found."
