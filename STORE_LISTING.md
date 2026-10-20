# Store listing

Content for the Chrome Web Store and addons.mozilla.org. `test/structure.test.js`
checks that the permission justifications below match the manifest.

## Metadata

- **Name**: TrimReply
- **Summary** (≤ 132 characters): Strip the quoted history from your Gmail replies before you send them. Local only, no network.
- **Category**: Productivity (Chrome) · Productivity / Social & Communication (Firefox)
- **Languages**: English, French
- **Homepage**: https://github.com/RomainMILLAN/trim-reply
- **Support**: https://github.com/RomainMILLAN/trim-reply/issues
- **Licence**: MIT

## Description

Stop sending the whole conversation.

Every time you reply in Gmail, the entire email history is quoted again underneath. In a
long thread, a one-line answer can carry dozens of earlier emails, and your recipient has
to scroll past all of them.

TrimReply removes the quoted history as soon as you open a reply, before you press Send.
Only what you wrote is sent. The thread stays intact for everyone: Gmail links messages
through their headers, not the quoted text.

HOW IT WORKS
• Open any reply: Reply button, keyboard shortcuts, or pop-out window
• TrimReply removes the earlier quoted history automatically
• A small bar shows what was removed, with Undo
• Prefer to choose each time? Turn auto-trim off and use the Trim button

SMART ABOUT WHAT IT CUTS
• Keep nothing (recommended), or keep only the message you are replying to
• Leaves short threads alone (adjustable)
• Never touches forwards, new messages or reopened drafts
• Warns you when it is not sure the quote is gone

PRIVATE BY DESIGN
• Runs entirely in your browser
• No account, no server, no analytics — no network request at all
• Reads only the reply you are writing, never your inbox
• Open source (MIT): read the code

TrimReply is a comfort tool, not a confidentiality control: Gmail can change without
notice. Check sensitive messages before sending.

Gmail is a trademark of Google LLC. TrimReply is not affiliated with or endorsed by Google.

## Permission justifications

| Permission | Justification |
|---|---|
| `storage` | Saves the user's settings (auto-trim, what to remove, threshold, bar display, storage area) and a local counter of trimmed replies. No email content is stored. |
| `https://mail.google.com/*` (content script) | Modifies the reply being written in Gmail, locally, to remove the quoted history before sending. Nothing is read outside the compose window and nothing is transmitted. |

## Data disclosure (Chrome "Privacy practices" / Firefox data collection)

- **Single purpose**: remove the quoted history from Gmail replies.
- **Data handled**: the content of the reply being composed (personal communications) is
  modified **locally** in the page. It is never collected, stored, logged or transmitted.
- **Data collected**: none. Firefox `data_collection_permissions`: `none`.
- **Remote code**: none. All code ships in the package.
- **Sold or transferred to third parties**: no.

## Graphics to produce

- Icon 128×128: `src/icons/icon-128.png`
- Screenshots 1280×800: from `docs/design/render.sh` (mock compose, options page)
- Small promo tile 440×280: to be made from `docs/design/`

## Submission checklist

- [ ] `make test`, `make lint`, `make build` green; CI green on the tag
- [ ] Manual test done (`docs/manual-test.md`), including "Show original"
- [ ] Version bumped in `package.json` and `src/manifest.json`
- [ ] Privacy policy URL points to PRIVACY.md
- [ ] Screenshots regenerated if the UI changed
