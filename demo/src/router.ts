import { useSyncExternalStore } from "react";
import { DEFAULT_DOC } from "./docs-nav";

/**
 * Hash routes, so the whole site stays one static page (m2toolkit serves /npm-packages/configdiff):
 *   #/docs/<slug>[/<heading-id>]   a documentation page
 *   #<id> or nothing               the landing page, scrolled to that section
 */
export type Route =
  | { view: "home"; anchor: string | undefined }
  | { view: "docs"; slug: string; anchor: string | undefined };

export function parseHash(hash: string): Route {
  if (hash.startsWith("#/docs")) {
    const [, , slug, anchor] = hash.slice(1).split("/");
    return {
      view: "docs",
      slug: slug || DEFAULT_DOC,
      anchor: anchor ? decodeURIComponent(anchor) : undefined,
    };
  }
  const anchor = hash.slice(1);
  return {
    view: "home",
    anchor: anchor && !anchor.startsWith("/") ? decodeURIComponent(anchor) : undefined,
  };
}

export const docHref = (slug: string, anchor?: string) =>
  `#/docs/${slug}${anchor ? `/${anchor}` : ""}`;

const subscribe = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};

/** The current hash. The server (and hydration) always sees the landing page. */
export const useHash = () =>
  useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => "",
  );
