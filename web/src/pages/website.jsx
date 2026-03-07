import React, { useEffect, useState } from "react";
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

function money(n) {
  return Number(n || 0).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function Website() {
  const nav = useNavigate();

  const [form, setForm] = useState({
    store_name: "",
    hero_title: "",
    hero_subtitle: "",
    about_text: "",
    whatsapp: "",
    facebook: "",
    instagram: "",
    tiktok: "",
    logo_url: "",
    banner_url: "",
    theme_color: "#0b5bd3",
    contact_phone: "",
    contact_email: "",
    contact_location: "",
  });

  const [orders, setOrders] = useState([]);
  const [tab, setTab] = useState("editor");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const [sRes, oRes] = await Promise.all([
      api("/website/settings"),
      api("/website/orders"),
    ]);

    if (sRes.ok) setForm(sRes.settings || form);
    if (oRes.ok) setOrders(oRes.orders || []);
  }

  async function save() {
    const res = await api("/website/settings", { method: "PUT", body: form });
    if (!res.ok) return alert(res.message);
    alert("Website saved ✅");
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f4f6f9" }}>
      <div
        style={{
          height: 64,
          background: "#1e1e2f",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 18px",
        }}
      >
        <div style={{ fontWeight: 900 }}>Broesta ERP • Website Admin</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn" onClick={() => nav("/apps")}>Back</button>
          <button className="btn" onClick={() => window.open("/shop", "_blank")}>Open Shop</button>
          <button className="btn primary" onClick={save}>Save</button>
        </div>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <button className="btn" onClick={() => setTab("editor")}>Editor</button>
          <button className="btn" onClick={() => setTab("orders")}>Online Orders</button>
        </div>

        {tab === "editor" && (
          <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
            <div style={{ display: "grid", gap: 10 }}>
              <input className="inp" placeholder="Store Name" value={form.store_name} onChange={(e) => setForm({ ...form, store_name: e.target.value })} />
              <input className="inp" placeholder="Hero Title" value={form.hero_title} onChange={(e) => setForm({ ...form, hero_title: e.target.value })} />
              <input className="inp" placeholder="Hero Subtitle" value={form.hero_subtitle} onChange={(e) => setForm({ ...form, hero_subtitle: e.target.value })} />
              <textarea className="inp" placeholder="About Text" value={form.about_text} onChange={(e) => setForm({ ...form, about_text: e.target.value })} style={{ minHeight: 100 }} />
              <input className="inp" placeholder="Logo URL" value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} />
              <input className="inp" placeholder="Banner URL" value={form.banner_url} onChange={(e) => setForm({ ...form, banner_url: e.target.value })} />
              <input className="inp" placeholder="Theme Color" value={form.theme_color} onChange={(e) => setForm({ ...form, theme_color: e.target.value })} />
              <input className="inp" placeholder="WhatsApp" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
              <input className="inp" placeholder="Phone" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} />
              <input className="inp" placeholder="Email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
              <input className="inp" placeholder="Location" value={form.contact_location} onChange={(e) => setForm({ ...form, contact_location: e.target.value })} />
            </div>
          </div>
        )}

        {tab === "orders" && (
          <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
            <div style={{ fontWeight: 900, marginBottom: 12 }}>Online Orders</div>
            <div style={{ display: "grid", gap: 10 }}>
              {orders.map((o) => (
                <div key={o.order_no} style={{ borderBottom: "1px dashed #eee", paddingBottom: 10 }}>
                  <div style={{ fontWeight: 900 }}>{o.order_no} • {o.status}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    {o.customer_name} • {o.customer_phone} • {o.created_at}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    Total: KSh {money(o.total)} • {o.delivery_location || "-"}
                  </div>
                </div>
              ))}
              {orders.length === 0 && <div style={{ opacity: 0.75 }}>No online orders yet</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}