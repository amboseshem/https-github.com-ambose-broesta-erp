import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import JsBarcode from "jsbarcode";

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

export default function Barcode() {
  const nav = useNavigate();
  const [products, setProducts] = useState([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(null);
  const [qty, setQty] = useState(12);
  const svgRef = useRef(null);

  useEffect(()=>{ load(); }, []);
  async function load() {
    const res = await api("/products");
    if (!res.ok) return alert(res.message);
    setProducts(res.products || []);
  }

  const filtered = useMemo(()=>{
    const s = q.trim().toLowerCase();
    if(!s) return products;
    return products.filter(p => (`${p.name} ${p.barcode||""} ${p.reference||""}`).toLowerCase().includes(s));
  },[products,q]);

  useEffect(()=>{
    if(!selected || !svgRef.current) return;
    const code = String(selected.barcode || "").trim();
    if(!code) return;

    JsBarcode(svgRef.current, code, {
      format: "CODE128",
      width: 2,
      height: 60,
      displayValue: true,
      margin: 0,
    });
  },[selected]);

  function printLabels() {
    if(!selected) return alert("Select a product");
    const copies = Math.max(1, Number(qty||1));

    const html = `
      <html><head><title>Barcode Labels</title>
      <style>
        body{ font-family: Arial; padding:10px; }
        .grid{ display:grid; grid-template-columns: repeat(3, 1fr); gap:10px; }
        .lab{ border:1px solid #ddd; border-radius:10px; padding:8px; }
        .name{ font-weight:800; font-size:12px; }
        .price{ font-size:12px; margin-top:4px; }
        svg{ width:100%; height:70px; }
      </style>
      </head><body>
      <div class="grid">
        ${Array.from({length: copies}).map(()=>`
          <div class="lab">
            <div class="name">${selected.name}</div>
            <div class="price">KSh ${money(selected.price)}</div>
            <div>${document.getElementById("barcodePreview").innerHTML}</div>
          </div>
        `).join("")}
      </div>
      <script>window.onload=()=>window.print()</script>
      </body></html>
    `;
    const w = window.open("", "_blank");
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  return (
    <div style={{ minHeight:"100vh", background:"#f4f6f9" }}>
      <div style={{ height:64, background:"#1e1e2f", color:"#fff", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 18px" }}>
        <div style={{ fontWeight:900 }}>Broesta ERP • Barcode Labels</div>
        <div style={{ display:"flex", gap:10 }}>
          <button className="btn" onClick={()=>nav("/apps")}>Back</button>
          <button className="btn" onClick={()=>nav("/purchase")}>Purchase</button>
        </div>
      </div>

      <div style={{ padding:16, display:"grid", gridTemplateColumns:"1.2fr 1fr", gap:14 }}>
        <div style={{ background:"#fff", borderRadius:16, padding:14, boxShadow:"0 10px 25px rgba(0,0,0,0.06)" }}>
          <div style={{ display:"flex", gap:10, alignItems:"center" }}>
            <div style={{ fontWeight:900 }}>Products</div>
            <input className="inp" placeholder="Search..." value={q} onChange={(e)=>setQ(e.target.value)} style={{ flex:1 }} />
            <button className="btn" onClick={load}>Refresh</button>
          </div>

          <div style={{ marginTop:12, maxHeight:600, overflow:"auto", border:"1px solid #eee", borderRadius:14, padding:10 }}>
            {filtered.map(p=>(
              <div key={p.id} style={{ padding:"10px 0", borderBottom:"1px dashed #eee", display:"flex", justifyContent:"space-between", gap:10 }}>
                <div>
                  <div style={{ fontWeight:900 }}>{p.name}</div>
                  <div style={{ fontSize:12, opacity:0.8 }}>Barcode: {p.barcode || "-"} • Ref: {p.reference || "-"}</div>
                </div>
                <button className="btn" onClick={()=>setSelected(p)}>Select</button>
              </div>
            ))}
            {filtered.length===0 && <div style={{ opacity:0.75 }}>No products</div>}
          </div>
        </div>

        <div style={{ background:"#fff", borderRadius:16, padding:14, boxShadow:"0 10px 25px rgba(0,0,0,0.06)" }}>
          <div style={{ fontWeight:900 }}>Preview</div>

          {!selected && <div style={{ marginTop:12, opacity:0.8 }}>Select a product to generate barcode.</div>}

          {selected && (
            <>
              <div style={{ marginTop:10, fontWeight:900 }}>{selected.name}</div>
              <div style={{ fontSize:12, opacity:0.8 }}>Price: KSh {money(selected.price)} • Barcode: {selected.barcode}</div>

              <div id="barcodePreview" style={{ marginTop:12, border:"1px solid #eee", borderRadius:14, padding:10 }}>
                <svg ref={svgRef}></svg>
              </div>

              <div style={{ display:"flex", gap:10, alignItems:"center", marginTop:12 }}>
                <div style={{ fontWeight:800 }}>Labels</div>
                <input className="inp" type="number" value={qty} onChange={(e)=>setQty(e.target.value)} style={{ width:120 }} />
                <button className="btn primary" onClick={printLabels}>Print</button>
              </div>

              <div style={{ marginTop:8, fontSize:12, opacity:0.75 }}>
                Tip: Use sticker paper for supermarket shelves.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}