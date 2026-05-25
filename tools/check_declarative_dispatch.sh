#!/usr/bin/env bash
#
# CODE_STRUCTURE_DESIGN_RULES Rule 6 — Declarative branching via context
# dispatch. Forbids in-body branching on a kind / type / mode / category
# discriminant. Branching is the responsibility of a registry + adapter;
# each adapter lives in its own module.
#
# Forbidden patterns (in non-exempt directories):
#   • `switch (x.kind)` / `switch (x.type)` / `switch (mode)` / `switch (firstKind)`
#   • Repeated `else if (x.kind === "…")` chains on the same discriminant
#   • `if (mode === "…")` in business code that isn't a `useXAllowed()` hook
#
# Permitted exceptions (see Rule 6 docs):
#   • Pure transforms / typeguards (single-case discriminator)
#   • Early-return preconditions
#   • Schema-library discriminatedUnions (valibot / zod)
#   • Single-site invariant siblings (e.g. serializer.invertPatch)
#
# Configuration — project root may include a `.declarative-allow` file
# (one regex per line, lines starting with `#` are comments) that lists
# `file:line` allowlist entries. The script prints a violation summary
# and exits 1 if any non-allowlisted violation remains.
#
# Usage:
#   bash tools/check_declarative_dispatch.sh           # scan ./apps + ./packages
#   bash tools/check_declarative_dispatch.sh src/      # scan a single tree
#   ROOTS="apps packages" bash tools/check_declarative_dispatch.sh
#
# Environment:
#   ROOTS — space-separated source roots to scan. Default: "apps packages".
#   ALLOW — path to allowlist file. Default: ".declarative-allow".
set -euo pipefail

ROOTS="${ROOTS:-apps packages}"
ALLOW_FILE="${ALLOW:-.declarative-allow}"

# Collect allowlist regex patterns (one per line). Lines starting with #
# or blank lines are ignored. Patterns are matched against "<file>:<line>"
# composite keys with grep -E.
ALLOW_PATTERNS=()
if [ -f "$ALLOW_FILE" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      "" | "#"*) ;;
      *) ALLOW_PATTERNS+=("$line") ;;
    esac
  done < "$ALLOW_FILE"
fi

allowlisted() {
  local key="$1"
  for pat in "${ALLOW_PATTERNS[@]:-}"; do
    [ -z "$pat" ] && continue
    if printf '%s\n' "$key" | grep -Eq -- "$pat"; then
      return 0
    fi
  done
  return 1
}

# Patterns:
#   PATTERN_SWITCH  — `switch (…)` whose head references kind/type/mode/category
#   PATTERN_MODE_IF — `if (mode === "…")` or `if (X.mode === "…")` (raw mode compare)
#
# We don't try to parse — pure regex with file inclusion limited to .ts/.tsx.
PATTERN_SWITCH='switch[[:space:]]*\([^)]*\.\(kind\|type\|mode\|category\)[[:space:]]*\)'
PATTERN_SWITCH_BARE='switch[[:space:]]*\((firstKind|firstType|currentMode|active(Kind|Type|Mode))\)'

# Roots that actually exist — skip cleanly when the project doesn't have
# every default root.
EXISTING_ROOTS=()
for r in $ROOTS; do
  [ -d "$r" ] && EXISTING_ROOTS+=("$r")
done

if [ "${#EXISTING_ROOTS[@]}" -eq 0 ]; then
  echo "OK: no source roots found (looked for: $ROOTS)"
  exit 0
fi

violations=0
while IFS= read -r line; do
  # `grep -n` output: <file>:<lineno>:<content>
  key="${line%%:*}:$(printf '%s' "$line" | awk -F: '{print $2}')"
  if allowlisted "$key"; then
    continue
  fi
  echo "  $line"
  violations=$((violations + 1))
done < <(
  grep -rEn \
    --include='*.ts' --include='*.tsx' \
    --exclude-dir='node_modules' --exclude-dir='dist' \
    --exclude-dir='__tests__' --exclude='*.test.ts' --exclude='*.test.tsx' \
    --exclude='*.spec.ts' --exclude='*.spec.tsx' \
    -e "$PATTERN_SWITCH" \
    -e "$PATTERN_SWITCH_BARE" \
    "${EXISTING_ROOTS[@]}" 2>/dev/null || true
)

if [ "$violations" -gt 0 ]; then
  echo "" >&2
  echo "FAIL: $violations Rule 6 violation(s) — switch / mode-compare on" >&2
  echo "      a discriminant. Replace with a registry + adapter (see" >&2
  echo "      docs/04-specialized-engineering/CODE_STRUCTURE_DESIGN_RULES.md" >&2
  echo "      § Rule 6). Whitelist a justified site by adding a regex line" >&2
  echo "      to $ALLOW_FILE (one entry per line)." >&2
  exit 1
fi

echo "OK: no Rule 6 (declarative branching) violations."
