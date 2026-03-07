import React, { useEffect, useMemo, useState } from "react";
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

function toNum(v) {
  const s = String(v ?? "").replace(/,/g, "").trim();
  if (s === "") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function money(n) {
  return Number(n || 0).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function Purchase() {
  const nav = useNavigate();

  const emptyForm = {
    name: "",
    reference: "",
    barcode: "",
    price: "",
    cost: "",
    opening_stock: "",
    tax_type: "EXEMPT",
    tax_rate: "0",
  };

  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [rfqs, setRfqs] = useState([]);

  const [tab, setTab] = useState("products"); // products | suppliers | rfqs | rfq
  const [q, setQ] = useState("");

  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);

  const [stockInId, setStockInId] = useState(null);
  const [stockQty, setStockQty] = useState("");

  const [supForm, setSupForm] = useState({
    name: "",
    phone: "",
    email: "",
    kra_pin: "",
  });

  const [newRfqSupplier, setNewRfqSupplier] = useState("");
  const [activePO, setActivePO] = useState(null);
  const [poItems, setPoItems] = useState([]);
  const [poAdd, setPoAdd] = useState({ product_id: "", qty: "", cost: "" });

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const [pRes, sRes, rRes] = await Promise.all([
      api("/products"),
      api("/suppliers"),
      api("/purchase/rfqs"),
    ]);

    if (pRes.ok) setProducts(pRes.products || []);
    if (sRes.ok) setSuppliers(sRes.suppliers || []);
    if (rRes.ok) setRfqs(rRes.rfqs || []);
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return products;
    return products.filter((p) =>
      `${p.name} ${p.reference || ""} ${p.barcode || ""}`.toLowerCase().includes(s)
    );
  }, [products, q]);

  async function createOrUpdateProduct() {
    if (!form.name.trim()) return alert("Product name required");

    const price = toNum(form.price);
    const cost = toNum(form.cost);
    const stock = toNum(form.opening_stock);
    const taxRate = toNum(form.tax_rate);

    if (!Number.isFinite(price) || price < 0) return alert("Selling price invalid");
    if (!Number.isFinite(cost) || cost < 0) return alert("Cost invalid");
    if (!Number.isFinite(stock) || stock < 0) return alert("Opening stock invalid");
    if (!Number.isFinite(taxRate) || taxRate < 0) return alert("Tax rate invalid");

    const payload = {
      name: form.name.trim(),
      reference: form.reference.trim(),
      barcode: form.barcode.trim(),
      price,
      cost,
      stock,
      tax_type: form.tax_type,
      tax_rate: taxRate,
    };

    if (!editId) {
      const res = await api("/products", { method: "POST", body: payload });
      if (!res.ok) return alert(res.message);
      alert("Product created ✅");
    } else {
      // keep your working approach: soft delete then recreate
      const old = products.find((p) => p.id === editId);
      if (!old) return alert("Product to edit not found");

      await api(`/products/${editId}`, { method: "DELETE" });
      const res = await api("/products", { method: "POST", body: payload });
      if (!res.ok) return alert(res.message);
      alert("Updated (recreated) ✅");
      setEditId(null);
    }

    setForm(emptyForm);
    await loadAll();
  }

  function startEdit(p) {
    setEditId(p.id);
    setForm({
      name: p.name || "",
      reference: p.reference || "",
      barcode: p.barcode || "",
      price: String(p.price ?? ""),
      cost: String(p.cost ?? ""),
      opening_stock: String(p.stock ?? ""),
      tax_type: p.tax_type || "EXEMPT",
      tax_rate: String(p.tax_rate ?? "0"),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteProduct(id) {
    if (!confirm("Delete product?")) return;
    const res = await api(`/products/${id}`, { method: "DELETE" });
    if (!res.ok) return alert(res.message);
    await loadAll();
  }

  async function doStockIn() {
    const qty = toNum(stockQty);
    if (!stockInId) return alert("Select product");
    if (!Number.isFinite(qty) || qty <= 0) return alert("Enter stock quantity");

    const res = await api(`/products/${stockInId}/adjust-stock`, {
      method: "POST",
      body: { qty, note: "Stock In" },
    });

    if (!res.ok) return alert(res.message);

    alert("Stock added ✅");
    setStockInId(null);
    setStockQty("");
    await loadAll();
  }

  async function addSupplier() {
    if (!supForm.name.trim()) return alert("Supplier name required");
    const res = await api("/suppliers", { method: "POST", body: supForm });
    if (!res.ok) return alert(res.message);

    setSupForm({ name: "", phone: "", email: "", kra_pin: "" });
    await loadAll();
    alert("Supplier added ✅");
  }

  async function createRFQ() {
    const sid = newRfqSupplier ? Number(newRfqSupplier) : null;
    const res = await api("/purchase/rfqs", {
      method: "POST",
      body: { supplier_id: sid, note: "" },
    });
    if (!res.ok) return alert(res.message);

    await loadAll();
    alert("RFQ created ✅");
  }

  async function openRFQ(po_no) {
    const res = await api(`/purchase/rfqs/${encodeURIComponent(po_no)}`);
    if (!res.ok) return alert(res.message);

    setActivePO(res.po);
    setPoItems(res.items || []);
    setTab("rfq");
  }

  async function addRFQItem() {
    if (!activePO) return;
    const pid = Number(poAdd.product_id);
    const qty = toNum(poAdd.qty);
    const cost = toNum(poAdd.cost);

    if (!pid) return alert("Select product");
    if (!Number.isFinite(qty) || qty <= 0) return alert("Qty invalid");
    if (!Number.isFinite(cost) || cost < 0) return alert("Cost invalid");

    const res = await api(`/purchase/rfqs/${encodeURIComponent(activePO.po_no)}/add-item`, {
      method: "POST",
      body: { product_id: pid, qty, cost },
    });

    if (!res.ok) return alert(res.message);

    await openRFQ(activePO.po_no);
    setPoAdd({ product_id: "", qty: "", cost: "" });
  }

  async function confirmRFQ() {
    if (!activePO) return;

    const res = await api(`/purchase/rfqs/${encodeURIComponent(activePO.po_no)}/confirm`, {
      method: "POST",
    });
    if (!res.ok) return alert(res.message);

    await openRFQ(activePO.po_no);
    alert("Confirmed ✅");
  }

  async function receiveRFQ() {
    if (!activePO) return;

    const res = await api(`/purchase/rfqs/${encodeURIComponent(activePO.po_no)}/receive`, {
      method: "POST",
    });
    if (!res.ok) return alert(res.message);

    await openRFQ(activePO.po_no);
    await loadAll();
    alert("Stock received ✅");
  }

  function resetProductForm() {
    setEditId(null);
    setForm(emptyForm);
  }

  function openPrintWindow(html) {
    const w = window.open("", "_blank");
    if (!w) {
      alert("Popup blocked. Please allow popups and try again.");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  function printRFQ() {
    if (!activePO) return alert("Open an RFQ first");

    const supplier = suppliers.find((s) => Number(s.id) === Number(activePO.supplier_id)) || null;

    const rows = (poItems || [])
      .map(
        (i, idx) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #eee">${idx + 1}</td>
          <td style="padding:8px;border-bottom:1px solid #eee">
            <div style="font-weight:800">${i.product_name}</div>
            <div style="font-size:11px;opacity:.75">Barcode: ${i.barcode || "-"}</div>
          </td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${i.qty}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${money(i.cost)}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${money(i.subtotal)}</td>
        </tr>
      `
      )
      .join("");

    const total = poItems.reduce((s, i) => s + Number(i.subtotal || 0), 0);

    const html = `
      <html>
        <head>
          <title>${activePO.po_no} RFQ</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; background: #f2f4f8; }
            .page { max-width: 980px; margin: 18px auto; background: #fff; border-radius: 14px; box-shadow: 0 12px 30px rgba(0,0,0,.12); overflow: hidden; }
            .bar { background: linear-gradient(90deg,#0b5bd3,#2aa9ff); color: #fff; padding: 14px 18px; display:flex; justify-content:space-between; align-items:center; }
            .bar h1 { margin: 0; font-size: 18px; }
            .pad { padding: 16px 18px; }
            .box { border:1px solid #e6e6e6; border-radius: 12px; padding: 12px; }
            .grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
            table { width:100%; border-collapse:collapse; margin-top:12px; }
            th { background:#0b5bd3; color:#fff; text-align:left; padding:10px; font-size:12px; }
            .totals { margin-top:12px; display:flex; justify-content:flex-end; }
            .totals .card { width:320px; border:1px solid #e6e6e6; border-radius:12px; overflow:hidden; }
            .totals .row { display:flex; justify-content:space-between; padding:10px 12px; border-bottom:1px solid #eee; font-size:13px; }
            .totals .row:last-child { border-bottom:none; background:#0b5bd3; color:#fff; font-weight:900; }
            .muted { font-size:12px; opacity:.82; }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="bar">
              <h1>REQUEST FOR QUOTATION • ${activePO.po_no}</h1>
              <div class="muted">Status: <b>${activePO.status}</b> • Date: <b>${activePO.created_at || ""}</b></div>
            </div>

            <div class="pad">
              <div class="grid">
                <div class="box">
                  <div style="font-weight:900">Supplier</div>
                  <div class="muted">${supplier?.name || activePO.supplier_name || "No supplier"}</div>
                  <div class="muted">${supplier?.phone || ""}</div>
                  <div class="muted">${supplier?.kra_pin ? "Supplier PIN: " + supplier.kra_pin : ""}</div>
                </div>

                <div class="box">
                  <div style="font-weight:900">RFQ Details</div>
                  <div class="muted">RFQ No: ${activePO.po_no}</div>
                  <div class="muted">Status: ${activePO.status}</div>
                </div>
              </div>

              <table>
                <thead>
                  <tr>
                    <th style="width:50px">#</th>
                    <th>PRODUCT</th>
                    <th style="width:100px;text-align:right">QTY</th>
                    <th style="width:140px;text-align:right">COST</th>
                    <th style="width:160px;text-align:right">SUBTOTAL</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>

              <div class="totals">
                <div class="card">
                  <div class="row"><span>Total</span><span>KSh ${money(total)}</span></div>
                </div>
              </div>

              <script>window.onload=()=>window.print()</script>
            </div>
          </div>
        </body>
      </html>
    `;

    openPrintWindow(html);
  }

  function printGRN() {
    if (!activePO) return alert("Open an RFQ first");
    if (activePO.status !== "RECEIVED") return alert("GRN can be printed after stock is received");

    const supplier = suppliers.find((s) => Number(s.id) === Number(activePO.supplier_id)) || null;

    const rows = (poItems || [])
      .map(
        (i, idx) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #eee">${idx + 1}</td>
          <td style="padding:8px;border-bottom:1px solid #eee">
            <div style="font-weight:800">${i.product_name}</div>
            <div style="font-size:11px;opacity:.75">Barcode: ${i.barcode || "-"}</div>
          </td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${i.qty}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${money(i.cost)}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${money(i.subtotal)}</td>
        </tr>
      `
      )
      .join("");

    const total = poItems.reduce((s, i) => s + Number(i.subtotal || 0), 0);

    const html = `
      <html>
        <head>
          <title>${activePO.po_no} GRN</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; background: #f2f4f8; }
            .page { max-width: 980px; margin: 18px auto; background: #fff; border-radius: 14px; box-shadow: 0 12px 30px rgba(0,0,0,.12); overflow: hidden; }
            .bar { background: linear-gradient(90deg,#0b5bd3,#2aa9ff); color: #fff; padding: 14px 18px; display:flex; justify-content:space-between; align-items:center; }
            .bar h1 { margin: 0; font-size: 18px; }
            .pad { padding: 16px 18px; }
            .box { border:1px solid #e6e6e6; border-radius: 12px; padding: 12px; }
            .grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
            table { width:100%; border-collapse:collapse; margin-top:12px; }
            th { background:#0b5bd3; color:#fff; text-align:left; padding:10px; font-size:12px; }
            .totals { margin-top:12px; display:flex; justify-content:flex-end; }
            .totals .card { width:320px; border:1px solid #e6e6e6; border-radius:12px; overflow:hidden; }
            .totals .row { display:flex; justify-content:space-between; padding:10px 12px; border-bottom:1px solid #eee; font-size:13px; }
            .totals .row:last-child { border-bottom:none; background:#0b5bd3; color:#fff; font-weight:900; }
            .muted { font-size:12px; opacity:.82; }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="bar">
              <h1>GOODS RECEIVED NOTE • ${activePO.po_no}</h1>
              <div class="muted">Status: <b>${activePO.status}</b> • Date: <b>${activePO.created_at || ""}</b></div>
            </div>

            <div class="pad">
              <div class="grid">
                <div class="box">
                  <div style="font-weight:900">Supplier</div>
                  <div class="muted">${supplier?.name || activePO.supplier_name || "No supplier"}</div>
                  <div class="muted">${supplier?.phone || ""}</div>
                  <div class="muted">${supplier?.kra_pin ? "Supplier PIN: " + supplier.kra_pin : ""}</div>
                </div>

                <div class="box">
                  <div style="font-weight:900">GRN Details</div>
                  <div class="muted">Reference: ${activePO.po_no}</div>
                  <div class="muted">Status: ${activePO.status}</div>
                </div>
              </div>

              <table>
                <thead>
                  <tr>
                    <th style="width:50px">#</th>
                    <th>PRODUCT</th>
                    <th style="width:100px;text-align:right">QTY</th>
                    <th style="width:140px;text-align:right">COST</th>
                    <th style="width:160px;text-align:right">SUBTOTAL</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>

              <div class="totals">
                <div class="card">
                  <div class="row"><span>Total</span><span>KSh ${money(total)}</span></div>
                </div>
              </div>

              <script>window.onload=()=>window.print()</script>
            </div>
          </div>
        </body>
      </html>
    `;

    openPrintWindow(html);
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
        <div style={{ fontWeight: 900 }}>Broesta ERP • Purchase</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn" onClick={() => nav("/apps")}>Back</button>
          <button className="btn" onClick={() => nav("/company")}>Company</button>
          <button className="btn primary" onClick={() => nav("/pos")}>POS</button>
        </div>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <button className="btn" onClick={() => setTab("products")}>Products</button>
          <button className="btn" onClick={() => setTab("suppliers")}>Suppliers</button>
          <button className="btn" onClick={() => setTab("rfqs")}>RFQs</button>
        </div>

        {/* PRODUCTS */}
        {tab === "products" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 14 }}>
            <div style={{ background: "#fff", borderRadius: 16, padding: 14, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>
                {editId ? "Edit Product" : "Create Product"}
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                <input className="inp" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <input className="inp" placeholder="Reference" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
                <input className="inp" placeholder="Barcode (optional)" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
                <input className="inp" placeholder="Selling Price" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
                <input className="inp" placeholder="Cost Price" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label className="lbl">Tax Type</label>
                    <select
                      className="inp"
                      value={form.tax_type}
                      onChange={(e) => setForm({ ...form, tax_type: e.target.value })}
                    >
                      <option value="EXEMPT">Tax Exempt</option>
                      <option value="INCLUSIVE">Tax Inclusive</option>
                      <option value="EXCLUSIVE">Tax Exclusive</option>
                    </select>
                  </div>

                  <div>
                    <label className="lbl">Tax Rate %</label>
                    <input
                      className="inp"
                      type="number"
                      value={form.tax_rate}
                      onChange={(e) => setForm({ ...form, tax_rate: e.target.value })}
                      placeholder="e.g 16"
                    />
                  </div>
                </div>

                <input className="inp" placeholder="Opening Stock" value={form.opening_stock} onChange={(e) => setForm({ ...form, opening_stock: e.target.value })} />

                <button className="btn primary" onClick={createOrUpdateProduct}>
                  {editId ? "Update" : "Create"}
                </button>

                <button className="btn" onClick={resetProductForm}>
                  {editId ? "Cancel Edit" : "Reset Form"}
                </button>
              </div>

              <div style={{ marginTop: 14, borderTop: "1px solid #eee", paddingTop: 14 }}>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>Stock In</div>
                <select className="inp" value={stockInId || ""} onChange={(e) => setStockInId(e.target.value)}>
                  <option value="">Select product</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <input className="inp" placeholder="Qty to add" value={stockQty} onChange={(e) => setStockQty(e.target.value)} style={{ marginTop: 8 }} />
                <button className="btn" style={{ marginTop: 8 }} onClick={doStockIn}>Add Stock</button>
              </div>
            </div>

            <div style={{ background: "#fff", borderRadius: 16, padding: 14, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ fontWeight: 900 }}>Products</div>
                <input className="inp" placeholder="Search..." value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
              </div>

              <div style={{ marginTop: 12, maxHeight: 520, overflow: "auto", border: "1px solid #eee", borderRadius: 14, padding: 10 }}>
                {filtered.map((p) => (
                  <div key={p.id} style={{ padding: "10px 0", borderBottom: "1px dashed #eee", display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 900 }}>{p.name}</div>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>
                        Ref: {p.reference || "-"} • Barcode: {p.barcode || "-"} • Stock: {p.stock}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>
                        Price: {p.price} • Cost: {p.cost}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>
                        Tax: {p.tax_type || "EXEMPT"} {Number(p.tax_rate || 0) > 0 ? `(${p.tax_rate}%)` : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn" onClick={() => startEdit(p)}>Edit</button>
                      <button className="btn" onClick={() => deleteProduct(p.id)}>Delete</button>
                    </div>
                  </div>
                ))}
                {filtered.length === 0 && <div style={{ opacity: 0.75 }}>No products</div>}
              </div>
            </div>
          </div>
        )}

        {/* SUPPLIERS */}
        {tab === "suppliers" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 14 }}>
            <div style={{ background: "#fff", borderRadius: 16, padding: 14, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Add Supplier</div>
              <div style={{ display: "grid", gap: 10 }}>
                <input className="inp" placeholder="Name" value={supForm.name} onChange={(e) => setSupForm({ ...supForm, name: e.target.value })} />
                <input className="inp" placeholder="Phone" value={supForm.phone} onChange={(e) => setSupForm({ ...supForm, phone: e.target.value })} />
                <input className="inp" placeholder="Email" value={supForm.email} onChange={(e) => setSupForm({ ...supForm, email: e.target.value })} />
                <input className="inp" placeholder="KRA PIN (optional)" value={supForm.kra_pin} onChange={(e) => setSupForm({ ...supForm, kra_pin: e.target.value })} />
                <button className="btn primary" onClick={addSupplier}>Save Supplier</button>
              </div>
            </div>

            <div style={{ background: "#fff", borderRadius: 16, padding: 14, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
              <div style={{ fontWeight: 900 }}>Suppliers</div>
              <div style={{ marginTop: 12, maxHeight: 520, overflow: "auto", border: "1px solid #eee", borderRadius: 14, padding: 10 }}>
                {suppliers.map((s) => (
                  <div key={s.id} style={{ padding: "10px 0", borderBottom: "1px dashed #eee" }}>
                    <div style={{ fontWeight: 900 }}>{s.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                      {s.phone || ""} {s.kra_pin ? `• PIN: ${s.kra_pin}` : ""}
                    </div>
                  </div>
                ))}
                {suppliers.length === 0 && <div style={{ opacity: 0.75 }}>No suppliers</div>}
              </div>
            </div>
          </div>
        )}

        {/* RFQS LIST */}
        {tab === "rfqs" && (
          <div style={{ background: "#fff", borderRadius: 16, padding: 14, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontWeight: 900 }}>RFQs</div>
              <select className="inp" value={newRfqSupplier} onChange={(e) => setNewRfqSupplier(e.target.value)}>
                <option value="">(Optional) choose supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <button className="btn primary" onClick={createRFQ}>Create RFQ</button>
            </div>

            <div style={{ marginTop: 12, border: "1px solid #eee", borderRadius: 14, padding: 10, maxHeight: 520, overflow: "auto" }}>
              {rfqs.map((r) => (
                <div key={r.po_no} style={{ padding: "10px 0", borderBottom: "1px dashed #eee", display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>{r.po_no} • {r.status}</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                      {r.supplier_name || "No supplier"} • {r.created_at}
                    </div>
                  </div>
                  <button className="btn" onClick={() => openRFQ(r.po_no)}>Open</button>
                </div>
              ))}
              {rfqs.length === 0 && <div style={{ opacity: 0.75 }}>No RFQs yet</div>}
            </div>
          </div>
        )}

        {/* RFQ DETAIL */}
        {tab === "rfq" && activePO && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 14 }}>
            <div style={{ background: "#fff", borderRadius: 16, padding: 14, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
              <div style={{ fontWeight: 900 }}>{activePO.po_no} • {activePO.status}</div>
              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>
                Supplier: {activePO.supplier_name || "None"}
              </div>

              <div style={{ marginTop: 12, fontWeight: 900 }}>Add Item</div>
              <select className="inp" value={poAdd.product_id} onChange={(e) => setPoAdd({ ...poAdd, product_id: e.target.value })}>
                <option value="">Select product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <input className="inp" placeholder="Qty" value={poAdd.qty} onChange={(e) => setPoAdd({ ...poAdd, qty: e.target.value })} style={{ marginTop: 8 }} />
              <input className="inp" placeholder="Cost per item" value={poAdd.cost} onChange={(e) => setPoAdd({ ...poAdd, cost: e.target.value })} style={{ marginTop: 8 }} />
              <button className="btn primary" style={{ marginTop: 8 }} onClick={addRFQItem}>Add</button>

              <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                <button className="btn" onClick={() => setTab("rfqs")}>Back</button>
                <button className="btn" onClick={confirmRFQ} disabled={activePO.status !== "RFQ"}>Confirm</button>
                <button className="btn" onClick={receiveRFQ} disabled={activePO.status === "RECEIVED"}>Receive Stock</button>
                <button className="btn" onClick={printRFQ}>Print RFQ</button>
                <button className="btn" onClick={printGRN} disabled={activePO.status !== "RECEIVED"}>Print GRN</button>
              </div>

              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
                RFQ and GRN print in the same blue style as your invoice.
              </div>
            </div>

            <div style={{ background: "#fff", borderRadius: 16, padding: 14, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
              <div style={{ fontWeight: 900 }}>Items</div>
              <div style={{ marginTop: 12, border: "1px solid #eee", borderRadius: 14, padding: 10, maxHeight: 520, overflow: "auto" }}>
                {poItems.map((i) => (
                  <div key={i.id} style={{ padding: "10px 0", borderBottom: "1px dashed #eee" }}>
                    <div style={{ fontWeight: 900 }}>{i.product_name}</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                      Qty: {i.qty} • Cost: {i.cost} • Subtotal: {i.subtotal}
                    </div>
                  </div>
                ))}
                {poItems.length === 0 && <div style={{ opacity: 0.75 }}>No items</div>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}