import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8080";

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

  // prevent "Unexpected token <" errors
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, message: "Server returned non-JSON response" };
  }
}

function money(n) {
  const x = Number(n || 0);
  return x.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function safe(n) {
  const x = Number(n || 0);
  return Number.isFinite(x) ? x : 0;
}

function openPrintWindow(html) {
  const w = window.open("", "_blank", "width=420,height=700");
  if (!w) return alert("Popup blocked. Allow popups then try again.");

  w.document.open();
  w.document.write(`
    <html>
      <head>
        <title>Receipt</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 14px; }
          .r { max-width: 380px; margin: 0 auto; }
          h3 { margin: 0; }
          .muted { opacity: .75; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          td { padding: 6px 0; font-size: 13px; vertical-align: top; }
          .line { border-top: 1px dashed #888; margin: 10px 0; }
          .right { text-align: right; }
          .center { text-align:center; }
          img { max-width: 150px; }
        </style>
      </head>
      <body>
        ${html}
        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
    </html>
  `);
  w.document.close();
}

export default function POS() {
  const nav = useNavigate();

  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [company, setCompany] = useState(null);

  const [q, setQ] = useState("");
  const [barcode, setBarcode] = useState("");

  const [cart, setCart] = useState([]);

  const [customerId, setCustomerId] = useState("");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [paymentRef, setPaymentRef] = useState("");
  const [amountPaid, setAmountPaid] = useState("");

  const [receipt, setReceipt] = useState(null);
  const [receiptQr, setReceiptQr] = useState("");

  const [reprintNo, setReprintNo] = useState("");
  const [recentReceipts, setRecentReceipts] = useState([]);

  // new customer modal
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [newCust, setNewCust] = useState({ name: "", phone: "", kra_pin: "" });

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const [pRes, cRes, coRes, rRes] = await Promise.all([
      api("/products"),
      api("/customers"),
      api("/company"),
      api("/pos/receipts?limit=30"),
    ]);

    if (pRes.ok) setProducts(pRes.products || []);
    if (cRes.ok) setCustomers(cRes.customers || []);
    if (coRes.ok) setCompany(coRes.company || null);
    if (rRes.ok) setRecentReceipts(rRes.receipts || []);
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return products;
    return products.filter((p) =>
      `${p.name} ${p.reference || ""} ${p.barcode || ""}`.toLowerCase().includes(s)
    );
  }, [products, q]);

  function cartQty(pid) {
    const it = cart.find((x) => x.id === pid);
    return it ? it.qty : 0;
  }

  function addToCart(p) {
    const inCart = cartQty(p.id);
    const stock = safe(p.stock);

    if (stock <= 0) return alert("Out of stock");
    if (inCart + 1 > stock) return alert("Insufficient stock");

    const existing = cart.find((x) => x.id === p.id);
    if (existing) {
      setCart(cart.map((x) => (x.id === p.id ? { ...x, qty: x.qty + 1 } : x)));
    } else {
      setCart([
        ...cart,
        {
  id: p.id,
  name: p.name,
  barcode: p.barcode || "",
  price: safe(p.price),
  qty: 1,
  tax_type: p.tax_type || "EXEMPT",
  tax_rate: safe(p.tax_rate),
},
      ]);
    }
  }

  function removeItem(pid) {
    setCart((prev) => prev.filter((x) => x.id !== pid));
  }

  function changeQty(pid, delta) {
    const p = products.find((x) => x.id === pid);
    const stock = safe(p?.stock);

    setCart((prev) => {
      const it = prev.find((x) => x.id === pid);
      if (!it) return prev;

      const nextQty = it.qty + delta;
      if (nextQty <= 0) return prev.filter((x) => x.id !== pid);
      if (nextQty > stock) {
        alert("Insufficient stock");
        return prev;
      }
      return prev.map((x) => (x.id === pid ? { ...x, qty: nextQty } : x));
    });
  }

  function total() {
    return cart.reduce((s, x) => s + x.qty * x.price, 0);
  }

  function scanEnter(e) {
    if (e.key !== "Enter") return;
    const code = barcode.trim();
    setBarcode("");
    if (!code) return;

    const p = products.find((x) => String(x.barcode || "").trim() === code);
    if (!p) return alert("Barcode not found: " + code);
    addToCart(p);
  }

  async function completeSale() {
    const t = Number(total().toFixed(2));
    if (cart.length === 0) return alert("Cart is empty");

    const paid = safe(amountPaid);
    if (paid < t) return alert("Money less than total");

    if (paymentMode !== "Cash" && paymentRef.trim().length < 2) {
      return alert("Reference code required for " + paymentMode);
    }

    const payload = {
      items: cart.map((x) => ({ product_id: x.id, qty: x.qty, price: x.price })),
      customer_id: customerId ? Number(customerId) : null,
      payment_mode: paymentMode,
      payment_ref: paymentMode === "Cash" ? "" : paymentRef.trim(),
      amount_paid: paid,
    };

    const res = await api("/pos/complete-sale", { method: "POST", body: payload });
    if (!res.ok) return alert(res.message);

    const change = Number((paid - t).toFixed(2));
    const receiptNo = res.result.receipt_no;

    // get buyer pin from customer list (if selected)
    const buyer = customerId ? customers.find((c) => Number(c.id) === Number(customerId)) : null;

    const r = {
      receipt_no: receiptNo,
      created_at: new Date().toLocaleString(),
      payment_mode: paymentMode,
      payment_ref: paymentMode === "Cash" ? "" : paymentRef.trim(),
      amount_paid: paid,
      total: t,
      change_given: change,
      seller_pin: company?.kra_pin || "",
      buyer_pin: buyer?.kra_pin || "",
      items: cart.map((x) => ({
  name: x.name,
  barcode: x.barcode,
  qty: x.qty,
  price: x.price,
  tax_type: x.tax_type || "EXEMPT",
  tax_rate: safe(x.tax_rate),
  subtotal: Number((x.qty * x.price).toFixed(2)),
})),
    };

    setReceipt(r);

    // generate QR for tracking (public endpoint)
    const qrUrl = `${API_BASE}/public/receipt/${encodeURIComponent(receiptNo)}`;
    try {
      const dataUrl = await QRCode.toDataURL(qrUrl, { margin: 1, width: 180 });
      setReceiptQr(dataUrl);
    } catch {
      setReceiptQr("");
    }

    // reset
    setCart([]);
    setAmountPaid("");
    setPaymentRef("");
    setCustomerId("");

    await loadAll();
  }

  async function loadReprint(no) {
    const res = await api(`/pos/receipt/${encodeURIComponent(no)}`);
    if (!res.ok) return alert(res.message);

    // also generate QR again
    const qrUrl = `${API_BASE}/public/receipt/${encodeURIComponent(res.sale.receipt_no)}`;
    try {
      const dataUrl = await QRCode.toDataURL(qrUrl, { margin: 1, width: 180 });
      setReceiptQr(dataUrl);
    } catch {
      setReceiptQr("");
    }

    setReceipt({
      receipt_no: res.sale.receipt_no,
      created_at: res.sale.created_at,
      payment_mode: res.sale.payment_mode,
      payment_ref: res.sale.payment_ref,
      total: res.sale.total,
      amount_paid: res.sale.amount_paid,
      change_given: res.sale.change_given,
      seller_pin: res.company?.kra_pin || company?.kra_pin || "",
      buyer_pin: res.sale?.customer_kra_pin || "",
      items: (res.items || []).map((i) => ({
        name: i.name,
        barcode: i.barcode,
        qty: i.qty,
        price: i.price,
        subtotal: i.subtotal,
      })),
    });
  }

  async function createCustomer() {
    if (!newCust.name.trim()) return alert("Customer name required");
    const res = await api("/customers", { method: "POST", body: newCust });
    if (!res.ok) return alert(res.message);

    setShowCustomerModal(false);
    setNewCust({ name: "", phone: "", kra_pin: "" });

    await loadAll();
    alert("Customer created ✅");
  }

  function buildReceiptHtml(r) {
    const shop = company?.name || "BROESTA";
    const sellerPin = r.seller_pin || company?.kra_pin || "";
    const buyerPin = r.buyer_pin || "";

    const phone = company?.phone ? `Tel: ${company.phone}` : "";
    const loc = company?.location ? company.location : "";
    const footer = company?.receipt_footer || "Thank you for shopping with us!";

    const itemsRows = (r.items || [])
      .map(
        (i) => `
        <tr>
          <td>
            <b>${i.name}</b><br/>
            <span class="muted">${i.barcode || ""}</span><br/>
            <span class="muted">${i.qty} x ${Number(i.price).toFixed(2)}</span>
          </td>
          <td class="right"><b>${Number(i.subtotal).toFixed(2)}</b></td>
        </tr>
      `
      )
      .join("");

    const qrBlock = receiptQr
      ? `<div class="center"><div class="muted">Scan QR to verify receipt</div><img src="${receiptQr}" /></div>`
      : "";

    return `
      <div class="r">
        <h3>${shop}</h3>
        ${sellerPin ? `<div class="muted">SELLER PIN: ${sellerPin}</div>` : ""}
        ${buyerPin ? `<div class="muted">BUYER PIN: ${buyerPin}</div>` : ""}
        <div class="muted">${phone}</div>
        <div class="muted">${loc}</div>

        <div class="line"></div>

        <div class="muted">Receipt: <b>${r.receipt_no}</b></div>
        <div class="muted">Date: ${r.created_at || ""}</div>
        <div class="muted">Payment: ${r.payment_mode}${r.payment_ref ? " (" + r.payment_ref + ")" : ""}</div>

        <table>${itemsRows}</table>

        <div class="line"></div>

        <table>
          <tr><td><b>TOTAL</b></td><td class="right"><b>${Number(r.total).toFixed(2)}</b></td></tr>
          <tr><td>PAID</td><td class="right">${Number(r.amount_paid).toFixed(2)}</td></tr>
          <tr><td>CHANGE</td><td class="right">${Number(r.change_given ?? 0).toFixed(2)}</td></tr>
        </table>

        <div class="line"></div>
        ${qrBlock}
        <div class="line"></div>

        <div class="muted center">${footer}</div>
      </div>
    `;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f4f6f9" }}>
      {/* TOP BAR */}
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
        <div style={{ fontWeight: 900 }}>Broesta ERP • POS</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn" onClick={() => nav("/apps")}>Back</button>
          <button className="btn" onClick={() => nav("/company")}>Company</button>
          <button className="btn primary" onClick={() => nav("/purchase")}>Purchase</button>
        </div>
      </div>

      {/* MAIN */}
      <div
        style={{
          padding: 16,
          display: "grid",
          gridTemplateColumns: "2.2fr 1fr",
          gap: 14,
          alignItems: "start",
        }}
      >
        {/* LEFT: PRODUCTS */}
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            padding: 14,
            boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
          }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input
              className="inp"
              placeholder="Search products (name / barcode / reference)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ flex: 2, minWidth: 260 }}
            />
            <input
              className="inp"
              placeholder="Scan barcode and press Enter"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onKeyDown={scanEnter}
              style={{ flex: 1, minWidth: 240 }}
            />
          </div>

          <div
            style={{
              marginTop: 14,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 12,
            }}
          >
            {filtered.map((p) => (
              <div
                key={p.id}
                onClick={() => addToCart(p)}
                style={{
                  cursor: "pointer",
                  border: "1px solid #eee",
                  borderRadius: 16,
                  padding: 12,
                  background: "#ffffff",
                  boxShadow: "0 6px 16px rgba(0,0,0,0.05)",
                  userSelect: "none",
                }}
              >
                <div style={{ fontWeight: 900, fontSize: 14 }}>{p.name}</div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                  <div style={{ fontWeight: 800 }}>KSh {money(p.price)}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>Stock: {p.stock}</div>
                </div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                  Ref: {p.reference || "-"} • Barcode: {p.barcode || "-"}
                </div>
              </div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div style={{ marginTop: 18, opacity: 0.75 }}>
              No products found. Add products in <b>Purchase</b>.
            </div>
          )}
        </div>

        {/* RIGHT: CART + PAYMENT */}
        <div style={{ display: "grid", gap: 14 }}>
          {/* CART */}
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: 14,
              boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 900 }}>Cart</div>
              <button className="btn" onClick={() => setCart([])}>Clear</button>
            </div>

            <div
              style={{
                marginTop: 10,
                border: "1px solid #eee",
                borderRadius: 14,
                padding: 10,
                maxHeight: 280,
                overflow: "auto",
              }}
            >
              {cart.length === 0 && <div style={{ opacity: 0.7 }}>No items</div>}
              {cart.map((it) => (
                <div
                  key={it.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 0",
                    borderBottom: "1px dashed #eee",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800 }}>{it.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                      KSh {money(it.price)} × {it.qty} = <b>KSh {money(it.price * it.qty)}</b>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn" onClick={() => changeQty(it.id, -1)}>-</button>
                    <button className="btn" onClick={() => changeQty(it.id, +1)}>+</button>
                    <button className="btn" onClick={() => removeItem(it.id)}>x</button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 10, fontWeight: 950, fontSize: 18 }}>
              Total: KSh {money(total())}
            </div>
          </div>

          {/* PAYMENT */}
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: 14,
              boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Payment</div>

            <label className="lbl">Customer</label>
            <div style={{ display: "flex", gap: 8 }}>
              <select className="inp" value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={{ flex: 1 }}>
                <option value="">Walk-in Customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} • {c.loyalty_points} pts
                  </option>
                ))}
              </select>
              <button className="btn" onClick={() => setShowCustomerModal(true)}>+ New</button>
            </div>

            <label className="lbl">Payment Mode</label>
            <select className="inp" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
              <option>Cash</option>
              <option>Mpesa</option>
              <option>Bank</option>
              <option>Cheque</option>
            </select>

            {paymentMode !== "Cash" && (
              <>
                <label className="lbl">Reference Code</label>
                <input
                  className="inp"
                  placeholder="Mpesa / Bank / Cheque reference"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                />
              </>
            )}

            <label className="lbl">Amount Paid</label>
            <input
              className="inp"
              type="number"
              inputMode="numeric"
              placeholder="e.g. 1000"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
            />

            <button className="btn primary" style={{ width: "100%", marginTop: 12 }} onClick={completeSale}>
              Complete Sale
            </button>

            {/* REPRINT */}
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Reprint Receipt</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="inp"
                  placeholder="Enter receipt e.g. BR-000001"
                  value={reprintNo}
                  onChange={(e) => setReprintNo(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  className="btn"
                  onClick={() => {
                    const no = reprintNo.trim();
                    if (!no) return alert("Enter receipt number");
                    loadReprint(no);
                  }}
                >
                  Load
                </button>
              </div>

              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
                Recent:{" "}
                {recentReceipts.slice(0, 6).map((r) => (
                  <span
                    key={r.receipt_no}
                    style={{ cursor: "pointer", textDecoration: "underline", marginRight: 8 }}
                    onClick={() => loadReprint(r.receipt_no)}
                    title="Click to load"
                  >
                    {r.receipt_no}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* NEW CUSTOMER MODAL */}
      {showCustomerModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 9999,
          }}
          onClick={() => setShowCustomerModal(false)}
        >
          <div
            style={{
              width: 520,
              maxWidth: "100%",
              background: "#fff",
              borderRadius: 16,
              padding: 16,
              boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>New Customer</div>
              <button className="btn" onClick={() => setShowCustomerModal(false)}>Close</button>
            </div>

            <label className="lbl">Name</label>
            <input className="inp" value={newCust.name} onChange={(e) => setNewCust({ ...newCust, name: e.target.value })} />

            <label className="lbl">Phone (optional)</label>
            <input className="inp" value={newCust.phone} onChange={(e) => setNewCust({ ...newCust, phone: e.target.value })} />

            <label className="lbl">Buyer KRA PIN (optional)</label>
            <input className="inp" value={newCust.kra_pin} onChange={(e) => setNewCust({ ...newCust, kra_pin: e.target.value })} />

            <button className="btn primary" style={{ width: "100%", marginTop: 12 }} onClick={createCustomer}>
              Save Customer
            </button>

            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
              Buyer PIN will appear on receipt if customer is selected.
            </div>
          </div>
        </div>
      )}

      {/* RECEIPT MODAL */}
      {receipt && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 9999,
          }}
          onClick={() => setReceipt(null)}
        >
          <div
            style={{
              width: 560,
              maxWidth: "100%",
              background: "#fff",
              borderRadius: 16,
              padding: 16,
              boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>Receipt Preview</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Receipt No: {receipt.receipt_no}</div>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn" onClick={() => openPrintWindow(buildReceiptHtml(receipt))}>
                  🖨 Print
                </button>
                <button className="btn" onClick={() => setReceipt(null)}>
                  Close
                </button>
              </div>
            </div>

            <div
              style={{
                marginTop: 12,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                whiteSpace: "pre-wrap",
                background: "#fafafa",
                border: "1px solid #eee",
                borderRadius: 12,
                padding: 12,
                maxHeight: 360,
                overflow: "auto",
              }}
            >
{`${company?.name || "BROESTA"}
SELLER PIN: ${receipt.seller_pin || ""}
${receipt.buyer_pin ? "BUYER PIN: " + receipt.buyer_pin : ""}

Receipt: ${receipt.receipt_no}
Date: ${receipt.created_at || ""}

Payment: ${receipt.payment_mode}${receipt.payment_ref ? " (" + receipt.payment_ref + ")" : ""}

Items:
${(receipt.items || [])
  .map((i) => `- ${i.name}  ${i.qty} x ${Number(i.price).toFixed(2)} = ${Number(i.subtotal).toFixed(2)} [${i.tax_type || "EXEMPT"}${Number(i.tax_rate || 0) > 0 ? " " + i.tax_rate + "%" : ""}]`)
  .join("\n")}

TOTAL:  KSh ${Number(receipt.total).toFixed(2)}
PAID:   KSh ${Number(receipt.amount_paid).toFixed(2)}
CHANGE: KSh ${Number(receipt.change_given ?? 0).toFixed(2)}

QR: ${API_BASE}/public/receipt/${receipt.receipt_no}
`}
            </div>

            {receiptQr && (
              <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Scan QR to verify receipt</div>
                  <img src={receiptQr} alt="receipt qr" style={{ width: 150, height: 150 }} />
                </div>
              </div>
            )}

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
              If print doesn’t open, allow pop-ups in your browser.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}