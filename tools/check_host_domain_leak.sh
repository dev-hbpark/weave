#!/usr/bin/env bash
#
# Library purity gate — a library/framework project (e.g. agocraft) must
# NOT reference any specific host's domain by name. Hosts (e.g. weave,
# kineo) are consumers; the library's public surface, types, and even
# docstrings must stay host-agnostic. Extension points (capability /
# registry / declaration merging) let the host fill in its specifics.
#
# This script reads a `.domain-purity` file at the project root that
# declares which words this project is forbidden to mention. Example:
#
#   # .domain-purity
#   # Forbidden host names — sister project domain terms agocraft must
#   # never reference. Add new sister hosts as they spin up.
#   weave
#   kineo
#
#   # Allowlist entries — exact `file:line` matches that are tolerated
#   # (legacy code awaiting cleanup, or a deliberate cross-link comment).
#   # ALLOW packages/legacy/foo.ts:42
#
# Format:
#   • Bare word    → forbidden token (case-insensitive whole-word match
#                    via grep -w). Lines starting with `#` are comments.
#   • `ALLOW <file:line>` → exempt that exact line.
#
# Scope:
#   By default scans `packages/` (library shape). Apps and records are
#   not scanned — apps are hosts. Override with $ROOTS.
#
# Usage:
#   bash tools/check_host_domain_leak.sh
#   ROOTS="packages" bash tools/check_host_domain_leak.sh
#
# Environment:
#   ROOTS — space-separated source roots to scan. Default: "packages".
#   PURITY — path to the purity file. Default: ".domain-purity".
set -euo pipefail

ROOTS="${ROOTS:-packages}"
PURITY_FILE="${PURITY:-.domain-purity}"

if [ ! -f "$PURITY_FILE" ]; then
  echo "OK: $PURITY_FILE not present — host-domain purity not enforced for this project."
  exit 0
fi

FORBIDDEN=()
ALLOW=()
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    "" | "#"*) ;;
    "ALLOW "*) ALLOW+=("${line#ALLOW }") ;;
    *) FORBIDDEN+=("$line") ;;
  esac
done < "$PURITY_FILE"

if [ "${#FORBIDDEN[@]}" -eq 0 ]; then
  echo "OK: $PURITY_FILE contains no forbidden words."
  exit 0
fi

is_allowed() {
  local key="$1"
  for entry in "${ALLOW[@]:-}"; do
    [ -z "$entry" ] && continue
    if [ "$key" = "$entry" ]; then return 0; fi
  done
  return 1
}

# Existing roots only.
EXISTING_ROOTS=()
for r in $ROOTS; do
  [ -d "$r" ] && EXISTING_ROOTS+=("$r")
done

if [ "${#EXISTING_ROOTS[@]}" -eq 0 ]; then
  echo "OK: no source roots found (looked for: $ROOTS)"
  exit 0
fi

violations=0
for word in "${FORBIDDEN[@]}"; do
  while IFS= read -r line; do
    file=$(printf '%s' "$line" | awk -F: '{print $1}')
    lineno=$(printf '%s' "$line" | awk -F: '{print $2}')
    key="$file:$lineno"
    if is_allowed "$key"; then continue; fi
    echo "  [$word] $line"
    violations=$((violations + 1))
  done < <(
    grep -rwni \
      --include='*.ts' --include='*.tsx' \
      --include='*.md' \
      --exclude-dir='node_modules' --exclude-dir='dist' \
      "$word" "${EXISTING_ROOTS[@]}" 2>/dev/null || true
  )
done

if [ "$violations" -gt 0 ]; then
  echo "" >&2
  echo "FAIL: $violations host-domain leak(s) — words listed in" >&2
  echo "      $PURITY_FILE were found in src. Rewrite to host-agnostic" >&2
  echo "      language ('the host' / 'host-defined …') OR add an" >&2
  echo "      'ALLOW <file>:<lineno>' line to $PURITY_FILE." >&2
  exit 1
fi

echo "OK: no host-domain leaks under $ROOTS."
