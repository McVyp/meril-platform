"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from "react";

interface SessionState {
  loggedIn: boolean;
  id: string | null;
  name: string | null;
  email: string | null;
  loaded: boolean;
}

interface SessionContextValue extends SessionState {
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({
    loggedIn: false,
    id: null,
    name: null,
    email: null,
    loaded: false,
  });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/session");
      const data = await res.json();
      setState({
        loggedIn: !!data.loggedIn,
        id: data.id ?? null,
        name: data.name ?? null,
        email: data.email ?? null,
        loaded: true,
      });
    } catch (err) {
      console.error("Session refresh failed:", err);
      setState({
        loggedIn: false,
        id: null,
        name: null,
        email: null,
        loaded: true,
      });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <SessionContext.Provider value={{ ...state, refresh }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
