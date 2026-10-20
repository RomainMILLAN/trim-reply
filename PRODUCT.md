# Product

## Purpose

A Gmail reply quotes the whole thread again. TrimReply removes that history from the
reply before it is sent, so that what you send is what you wrote.

## Users

People who answer long threads in Gmail Web every day — support, project work,
recruiting — and who are tired of one-line answers dragging sixty emails along, and of
recipients scrolling past them.

## Positioning

| | TrimReply | ThreadTrim | UnQuote for Gmail |
|---|---|---|---|
| Licence | MIT, open source | Proprietary | None published |
| Price | Free, no quota | 100 trims a month free | Free |
| Network | None, test-enforced | A request to its publisher's server | None |
| Browsers | Chrome family, Firefox | Chrome | Chrome, Firefox |
| Undo | Yes | Yes | No |
| Keep the replied message | Yes | Yes | No |
| UI languages for detection | Any (structural) | — | English only |

## Principles

1. **The main job is to remove all of the history.** Every other feature is secondary.
2. **Fail closed.** When unsure, do nothing — and say so when it matters.
3. **Nothing leaves the browser.** Not as a promise: as a test.
4. **One place knows Gmail.** When Gmail changes, one file changes.
5. **Never surprising.** Forwards, new messages and reopened drafts are left alone; Undo
   is always one click away.

## Scope of v1

In: Gmail Web on desktop, Chrome family and Firefox ≥ 140, English and French.
Out: Outlook Web (phase 2), other clients' quote formats, Firefox Android, Gmail's mobile
and basic HTML views, keyboard shortcuts, any paid tier.

## Accessibility

Buttons are real `<button>` elements with visible focus, the bar announces its message in
a polite live region, colour is never the only signal (the uncertain state says so in
words), and the pages follow the system light / dark preference and reduced motion.
