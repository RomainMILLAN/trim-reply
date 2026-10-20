# Manual test

Run before **every release**, and whenever Gmail looks different. The automated suite
runs on fixtures; only this checklist proves the extension against the real Gmail.

Use a **test account** and **synthetic emails** only. Run it in Chrome **and** Firefox,
with Gmail's interface in **English** and in **French**.

## Setup

1. `make build`, then load `build/chrome` (Chrome: Load unpacked) and `build/firefox`
   (Firefox: `about:debugging` → Load Temporary Add-on). Or `make start-chromium` /
   `make start-firefox`, which run web-ext on the host (it needs a browser, so it cannot
   run in the container) on a fresh profile.
2. A thread of at least 5 messages, a thread of 1 message, a forwarded message, and a
   second test address (plus one non-Gmail client) as recipient.
3. DevTools open on the **Network** panel, filtered on the extension's requests.

## Checklist

### Trimming

- [ ] **Reply** in the 5-message thread: the quote disappears, the bar shows "Quoted
      history removed (N)" with Undo.
- [ ] **Reply all**, the **r** and **a** shortcuts, and a **pop-out** reply: same.
- [ ] **Undo**: the quote comes back where it was. Type above it first, then Undo: your
      text stays. **Trim** again: removed again.
- [ ] **Undo, then close and reopen the draft**: the quote is still there (no auto trim
      on a reopened draft), and the Trim button is offered.
- [ ] Keep mode **"All but the message I am replying to"**: exactly one quoted message
      remains.

### Leaving things alone

- [ ] **1-message thread** with threshold 2: not trimmed, Trim button offered; the button
      trims.
- [ ] Thresholds **1** and **3**: trims accordingly.
- [ ] **Forward**: never trimmed, no button.
- [ ] **New message**: no bar, no button.
- [ ] **Auto-trim off**: nothing unfolds when the reply opens; the button trims.
- [ ] **Bar masked**: nothing shown after a clean trim; the Trim button still offered.

### What actually leaves (do not skip)

For every kind of reply sent above, on the **recipient** side, open **Show original**:

- [ ] The quoted history is **absent** from the body.
- [ ] `In-Reply-To` and `References` are **present**.
- [ ] The message sits in the **same thread** in Gmail and in the non-Gmail client.

### Privacy

- [ ] The Network panel shows **no request** from the extension during the whole test.
- [ ] The popup and options pages show the right counter, and "TrimReply can work on
      mail.google.com".

### Firefox only

- [ ] Withdraw site access to mail.google.com (Extensions → TrimReply → Permissions):
      the popup says TrimReply has no access, and **Allow access to Gmail** restores it.
- [ ] The bar is styled (constructed stylesheet accepted by Gmail's CSP).

## Known limits to keep in mind

- The verdict of a trim is checked once, right after the cut: Gmail's marker was measured
  synchronous (docs/gmail-spike.md, point e). If Gmail ever makes it asynchronous, the
  "Show original" check above is what will catch it.
- A `•••` rendered more than 500 ms after the compose opens is not waited for.
