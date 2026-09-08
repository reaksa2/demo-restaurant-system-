import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../stores/authStore";
import { Button, Input } from "../components/ui";
import { UtensilsCrossed } from "lucide-react";

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("authNotice");
    if (stored) {
      setNotice(stored);
      sessionStorage.removeItem("authNotice");
    }
  }, []);

  if (user) {
    navigate(user.role === "staff" ? "/staff/menu" : "/admin", {
      replace: true,
    });
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
      const dest = location.state?.from || "/admin";
      navigate(dest, { replace: true });
    } catch (err) {
      setError(err.response?.data?.detail || "Incorrect email or password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-ink text-marigold">
            <UtensilsCrossed size={20} />
          </div>
          <h1 className="font-display text-2xl text-ink">Menu System</h1>
          <p className="mt-1 text-sm text-slate">
            Sign in to manage your brand's menu
          </p>
        </div>

        {notice && (
          <div className="mb-4 rounded-md border border-marigold-light bg-marigold-light/40 px-4 py-3 text-sm text-marigold-dark">
            {notice}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-lg border border-sand bg-white p-6"
        >
          <Input
            label="Email"
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <Input
            label="Password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          {error && <p className="text-sm text-clay">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
