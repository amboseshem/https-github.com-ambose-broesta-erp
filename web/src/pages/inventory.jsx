import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8080";
const token = () => localStorage.getItem("broesta_token");

async function api(path) {
  const res = await fetch(API_BASE + path, {
    headers: { "Content-Type":"application/json", ...(token()?{Authorization:`Bearer ${token()}`}:{}) }
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { ok:false, message:"Non-JSON response" }; }
}
const money = (n)=>Number(n||0).toLocaleString("en-KE",{minimumFractionDigits:2,maximumFractionDigits:2});

export default function Inventory() {
  const nav = useNavigate();
  const [data, setData] = useState({ products: [], moves: [] });
  const [q, setQ] = useState("");

  useEffect(()=>{ load(); }, []);
  async function load(){
    const res = await api("/inventory/overview");
    if (!res.ok) return alert(res.message);
    setData({ products: res.products || [], moves: res.moves || [] });
  }

  const products = useMemo(()=>{
    const s = q.trim().toLowerCase();
    if(!s) return data.products;
    return data.products.filter(p => (`${p.name} ${p.barcode||""} ${p.reference||""}`).toLowerCase().includes(s));
  },[data.products,q]);

  const stockValue = useMemo(()=>{
    return products.reduce((s,p)=> s + Number(p.stock||0)*Number(p.cost||0), 0);
  },[products]);

  return (
    <div style={{ minHeight:"100vh", background:"#f4f6f9" }}>
      <div style={{ height:64, background:"#1e1e2f", color:"#fff", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 18px" }}>
        <div style={{ fontWeight:900 }}>Broesta ERP • Inventory</div>
        <div style={{ display:"flex", gap:10 }}>
          <button className="btn" onClick={()=>nav("/apps")}>Back</button>
          <button className="btn" onClick={()=>nav("/sales")}>Sales</button>
          <button className="btn primary" onClick={()=>nav("/purchase")}>Purchase</button>
        </div>
      </div>

      <div style={{ padding:16, display:"grid", gridTemplateColumns:"1.3fr 1fr", gap:14 }}>
        <div style={{ background:"#fff", borderRadius:16, padding:14, boxShadow:"0 10px 25px rgba(0,0,0,0.06)" }}>
          <div style={{ display:"flex", gap:10, alignItems:"center" }}>
            <div style={{ fontWeight:900 }}>Stock On Hand</div>
            <input className="inp" placeholder="Search product..." value={q} onChange={(e)=>setQ(e.target.value)} style={{ flex:1 }} />
            <button className="btn" onClick={load}>Refresh</button>
          </div>

          <div style={{ marginTop:10, fontSize:12, opacity:0.8 }}>
            Stock Valuation (cost): <b>KSh {money(stockValue)}</b>
          </div>

          <div style={{ marginTop:12, maxHeight:540, overflow:"auto", border:"1px solid #eee", borderRadius:14, padding:10 }}>
            {products.map(p=>(
              <div key={p.id} style={{ padding:"10px 0", borderBottom:"1px dashed #eee", display:"flex", justifyContent:"space-between", gap:10 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:900 }}>{p.name}</div>
                  <div style={{ fontSize:12, opacity:0.8 }}>
                    Stock: <b>{p.stock}</b> • Ref: {p.reference||"-"} • Barcode: {p.barcode||"-"}
                  </div>
                </div>
                <div style={{ textAlign:"right", fontSize:12, opacity:0.85 }}>
                  <div>Price: {money(p.price)}</div>
                  <div>Cost: {money(p.cost)}</div>
                </div>
              </div>
            ))}
            {products.length===0 && <div style={{ opacity:0.75 }}>No products</div>}
          </div>
        </div>

        <div style={{ background:"#fff", borderRadius:16, padding:14, boxShadow:"0 10px 25px rgba(0,0,0,0.06)" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div style={{ fontWeight:900 }}>Recent Stock Moves</div>
            <button className="btn" onClick={load}>Refresh</button>
          </div>

          <div style={{ marginTop:12, maxHeight:600, overflow:"auto", border:"1px solid #eee", borderRadius:14, padding:10 }}>
            {data.moves.map(m=>(
              <div key={m.id} style={{ padding:"10px 0", borderBottom:"1px dashed #eee" }}>
                <div style={{ fontWeight:900 }}>{m.move_type} • {m.ref}</div>
                <div style={{ fontSize:12, opacity:0.8 }}>
                  {m.product_name || "Product"} • Qty: <b>{m.qty}</b> • {m.created_at || ""}
                </div>
                {m.note && <div style={{ fontSize:12, opacity:0.7 }}>{m.note}</div>}
              </div>
            ))}
            {data.moves.length===0 && <div style={{ opacity:0.75 }}>No moves yet</div>}
          </div>
        </div>
      </div>
    </div>
  );
}