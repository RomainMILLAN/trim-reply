# Gmail spike (step 0)

Manual investigation run **before any code is written**. Its answers decide whether
TrimReply can work at all, and fill in the values the adapter needs.

Use a **test Gmail account** and **synthetic emails only**: no real correspondence,
no real addresses. Run every check with the Gmail UI in **English** and in **French**,
in **Chrome** and in **Firefox**.

## Setup

1. Create a thread of 5 messages between the test account and a second test address
   (another Gmail account, plus one non-Gmail client such as Thunderbird to check threading).
2. Create a second thread of 1 message, and a forwarded message.
3. Open DevTools on `mail.google.com` (Elements + Console).

## Questions

Record each answer under its heading, with the date and the browser.

### a) Is the collapsed quote sent?

Reply without clicking the `•••` button. Send. On the recipient side, open
**Show original**. Is the quoted history in the body?

### b) Does an expanded-and-removed quote stay removed?

Click `•••`, delete the quote nodes from the DevTools console, then dispatch
`new InputEvent('input', { bubbles: true })` on the editor. Wait for the draft autosave.

- Reopen the draft: is the quote still gone?
- Send it: is the quote absent from **Show original**?
- Repeat after restoring the nodes (Undo): does the quote come back after the save and on send?

### c) Is threading preserved?

On the recipient side, are `In-Reply-To` and `References` present? Is the thread intact
in Gmail **and** in the non-Gmail client?

### d) Structural signals (no text)

- What distinguishes a **reopened draft** from a fresh reply?
- What distinguishes a **new message** from a reply, **before** the `•••` is rendered?
- How long after the editor appears is the `•••` rendered? (Measure: this sets the bounded wait.)

If no new-message signal is reliable, write "none": the adapter will then never return
`none()` without unfolding.

### e) Marker for `verify`

Which marker tells that Gmail will **not** append anything on send (for example
`input[name=uet]` being empty)? Is it updated **synchronously** with the DOM change,
or only after the autosave? (Asynchronous means `reverify` is needed.)

### f) Forward structure

What does a forward look like in the DOM (quote without `blockquote`?), in EN and FR?

### g) Frames and compose container

- Are the popout and the inline reply inside an iframe (`all_frames`)?
- What is the **container** of one compose: the common ancestor of the editor and its `•••`?

### h) Styles in the shadow root

Does Gmail's CSP accept `adoptedStyleSheets` in a `closed` shadow root, in Chrome and in Firefox?

### i) Host permission

How does `permissions.request` behave for a host declared only in `content_scripts`,
in Chrome and in Firefox?

### j) Fold without unfolding (low priority, a few minutes at most)

Can the quoted messages be counted without unfolding? Can an unfolded `•••` be folded
back? If the answer is not obvious quickly, write "no" and move on.

## Barrier

If **a)**, **b)** or **e)** show that Gmail re-injects the quote whatever we do, or that no
`verify` check is possible: **stop** and decide again before writing code.

## Fixtures

Capture the editor and its compose container (DevTools → *Copy outerHTML*) for:

- replies quoting 1, 2 and 5 messages;
- a forward;
- a reopened draft;
- a popout reply;
- a new message;
- a hostile quote (nested `gmail_quote` classes, a fake `uet` marker or a fake `•••` inside
  the quoted body, a fake new-message signal).

Every capture goes through `scripts/sanitize-fixture.mjs` before it is committed to
`test/fixtures/gmail/`. That script keeps only the attributes `selectors.js` uses, drops
hidden inputs, `jslog`, unused `data-*` and `aria-*`, and replaces text with lorem and
addresses with `user@example.invalid`.

## Results

Run on 2026-10-20 in Chromium (Playwright), Gmail UI in French, on a test thread.
Only the DOM structure and lengths were inspected, never message content.

### Barrier: passed

**a)** and **b)** prove that trimming works, and **e)** gives a usable marker for `verify`.

### a) The collapsed quote IS sent — confirmed

A reply sent without unfolding `•••` arrived with the quote (`.gmail_quote` and
`blockquote` present in the stored message). While collapsed, the quote is **not in the
editor**: it lives as an HTML string in the hidden input `input[name=uet]` of the compose
(2,712 characters for a 6-message thread), which Gmail appends on send.

### b) An expanded-and-removed quote stays removed — confirmed

