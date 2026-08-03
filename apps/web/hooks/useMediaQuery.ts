import { useEffect, useState } from "react";

export function useMediaQuery(query: string) {
  const [state, setState] = useState(() => ({
    query,
    matches:
      typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  }));

  if (state.query !== query) {
    setState({
      query,
      matches:
        typeof window !== "undefined"
          ? window.matchMedia(query).matches
          : false,
    });
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) =>
      setState({ query, matches: e.matches });
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return state.matches;
}
