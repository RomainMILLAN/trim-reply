/**
 * A DOM small enough to read, large enough to run the Gmail adapter on real
 * (sanitized) Gmail markup.
 *
 * NOT a browser. It implements the surface the adapter, the content script and
 * the tests use, and nothing else:
 *   - tree: append, insertBefore, before, after, remove, replaceWith, contains,
 *     isConnected, children, firstElementChild, textContent;
 *   - attributes, className, classList, value (inputs), style.display;
 *   - selectors: compound (tag, #id, .class, [attr], [attr="v"], [attr$="v"]),
 *     descendant and child (`>`) combinators, comma groups;
 *   - events: listeners, bubbling, Event / InputEvent / MouseEvent (isTrusted is
 *     false unless a test asks for a trusted one);
 *   - layout, faked: an element is visible unless it or an ancestor carries
 *     `display:none` in its style attribute, or is detached;
 *   - MutationObserver: childList / attributes / subtree, delivered on a microtask;
 *   - attachShadow with adoptedStyleSheets.
 *
 * Fixtures are parsed with scripts/html-lite.mjs, the same parser the sanitizer
 * uses.
 */
import { parseHTML } from "../scripts/html-lite.mjs";

// —— selectors ———————————————————————————————————————————————

const COMPOUND = /([a-zA-Z][\w-]*)|#([\w-]+)|\.([\w-]+)|\[\s*([\w-]+)\s*(?:([$]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?\s*\]/y;

function parseCompound(text) {
  const parts = { tag: null, ids: [], classes: [], attrs: [] };
  COMPOUND.lastIndex = 0;
  let consumed = 0;
  while (consumed < text.length) {
    COMPOUND.lastIndex = consumed;
    const m = COMPOUND.exec(text);
    if (!m) throw new Error(`fake-dom: unsupported selector part "${text.slice(consumed)}"`);
    if (m[1]) parts.tag = m[1].toUpperCase();
    else if (m[2]) parts.ids.push(m[2]);
    else if (m[3]) parts.classes.push(m[3]);
    else parts.attrs.push({ name: m[4].toLowerCase(), op: m[5], value: m[6] ?? m[7] ?? m[8] });
    consumed = COMPOUND.lastIndex;
  }
  return parts;
}

function parseSelector(selector) {
  return selector.split(",").map((group) => {
    const tokens = group.trim().replace(/\s*>\s*/g, " > ").split(/\s+/);
    const steps = [];
    let combinator = " ";
    for (const token of tokens) {
      if (token === ">") { combinator = ">"; continue; }
      steps.push({ combinator, compound: parseCompound(token) });
      combinator = " ";
    }
    return steps;
  });
}

function matchesCompound(el, c) {
  if (el.nodeType !== 1) return false;
  if (c.tag && el.tagName !== c.tag) return false;
  for (const id of c.ids) if (el.getAttribute("id") !== id) return false;
  for (const cls of c.classes) if (!el.classList.contains(cls)) return false;
  for (const a of c.attrs) {
    if (!el.hasAttribute(a.name)) return false;
    const v = el.getAttribute(a.name);
    if (a.op === "=" && v !== a.value) return false;
    if (a.op === "$=" && !v.endsWith(a.value)) return false;
  }
  return true;
}

function matchesSteps(el, steps, i, scope) {
  if (!matchesCompound(el, steps[i].compound)) return false;
  if (i === 0) return true;
  const combinator = steps[i].combinator;
  let parent = el.parentNode;
  while (parent && parent.nodeType === 1 && parent !== scope) {
    if (matchesSteps(parent, steps, i - 1, scope)) return true;
    if (combinator === ">") return false;
    parent = parent.parentNode;
  }
  return false;
}

function matchesSelector(el, selector) {
  return parseSelector(selector).some((steps) => matchesSteps(el, steps, steps.length - 1, null));
}

// —— events ——————————————————————————————————————————————————

