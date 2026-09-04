import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthContext } from "./AuthContext";

const requestJson = async (url, options = {}) => {
  const response = await fetch(url, { credentials: "include", ...options });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || `Request failed: ${response.status}`);
  return result;
};

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [providers, setProviders] = useState({ google: false, guest: false });
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

  const continueAsGuest = useCallback(async () => {
    if (!providers.guest) throw new Error("Chế độ dùng thử chưa sẵn sàng.");
    setLoading(true);
    try {
      const result = await requestJson("/api/auth/guest", { method: "POST" });
      setUser(result.user || null);
      return result.user;
    } finally {
      setLoading(false);
    }
  }, [providers.guest]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, providers, loading, login, continueAsGuest, logout, refresh }), [continueAsGuest, loading, login, logout, providers, refresh, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthProvider;
