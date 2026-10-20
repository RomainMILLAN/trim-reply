# Architecture

## Layers

```
src/core/          domain: settings, decisions, the compose session      no DOM, no browser API
src/mail/          the port (mail-contract.js) and the Gmail adapter      the only code that knows Gmail
src/content/       the content script: run, bar, composition root
src/ui/, pages     popup and options
platform.js, *-repository.js   browser API façade, storage
```

Every dependency points towards `core/`. `content/main.js` knows the `MailAdapter`
contract and nothing of Gmail; `content/boot-gmail.js` is the one file that names the
Gmail adapter. Outlook Web (phase 2) adds `mail/outlook/` and `boot-outlook.js` without
touching `core/` or `main.js` — the manifest, the build and the structure test will change.

## Why every file is an IIFE on `globalThis`

The same files run as a content script, in the popup and in the options page, each with
its own loader. Classic scripts loaded in a fixed order work in all three without a
bundler. The order is written in four places — the manifest, both pages and
`test/load-core.js` — and `test/structure.test.js` checks they agree.

## The port

```
MailAdapter { watch(onCompose) -> stop }
Compose {
  isReopened()     -> boolean              query
  inspectFolded()  -> QuoteShape           query, never unfolds; none() only on proof
  unfold()         -> Promise<Fold|NoFold> command
  inspect()        -> QuoteShape           query, never unknown()
  cut(decision)    -> Cut | NoCut          command: leaves exactly decision.keptMessages
  placeBar(host)
}
Cut   { restore(), verify() -> "clean"|"uncertain", recordInto(recorder) -> Fact }
NoCut { recordInto(recorder) -> Fact }       // calls recorder.abandon()
```

The contract never returns `null`: every failure has a null object.

## The compose session

`ComposeSession` is the aggregate: one per compose, created with a snapshot of the
settings, holding the only truth about whether the quote was cut.

| State | Offers | Reached by |
|---|---|---|
| Untouched | Trim | creation, a skipped run (auto off, reopened draft, below threshold), an abandoned run |
| Inspecting | — | `plan` returned a run; a second `plan` is refused |
| Trimmed | Undo | `record(cut)` after a confirmed decision, verified clean |
| TrimmedUncertain | Undo + warning | the same, but Gmail may still append the quote |
| Restored | Trim | `undo()` |
| Ineligible | — | forward, no quote, nothing to remove |

A run is `plan(shape, context)` → `unfold` → `run.confirm(shape)` → `cut` →
`cut.recordInto(run.recorder())`. Two commands, so a concurrent run is stopped by the
aggregate itself. The fact comes before the record: the session moves to Trimmed only
once a real `Cut` exists, stores the memento before verifying, and restores a cut it
refuses. Every transition returns a fact (`ReplyTrimmed`, `TrimUndone`, `NoFact`) that
applies itself to the counter.

## Decision rules (`TrimPolicy`)

1. **Eligibility first**, whatever the trigger: forward → `Skip(forward)`, no quote →
   `Skip(no-quote)`. Both make the compose ineligible.
2. **Auto only**: auto-trim off → `Skip(auto-off)`, reopened draft → `Skip(reopened)`.
   Nothing is unfolded; the button is offered.
3. **Shape**: folded → `Unknown` (unfold, never a refusal); below the threshold (auto
   only) → `Skip(below-threshold)`; nothing left to remove → `Skip(nothing-to-remove)`;
   otherwise `Trim{ keptMessages, removedMessages }`.

## Glossary

| Term | Code | Meaning |
|---|---|---|
| Reply | Reply | A compose opened by Reply or Reply all |
| Quote | Quote | The history Gmail adds under a reply |
| Quoted message | QuotedMessage | One message of that history; one `.gmail_attr` in Gmail's DOM |
| Trim | Trim | Removing quoted messages from the draft |
| Forward | Forward | Never trimmed |
| Reopened draft | ReopenedDraft | An existing draft reloaded by Gmail |
| New message | NewMessage | A compose with no thread, recognised by an empty `rm` input |
| Uncertain trim | UncertainTrim | Cut done, but Gmail might still append the quote |
| Fold | Fold / NoFold | The `•••` that folds a quote; the memento of unfolding, or its failure |
| Run | Run | One execution, bound to its id |
| Planned / confirmed | Planned / Confirmed | A decision before unfolding, then after inspection; only a confirmed one allows `record` |
| Rejected | Rejected | A command refused by the session's state — not a decision |
| Skip | Skip(reason) | A decision not to trim |
| Facts | ReplyTrimmed / TrimUndone / NoFact | What a transition did to the counter |

## Accepted limits

- **The counter is approximate across tabs**: read, apply, write. Two tabs trimming at
  the same instant can lose one increment. Not worth a lock for a local statistic.
- **A quote left unfolded**: when the auto run unfolds a quote and then decides not to
  trim (below the threshold), the quote stays unfolded. Gmail offers no way to fold it
  back. Counting without unfolding would mean parsing an HTML string, which the extension
  never does.
- **A `•••` rendered after the bounded wait** (500 ms, the spike measured under 1 ms):
  the reply is classified as having no quote and is not trimmed.

## Why not InboxSDK or gmail.js

Both inject into the page's own world and intercept Gmail's network traffic, weigh far
more than this whole extension, and are harder to review in a store. What TrimReply needs
— find an editor, click a button, move nodes — fits in one adapter file.
