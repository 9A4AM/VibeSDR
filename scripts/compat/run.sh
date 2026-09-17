#!/usr/bin/env bash
# The compatibility gate (docs/PROTOCOL.md, BRIEF-v11-compatibility §8): every fixture in this
# directory against one server. Usage: scripts/compat/run.sh http://host:port
# A fixture is a CAPTURED client — never edit one; record a new one from a real session instead.
set -uo pipefail
target="${1:-${VIBE_COMPAT_TARGET:-}}"
if [ -z "$target" ]; then echo "usage: $0 http://host:port  (or VIBE_COMPAT_TARGET)"; exit 2; fi
dir="$(cd "$(dirname "$0")" && pwd)"
fail=0; n=0
for f in "$dir"/*.mjs; do
  n=$((n+1))
  echo "== $(basename "$f") → $target"
  if node "$f" "$target"; then echo "   PASS"; else echo "   FAIL"; fail=$((fail+1)); fi
done
echo "compat: $n fixture(s), $fail failed"
[ "$fail" -eq 0 ]
