#!/usr/bin/env bash
#
# repack-vendor.sh — rebuild every @agocraft/* package, pack into
# apps/web/vendor/agocraft/, and rewrite apps/web/package.json +
# workspace root pnpm.overrides so the new tarball filenames are
# wired up.
#
# Run from the weave repo root (the dir that has apps/web/, package.json,
# pnpm-workspace.yaml). Assumes a sibling `agocraft` checkout is at
# `../agocraft` (the default OS-root layout).
#
# After this script, run `pnpm install` and commit the resulting
# vendor/*.tgz + package.json + pnpm-lock.yaml.

set -euo pipefail

WEAVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
AGOCRAFT_ROOT="${AGOCRAFT_ROOT:-$WEAVE_ROOT/../agocraft}"
VENDOR_DIR="$WEAVE_ROOT/apps/web/vendor/agocraft"
VERSION="${VERSION:-1.0.0-rc.$(date -u +%Y%m%d%H%M%S)}"

if [ ! -d "$AGOCRAFT_ROOT/packages" ]; then
  echo "✗ Could not find agocraft at $AGOCRAFT_ROOT"
  echo "  Set AGOCRAFT_ROOT to the directory that contains agocraft/packages/"
  exit 1
fi

echo "▶ weave root  : $WEAVE_ROOT"
echo "▶ agocraft    : $AGOCRAFT_ROOT"
echo "▶ vendor dir  : $VENDOR_DIR"
echo "▶ new version : $VERSION"
echo

# 1. Build every agocraft package fresh.
echo "▶ Building all @agocraft/* packages …"
(cd "$AGOCRAFT_ROOT" && pnpm --filter './packages/*' build > /tmp/repack-build.log 2>&1) || {
  echo "✗ Build failed. See /tmp/repack-build.log"
  tail -40 /tmp/repack-build.log
  exit 1
}
echo "✓ build green"

# 2. Rewrite workspace:* deps to the exact $VERSION on every package
#    BEFORE packing (so each tarball has resolvable inner deps).
echo
echo "▶ Pinning workspace deps to $VERSION on every package …"
for pkg_dir in "$AGOCRAFT_ROOT"/packages/*/; do
  [ -f "$pkg_dir/package.json" ] || continue
  cp "$pkg_dir/package.json" "$pkg_dir/package.json.repack-bak"
  node -e "
    const fs=require('fs');
    const p=JSON.parse(fs.readFileSync('$pkg_dir/package.json','utf8'));
    p.version='$VERSION';
    for (const sec of ['dependencies','devDependencies','peerDependencies','optionalDependencies']) {
      if (!p[sec]) continue;
      for (const k of Object.keys(p[sec])) {
        if (typeof p[sec][k] === 'string' && p[sec][k].startsWith('workspace:')) {
          p[sec][k] = '$VERSION';
        }
      }
    }
    fs.writeFileSync('$pkg_dir/package.json', JSON.stringify(p, null, 2)+'\n');
  "
done

# Restore agocraft's package.json files on exit, no matter what.
restore_agocraft() {
  for pkg_dir in "$AGOCRAFT_ROOT"/packages/*/; do
    if [ -f "$pkg_dir/package.json.repack-bak" ]; then
      mv "$pkg_dir/package.json.repack-bak" "$pkg_dir/package.json"
    fi
  done
}
trap restore_agocraft EXIT

# 3. Clean + repack into vendor/.
echo
echo "▶ Packing tarballs into $VENDOR_DIR …"
mkdir -p "$VENDOR_DIR"
rm -f "$VENDOR_DIR"/*.tgz
NAMES=()
for pkg_dir in "$AGOCRAFT_ROOT"/packages/*/; do
  pkg_name=$(node -p "require('$pkg_dir/package.json').name" 2>/dev/null || echo "")
  [[ "$pkg_name" == @agocraft/* ]] || continue
  (cd "$pkg_dir" && npm pack --pack-destination "$VENDOR_DIR" --silent > /dev/null) || {
    echo "  ✗ $pkg_name"
    exit 1
  }
  echo "  ✓ $pkg_name"
  NAMES+=("${pkg_name#@agocraft/}")
done

# 4. Rewrite apps/web/package.json + workspace pnpm.overrides.
echo
echo "▶ Rewriting apps/web/package.json + root pnpm.overrides …"
node -e "
  const fs = require('fs');
  const path = require('path');
  const root = '$WEAVE_ROOT';
  const V = '$VERSION';
  const names = '$(IFS=,; echo "${NAMES[*]}")'.split(',').filter(Boolean);

  // 4a — apps/web/package.json: rewrite every @agocraft/X to the vendor file: path.
  const appPath = path.join(root, 'apps/web/package.json');
  const app = JSON.parse(fs.readFileSync(appPath, 'utf8'));
  for (const sec of ['dependencies', 'devDependencies']) {
    if (!app[sec]) continue;
    for (const k of Object.keys(app[sec])) {
      if (k.startsWith('@agocraft/')) {
        const short = k.slice('@agocraft/'.length);
        app[sec][k] = 'file:vendor/agocraft/agocraft-' + short + '-' + V + '.tgz';
      }
    }
  }
  fs.writeFileSync(appPath, JSON.stringify(app, null, 2) + '\n');

  // 4b — workspace root: pnpm.overrides for transitive resolution.
  const rootPath = path.join(root, 'package.json');
  const r = JSON.parse(fs.readFileSync(rootPath, 'utf8'));
  r.pnpm = r.pnpm || {};
  r.pnpm.overrides = {};
  for (const short of names) {
    r.pnpm.overrides['@agocraft/' + short] =
      'file:apps/web/vendor/agocraft/agocraft-' + short + '-' + V + '.tgz';
  }
  fs.writeFileSync(rootPath, JSON.stringify(r, null, 2) + '\n');
"

echo
echo "✓ Done. Next:"
echo "  cd $WEAVE_ROOT && pnpm install"
echo "  git add apps/web/vendor/agocraft apps/web/package.json package.json pnpm-lock.yaml"
echo "  git commit -m 'chore: re-vendor agocraft tarballs ($VERSION)'"
