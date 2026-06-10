#!/usr/bin/env bash
#
# Composition-over-inheritance gate (OS-root Core Engineering Principles +
# CODE_STRUCTURE_DESIGN_RULES Rule 2). Inheritance used for code reuse is a
# maintainability debt and an Open-Closed trap. `extends` is permitted ONLY for:
#   - an `Error` subclass (native instanceof + v8 stack capture), or
#   - a forced framework base class, declared as an ALLOW regex in
#     `.inheritance-allow` (one `file:line` regex per line, # = comment).
# Model variation with composition — Strategy / Adapter / Decorator / State /
# Command as composed functions or objects behind a registry — never a
# subtype-per-kind class tree.
#
# Usage:   bash tools/check_inheritance.sh
# Env:     ROOTS (default "packages apps"), ALLOW (default ".inheritance-allow")
set -euo pipefail

ROOTS="${ROOTS:-packages apps}"
ALLOW_FILE="${ALLOW:-.inheritance-allow}"

ALLOW_PATTERNS=()
if [ -f "$ALLOW_FILE" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in "" | "#"*) ;; *) ALLOW_PATTERNS+=("$line") ;; esac
  done < "$ALLOW_FILE"
fi

allowlisted() {
  local key="$1"
  for p in "${ALLOW_PATTERNS[@]:-}"; do
    [ -z "$p" ] && continue
    if printf '%s\n' "$key" | grep -Eq -- "$p"; then return 0; fi
  done
  return 1
}

EXISTING_ROOTS=()
for r in $ROOTS; do [ -d "$r" ] && EXISTING_ROOTS+=("$r"); done
if [ "${#EXISTING_ROOTS[@]}" -eq 0 ]; then
  echo "OK: no source roots found (looked for: $ROOTS)"
  exit 0
fi

violations=0
while IFS= read -r line; do
  file="${line%%:*}"
  lineno="$(printf '%s' "$line" | awk -F: '{print $2}')"
  key="$file:$lineno"
  content="${line#*:}"; content="${content#*:}"
  trimmed="${content#"${content%%[![:space:]]*}"}"
  # Skip comment lines (a `* extends` in a doc comment is prose, not a class).
  case "$trimmed" in "//"* | "*"* | "/*"*) continue ;; esac
  # Permitted: `extends <Anything>Error`.
  if printf '%s' "$content" | grep -Eq "extends[[:space:]]+[A-Za-z_]*Error\b"; then continue; fi
  if allowlisted "$key"; then continue; fi
  echo "  $line"
  violations=$((violations + 1))
done < <(
  grep -rEn "class[[:space:]]+[A-Za-z_][A-Za-z0-9_]*[[:space:]]+extends[[:space:]]" \
    --include='*.ts' --include='*.tsx' \
    --exclude-dir='node_modules' --exclude-dir='dist' \
    --exclude='*.test.ts' --exclude='*.test.tsx' --exclude='*.spec.ts' --exclude='*.spec.tsx' \
    "${EXISTING_ROOTS[@]}" 2>/dev/null || true
)

if [ "$violations" -gt 0 ]; then
  echo "" >&2
  echo "FAIL: $violations inheritance violation(s) — a 'class X extends Y' where Y is" >&2
  echo "      not an Error subclass. Favor composition over inheritance: model" >&2
  echo "      variation with Strategy / Adapter / Decorator + a registry, not a" >&2
  echo "      subtype-per-kind tree. Whitelist a forced framework base with an" >&2
  echo "      ALLOW regex line in $ALLOW_FILE." >&2
  exit 1
fi

echo "OK: no inheritance-for-reuse (composition over inheritance)."
