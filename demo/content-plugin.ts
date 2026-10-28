/**
 * Build-time content for the site, so the browser never ships a markdown parser or highlighter.
 *
 *   virtual:configdiff-docs      every page in docs/*.md as highlighted HTML, its outline and a search index
 *   virtual:configdiff-snippets  every file in demo/snippets/ as highlighted HTML, keyed by path ("playground/signup")
 *
 * Snippets are real TypeScript modules: the site imports the same files it displays, and
 * `npm run typecheck:site` checks them against the library.
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";
import { createHighlighter, type Highlighter } from "shiki";
import type { DocHeading, DocPage, SearchEntry } from "virtual:configdiff-docs";
import type { Plugin } from "vite";
import { DOC_PAGES } from "./src/docs-nav.ts";
import { REPO } from "./src/meta.ts";

const DOCS_ID = "virtual:configdiff-docs";
const SNIPPETS_ID = "virtual:configdiff-snippets";
const docsDir = fileURLToPath(new URL("../docs/", import.meta.url));
const snippetsDir = fileURLToPath(new URL("./snippets/", import.meta.url));

const LANG: Record<string, string> = {
  ts: "ts",
  json: "json",
  yaml: "yaml",
  env: "ini",
  sh: "bash",
  diff: "diff",
  txt: "text",
};

let highlighter: Promise<Highlighter> | undefined;
const getHighlighter = () =>
  (highlighter ??= createHighlighter({
    themes: ["github-light", "github-dark"],
    langs: ["ts", "tsx", "js", "json", "sh", "bash", "yaml", "toml", "ini", "diff"],
  }));

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

/** GitHub's heading ids, so links written for the README (`schemas.md#coercion--vcoerce`) still land. */
function slugger() {
  const seen = new Map<string, number>();
  return (text: string) => {
    const base = text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .replace(/\s/g, "-");
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n ? `${base}-${n}` : base;
  };
}

export function highlight(hl: Highlighter, code: string, lang = "ts") {
  const known = hl.getLoadedLanguages().includes(lang) ? lang : "text";
  const pre = hl.codeToHtml(code.replace(/\n$/, ""), {
    lang: known,
    themes: { light: "github-light", dark: "github-dark" },
    defaultColor: false,
  });
  return `<div class="code-block"><span class="code-lang">${escapeHtml(lang)}</span><button type="button" class="code-copy" aria-label="Copy code"></button>${pre}</div>`;
}

