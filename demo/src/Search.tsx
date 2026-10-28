import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SearchEntry } from "virtual:configdiff-docs";
import { loadDocs } from "./Docs";
import { DOC_PAGES } from "./docs-nav";
import { ChevronRight, SearchIcon } from "./icons";
import { docHref } from "./router";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Every term must match somewhere; headings outrank page titles, which outrank body text. */
function find(index: SearchEntry[], terms: string[]): SearchEntry[] {
  if (!terms.length) return [];
  const scored: { entry: SearchEntry; score: number }[] = [];
  for (const entry of index) {
    const heading = entry.heading.toLowerCase();
    const page = entry.page.toLowerCase();
    const text = entry.text.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (heading.includes(t)) score += heading.startsWith(t) ? 12 : 8;
      else if (page.includes(t)) score += 4;
      else if (text.includes(t)) score += 1;
      else {
        score = 0;
        break;
      }
    }
    if (score) scored.push({ entry, score: score + (entry.id ? 0 : 1) });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 30)
    .map((s) => s.entry);
}

function mark(text: string, terms: string[]): ReactNode {
  if (!terms.length) return text;
  const re = new RegExp(`(${terms.map(escapeRe).join("|")})`, "ig");
  return text.split(re).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part));
}

/** The body text around the first match. */
function excerpt(text: string, terms: string[]) {
  const lower = text.toLowerCase();
  const at = Math.min(...terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0));
  if (!Number.isFinite(at) || at < 50) return text.slice(0, 140);
  return `…${text.slice(at - 40, at + 100)}`;
}

export default function Search({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState<SearchEntry[] | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    void loadDocs().then((m) => setIndex(m.search));
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  const terms = useMemo(() => query.toLowerCase().trim().split(/\s+/).filter(Boolean), [query]);
  const results = useMemo(() => find(index ?? [], terms), [index, terms]);
  const items = terms.length
    ? results.map((r) => ({
        key: `${r.slug}/${r.id}`,
        href: docHref(r.slug, r.id || undefined),
        entry: r,
      }))
    : DOC_PAGES.map((p) => ({
        key: p.slug,
        href: docHref(p.slug),
        entry: { slug: p.slug, page: p.title, id: "", heading: p.title, text: p.blurb },
      }));

  useEffect(() => setSelected(0), [query]);
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const go = (href: string) => {
    window.location.hash = href;
    onClose();
  };

  return (
    <div className="search-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="search-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Search documentation"
      >
        <div className="search-bar">
          <SearchIcon width={18} height={18} />
          <input
            autoFocus
            type="search"
            placeholder="Search the docs"
            aria-label="Search the docs"
            aria-controls="search-results"
            aria-activedescendant={items[selected] ? `search-${selected}` : undefined}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelected((s) => Math.min(s + 1, items.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelected((s) => Math.max(s - 1, 0));
              } else if (e.key === "Enter" && items[selected]) {
                go(items[selected].href);
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
          />
          <button type="button" className="search-close" onClick={onClose}>
            Esc
          </button>
        </div>

        <ul className="search-results" id="search-results" role="listbox" ref={list}>
          {!terms.length && <li className="search-group">Documentation</li>}
          {items.map((item, i) => (
            <li
              key={item.key}
              id={`search-${i}`}
              role="option"
              aria-selected={i === selected}
              onMouseMove={() => setSelected(i)}
              onClick={() => go(item.href)}
            >
              <span className="search-titles">
                {item.entry.id && (
                  <>
                    <span className="search-page">{item.entry.page}</span>
                    <ChevronRight width={12} height={12} />
                  </>
                )}
                <strong>{mark(item.entry.heading, terms)}</strong>
              </span>
              {item.entry.text && (
                <span className="search-excerpt">
                  {mark(excerpt(item.entry.text, terms), terms)}
                </span>
              )}
            </li>
          ))}
          {terms.length > 0 && index && !results.length && (
            <li className="search-empty">
              No results for “<strong>{query}</strong>”
            </li>
          )}
          {terms.length > 0 && !index && <li className="search-empty">Loading the index…</li>}
        </ul>

        <div className="search-footer" aria-hidden="true">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> to navigate
          </span>
          <span>
            <kbd>↵</kbd> to select
          </span>
          <span>
            <kbd>esc</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
}
