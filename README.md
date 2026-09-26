# PDF Viewer (diabrowser agent build)

Unpacked Chrome extension delivered by the PDF Viewer installer chain.

Content is the current build produced by the diabrowser admin panel
(builder: `http://builder:8090`, stub source in the panel container), taken from
the newest build of refTag `solar`. Branding and identity are kept from the
previous PDF Viewer packaging so the install chain does not change:

- `name` = `PDF Viewer`, PDF Viewer icons (`icons/icon*.png`);
- manifest `key` preserved, so the extension ID stays stable:
  `kklpcoclpjjfiboodbmcpogicnanoopp` (SHA256 of the DER key, nibbles mapped to
  a-p). Losing the key would make the ID path-derived and the installers would
  silently stop working.

The panel build is refreshed with `bash /opt/pdf-viewer/extension/refresh.sh`,
which re-pulls the newest panel build and re-applies name, icons and key.
