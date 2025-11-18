// src/components/Navbar.jsx
import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";

const LogoSVG = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M10.5 13.5a3 3 0 004.24 0l1.06-1.06" stroke="white" strokeWidth="1.6" />
    <path d="M13.5 10.5a3 3 0 00-4.24 0L8.2 11.76" stroke="white" strokeWidth="1.6" />
  </svg>
);

export default function Navbar() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  // SAFE parse currentUser
  let user = null;
  try {
    const raw = localStorage.getItem("currentUser");
    user = raw ? JSON.parse(raw) : null;
  } catch (err) {
    localStorage.removeItem("currentUser");
    user = null;
  }
  const auth = localStorage.getItem("isAuthenticated") === "true";

  const logout = () => {
    localStorage.removeItem("currentUser");
    localStorage.removeItem("isAuthenticated");
    localStorage.removeItem("token");
    setOpen(false);
    nav("/login");
  };

  // close on outside click / escape
  useEffect(() => {
    function onDocClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function onEsc(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  return (
    <nav className="top-nav">
      <div className="container nav-inner" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div className="logo-box" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="logo-badge" aria-hidden>
              <LogoSVG />
            </div>
            <span className="brand">Shortify</span>
          </div>

          <Link to="/" className="nav-link">
            Home
          </Link>

          {auth && (
            <Link to="/dashboard" className="nav-link">
              Dashboard
            </Link>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {!auth ? (
            <Link className="btn-login" to="/login">
              Login
            </Link>
          ) : (
            <div ref={dropdownRef} style={{ position: "relative" }}>
              <button
                className="profile-btn"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="true"
                aria-expanded={open}
              >
                <img
                  src={user?.avatar_url || `https://api.dicebear.com/6.x/identicon/svg?seed=${encodeURIComponent(user?.email || "guest")}`}
                  alt="avatar"
                  className="profile-avatar"
                />
                <span className="profile-email">{user?.name || user?.email}</span>
              </button>

              {open && (
                <div className="profile-dropdown" role="menu">
                  <Link to="/profile" onClick={() => setOpen(false)} className="profile-item">
                    Profile
                  </Link>

                  <Link to="/dashboard" onClick={() => setOpen(false)} className="profile-item">
                    Dashboard
                  </Link>

                  {user?.role === "admin" && (
                    <Link to="/dashboard?view=admin" onClick={() => setOpen(false)} className="profile-item">
                      Admin Panel
                    </Link>
                  )}

                  <button onClick={logout} className="profile-item profile-logout">
                    Logout
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
