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

function money(n) {
  return Number(n || 0).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function openPrintWindow(html) {
  const w = window.open("", "_blank");
  if (!w) {
    alert("Popup blocked. Allow popups then try again.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

export default function Accounting() {
  const nav = useNavigate();

  const [dashboard, setDashboard] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [posSales, setPosSales] = useState([]);
  const [margins, setMargins] = useState(null);

  const [tab, setTab] = useState("dashboard");
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const [dRes, cRes, sRes, iRes, pRes, mRes] = await Promise.all([
      api("/accounting/dashboard"),
      api("/accounting/customers"),
      api("/accounting/suppliers"),
      api("/accounting/invoices"),
      api("/accounting/pos-sales"),
      api("/accounting/margins"),
    ]);

    if (dRes.ok) setDashboard(dRes);
    if (cRes.ok) setCustomers(cRes.customers || []);
    if (sRes.ok) setSuppliers(sRes.suppliers || []);
    if (iRes.ok) setInvoices(iRes.invoices || []);
    if (pRes.ok) setPosSales(pRes.sales || []);
    if (mRes.ok) setMargins(mRes);
  }

  const filteredCustomers = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return customers;
    return customers.filter((c) =>
      `${c.name} ${c.phone || ""} ${c.kra_pin || ""}`.toLowerCase().includes(s)
    );
  }, [customers, search]);

  const filteredSuppliers = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return suppliers;
    return suppliers.filter((c) =>
      `${c.name} ${c.phone || ""} ${c.kra_pin || ""}`.toLowerCase().includes(s)
    );
  }, [suppliers, search]);

  function printCustomerStatement(customer, rows, total) {
    const lines = rows
      .map(
        (r, idx) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #eee">${idx + 1}</td>
          <td style="padding:8px;border-bottom:1px solid #eee">${r.type}</td>
          <td style="padding:8px;border-bottom:1px solid #eee">${r.ref}</td>
          <td style="padding:8px;border-bottom:1px solid #eee">${r.created_at || ""}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${money(r.amount)}</td>
        </tr>
      `
      )
      .join("");

    openPrintWindow(`
      <html>
        <head>
          <title>Customer Statement</title>
          <style>
            body{font-family:Arial;margin:0;background:#f2f4f8}
            .page{max-width:980px;margin:18px auto;background:#fff;border-radius:14px;box-shadow:0 12px 30px rgba(0,0,0,.12);overflow:hidden}
            .bar{background:linear-gradient(90deg,#0b5bd3,#2aa9ff);color:#fff;padding:14px 18px}
            .pad{padding:16px 18px}
            table{width:100%;border-collapse:collapse;margin-top:12px}
            th{background:#0b5bd3;color:#fff;text-align:left;padding:10px;font-size:12px}
            .tot{margin-top:12px;text-align:right;font-weight:900}
          </style>
        </head>
        <body>
          <div class="page">
            <div class="bar"><h2 style="margin:0">CUSTOMER STATEMENT • ${customer.name}</h2></div>
            <div class="pad">
              <div><b>Phone:</b> ${customer.phone || "-"}</div>
              <div><b>PIN:</b> ${customer.kra_pin || "-"}</div>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>TYPE</th>
                    <th>REFERENCE</th>
                    <th>DATE</th>
                    <th style="text-align:right">AMOUNT</th>
                  </tr>
                </thead>
                <tbody>${lines}</tbody>
              </table>
              <div class="tot">Total Business: KSh ${money(total)}</div>
              <script>window.onload=()=>window.print()</script>
            </div>
          </div>
        </body>
      </html>
    `);
  }

  function printSupplierStatement(supplier, rows, total) {
    const lines = rows
      .map(
        (r, idx) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #eee">${idx + 1}</td>
          <td style="padding:8px;border-bottom:1px solid #eee">${r.type}</td>
          <td style="padding:8px;border-bottom:1px solid #eee">${r.ref}</td>
          <td style="padding:8px;border-bottom:1px solid #eee">${r.status || ""}</td>
          <td style="padding:8px;border-bottom:1px solid #eee">${r.created_at || ""}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${money(r.amount)}</td>
        </tr>
      `
      )
      .join("");

    openPrintWindow(`
      <html>
        <head>
          <title>Supplier Statement</title>
          <style>
            body{font-family:Arial;margin:0;background:#f2f4f8}
            .page{max-width:980px;margin:18px auto;background:#fff;border-radius:14px;box-shadow:0 12px 30px rgba(0,0,0,.12);overflow:hidden}
            .bar{background:linear-gradient(90deg,#0b5bd3,#2aa9ff);color:#fff;padding:14px 18px}
            .pad{padding:16px 18px}
            table{width:100%;border-collapse:collapse;margin-top:12px}
            th{background:#0b5bd3;color:#fff;text-align:left;padding:10px;font-size:12px}
            .tot{margin-top:12px;text-align:right;font-weight:900}
          </style>
        </head>
        <body>
          <div class="page">
            <div class="bar"><h2 style="margin:0">SUPPLIER STATEMENT • ${supplier.name}</h2></div>
            <div class="pad">
              <div><b>Phone:</b> ${supplier.phone || "-"}</div>
              <div><b>PIN:</b> ${supplier.kra_pin || "-"}</div>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>TYPE</th>
                    <th>REFERENCE</th>
                    <th>STATUS</th>
                    <th>DATE</th>
                    <th style="text-align:right">AMOUNT</th>
                  </tr>
                </thead>
                <tbody>${lines}</tbody>
              </table>
              <div class="tot">Total Business: KSh ${money(total)}</div>
              <script>window.onload=()=>window.print()</script>
            </div>
          </div>
        </body>
      </html>
    `);
  }

  async function openCustomerStatement(customer) {
    const res = await api(`/accounting/customer-statement/${customer.id}`);
    if (!res.ok) return alert(res.message);
    printCustomerStatement(res.customer, res.rows || [], res.total_invoiced || 0);
  }

  async function openSupplierStatement(supplier) {
    const res = await api(`/accounting/supplier-statement/${supplier.id}`);
    if (!res.ok) return alert(res.message);
    printSupplierStatement(res.supplier, res.rows || [], res.total_billed || 0);
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
        <div style={{ fontWeight: 900 }}>Broesta ERP • Accounting</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn" onClick={() => nav("/apps")}>Back</button>
          <button className="btn" onClick={() => nav("/sales")}>Sales</button>
          <button className="btn" onClick={() => nav("/purchase")}>Purchase</button>
        </div>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => setTab("dashboard")}>Dashboard</button>
          <button className="btn" onClick={() => setTab("customers")}>Customers</button>
          <button className="btn" onClick={() => setTab("suppliers")}>Suppliers</button>
          <button className="btn" onClick={() => setTab("invoices")}>Invoices</button>
          <button className="btn" onClick={() => setTab("pos")}>POS Sales</button>
          <button className="btn" onClick={() => setTab("margins")}>Margins</button>

          {(tab === "customers" || tab === "suppliers") && (
            <input
              className="inp"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ minWidth: 260 }}
            />
          )}
        </div>

        {tab === "dashboard" && dashboard && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 14 }}>
              <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>POS Today</div>
                <div style={{ fontWeight: 900, fontSize: 24 }}>KSh {money(dashboard.cards.pos_today)}</div>
              </div>
              <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Invoices Today</div>
                <div style={{ fontWeight: 900, fontSize: 24 }}>KSh {money(dashboard.cards.invoices_today)}</div>
              </div>
              <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Purchases Total</div>
                <div style={{ fontWeight: 900, fontSize: 24 }}>KSh {money(dashboard.cards.purchases_total)}</div>
              </div>
              <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Stock Valuation</div>
                <div style={{ fontWeight: 900, fontSize: 24 }}>KSh {money(dashboard.cards.stock_valuation)}</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
                <div style={{ fontWeight: 900, marginBottom: 10 }}>Payments by Mode</div>
                <div style={{ display: "grid", gap: 10 }}>
                  {(dashboard.payments_by_mode || []).map((r) => (
                    <div key={r.mode} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed #eee", paddingBottom: 8 }}>
                      <span>{r.mode}</span>
                      <b>KSh {money(r.total)}</b>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
                <div style={{ fontWeight: 900, marginBottom: 10 }}>Recent Invoices</div>
                <div style={{ display: "grid", gap: 10 }}>
                  {(dashboard.recent_invoices || []).map((r) => (
                    <div key={r.inv_no} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed #eee", paddingBottom: 8 }}>
                      <span>{r.inv_no} • {r.customer_name || "Walk-in"}</span>
                      <b>KSh {money(r.total)}</b>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 14, background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
              <div style={{ fontWeight: 900, marginBottom: 10 }}>Recent POS Sales</div>
              <div style={{ display: "grid", gap: 10 }}>
                {(dashboard.recent_pos || []).map((r) => (
                  <div key={r.receipt_no} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed #eee", paddingBottom: 8 }}>
                    <span>{r.receipt_no} • {r.payment_mode}</span>
                    <b>KSh {money(r.total)}</b>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === "customers" && (
          <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
            <div style={{ fontWeight: 900, marginBottom: 12 }}>Customer Accounts</div>
            <div style={{ display: "grid", gap: 10 }}>
              {filteredCustomers.map((c) => (
                <div key={c.id} style={{ border: "1px solid #eee", borderRadius: 14, padding: 12, display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>{c.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                      {c.phone || "-"} • PIN: {c.kra_pin || "-"}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                      Invoiced: KSh {money(c.invoiced_total)} • Paid: KSh {money(c.paid_total)} • Balance: KSh {money(c.balance)}
                    </div>
                  </div>
                  <div>
                    <button className="btn" onClick={() => openCustomerStatement(c)}>Print Statement</button>
                  </div>
                </div>
              ))}
              {filteredCustomers.length === 0 && <div style={{ opacity: 0.75 }}>No customers found</div>}
            </div>
          </div>
        )}

        {tab === "suppliers" && (
          <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
            <div style={{ fontWeight: 900, marginBottom: 12 }}>Supplier Accounts</div>
            <div style={{ display: "grid", gap: 10 }}>
              {filteredSuppliers.map((s) => (
                <div key={s.id} style={{ border: "1px solid #eee", borderRadius: 14, padding: 12, display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>{s.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                      {s.phone || "-"} • PIN: {s.kra_pin || "-"}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                      Total Purchases: KSh {money(s.billed_total)}
                    </div>
                  </div>
                  <div>
                    <button className="btn" onClick={() => openSupplierStatement(s)}>Print Statement</button>
                  </div>
                </div>
              ))}
              {filteredSuppliers.length === 0 && <div style={{ opacity: 0.75 }}>No suppliers found</div>}
            </div>
          </div>
        )}

        {tab === "invoices" && (
          <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
            <div style={{ fontWeight: 900, marginBottom: 12 }}>Invoices</div>
            <div style={{ display: "grid", gap: 10 }}>
              {invoices.map((inv) => (
                <div key={inv.inv_no} style={{ borderBottom: "1px dashed #eee", paddingBottom: 10, display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>{inv.inv_no}</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                      {inv.customer_name || "Walk-in"} • {inv.created_at}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                      Total: KSh {money(inv.total)}
                    </div>
                  </div>
                  <div>
                    <button className="btn" onClick={() => nav("/sales")}>Open in Sales</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "pos" && (
          <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
            <div style={{ fontWeight: 900, marginBottom: 12 }}>POS Sales</div>
            <div style={{ display: "grid", gap: 10 }}>
              {posSales.map((s) => (
                <div key={s.receipt_no} style={{ borderBottom: "1px dashed #eee", paddingBottom: 10, display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>{s.receipt_no}</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                      {s.customer_name || "Walk-in"} • {s.payment_mode} • {s.created_at}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                      Total: KSh {money(s.total)}
                    </div>
                  </div>
                  <div>
                    <button className="btn" onClick={() => nav("/pos")}>Open POS</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "margins" && margins && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 14 }}>
              <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Sales Total</div>
                <div style={{ fontWeight: 900, fontSize: 24 }}>KSh {money(margins.sales_total)}</div>
              </div>
              <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Cost Total</div>
                <div style={{ fontWeight: 900, fontSize: 24 }}>KSh {money(margins.cost_total)}</div>
              </div>
              <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Gross Profit</div>
                <div style={{ fontWeight: 900, fontSize: 24 }}>KSh {money(margins.gross_profit)}</div>
              </div>
              <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Margin %</div>
                <div style={{ fontWeight: 900, fontSize: 24 }}>{margins.margin_percent}%</div>
              </div>
            </div>

            <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
              <div style={{ fontWeight: 900, marginBottom: 12 }}>Top Product Margins</div>
              <div style={{ display: "grid", gap: 10 }}>
                {(margins.top_products || []).map((p, idx) => (
                  <div key={idx} style={{ borderBottom: "1px dashed #eee", paddingBottom: 10 }}>
                    <div style={{ fontWeight: 900 }}>{p.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                      Qty: {p.qty} • Sales: KSh {money(p.sales_total)} • Cost: KSh {money(p.cost_total)} • Profit: KSh {money(p.gross_profit)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}