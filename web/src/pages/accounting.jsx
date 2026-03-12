import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

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
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, message: "Server returned non-JSON response" };
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

function card(title, value, color = "#0b5bd3", suffix = "") {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 18,
        padding: 16,
        boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
        borderTop: `4px solid ${color}`,
      }}
    >
      <div style={{ fontSize: 13, opacity: 0.8 }}>{title}</div>
      <div style={{ marginTop: 8, fontSize: 24, fontWeight: 900 }}>
        {suffix ? `${value}${suffix}` : `KSh ${money(value)}`}
      </div>
    </div>
  );
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

export default function Accounting() {
  const nav = useNavigate();

  const [tab, setTab] = useState("dashboard");

  const [dashboard, setDashboard] = useState(null);
  const [summary, setSummary] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [posSales, setPosSales] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [margins, setMargins] = useState(null);

  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerStatement, setCustomerStatement] = useState(null);

  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [supplierStatement, setSupplierStatement] = useState(null);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const [dRes, sRes, iRes, pRes, cRes, supRes, mRes] = await Promise.all([
      api("/accounting/dashboard"),
      api("/accounting/summary/today"),
      api("/accounting/invoices"),
      api("/accounting/pos-sales"),
      api("/accounting/customers"),
      api("/accounting/suppliers"),
      api("/accounting/margins"),
    ]);

    if (dRes.ok) setDashboard(dRes);
    if (sRes.ok) setSummary(sRes);
    if (iRes.ok) setInvoices(iRes.invoices || []);
    if (pRes.ok) setPosSales(pRes.sales || []);
    if (cRes.ok) setCustomers(cRes.customers || []);
    if (supRes.ok) setSuppliers(supRes.suppliers || []);
    if (mRes.ok) setMargins(mRes);
  }

  async function loadCustomerStatement(id) {
    const res = await api(`/accounting/customer-statement/${id}`);
    if (!res.ok) return alert(res.message);
    setSelectedCustomer(id);
    setCustomerStatement(res);
    setTab("customer-statement");
  }

  async function loadSupplierStatement(id) {
    const res = await api(`/accounting/supplier-statement/${id}`);
    if (!res.ok) return alert(res.message);
    setSelectedSupplier(id);
    setSupplierStatement(res);
    setTab("supplier-statement");
  }

  function printCustomerStatement() {
    if (!customerStatement) return;
    const c = customerStatement.customer;
    const rows = (customerStatement.rows || [])
      .map(
        (r, idx) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #eee">${idx + 1}</td>
          <td style="padding:8px;border-bottom:1px solid #eee">${r.type}</td>
          <td style="padding:8px;border-bottom:1px solid #eee">${r.ref}</td>
          <td style="padding:8px;border-bottom:1px solid #eee">${r.created_at}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${money(r.amount)}</td>
        </tr>
      `
      )
      .join("");

    const html = `
    <html><head><title>Customer Statement</title>
      <style>
        body{font-family:Arial;margin:0;background:#f4f6f9}
        .page{max-width:980px;margin:18px auto;background:#fff;border-radius:14px;box-shadow:0 12px 30px rgba(0,0,0,.12);overflow:hidden}
        .bar{background:linear-gradient(90deg,#2563eb,#06b6d4,#ec4899);color:#fff;padding:16px 18px}
        .pad{padding:18px}
        table{width:100%;border-collapse:collapse}
        th{background:#2563eb;color:#fff;text-align:left;padding:10px;font-size:12px}
      </style>
    </head><body>
      <div class="page">
        <div class="bar">
          <div style="font-size:22px;font-weight:900">CUSTOMER STATEMENT</div>
          <div>${c.name}</div>
        </div>
        <div class="pad">
          <div><b>Phone:</b> ${c.phone || "-"}</div>
          <div><b>Email:</b> ${c.email || "-"}</div>
          <div><b>KRA PIN:</b> ${c.kra_pin || "-"}</div>
          <div><b>Account Balance:</b> KSh ${money(c.account_balance)}</div>
          <div><b>Credit Limit:</b> KSh ${money(c.credit_limit)}</div>
          <div><b>Credit Used:</b> KSh ${money(c.credit_used)}</div>

          <div style="height:14px"></div>

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
            <tbody>${rows}</tbody>
          </table>

          <div style="margin-top:14px;font-weight:900;font-size:18px">
            Total Invoiced: KSh ${money(customerStatement.total_invoiced)}
          </div>
        </div>
      </div>
      <script>window.onload=()=>window.print()</script>
    </body></html>`;
    openPrintWindow(html);
  }

  function printSupplierStatement() {
    if (!supplierStatement) return;
    const s = supplierStatement.supplier;
    const rows = (supplierStatement.rows || [])
      .map(
        (r, idx) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #eee">${idx + 1}</td>
          <td style="padding:8px;border-bottom:1px solid #eee">${r.type}</td>
          <td style="padding:8px;border-bottom:1px solid #eee">${r.ref}</td>
          <td style="padding:8px;border-bottom:1px solid #eee">${r.status}</td>
          <td style="padding:8px;border-bottom:1px solid #eee">${r.created_at}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${money(r.amount)}</td>
        </tr>
      `
      )
      .join("");

    const html = `
    <html><head><title>Supplier Statement</title>
      <style>
        body{font-family:Arial;margin:0;background:#f4f6f9}
        .page{max-width:980px;margin:18px auto;background:#fff;border-radius:14px;box-shadow:0 12px 30px rgba(0,0,0,.12);overflow:hidden}
        .bar{background:linear-gradient(90deg,#2563eb,#06b6d4,#ec4899);color:#fff;padding:16px 18px}
        .pad{padding:18px}
        table{width:100%;border-collapse:collapse}
        th{background:#2563eb;color:#fff;text-align:left;padding:10px;font-size:12px}
      </style>
    </head><body>
      <div class="page">
        <div class="bar">
          <div style="font-size:22px;font-weight:900">SUPPLIER STATEMENT</div>
          <div>${s.name}</div>
        </div>
        <div class="pad">
          <div><b>Phone:</b> ${s.phone || "-"}</div>
          <div><b>Email:</b> ${s.email || "-"}</div>
          <div><b>KRA PIN:</b> ${s.kra_pin || "-"}</div>

          <div style="height:14px"></div>

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
            <tbody>${rows}</tbody>
          </table>

          <div style="margin-top:14px;font-weight:900;font-size:18px">
            Total Billed: KSh ${money(supplierStatement.total_billed)}
          </div>
        </div>
      </div>
      <script>window.onload=()=>window.print()</script>
    </body></html>`;
    openPrintWindow(html);
  }

  const maxPayment = useMemo(() => {
    const arr = dashboard?.payments_by_mode || [];
    return Math.max(1, ...arr.map((x) => Number(x.total || 0)));
  }, [dashboard]);

  const invoiceVatTotal = useMemo(() => {
    return (invoices || []).reduce((sum, inv) => sum + Number(inv.vat_total || 0), 0);
  }, [invoices]);

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#eff6ff,#fdf2f8,#f0fdf4)" }}>
      <div
        style={{
          height: 64,
          background: "#111827",
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
          <button className="btn primary" onClick={() => loadAll()}>Refresh</button>
        </div>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <button className="btn" onClick={() => setTab("dashboard")}>Dashboard</button>
          <button className="btn" onClick={() => setTab("invoices")}>Invoices</button>
          <button className="btn" onClick={() => setTab("pos-sales")}>POS Sales</button>
          <button className="btn" onClick={() => setTab("customers")}>Customers</button>
          <button className="btn" onClick={() => setTab("suppliers")}>Suppliers</button>
          <button className="btn" onClick={() => setTab("margins")}>Margins</button>
        </div>

        {tab === "dashboard" && (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14 }}>
              {card("POS Today", dashboard?.cards?.pos_today || 0, "#2563eb")}
              {card("Invoices Today", dashboard?.cards?.invoices_today || 0, "#16a34a")}
              {card("Purchases Total", dashboard?.cards?.purchases_total || 0, "#f59e0b")}
              {card("Stock Valuation", dashboard?.cards?.stock_valuation || 0, "#7c3aed")}
              {card("Invoice VAT", invoiceVatTotal || 0, "#ec4899")}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 14 }}>
              <div style={{ background: "#fff", borderRadius: 18, padding: 16, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
                <div style={{ fontWeight: 900, marginBottom: 12 }}>Payment Modes</div>
                {(dashboard?.payments_by_mode || []).map((p) => (
                  <div key={p.mode} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <span>{p.mode}</span>
                      <span>KSh {money(p.total)}</span>
                    </div>
                    <div style={{ marginTop: 4, height: 10, background: "#eef2ff", borderRadius: 999 }}>
                      <div
                        style={{
                          height: 10,
                          borderRadius: 999,
                          width: `${(Number(p.total || 0) / maxPayment) * 100}%`,
                          background: "linear-gradient(90deg,#2563eb,#06b6d4,#ec4899)",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ background: "#fff", borderRadius: 18, padding: 16, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
                <div style={{ fontWeight: 900, marginBottom: 12 }}>Today Summary</div>
                <div style={{ fontSize: 14, marginBottom: 8 }}>POS Total: <b>KSh {money(summary?.pos_total)}</b></div>
                <div style={{ fontSize: 14, marginBottom: 8 }}>Invoice Total: <b>KSh {money(summary?.invoice_total)}</b></div>
                {(summary?.payments_by_mode || []).map((p) => (
                  <div key={p.mode} style={{ fontSize: 13, marginBottom: 6 }}>
                    {p.mode}: <b>KSh {money(p.total)}</b>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ background: "#fff", borderRadius: 18, padding: 16, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
                <div style={{ fontWeight: 900, marginBottom: 12 }}>Recent Invoices</div>
                {(dashboard?.recent_invoices || []).map((r) => (
                  <div key={r.inv_no} style={{ padding: "8px 0", borderBottom: "1px dashed #eee" }}>
                    <div style={{ fontWeight: 800 }}>{r.inv_no}</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>{r.customer_name || "No customer"} • {r.created_at}</div>
                    <div style={{ fontSize: 13 }}>KSh {money(r.total)}</div>
                  </div>
                ))}
              </div>

              <div style={{ background: "#fff", borderRadius: 18, padding: 16, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
                <div style={{ fontWeight: 900, marginBottom: 12 }}>Recent POS Sales</div>
                {(dashboard?.recent_pos || []).map((r) => (
                  <div key={r.receipt_no} style={{ padding: "8px 0", borderBottom: "1px dashed #eee" }}>
                    <div style={{ fontWeight: 800 }}>{r.receipt_no}</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>{r.payment_mode} • {r.created_at}</div>
                    <div style={{ fontSize: 13 }}>KSh {money(r.total)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "invoices" && (
          <div style={{ background: "#fff", borderRadius: 18, padding: 16, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
            <div style={{ fontWeight: 900, marginBottom: 12 }}>Customer Invoices</div>
            <div style={{ overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#2563eb", color: "#fff" }}>
                    <th style={{ padding: 10, textAlign: "left" }}>Invoice</th>
                    <th style={{ padding: 10, textAlign: "left" }}>Customer</th>
                    <th style={{ padding: 10, textAlign: "left" }}>Buyer PIN</th>
                    <th style={{ padding: 10, textAlign: "left" }}>Date</th>
                    <th style={{ padding: 10, textAlign: "right" }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((i) => (
                    <tr key={i.inv_no}>
                      <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{i.inv_no}</td>
                      <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{i.customer_name || "-"}</td>
                      <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{i.customer_kra_pin || "-"}</td>
                      <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{i.created_at}</td>
                      <td style={{ padding: 10, borderBottom: "1px solid #eee", textAlign: "right" }}>{money(i.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "pos-sales" && (
          <div style={{ background: "#fff", borderRadius: 18, padding: 16, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
            <div style={{ fontWeight: 900, marginBottom: 12 }}>POS Sales</div>
            <div style={{ overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#2563eb", color: "#fff" }}>
                    <th style={{ padding: 10, textAlign: "left" }}>Receipt</th>
                    <th style={{ padding: 10, textAlign: "left" }}>Customer</th>
                    <th style={{ padding: 10, textAlign: "left" }}>Payment</th>
                    <th style={{ padding: 10, textAlign: "left" }}>Date</th>
                    <th style={{ padding: 10, textAlign: "right" }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {posSales.map((s) => (
                    <tr key={s.receipt_no}>
                      <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{s.receipt_no}</td>
                      <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{s.customer_name || "-"}</td>
                      <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{s.payment_mode}</td>
                      <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{s.created_at}</td>
                      <td style={{ padding: 10, borderBottom: "1px solid #eee", textAlign: "right" }}>{money(s.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "customers" && (
          <div style={{ background: "#fff", borderRadius: 18, padding: 16, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
            <div style={{ fontWeight: 900, marginBottom: 12 }}>Customer Accounts</div>
            <div style={{ overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#2563eb", color: "#fff" }}>
                    <th style={{ padding: 10, textAlign: "left" }}>Customer</th>
                    <th style={{ padding: 10, textAlign: "left" }}>Phone</th>
                    <th style={{ padding: 10, textAlign: "right" }}>Account</th>
                    <th style={{ padding: 10, textAlign: "right" }}>Credit Limit</th>
                    <th style={{ padding: 10, textAlign: "right" }}>Credit Used</th>
                    <th style={{ padding: 10, textAlign: "right" }}>Balance</th>
                    <th style={{ padding: 10, textAlign: "center" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.id}>
                      <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{c.name}</td>
                      <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{c.phone || "-"}</td>
                      <td style={{ padding: 10, borderBottom: "1px solid #eee", textAlign: "right" }}>{money(c.account_balance)}</td>
                      <td style={{ padding: 10, borderBottom: "1px solid #eee", textAlign: "right" }}>{money(c.credit_limit)}</td>
                      <td style={{ padding: 10, borderBottom: "1px solid #eee", textAlign: "right" }}>{money(c.credit_used)}</td>
                      <td style={{ padding: 10, borderBottom: "1px solid #eee", textAlign: "right" }}>{money(c.balance)}</td>
                      <td style={{ padding: 10, borderBottom: "1px solid #eee", textAlign: "center" }}>
                        <button className="btn" onClick={() => loadCustomerStatement(c.id)}>Statement</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "suppliers" && (
          <div style={{ background: "#fff", borderRadius: 18, padding: 16, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
            <div style={{ fontWeight: 900, marginBottom: 12 }}>Supplier Accounts</div>
            <div style={{ overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#2563eb", color: "#fff" }}>
                    <th style={{ padding: 10, textAlign: "left" }}>Supplier</th>
                    <th style={{ padding: 10, textAlign: "left" }}>Phone</th>
                    <th style={{ padding: 10, textAlign: "left" }}>Email</th>
                    <th style={{ padding: 10, textAlign: "right" }}>Billed Total</th>
                    <th style={{ padding: 10, textAlign: "center" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((s) => (
                    <tr key={s.id}>
                      <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{s.name}</td>
                      <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{s.phone || "-"}</td>
                      <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{s.email || "-"}</td>
                      <td style={{ padding: 10, borderBottom: "1px solid #eee", textAlign: "right" }}>{money(s.billed_total)}</td>
                      <td style={{ padding: 10, borderBottom: "1px solid #eee", textAlign: "center" }}>
                        <button className="btn" onClick={() => loadSupplierStatement(s.id)}>Statement</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "margins" && (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
              {card("Sales Total", margins?.sales_total || 0, "#2563eb")}
              {card("Cost Total", margins?.cost_total || 0, "#ef4444")}
              {card("Gross Profit", margins?.gross_profit || 0, "#16a34a")}
              {card("Margin %", Number(margins?.margin_percent || 0).toFixed(2), "#7c3aed", "%")}
            </div>

            <div style={{ background: "#fff", borderRadius: 18, padding: 16, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
              <div style={{ fontWeight: 900, marginBottom: 12 }}>Top Products by Sales</div>
              <div style={{ overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#2563eb", color: "#fff" }}>
                      <th style={{ padding: 10, textAlign: "left" }}>Product</th>
                      <th style={{ padding: 10, textAlign: "right" }}>Qty</th>
                      <th style={{ padding: 10, textAlign: "right" }}>Sales</th>
                      <th style={{ padding: 10, textAlign: "right" }}>Cost</th>
                      <th style={{ padding: 10, textAlign: "right" }}>Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(margins?.top_products || []).map((p, idx) => (
                      <tr key={idx}>
                        <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{p.name}</td>
                        <td style={{ padding: 10, borderBottom: "1px solid #eee", textAlign: "right" }}>{p.qty}</td>
                        <td style={{ padding: 10, borderBottom: "1px solid #eee", textAlign: "right" }}>{money(p.sales_total)}</td>
                        <td style={{ padding: 10, borderBottom: "1px solid #eee", textAlign: "right" }}>{money(p.cost_total)}</td>
                        <td style={{ padding: 10, borderBottom: "1px solid #eee", textAlign: "right" }}>{money(p.gross_profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === "customer-statement" && customerStatement && (
          <div style={{ background: "#fff", borderRadius: 18, padding: 16, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontWeight: 900, fontSize: 18 }}>Customer Statement • {customerStatement.customer.name}</div>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn" onClick={() => setTab("customers")}>Back</button>
                <button className="btn primary" onClick={printCustomerStatement}>Print</button>
              </div>
            </div>

            <div style={{ fontSize: 13, marginBottom: 10 }}>
              Phone: {customerStatement.customer.phone || "-"} • Email: {customerStatement.customer.email || "-"} • PIN: {customerStatement.customer.kra_pin || "-"}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 14 }}>
              {card("Account Balance", customerStatement.customer.account_balance || 0, "#2563eb")}
              {card("Credit Limit", customerStatement.customer.credit_limit || 0, "#7c3aed")}
              {card("Credit Used", customerStatement.customer.credit_used || 0, "#ef4444")}
              {card("Total Invoiced", customerStatement.total_invoiced || 0, "#16a34a")}
            </div>

            <div style={{ overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#2563eb", color: "#fff" }}>
                    <th style={{ padding: 10, textAlign: "left" }}>Type</th>
                    <th style={{ padding: 10, textAlign: "left" }}>Reference</th>
                    <th style={{ padding: 10, textAlign: "left" }}>Date</th>
                    <th style={{ padding: 10, textAlign: "right" }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(customerStatement.rows || []).map((r, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{r.type}</td>
                      <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{r.ref}</td>
                      <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{r.created_at}</td>
                      <td style={{ padding: 10, borderBottom: "1px solid #eee", textAlign: "right" }}>{money(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "supplier-statement" && supplierStatement && (
          <div style={{ background: "#fff", borderRadius: 18, padding: 16, boxShadow: "0 10px 25px rgba(0,0,0,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontWeight: 900, fontSize: 18 }}>Supplier Statement • {supplierStatement.supplier.name}</div>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn" onClick={() => setTab("suppliers")}>Back</button>
                <button className="btn primary" onClick={printSupplierStatement}>Print</button>
              </div>
            </div>

            <div style={{ fontSize: 13, marginBottom: 10 }}>
              Phone: {supplierStatement.supplier.phone || "-"} • Email: {supplierStatement.supplier.email || "-"} • PIN: {supplierStatement.supplier.kra_pin || "-"}
            </div>

            <div style={{ overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#2563eb", color: "#fff" }}>
                    <th style={{ padding: 10, textAlign: "left" }}>Type</th>
                    <th style={{ padding: 10, textAlign: "left" }}>Reference</th>
                    <th style={{ padding: 10, textAlign: "left" }}>Status</th>
                    <th style={{ padding: 10, textAlign: "left" }}>Date</th>
                    <th style={{ padding: 10, textAlign: "right" }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(supplierStatement.rows || []).map((r, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{r.type}</td>
                      <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{r.ref}</td>
                      <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{r.status}</td>
                      <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{r.created_at}</td>
                      <td style={{ padding: 10, borderBottom: "1px solid #eee", textAlign: "right" }}>{money(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 14, fontWeight: 900, fontSize: 18 }}>
              Total Billed: KSh {money(supplierStatement.total_billed)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}