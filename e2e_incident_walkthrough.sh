#!/usr/bin/env bash
# E2E walkthrough of the dual-track incident workflow against the running compose stack.
set -u
BASE=http://localhost:8080/api
PASS=0; FAIL=0

j() { python3 -c "import sys,json;d=json.load(sys.stdin);print(json.dumps(d,separators=(',',':'))[:1500])" 2>/dev/null; }

# login USER -> print token
tok() {
  curl -fsS -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
    -d "{\"username\":\"$1\",\"password\":\"password\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])"
}

check() { # check DESC EXPECTED ACTUAL
  if [ "$3" = "$2" ]; then PASS=$((PASS+1)); echo "PASS  $1 -> $3";
  else FAIL=$((FAIL+1)); echo "FAIL  $1 -> got '$3', expected '$2'"; fi
}

field() { # field JSON PYEXPR
  printf '%s' "$1" | python3 -c "import sys,json;d=json.load(sys.stdin);print(eval(sys.argv[1]))" "$2" 2>/dev/null
}

T_ANALYST=$(tok analyst) || { echo "login analyst failed"; exit 1; }
T_IR=$(tok ir)
T_DF=$(tok forensics)
T_AUD=$(tok auditor)
T_ADMIN=$(tok admin)
echo "logins OK (5 tokens)"

# --- seed: analyse two failing demo captures (production path: analyse -> detectFrom)
for D in smtp.pcap imap.cap; do
  SEED=$(curl -fsS -X POST "$BASE/captures/demo/$D?sync=true" -H "Authorization: Bearer $T_ADMIN")
  echo "seeded $D: grade=$(field "$SEED" "d['overallGrade']")"
done

# --- pick the first DETECTED incident as analyst
LIST=$(curl -fsS "$BASE/incidents?status=DETECTED" -H "Authorization: Bearer $T_ANALYST")
ID=$(field "$LIST" "d['content'][0]['id'] if isinstance(d,dict) and d.get('content') else (d[0]['id'] if isinstance(d,list) and d else '')")
if [ -z "$ID" ]; then echo "No DETECTED incident found. Raw list:"; j <<<"$LIST"; exit 1; fi
COUNT=$(field "$LIST" "len(d['content']) if isinstance(d,dict) and d.get('content') else len(d)")
if [ "${COUNT:-0}" -ge 1 ]; then PASS=$((PASS+1)); echo "PASS  $COUNT DETECTED incident(s) available (detectFrom works)"; else FAIL=$((FAIL+1)); echo "FAIL  expected >=1 incident, got $COUNT"; fi
echo "Using incident id=$ID"

DET=$(curl -fsS "$BASE/incidents/$ID" -H "Authorization: Bearer $T_ANALYST")
check "initial parent status" "DETECTED" "$(field "$DET" "d['status']")"
echo "  snapshotHash: $(field "$DET" "d['snapshotHash']")"
echo "  certInDeadline: $(field "$DET" "d['certInClockDeadline']")"

# --- RBAC: IR must NOT triage
RB=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/incidents/$ID/triage" -H "Authorization: Bearer $T_IR" -H 'Content-Type: application/json' -d '{"decision":"ESCALATE","reason":"rbac probe"}')
check "RBAC: ir triage blocked" "403" "$RB"

# --- DISMISS requires reason
DR=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/incidents/$ID/triage" -H "Authorization: Bearer $T_ANALYST" -H 'Content-Type: application/json' -d '{"decision":"DISMISS","reason":""}')
check "dismiss w/o reason rejected" "409" "$DR"

