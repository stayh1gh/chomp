/**
 * A small Markdown → HTML renderer for the task documents (spec.md, plan.md, research.md):
 * headings, paragraphs, bold/italic/code, fenced code, one level of lists, blockquotes,
 * links, https images and rules. Every line is escaped before any tag is emitted, and
 * links/images only accept http(s) URLs, so a document can't inject markup or script.
 */

export function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderMarkdown(text, { assetBase = null } = {}) {
  const lines = String(text ?? "").replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  let paragraph = [];
  let list = null; // { type: "ul" | "ol", items: [] }

  // Code spans, images and links are swapped for placeholders first, so emphasis rules
  // never reach inside a URL (Mobbin and Figma URLs are full of underscores).
  function inline(s) {
    const held = [];
    const hold = (html) => `\u0000${held.push(html) - 1}\u0000`;
    let html = escapeHtml(s);
    html = html.replace(/`([^`]+)`/g, (_m, code) => hold(`<code>${code}</code>`));
    html = html.replace(/!\[([^\]]*)\]\((https:\/\/[^)\s]+)\)/g, (_m, alt, url) => hold(`<img src="${url}" alt="${alt}" loading="lazy">`));
    // Task-relative QA screenshots (qa/<name>.png), served by the board itself.
    if (assetBase) html = html.replace(/!\[([^\]]*)\]\((qa\/[\w.-]+\.png)\)/g, (_m, alt, rel) => hold(`<img src="${assetBase}${rel}" alt="${alt}" loading="lazy">`));
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_m, label, url) => hold(`<a href="${url}" rel="noopener noreferrer" target="_blank">${label}</a>`));
    html = html.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_m, pre, url) => pre + hold(`<a href="${url}" rel="noopener noreferrer" target="_blank">${url}</a>`));
    html = html.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_m, a, b) => `<strong>${a ?? b}</strong>`);
    html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)|(?<![_\w])_([^_\n]+)_(?![_\w])/g, (_m, a, b) => `<em>${a ?? b}</em>`);
    return html.replace(/\u0000(\d+)\u0000/g, (_m, n) => held[Number(n)]);
  }
  function flushParagraph() {
    if (paragraph.length) out.push(`<p>${inline(paragraph.join(" "))}</p>`);
    paragraph = [];
  }
  function flushList() {
    if (list) out.push(`<${list.type}>${list.items.map((it) => `<li>${inline(it)}</li>`).join("")}</${list.type}>`);
    list = null;
  }

  while (i < lines.length) {
    const line = lines[i];

    const fence = line.match(/^```/);
    if (fence) {
      flushParagraph();
      flushList();
      const code = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1; // skip closing fence, if any
      out.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      flushList();
      i += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^(---+|\*\*\*+|___+)\s*$/.test(line)) {
      flushParagraph();
      flushList();
      out.push("<hr>");
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      flushParagraph();
      flushList();
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ""));
        i += 1;
      }
      out.push(`<blockquote>${inline(quote.join(" "))}</blockquote>`);
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? "")) {
      flushParagraph();
      flushList();
      const cells = (row) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const body = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        body.push(cells(lines[i]));
        i += 1;
      }
      out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${body
        .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
        .join("")}</tbody></table>`);
      continue;
    }

    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    if (ul) {
      flushParagraph();
      if (!list || list.type !== "ul") {
        flushList();
        list = { type: "ul", items: [] };
      }
      list.items.push(ul[1]);
      i += 1;
      continue;
    }

    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ol) {
      flushParagraph();
      if (!list || list.type !== "ol") {
        flushList();
        list = { type: "ol", items: [] };
      }
      list.items.push(ol[1]);
      i += 1;
      continue;
    }

    flushList();
    paragraph.push(line.trim());
    i += 1;
  }
  flushParagraph();
  flushList();
  return out.join("\n");
}

