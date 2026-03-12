import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8080";
const token = () => localStorage.getItem("broesta_token");
const getUser = () => {
  try {
    return JSON.parse(localStorage.getItem("broesta_user") || "null");
  } catch {
    return null;
  }
};

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
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

export default function Security() {
  const nav = useNavigate();
  const me = getUser();

  const [users, setUsers] = useState([]);
  const [pwd, setPwd] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });

  const [form, setForm] = useState({
    username: "",
    password: "",
    full_name: "",
    role: "cashier",
    allowed_apps: ["pos"],
  });

  const [resetPwd, setResetPwd] = useState({});
  const appChoices = ["pos", "purchase", "sales", "inventory", "accounting", "website", "company", "security"];

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    if (me?.role !== "admin") return;
    const res = await api("/users");
    if (res.ok) setUsers(res.users || []);
  }

  async function changeMyPassword() {
    const res = await api("/auth/change-password", {
      method: "POST",
      body: pwd,
    });
    if (!res.ok) return alert(res.message);
    alert("Password changed successfully");
    setPwd({ current_password: "", new_password: "", confirm_password: "" });
  }

  function toggleApp(app) {
    const has = form.allowed_apps.includes(app);
    setForm({
      ...form,
      allowed_apps: has
        ? form.allowed_apps.filter((x) => x !== app)
        : [...form.allowed_apps, app],
    });
  }

  async function createUser() {
    const payload = {
      ...form,
      allowed_apps: form.role === "admin" ? "all" : form.allowed_apps,
    };

    const res = await api("/users", {
      method: "POST",
      body: payload,
    });

    if (!res.ok) return alert(res.message);
    alert("User created");
    setForm({
      username: "",
      password: "",
      full_name: "",
      role: "cashier",
      allowed_apps: ["pos"],
    });
    loadUsers();
  }

  async function resetUserPassword(id) {
    const new_password = resetPwd[id];
    if (!new_password || new_password.length < 4) return alert("Enter a password of at least 4 characters");

    const res = await api(`/users/${id}/reset-password`, {
      method: "POST",
      body: { new_password },
    });

    if (!res.ok) return alert(res.message);
    alert("Password reset successfully");
    setResetPwd({ ...resetPwd, [id]: "" });
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#eff6ff,#fdf2f8,#f0fdf4)", padding: 16 }}>
      <div
        style={{
          height: 64,
          background: "#111827",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 18px",
          borderRadius: 16,
        }}
      >
        <div style={{ fontWeight: 900 }}>Broesta ERP • Security</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn" onClick={() => nav("/apps")}>Back</button>
        </div>
      </div>

      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 16 }}>
        <div style={{ background: "#fff", borderRadius: 18, padding: 16, boxShadow: "0 10px 25px rgba(0,0,0,.06)" }}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>Change My Password</div>

          <input className="inp" placeholder="Current password" type="password" value={pwd.current_password} onChange={(e) => setPwd({ ...pwd, current_password: e.target.value })} />
          <input className="inp" placeholder="New password" type="password" value={pwd.new_password} onChange={(e) => setPwd({ ...pwd, new_password: e.target.value })} style={{ marginTop: 10 }} />
          <input className="inp" placeholder="Confirm new password" type="password" value={pwd.confirm_password} onChange={(e) => setPwd({ ...pwd, confirm_password: e.target.value })} style={{ marginTop: 10 }} />

          <button className="btn primary" style={{ marginTop: 12, width: "100%" }} onClick={changeMyPassword}>
            Save Password
          </button>
        </div>

        <div style={{ background: "#fff", borderRadius: 18, padding: 16, boxShadow: "0 10px 25px rgba(0,0,0,.06)" }}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>Create User</div>

          <input className="inp" placeholder="Full name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <input className="inp" placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} style={{ marginTop: 10 }} />
          <input className="inp" placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} style={{ marginTop: 10 }} />

          <select className="inp" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={{ marginTop: 10 }}>
            <option value="cashier">Cashier</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>

          {form.role !== "admin" && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Allowed Apps</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                {appChoices.map((a) => (
                  <label key={a} style={{ display: "flex", gap: 8, alignItems: "center", background: "#f8fafc", padding: 8, borderRadius: 10 }}>
                    <input
                      type="checkbox"
                      checked={form.allowed_apps.includes(a)}
                      onChange={() => toggleApp(a)}
                    />
                    <span style={{ textTransform: "capitalize" }}>{a}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <button className="btn primary" style={{ marginTop: 12, width: "100%" }} onClick={createUser}>
            Create User
          </button>
        </div>
      </div>

      <div style={{ marginTop: 16, background: "#fff", borderRadius: 18, padding: 16, boxShadow: "0 10px 25px rgba(0,0,0,.06)" }}>
        <div style={{ fontWeight: 900, marginBottom: 12 }}>Users</div>

        <div style={{ overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#2563eb", color: "#fff" }}>
                <th style={{ padding: 10, textAlign: "left" }}>Full Name</th>
                <th style={{ padding: 10, textAlign: "left" }}>Username</th>
                <th style={{ padding: 10, textAlign: "left" }}>Role</th>
                <th style={{ padding: 10, textAlign: "left" }}>Allowed Apps</th>
                <th style={{ padding: 10, textAlign: "left" }}>Reset Password</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{u.full_name || "-"}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{u.username}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eee", textTransform: "capitalize" }}>{u.role}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{u.allowed_apps}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        className="inp"
                        placeholder="new password"
                        type="password"
                        value={resetPwd[u.id] || ""}
                        onChange={(e) => setResetPwd({ ...resetPwd, [u.id]: e.target.value })}
                      />
                      <button className="btn" onClick={() => resetUserPassword(u.id)}>Reset</button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 12 }}>No users yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}