/**
 * The port between the domain and a webmail. Phase 2 (Outlook Web) adds a second
 * adapter behind the same contract, without touching core/ or the run.
 *
 *   MailAdapter { watch(onCompose) -> stop }
 *   Compose {
 *     isReopened()   -> boolean      query, no effect
 *     inspectFolded()-> QuoteShape   query, never unfolds; none() only on proof
 *     unfold()       -> Promise<Fold | NoFold>
 *     inspect()      -> QuoteShape   query, never unknown()
 *     cut(decision)  -> Cut | NoCut  leaves exactly decision.keptMessages, or nothing
 *     placeBar(host)                 puts the bar inside this compose
 *   }
 *   Fold / NoFold  { unfolded, refold() }
 *   Cut            { restore(), verify() -> "clean" | "uncertain", recordInto(recorder) -> Fact }
 *   NoCut          { recordInto(recorder) -> Fact }    calls recorder.abandon()
 *
 * `conforms` is what test/adapter.test.js checks an adapter's compose against.
 */
(function (global) {
  "use strict";

  const COMPOSE_METHODS = Object.freeze(["isReopened", "inspectFolded", "unfold", "inspect", "cut", "placeBar"]);

  const MailContract = Object.freeze({
    COMPOSE_METHODS,
    conforms(compose) {
      return COMPOSE_METHODS.every((name) => typeof compose[name] === "function");
    },
  });

  global.MailContract = MailContract;
})(globalThis);
