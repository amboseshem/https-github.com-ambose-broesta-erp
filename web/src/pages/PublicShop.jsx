import React, { useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8080";

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
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

export default function PublicShop() {
  const [settings, setSettings] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);

  const [q, setQ] = useState("");
  const [activeCategory, setActiveCategory] = useState("ALL");

  const [cart, setCart] = useState([]);
  const [showCheckout, setShowCheckout] = useState(false);

  const [checkout, setCheckout] = useState({
    customer_name: "",
    customer_phone: "",
    customer_email: "",
    delivery_location: "",
    note: "",
  });

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const [sRes, pRes, cRes] = await Promise.all([
      api("/website/settings"),
      api("/shop/products"),
      api("/shop/categories"),
    ]);

    if (sRes.ok) setSettings(sRes.settings || null);
    if (pRes.ok) setProducts(pRes.products || []);
    if (cRes.ok) setCategories(cRes.categories || []);
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();

    return products.filter((p) => {
      const matchSearch =
        !s ||
        `${p.name} ${p.reference || ""} ${p.barcode || ""} ${p.category_name || ""}`
          .toLowerCase()
          .includes(s);

      const matchCategory =
        activeCategory === "ALL" || Number(p.category_id) === Number(activeCategory);

      return matchSearch && matchCategory;
    });
  }, [products, q, activeCategory]);

  function cartQty(productId) {
    const item = cart.find((x) => x.product_id === productId);
    return item ? item.qty : 0;
  }

  function addToCart(product) {
    const existingQty = cartQty(product.id);
    if (existingQty + 1 > Number(product.stock || 0)) {
      return alert("Insufficient stock");
    }

    const ex = cart.find((x) => x.product_id === product.id);
    if (ex) {
      setCart((prev) =>
        prev.map((x) =>
          x.product_id === product.id ? { ...x, qty: x.qty + 1 } : x
        )
      );
    } else {
      setCart((prev) => [
        ...prev,
        {
          product_id: product.id,
          name: product.name,
          price: Number(product.price || 0),
          qty: 1,
        },
      ]);
    }
  }

  function changeQty(productId, delta) {
    const p = products.find((x) => x.id === productId);
    const maxStock = Number(p?.stock || 0);

    setCart((prev) => {
      const row = prev.find((x) => x.product_id === productId);
      if (!row) return prev;

      const nextQty = row.qty + delta;
      if (nextQty <= 0) return prev.filter((x) => x.product_id !== productId);
      if (nextQty > maxStock) {
        alert("Insufficient stock");
        return prev;
      }

      return prev.map((x) =>
        x.product_id === productId ? { ...x, qty: nextQty } : x
      );
    });
  }

  function removeFromCart(productId) {
    setCart((prev) => prev.filter((x) => x.product_id !== productId));
  }

  const cartTotal = useMemo(() => {
    return cart.reduce((s, i) => s + Number(i.price || 0) * Number(i.qty || 0), 0);
  }, [cart]);

  async function placeOrder() {
    if (!checkout.customer_name.trim()) return alert("Customer name required");
    if (!checkout.customer_phone.trim()) return alert("Customer phone required");
    if (cart.length === 0) return alert("Cart is empty");

    const payload = {
      ...checkout,
      items: cart.map((x) => ({
        product_id: x.product_id,
        qty: x.qty,
      })),
    };

    const res = await api("/shop/orders", {
      method: "POST",
      body: payload,
    });

    if (!res.ok) return alert(res.message);

    alert(`Order placed ✅ ${res.result.order_no}`);
    setCart([]);
    setShowCheckout(false);
    setCheckout({
      customer_name: "",
      customer_phone: "",
      customer_email: "",
      delivery_location: "",
      note: "",
    });
    load();
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f7f8fb" }}>
      <div
        style={{
          background: settings?.theme_color || "#0b5bd3",
          color: "#fff",
          padding: "18px 22px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {settings?.logo_url && (
            <img
              src={settings.logo_url}
              alt="logo"
              style={{
                width: 52,
                height: 52,
                objectFit: "contain",
                background: "#fff",
                borderRadius: 10,
                padding: 4,
              }}
            />
          )}
          <div>
            <div style={{ fontWeight: 900, fontSize: 22 }}>
              {settings?.store_name || "Broesta Shop"}
            </div>
            <div style={{ opacity: 0.95 }}>
              {settings?.hero_subtitle || "Welcome to our online store"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search product..."
            style={{
              minWidth: 240,
              border: "none",
              borderRadius: 12,
              padding: "12px 14px",
              outline: "none",
            }}
          />
          <button
            onClick={() => setShowCheckout(true)}
            style={{
              background: "#fff",
              color: settings?.theme_color || "#0b5bd3",
              border: "none",
              borderRadius: 12,
              padding: "12px 16px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Cart ({cart.length}) • KSh {money(cartTotal)}
          </button>
        </div>
      </div>

      <div
        style={{
          padding: "34px 22px",
          backgroundImage: settings?.banner_url
            ? `linear-gradient(rgba(0,0,0,.4), rgba(0,0,0,.4)), url(${settings.banner_url})`
            : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
          color: settings?.banner_url ? "#fff" : "#111",
        }}
      >
        <div style={{ fontSize: 34, fontWeight: 900 }}>
          {settings?.hero_title || "Shop Online"}
        </div>
        <div style={{ marginTop: 10, maxWidth: 700 }}>
          {settings?.about_text || ""}
        </div>
      </div>

      <div style={{ padding: 22 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
          <button
            onClick={() => setActiveCategory("ALL")}
            style={{
              border: "1px solid #ddd",
              borderRadius: 999,
              padding: "10px 14px",
              background: activeCategory === "ALL" ? (settings?.theme_color || "#0b5bd3") : "#fff",
              color: activeCategory === "ALL" ? "#fff" : "#111",
              cursor: "pointer",
            }}
          >
            All
          </button>

          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCategory(c.id)}
              style={{
                border: "1px solid #ddd",
                borderRadius: 999,
                padding: "10px 14px",
                background: Number(activeCategory) === Number(c.id) ? (settings?.theme_color || "#0b5bd3") : "#fff",
                color: Number(activeCategory) === Number(c.id) ? "#fff" : "#111",
                cursor: "pointer",
              }}
            >
              {c.name} ({c.product_count})
            </button>
          ))}
        </div>

        <div style={{ fontWeight: 900, fontSize: 24, marginBottom: 16 }}>Products</div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 16,
          }}
        >
          {filtered.map((p) => (
            <div
              key={p.id}
              style={{
                background: "#fff",
                borderRadius: 16,
                padding: 16,
                boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
                border: "1px solid #eee",
              }}
            >
              {p.image_url ? (
                <img
                  src={p.image_url}
                  alt={p.name}
                  style={{
                    width: "100%",
                    height: 180,
                    objectFit: "cover",
                    borderRadius: 12,
                    marginBottom: 12,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: 180,
                    borderRadius: 12,
                    marginBottom: 12,
                    background: "#f0f2f7",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#777",
                    fontWeight: 700,
                  }}
                >
                  No Image
                </div>
              )}

              <div style={{ fontWeight: 900, fontSize: 16 }}>{p.name}</div>
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                {p.category_name || "General"}
              </div>
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                Ref: {p.reference || "-"}
              </div>
              <div style={{ marginTop: 8, fontWeight: 900, fontSize: 18 }}>
                KSh {money(p.price)}
              </div>
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                Stock: {p.stock}
              </div>
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                Tax: {p.tax_type || "EXEMPT"}{" "}
                {Number(p.tax_rate || 0) > 0 ? `(${p.tax_rate}%)` : ""}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <button
                  onClick={() => addToCart(p)}
                  style={{
                    background: settings?.theme_color || "#0b5bd3",
                    color: "#fff",
                    border: "none",
                    borderRadius: 10,
                    padding: "10px 14px",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  Add to Cart
                </button>

                {settings?.whatsapp && (
                  <a
                    href={`https://wa.me/${String(settings.whatsapp).replace(/[^\d]/g, "")}?text=${encodeURIComponent("Hello, I want to order: " + p.name)}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "inline-block",
                      background: "#25D366",
                      color: "#fff",
                      padding: "10px 14px",
                      borderRadius: 10,
                      textDecoration: "none",
                      fontWeight: 700,
                    }}
                  >
                    WhatsApp
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div style={{ marginTop: 20, opacity: 0.75 }}>No products found</div>
        )}
      </div>

      {showCheckout && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 9999,
          }}
          onClick={() => setShowCheckout(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 880,
              maxWidth: "100%",
              background: "#fff",
              borderRadius: 18,
              boxShadow: "0 20px 50px rgba(0,0,0,.25)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                background: settings?.theme_color || "#0b5bd3",
                color: "#fff",
                padding: "16px 18px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 18 }}>Checkout</div>
              <button
                onClick={() => setShowCheckout(false)}
                style={{
                  background: "#fff",
                  color: settings?.theme_color || "#0b5bd3",
                  border: "none",
                  borderRadius: 10,
                  padding: "8px 12px",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Close
              </button>
            </div>

            <div style={{ padding: 18, display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 18 }}>
              <div>
                <div style={{ fontWeight: 900, marginBottom: 12 }}>Your Cart</div>
                <div style={{ display: "grid", gap: 10 }}>
                  {cart.map((item) => (
                    <div
                      key={item.product_id}
                      style={{
                        border: "1px solid #eee",
                        borderRadius: 14,
                        padding: 12,
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800 }}>{item.name}</div>
                        <div style={{ fontSize: 12, opacity: 0.8 }}>
                          KSh {money(item.price)} × {item.qty}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <button className="btn" onClick={() => changeQty(item.product_id, -1)}>-</button>
                        <button className="btn" onClick={() => changeQty(item.product_id, 1)}>+</button>
                        <button className="btn" onClick={() => removeFromCart(item.product_id)}>x</button>
                      </div>
                    </div>
                  ))}
                  {cart.length === 0 && <div style={{ opacity: 0.75 }}>Cart is empty</div>}
                </div>

                <div style={{ marginTop: 16, fontWeight: 900, fontSize: 20 }}>
                  Total: KSh {money(cartTotal)}
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 900, marginBottom: 12 }}>Customer Details</div>
                <div style={{ display: "grid", gap: 10 }}>
                  <input
                    className="inp"
                    placeholder="Full Name"
                    value={checkout.customer_name}
                    onChange={(e) => setCheckout({ ...checkout, customer_name: e.target.value })}
                  />
                  <input
                    className="inp"
                    placeholder="Phone"
                    value={checkout.customer_phone}
                    onChange={(e) => setCheckout({ ...checkout, customer_phone: e.target.value })}
                  />
                  <input
                    className="inp"
                    placeholder="Email (optional)"
                    value={checkout.customer_email}
                    onChange={(e) => setCheckout({ ...checkout, customer_email: e.target.value })}
                  />
                  <input
                    className="inp"
                    placeholder="Delivery Location"
                    value={checkout.delivery_location}
                    onChange={(e) => setCheckout({ ...checkout, delivery_location: e.target.value })}
                  />
                  <textarea
                    className="inp"
                    placeholder="Order Note"
                    value={checkout.note}
                    onChange={(e) => setCheckout({ ...checkout, note: e.target.value })}
                    style={{ minHeight: 90 }}
                  />

                  <button className="btn primary" onClick={placeOrder}>
                    Place Order
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}