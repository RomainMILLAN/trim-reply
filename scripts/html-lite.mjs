/**
 * A small HTML parser and serializer for DEVELOPMENT TOOLS ONLY: the fixture
 * sanitizer and the test fake DOM. It never ships (scripts/ and test/ are not
 * copied into the packages) -- the extension itself parses no HTML at all.
 *
 * It reads what a browser serialized (`outerHTML`), not arbitrary web pages:
 * quoted attributes, explicit end tags, void elements, comments, raw text inside
 * <script>/<style>/<textarea>. A stray end tag closes up to its match; an
 * unmatched one is ignored.
 *
 * Tree: { type: "element", tag, attrs: [[name, value]], children }
 *       { type: "text", text } | { type: "comment", text }
 */
const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr",
]);
const RAW_TEXT = new Set(["script", "style", "textarea"]);

const ENTITIES = new Map([["amp", "&"], ["lt", "<"], ["gt", ">"], ["quot", '"'], ["apos", "'"], ["nbsp", " "]]);

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
    if (name[0] === "#") {
      const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES.get(name.toLowerCase()) ?? whole;
  });
}

const escapeText = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/ /g, "&nbsp;");
const escapeAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/ /g, "&nbsp;");

const ATTR = /\s*([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/y;
const TAG_END = /\s*\/?>/y;

export function parseHTML(html) {
  const root = { type: "element", tag: "#root", attrs: [], children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  let i = 0;

  while (i < html.length) {
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      const stop = end === -1 ? html.length : end;
      top().children.push({ type: "comment", text: html.slice(i + 4, stop) });
      i = stop + 3;
    } else if (html.startsWith("<!", i) || html.startsWith("<?", i)) {
      const end = html.indexOf(">", i);
      i = end === -1 ? html.length : end + 1;
    } else if (html.startsWith("</", i)) {
      const end = html.indexOf(">", i);
      const tag = html.slice(i + 2, end === -1 ? html.length : end).trim().toLowerCase();
      const at = stack.map((n) => n.tag).lastIndexOf(tag);
      if (at > 0) stack.length = at;
      i = end === -1 ? html.length : end + 1;
    } else if (html[i] === "<" && /[a-zA-Z]/.test(html[i + 1] || "")) {
      const nameMatch = /^<([a-zA-Z][\w:-]*)/.exec(html.slice(i, i + 64));
      const tag = nameMatch[1].toLowerCase();
      let j = i + nameMatch[0].length;
      const attrs = [];
      for (;;) {
        TAG_END.lastIndex = j;
        if (TAG_END.test(html)) break;
        ATTR.lastIndex = j;
        const m = ATTR.exec(html);
        if (!m) break;
        const value = m[2] ?? m[3] ?? m[4] ?? "";
        attrs.push([m[1].toLowerCase(), decodeEntities(value)]);
        j = ATTR.lastIndex;
      }
      const close = html.indexOf(">", j);
      const selfClosing = html[close - 1] === "/";
      const node = { type: "element", tag, attrs, children: [] };
      top().children.push(node);
      i = close + 1;
      if (RAW_TEXT.has(tag)) {
        const end = html.toLowerCase().indexOf(`</${tag}`, i);
        const stop = end === -1 ? html.length : end;
        if (stop > i) node.children.push({ type: "text", text: decodeEntities(html.slice(i, stop)) });
        const gt = html.indexOf(">", stop);
        i = gt === -1 ? html.length : gt + 1;
      } else if (!VOID.has(tag) && !selfClosing) {
        stack.push(node);
      }
    } else {
      const next = html.indexOf("<", i + 1);
      const stop = next === -1 ? html.length : next;
      top().children.push({ type: "text", text: decodeEntities(html.slice(i, stop)) });
      i = stop;
    }
  }
  return root.children;
}

export function serialize(nodes) {
  let out = "";
  for (const node of nodes) {
    if (node.type === "text") out += escapeText(node.text);
    else if (node.type === "comment") out += `<!--${node.text}-->`;
    else {
      const attrs = node.attrs.map(([k, v]) => (v === "" ? ` ${k}` : ` ${k}="${escapeAttr(v)}"`)).join("");
      out += `<${node.tag}${attrs}>`;
      if (!VOID.has(node.tag)) out += `${serialize(node.children)}</${node.tag}>`;
    }
  }
  return out;
}
