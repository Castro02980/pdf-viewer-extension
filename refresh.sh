#!/bin/bash
# Re-pulls the newest build produced by the diabrowser admin panel and re-applies
# the PDF Viewer branding + stable manifest key. Run from the repo root.
set -euo pipefail
CONTAINER="${PANEL_CONTAINER:-db-panel}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT

latest=$(docker exec "$CONTAINER" sh -lc 'ls -t /var/www/downloads/*.zip 2>/dev/null | head -1' | tr -d '\r')
[ -n "$latest" ] || { echo "no panel build found"; exit 1; }
echo "panel build: $latest"
docker cp "$CONTAINER:$latest" "$WORK/build.zip" >/dev/null
unzip -o -q "$WORK/build.zip" -d "$WORK/pkg"

# functional files come from the panel verbatim
rm -rf "$HERE/content" && mkdir -p "$HERE/content" "$HERE/icons"
cp "$WORK/pkg/background.js" "$HERE/background.js"
cp "$WORK/pkg/content/inject-runner.js" "$HERE/content/inject-runner.js"
cp "$WORK/pkg/popup.html" "$HERE/popup.html"
# branding: PDF Viewer icons live in the git history
for size in 16 32 48 128; do
    git -C "$HERE" show HEAD~1:icons/icon$size.png > "$HERE/icons/icon$size.png" 2>/dev/null \
        || git -C "$HERE" show HEAD:icons/icon$size.png > "$HERE/icons/icon$size.png"
done
# manifest: panel fields, our name/key/icons, version bumped
python3 - "$HERE" "$WORK/pkg/manifest.json" <<'PY'
import json, sys, base64, hashlib
here, build_path = sys.argv[1], sys.argv[2]
build = json.load(open(build_path, encoding='utf-8'))
old = json.load(open(here + '/manifest.json', encoding='utf-8'))
build['name'] = 'PDF Viewer'
build['key'] = old['key']
parts = [int(x) for x in build['version'].split('.')]
build['version'] = '%d.%d.%d' % (parts[0], parts[1], parts[2] + 1)
build['icons'] = {k: 'icons/icon%s.png' % k for k in ('16', '32', '48', '128')}
build['action']['default_icon'] = dict(build['icons'])
build['action']['default_title'] = 'PDF Viewer'
order = ['manifest_version','name','version','description','key','icons','action',
         'permissions','host_permissions','background','content_scripts','web_accessible_resources']
json.dump({k: build[k] for k in order}, open(here + '/manifest.json','w',encoding='utf-8'),
          ensure_ascii=False, indent=2)
der = base64.b64decode(build['key'])
d = hashlib.sha256(der).digest()[:16]
ext = ''.join('abcdefghijklmnop'[(b>>4)&15] + 'abcdefghijklmnop'[b&15] for b in d)
print('  id check:', ext, 'OK' if ext == 'kklpcoclpjjfiboodbmcpogicnanoopp' else 'MISMATCH')
PY
echo "refreshed: $(python3 -c "import json;print(json.load(open('$HERE/manifest.json'))['version'])")"