/** Links between docs become in-site routes; links into the repo point at GitHub. */
function resolveHref(href: string, slug: string): { url: string; external: boolean } {
  if (/^[a-z]+:/i.test(href)) return { url: href, external: /^https?:/.test(href) };
  if (href.startsWith("#")) return { url: `#/docs/${slug}/${href.slice(1)}`, external: false };
  const doc = /^(?:\.\/|(?:\.\.\/)?docs\/)?([\w-]+)\.md(?:#(.+))?$/.exec(href);
  const target =
    doc &&
    DOC_PAGES.find(
      (p) =>
        p.slug === doc[1]!.toLowerCase() || p.file.toLowerCase() === `${doc[1]!.toLowerCase()}.md`,
    );
  if (doc && target)
    return { url: `#/docs/${target.slug}${doc[2] ? `/${doc[2]}` : ""}`, external: false };
  if (href.startsWith("../")) return { url: `${REPO}/blob/main/${href.slice(3)}`, external: true };
  return { url: href, external: false };
}

/** Markdown inline syntax to plain text, for the search index. */
const plain = (md: string) =>
  md
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_]/g, "")
    .replace(/\\\|/g, "|")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/^\|?[\s:|-]+\|?$/gm, "")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function renderPage(
  hl: Highlighter,
  slug: string,
  source: string,
): { page: DocPage; search: SearchEntry[] } {
  const slugify = slugger();
  const all: DocHeading[] = [];
  let title = slug;
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const inner = this.parser.parseInline(tokens);
        const text = decode(inner.replace(/<[^>]+>/g, ""));
        const id = slugify(text);
        all.push({ depth, id, text });
        if (depth === 1) {
          title = text;
          return `<h1 id="${id}">${inner}</h1>`;
        }
        return `<h${depth} id="${id}">${inner}<a class="anchor" href="#/docs/${slug}/${id}" aria-label="Permalink to ${escapeHtml(text)}">#</a></h${depth}>`;
      },
      code({ text, lang }) {
        return highlight(hl, text, (lang ?? "").split(/\s/)[0] || "text");
      },
      link({ href, title: linkTitle, tokens }) {
        const { url, external } = resolveHref(href, slug);
        const t = linkTitle ? ` title="${escapeHtml(linkTitle)}"` : "";
        const ext = external ? ' target="_blank" rel="noreferrer"' : "";
        return `<a href="${escapeHtml(url)}"${t}${ext}>${this.parser.parseInline(tokens)}</a>`;
      },
    },
  });
  const html = (marked.parse(source) as string)
    .replace(/<table>/g, '<div class="table-wrap"><table>')
    .replace(/<\/table>/g, "</table></div>");

  // One search entry per section. Headings appear in the same order the renderer saw them,
  // so each section reuses the renderer's id.
  const search: SearchEntry[] = [];
  let heading = 0;
  let current = { id: "", heading: title, lines: [] as string[] };
  const flush = () => {
    const text = plain(current.lines.join("\n"));
    if (text || current.id)
      search.push({
        slug,
        page: title,
        id: current.id,
        heading: current.heading,
        text: text.slice(0, 600),
      });
  };
  let fence = false;
  for (const line of source.split("\n")) {
    if (line.startsWith("```")) fence = !fence;
    else if (fence) continue;
    else if (/^#{1,6}\s/.test(line)) {
      const h = all[heading++];
      if (!h) continue;
      if (h.depth > 1) flush();
      current = {
        id: h.depth === 1 ? "" : h.id,
        heading: h.depth === 1 ? title : h.text,
        lines: h.depth === 1 ? current.lines : [],
      };
    } else current.lines.push(line);
  }
  flush();

  return {
    page: { slug, title, html, headings: all.filter((h) => h.depth === 2 || h.depth === 3) },
    search,
  };
}

async function snippetFiles(dir: string, prefix = ""): Promise<{ name: string; file: string }[]> {
  const out: { name: string; file: string }[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = `${dir}${entry.name}`;
    if (entry.isDirectory())
      out.push(...(await snippetFiles(`${file}/`, `${prefix}${entry.name}/`)));
    else out.push({ name: `${prefix}${entry.name}`, file });
  }
  return out;
}

export function content(): Plugin {
  return {
    name: "configdiff-site-content",
    resolveId(id) {
      if (id === DOCS_ID || id === SNIPPETS_ID) return `\0${id}`;
    },
    async load(id) {
      if (id === `\0${DOCS_ID}`) {
        const hl = await getHighlighter();
        const pages: DocPage[] = [];
        const search: SearchEntry[] = [];
        for (const { slug } of DOC_PAGES) {
          const file = `${docsDir}${DOC_PAGES.find((p) => p.slug === slug)!.file}`;
          this.addWatchFile(file);
          const rendered = renderPage(hl, slug, await readFile(file, "utf8"));
          pages.push(rendered.page);
          search.push(...rendered.search);
        }
        return `export const pages = ${JSON.stringify(pages)};\nexport const search = ${JSON.stringify(search)};\n`;
      }
      if (id === `\0${SNIPPETS_ID}`) {
        const hl = await getHighlighter();
        const snippets: Record<string, string> = {};
        for (const { name, file } of await snippetFiles(snippetsDir)) {
          this.addWatchFile(file);
          snippets[name] = highlight(
            hl,
            (await readFile(file, "utf8")).trim(),
            LANG[name.split(".").pop() ?? ""] ?? "text",
          );
        }
        return `export default ${JSON.stringify(snippets)};\n`;
      }
    },
  };
}
