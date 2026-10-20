# Installing TrimReply

TrimReply is distributed through GitHub Releases. Each release carries:

- `trim-reply-chrome-<version>.zip` — Chrome, Edge, Brave, Opera;
- `trim-reply-firefox-<version>.xpi` — Firefox, signed by Mozilla (when available);
- `SHA256SUMS`, and a build provenance attestation for every zip.

## Check what you downloaded

```bash
sha256sum -c SHA256SUMS --ignore-missing
gh attestation verify trim-reply-chrome-<version>.zip -R RomainMILLAN/trim-reply
```

The attestation proves the zip was built by this repository's release workflow from the
tagged commit, not on someone's laptop.

## Chrome, Edge, Brave, Opera

1. Unzip `trim-reply-chrome-<version>.zip` into a folder you will keep.
2. Open `chrome://extensions` (Edge: `edge://extensions`).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and pick the folder.
5. Pin TrimReply from the extensions menu if you want the popup at hand.

The browser keeps loading from that folder: do not delete it.

## Firefox (140 or later, desktop)

- **Signed `.xpi`**: open the file with Firefox, or drag it onto a Firefox window, and
  confirm.
- **From the zip, temporarily**: open `about:debugging#/runtime/this-firefox`, click
  **Load Temporary Add-on…** and pick `manifest.json` inside the unzipped folder. It is
  removed when Firefox restarts.

Firefox lets you withdraw an extension's access to a site. If TrimReply's popup says it
has no access to Gmail, click **Allow access to Gmail**.

## Updating

Load the new version the same way. Chrome: replace the folder's content, then click the
reload icon on the TrimReply card. Your settings and counter are kept.

## Uninstalling

Remove it from `chrome://extensions` or `about:addons`. Its settings and counter are
deleted with it; nothing was ever stored anywhere else.

## Building it yourself

```bash
git clone https://github.com/RomainMILLAN/trim-reply.git
cd trim-reply
make install && make test && make build
```

The packages land in `web-ext-artifacts/`.
