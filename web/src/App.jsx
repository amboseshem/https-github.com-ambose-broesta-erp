import React, { useEffect, useMemo, useState } from "react";
import { Routes, Route, useNavigate, Navigate } from "react-router-dom";
import POS from "./pages/POS.jsx";
import Purchase from "./pages/Purchase.jsx";
import Sales from "./pages/sales.jsx";
import Inventory from "./pages/inventory.jsx";
import Accounting from "./pages/accounting.jsx";
import Barcode from "./pages/barcode.jsx";
import Website from "./pages/website.jsx";
import Company from "./pages/company.jsx";
import PublicShop from "./pages/PublicShop.jsx";
import Security from "./pages/security.jsx";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8080";

function getToken() {
  return localStorage.getItem("broesta_token");
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem("broesta_user") || "null");
  } catch {
    return null;
  }
}

function logoutNow() {
  localStorage.removeItem("broesta_token");
  localStorage.removeItem("broesta_user");
  window.location.href = "/";
}

async function api(path, { method = "GET", body } = {}) {
  const token = getToken();
  const res = await fetch(API_BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, message: "Server returned non-JSON response" };
  }
}

function hasAppAccess(user, appName) {
  if (!user) return false;
  if (user.role === "admin") return true;
  const apps = String(user.allowed_apps || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

  return apps.includes("all") || apps.includes(String(appName || "").toLowerCase());
}

function RequireAuth({ children }) {
  const token = getToken();
  if (!token) return <Navigate to="/" />;
  return children;
}

function RequireApp({ app, children }) {
  const token = getToken();
  const user = getUser();

  if (!token) return <Navigate to="/" />;
  if (!hasAppAccess(user, app)) return <Navigate to="/apps" />;
  return children;
}

function Login() {
  const nav = useNavigate();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("1234");
  const [loading, setLoading] = useState(false);

  async function login() {
    setLoading(true);
    const res = await api("/auth/login", {
      method: "POST",
      body: { username, password },
    });
    setLoading(false);

    if (!res.ok) return alert(res.message || "Login failed");

    localStorage.setItem("broesta_token", res.token);
    localStorage.setItem("broesta_user", JSON.stringify(res.user || null));
    nav("/apps");
  }

  return (
    <div style={styles.loginWrap}>
      <div style={styles.overlay} />
      <div style={styles.card}>
        <h2 style={{ marginTop: 0, marginBottom: 18 }}>Broesta ERP Login</h2>
        <input style={styles.input} value={username} onChange={(e) => setUsername(e.target.value)} />
        <input style={styles.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button style={styles.btnPrimary} onClick={login} disabled={loading}>
          {loading ? "Signing in..." : "Login"}
        </button>
      </div>
    </div>
  );
}

function AppsDashboard() {
  const nav = useNavigate();
  const user = getUser();

  const apps = useMemo(() => {
    const all = [
      { id: "pos", name: "Point of Sale", icon: "🛒", color: "#dbeafe" },
      { id: "purchase", name: "Purchase", icon: "📦", color: "#dcfce7" },
      { id: "sales", name: "Sales", icon: "💰", color: "#fce7f3" },
      { id: "inventory", name: "Inventory", icon: "📊", color: "#cffafe" },
      { id: "accounting", name: "Accounting", icon: "📒", color: "#fef3c7" },
      { id: "website", name: "Website", icon: "🌐", color: "#ede9fe" },
      { id: "company", name: "Company", icon: "🏢", color: "#fee2e2" },
      { id: "security", name: "Security", icon: "🔐", color: "#e0e7ff" },
    ];

    return all.filter((a) => hasAppAccess(user, a.id));
  }, [user]);

  return (
    <div style={styles.pageWrap}>
      <div style={styles.topBar}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 20 }}>Applications</div>
          <div style={{ fontSize: 13, opacity: 0.85 }}>
            Logged in as {user?.full_name || user?.username || "User"} • {user?.role || ""}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn" onClick={logoutNow}>Logout</button>
        </div>
      </div>

      <div style={styles.grid}>
        {apps.map((a) => (
          <div
            key={a.id}
            style={{ ...styles.tile, background: a.color }}
            onClick={() => nav("/" + a.id)}
          >
            <div style={{ fontSize: 34 }}>{a.icon}</div>
            <div style={{ fontWeight: 900, fontSize: 16 }}>{a.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />

      <Route path="/apps" element={<RequireAuth><AppsDashboard /></RequireAuth>} />

      <Route path="/pos" element={<RequireApp app="pos"><POS /></RequireApp>} />
      <Route path="/purchase" element={<RequireApp app="purchase"><Purchase /></RequireApp>} />
      <Route path="/sales" element={<RequireApp app="sales"><Sales /></RequireApp>} />
      <Route path="/inventory" element={<RequireApp app="inventory"><Inventory /></RequireApp>} />
      <Route path="/accounting" element={<RequireApp app="accounting"><Accounting /></RequireApp>} />
      <Route path="/barcode" element={<RequireApp app="inventory"><Barcode /></RequireApp>} />
      <Route path="/website" element={<RequireApp app="website"><Website /></RequireApp>} />
      <Route path="/company" element={<RequireApp app="company"><Company /></RequireApp>} />
      <Route path="/security" element={<RequireApp app="security"><Security /></RequireApp>} />
      <Route path="/shop" element={<PublicShop />} />
    </Routes>
  );
}

const styles = {
  loginWrap: {
    height: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background:
      "linear-gradient(135deg, #0f172a 0%, #1d4ed8 35%, #06b6d4 70%, #f472b6 100%)",
    position: "relative",
    overflow: "hidden",
  },
  overlay: {
    position: "absolute",
    inset: 0,
    background: "rgba(255,255,255,0.08)",
    backdropFilter: "blur(8px)",
  },
  card: {
    position: "relative",
    background: "rgba(255,255,255,0.95)",
    padding: 24,
    borderRadius: 20,
    width: 340,
    boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
  },
  input: {
    width: "100%",
    padding: 12,
    marginTop: 10,
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    boxSizing: "border-box",
  },
  btnPrimary: {
    width: "100%",
    marginTop: 16,
    padding: 12,
    background: "linear-gradient(90deg,#2563eb,#06b6d4)",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 800,
  },
  pageWrap: {
    minHeight: "100vh",
    padding: 20,
    background:
      "linear-gradient(135deg,#f8fafc 0%,#e0f2fe 35%,#fae8ff 70%,#fef3c7 100%)",
  },
  topBar: {
    background: "rgba(255,255,255,0.9)",
    borderRadius: 18,
    padding: 18,
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: 16,
    marginTop: 20,
  },
  tile: {
    padding: 22,
    borderRadius: 18,
    textAlign: "center",
    cursor: "pointer",
    boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
    transition: "0.2s ease",
  },
};