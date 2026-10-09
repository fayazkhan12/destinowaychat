import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";

export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { loginEmail, signupEmail, loginGoogle } = useAuth();
  const [mode, setMode] = useState(params.get("mode") === "signup" ? "signup" : "login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") {
        await loginEmail(form.email, form.password);
        toast.success("Welcome back!");
      } else {
        if (!form.name) { toast.error("Please enter your name"); setBusy(false); return; }
        await signupEmail(form.name, form.email, form.password);
        toast.success("Account created!");
      }
      const redirect = params.get("redirect") || "/dashboard";
      navigate(redirect);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not sign in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card" data-testid="auth-card">
        <h1>{mode === "login" ? "Welcome back" : "Create your DestinoWay account"}</h1>
        <p>Save trips, manage bookings, and get a personal concierge.</p>
        <div className="auth-switch">
          <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")} data-testid="switch-login">Log in</button>
          <button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")} data-testid="switch-signup">Sign up</button>
        </div>
        <form className="auth-form" onSubmit={submit}>
          {mode === "signup" && (
            <input placeholder="Full name" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} data-testid="auth-name"/>
          )}
          <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} required data-testid="auth-email"/>
          <input type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({...form, password: e.target.value})} required minLength={6} data-testid="auth-password"/>
          <button className="auth-submit" type="submit" disabled={busy} data-testid="auth-submit">{busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}</button>
        </form>
        <div className="auth-divider">or continue with</div>
        <button className="google-btn" onClick={loginGoogle} data-testid="google-login">
          <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h5.9c-.3 1.5-1.1 2.7-2.3 3.6v2.9h3.7c2.2-2 3.4-5 3.4-8.7z"/><path fill="#34A853" d="M12 23c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.4 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v2.9C3.7 20.5 7.5 23 12 23z"/><path fill="#FBBC05" d="M5.6 13.7c-.2-.7-.3-1.4-.3-2.2s.1-1.5.3-2.2V6.4H1.8C1 7.9.5 9.6.5 11.5s.5 3.6 1.3 5.1l3.8-2.9z"/><path fill="#EA4335" d="M12 4.5c1.7 0 3.2.6 4.4 1.7l3.3-3.3C17.7 1.1 15.1 0 12 0 7.5 0 3.7 2.5 1.8 6.4l3.8 2.9c.9-2.7 3.4-4.8 6.4-4.8z"/></svg>
          Continue with Google
        </button>
      </div>
    </div>
  );
}
