import React, { useEffect, useMemo, useState } from "react";
import { Routes, Route, useNavigate, Navigate } from "react-router-dom";
import POS from "./pages/POS.jsx";
import Purchase from "./pages/Purchase.jsx";
import Sales from "./pages/sales.jsx";
import Inventory from "./pages/inventory.jsx";
import Accounting from "./pages/accounting.jsx";
import Barcode from "./pages/barcode.jsx";
import Website from "./pages/website.jsx";
import Company from "./pages/Company.jsx";
import PublicShop from "./pages/PublicShop.jsx";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8080";

// ================= API =================
function getToken() {
  return localStorage.getItem("broesta_token");
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
  return res.json();
}

// ================= AUTH WRAPPER =================
function RequireAuth({ children }) {
  const token = getToken();
  if (!token) return <Navigate to="/" />;
  return children;
}

// ================= LOGIN =================
function Login() {
  const nav = useNavigate();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("1234");

  async function login() {
    const res = await api("/auth/login", {
      method: "POST",
      body: { username, password },
    });

    if (!res.ok) return alert(res.message);

    localStorage.setItem("broesta_token", res.token);
    nav("/apps");
  }

  return (
    <div style={styles.center}>
      <div style={styles.card}>
        <h2>Broesta ERP Login</h2>
        <input style={styles.input} value={username} onChange={e => setUsername(e.target.value)} />
        <input style={styles.input} type="password" value={password} onChange={e => setPassword(e.target.value)} />
        <button style={styles.btnPrimary} onClick={login}>Login</button>
      </div>
    </div>
  );
}

// ================= DASHBOARD =================
function AppsDashboard() {
  const nav = useNavigate();

  const apps = useMemo(() => ([
    { id: "pos", name: "Point of Sale", icon: "🛒", color: "#CFE3FF" },
    { id: "purchase", name: "Purchase", icon: "📦", color: "#D9FBE4" },
    { id: "sales", name: "Sales", icon: "💰", color: "#FFE1F0" },
    { id: "inventory", name: "Inventory", icon: "📊", color: "#E8F8FF" },
    { id: "accounting", name: "Accounting", icon: "📒", color: "#FFF3CD" },
    { id: "website", name: "Website", icon: "🌐", color: "#F1F1F1" }
  ]), []);

  return (
    <div style={{ padding: 20 }}>
      <h2>Applications</h2>

      <div style={styles.grid}>
        {apps.map(a => (
          <div
            key={a.id}
            style={{ ...styles.tile, background: a.color }}
            onClick={() => nav("/" + a.id)}
          >
            <div style={{ fontSize: 30 }}>{a.icon}</div>
            <div style={{ fontWeight: "bold" }}>{a.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ================= MAIN =================
export default function App() {
 return (
  <Routes>
    <Route path="/" element={<Login />} />
    <Route path="/apps" element={<RequireAuth><AppsDashboard /></RequireAuth>} />
    <Route path="/pos" element={<RequireAuth><POS /></RequireAuth>} />
    <Route path="/purchase" element={<RequireAuth><Purchase /></RequireAuth>} />
    <Route path="/sales" element={<RequireAuth><Sales /></RequireAuth>} />
    <Route path="/inventory" element={<RequireAuth><Inventory /></RequireAuth>} />
    <Route path="/accounting" element={<RequireAuth><Accounting /></RequireAuth>} />
    <Route path="/barcode" element={<RequireAuth><Barcode /></RequireAuth>} />
    <Route path="/website" element={<RequireAuth><Website /></RequireAuth>} />
    <Route path="/company" element={<RequireAuth><Company /></RequireAuth>} />
    <Route path="/shop" element={<PublicShop />} />
  </Routes>
);
}

// ================= STYLES =================
const styles = {
  center: {
    height: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f4f6f9"
  },
  card: {
    background: "#fff",
    padding: 20,
    borderRadius: 12,
    width: 300,
    boxShadow: "0 10px 30px rgba(0,0,0,0.1)"
  },
  input: {
    width: "100%",
    padding: 10,
    marginTop: 10,
    borderRadius: 6,
    border: "1px solid #ccc"
  },
  btnPrimary: {
    width: "100%",
    marginTop: 15,
    padding: 10,
    background: "#007bff",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer"
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
    gap: 15,
    marginTop: 20
  },
  tile: {
    padding: 20,
    borderRadius: 12,
    textAlign: "center",
    cursor: "pointer",
    boxShadow: "0 8px 20px rgba(0,0,0,0.08)"
  }
};