export class Event {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = Boolean(init.bubbles);
    this.cancelable = Boolean(init.cancelable);
    this.defaultPrevented = false;
    this.target = null;
    this.currentTarget = null;
    this.isTrusted = false;
    this.propagationStopped = false;
  }
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { this.propagationStopped = true; }
}
export class InputEvent extends Event {}
export class MouseEvent extends Event {}

/** A test-only way to produce what a real user gesture produces. */
export function trusted(event) {
  event.isTrusted = true;
  return event;
}

// —— nodes ——————————————————————————————————————————————————

/**
 * What querySelectorAll and children return in a browser: indexable and
 * iterable, but NOT an Array -- no find, some, map. Returning a plain array here
 * would let `nodes.find(...)` pass the tests and throw in Gmail.
 */
function nodeList(items) {
  const list = { length: items.length, item: (i) => items[i] ?? null, forEach: (fn) => items.forEach(fn) };
  items.forEach((node, i) => { list[i] = node; });
  list[Symbol.iterator] = () => items[Symbol.iterator]();
  return Object.freeze(list);
}

class ClassList {
  constructor(el) { this.el = el; }
  values() { return (this.el.getAttribute("class") || "").split(/\s+/).filter(Boolean); }
  contains(name) { return this.values().includes(name); }
  add(...names) { this.el.setAttribute("class", [...new Set([...this.values(), ...names])].join(" ")); }
  remove(...names) { this.el.setAttribute("class", this.values().filter((n) => !names.includes(n)).join(" ")); }
  toggle(name, force) {
    const on = force === undefined ? !this.contains(name) : Boolean(force);
    if (on) this.add(name); else this.remove(name);
    return on;
  }
}

class Node {
  constructor(doc) {
    this.ownerDocument = doc;
    this.parentNode = null;
    this.childNodes = [];
    this.listeners = new Map();
  }

  get parentElement() {
    return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
  }

  get isConnected() {
    let n = this;
    while (n.parentNode || n.host) n = n.parentNode || n.host;
    return n === this.ownerDocument.documentNode;
  }

  get textContent() {
    if (this.nodeType === 3 || this.nodeType === 8) return this.data;
    return this.childNodes.filter((c) => c.nodeType !== 8).map((c) => c.textContent).join("");
  }

  set textContent(value) {
    if (this.nodeType === 3 || this.nodeType === 8) { this.data = String(value); return; }
    for (const child of [...this.childNodes]) child.remove();
    if (value !== "") this.append(this.ownerDocument.createTextNode(String(value)));
  }

  contains(other) {
    for (let n = other; n; n = n.parentNode) if (n === this) return true;
    return false;
  }

  insertBefore(node, ref) {
    if (node.nodeType === 11) {
      for (const child of [...node.childNodes]) this.insertBefore(child, ref);
      return node;
    }
    node.remove();
    const index = ref ? this.childNodes.indexOf(ref) : this.childNodes.length;
    if (index < 0) throw new Error("fake-dom: reference node is not a child");
    this.childNodes.splice(index, 0, node);
    node.parentNode = this;
    this.ownerDocument.notify({ type: "childList", target: this, addedNodes: [node], removedNodes: [] });
    return node;
  }

  appendChild(node) { return this.insertBefore(node, null); }

  append(...nodes) {
    for (const n of nodes) this.appendChild(typeof n === "string" ? this.ownerDocument.createTextNode(n) : n);
  }