Unfolding, removing the quote container, then dispatching `InputEvent('input')`: the
message was sent **without** any quote, after autosave. Restoring the same nodes at the
anchor (Undo), even after typing above it, brings the quote back in the editor and keeps
the typed text; `uet` stays empty.

### c) Threading — partly checked

The trimmed reply stayed in the same thread on the sender side. **Still to check by hand:**
`In-Reply-To` / `References` on the recipient side, and the thread in a non-Gmail client.

### d) Structural signals

- **New message**: `input[name=rm]` and `input[name=lts]` are **empty** in a new message
  and **filled** in a reply or a forward. This is the positive new-message signal
  (`rm` empty). It sits in the compose container, outside the editor.
- **`•••` timing**: the `•••`, `rm` and the editor appear in the **same mutation batch**
  (< 1 ms apart). The bounded wait in `unfold` can stay short (≈ 500 ms is ample).
- **Reopened draft**: hidden inputs look the same as for a fresh reply (`draft` is set in
  both cases). The signal is the editor content: a fresh reply contains only the signature
  (`[data-smartmail="gmail_signature"]`) and empty lines; a reopened draft contains
  **non-blank text outside the quote and outside the signature**.

### e) `verify` marker

`input[name=uet]` holds the collapsed quote. It becomes **empty synchronously** when the
`•••` is clicked (same tick) and stays empty after the trim and the autosave.
`verify` = "no visible `•••` in the compose container **and** `uet` empty".
The marker is synchronous: **`reverify` / `onSettled` is not needed** (no-op).

### f) Forward structure

A forward opens **already expanded**: no visible `•••`, `uet` empty, quote in the editor.
Its outer `div.gmail_quote.gmail_quote_container` has children
`[div.gmail_attr, br, br, div, br, div.gmail_quote]` — **no direct `blockquote.gmail_quote`
child**. A reply's outer container has exactly `[div.gmail_attr, blockquote.gmail_quote]`.
Structural rule: *outer container without a direct `blockquote.gmail_quote` child ⇒ forward*.

### g) Frames and compose container

- Inline reply: editor inside `.M9`, inside `.AO` and `.gA.gt`; **no iframe**.
- Floating new message: editor inside `.M9`, inside `.AD`; **no iframe**.
- **Compose container = the `.M9` ancestor** of the editor. The `•••` (`div.ajR`, child of
  `div.et`) and the hidden inputs (`rm`, `uet`, …) are inside `.M9`, outside the editor.
- ⚠️ A `div.ajR` exists **even in a new message**, hidden (`display:none`). Always test the
  `•••` for **visibility**, never mere presence.
- Popout window: not tested (same origin, the content script applies; `all_frames` not needed so far).

### h) Styles in the shadow root

`adoptedStyleSheets` in a `closed` shadow root works in Chrome. **Firefox: still to check**
during the manual test (step 10).

Side note: Gmail enforces **Trusted Types** in the page (`DOMParser.parseFromString`
throws). TrimReply never parses HTML, so this does not affect it.

### i) `permissions.request`

**Not tested yet** (needs the built extension). To check at step 6 in both browsers.

### j) Fold without unfolding — no

Counting without unfolding would mean parsing the `uet` HTML string, which the plan forbids.
Folding back is not offered by Gmail once expanded. ⇒ `inspectFolded` returns `unknown()`
for replies (and `none()` only on the `rm`-empty signal); `refold()` is a no-op.

### Quote structure (reply)

- Outer: `div.gmail_quote.gmail_quote_container` > `div.gmail_attr` + `blockquote.gmail_quote`.
- **Quoted messages = number of `.gmail_attr`** in the container (6 for a 6-message thread,
  with 6 nested `blockquote.gmail_quote`).
- Editor children before the quote: `div` (user text / signature), `br`, then the container.
- Selectors used by Gmail's own buttons: Reply `span.ams.bkH`, Reply all `span.ams.bkI`,
  Forward `span.ams.bkG`, Send `div.aoO[role=button]`, Discard draft `div.oh[role=button]`.

### Raw captures

Raw captures (reply collapsed, reply unfolded with 6 messages, forward) are kept **outside
git** in `.playwright-mcp/raw-fixtures/`. They still contain real `uet` content and
addresses and must go through `scripts/sanitize-fixture.mjs` before reaching
`test/fixtures/gmail/`.
