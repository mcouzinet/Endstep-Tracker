#!/bin/bash
# Users and ratings of Endstep Tracker on the four stores, one line each.
#   ./stats.sh
# Chrome, Firefox and Edge come from public pages and endpoints, no key needed (Chrome has no API: the figures are
# read from the listing page, so a redesign of the store can break that line). Safari's ratings come from Apple's
# public lookup, per storefront; its downloads come from App Store Connect's daily sales reports, which need the
# publish.sh key (asc-key-id, asc-issuer-id and the .p8 file) plus the vendor number (App Store Connect > Payments
# and Financial Reports, top left), all in the Keychain:
#   security add-generic-password -s endstep-publish -a asc-vendor-number -w
# and a key whose role can read sales reports (Admin, Finance or Sales). Nothing here prints a key.
set -u
cd "$(dirname "$0")"

KEYCHAIN=endstep-publish
CHROME_ID=ioeffckengdfapnapdbphkbnnnnaajho
EDGE_ID=oloikebkijkmhlodohfbjbekkmghblbp
AMO_SLUG=endstep-tracker
APPLE_ID=6816954721
APPLE_STOREFRONTS="fr us"
DAYS=30
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

secret() { security find-generic-password -s "$KEYCHAIN" -a "$1" -w 2>/dev/null; }
stars() { # stars <average> <count>
  [ "${2:-0}" -gt 0 ] 2>/dev/null || { echo "no rating yet"; return; }
  printf '%.1f/5 (%s rating%s)' "$1" "$2" "$([ "$2" = 1 ] || echo s)"
}

chrome() {
  local page users rating
  page=$(curl -sSL -A 'Mozilla/5.0' "https://chromewebstore.google.com/detail/$CHROME_ID?hl=en") || return 1
  users=$(perl -ne 'if (/([\d,]+) users?</) { print $1 =~ s/,//gr; exit }' <<<"$page")
  # The item's own rating sits just before the link to its reviews (the page also rates related extensions).
  rating=$(perl -0ne 'print "$1 " . ($2 =~ s/,//gr) if m{aria-label="Average rating ([\d.]+) out of 5 stars\.".{0,3000}?'"$CHROME_ID"'/reviews"[^>]*><p[^>]*>([\d,]+) ratings?<}s' <<<"$page")
  [ -n "$users" ] || return 1
  echo "$users users, $(stars $rating)"
}

firefox() {
  local adu week avg n
  read -r adu week avg n < <(curl -sS "https://addons.mozilla.org/api/v5/addons/addon/$AMO_SLUG/" |
    jq -r '"\(.average_daily_users) \(.weekly_downloads) \(.ratings.average // 0) \(.ratings.count // 0)"' 2>/dev/null)
  [ -n "${adu:-}" ] && [ "$adu" != null ] || return 1
  echo "$adu daily users, $week downloads this week, $(stars "$avg" "$n")"
}

edge() {
  local users avg n
  read -r users avg n < <(curl -sS "https://microsoftedge.microsoft.com/addons/getproductdetailsbycrxid/$EDGE_ID" |
    jq -r '"\(.activeInstallCount) \(.averageRating // 0) \(.ratingCount // 0)"' 2>/dev/null)
  [ -n "${users:-}" ] && [ "$users" != null ] || return 1
  echo "$users users, $(stars "$avg" "$n")"
}

safari() {
  local c avg n ratings=""
  for c in $APPLE_STOREFRONTS; do
    read -r avg n < <(curl -sS "https://itunes.apple.com/lookup?id=$APPLE_ID&country=$c" |
      jq -r '.results[0] | "\(.averageUserRating // 0) \(.userRatingCount // 0)"' 2>/dev/null)
    ratings+="${ratings:+, }$c $(stars "${avg:-0}" "${n:-0}")"
  done
  local kid iss vendor p8
  kid=$(secret asc-key-id); iss=$(secret asc-issuer-id); vendor=$(secret asc-vendor-number)
  p8="$HOME/.appstoreconnect/private_keys/AuthKey_$kid.p8"
  if [ -z "$kid" ] || [ -z "$iss" ] || [ -z "$vendor" ] || [ ! -f "$p8" ]; then
    echo "$ratings; downloads need the App Store Connect key and vendor number (top of stats.sh)"; return
  fi
  # App Store Connect API token: an ES256 JWT, valid 15 minutes, signed with the .p8 key.
  local token; token=$(KID=$kid ISS=$iss P8=$p8 node -e '
    const c = require("crypto"), b = o => Buffer.from(JSON.stringify(o)).toString("base64url"), t = Math.floor(Date.now() / 1000);
    const m = b({ alg: "ES256", kid: process.env.KID, typ: "JWT" }) + "." + b({ iss: process.env.ISS, iat: t, exp: t + 900, aud: "appstoreconnect-v1" });
    console.log(m + "." + c.sign("sha256", Buffer.from(m), { key: require("fs").readFileSync(process.env.P8), dsaEncoding: "ieee-p1363" }).toString("base64url"));') || return 1
  local i day code; : > "$TMP/sales.tsv"
  for i in $(seq 1 $DAYS); do
    day=$(date -v-"$i"d +%F)
    code=$(printf 'header = "Authorization: Bearer %s"\nurl = "https://api.appstoreconnect.apple.com/v1/salesReports?filter[frequency]=DAILY&filter[reportType]=SALES&filter[reportSubType]=SUMMARY&filter[vendorNumber]=%s&filter[reportDate]=%s"\n' "$token" "$vendor" "$day" |
      curl -sS -g -K - -o "$TMP/day" -w '%{http_code}')
    case $code in
      200) gunzip -c "$TMP/day" >> "$TMP/sales.tsv" ;;
      404) ;; # no sales that day, or the report is not out yet
      *) echo "$ratings; downloads: App Store Connect answered $code ($(jq -r '.errors[0].detail // empty' "$TMP/day" 2>/dev/null))"; return ;;
    esac
  done
  # First downloads only: product types 1, 1F, 1T (iPhone, iPad) and F1 (Mac); updates and re-downloads are left out.
  local mac ios
  read -r mac ios < <(awk -F'\t' -v app="$APPLE_ID" '
    $1 == "Provider" { for (i = 1; i <= NF; i++) col[$i] = i; next }
    $col["Apple Identifier"] == app && $col["Product Type Identifier"] ~ /^(1|1F|1T|F1)$/ {
      if ($col["Device"] == "Desktop") mac += $col["Units"]; else ios += $col["Units"] }
    END { print mac + 0, ios + 0 }' "$TMP/sales.tsv")
  echo "$((mac + ios)) downloads in $DAYS days (Mac $mac, iPhone $ios), $ratings"
}

row() { local out; out=$("$1") && [ -n "$out" ] || out="unavailable (network error, or the page changed)"; printf '%-8s %s\n' "$2" "$out"; }
row chrome Chrome
row firefox Firefox
row edge Edge
row safari Safari
