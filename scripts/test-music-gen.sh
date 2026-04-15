#!/usr/bin/env bash
# ============================================================
# Lucid White API E2E Test Script (macOS compatible)
# Usage: bash scripts/test-music-gen.sh
# Prereqs: pnpm dev running
# ============================================================

set -euo pipefail

BASE="http://localhost:3000"
MP3_FILE="/Users/nicejames/Downloads/hero_1.mp3"
CHANNEL_ID=""
SESSION_ID=""
PASS=0
FAIL=0

GREEN="\033[0;32m"; RED="\033[0;31m"; YELLOW="\033[0;33m"; NC="\033[0m"
pass() { echo -e "${GREEN}✓ PASS${NC} — $1"; ((++PASS)); }
fail() { echo -e "${RED}✗ FAIL${NC} — $1"; ((++FAIL)); }
info() { echo -e "${YELLOW}»${NC} $1"; }
assert_status() {
  local label="$1" expected="$2" actual="$3"
  [[ "$actual" == "$expected" ]] && pass "$label (HTTP $actual)" || fail "$label — expected $expected, got $actual"
}

# ── Step 0: Teardown ──────────────────────────────────────────
info "Step 0 — Teardown (idempotency)"
RAW=$(curl -s -w "\n%{http_code}" "$BASE/api/music-gen/channels")
CH_STATUS=$(echo "$RAW" | tail -n 1)
CH_BODY=$(echo "$RAW" | sed '$d')
if [[ "$CH_STATUS" == "200" ]]; then
  EX_ID=$(echo "$CH_BODY" | python3 -c "
import sys,json
cs=json.load(sys.stdin)
if isinstance(cs,list):
  for c in cs:
    if c.get('youtube_channel_id')=='@lucid-white-test': print(c['id']); break
" 2>/dev/null || true)
  if [[ -n "$EX_ID" ]]; then
    curl -s -o /dev/null -X DELETE "$BASE/api/music-gen/channels/$EX_ID"
    info "Deleted existing channel $EX_ID"
  else
    info "No prior test channel"
  fi
fi; echo ""

# ── Step 1: Create channel ────────────────────────────────────
info "Step 1 — POST /api/music-gen/channels"
S1_PAY=$(python3 -c "
import json
print(json.dumps({
  'channel_name':'Lucid White','youtube_channel_id':'@lucid-white-test',
  'lyric_format':'jp2_en1',
  'system_prompt':'Lucid White 브랜드 DNA — 90년대 빈티지 애니메이션과 실사 잡지의 절제된 서정성',
  'forbidden_words':['Glassmorphism','AI스러운','첨단'],'recommended_words':['여백','정제','투명한']
}))")
RAW=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/music-gen/channels" -H "Content-Type: application/json" -d "$S1_PAY")
S1_STATUS=$(echo "$RAW" | tail -n 1); S1_RES=$(echo "$RAW" | sed '$d')
assert_status "Step 1: create channel" "201" "$S1_STATUS"
CHANNEL_ID=$(echo "$S1_RES" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || true)
[[ -z "$CHANNEL_ID" ]] && { fail "Step 1: no id — $S1_RES"; exit 1; }
info "CHANNEL_ID=$CHANNEL_ID"; echo ""

# ── Step 2: Get channel ───────────────────────────────────────
info "Step 2 — GET /api/music-gen/channels/$CHANNEL_ID"
RAW=$(curl -s -w "\n%{http_code}" "$BASE/api/music-gen/channels/$CHANNEL_ID")
S2_STATUS=$(echo "$RAW" | tail -n 1); S2_RES=$(echo "$RAW" | sed '$d')
assert_status "Step 2: get channel" "200" "$S2_STATUS"
SP=$(echo "$S2_RES" | python3 -c "import sys,json; print(json.load(sys.stdin).get('system_prompt',''))" 2>/dev/null || true)
[[ -n "$SP" ]] && pass "Step 2: system_prompt present" || fail "Step 2: system_prompt missing"
LF=$(echo "$S2_RES" | python3 -c "import sys,json; print(json.load(sys.stdin).get('lyric_format',''))" 2>/dev/null || true)
[[ "$LF" == "jp2_en1" ]] && pass "Step 2: lyric_format=jp2_en1" || fail "Step 2: lyric_format='$LF'"; echo ""

# ── Step 3: Update channel ────────────────────────────────────
info "Step 3 — PUT /api/music-gen/channels/$CHANNEL_ID"
RAW=$(curl -s -w "\n%{http_code}" -X PUT "$BASE/api/music-gen/channels/$CHANNEL_ID" -H "Content-Type: application/json" -d '{"system_prompt":"업데이트된 Lucid White DNA"}')
S3_STATUS=$(echo "$RAW" | tail -n 1); S3_RES=$(echo "$RAW" | sed '$d')
assert_status "Step 3: update channel" "200" "$S3_STATUS"
UP=$(echo "$S3_RES" | python3 -c "import sys,json; print(json.load(sys.stdin).get('system_prompt',''))" 2>/dev/null || true)
[[ "$UP" == *"업데이트된"* ]] && pass "Step 3: system_prompt updated" || fail "Step 3: not updated — '$UP'"
curl -s -o /dev/null -X PUT "$BASE/api/music-gen/channels/$CHANNEL_ID" -H "Content-Type: application/json" -d '{"system_prompt":"Lucid White 브랜드 DNA — 복원"}'
info "Step 3: restored"; echo ""

# ── Step 4: Create session ────────────────────────────────────
info "Step 4 — POST /api/music-gen/sessions"
S4_PAY=$(python3 -c "
import json
print(json.dumps({
  'channel_id':int('$CHANNEL_ID'),'title':'Test Session 1',
  'constraints_json':json.dumps({'vocal':'female — fragile, breathy','mood':'melancholic clarity'})
}))")
RAW=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/music-gen/sessions" -H "Content-Type: application/json" -d "$S4_PAY")
S4_STATUS=$(echo "$RAW" | tail -n 1); S4_RES=$(echo "$RAW" | sed '$d')
assert_status "Step 4: create session" "201" "$S4_STATUS"
SESSION_ID=$(echo "$S4_RES" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || true)
[[ -z "$SESSION_ID" ]] && { fail "Step 4: no id — $S4_RES"; exit 1; }
info "SESSION_ID=$SESSION_ID"; echo ""

# ── Step 5: Chat first ────────────────────────────────────────
info "Step 5 — POST /sessions/$SESSION_ID/chat"
RAW=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/music-gen/sessions/$SESSION_ID/chat" -H "Content-Type: application/json" -d '{"input":"투명한 새벽 감성으로 한 곡 만들어줘"}')
S5_STATUS=$(echo "$RAW" | tail -n 1); S5_RES=$(echo "$RAW" | sed '$d')
assert_status "Step 5: chat first message" "200" "$S5_STATUS"
C5=$(echo "$S5_RES" | python3 -c "import sys,json; print(json.load(sys.stdin)['assistantMessage']['content'])" 2>/dev/null || true)
[[ -n "$C5" ]] && pass "Step 5: assistantMessage.content present (${#C5} chars)" || fail "Step 5: missing — $S5_RES"; echo ""

# ── Step 6: Get messages ──────────────────────────────────────
info "Step 6 — GET /sessions/$SESSION_ID/messages"
RAW=$(curl -s -w "\n%{http_code}" "$BASE/api/music-gen/sessions/$SESSION_ID/messages")
S6_STATUS=$(echo "$RAW" | tail -n 1); S6_RES=$(echo "$RAW" | sed '$d')
assert_status "Step 6: get messages" "200" "$S6_STATUS"
MC=$(echo "$S6_RES" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['messages']))" 2>/dev/null || echo "0")
[[ "$MC" -ge 2 ]] && pass "Step 6: $MC messages" || fail "Step 6: expected ≥2, got $MC"; echo ""

# ── Step 7: Upload MP3 ───────────────────────────────────────
info "Step 7 — POST /sessions/$SESSION_ID/upload"
if [[ ! -f "$MP3_FILE" ]]; then
  info "Step 7: MP3 not found — skipping"
else
  RAW=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/music-gen/sessions/$SESSION_ID/upload" -F "file=@$MP3_FILE;type=audio/mpeg")
  S7_STATUS=$(echo "$RAW" | tail -n 1); S7_RES=$(echo "$RAW" | sed '$d')
  assert_status "Step 7: upload MP3" "200" "$S7_STATUS"
  MA=$(echo "$S7_RES" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('mediaAnalysis',''))" 2>/dev/null || true)
  [[ -n "$MA" ]] && pass "Step 7: mediaAnalysis returned" || fail "Step 7: mediaAnalysis missing — $S7_RES"
fi; echo ""

# ── Step 8: Chat with reference ───────────────────────────────
info "Step 8 — POST /sessions/$SESSION_ID/chat (reference)"
RAW=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/music-gen/sessions/$SESSION_ID/chat" -H "Content-Type: application/json" -d '{"input":"업로드한 레퍼런스 트랙 분위기를 반영해서 가사 다듬어줘"}')
S8_STATUS=$(echo "$RAW" | tail -n 1); S8_RES=$(echo "$RAW" | sed '$d')
assert_status "Step 8: chat reference" "200" "$S8_STATUS"
C8=$(echo "$S8_RES" | python3 -c "import sys,json; print(json.load(sys.stdin)['assistantMessage']['content'])" 2>/dev/null || true)
[[ -n "$C8" ]] && pass "Step 8: assistantMessage.content present" || fail "Step 8: missing"; echo ""

# ── Step 9: Error cases ───────────────────────────────────────
info "Step 9 — Error cases"
S9A=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/music-gen/sessions/nonexistent/chat" -H "Content-Type: application/json" -d '{"input":"x"}')
assert_status "Step 9a: nonexistent session → 404" "404" "$S9A"
S9B=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/music-gen/channels" -H "Content-Type: application/json" -d '{"channel_name":"NoId"}')
assert_status "Step 9b: missing youtube_channel_id → 400" "400" "$S9B"
S9C=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/music-gen/channels" -H "Content-Type: application/json" -d '{"channel_name":"Dup","youtube_channel_id":"@lucid-white-test","system_prompt":"test"}')
assert_status "Step 9c: duplicate channel → 409" "409" "$S9C"
S9D=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/music-gen/sessions" -H "Content-Type: application/json" -d '{"channel_id":99999,"title":"Bad"}')
assert_status "Step 9d: invalid channel_id → 404" "404" "$S9D"
S9E_PAY=$(python3 -c "import json; print(json.dumps({'channel_id':int('$CHANNEL_ID'),'title':'T','constraints_json':{'vocal':'female'}}))")
S9E=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/music-gen/sessions" -H "Content-Type: application/json" -d "$S9E_PAY")
assert_status "Step 9e: constraints_json as object → 400" "400" "$S9E"
S9F=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/music-gen/channels" -H "Content-Type: application/json" -d '{"channel_name":"X","youtube_channel_id":"@test-bad-fmt-99","lyric_format":"invalid"}')
assert_status "Step 9f: invalid lyric_format → 400" "400" "$S9F"
S9G=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$BASE/api/music-gen/channels/99999" -H "Content-Type: application/json" -d '{"system_prompt":"x"}')
assert_status "Step 9g: PUT nonexistent → 404" "404" "$S9G"; echo ""

# ── Step 10: Generate ─────────────────────────────────────────
info "Step 10 — POST /api/music-gen/generate"
S10_PAY=$(python3 -c "import json; print(json.dumps({'channel_id':int('$CHANNEL_ID'),'emotion_input':'새벽, 투명함, 여백의 미'}))")
RAW=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/music-gen/generate" -H "Content-Type: application/json" -d "$S10_PAY")
S10_STATUS=$(echo "$RAW" | tail -n 1); S10_RES=$(echo "$RAW" | sed '$d')
assert_status "Step 10: generate" "201" "$S10_STATUS"
for F in title_en lyrics suno_style_prompt; do
  V=$(echo "$S10_RES" | python3 -c "import sys,json; print(json.load(sys.stdin)['content']['$F'])" 2>/dev/null || true)
  [[ -n "$V" ]] && pass "Step 10: content.$F present" || fail "Step 10: content.$F missing — $(echo "$S10_RES" | head -c 200)"
done; echo ""

# ── Step 10-D: Diversity test (3x generate → all title_en unique) ─────────────
info "Step 10-D — Diversity: 3x generate, title_en all different"
TITLES=()
for i in 1 2 3; do
  DIV_PAY=$(python3 -c "import json; print(json.dumps({'channel_id':int('$CHANNEL_ID'),'emotion_input':'다양성 테스트 $i — 유리 너머 새벽'}))")
  DIV_RES=$(curl -s -X POST "$BASE/api/music-gen/generate" -H "Content-Type: application/json" -d "$DIV_PAY")
  T=$(echo "$DIV_RES" | python3 -c "import sys,json; print(json.load(sys.stdin)['content']['title_en'])" 2>/dev/null || true)
  [[ -n "$T" ]] && TITLES+=("$T") || info "  Run $i: empty title_en — $DIV_RES"
done
UNIQ=$(printf '%s\n' "${TITLES[@]}" | sort -u | wc -l | tr -d ' ')
[[ "${#TITLES[@]}" -eq 3 ]] && pass "Step 10-D: 3 titles collected" || fail "Step 10-D: collected ${#TITLES[@]}/3 titles"
[[ "$UNIQ" -eq 3 ]] && pass "Step 10-D: all 3 title_en values unique (Set.size=3)" || fail "Step 10-D: only $UNIQ unique title(s) — [${TITLES[*]}]"
echo ""

# ── Step 11: List contents ────────────────────────────────────
info "Step 11 — GET /api/music-gen/contents?channel_id=$CHANNEL_ID"
RAW=$(curl -s -w "\n%{http_code}" "$BASE/api/music-gen/contents?channel_id=$CHANNEL_ID")
S11_STATUS=$(echo "$RAW" | tail -n 1); S11_RES=$(echo "$RAW" | sed '$d')
assert_status "Step 11: list contents" "200" "$S11_STATUS"
CC=$(echo "$S11_RES" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('contents',[])))" 2>/dev/null || echo "0")
[[ "$CC" -ge 1 ]] && pass "Step 11: $CC content(s) found" || fail "Step 11: expected ≥1, got $CC"; echo ""

# ── Step 12: Teardown ─────────────────────────────────────────
info "Step 12 — DELETE /api/music-gen/channels/$CHANNEL_ID"
S12=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/music-gen/channels/$CHANNEL_ID")
[[ "$S12" == "200" || "$S12" == "204" ]] && pass "Step 12: channel deleted ($S12)" || fail "Step 12: got $S12"

echo ""
echo "════════════════════════════════════════"
echo -e "Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}"
echo "════════════════════════════════════════"
[[ "$FAIL" -eq 0 ]]
