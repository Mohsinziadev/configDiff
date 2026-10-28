import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Docs } from "./Docs";
import { Home } from "./Home";
import { Nav } from "./Nav";
import { parseHash, useHash } from "./router";

// The search index ships with the docs chunk, so neither loads until someone asks for it.
const Search = lazy(() => import("./Search"));

export function App() {
  const hash = useHash();
  const route = parseHash(hash);
  const [searchOpen, setSearchOpen] = useState(false);
  const lastView = useRef(route.view);

  useEffect(() => {
    document.documentElement.dataset.view = route.view;
  }, [route.view]);

  // Landing page sections: scroll to the anchor, or to the top when arriving from the docs.
  useEffect(() => {
    if (route.view !== "home") return;
    const target = route.anchor ? document.getElementById(route.anchor) : null;
    if (target) target.scrollIntoView();
    else if (lastView.current !== "home") window.scrollTo(0, 0);
  }, [route.view, route.view === "home" ? route.anchor : ""]);

  useEffect(() => {
    lastView.current = route.view;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((open) => !open);
      } else if (
        e.key === "/" &&
        !searchOpen &&
        !(e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable]"))
      ) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    // One copy handler for every highlighted block on the page, prerendered or not.
    const onClick = (e: MouseEvent) => {
      const button =
        e.target instanceof Element ? e.target.closest<HTMLButtonElement>(".code-copy") : null;
      const code = button?.parentElement?.querySelector("pre")?.textContent;
      if (!button || code == null) return;
      void navigator.clipboard?.writeText(code).then(() => {
        button.dataset.copied = "true";
        setTimeout(() => delete button.dataset.copied, 1600);
      });
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, [searchOpen]);

  return (
    <>
      <a
        className="skip-link"
        href={route.view === "docs" ? "#/docs" : "#main"}
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Skip to content
      </a>
      <Nav route={route} onSearch={() => setSearchOpen(true)} />
      {route.view === "docs" ? <Docs slug={route.slug} anchor={route.anchor} /> : <Home />}
      {searchOpen && (
        <Suspense fallback={null}>
          <Search onClose={() => setSearchOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