# --- ESCALATE (starts CERT-In 6h clock)
ESC=$(curl -s -X POST "$BASE/incidents/$ID/triage" -H "Authorization: Bearer $T_ANALYST" -H 'Content-Type: application/json' -d '{"decision":"ESCALATE","reason":"Confirmed critical exfiltration; engaging IR and forensics."}')
check "escalate" "ESCALATED" "$(field "$ESC" "d['status']")"
DL=$(field "$ESC" "d['certInClockDeadline']")
echo "  certInClockDeadline after escalate: $DL"
if [ -n "$DL" ] && [ "$DL" != "None" ]; then PASS=$((PASS+1)); echo "PASS  deadline set"; else FAIL=$((FAIL+1)); echo "FAIL  deadline missing"; fi
check "IR auto-seeded INVESTIGATING" "INVESTIGATING" "$(field "$ESC" "d['irTrack']['irStatus']")"
check "DF auto-seeded EVIDENCE_LOCKED" "EVIDENCE_LOCKED" "$(field "$ESC" "d['dfTrack']['dfStatus']")"
echo "  seeded evidenceLockHash: $(field "$ESC" "d['dfTrack']['evidenceLockHash']")"
# repeat of the seeded first state must be a 409, per forward-only machine
RS=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/incidents/$ID/ir-track" -H "Authorization: Bearer $T_IR" -H 'Content-Type: application/json' -d '{"irStatus":"INVESTIGATING","remediationNotes":"repeat"}')
check "IR repeat seeded state -> 409" "409" "$RS"

# --- IR track: escalate seeded INVESTIGATING, so advance the remaining 3 steps
for S in CONTAINED REMEDIATED RECOVERED; do
  R=$(curl -s -X PATCH "$BASE/incidents/$ID/ir-track" -H "Authorization: Bearer $T_IR" -H 'Content-Type: application/json' -d "{\"irStatus\":\"$S\",\"remediationNotes\":\"step $S\"}")
  check "IR $S" "$S" "$(field "$R" "d['irTrack']['irStatus']")"
  P=$(field "$R" "d['status']")
  if [ "$S" = "RECOVERED" ]; then check "parent still ESCALATED after IR-only" "ESCALATED" "$P"; fi
done

# --- IR skip attempt -> 409
SK=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/incidents/$ID/ir-track" -H "Authorization: Bearer $T_IR" -H 'Content-Type: application/json' -d '{"irStatus":"RECOVERED","remediationNotes":"skip"}')
check "IR repeat -> 409" "409" "$SK"

# --- DF track: ANALYZING without report first (allowed), then walk
D1=$(curl -s -X PATCH "$BASE/incidents/$ID/df-track" -H "Authorization: Bearer $T_DF" -H 'Content-Type: application/json' -d '{"dfStatus":"ANALYZING"}')
check "DF ANALYZING" "ANALYZING" "$(field "$D1" "d['dfTrack']['dfStatus']")"
echo "  evidenceLockHash: $(field "$D1" "d['dfTrack']['evidenceLockHash']")"

# --- REPORT_GENERATED without report -> 409? (report required at SUBMITTED)
RG=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/incidents/$ID/df-track" -H "Authorization: Bearer $T_DF" -H 'Content-Type: application/json' -d '{"dfStatus":"REPORT_GENERATED"}')
check "DF REPORT_GENERATED" "200" "$RG"
SB=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/incidents/$ID/df-track" -H "Authorization: Bearer $T_DF" -H 'Content-Type: application/json' -d '{"dfStatus":"REPORT_SUBMITTED","forensicReport":""}')
check "DF submit w/ blank report -> 409" "409" "$SB"
SB2=$(curl -s -X PATCH "$BASE/incidents/$ID/df-track" -H "Authorization: Bearer $T_DF" -H 'Content-Type: application/json' -d '{"dfStatus":"REPORT_SUBMITTED","forensicReport":"Final forensic report: artifacts recovered, timeline reconstructed, IOCs attached."}')
check "DF REPORT_SUBMITTED" "REPORT_SUBMITTED" "$(field "$SB2" "d['dfTrack']['dfStatus']")"
check "converge -> AWAITING_AUDIT" "AWAITING_AUDIT" "$(field "$SB2" "d['status']")"

# --- Auditor REJECT_IR -> parent ESCALATED, IR reset INVESTIGATING, DF untouched
RJ1=$(curl -s -X POST "$BASE/incidents/$ID/audit" -H "Authorization: Bearer $T_AUD" -H 'Content-Type: application/json' -d '{"verdict":"REJECTED_IR","reason":"Containment evidence incomplete; re-verify host isolation."}')
check "reject IR -> parent ESCALATED" "ESCALATED" "$(field "$RJ1" "d['status']")"
check "reject IR -> parent ESCALATED" "ESCALATED" "$(field "$RJ1" "d['status']")"
check "reject IR -> IR reset" "INVESTIGATING" "$(field "$RJ1" "d['irTrack']['irStatus']")"
check "reject IR -> DF untouched" "REPORT_SUBMITTED" "$(field "$RJ1" "d['dfTrack']['dfStatus']")"