  removeChild(node) {
    const index = this.childNodes.indexOf(node);
    if (index < 0) throw new Error("fake-dom: not a child");
    this.childNodes.splice(index, 1);
    node.parentNode = null;
    this.ownerDocument.notify({ type: "childList", target: this, addedNodes: [], removedNodes: [node] });
    return node;
  }

  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }

  before(...nodes) {
    const parent = this.parentNode;
    for (const n of nodes) parent.insertBefore(n, this);
  }

  after(...nodes) {
    const parent = this.parentNode;
    const next = parent.childNodes[parent.childNodes.indexOf(this) + 1] || null;
    for (const n of nodes) parent.insertBefore(n, next);
  }

  replaceWith(node) {
    this.before(node);
    this.remove();
  }

  addEventListener(type, fn, options) {
    const capture = options === true || Boolean(options && options.capture);
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push({ fn, capture });
  }

  removeEventListener(type, fn) {
    const list = this.listeners.get(type) || [];
    this.listeners.set(type, list.filter((l) => l.fn !== fn));
  }

  dispatchEvent(event) {
    event.target = this;
    const path = [];
    for (let n = this; n; n = n.parentNode || n.host || null) path.push(n);
    for (const node of path) {
      if (node !== this && !event.bubbles) break;
      event.currentTarget = node;
      for (const { fn } of [...(node.listeners.get(event.type) || [])]) {
        // Like a browser: a listener that throws is reported, not propagated.
        try { fn.call(node, event); } catch (error) { this.ownerDocument.listenerErrors.push(error); }
      }
      if (event.propagationStopped) break;
    }
    return !event.defaultPrevented;
  }
}

class Text extends Node {
  constructor(doc, data) { super(doc); this.nodeType = 3; this.data = data; }
}

class Comment extends Node {
  constructor(doc, data) { super(doc); this.nodeType = 8; this.data = data; }
}

class Element extends Node {
  constructor(doc, tag) {
    super(doc);
    this.nodeType = 1;
    this.tagName = tag.toUpperCase();
    this.attributes = new Map();
    this.classList = new ClassList(this);
    this.shadow = null;
  }

  get children() { return nodeList(this.childNodes.filter((c) => c.nodeType === 1)); }
  get firstElementChild() { return this.childNodes.find((c) => c.nodeType === 1) || null; }
  get firstChild() { return this.childNodes[0] || null; }

  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  hasAttribute(name) { return this.attributes.has(name); }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    this.ownerDocument.notify({ type: "attributes", target: this, attributeName: name, addedNodes: [], removedNodes: [] });
  }
  removeAttribute(name) {
    this.attributes.delete(name);
    this.ownerDocument.notify({ type: "attributes", target: this, attributeName: name, addedNodes: [], removedNodes: [] });
  }

  get className() { return this.getAttribute("class") || ""; }
  set className(v) { this.setAttribute("class", v); }
  get id() { return this.getAttribute("id") || ""; }

  get value() { return this.getAttribute("value") || ""; }
  set value(v) { this.setAttribute("value", v); }

  get style() {
    const el = this;
    return {
      get display() { return /display\s*:\s*none/i.test(el.getAttribute("style") || "") ? "none" : ""; },
      set display(v) { el.setAttribute("style", v === "none" ? "display:none" : ""); },
    };
  }

  get hidden() { return this.hasAttribute("hidden"); }
  set hidden(v) { if (v) this.setAttribute("hidden", ""); else this.removeAttribute("hidden"); }

  /** Faked layout: 0 when detached or under display:none / hidden, 1 otherwise. */
  get offsetWidth() {
    if (!this.isConnected) return 0;
    for (let n = this; n && n.nodeType === 1; n = n.parentNode) {
      if (n.style.display === "none" || n.hasAttribute("hidden")) return 0;
    }
    return 1;
  }
  get offsetHeight() { return this.offsetWidth; }
  getClientRects() { return this.offsetWidth ? [{}] : []; }

  matches(selector) { return matchesSelector(this, selector); }

  closest(selector) {
    for (let n = this; n && n.nodeType === 1; n = n.parentNode) if (n.matches(selector)) return n;
    return null;
  }

  querySelectorAll(selector) {
    const groups = parseSelector(selector);
    const found = [];
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType !== 1) continue;
        if (groups.some((steps) => matchesSteps(child, steps, steps.length - 1, null))) found.push(child);
        walk(child);
      }
    };
    walk(this);
    return nodeList(found);
  }

  querySelector(selector) { return this.querySelectorAll(selector).item(0); }

  attachShadow({ mode }) {
    this.shadow = new ShadowRoot(this.ownerDocument, this, mode);
    return this.shadow;
  }

  get shadowRoot() { return this.shadow && this.shadow.mode === "open" ? this.shadow : null; }
}

