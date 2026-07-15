#!/usr/bin/env bash
# Manual smoke test for the shared-map API against a running `npm run dev`.
# Usage: BASE=http://localhost:3000 bash tests/smoke-api.sh
set -uo pipefail

BASE="${BASE:-http://localhost:3000}"
VALID_NODES='[{"id":1,"parent":null,"text":"中心","note":"","x":0,"y":0,"tone":"ink"}]'

echo "BASE=$BASE"
echo "== 1) POST /api/maps (expect 201 + id) =="
CREATE=$(curl -s -X POST "$BASE/api/maps" -H 'content-type: application/json' \
  -d "{\"title\":\"測試\",\"nodes\":$VALID_NODES}")
echo "$CREATE"
ID=$(printf '%s' "$CREATE" | grep -oE '"id":"[^"]+"' | head -1 | cut -d'"' -f4)
echo "id=$ID"
if [ -z "$ID" ]; then
  echo "FAILED: no id returned (is dev running? is the table migrated?)"
  exit 1
fi

echo
echo "== 2) GET /api/maps/\$ID (expect title/nodes/version:1) =="
curl -s -w '\n[status=%{http_code}]\n' "$BASE/api/maps/$ID"

echo
echo "== 3) PUT #1 version:1 (expect 200, version:2) =="
curl -s -w '\n[status=%{http_code}]\n' -X PUT "$BASE/api/maps/$ID" -H 'content-type: application/json' \
  -d "{\"title\":\"改\",\"version\":1,\"nodes\":[{\"id\":1,\"parent\":null,\"text\":\"中心2\",\"note\":\"\",\"x\":0,\"y\":0,\"tone\":\"ink\"}]}"

echo
echo "== 4) PUT #2 stale version:1 (expect 409) =="
curl -s -w '\n[status=%{http_code}]\n' -X PUT "$BASE/api/maps/$ID" -H 'content-type: application/json' \
  -d "{\"title\":\"再改\",\"version\":1,\"nodes\":$VALID_NODES}"

echo
echo "== 5) POST invalid empty nodes (expect 400) =="
curl -s -w '\n[status=%{http_code}]\n' -X POST "$BASE/api/maps" -H 'content-type: application/json' \
  -d '{"title":"bad","nodes":[]}'

echo
echo "Done. Expected: 201 -> version:1 -> version:2 -> 409 -> 400"
