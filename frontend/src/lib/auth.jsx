import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { http } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data } = await http.get("/auth/me");
      setUser(data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    if (window.location.hash?.includes("session_id=")) {
      // AuthCallback will handle the session exchange and then run refresh via navigate state.
      setLoading(false);
      return;
    }
    refresh();
  }, [refresh]);

  const loginEmail = async (email, password) => {
    const { data } = await http.post("/auth/login", { email, password });
    localStorage.setItem("dw_token", data.token);
    setUser(data.user);
    return data.user;
  };

  const signupEmail = async (name, email, password) => {
    const { data } = await http.post("/auth/signup", { name, email, password });
    localStorage.setItem("dw_token", data.token);
    setUser(data.user);
    return data.user;
  };

  const loginGoogle = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/dashboard";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const logout = async () => {
    try { await http.post("/auth/logout"); } catch { /* noop */ }
    localStorage.removeItem("dw_token");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, refresh, loginEmail, signupEmail, loginGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