class ShadowRoot extends Element {
  constructor(doc, host, mode) {
    super(doc, "#shadow-root");
    this.nodeType = 11;
    this.host = host;
    this.mode = mode;
    this.adoptedStyleSheets = [];
  }
  get isConnected() { return this.host.isConnected; }
}

class DocumentFragment extends Element {
  constructor(doc) { super(doc, "#fragment"); this.nodeType = 11; }
}

export class CSSStyleSheet {
  constructor() { this.cssText = ""; }
  replaceSync(text) { this.cssText = text; }
}

// —— mutation observer ——————————————————————————————————————

function makeMutationObserver(doc) {
  return class MutationObserver {
    constructor(callback) { this.callback = callback; this.targets = []; this.queue = []; }
    observe(target, options) {
      this.targets.push({ target, options });
      doc.observers.add(this);
    }
    disconnect() { doc.observers.delete(this); this.targets = []; this.queue = []; }
    takeRecords() { const q = this.queue; this.queue = []; return q; }
    accept(record) {
      const wanted = this.targets.some(({ target, options }) => {
        const inScope = options.subtree ? target.contains(record.target) : target === record.target;
        if (!inScope) return false;
        return record.type === "childList" ? options.childList : options.attributes;
      });
      if (!wanted) return;
      this.queue.push(record);
      if (this.queue.length === 1) {
        queueMicrotask(() => {
          const records = this.takeRecords();
          if (records.length && doc.observers.has(this)) this.callback(records, this);
        });
      }
    }
  };
}

// —— document ————————————————————————————————————————————————

export function createDocument() {
  const doc = {
    observers: new Set(),
    listenerErrors: [],
    notify(record) { for (const o of [...this.observers]) o.accept(record); },
    createElement: (tag) => new Element(doc, tag),
    createTextNode: (text) => new Text(doc, text),
    createComment: (text) => new Comment(doc, text),
    createDocumentFragment: () => new DocumentFragment(doc),
  };
  doc.documentNode = new Element(doc, "#document");
  doc.documentElement = doc.createElement("html");
  doc.documentNode.appendChild(doc.documentElement);
  doc.body = doc.createElement("body");
  doc.documentElement.appendChild(doc.body);
  doc.querySelector = (s) => doc.documentNode.querySelector(s);
  doc.querySelectorAll = (s) => doc.documentNode.querySelectorAll(s);
  doc.MutationObserver = makeMutationObserver(doc);
  return doc;
}

/** Builds nodes from (sanitized) HTML, owned by `doc`. */
export function fromHTML(doc, html) {
  const build = (n) => {
    if (n.type === "text") return doc.createTextNode(n.text);
    if (n.type === "comment") return doc.createComment(n.text);
    const el = doc.createElement(n.tag);
    for (const [k, v] of n.attrs) el.attributes.set(k, v);
    for (const child of n.children) {
      const c = build(child);
      el.childNodes.push(c);
      c.parentNode = el;
    }
    return el;
  };
  return parseHTML(html).map(build);
}

/**
 * Installs a fresh document and the globals the adapter reads (document,
 * MutationObserver, Event classes, CSSStyleSheet). Returns the document.
 */
export function installDocument() {
  const doc = createDocument();
  Object.assign(globalThis, {
    document: doc,
    MutationObserver: doc.MutationObserver,
    Event,
    InputEvent,
    MouseEvent,
    CSSStyleSheet,
  });
  return doc;
}
