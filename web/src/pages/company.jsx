import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8080";
const token = () => localStorage.getItem("broesta_token");

async function api(path, { method="GET", body } = {}) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: {
      "Content-Type":"application/json",
      ...(token() ? { Authorization:`Bearer ${token()}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
}

export default function Company() {
  const nav = useNavigate();
  const [form, setForm] = useState({
    name:"", kra_pin:"", phone:"", email:"", location:"", po_box:"", receipt_footer:"", logo_url:""
  });

  useEffect(() => {
    (async () => {
      const res = await api("/company");
      if (res.ok) setForm(res.company);
    })();
  }, []);

  async function save() {
    const res = await api("/company", { method:"PUT", body: form });
    if (!res.ok) return alert(res.message);
    alert("Saved ✅");
    nav("/apps");
  }

  return (
    <div style={{ padding: 20, maxWidth: 720 }}>
      <h2>Company Settings</h2>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        {["name","kra_pin","phone","email","location","po_box","logo_url"].map((k) => (
          <div key={k}>
            <div style={{ fontWeight:800, marginBottom:6 }}>{k.replace("_"," ").toUpperCase()}</div>
            <input
              className="inp"
              value={form[k] || ""}
              onChange={(e)=>setForm({ ...form, [k]: e.target.value })}
            />
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ fontWeight:800, marginBottom:6 }}>RECEIPT FOOTER</div>
        <textarea
          className="inp"
          style={{ width:"100%", minHeight:80 }}
          value={form.receipt_footer || ""}
          onChange={(e)=>setForm({ ...form, receipt_footer: e.target.value })}
        />
      </div>

      <div style={{ display:"flex", gap:10, marginTop: 14 }}>
        <button className="btn" onClick={()=>nav("/apps")}>Back</button>
        <button className="btn primary" onClick={save}>Save</button>
      </div>
    </div>
  );
}