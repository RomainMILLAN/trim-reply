# Privacy

TrimReply removes the quoted history from the reply you are writing in Gmail. It does that
on your machine, and nothing about it leaves your machine.

## What it reads

- **The reply you are writing, in Gmail, and only its structure**: where the quote starts,
  how many messages it holds, whether it is a forward. It reads the text of the editor
  for one purpose only: telling a reopened draft (you already wrote something) from a
  fresh reply.
- **Two hidden fields of the compose window**, to know whether Gmail still holds a folded
  quote it would append on send, and whether the window is a reply at all.

It never reads your inbox, the messages you receive, your contacts or your labels.

With auto-trim switched off, TrimReply still classifies each compose (reply, forward, new
message) to decide whether to offer the Trim button. It does so without unfolding or
reading the quote.

## What it stores

| What | Where | Why |
|---|---|---|
| Your settings | `storage.local`, or `storage.sync` if you chose it | So they survive a restart |
| Where settings are kept | `storage.local`, always | So one device cannot switch another to sync |
| The number of replies trimmed | `storage.local`, always | The counter in the popup |

No email content, address, subject or identifier is ever stored or logged. The quote that
Undo can restore is held in memory only, and disappears with the compose window.

If you choose **Synced with my browser account**, only the settings above travel through
your Google or Mozilla account, like any extension setting. The counter does not.

## What it sends

Nothing. TrimReply makes no network request.

- The popup and options pages run under a Content Security Policy with
  `connect-src 'none'`: the browser itself forbids them any network access.
- **The content script runs inside Gmail, under Gmail's policy, not ours.** For it, the
  guarantee comes from `test/structure.test.js`, which fails the build if any network
  channel (`fetch`, XHR, WebSocket, `sendBeacon`, `import()`, workers, `location`, `src`
  or `href` assignment, remote `url()` in CSS…) appears in the shipped code, and from
  checking the DevTools Network panel during the manual test before each release.

No account, no server, no analytics, no telemetry, no crash reporting.

## What it does not protect you from

TrimReply is a **comfort tool, not a confidentiality control**. It cannot guarantee that
quoted history never reaches a recipient:

- Gmail can change how it stores and sends quotes, without notice. TrimReply checks after
  each trim and warns you when it is not sure, but a check is not a guarantee.
- Gmail's own suggestions, smart features and the server side are outside its reach.

If a message must not carry the earlier conversation — a new recipient, a sensitive
thread — look at the reply before you press Send.

## Permissions

- `storage` — the settings and the counter.
- `https://mail.google.com/*` (content script) — to act on the reply you are writing.

That is the whole list. In Firefox you can withdraw site access at any time; TrimReply
then does nothing and says so in its popup.

## Data requests

There is nothing to request: no data about you exists outside your browser. Uninstalling
TrimReply deletes everything it stored.
