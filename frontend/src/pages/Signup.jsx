import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export default function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  async function handleSignup(e) {
    e.preventDefault();
    setErr("");

    if (password !== confirm) {
      setErr("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || "http://localhost:3000"}/api/auth/signup`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setErr(data.error || "Signup failed");
        setLoading(false);
        return;
      }

      // Success → move to login
      navigate("/login");
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
          Create Account
        </h1>

        <p style={{ color: "#64748b", marginBottom: "28px" }}>
          Join Shortify — start shortening your URLs
        </p>

        <form
          onSubmit={handleSignup}
          style={{
            background: "white",
            padding: "32px",
            borderRadius: "18px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
            border: "1px solid rgba(0,0,0,0.05)",
          }}
        >
          {/* NAME */}
          <label style={{ fontWeight: "600", fontSize: "15px" }}>Full Name</label>
          <input
            type="text"
            placeholder="John Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={{
              width: "100%",
              marginTop: "6px",
              marginBottom: "18px",
              padding: "14px 16px",
              borderRadius: "12px",
              background: "#f8fafc",
              border: "1px solid #dbe0e6",
              fontSize: "15px",
              outline: "none",
            }}
          />

          {/* EMAIL */}
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
              background: "#f8fafc",
              border: "1px solid #dbe0e6",
              fontSize: "15px",
              outline: "none",
            }}
          />

          {/* PASSWORD */}
          <label style={{ fontWeight: "600", fontSize: "15px" }}>Password</label>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              width: "100%",
              marginTop: "6px",
              marginBottom: "18px",
              padding: "14px 16px",
              borderRadius: "12px",
              background: "#f8fafc",
              border: "1px solid #dbe0e6",
              fontSize: "15px",
              outline: "none",
            }}
          />

          {/* CONFIRM PASSWORD */}
          <label style={{ fontWeight: "600", fontSize: "15px" }}>
            Confirm Password
          </label>
          <input
            type="password"
            placeholder="••••••••"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            style={{
              width: "100%",
              marginTop: "6px",
              marginBottom: "22px",
              padding: "14px 16px",
              borderRadius: "12px",
              background: "#f8fafc",
              border: "1px solid #dbe0e6",
              fontSize: "15px",
              outline: "none",
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
            {loading ? "Creating Account..." : "Create Account"}
          </button>

          <p style={{ textAlign: "center", marginTop: "20px", fontSize: "14px" }}>
            Already have an account?{" "}
            <Link style={{ fontWeight: "600", color: "var(--accent-end)" }} to="/login">
              Sign In
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
