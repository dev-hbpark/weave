#!/usr/bin/env bash
#
# CODE_STRUCTURE_DESIGN_RULES Rule 6 — Declarative branching via context
# dispatch. Forbids in-body branching on a kind / type / mode / category
# discriminant. Branching is the responsibility of a registry + adapter;
# each adapter lives in its own module.
#
# Forbidden patterns DETECTED here (in non-exempt directories):
#   • `switch (<expr>)` where <expr>'s final identifier ends in a discriminant
#     word — covers `switch (x.kind)`, bare `switch (kind)` / `switch (shape)` /
#     `switch (variant)`, and camelCase `switch (hover.hoveredKind)` /
#     `switch (ctx.selectedKind)` / `switch (firstKind)`. (AUDIT-007 widened this
#     from the member-only `[^)]*\.kind` form that V6-1/V6-2/A6-1 evaded.)
#   • `else if (<expr> === "…")` with the same discriminant-ending <expr> — the
#     2nd+ arm of an if-chain. (A single guard uses plain `if`, never `else if`,
#     so this has no false positives on permitted early-return guards.)
#
# NOT machine-detectable here (grep would be too noisy) — caught by code review
# / structural audit (records/audits/AUDIT-005, AUDIT-007) instead:
#   • Separate `if (x.kind === "a") {…} if (x.kind === "b") {…}` chains that
#     don't use `else if` (e.g. small-think S6-1's pre-fix shape).
#   • Object catalogues — `const X = { kindA: …, kindB: … }` mapping a
#     discriminant→behavior in one file (e.g. DOMAIN_RENDERERS, anti-pattern #189).
#   • `k === "a" || k === "b" || …` membership chains (e.g. V6-4's pre-fix shape).
#   • Discriminants NOT ending in the six words (`fit`, `role`, `status`, `state`,
#     `op`, `action`…) — widening to these trades recall for false positives.
#   This script is a BACKSTOP, not a proof of compliance — green != no violations.
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

# Patterns (grep -E / ERE — alternation is `(a|b)`, literal paren is `\(`).
# NOTE: an earlier revision wrote these in BRE form (`\(kind\|type\)`), which
# under `-E` matches the LITERAL text `(kind|type)` and therefore never fired —
# the switch check was silently a no-op. Keep all patterns in ERE.
#
#   PATTERN_SWITCH   — `switch (<expr>)` where <expr> is a member chain or a
#                      bare identifier whose FINAL identifier ENDS IN a
#                      discriminant word (kind|type|mode|category|variant|shape),
#                      case-insensitive on the camelCase hump. This catches all
#                      three forms: bare `switch (kind)` / `switch (shape)`,
#                      camelCase `switch (hover.hoveredKind)` /
#                      `switch (ctx.selectedKind)`, and member `switch
#                      (attrs.subAttrs.shape)` — the bare/camelCase variants the
#                      earlier `[^)]*\.` member-only pattern missed (AUDIT-007
#                      V6-1/V6-2/A6-1 evaded the gate this way).
#   PATTERN_ELSE_IF  — `else if (<expr> === "…")` with the same discriminant-
#                      ending <expr>, the 2nd+ arm of a discriminant if-chain.
#                      Single early-return guards use plain `if`, never `else
#                      if`, so this is false-positive-free against permitted
#                      guards. (Separate non-`else if` chains + membership `||`
#                      chains remain NOT machine-detectable — see header.)
#
# Discriminant tail — bare-lowercase OR camelCase-suffix (ERE has no `-i`, so
# both cases are listed explicitly). `[A-Za-z0-9_$]*` before it lets the final
# identifier carry a prefix (`hovered`Kind, `selected`Kind, `first`Kind, `Sub`Kind).
_DISC='(kind|Kind|type|Type|mode|Mode|category|Category|variant|Variant|shape|Shape)'
_EXPR="([A-Za-z_\$][A-Za-z0-9_\$]*\.)*[A-Za-z0-9_\$]*${_DISC}"
PATTERN_SWITCH="switch[[:space:]]*\(${_EXPR}[[:space:]]*\)"
PATTERN_ELSE_IF="else[[:space:]]+if[[:space:]]*\(${_EXPR}[[:space:]]*===[[:space:]]*\""

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
  # Skip matches that live inside a comment — a `switch (x.kind)` written in a
  # `//` or `*` doc line is prose, not branching. Strip the `<file>:<lineno>:`
  # prefix, trim leading whitespace, and ignore lines that start a comment.
  content="${line#*:}"; content="${content#*:}"
  trimmed="${content#"${content%%[![:space:]]*}"}"
  case "$trimmed" in
    "//"* | "*"* | "/*"*) continue ;;
  esac
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
    -e "$PATTERN_ELSE_IF" \
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