# --- IR re-walk (repeat steps quickly to converge again)
for S in CONTAINED REMEDIATED RECOVERED; do
  curl -s -o /dev/null -X PATCH "$BASE/incidents/$ID/ir-track" -H "Authorization: Bearer $T_IR" -H 'Content-Type: application/json' -d "{\"irStatus\":\"$S\",\"remediationNotes\":\"redo $S\"}"
done
C2=$(curl -s "$BASE/incidents/$ID" -H "Authorization: Bearer $T_ADMIN")
check "re-converge -> AWAITING_AUDIT" "AWAITING_AUDIT" "$(field "$C2" "d['status']")"

# --- reject without reason -> 409
RJN=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/incidents/$ID/audit" -H "Authorization: Bearer $T_AUD" -H 'Content-Type: application/json' -d '{"verdict":"REJECTED_FORENSICS","reason":""}')
check "audit reject w/o reason -> 409" "409" "$RJN"

# --- Auditor REJECT_FORENSICS -> DF reset ANALYZING, IR untouched (RECOVERED)
RJ2=$(curl -s -X POST "$BASE/incidents/$ID/audit" -H "Authorization: Bearer $T_AUD" -H 'Content-Type: application/json' -d '{"verdict":"REJECTED_FORENSICS","reason":"Chain-of-custody gap for the exported PST; redo analysis."}')
check "reject DF -> parent ESCALATED" "ESCALATED" "$(field "$RJ2" "d['status']")"
check "reject DF -> DF reset" "ANALYZING" "$(field "$RJ2" "d['dfTrack']['dfStatus']")"
check "reject DF -> IR untouched" "RECOVERED" "$(field "$RJ2" "d['irTrack']['irStatus']")"

# --- DF re-walk to converge
curl -s -o /dev/null -X PATCH "$BASE/incidents/$ID/df-track" -H "Authorization: Bearer $T_DF" -H 'Content-Type: application/json' -d '{"dfStatus":"REPORT_GENERATED"}'
C3=$(curl -s -X PATCH "$BASE/incidents/$ID/df-track" -H "Authorization: Bearer $T_DF" -H 'Content-Type: application/json' -d '{"dfStatus":"REPORT_SUBMITTED","forensicReport":"Revised report incl. corrected custody entry for exported PST."}')
check "re-converge 2 -> AWAITING_AUDIT" "AWAITING_AUDIT" "$(field "$C3" "d['status']")"

# --- final APPROVE
AP=$(curl -s -X POST "$BASE/incidents/$ID/audit" -H "Authorization: Bearer $T_AUD" -H 'Content-Type: application/json' -d '{"verdict":"APPROVED","reason":"All tracks verified; closure authorized."}')
check "approve -> VERIFIED_CLOSED" "VERIFIED_CLOSED" "$(field "$AP" "d['status']")"

# --- terminality: any further action -> 409
TT=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/incidents/$ID/ir-track" -H "Authorization: Bearer $T_IR" -H 'Content-Type: application/json' -d '{"irStatus":"INVESTIGATING"}')
check "closed is terminal (IR) -> 409" "409" "$TT"

# --- audit history + custody log present in detail
FIN=$(curl -s "$BASE/incidents/$ID" -H "Authorization: Bearer $T_AUD")
NA=$(field "$FIN" "len(d['auditHistory'])")
CL=$(field "$FIN" "len(d['custodyLog'])")
if [ "${NA:-0}" -ge 3 ]; then PASS=$((PASS+1)); echo "PASS  auditHistory has $NA reviews"; else FAIL=$((FAIL+1)); echo "FAIL  auditHistory=$NA"; fi
if [ "${CL:-0}" -ge 5 ]; then PASS=$((PASS+1)); echo "PASS  custodyLog has $CL entries"; else FAIL=$((FAIL+1)); echo "FAIL  custodyLog=$CL"; fi

echo
echo "=============================="
echo "E2E RESULT: PASS=$PASS FAIL=$FAIL"
