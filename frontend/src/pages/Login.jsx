import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  async function handleLogin(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);

    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || "http://localhost:3000"}/api/auth/login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Invalid credentials");
        setLoading(false);
        return;
      }

      // Save login session
      localStorage.setItem("token", data.token);
      localStorage.setItem("currentUser", JSON.stringify(data.user));
      localStorage.setItem("isAuthenticated", "true");

      navigate("/");
    } catch {
      setErr("Server error. Try again later.");
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg,#fbfeff,#f6fbff)",
        fontFamily: "Poppins, sans-serif",
      }}
    >
      <div style={{ width: "92%", maxWidth: "420px", margin: "0 auto" }}>
        <h1
          style={{
            fontSize: "38px",
            fontWeight: "700",
            marginBottom: "8px",
          }}
        >
          Welcome Back
        </h1>

        <p style={{ color: "#64748b", marginBottom: "28px" }}>
          Sign in to access your dashboard
        </p>

        <form
          onSubmit={handleLogin}
          style={{
            background: "white",
            padding: "32px",
            borderRadius: "18px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
            border: "1px solid rgba(0,0,0,0.05)",
          }}
        >
          <label style={{ fontWeight: "600", fontSize: "15px" }}>Email</label>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              width: "100%",
              marginTop: "6px",
              marginBottom: "18px",
              padding: "14px 16px",
              borderRadius: "12px",
              border: "1px solid #dbe0e6",
              background: "#f8fafc",
              outline: "none",
              fontSize: "15px",
            }}
          />

          <label style={{ fontWeight: "600", fontSize: "15px" }}>
            Password
          </label>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              width: "100%",
              marginTop: "6px",
              marginBottom: "22px",
              padding: "14px 16px",
              borderRadius: "12px",
              border: "1px solid #dbe0e6",
              background: "#f8fafc",
              outline: "none",
              fontSize: "15px",
            }}
          />

          {err && (
            <p
              style={{
                color: "red",
                fontSize: "14px",
                marginBottom: "12px",
                textAlign: "center",
              }}
            >
              {err}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "14px 0",
              borderRadius: "12px",
              background:
                "linear-gradient(90deg, var(--accent-start), var(--accent-end))",
              border: "none",
              color: "white",
              fontWeight: "700",
              fontSize: "16px",
              cursor: "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Signing In..." : "Sign In"}
          </button>

          <p
            style={{
              textAlign: "center",
              marginTop: "20px",
              fontSize: "14px",
            }}
          >
            Don't have an account?{" "}
            <Link
              to="/signup"
              style={{
                fontWeight: "600",
                color: "var(--accent-end)",
              }}
            >
              Sign up
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
