import { useEffect, useState } from "react";
import {
  ChevronDown,
  CloseIcon,
  GitHubIcon,
  Logo,
  MenuIcon,
  MoonIcon,
  NpmIcon,
  SearchIcon,
  SunIcon,
} from "./icons";
import { CHANGELOG_URL, NPM_URL, PACKAGES_URL, PKG, REPO } from "./meta";
import { docHref, type Route } from "./router";

const LINKS = [
  {
    label: "Guide",
    href: docHref("getting-started"),
    match: (r: Route) => r.view === "docs" && r.slug !== "api" && r.slug !== "rules",
  },
  {
    label: "Rules",
    href: docHref("rules"),
    match: (r: Route) => r.view === "docs" && r.slug === "rules",
  },
  {
    label: "API",
    href: docHref("api"),
    match: (r: Route) => r.view === "docs" && r.slug === "api",
  },
  { label: "Playground", href: "#playground", match: () => false },
  { label: "Compare", href: "#compare", match: () => false },
];

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("configdiff-site:theme", next);
  } catch {
    /* private mode: the choice lasts for this visit */
  }
}

export function Nav({ route, onSearch }: { route: Route; onSearch: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mac, setMac] = useState(true);

  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);
  useEffect(() => setMenuOpen(false), [route]);

  return (
    <header className="nav" data-menu={menuOpen || undefined}>
      <div className="nav-inner">
        <a
          className="nav-brand"
          href="#"
          aria-label="ConfigDiff home"
          onClick={() => window.scrollTo(0, 0)}
        >
          <Logo />
        </a>
        <nav className="nav-links" aria-label="Main">
          {LINKS.map((l) => (
            <a key={l.label} href={l.href} className={l.match(route) ? "active" : undefined}>
              {l.label}
            </a>
          ))}
          <div className="nav-menu">
            <button type="button" className="nav-menu-button" aria-haspopup="true">
              v{PKG.version} <ChevronDown width={14} height={14} />
            </button>
            <div className="nav-menu-list" role="menu">
              <a role="menuitem" href={CHANGELOG_URL} target="_blank" rel="noreferrer">
                Changelog
              </a>
              <a
                role="menuitem"
                href={`${REPO}/blob/main/CONTRIBUTING.md`}
                target="_blank"
                rel="noreferrer"
              >
                Contributing
              </a>
              <a role="menuitem" href={PACKAGES_URL}>
                More M2Toolkit packages
              </a>
            </div>
          </div>
        </nav>

        <div className="nav-tools">
          <button
            type="button"
            className="nav-search"
            onClick={onSearch}
            aria-label="Search documentation"
          >
            <SearchIcon />
            <span className="nav-search-label">Search</span>
            <kbd className="nav-search-keys">{mac ? "⌘" : "Ctrl"} K</kbd>
          </button>
          <button
            type="button"
            className="theme-switch"
            onClick={toggleTheme}
            aria-label="Toggle dark mode"
            title="Toggle dark mode"
          >
            <span className="theme-switch-thumb">
              <SunIcon className="icon-sun" width={12} height={12} />
              <MoonIcon className="icon-moon" width={12} height={12} />
            </span>
          </button>
          <span className="nav-divider" aria-hidden="true" />
          <a
            className="nav-icon"
            href={REPO}
            target="_blank"
            rel="noreferrer"
            aria-label="ConfigDiff on GitHub"
          >
            <GitHubIcon width={20} height={20} />
          </a>
          <a
            className="nav-icon"
            href={NPM_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="ConfigDiff on npm"
          >
            <NpmIcon width={22} height={22} />
          </a>
          <button
            type="button"
            className="nav-hamburger"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? <CloseIcon width={20} height={20} /> : <MenuIcon width={20} height={20} />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="nav-screen" aria-label="Mobile">
          {LINKS.map((l) => (
            <a key={l.label} href={l.href} onClick={() => setMenuOpen(false)}>
              {l.label}
            </a>
          ))}
          <a href={CHANGELOG_URL} target="_blank" rel="noreferrer">
            Changelog
          </a>
          <a href={PACKAGES_URL}>More M2Toolkit packages</a>
          <div className="nav-screen-row">
            <span>Appearance</span>
            <button
              type="button"
              className="theme-switch"
              onClick={toggleTheme}
              aria-label="Toggle dark mode"
            >
              <span className="theme-switch-thumb">
                <SunIcon className="icon-sun" width={12} height={12} />
                <MoonIcon className="icon-moon" width={12} height={12} />
              </span>
            </button>
          </div>
        </nav>
      )}
    </header>
  );
}
