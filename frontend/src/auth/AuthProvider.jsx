import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthContext } from "./AuthContext";

const requestJson = async (url) => {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
};

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [providers, setProviders] = useState({ google: false, facebook: false });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const result = await requestJson("/api/auth/me");
      setUser(result.user || null);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.allSettled([requestJson("/api/auth/me"), requestJson("/api/auth/providers")]).then(([account, available]) => {
      if (!active) return;
      if (account.status === "fulfilled") setUser(account.value.user || null);
      if (available.status === "fulfilled") setProviders(available.value);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const login = useCallback((provider) => {
    if (providers[provider]) window.location.assign(`/api/auth/${provider}`);
  }, [providers]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, providers, loading, login, logout, refresh }), [loading, login, logout, providers, refresh, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthProvider;
