import { useEffect, useLayoutEffect, useState } from "react";
import type { DocHeading } from "virtual:configdiff-docs";
import { DOC_GROUPS, DOC_PAGES } from "./docs-nav";
import { ChevronDown, ChevronRight, EditIcon, MenuIcon, OutlineIcon } from "./icons";
import { editUrl } from "./meta";
import { docHref } from "./router";

type DocsModule = typeof import("virtual:configdiff-docs");

// The rendered docs are one lazy chunk, shared with search; the landing page never loads it.
let loaded: DocsModule | null = null;
export const loadDocs = () => import("virtual:configdiff-docs").then((m) => (loaded = m));

const homeTitle = typeof document === "undefined" ? "" : document.title;

function Outline({
  slug,
  headings,
  active,
}: {
  slug: string;
  headings: DocHeading[];
  active: string;
}) {
  return (
    <div className="outline-inner">
      <p className="outline-title">
        <OutlineIcon /> On this page
      </p>
      <ul>
        {headings.map((h) => (
          <li key={h.id} className={`outline-depth-${h.depth}`}>
            <a
              href={docHref(slug, h.id)}
              className={active === h.id ? "active" : undefined}
              onClick={() => document.getElementById(h.id)?.scrollIntoView()}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Docs({ slug, anchor }: { slug: string; anchor: string | undefined }) {
  const [docs, setDocs] = useState(loaded);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [active, setActive] = useState("");

  useEffect(() => {
    if (!docs) void loadDocs().then(setDocs);
  }, [docs]);

  const page = docs?.pages.find((p) => p.slug === slug);
  const index = DOC_PAGES.findIndex((p) => p.slug === slug);
  const known = index !== -1;
  const prev = DOC_PAGES[index - 1];
  const next = known ? DOC_PAGES[index + 1] : undefined;

  useEffect(() => {
    document.title = page ? `${page.title} | configdiff-js` : homeTitle;
    return () => {
      document.title = homeTitle;
    };
  }, [page]);

  // New page: start at the top, or at the linked heading.
  useLayoutEffect(() => {
    if (!page) return;
    const target = anchor ? document.getElementById(anchor) : null;
    if (target) target.scrollIntoView();
    else window.scrollTo(0, 0);
    setSidebarOpen(false);
    setOutlineOpen(false);
  }, [page, anchor]);

  // "On this page": the last heading scrolled past the nav.
  useEffect(() => {
    if (!page) return;
    const onScroll = () => {
      const els = page.headings
        .map((h) => document.getElementById(h.id))
        .filter((el): el is HTMLElement => !!el);
      let current = "";
      for (const el of els) if (el.getBoundingClientRect().top < 120) current = el.id;
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      if (atBottom && els.length) current = els[els.length - 1]!.id;
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [page]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSidebarOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  const headings = page?.headings ?? [];

  return (
    <div className="docs">
      <div className="local-nav">
        <button type="button" onClick={() => setSidebarOpen(true)} aria-expanded={sidebarOpen}>
          <MenuIcon /> Menu
        </button>
        {headings.length > 0 && (
          <button
            type="button"
            onClick={() => setOutlineOpen((o) => !o)}
            aria-expanded={outlineOpen}
          >
            On this page <ChevronRight className={outlineOpen ? "rotate-90" : undefined} />
          </button>
        )}
        {outlineOpen && page && (
          <div className="local-outline">
            <Outline slug={slug} headings={headings} active={active} />
          </div>
        )}
      </div>

      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
      <aside className="sidebar" data-open={sidebarOpen || undefined}>
        <nav aria-label="Documentation">
          {DOC_GROUPS.map((g) => (
            <section key={g.title} className="sidebar-group">
              <button
                type="button"
                className="sidebar-title"
                aria-expanded={!collapsed[g.title]}
                onClick={() => setCollapsed((c) => ({ ...c, [g.title]: !c[g.title] }))}
              >
                {g.title}
                <ChevronDown width={14} height={14} />
              </button>
              {!collapsed[g.title] && (
                <ul>
                  {g.items.map((item) => (
                    <li key={item.slug}>
                      <a
                        href={docHref(item.slug)}
                        aria-current={item.slug === slug ? "page" : undefined}
                      >
                        {item.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </nav>
      </aside>

      <main id="main" tabIndex={-1} className="doc-main">
        <div className="doc-container">
          {!known ? (
            <div className="vp-doc">
              <h1>Page not found</h1>
              <p>
                There is no documentation page called <code>{slug}</code>. Start with{" "}
                <a href={docHref("getting-started")}>Getting Started</a>.
              </p>
            </div>
          ) : page ? (
            <article className="vp-doc" dangerouslySetInnerHTML={{ __html: page.html }} />
          ) : (
            <div className="doc-skeleton" aria-busy="true" aria-label="Loading">
              <span style={{ width: "45%", height: 36 }} />
              <span />
              <span />
              <span style={{ width: "70%" }} />
            </div>
          )}

          {known && (
            <footer className="doc-footer">
              <a
                className="edit-link"
                href={editUrl(DOC_PAGES[index]!.file)}
                target="_blank"
                rel="noreferrer"
              >
                <EditIcon /> Edit this page on GitHub
              </a>
              <nav className="pager" aria-label="Pager">
                {prev ? (
                  <a className="pager-link" href={docHref(prev.slug)}>
                    <span>Previous page</span>
                    <strong>{prev.title}</strong>
                  </a>
                ) : (
                  <span />
                )}
                {next && (
                  <a className="pager-link next" href={docHref(next.slug)}>
                    <span>Next page</span>
                    <strong>{next.title}</strong>
                  </a>
                )}
              </nav>
            </footer>
          )}
        </div>
      </main>

      <aside className="outline" aria-label="On this page">
        {headings.length > 0 && <Outline slug={slug} headings={headings} active={active} />}
      </aside>
    </div>
  );
}
