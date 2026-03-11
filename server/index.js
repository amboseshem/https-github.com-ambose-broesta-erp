const express = require("express");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");
const { z } = require("zod");

const app = express();

// ==============================
// CORS + BODY
// ==============================
app.use(cors({
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use((req, res, next) => {
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json());

// ==============================
// DB
// ==============================
const DB_PATH = path.join(__dirname, "data.db");
const db = new Database(DB_PATH);

const JWT_SECRET = process.env.JWT_SECRET || "BROESTA_CHANGE_THIS_SECRET_LATER";

// ==============================
// DB INIT
// ==============================
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','manager','cashier')) DEFAULT 'admin',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS company (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL DEFAULT 'Broesta Essentials',
  kra_pin TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  po_box TEXT NOT NULL DEFAULT '',
  receipt_footer TEXT NOT NULL DEFAULT 'Thank you for shopping with us!',
  logo_url TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS counters (
  key TEXT PRIMARY KEY,
  last_number INTEGER NOT NULL DEFAULT 0 CHECK(last_number >= 0)
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  kra_pin TEXT NOT NULL DEFAULT '',
  loyalty_points REAL NOT NULL DEFAULT 0 CHECK(loyalty_points >= 0),
  account_balance REAL NOT NULL DEFAULT 0 CHECK(account_balance >= 0),
  credit_limit REAL NOT NULL DEFAULT 0 CHECK(credit_limit >= 0),
  credit_used REAL NOT NULL DEFAULT 0 CHECK(credit_used >= 0),
  allow_credit INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  kra_pin TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  reference TEXT NOT NULL DEFAULT '',
  barcode TEXT UNIQUE,
  price REAL NOT NULL DEFAULT 0 CHECK(price >= 0),
  cost REAL NOT NULL DEFAULT 0 CHECK(cost >= 0),
  stock REAL NOT NULL DEFAULT 0 CHECK(stock >= 0),
  tax_type TEXT NOT NULL DEFAULT 'EXEMPT' CHECK(tax_type IN ('INCLUSIVE','EXEMPT','EXCLUSIVE')),
  tax_rate REAL NOT NULL DEFAULT 0 CHECK(tax_rate >= 0),
  category_id INTEGER,
  image_url TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock_moves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  move_type TEXT NOT NULL CHECK(move_type IN (
    'POS_SALE','SALE_DELIVERY','PURCHASE_RECEIPT','ADJUSTMENT','TRANSFER','SCRAP'
  )),
  ref TEXT NOT NULL DEFAULT '',
  product_id INTEGER NOT NULL,
  qty REAL NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS pos_sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_no TEXT UNIQUE NOT NULL,
  customer_id INTEGER,
  total REAL NOT NULL DEFAULT 0 CHECK(total >= 0),
  payment_mode TEXT NOT NULL CHECK(payment_mode IN ('Cash','Mpesa','Bank','Cheque','Account','Credit')),
  payment_ref TEXT NOT NULL DEFAULT '',
  amount_paid REAL NOT NULL DEFAULT 0 CHECK(amount_paid >= 0),
  change_given REAL NOT NULL DEFAULT 0 CHECK(change_given >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS pos_sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  barcode TEXT,
  qty REAL NOT NULL CHECK(qty > 0),
  price REAL NOT NULL CHECK(price >= 0),
  subtotal REAL NOT NULL CHECK(subtotal >= 0),
  FOREIGN KEY (sale_id) REFERENCES pos_sales(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_no TEXT UNIQUE NOT NULL,
  supplier_id INTEGER,
  status TEXT NOT NULL CHECK(status IN ('RFQ','CONFIRMED','RECEIVED')) DEFAULT 'RFQ',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  qty REAL NOT NULL CHECK(qty > 0),
  cost REAL NOT NULL CHECK(cost >= 0),
  subtotal REAL NOT NULL CHECK(subtotal >= 0),
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS sales_quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_no TEXT UNIQUE NOT NULL,
  customer_id INTEGER,
  status TEXT NOT NULL CHECK(status IN ('DRAFT','CONFIRMED')) DEFAULT 'DRAFT',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS sales_quote_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  qty REAL NOT NULL CHECK(qty > 0),
  price REAL NOT NULL CHECK(price >= 0),
  subtotal REAL NOT NULL CHECK(subtotal >= 0),
  FOREIGN KEY (quote_id) REFERENCES sales_quotes(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS sales_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  so_no TEXT UNIQUE NOT NULL,
  quote_no TEXT,
  customer_id INTEGER,
  status TEXT NOT NULL CHECK(status IN ('CONFIRMED','DELIVERED')) DEFAULT 'CONFIRMED',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS sales_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  so_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  qty REAL NOT NULL CHECK(qty > 0),
  price REAL NOT NULL CHECK(price >= 0),
  subtotal REAL NOT NULL CHECK(subtotal >= 0),
  FOREIGN KEY (so_id) REFERENCES sales_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS delivery_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dn_no TEXT UNIQUE NOT NULL,
  so_no TEXT NOT NULL,
  customer_id INTEGER,
  status TEXT NOT NULL CHECK(status IN ('DONE')) DEFAULT 'DONE',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS delivery_note_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dn_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  qty REAL NOT NULL CHECK(qty > 0),
  FOREIGN KEY (dn_id) REFERENCES delivery_notes(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inv_no TEXT UNIQUE NOT NULL,
  dn_no TEXT NOT NULL,
  so_no TEXT NOT NULL,
  customer_id INTEGER,
  total REAL NOT NULL CHECK(total >= 0),
  status TEXT NOT NULL CHECK(status IN ('POSTED')) DEFAULT 'POSTED',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inv_no TEXT NOT NULL,
  product_id INTEGER NOT NULL,
  qty REAL NOT NULL CHECK(qty > 0),
  price REAL NOT NULL CHECK(price >= 0),
  subtotal REAL NOT NULL CHECK(subtotal >= 0),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS journals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL DEFAULT '',
  journal_code TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK(entry_type IN ('DEBIT','CREDIT')),
  amount REAL NOT NULL CHECK(amount >= 0),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL CHECK(source IN ('POS','INVOICE','PURCHASE')),
  ref TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('Cash','Mpesa','Bank','Cheque','Account','Credit')),
  pay_ref TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL CHECK(amount >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS website_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  store_name TEXT NOT NULL DEFAULT 'Broesta Shop',
  hero_title TEXT NOT NULL DEFAULT 'Welcome to Broesta Shop',
  hero_subtitle TEXT NOT NULL DEFAULT 'Quality products at the best prices',
  about_text TEXT NOT NULL DEFAULT 'We serve our customers with excellence.',
  whatsapp TEXT NOT NULL DEFAULT '',
  facebook TEXT NOT NULL DEFAULT '',
  instagram TEXT NOT NULL DEFAULT '',
  tiktok TEXT NOT NULL DEFAULT '',
  logo_url TEXT NOT NULL DEFAULT '',
  banner_url TEXT NOT NULL DEFAULT '',
  theme_color TEXT NOT NULL DEFAULT '#0b5bd3',
  contact_phone TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  contact_location TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS website_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT UNIQUE NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT NOT NULL DEFAULT '',
  delivery_location TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  total REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'NEW' CHECK(status IN ('NEW','CONFIRMED','PROCESSING','COMPLETED','CANCELLED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS website_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  qty REAL NOT NULL CHECK(qty > 0),
  price REAL NOT NULL CHECK(price >= 0),
  subtotal REAL NOT NULL CHECK(subtotal >= 0),
  FOREIGN KEY (order_id) REFERENCES website_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);
`);

// ==============================
// SAFE SCHEMA UPGRADES
// ==============================
try { db.prepare("ALTER TABLE products ADD COLUMN tax_type TEXT NOT NULL DEFAULT 'EXEMPT'").run(); } catch {}
try { db.prepare("ALTER TABLE products ADD COLUMN tax_rate REAL NOT NULL DEFAULT 0").run(); } catch {}
try { db.prepare("ALTER TABLE products ADD COLUMN category_id INTEGER").run(); } catch {}
try { db.prepare("ALTER TABLE products ADD COLUMN image_url TEXT NOT NULL DEFAULT ''").run(); } catch {}

try { db.prepare("ALTER TABLE customers ADD COLUMN account_balance REAL NOT NULL DEFAULT 0").run(); } catch {}
try { db.prepare("ALTER TABLE customers ADD COLUMN credit_limit REAL NOT NULL DEFAULT 0").run(); } catch {}
try { db.prepare("ALTER TABLE customers ADD COLUMN credit_used REAL NOT NULL DEFAULT 0").run(); } catch {}
try { db.prepare("ALTER TABLE customers ADD COLUMN allow_credit INTEGER NOT NULL DEFAULT 0").run(); } catch {}

// ==============================
// SEED / ENSURE
// ==============================
const companyRow = db.prepare("SELECT id FROM company WHERE id=1").get();
if (!companyRow) db.prepare("INSERT INTO company (id) VALUES (1)").run();

const wsRow = db.prepare("SELECT id FROM website_settings WHERE id=1").get();
if (!wsRow) db.prepare("INSERT INTO website_settings (id) VALUES (1)").run();

function ensureCounter(key) {
  const row = db.prepare("SELECT key FROM counters WHERE key=?").get(key);
  if (!row) db.prepare("INSERT INTO counters (key,last_number) VALUES (?,0)").run(key);
}
["receipt", "po", "quote", "so", "dn", "inv", "weborder"].forEach(ensureCounter);

const adminRow = db.prepare("SELECT id FROM users WHERE username='admin'").get();
if (!adminRow) {
  const hash = bcrypt.hashSync("1234", 10);
  db.prepare("INSERT INTO users (username,password_hash,role) VALUES (?,?,?)")
    .run("admin", hash, "admin");
}

function ensureJournal(code, name) {
  const j = db.prepare("SELECT id FROM journals WHERE code=?").get(code);
  if (!j) db.prepare("INSERT INTO journals (code,name) VALUES (?,?)").run(code, name);
}
ensureJournal("CASH", "Cash");
ensureJournal("MPESA", "Mpesa");
ensureJournal("BANK", "Bank");
ensureJournal("SALES", "Sales");
ensureJournal("PURCHASE", "Purchases");

// ==============================
// HELPERS
// ==============================
function nextNo(key, prefix, digits = 6) {
  const tx = db.transaction(() => {
    const row = db.prepare("SELECT last_number FROM counters WHERE key=?").get(key);
    const next = (row?.last_number || 0) + 1;
    db.prepare("UPDATE counters SET last_number=? WHERE key=?").run(next, key);
    return prefix + String(next).padStart(digits, "0");
  });
  return tx();
}

function sum2(n) {
  return Number((Number(n || 0)).toFixed(2));
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const tok = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!tok) return res.status(401).json({ ok: false, message: "Missing token" });

  try {
    req.user = jwt.verify(tok, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ ok: false, message: "Invalid token" });
  }
}

// ==============================
// ROOT + HEALTH
// ==============================
app.get("/", (req, res) => {
  res.json({ ok: true, name: "broesta-erp-server", time: new Date().toISOString() });
});

app.get("/health", (req, res) => {
  res.json({ ok: true, name: "broesta-erp-server" });
});

// ==============================
// AUTH
// ==============================
app.post("/auth/login", (req, res) => {
  try {
    const { username, password } = req.body || {};

    const user = db.prepare("SELECT * FROM users WHERE username=?").get(String(username || "").trim());
    if (!user) return res.json({ ok: false, message: "Wrong username" });

    const ok = bcrypt.compareSync(String(password || ""), user.password_hash);
    if (!ok) return res.json({ ok: false, message: "Wrong password" });

    const token = jwt.sign(
      { username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    return res.json({ ok: true, token });
  } catch {
    return res.json({ ok: false, message: "Login failed" });
  }
});

app.post("/auth/change-password", auth, (req, res) => {
  try {
    const schema = z.object({
      current_password: z.string().min(1),
      new_password: z.string().min(4),
      confirm_password: z.string().min(4),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.json({ ok: false, message: "Invalid input" });

    const { current_password, new_password, confirm_password } = parsed.data;
    if (new_password !== confirm_password) {
      return res.json({ ok: false, message: "New passwords do not match" });
    }

    const user = db.prepare("SELECT * FROM users WHERE username=?").get(req.user.username);
    if (!user) return res.json({ ok: false, message: "User not found" });

    const ok = bcrypt.compareSync(current_password, user.password_hash);
    if (!ok) return res.json({ ok: false, message: "Current password is wrong" });

    const newHash = bcrypt.hashSync(new_password, 10);
    db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(newHash, user.id);

    return res.json({ ok: true, message: "Password changed successfully" });
  } catch (e) {
    return res.json({ ok: false, message: String(e.message || e) });
  }
});

// ==============================
// COMPANY
// ==============================
app.get("/company", auth, (req, res) => {
  const company = db.prepare("SELECT * FROM company WHERE id=1").get();
  res.json({ ok: true, company });
});

app.put("/company", auth, (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    kra_pin: z.string().optional().default(""),
    phone: z.string().optional().default(""),
    email: z.string().optional().default(""),
    location: z.string().optional().default(""),
    po_box: z.string().optional().default(""),
    receipt_footer: z.string().optional().default(""),
    logo_url: z.string().optional().default("")
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, message: "Invalid input" });

  const c = parsed.data;
  db.prepare(`
    UPDATE company SET
      name=?, kra_pin=?, phone=?, email=?, location=?, po_box=?, receipt_footer=?, logo_url=?
    WHERE id=1
  `).run(c.name, c.kra_pin, c.phone, c.email, c.location, c.po_box, c.receipt_footer, c.logo_url);

  res.json({ ok: true });
});

// ==============================
// PRODUCTS
// ==============================
app.get("/products", auth, (req, res) => {
  const rows = db.prepare("SELECT * FROM products WHERE active=1 ORDER BY id DESC").all();
  res.json({ ok: true, products: rows });
});

app.post("/products", auth, (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    reference: z.string().optional().default(""),
    barcode: z.string().optional().default(""),
    price: z.coerce.number().finite().min(0).optional().default(0),
    cost: z.coerce.number().finite().min(0).optional().default(0),
    stock: z.coerce.number().finite().min(0).optional().default(0),
    tax_type: z.enum(["INCLUSIVE", "EXEMPT", "EXCLUSIVE"]).optional().default("EXEMPT"),
    tax_rate: z.coerce.number().finite().min(0).optional().default(0),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.json({ ok: false, message: "Invalid input" });

  const p = parsed.data;
  const barcode = (p.barcode || "").trim();
  const safeBarcode = barcode.length ? barcode : null;

  try {
    const info = db.prepare(`
      INSERT INTO products (name, reference, barcode, price, cost, stock, tax_type, tax_rate)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(
      p.name.trim(),
      (p.reference || "").trim(),
      safeBarcode,
      p.price,
      p.cost,
      p.stock,
      p.tax_type,
      p.tax_rate
    );

    const newId = Number(info.lastInsertRowid);

    if (!safeBarcode) {
      const gen = String(200000000000 + newId);
      db.prepare("UPDATE products SET barcode=? WHERE id=?").run(gen, newId);
    }

    return res.json({ ok: true });
  } catch (e) {
    if (safeBarcode) {
      const ex = db.prepare("SELECT name,barcode FROM products WHERE barcode=?").get(safeBarcode);
      if (ex) return res.json({ ok: false, message: `Barcode already used by: ${ex.name} (${ex.barcode})` });
    }
    return res.json({ ok: false, message: `Create failed: ${String(e.message || e)}` });
  }
});

app.post("/products/:id/adjust-stock", auth, (req, res) => {
  const id = Number(req.params.id);
  const schema = z.object({
    qty: z.coerce.number(),
    note: z.string().optional().default("ADJUSTMENT")
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.json({ ok: false, message: "Invalid input" });

  const { qty, note } = parsed.data;

  const tx = db.transaction(() => {
    const prod = db.prepare("SELECT * FROM products WHERE id=? AND active=1").get(id);
    if (!prod) throw new Error("Product not found");

    const newStock = Number(prod.stock) + Number(qty);
    if (newStock < 0) throw new Error("Stock cannot be negative");

    db.prepare("UPDATE products SET stock=? WHERE id=?").run(newStock, id);

    db.prepare(`
      INSERT INTO stock_moves (move_type, ref, product_id, qty, note)
      VALUES ('ADJUSTMENT', '', ?, ?, ?)
    `).run(id, qty, note);

    return { id, stock: newStock };
  });

  try {
    return res.json({ ok: true, result: tx() });
  } catch (e) {
    return res.json({ ok: false, message: String(e.message || e) });
  }
});

app.put("/products/:id/ecommerce", auth, (req, res) => {
  const id = Number(req.params.id);
  const schema = z.object({
    category_id: z.number().nullable().optional(),
    image_url: z.string().optional().default("")
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.json({ ok: false, message: "Invalid ecommerce product data" });

  db.prepare(`
    UPDATE products
    SET category_id=?, image_url=?
    WHERE id=?
  `).run(parsed.data.category_id || null, parsed.data.image_url || "", id);

  res.json({ ok: true });
});

app.delete("/products/:id", auth, (req, res) => {
  const id = Number(req.params.id);
  db.prepare("UPDATE products SET active=0 WHERE id=?").run(id);
  res.json({ ok: true });
});

// ==============================
// CUSTOMERS
// ==============================
app.get("/customers", auth, (req, res) => {
  const rows = db.prepare(`
    SELECT *
    FROM customers
    ORDER BY id DESC
  `).all();

  res.json({ ok: true, customers: rows });
});

app.post("/customers", auth, (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    phone: z.string().optional().default(""),
    email: z.string().optional().default(""),
    kra_pin: z.string().optional().default(""),
    account_balance: z.coerce.number().min(0).optional().default(0),
    credit_limit: z.coerce.number().min(0).optional().default(0),
    allow_credit: z.coerce.number().optional().default(0),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.json({ ok: false, message: "Invalid input" });

  const c = parsed.data;

  db.prepare(`
    INSERT INTO customers (
      name, phone, email, kra_pin, loyalty_points,
      account_balance, credit_limit, credit_used, allow_credit
    ) VALUES (?,?,?,?,0,?,?,0,?)
  `).run(
    c.name.trim(),
    c.phone.trim(),
    c.email.trim(),
    c.kra_pin.trim(),
    c.account_balance,
    c.credit_limit,
    c.allow_credit ? 1 : 0
  );

  res.json({ ok: true });
});

app.post("/customers/:id/topup", auth, (req, res) => {
  try {
    const id = Number(req.params.id);
    const schema = z.object({
      amount: z.coerce.number().positive(),
      note: z.string().optional().default("Account Top-up"),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.json({ ok: false, message: "Invalid top-up data" });

    const customer = db.prepare("SELECT * FROM customers WHERE id=?").get(id);
    if (!customer) return res.json({ ok: false, message: "Customer not found" });

    db.prepare(`
      UPDATE customers
      SET account_balance = account_balance + ?
      WHERE id=?
    `).run(parsed.data.amount, id);

    return res.json({ ok: true, message: "Customer account topped up" });
  } catch (e) {
    return res.json({ ok: false, message: String(e.message || e) });
  }
});

app.put("/customers/:id/credit-settings", auth, (req, res) => {
  try {
    const id = Number(req.params.id);
    const schema = z.object({
      allow_credit: z.coerce.number().optional().default(0),
      credit_limit: z.coerce.number().min(0).optional().default(0),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.json({ ok: false, message: "Invalid credit settings" });

    const customer = db.prepare("SELECT * FROM customers WHERE id=?").get(id);
    if (!customer) return res.json({ ok: false, message: "Customer not found" });

    db.prepare(`
      UPDATE customers
      SET allow_credit=?, credit_limit=?
      WHERE id=?
    `).run(parsed.data.allow_credit ? 1 : 0, parsed.data.credit_limit, id);

    return res.json({ ok: true, message: "Credit settings updated" });
  } catch (e) {
    return res.json({ ok: false, message: String(e.message || e) });
  }
});

app.get("/customers/:id/account-summary", auth, (req, res) => {
  try {
    const id = Number(req.params.id);
    const customer = db.prepare(`
      SELECT id, name, phone, email, kra_pin, loyalty_points,
             account_balance, credit_limit, credit_used, allow_credit
      FROM customers
      WHERE id=?
    `).get(id);

    if (!customer) return res.json({ ok: false, message: "Customer not found" });

    return res.json({ ok: true, customer });
  } catch (e) {
    return res.json({ ok: false, message: String(e.message || e) });
  }
});

// ==============================
// SUPPLIERS
// ==============================
app.get("/suppliers", auth, (req, res) => {
  const rows = db.prepare("SELECT * FROM suppliers ORDER BY id DESC").all();
  res.json({ ok: true, suppliers: rows });
});

app.post("/suppliers", auth, (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    phone: z.string().optional().default(""),
    email: z.string().optional().default(""),
    kra_pin: z.string().optional().default("")
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.json({ ok: false, message: "Invalid input" });

  const s = parsed.data;
  db.prepare("INSERT INTO suppliers (name, phone, email, kra_pin) VALUES (?,?,?,?)")
    .run(s.name.trim(), s.phone.trim(), s.email.trim(), s.kra_pin.trim());

  res.json({ ok: true });
});

// ==============================
// POS
// ==============================
app.post("/pos/complete-sale", auth, (req, res) => {
  const schema = z.object({
    items: z.array(z.object({
      product_id: z.number(),
      qty: z.number().positive(),
      price: z.number().nonnegative()
    })).min(1),
    customer_id: z.number().nullable().optional(),
    payment_mode: z.enum(["Cash", "Mpesa", "Bank", "Cheque", "Account", "Credit"]),
    payment_ref: z.string().optional().default(""),
    amount_paid: z.number().nonnegative().optional().default(0)
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.json({ ok: false, message: "Invalid sale payload" });

  const sale = parsed.data;

  if (["Mpesa", "Bank", "Cheque"].includes(sale.payment_mode) && sale.payment_ref.trim().length < 2) {
    return res.json({ ok: false, message: "Reference code required for " + sale.payment_mode });
  }

  if (["Account", "Credit"].includes(sale.payment_mode) && !sale.customer_id) {
    return res.json({ ok: false, message: "Choose a customer for Account or Credit sale" });
  }

  let total = 0;
  for (const it of sale.items) total += it.qty * it.price;
  total = Number(total.toFixed(2));

  let amount_paid = Number(sale.amount_paid || 0);
  let change_given = 0;

  if (sale.payment_mode === "Cash") {
    if (amount_paid < total) return res.json({ ok: false, message: "Money less than total" });
    change_given = Number((amount_paid - total).toFixed(2));
  } else if (["Mpesa", "Bank", "Cheque"].includes(sale.payment_mode)) {
    amount_paid = total;
    change_given = 0;
  } else if (sale.payment_mode === "Account") {
    amount_paid = total;
    change_given = 0;
  } else if (sale.payment_mode === "Credit") {
    amount_paid = 0;
    change_given = 0;
  }

  const tx = db.transaction(() => {
    for (const it of sale.items) {
      const p = db.prepare("SELECT id,name,stock FROM products WHERE id=? AND active=1").get(it.product_id);
      if (!p) throw new Error("Product not found");
      if (Number(p.stock) < it.qty) throw new Error("Insufficient stock for " + p.name);
    }

    let customer = null;
    if (sale.customer_id) {
      customer = db.prepare("SELECT * FROM customers WHERE id=?").get(sale.customer_id);
      if (!customer) throw new Error("Customer not found");
    }

    if (sale.payment_mode === "Account") {
      if (!customer) throw new Error("Customer account required");
      if (Number(customer.account_balance || 0) < total) {
        throw new Error("Customer account balance is not enough");
      }
      db.prepare(`
        UPDATE customers
        SET account_balance = account_balance - ?
        WHERE id=?
      `).run(total, customer.id);
    }

    if (sale.payment_mode === "Credit") {
      if (!customer) throw new Error("Customer required for credit sale");
      if (!Number(customer.allow_credit || 0)) {
        throw new Error("This customer is not allowed to buy on credit");
      }

      const available = Number(customer.credit_limit || 0) - Number(customer.credit_used || 0);
      if (available < total) {
        throw new Error("Credit limit exceeded. Available credit is " + available.toFixed(2));
      }

      db.prepare(`
        UPDATE customers
        SET credit_used = credit_used + ?
        WHERE id=?
      `).run(total, customer.id);
    }

    const receipt_no = nextNo("receipt", "BR-");
    const ins = db.prepare(`
      INSERT INTO pos_sales (
        receipt_no, customer_id, total, payment_mode, payment_ref, amount_paid, change_given
      )
      VALUES (?,?,?,?,?,?,?)
    `).run(
      receipt_no,
      sale.customer_id || null,
      total,
      sale.payment_mode,
      sale.payment_ref,
      amount_paid,
      change_given
    );

    const sale_id = ins.lastInsertRowid;

    for (const it of sale.items) {
      const p = db.prepare("SELECT id,name,barcode FROM products WHERE id=?").get(it.product_id);
      const subtotal = Number((it.qty * it.price).toFixed(2));

      db.prepare(`
        INSERT INTO pos_sale_items (sale_id, product_id, name, barcode, qty, price, subtotal)
        VALUES (?,?,?,?,?,?,?)
      `).run(sale_id, p.id, p.name, p.barcode || "", it.qty, it.price, subtotal);

      const upd = db.prepare("UPDATE products SET stock = stock - ? WHERE id=? AND stock >= ?")
        .run(it.qty, p.id, it.qty);
      if (upd.changes === 0) throw new Error("Stock update failed for " + p.name);

      db.prepare(`
        INSERT INTO stock_moves (move_type, ref, product_id, qty, note)
        VALUES ('POS_SALE', ?, ?, ?, 'POS Sale')
      `).run(receipt_no, p.id, -Math.abs(it.qty));
    }

    if (sale.customer_id) {
      const addPts = Math.floor(total / 100);
      if (addPts > 0) {
        db.prepare("UPDATE customers SET loyalty_points = loyalty_points + ? WHERE id=?")
          .run(addPts, sale.customer_id);
      }
    }

    if (["Cash", "Mpesa", "Bank", "Cheque", "Account"].includes(sale.payment_mode)) {
      db.prepare(`
        INSERT INTO payments (source, ref, mode, pay_ref, amount)
        VALUES ('POS', ?, ?, ?, ?)
      `).run(receipt_no, sale.payment_mode, sale.payment_ref || "", total);
    }

    return { sale_id, receipt_no, total, change_given, payment_mode: sale.payment_mode };
  });

  try {
    return res.json({ ok: true, result: tx() });
  } catch (e) {
    return res.json({ ok: false, message: String(e.message || e) });
  }
});

app.get("/pos/receipts", auth, (req, res) => {
  const limit = Math.min(Number(req.query.limit || 30), 200);
  const rows = db.prepare(`
    SELECT receipt_no, total, payment_mode, created_at
    FROM pos_sales
    ORDER BY id DESC
    LIMIT ?
  `).all(limit);
  res.json({ ok: true, receipts: rows });
});

app.get("/pos/receipt/:receiptNo", auth, (req, res) => {
  const receiptNo = String(req.params.receiptNo || "").trim();
  if (!receiptNo) return res.json({ ok: false, message: "Receipt number required" });

  const company = db.prepare("SELECT * FROM company WHERE id=1").get();

  const sale = db.prepare(`
    SELECT s.*, c.name AS customer_name, c.phone AS customer_phone, c.kra_pin AS customer_kra_pin
    FROM pos_sales s
    LEFT JOIN customers c ON c.id = s.customer_id
    WHERE s.receipt_no = ?
  `).get(receiptNo);

  if (!sale) return res.json({ ok: false, message: "Receipt not found" });

  const items = db.prepare(`
    SELECT name, barcode, qty, price, subtotal
    FROM pos_sale_items
    WHERE sale_id = ?
    ORDER BY id ASC
  `).all(sale.id);

  res.json({ ok: true, company, sale, items });
});

app.get("/public/receipt/:receiptNo", (req, res) => {
  const receiptNo = String(req.params.receiptNo || "").trim();
  if (!receiptNo) return res.status(400).json({ ok: false, message: "Receipt number required" });

  const company = db.prepare("SELECT name, kra_pin, phone, location, receipt_footer FROM company WHERE id=1").get();

  const sale = db.prepare(`
    SELECT receipt_no, total, payment_mode, payment_ref, amount_paid, change_given, created_at
    FROM pos_sales WHERE receipt_no=?
  `).get(receiptNo);

  if (!sale) return res.status(404).json({ ok: false, message: "Receipt not found" });

  const items = db.prepare(`
    SELECT name, qty, price, subtotal, barcode
    FROM pos_sale_items
    WHERE sale_id = (SELECT id FROM pos_sales WHERE receipt_no=?)
    ORDER BY id ASC
  `).all(receiptNo);

  return res.json({ ok: true, company, sale, items });
});

// ==============================
// REPORTS
// ==============================
app.get("/reports/pos/daily-total", auth, (req, res) => {
  const row = db.prepare(`
    SELECT SUM(total) AS total
    FROM pos_sales
    WHERE date(created_at) = date('now')
  `).get();

  res.json({ ok: true, total: Number(row?.total || 0) });
});

app.get("/reports/pos/items-sold", auth, (req, res) => {
  const rows = db.prepare(`
    SELECT name, SUM(qty) AS qty
    FROM pos_sale_items
    WHERE sale_id IN (SELECT id FROM pos_sales WHERE date(created_at)=date('now'))
    GROUP BY name
    ORDER BY qty DESC
  `).all();

  res.json({ ok: true, items: rows });
});

// ==============================
// PURCHASE
// ==============================
app.get("/purchase/rfqs", auth, (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, s.name AS supplier_name
    FROM purchase_orders p
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    ORDER BY p.id DESC
    LIMIT 200
  `).all();

  res.json({ ok: true, rfqs: rows });
});

app.post("/purchase/rfqs", auth, (req, res) => {
  const schema = z.object({
    supplier_id: z.number().nullable().optional(),
    note: z.string().optional().default("")
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.json({ ok: false, message: "Invalid input" });

  const po_no = nextNo("po", "PO-");
  db.prepare("INSERT INTO purchase_orders (po_no, supplier_id, note) VALUES (?,?,?)")
    .run(po_no, parsed.data.supplier_id || null, parsed.data.note);

  res.json({ ok: true, po_no });
});

app.get("/purchase/rfqs/:poNo", auth, (req, res) => {
  const poNo = String(req.params.poNo || "").trim();
  const po = db.prepare(`
    SELECT p.*, s.name AS supplier_name, s.kra_pin AS supplier_kra_pin
    FROM purchase_orders p
    LEFT JOIN suppliers s ON s.id=p.supplier_id
    WHERE p.po_no=?
  `).get(poNo);

  if (!po) return res.json({ ok: false, message: "Not found" });

  const items = db.prepare(`
    SELECT i.*, pr.name AS product_name, pr.barcode AS barcode
    FROM purchase_order_items i
    JOIN products pr ON pr.id=i.product_id
    WHERE i.po_id=?
    ORDER BY i.id ASC
  `).all(po.id);

  res.json({ ok: true, po, items });
});

app.post("/purchase/rfqs/:poNo/add-item", auth, (req, res) => {
  const poNo = String(req.params.poNo || "").trim();
  const schema = z.object({
    product_id: z.number(),
    qty: z.coerce.number().positive(),
    cost: z.coerce.number().min(0)
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.json({ ok: false, message: "Invalid item" });

  const po = db.prepare("SELECT * FROM purchase_orders WHERE po_no=?").get(poNo);
  if (!po) return res.json({ ok: false, message: "RFQ not found" });
  if (po.status !== "RFQ") return res.json({ ok: false, message: "Cannot edit after confirm" });

  const p = db.prepare("SELECT id FROM products WHERE id=? AND active=1").get(parsed.data.product_id);
  if (!p) return res.json({ ok: false, message: "Product not found" });

  const subtotal = sum2(parsed.data.qty * parsed.data.cost);
  db.prepare(`
    INSERT INTO purchase_order_items (po_id, product_id, qty, cost, subtotal)
    VALUES (?,?,?,?,?)
  `).run(po.id, parsed.data.product_id, parsed.data.qty, parsed.data.cost, subtotal);

  res.json({ ok: true });
});

app.post("/purchase/rfqs/:poNo/confirm", auth, (req, res) => {
  const poNo = String(req.params.poNo || "").trim();
  const po = db.prepare("SELECT * FROM purchase_orders WHERE po_no=?").get(poNo);
  if (!po) return res.json({ ok: false, message: "RFQ not found" });

  db.prepare("UPDATE purchase_orders SET status='CONFIRMED' WHERE id=?").run(po.id);
  res.json({ ok: true });
});

app.post("/purchase/rfqs/:poNo/receive", auth, (req, res) => {
  const poNo = String(req.params.poNo || "").trim();
  const po = db.prepare("SELECT * FROM purchase_orders WHERE po_no=?").get(poNo);
  if (!po) return res.json({ ok: false, message: "RFQ not found" });
  if (po.status === "RECEIVED") return res.json({ ok: false, message: "Already received" });

  const items = db.prepare("SELECT * FROM purchase_order_items WHERE po_id=?").all(po.id);
  if (items.length === 0) return res.json({ ok: false, message: "No items" });

  const tx = db.transaction(() => {
    for (const it of items) {
      db.prepare("UPDATE products SET stock = stock + ? WHERE id=?").run(it.qty, it.product_id);
      db.prepare(`
        INSERT INTO stock_moves (move_type, ref, product_id, qty, note)
        VALUES ('PURCHASE_RECEIPT', ?, ?, ?, 'PO Receive')
      `).run(poNo, it.product_id, it.qty);

      db.prepare(`
        INSERT INTO journal_entries (ref, journal_code, entry_type, amount, note)
        VALUES (?, 'PURCHASE', 'DEBIT', ?, 'PO Receipt')
      `).run(poNo, sum2(it.subtotal));
    }

    db.prepare("UPDATE purchase_orders SET status='RECEIVED' WHERE id=?").run(po.id);
  });

  try {
    tx();
    return res.json({ ok: true });
  } catch (e) {
    return res.json({ ok: false, message: String(e.message || e) });
  }
});

// ==============================
// SALES
// ==============================
app.get("/sales/quotes", auth, (req, res) => {
  const rows = db.prepare(`
    SELECT q.*, c.name AS customer_name
    FROM sales_quotes q
    LEFT JOIN customers c ON c.id=q.customer_id
    ORDER BY q.id DESC
    LIMIT 200
  `).all();

  res.json({ ok: true, quotes: rows });
});

app.post("/sales/quotes", auth, (req, res) => {
  const schema = z.object({
    customer_id: z.number().nullable().optional(),
    note: z.string().optional().default("")
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.json({ ok: false, message: "Invalid input" });

  const quote_no = nextNo("quote", "Q-");
  db.prepare("INSERT INTO sales_quotes (quote_no, customer_id, note) VALUES (?,?,?)")
    .run(quote_no, parsed.data.customer_id || null, parsed.data.note);

  res.json({ ok: true, quote_no });
});

app.get("/sales/quotes/:quoteNo", auth, (req, res) => {
  const quoteNo = String(req.params.quoteNo || "").trim();
  const q = db.prepare(`
    SELECT q.*, c.name AS customer_name, c.kra_pin AS customer_kra_pin
    FROM sales_quotes q
    LEFT JOIN customers c ON c.id=q.customer_id
    WHERE q.quote_no=?
  `).get(quoteNo);

  if (!q) return res.json({ ok: false, message: "Not found" });

  const items = db.prepare(`
    SELECT i.*, p.name AS product_name, p.barcode AS barcode
    FROM sales_quote_items i
    JOIN products p ON p.id=i.product_id
    WHERE i.quote_id=?
    ORDER BY i.id ASC
  `).all(q.id);

  res.json({ ok: true, quote: q, items });
});

app.post("/sales/quotes/:quoteNo/add-item", auth, (req, res) => {
  const quoteNo = String(req.params.quoteNo || "").trim();
  const schema = z.object({
    product_id: z.number(),
    qty: z.coerce.number().positive(),
    price: z.coerce.number().min(0)
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.json({ ok: false, message: "Invalid item" });

  const q = db.prepare("SELECT * FROM sales_quotes WHERE quote_no=?").get(quoteNo);
  if (!q) return res.json({ ok: false, message: "Quote not found" });
  if (q.status !== "DRAFT") return res.json({ ok: false, message: "Cannot edit confirmed quote" });

  const p = db.prepare("SELECT id FROM products WHERE id=? AND active=1").get(parsed.data.product_id);
  if (!p) return res.json({ ok: false, message: "Product not found" });

  const subtotal = sum2(parsed.data.qty * parsed.data.price);
  db.prepare(`
    INSERT INTO sales_quote_items (quote_id, product_id, qty, price, subtotal)
    VALUES (?,?,?,?,?)
  `).run(q.id, parsed.data.product_id, parsed.data.qty, parsed.data.price, subtotal);

  res.json({ ok: true });
});

app.post("/sales/quotes/:quoteNo/confirm", auth, (req, res) => {
  const quoteNo = String(req.params.quoteNo || "").trim();
  const q = db.prepare("SELECT * FROM sales_quotes WHERE quote_no=?").get(quoteNo);
  if (!q) return res.json({ ok: false, message: "Quote not found" });
  if (q.status !== "DRAFT") return res.json({ ok: false, message: "Already confirmed" });

  const items = db.prepare("SELECT * FROM sales_quote_items WHERE quote_id=?").all(q.id);
  if (items.length === 0) return res.json({ ok: false, message: "Quote has no items" });

  const so_no = nextNo("so", "SO-");

  const tx = db.transaction(() => {
    db.prepare("UPDATE sales_quotes SET status='CONFIRMED' WHERE id=?").run(q.id);
    db.prepare("INSERT INTO sales_orders (so_no, quote_no, customer_id) VALUES (?,?,?)")
      .run(so_no, quoteNo, q.customer_id || null);

    const so = db.prepare("SELECT id FROM sales_orders WHERE so_no=?").get(so_no);

    for (const it of items) {
      db.prepare(`
        INSERT INTO sales_order_items (so_id, product_id, qty, price, subtotal)
        VALUES (?,?,?,?,?)
      `).run(so.id, it.product_id, it.qty, it.price, it.subtotal);
    }
  });

  try {
    tx();
    return res.json({ ok: true, so_no });
  } catch (e) {
    return res.json({ ok: false, message: String(e.message || e) });
  }
});

app.get("/sales/orders", auth, (req, res) => {
  const rows = db.prepare(`
    SELECT o.*, c.name AS customer_name
    FROM sales_orders o
    LEFT JOIN customers c ON c.id=o.customer_id
    ORDER BY o.id DESC
    LIMIT 200
  `).all();

  res.json({ ok: true, orders: rows });
});

app.get("/sales/orders/:soNo", auth, (req, res) => {
  const soNo = String(req.params.soNo || "").trim();
  const o = db.prepare(`
    SELECT o.*, c.name AS customer_name, c.kra_pin AS customer_kra_pin
    FROM sales_orders o
    LEFT JOIN customers c ON c.id=o.customer_id
    WHERE o.so_no=?
  `).get(soNo);

  if (!o) return res.json({ ok: false, message: "Not found" });

  const items = db.prepare(`
    SELECT i.*, p.name AS product_name, p.barcode AS barcode
    FROM sales_order_items i
    JOIN products p ON p.id=i.product_id
    WHERE i.so_id=?
    ORDER BY i.id ASC
  `).all(o.id);

  res.json({ ok: true, order: o, items });
});

app.post("/sales/orders/:soNo/deliver", auth, (req, res) => {
  const soNo = String(req.params.soNo || "").trim();
  const o = db.prepare("SELECT * FROM sales_orders WHERE so_no=?").get(soNo);
  if (!o) return res.json({ ok: false, message: "Sales order not found" });
  if (o.status === "DELIVERED") return res.json({ ok: false, message: "Already delivered" });

  const items = db.prepare("SELECT * FROM sales_order_items WHERE so_id=?").all(o.id);
  if (items.length === 0) return res.json({ ok: false, message: "No items" });

  for (const it of items) {
    const p = db.prepare("SELECT stock, name FROM products WHERE id=? AND active=1").get(it.product_id);
    if (!p) return res.json({ ok: false, message: "Product missing" });
    if (Number(p.stock) < Number(it.qty)) return res.json({ ok: false, message: `Insufficient stock for ${p.name}` });
  }

  const dn_no = nextNo("dn", "DN-");

  const tx = db.transaction(() => {
    db.prepare("INSERT INTO delivery_notes (dn_no, so_no, customer_id) VALUES (?,?,?)")
      .run(dn_no, soNo, o.customer_id || null);

    const dn = db.prepare("SELECT id FROM delivery_notes WHERE dn_no=?").get(dn_no);

    for (const it of items) {
      db.prepare("UPDATE products SET stock = stock - ? WHERE id=?").run(it.qty, it.product_id);
      db.prepare("INSERT INTO delivery_note_items (dn_id, product_id, qty) VALUES (?,?,?)")
        .run(dn.id, it.product_id, it.qty);

      db.prepare(`
        INSERT INTO stock_moves (move_type, ref, product_id, qty, note)
        VALUES ('SALE_DELIVERY', ?, ?, ?, 'Delivery Note')
      `).run(dn_no, it.product_id, -Math.abs(it.qty));
    }

    db.prepare("UPDATE sales_orders SET status='DELIVERED' WHERE id=?").run(o.id);
  });

  try {
    tx();
    return res.json({ ok: true, dn_no });
  } catch (e) {
    return res.json({ ok: false, message: String(e.message || e) });
  }
});

app.post("/sales/orders/:soNo/invoice", auth, (req, res) => {
  const soNo = String(req.params.soNo || "").trim();
  const o = db.prepare("SELECT * FROM sales_orders WHERE so_no=?").get(soNo);
  if (!o) return res.json({ ok: false, message: "Sales order not found" });
  if (o.status !== "DELIVERED") return res.json({ ok: false, message: "Invoice only after Delivery Note" });

  const dn = db.prepare("SELECT * FROM delivery_notes WHERE so_no=? ORDER BY id DESC LIMIT 1").get(soNo);
  if (!dn) return res.json({ ok: false, message: "No delivery note found" });

  const exists = db.prepare("SELECT inv_no FROM invoices WHERE dn_no=?").get(dn.dn_no);
  if (exists) return res.json({ ok: false, message: "Invoice already posted: " + exists.inv_no });

  const items = db.prepare("SELECT * FROM sales_order_items WHERE so_id=?").all(o.id);
  const total = sum2(items.reduce((s, it) => s + Number(it.subtotal || 0), 0));
  const inv_no = nextNo("inv", "INV-");

  const tx = db.transaction(() => {
    db.prepare("INSERT INTO invoices (inv_no, dn_no, so_no, customer_id, total) VALUES (?,?,?,?,?)")
      .run(inv_no, dn.dn_no, soNo, o.customer_id || null, total);

    for (const it of items) {
      db.prepare(`
        INSERT INTO invoice_items (inv_no, product_id, qty, price, subtotal)
        VALUES (?,?,?,?,?)
      `).run(inv_no, it.product_id, it.qty, it.price, it.subtotal);
    }

    db.prepare(`
      INSERT INTO journal_entries (ref, journal_code, entry_type, amount, note)
      VALUES (?, 'SALES', 'CREDIT', ?, 'Invoice Posted')
    `).run(inv_no, total);
  });

  try {
    tx();
    return res.json({ ok: true, inv_no, total, dn_no: dn.dn_no });
  } catch (e) {
    return res.json({ ok: false, message: String(e.message || e) });
  }
});

// ==============================
// PRINT DATA
// ==============================
app.get("/sales/dn/:dnNo", auth, (req, res) => {
  try {
    const dnNo = String(req.params.dnNo || "").trim();

    const dn = db.prepare(`
      SELECT dn.*, c.name AS customer_name, c.kra_pin AS customer_kra_pin
      FROM delivery_notes dn
      LEFT JOIN customers c ON c.id = dn.customer_id
      WHERE dn.dn_no = ?
    `).get(dnNo);

    if (!dn) return res.status(404).json({ ok: false, message: "DN not found" });

    const items = db.prepare(`
      SELECT i.*, p.name AS product_name, p.reference, p.barcode
      FROM delivery_note_items i
      JOIN products p ON p.id = i.product_id
      WHERE i.dn_id = ?
      ORDER BY i.id ASC
    `).all(dn.id);

    const company = db.prepare("SELECT * FROM company WHERE id=1").get();

    return res.json({ ok: true, dn, items, company });
  } catch (e) {
    console.error("DN print error:", e);
    return res.status(500).json({ ok: false, message: "Server error (DN print)" });
  }
});

app.get("/sales/invoices/:invNo", auth, (req, res) => {
  try {
    const invNo = String(req.params.invNo || "").trim();

    const inv = db.prepare(`
      SELECT inv.*, c.name AS customer_name, c.kra_pin AS customer_kra_pin
      FROM invoices inv
      LEFT JOIN customers c ON c.id = inv.customer_id
      WHERE inv.inv_no = ?
    `).get(invNo);

    if (!inv) return res.status(404).json({ ok: false, message: "Invoice not found" });

    const dn = db.prepare("SELECT * FROM delivery_notes WHERE dn_no=?").get(inv.dn_no);
    const so = dn ? db.prepare("SELECT * FROM sales_orders WHERE so_no=?").get(dn.so_no) : null;

    const items = db.prepare(`
      SELECT ii.*, p.name AS product_name, p.reference, p.barcode
      FROM invoice_items ii
      JOIN products p ON p.id = ii.product_id
      WHERE ii.inv_no = ?
      ORDER BY ii.id ASC
    `).all(invNo);

    const company = db.prepare("SELECT * FROM company WHERE id=1").get();

    return res.json({ ok: true, inv, dn, so, items, company });
  } catch (e) {
    console.error("INV print error:", e);
    return res.status(500).json({ ok: false, message: "Server error (Invoice print)" });
  }
});

// ==============================
// INVENTORY
// ==============================
app.get("/inventory/overview", auth, (req, res) => {
  const products = db.prepare(`
    SELECT id, name, barcode, reference, stock, price, cost
    FROM products
    WHERE active=1
    ORDER BY name ASC
    LIMIT 5000
  `).all();

  const moves = db.prepare(`
    SELECT sm.id, sm.move_type, sm.ref, sm.product_id,
           p.name AS product_name, sm.qty, sm.note, sm.created_at
    FROM stock_moves sm
    LEFT JOIN products p ON p.id=sm.product_id
    ORDER BY sm.id DESC
    LIMIT 300
  `).all();

  res.json({ ok: true, products, moves });
});

// ==============================
// ACCOUNTING
// ==============================
app.get("/accounting/summary/today", auth, (req, res) => {
  const sales = db.prepare(`
    SELECT SUM(total) AS total
    FROM pos_sales
    WHERE date(created_at)=date('now')
  `).get();

  const invoices = db.prepare(`
    SELECT SUM(total) AS total
    FROM invoices
    WHERE date(created_at)=date('now')
  `).get();

  const byMode = db.prepare(`
    SELECT mode, SUM(amount) AS total
    FROM payments
    WHERE date(created_at)=date('now')
    GROUP BY mode
  `).all();

  res.json({
    ok: true,
    pos_total: Number(sales?.total || 0),
    invoice_total: Number(invoices?.total || 0),
    payments_by_mode: byMode.map(r => ({ mode: r.mode, total: Number(r.total || 0) }))
  });
});

app.get("/accounting/invoices", auth, (req, res) => {
  const rows = db.prepare(`
    SELECT inv.*, c.name AS customer_name, c.kra_pin AS customer_kra_pin
    FROM invoices inv
    LEFT JOIN customers c ON c.id = inv.customer_id
    ORDER BY inv.id DESC
    LIMIT 500
  `).all();

  res.json({ ok: true, invoices: rows });
});

app.get("/accounting/pos-sales", auth, (req, res) => {
  const rows = db.prepare(`
    SELECT s.*, c.name AS customer_name
    FROM pos_sales s
    LEFT JOIN customers c ON c.id = s.customer_id
    ORDER BY s.id DESC
    LIMIT 500
  `).all();

  res.json({ ok: true, sales: rows });
});

app.get("/accounting/customers", auth, (req, res) => {
  const customers = db.prepare(`
    SELECT c.id, c.name, c.phone, c.email, c.kra_pin, c.loyalty_points,
           c.account_balance, c.credit_limit, c.credit_used, c.allow_credit,
      COALESCE((
        SELECT SUM(total) FROM invoices i WHERE i.customer_id = c.id
      ),0) AS invoiced_total,
      COALESCE((
        SELECT SUM(amount) FROM payments p
        WHERE p.source IN ('POS','INVOICE') AND p.ref IN (
          SELECT receipt_no FROM pos_sales WHERE customer_id = c.id
          UNION
          SELECT inv_no FROM invoices WHERE customer_id = c.id
        )
      ),0) AS paid_total
    FROM customers c
    ORDER BY c.name ASC
  `).all().map(r => ({
    ...r,
    invoiced_total: Number(r.invoiced_total || 0),
    paid_total: Number(r.paid_total || 0),
    balance: Number((Number(r.invoiced_total || 0) - Number(r.paid_total || 0)).toFixed(2))
  }));

  res.json({ ok: true, customers });
});

app.get("/accounting/suppliers", auth, (req, res) => {
  const suppliers = db.prepare(`
    SELECT s.id, s.name, s.phone, s.email, s.kra_pin,
      COALESCE((
        SELECT SUM(i.subtotal)
        FROM purchase_orders po
        JOIN purchase_order_items i ON i.po_id = po.id
        WHERE po.supplier_id = s.id
      ),0) AS billed_total
    FROM suppliers s
    ORDER BY s.name ASC
  `).all().map(r => ({
    ...r,
    billed_total: Number(r.billed_total || 0)
  }));

  res.json({ ok: true, suppliers });
});

app.get("/accounting/customer-statement/:id", auth, (req, res) => {
  const id = Number(req.params.id);
  const customer = db.prepare(`SELECT * FROM customers WHERE id=?`).get(id);

  if (!customer) return res.json({ ok: false, message: "Customer not found" });

  const invoices = db.prepare(`
    SELECT inv_no AS ref, total AS amount, created_at, 'INVOICE' AS type
    FROM invoices
    WHERE customer_id=?
  `).all(id);

  const pos = db.prepare(`
    SELECT receipt_no AS ref, total AS amount, created_at, 'POS SALE' AS type
    FROM pos_sales
    WHERE customer_id=?
  `).all(id);

  const rows = [...invoices, ...pos].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const totalInvoiced = rows.reduce((s, r) => s + Number(r.amount || 0), 0);

  res.json({
    ok: true,
    customer,
    rows,
    total_invoiced: Number(totalInvoiced.toFixed(2))
  });
});

app.get("/accounting/supplier-statement/:id", auth, (req, res) => {
  const id = Number(req.params.id);
  const supplier = db.prepare(`SELECT * FROM suppliers WHERE id=?`).get(id);

  if (!supplier) return res.json({ ok: false, message: "Supplier not found" });

  const rows = db.prepare(`
    SELECT po.po_no AS ref, po.status, po.created_at,
           COALESCE(SUM(i.subtotal),0) AS amount
    FROM purchase_orders po
    LEFT JOIN purchase_order_items i ON i.po_id = po.id
    WHERE po.supplier_id=?
    GROUP BY po.id
    ORDER BY po.id DESC
  `).all(id).map(r => ({
    ...r,
    type: "PURCHASE",
    amount: Number(r.amount || 0)
  }));

  const totalBilled = rows.reduce((s, r) => s + Number(r.amount || 0), 0);

  res.json({
    ok: true,
    supplier,
    rows,
    total_billed: Number(totalBilled.toFixed(2))
  });
});

app.get("/accounting/margins", auth, (req, res) => {
  const posMargin = db.prepare(`
    SELECT 
      SUM(psi.subtotal) AS sales_total,
      SUM(psi.qty * COALESCE(p.cost,0)) AS cost_total
    FROM pos_sale_items psi
    LEFT JOIN products p ON p.id = psi.product_id
  `).get();

  const invMargin = db.prepare(`
    SELECT 
      SUM(ii.subtotal) AS sales_total,
      SUM(ii.qty * COALESCE(p.cost,0)) AS cost_total
    FROM invoice_items ii
    LEFT JOIN products p ON p.id = ii.product_id
  `).get();

  const sales_total = Number(posMargin?.sales_total || 0) + Number(invMargin?.sales_total || 0);
  const cost_total = Number(posMargin?.cost_total || 0) + Number(invMargin?.cost_total || 0);
  const gross_profit = Number((sales_total - cost_total).toFixed(2));
  const margin_percent = sales_total > 0 ? Number(((gross_profit / sales_total) * 100).toFixed(2)) : 0;

  const topProducts = db.prepare(`
    SELECT 
      p.name,
      SUM(ii.qty) AS qty,
      SUM(ii.subtotal) AS sales_total,
      SUM(ii.qty * COALESCE(p.cost,0)) AS cost_total
    FROM invoice_items ii
    LEFT JOIN products p ON p.id = ii.product_id
    GROUP BY p.id
    ORDER BY sales_total DESC
    LIMIT 15
  `).all().map(r => ({
    ...r,
    qty: Number(r.qty || 0),
    sales_total: Number(r.sales_total || 0),
    cost_total: Number(r.cost_total || 0),
    gross_profit: Number((Number(r.sales_total || 0) - Number(r.cost_total || 0)).toFixed(2))
  }));

  res.json({
    ok: true,
    sales_total: Number(sales_total.toFixed(2)),
    cost_total: Number(cost_total.toFixed(2)),
    gross_profit,
    margin_percent,
    top_products: topProducts
  });
});

app.get("/accounting/dashboard", auth, (req, res) => {
  const posToday = db.prepare(`
    SELECT COALESCE(SUM(total),0) AS total
    FROM pos_sales
    WHERE date(created_at)=date('now')
  `).get();

  const invoicesToday = db.prepare(`
    SELECT COALESCE(SUM(total),0) AS total
    FROM invoices
    WHERE date(created_at)=date('now')
  `).get();

  const purchaseTotal = db.prepare(`
    SELECT COALESCE(SUM(i.subtotal),0) AS total
    FROM purchase_order_items i
    JOIN purchase_orders po ON po.id = i.po_id
    WHERE po.status='RECEIVED'
  `).get();

  const stockValuation = db.prepare(`
    SELECT COALESCE(SUM(stock * cost),0) AS total
    FROM products
    WHERE active=1
  `).get();

  const paymentsByMode = db.prepare(`
    SELECT mode, COALESCE(SUM(amount),0) AS total
    FROM payments
    GROUP BY mode
    ORDER BY total DESC
  `).all().map(r => ({
    mode: r.mode,
    total: Number(r.total || 0)
  }));

  const recentInvoices = db.prepare(`
    SELECT inv.inv_no, inv.total, inv.created_at, c.name AS customer_name
    FROM invoices inv
    LEFT JOIN customers c ON c.id = inv.customer_id
    ORDER BY inv.id DESC
    LIMIT 10
  `).all();

  const recentPos = db.prepare(`
    SELECT receipt_no, total, payment_mode, created_at
    FROM pos_sales
    ORDER BY id DESC
    LIMIT 10
  `).all();

  res.json({
    ok: true,
    cards: {
      pos_today: Number(posToday.total || 0),
      invoices_today: Number(invoicesToday.total || 0),
      purchases_total: Number(purchaseTotal.total || 0),
      stock_valuation: Number(stockValuation.total || 0)
    },
    payments_by_mode: paymentsByMode,
    recent_invoices: recentInvoices,
    recent_pos: recentPos
  });
});

// ==============================
// WEBSITE / ECOMMERCE
// ==============================
app.get("/website/settings", (req, res) => {
  const settings = db.prepare("SELECT * FROM website_settings WHERE id=1").get();
  res.json({ ok: true, settings });
});

app.put("/website/settings", auth, (req, res) => {
  const schema = z.object({
    store_name: z.string().min(1),
    hero_title: z.string().optional().default(""),
    hero_subtitle: z.string().optional().default(""),
    about_text: z.string().optional().default(""),
    whatsapp: z.string().optional().default(""),
    facebook: z.string().optional().default(""),
    instagram: z.string().optional().default(""),
    tiktok: z.string().optional().default(""),
    logo_url: z.string().optional().default(""),
    banner_url: z.string().optional().default(""),
    theme_color: z.string().optional().default("#0b5bd3"),
    contact_phone: z.string().optional().default(""),
    contact_email: z.string().optional().default(""),
    contact_location: z.string().optional().default("")
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.json({ ok: false, message: "Invalid website settings" });

  const s = parsed.data;
  db.prepare(`
    UPDATE website_settings SET
      store_name=?,
      hero_title=?,
      hero_subtitle=?,
      about_text=?,
      whatsapp=?,
      facebook=?,
      instagram=?,
      tiktok=?,
      logo_url=?,
      banner_url=?,
      theme_color=?,
      contact_phone=?,
      contact_email=?,
      contact_location=?
    WHERE id=1
  `).run(
    s.store_name,
    s.hero_title,
    s.hero_subtitle,
    s.about_text,
    s.whatsapp,
    s.facebook,
    s.instagram,
    s.tiktok,
    s.logo_url,
    s.banner_url,
    s.theme_color,
    s.contact_phone,
    s.contact_email,
    s.contact_location
  );

  res.json({ ok: true });
});

app.get("/categories", auth, (req, res) => {
  const rows = db.prepare("SELECT * FROM categories ORDER BY name ASC").all();
  res.json({ ok: true, categories: rows });
});

app.post("/categories", auth, (req, res) => {
  const schema = z.object({
    name: z.string().min(1)
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.json({ ok: false, message: "Invalid category name" });

  try {
    db.prepare("INSERT INTO categories (name) VALUES (?)").run(parsed.data.name.trim());
    res.json({ ok: true });
  } catch {
    res.json({ ok: false, message: "Category already exists" });
  }
});

app.get("/shop/products", (req, res) => {
  const rows = db.prepare(`
    SELECT 
      p.id, p.name, p.reference, p.barcode, p.price, p.stock, p.tax_type, p.tax_rate,
      p.image_url, p.category_id,
      c.name AS category_name
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.active=1 AND p.stock > 0
    ORDER BY p.id DESC
    LIMIT 2000
  `).all();

  res.json({ ok: true, products: rows });
});

app.get("/shop/categories", (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.name, COUNT(p.id) AS product_count
    FROM categories c
    LEFT JOIN products p ON p.category_id = c.id AND p.active=1 AND p.stock > 0
    GROUP BY c.id
    ORDER BY c.name ASC
  `).all();

  res.json({ ok: true, categories: rows });
});

app.post("/shop/orders", (req, res) => {
  const schema = z.object({
    customer_name: z.string().min(1),
    customer_phone: z.string().min(1),
    customer_email: z.string().optional().default(""),
    delivery_location: z.string().optional().default(""),
    note: z.string().optional().default(""),
    items: z.array(z.object({
      product_id: z.number(),
      qty: z.number().positive()
    })).min(1)
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.json({ ok: false, message: "Invalid order payload" });

  const payload = parsed.data;

  const tx = db.transaction(() => {
    let total = 0;
    const computedItems = [];

    for (const item of payload.items) {
      const p = db.prepare(`
        SELECT id, name, price, stock
        FROM products
        WHERE id=? AND active=1
      `).get(item.product_id);

      if (!p) throw new Error("Product not found");
      if (Number(p.stock) < Number(item.qty)) throw new Error(`Insufficient stock for ${p.name}`);

      const subtotal = Number((Number(p.price) * Number(item.qty)).toFixed(2));
      total += subtotal;

      computedItems.push({
        product_id: p.id,
        product_name: p.name,
        qty: Number(item.qty),
        price: Number(p.price),
        subtotal
      });
    }

    total = Number(total.toFixed(2));
    const order_no = nextNo("weborder", "WEB-");

    const ins = db.prepare(`
      INSERT INTO website_orders (
        order_no, customer_name, customer_phone, customer_email,
        delivery_location, note, total
      )
      VALUES (?,?,?,?,?,?,?)
    `).run(
      order_no,
      payload.customer_name.trim(),
      payload.customer_phone.trim(),
      payload.customer_email.trim(),
      payload.delivery_location.trim(),
      payload.note.trim(),
      total
    );

    const orderId = Number(ins.lastInsertRowid);

    for (const item of computedItems) {
      db.prepare(`
        INSERT INTO website_order_items (
          order_id, product_id, product_name, qty, price, subtotal
        )
        VALUES (?,?,?,?,?,?)
      `).run(orderId, item.product_id, item.product_name, item.qty, item.price, item.subtotal);
    }

    return { order_no, total };
  });

  try {
    const result = tx();
    res.json({ ok: true, result });
  } catch (e) {
    res.json({ ok: false, message: String(e.message || e) });
  }
});

app.get("/website/orders", auth, (req, res) => {
  const rows = db.prepare(`
    SELECT *
    FROM website_orders
    ORDER BY id DESC
    LIMIT 500
  `).all();

  res.json({ ok: true, orders: rows });
});

// ==============================
// START
// ==============================
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});