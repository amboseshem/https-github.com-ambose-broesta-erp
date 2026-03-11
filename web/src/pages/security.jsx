import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8080";
const token = () => localStorage.getItem("broesta_token");

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, message: "Non-JSON response from server" };
  }
}

export default function Security() {
  const nav = useNavigate();

  const [form, setForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });

  async function changePassword() {
    const res = await api("/auth/change-password", {
      method: "POST",
      body: form,
    });

    if (!res.ok) return alert(res.message);
    alert("Password changed successfully ✅");
    setForm({
      current_password: "",
      new_password: "",
      confirm_password: "",
    });
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f4f6f9" }}>
      <div style={{
        height: 64, background: "#1e1e2f", color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px"
      }}>
        <div style={{ fontWeight: 900 }}>Broesta ERP • Security</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn" onClick={() => nav("/apps")}>Back</button>
        </div>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{
          maxWidth: 520, background: "#fff", borderRadius: 16, padding: 18,
          boxShadow: "0 10px 25px rgba(0,0,0,0.06)"
        }}>
          <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 12 }}>Change Admin Password</div>

          <div style={{ display: "grid", gap: 10 }}>
            <input
              className="inp"
              type="password"
              placeholder="Current Password"
              value={form.current_password}
              onChange={(e) => setForm({ ...form, current_password: e.target.value })}
            />
            <input
              className="inp"
              type="password"
              placeholder="New Password"
              value={form.new_password}
              onChange={(e) => setForm({ ...form, new_password: e.target.value })}
            />
            <input
              className="inp"
              type="password"
              placeholder="Confirm New Password"
              value={form.confirm_password}
              onChange={(e) => setForm({ ...form, confirm_password: e.target.value })}
            />
            <button className="btn primary" onClick={changePassword}>Save New Password</button>
          </div>
        </div>
      </div>
    </div>
  );
}