#!/bin/bash
# ★★★ WHAT IS ACTUALLY IN THE PACKAGE — run this before installing one anywhere.
#
# A package built on 2026-09-20 was missing the bundled cloudflared because the build tree had no tools/
# directory. CMake warned; the warning was filtered out of the build log; installing it deleted the binary from
# the machine and took Stuart's Lenovo off the public map for forty minutes while it still served the LAN.
# CMake now refuses that build — this checks the ARTEFACT as well, because the two can fail differently.
#
#   scripts/check-deb.sh path/to/vibeserver_x.y.z_arch.deb
set -u
deb=${1:?usage: check-deb.sh <package.deb>}
# ★ ABSOLUTE, because the ar path below runs from a temp directory — a RELATIVE path silently became
#   "cannot read", which is a checker that fails open. The one thing this script must never do.
case "$deb" in /*) ;; *) deb="$PWD/$deb" ;; esac
[ -f "$deb" ] || { echo "no such package: $deb"; exit 2; }
# ★ Works where the package is BUILT as well as where it is installed: a Mac has no dpkg-deb, and a check that
#   only runs on Debian is a check I would skip exactly when I am building by hand on the Mac.
if command -v dpkg-deb >/dev/null 2>&1; then
  list=$(dpkg-deb -c "$deb" 2>/dev/null)
else
  tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
  (cd "$tmp" && ar x "$deb" 2>/dev/null) || { echo "cannot read $deb"; exit 2; }
  data=$(ls "$tmp"/data.tar.* 2>/dev/null | head -1)
  [ -n "$data" ] || { echo "cannot read $deb"; exit 2; }
  list=$(tar tvf "$data" 2>/dev/null)
fi
[ -n "$list" ] || { echo "cannot read $deb"; exit 2; }
fail=0
want=(
  "usr/bin/vibeserver                       the server itself"
  "usr/lib/vibeserver/cloudflared           the bundled tunnel — without it a CGNAT server has no address"
  "usr/lib/systemd/system/vibeserver.service the unit that starts it at boot"
  "usr/lib/vibeserver/vibeserver-governor   the CPU governor helper"
)
for w in "${want[@]}"; do
  path=${w%% *}; why=$(echo "$w" | sed 's/^[^ ]* *//')
  if echo "$list" | grep -qE "(^| )\./?${path}( |\$)"; then
    printf "  ok      %s\n" "$path"
  else
    printf "  MISSING %-42s %s\n" "$path" "$why"; fail=1
  fi
done
size=$(echo "$list" | awk '/cloudflared$/ {for (i=1;i<=NF;i++) if ($i ~ /^[0-9]+$/ && $i > 1000) {print $i; exit}}' | head -1)
[ -n "${size:-}" ] && [ "$size" -lt 1000000 ] && { echo "  cloudflared is only $size bytes — not a real binary"; fail=1; }
echo "$(basename "$deb"): $([ $fail = 0 ] && echo "complete" || echo "INCOMPLETE — do not install")"
exit $fail
