import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8080";
const token = () => localStorage.getItem("broesta_token");

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
  const looksLikeHtml = text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html");

  if (looksLikeHtml) {
    return { ok: false, message: `Server returned HTML (wrong route / 404 / auth). Path: ${path}` };
  }

  try {
    const data = JSON.parse(text);
    if (!res.ok && data && typeof data === "object") {
      return { ok: false, message: data.message || `HTTP ${res.status}`, ...data };
    }
    return data;
  } catch {
    return { ok: false, message: `Non-JSON response. HTTP ${res.status}. Path: ${path}. Body: ${text.slice(0, 120)}` };
  }
}

async function apiAuthGet(path) {
  const t = token();
  const res = await fetch(API_BASE + path, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${t}`,
      "Content-Type": "application/json",
    },
  });

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, message: "Non-JSON response from server" };
  }
}

const money = (n) =>
  Number(n || 0).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function openPrintWindow(html) {
  const w = window.open("", "_blank");
  if (!w) return alert("Popup blocked. Allow popups then try again.");
  w.document.open();
  w.document.write(html);
  w.document.close();
}

async function makeQrDataUrl(text) {
  return await QRCode.toDataURL(text, { margin: 1, width: 160 });
}

function lineVat(item) {
  const subtotal = Number(item.subtotal || 0);
  const taxType = item.tax_type || "EXEMPT";
  const taxRate = Number(item.tax_rate || 0);

  if (taxType === "EXEMPT" || taxRate <= 0) return 0;
  if (taxType === "INCLUSIVE") return subtotal - subtotal / (1 + taxRate / 100);
  if (taxType === "EXCLUSIVE") return subtotal * (taxRate / 100);
  return 0;
}

export default function Sales() {
  const nav = useNavigate();

  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);

  const [quotes, setQuotes] = useState([]);
  const [orders, setOrders] = useState([]);

  const [tab, setTab] = useState("quotes");
  const [selectedQuoteNo, setSelectedQuoteNo] = useState("");
  const [quote, setQuote] = useState(null);
  const [quoteItems, setQuoteItems] = useState([]);

  const [selectedSoNo, setSelectedSoNo] = useState("");
  const [order, setOrder] = useState(null);
  const [orderItems, setOrderItems] = useState([]);

  const [newQuoteCustomer, setNewQuoteCustomer] = useState("");
  const [addItem, setAddItem] = useState({ product_id: "", qty: "", price: "" });

  const [lastDn, setLastDn] = useState("");
  const [lastInv, setLastInv] = useState("");

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const [cRes, pRes, qRes, oRes] = await Promise.all([
      api("/customers"),
      api("/products"),
      api("/sales/quotes"),
      api("/sales/orders"),
    ]);
    if (cRes.ok) setCustomers(cRes.customers || []);
    if (pRes.ok) setProducts(pRes.products || []);
    if (qRes.ok) setQuotes(qRes.quotes || []);
    if (oRes.ok) setOrders(oRes.orders || []);
  }

  async function openQuote(no) {
    const res = await api(`/sales/quotes/${encodeURIComponent(no)}`);
    if (!res.ok) return alert(res.message);
    setSelectedQuoteNo(no);
    setQuote(res.quote);
    setQuoteItems(res.items || []);
    setTab("quotes");
  }

  async function openOrder(no) {
    const res = await api(`/sales/orders/${encodeURIComponent(no)}`);
    if (!res.ok) return alert(res.message);
    setSelectedSoNo(no);
    setOrder(res.order);
    setOrderItems(res.items || []);
    setTab("orders");
  }

  async function createQuote() {
    const cid = newQuoteCustomer ? Number(newQuoteCustomer) : null;
    const res = await api("/sales/quotes", { method: "POST", body: { customer_id: cid, note: "" } });
    if (!res.ok) return alert(res.message);
    await loadAll();
    alert("Quotation created ✅ " + res.quote_no);
    openQuote(res.quote_no);
  }

  async function addQuoteItem() {
    if (!selectedQuoteNo) return alert("Open a quotation first");

    const pid = Number(addItem.product_id);
    const qty = Number(addItem.qty);
    const price = Number(addItem.price);

    if (!pid) return alert("Select product");
    if (!Number.isFinite(qty) || qty <= 0) return alert("Qty invalid");
    if (!Number.isFinite(price) || price < 0) return alert("Price invalid");

    const res = await api(`/sales/quotes/${encodeURIComponent(selectedQuoteNo)}/add-item`, {
      method: "POST",
      body: { product_id: pid, qty, price },
    });

    if (!res.ok) return alert(res.message);

    await openQuote(selectedQuoteNo);
    setAddItem({ product_id: "", qty: "", price: "" });
  }

  async function confirmQuote() {
    if (!selectedQuoteNo) return;
    const res = await api(`/sales/quotes/${encodeURIComponent(selectedQuoteNo)}/confirm`, { method: "POST" });
    if (!res.ok) return alert(res.message);
    await loadAll();
    alert("Confirmed ✅ Sales Order: " + res.so_no);
    openOrder(res.so_no);
  }

  async function deliverOrder() {
    if (!selectedSoNo) return;
    const res = await api(`/sales/orders/${encodeURIComponent(selectedSoNo)}/deliver`, { method: "POST" });
    if (!res.ok) return alert(res.message);
    await loadAll();
    alert("Delivered ✅ DN: " + res.dn_no);
    setLastDn(res.dn_no);
    openOrder(selectedSoNo);
  }

  async function invoiceOrder() {
    if (!selectedSoNo) return;
    const res = await api(`/sales/orders/${encodeURIComponent(selectedSoNo)}/invoice`, { method: "POST" });
    if (!res.ok) return alert(res.message);
    alert(`Invoice posted ✅ ${res.inv_no}  Total: KSh ${money(res.total)}  (DN: ${res.dn_no})`);
    setLastInv(res.inv_no);
    await loadAll();
    openOrder(selectedSoNo);
  }

  function companyBlock(company) {
    if (!company) return "";
    const logo = company.logo_url
      ? `<img src="${company.logo_url}" style="height:54px;object-fit:contain" />`
      : "";

    return `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px">
        <div style="display:flex;gap:12px;align-items:center">
          ${logo}
          <div>
            <div style="font-size:18px;font-weight:900">${company.name || "BROESTA ERP"}</div>
            <div style="font-size:12px;opacity:.85">${company.location || ""}</div>
            <div style="font-size:12px;opacity:.85">Tel: ${company.phone || ""} • P.O Box: ${company.po_box || ""}</div>
            <div style="font-size:12px;opacity:.85"><b>Seller PIN:</b> ${company.kra_pin || ""}</div>
          </div>
        </div>
        <div style="text-align:right;font-size:12px;opacity:.85">
          ${company.email ? `<div>${company.email}</div>` : ""}
        </div>
      </div>
    `;
  }

  async function printDN(dnNo) {
    if (!dnNo) return alert("No Delivery Note number");
    const data = await apiAuthGet(`/sales/dn/${encodeURIComponent(dnNo)}`);
    if (!data.ok) return alert(data.message);

    const { dn, items, company } = data;
    const qr = await makeQrDataUrl(`DN:${dn.dn_no}|SO:${dn.so_no}|DATE:${dn.created_at}`);

    const rows = (items || [])
      .map((it, idx) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #eee">${idx + 1}</td>
          <td style="padding:8px;border-bottom:1px solid #eee">
            <div style="font-weight:800">${it.product_name}</div>
            <div style="font-size:11px;opacity:.75">
              Ref: ${it.reference || "-"} • Barcode: ${it.barcode || "-"}
            </div>
          </td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${it.qty}</td>
        </tr>
      `)
      .join("");

    const html = `
    <html><head><title>${dn.dn_no}</title>
      <style>
        body{font-family:Arial;margin:0;background:#f2f4f8}
        .page{max-width:900px;margin:18px auto;background:#fff;border-radius:14px;box-shadow:0 12px 30px rgba(0,0,0,.12);overflow:hidden}
        .bar{background:linear-gradient(90deg,#0b5bd3,#2aa9ff);color:#fff;padding:14px 18px;display:flex;justify-content:space-between;align-items:center}
        .bar h1{margin:0;font-size:18px;letter-spacing:.3px}
        .pad{padding:16px 18px}
        table{width:100%;border-collapse:collapse}
        th{background:#0b5bd3;color:#fff;text-align:left;padding:10px;font-size:12px}
        .box{border:1px solid #e6e6e6;border-radius:12px;padding:12px}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .muted{font-size:12px;opacity:.82}
        .mini{font-size:11px;opacity:.78}
      </style>
    </head><body>
      <div class="page">
        <div class="bar">
          <h1>DELIVERY NOTE • ${dn.dn_no}</h1>
          <div class="muted">Order: <b>${dn.so_no}</b> • Date: <b>${dn.created_at}</b></div>
        </div>

        <div class="pad">
          ${companyBlock(company)}

          <div style="height:12px"></div>

          <div class="grid">
            <div class="box">
              <div style="font-weight:900">Delivery To</div>
              <div class="muted">${dn.customer_name || "Walk-in Customer"}</div>
              <div class="muted"><b>Buyer PIN:</b> ${dn.customer_kra_pin || "-"}</div>
            </div>

            <div class="box" style="display:flex;justify-content:space-between;align-items:center;gap:12px">
              <div>
                <div style="font-weight:900">Tracking QR</div>
                <div class="mini">Scan to verify DN details</div>
              </div>
              <img src="${qr}" style="width:130px;height:130px" />
            </div>
          </div>

          <div style="height:12px"></div>

          <table>
            <thead>
              <tr>
                <th style="width:50px">#</th>
                <th>PRODUCT</th>
                <th style="width:120px;text-align:right">DELIVERED</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>

          <script>window.onload=()=>window.print()</script>
        </div>
      </div>
    </body></html>`;

    openPrintWindow(html);
  }

  async function printInvoice(invNo) {
    if (!invNo) return alert("No Invoice number");
    const data = await apiAuthGet(`/sales/invoices/${encodeURIComponent(invNo)}`);
    if (!data.ok) return alert(data.message);

    const { inv, so, items, company } = data;
    const qr = await makeQrDataUrl(`INV:${inv.inv_no}|DN:${inv.dn_no}|TOTAL:${inv.total}`);

    const rows = (items || [])
      .map((it, idx) => {
        const vat = lineVat(it);
        return `
          <tr>
            <td style="padding:8px;border-bottom:1px solid #eee">${idx + 1}</td>
            <td style="padding:8px;border-bottom:1px solid #eee">
              <div style="font-weight:800">${it.product_name}</div>
              <div style="font-size:11px;opacity:.75">
                Ref: ${it.reference || "-"} • Barcode: ${it.barcode || "-"} • Tax: ${it.tax_type || "EXEMPT"}${Number(it.tax_rate || 0) > 0 ? ` (${it.tax_rate}%)` : ""}
              </div>
            </td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${it.qty}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${money(it.price)}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${money(vat)}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${money(it.subtotal)}</td>
          </tr>
        `;
      })
      .join("");

    const totalVat = (items || []).reduce((s, it) => s + lineVat(it), 0);
    const subtotal = Number(inv.total || 0) - totalVat;

    const html = `
    <html><head><title>${inv.inv_no}</title>
      <style>
        body{font-family:Arial;margin:0;background:#f2f4f8}
        .page{max-width:980px;margin:18px auto;background:#fff;border-radius:14px;box-shadow:0 12px 30px rgba(0,0,0,.12);overflow:hidden}
        .bar{background:linear-gradient(90deg,#0b5bd3,#2aa9ff);color:#fff;padding:14px 18px;display:flex;justify-content:space-between;align-items:center}
        .bar h1{margin:0;font-size:18px;letter-spacing:.3px}
        .pad{padding:16px 18px}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .box{border:1px solid #e6e6e6;border-radius:12px;padding:12px}
        .muted{font-size:12px;opacity:.82}
        table{width:100%;border-collapse:collapse;margin-top:12px}
        th{background:#0b5bd3;color:#fff;text-align:left;padding:10px;font-size:12px}
        .totals{margin-top:12px;display:flex;justify-content:flex-end}
        .totals .card{width:340px;border:1px solid #e6e6e6;border-radius:12px;overflow:hidden}
        .totals .row{display:flex;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #eee;font-size:13px}
        .totals .row:last-child{border-bottom:none;background:#0b5bd3;color:#fff;font-weight:900}
        .mini{font-size:11px;opacity:.78}
      </style>
    </head><body>
      <div class="page">
        <div class="bar">
          <h1>TAX INVOICE • ${inv.inv_no}</h1>
          <div class="muted">SO: <b>${so?.so_no || "-"}</b> • DN: <b>${inv.dn_no}</b> • Date: <b>${inv.created_at}</b></div>
        </div>

        <div class="pad">
          ${companyBlock(company)}

          <div style="height:12px"></div>

          <div class="grid">
            <div class="box">
              <div style="font-weight:900">Bill To</div>
              <div class="muted">${inv.customer_name || "Walk-in Customer"}</div>
              <div class="muted"><b>Buyer PIN:</b> ${inv.customer_kra_pin || "-"}</div>
            </div>

            <div class="box" style="display:flex;justify-content:space-between;align-items:center;gap:12px">
              <div>
                <div style="font-weight:900">Invoice QR</div>
                <div class="mini">Scan to verify invoice details</div>
              </div>
              <img src="${qr}" style="width:130px;height:130px" />
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width:50px">#</th>
                <th>DESCRIPTION</th>
                <th style="width:90px;text-align:right">QTY</th>
                <th style="width:120px;text-align:right">UNIT PRICE</th>
                <th style="width:110px;text-align:right">VAT</th>
                <th style="width:140px;text-align:right">AMOUNT</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>

          <div class="totals">
            <div class="card">
              <div class="row"><span>Subtotal</span><span>KSh ${money(subtotal)}</span></div>
              <div class="row"><span>VAT</span><span>KSh ${money(totalVat)}</span></div>
              <div class="row"><span>Total</span><span>KSh ${money(inv.total)}</span></div>
            </div>
          </div>

          <script>window.onload=()=>window.print()</script>
        </div>
      </div>
    </body></html>`;

    openPrintWindow(html);
  }

  const quoteTotal = useMemo(() => quoteItems.reduce((s, i) => s + Number(i.subtotal || 0), 0), [quoteItems]);
  const orderTotal = useMemo(() => orderItems.reduce((s, i) => s + Number(i.subtotal || 0), 0), [orderItems]);

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
        <div style={{ fontWeight: 900 }}>Broesta ERP • Sales</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn" onClick={() => nav("/apps")}>Back</button>
          <button className="btn" onClick={() => nav("/inventory")}>Inventory</button>
        </div>
      </div>

      <div style={{ padding: 16, display: "grid", gridTemplateColumns: "1.1fr 1.4fr", gap: 14 }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 14, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
            <button className="btn" onClick={() => setTab("quotes")}>Quotations</button>
            <button className="btn" onClick={() => setTab("orders")}>Sales Orders</button>
          </div>

          {tab === "quotes" && (
            <>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <select className="inp" value={newQuoteCustomer} onChange={(e) => setNewQuoteCustomer(e.target.value)} style={{ flex: 1 }}>
                  <option value="">(Optional) choose customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button className="btn primary" onClick={createQuote}>New</button>
              </div>

              <div style={{ marginTop: 12, maxHeight: 520, overflow: "auto", border: "1px solid #eee", borderRadius: 14, padding: 10 }}>
                {quotes.map((q) => (
                  <div key={q.quote_no} style={{ padding: "10px 0", borderBottom: "1px dashed #eee", display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 900 }}>{q.quote_no} • {q.status}</div>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>{q.customer_name || "No customer"} • {q.created_at}</div>
                    </div>
                    <button className="btn" onClick={() => openQuote(q.quote_no)}>Open</button>
                  </div>
                ))}
                {quotes.length === 0 && <div style={{ opacity: 0.75 }}>No quotations yet</div>}
              </div>
            </>
          )}

          {tab === "orders" && (
            <div style={{ marginTop: 6, maxHeight: 560, overflow: "auto", border: "1px solid #eee", borderRadius: 14, padding: 10 }}>
              {orders.map((o) => (
                <div key={o.so_no} style={{ padding: "10px 0", borderBottom: "1px dashed #eee", display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>{o.so_no} • {o.status}</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>{o.customer_name || "No customer"} • {o.created_at}</div>
                  </div>
                  <button className="btn" onClick={() => openOrder(o.so_no)}>Open</button>
                </div>
              ))}
              {orders.length === 0 && <div style={{ opacity: 0.75 }}>No sales orders yet</div>}
            </div>
          )}
        </div>

        <div style={{ background: "#fff", borderRadius: 16, padding: 14, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
          {tab === "quotes" && quote && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>{quote.quote_no} • {quote.status}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>{quote.customer_name || "No customer selected"}</div>
                </div>
                <button className="btn primary" onClick={confirmQuote} disabled={quote.status !== "DRAFT"}>
                  Confirm → Sales Order
                </button>
              </div>

              <div style={{ marginTop: 12, fontWeight: 900 }}>Add Item</div>
              <div style={{ display: "grid", gridTemplateColumns: "1.6fr .6fr .8fr .6fr", gap: 8, marginTop: 8 }}>
                <select className="inp" value={addItem.product_id} onChange={(e) => setAddItem({ ...addItem, product_id: e.target.value })}>
                  <option value="">Select product</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <input className="inp" placeholder="Qty" value={addItem.qty} onChange={(e) => setAddItem({ ...addItem, qty: e.target.value })} />
                <input className="inp" placeholder="Price" value={addItem.price} onChange={(e) => setAddItem({ ...addItem, price: e.target.value })} />
                <button className="btn" onClick={addQuoteItem}>Add</button>
              </div>

              <div style={{ marginTop: 12, border: "1px solid #eee", borderRadius: 14, padding: 10, maxHeight: 420, overflow: "auto" }}>
                {quoteItems.map((i) => (
                  <div key={i.id} style={{ padding: "10px 0", borderBottom: "1px dashed #eee", display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 900 }}>{i.product_name}</div>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>
                        {i.qty} × {money(i.price)} = {money(i.subtotal)}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>{i.barcode || ""}</div>
                  </div>
                ))}
                {quoteItems.length === 0 && <div style={{ opacity: 0.75 }}>No items</div>}
              </div>

              <div style={{ marginTop: 10, fontWeight: 950, fontSize: 18 }}>Total: KSh {money(quoteTotal)}</div>
            </>
          )}

          {tab === "orders" && order && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>{order.so_no} • {order.status}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>{order.customer_name || "No customer"}</div>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button className="btn" onClick={deliverOrder} disabled={order.status !== "CONFIRMED"}>
                    Deliver (DN)
                  </button>
                  <button className="btn primary" onClick={invoiceOrder} disabled={order.status !== "DELIVERED"}>
                    Invoice
                  </button>
                  <button className="btn" onClick={() => printDN(lastDn)} disabled={!lastDn}>
                    Print DN
                  </button>
                  <button className="btn" onClick={() => printInvoice(lastInv)} disabled={!lastInv}>
                    Print Invoice
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 12, border: "1px solid #eee", borderRadius: 14, padding: 10, maxHeight: 480, overflow: "auto" }}>
                {orderItems.map((i) => (
                  <div key={i.id} style={{ padding: "10px 0", borderBottom: "1px dashed #eee", display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 900 }}>{i.product_name}</div>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>
                        {i.qty} × {money(i.price)} = {money(i.subtotal)}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>{i.barcode || ""}</div>
                  </div>
                ))}
                {orderItems.length === 0 && <div style={{ opacity: 0.75 }}>No items</div>}
              </div>

              <div style={{ marginTop: 10, fontWeight: 950, fontSize: 18 }}>Total: KSh {money(orderTotal)}</div>
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                Rule: Stock reduces ONLY after Delivery Note. Invoice allowed only after Delivery.
              </div>
            </>
          )}

          {!quote && tab === "quotes" && <div style={{ opacity: 0.8 }}>Open a quotation to view details.</div>}
          {!order && tab === "orders" && <div style={{ opacity: 0.8 }}>Open a sales order to view details.</div>}
        </div>
      </div>
    </div>
  );
}