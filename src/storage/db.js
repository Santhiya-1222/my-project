const fs = require("fs");
const path = require("path");

// NOTE: Uses local JSON file storage.
// On many cloud deployments (Render/Railway), local files may reset on redeploy/restart.
// Consider using a managed database for production persistence.
const dataPath = path.join(__dirname, "..", "..", "data.json");

function load() {
  if (!fs.existsSync(dataPath)) return null;
  return JSON.parse(fs.readFileSync(dataPath, "utf8"));
}

function save(state) {
  fs.writeFileSync(dataPath, JSON.stringify(state, null, 2), "utf8");
}

function nowIsoLocal() {
  // Simple local timestamp string similar to sqlite datetime('now')
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}:${pad(d.getSeconds())}`;
}

let state = null;

function svgDataUri({ label = "", bg = "#ff7a18", accent = "#ff9a3d", fg = "#111111" }) {
  const safeLabel = String(label)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .slice(0, 6);

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="320" height="220" viewBox="0 0 320 220">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${bg}" stop-opacity="0.30"/>
          <stop offset="100%" stop-color="${accent}" stop-opacity="0.14"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="320" height="220" rx="22" fill="url(#g)"/>
      <circle cx="110" cy="95" r="60" fill="${bg}" opacity="0.22"/>
      <circle cx="230" cy="125" r="72" fill="${accent}" opacity="0.16"/>
      <rect x="58" y="132" width="204" height="44" rx="16" fill="rgba(0,0,0,0.34)" stroke="rgba(255,255,255,0.12)"/>
      <text x="160" y="160" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="800" fill="${fg}">
        ${safeLabel}
      </text>
      <path d="M72 78 C98 52, 120 54, 145 80" stroke="rgba(255,255,255,0.28)" stroke-width="6" fill="none" stroke-linecap="round"/>
      <path d="M178 74 C206 46, 244 54, 252 88" stroke="rgba(255,255,255,0.18)" stroke-width="6" fill="none" stroke-linecap="round"/>
    </svg>
  `.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function ensureSchemaAndSeed() {
  state = load();
  if (state) {
    normalizeLoadedState();
    commit();
    return;
  }

  state = {
    nextIds: { user: 3, item: 1, order: 1 },
    // Student accounts only. Admin credentials are hardcoded in backend.
    users: [],
    food_items: [],
    orders: [],
  };

  const seed = [
    // Afternoon foods
    { name: "Egg Fried Rice", meal: "afternoon", price: 40, available: true, image: svgDataUri({ label: "FR" }) },
    { name: "Egg Noodles", meal: "afternoon", price: 40, available: true, image: svgDataUri({ label: "EN" }) },
    { name: "Parota (per set)", meal: "afternoon", price: 25, available: true, image: svgDataUri({ label: "PT" }) },
    { name: "Omelet", meal: "afternoon", price: 15, available: true, image: svgDataUri({ label: "OM" }) },
    { name: "Chilli Chicken (100g)", meal: "afternoon", price: 40, available: true, image: svgDataUri({ label: "CC" }) },
    { name: "Pasta", meal: "afternoon", price: 40, available: true, image: svgDataUri({ label: "PA" }) },

    // Evening snacks
    { name: "Chilli Chicken (100g)", meal: "evening", price: 40, available: true, image: svgDataUri({ label: "CC" }) },
    { name: "Omelette", meal: "evening", price: 25, available: true, image: svgDataUri({ label: "OE" }) },
    { name: "Bread Omelette", meal: "evening", price: 30, available: true, image: svgDataUri({ label: "BO" }) },
    { name: "Pani Puri", meal: "evening", price: 25, available: true, image: svgDataUri({ label: "PP" }) },
    { name: "Masala Puri", meal: "evening", price: 25, available: true, image: svgDataUri({ label: "MP" }) },
  ];

  for (const s of seed) {
    state.food_items.push({ id: state.nextIds.item++, ...s });
  }

  save(state);
}

function normalizeLoadedState() {
  if (!state) return;
  if (!state.nextIds) state.nextIds = { user: 1, item: 1, order: 1 };
  if (!state.users) state.users = [];
  if (!state.food_items) state.food_items = [];
  if (!state.orders) state.orders = [];

  // Ensure numeric nextIds
  state.nextIds.user = Number(state.nextIds.user || 1);
  state.nextIds.item = Number(state.nextIds.item || 1);
  state.nextIds.order = Number(state.nextIds.order || 1);

  // Orders migration: support cart checkout with line items and paid status.
  for (const o of state.orders) {
    if (!("lines" in o)) {
      // Back-compat: convert single-item order into lines array
      o.lines = [
        {
          item_id: o.item_id,
          item_name: o.item_name,
          unit_price: o.unit_price,
          quantity: o.quantity,
          line_total: o.total_price,
        },
      ];
    }
    if (!("paid" in o)) {
      o.paid = o.pay_method === "online" ? true : !!o.paid_online;
    }
    if (!("slot" in o)) {
      // Derive slot from first line if possible, default unknown
      o.slot = "unknown";
    }
  }

  // Backward compat for old user records:
  // Only allow student login for records that have `email` and `studentId`.
  for (const u of state.users) {
    if (!u.role) u.role = "student";
    // Ensure numeric id
    u.id = Number(u.id || 0);
  }
}

function getState() {
  if (!state) ensureSchemaAndSeed();
  return state;
}

function commit() {
  save(state);
}

function findUserByCredentials(username, password) {
  const s = getState();
  return s.users.find((u) => u.username === username && u.password === password) || null;
}

function findStudentByEmail(email) {
  const s = getState();
  const e = String(email || "").trim().toLowerCase();
  if (!e) return null;
  return s.users.find((u) => u.role === "student" && String(u.email || "").toLowerCase() === e) || null;
}

function registerStudent({ name, email, studentId, password }) {
  const s = getState();
  const n = String(name || "").trim();
  const e = String(email || "").trim().toLowerCase();
  const sid = String(studentId || "").trim();
  const p = String(password || "");

  if (!n) throw new Error("Name is required.");
  if (!e) throw new Error("Email is required.");
  if (!sid) throw new Error("Student ID is required.");
  if (!p) throw new Error("Password is required.");

  const existsEmail = findStudentByEmail(e);
  if (existsEmail) throw new Error("Email already registered.");
  const existsSid = s.users.find((u) => u.role === "student" && String(u.studentId || "") === sid);
  if (existsSid) throw new Error("Student ID already registered.");

  const user = {
    id: s.nextIds.user++,
    role: "student",
    name: n,
    email: e,
    studentId: sid,
    password: p,
  };
  s.users.push(user);
  commit();
  return { id: user.id, name: user.name, email: user.email, studentId: user.studentId };
}

function validateStudentLogin({ email, password }) {
  const u = findStudentByEmail(email);
  if (!u) return null;
  // Enforce registration requirement (email + studentId exist).
  if (!u.studentId || !u.email) return null;
  const p = String(password || "");
  if (u.password !== p) return null;
  return { id: u.id, name: u.name, email: u.email, studentId: u.studentId };
}

function listFoodItems() {
  const s = getState();
  return [...s.food_items].sort((a, b) => (a.meal + a.name).localeCompare(b.meal + b.name));
}

function listFoodItemsByMeal(meal) {
  const s = getState();
  return s.food_items.filter((i) => i.meal === meal).sort((a, b) => a.name.localeCompare(b.name));
}

function getFoodItem(id) {
  const s = getState();
  return s.food_items.find((i) => i.id === id) || null;
}

function addFoodItem({ name, meal, price, available }) {
  const s = getState();
  const item = {
    id: s.nextIds.item++,
    name,
    meal,
    price,
    available: !!available,
    image: svgDataUri({ label: String(name).slice(0, 2).toUpperCase() || "FD" }),
  };
  s.food_items.push(item);
  commit();
  return item;
}

function updateFoodItem(id, { price, available }) {
  const s = getState();
  const item = s.food_items.find((i) => i.id === id);
  if (!item) return null;
  item.price = price;
  item.available = !!available;
  // Keep item.image if it already exists.
  commit();
  return item;
}

function deleteFoodItem(id) {
  const s = getState();
  const before = s.food_items.length;
  s.food_items = s.food_items.filter((i) => i.id !== id);
  commit();
  return s.food_items.length !== before;
}

function addOrder({ user_id, item_id, item_name, unit_price, quantity, total_price, pay_method, paid_online, payment_ref, notes }) {
  const s = getState();
  const order = {
    id: s.nextIds.order++,
    user_id,
    item_id,
    item_name,
    unit_price,
    quantity,
    total_price,
    pay_method,
    paid_online: !!paid_online,
    paid: pay_method === "online" ? true : !!paid_online,
    payment_ref: payment_ref || null,
    notes: notes || "",
    created_at: nowIsoLocal(),
    slot: "unknown",
    lines: [
      {
        item_id,
        item_name,
        unit_price,
        quantity,
        line_total: total_price,
      },
    ],
  };
  s.orders.push(order);
  commit();
  return order;
}

function addCartOrder({ user_id, lines, pay_method, payment_ref, notes, slot }) {
  const s = getState();
  const safeLines = (lines || [])
    .filter((l) => l && Number.isFinite(Number(l.quantity)) && Number(l.quantity) > 0)
    .map((l) => ({
      item_id: Number(l.item_id),
      item_name: String(l.item_name || ""),
      unit_price: Number(l.unit_price),
      quantity: Number(l.quantity),
      line_total: Number(l.unit_price) * Number(l.quantity),
    }));

  const total = safeLines.reduce((sum, l) => sum + l.line_total, 0);
  const headline =
    safeLines.length === 0
      ? "Empty order"
      : safeLines.length === 1
        ? safeLines[0].item_name
        : `${safeLines[0].item_name} + ${safeLines.length - 1} more`;

  const first = safeLines[0] || { item_id: 0, item_name: headline, unit_price: 0, quantity: 0 };
  const paid = pay_method === "online";

  const order = {
    id: s.nextIds.order++,
    user_id,
    item_id: first.item_id,
    item_name: headline,
    unit_price: first.unit_price,
    quantity: safeLines.reduce((sum, l) => sum + l.quantity, 0),
    total_price: total,
    pay_method,
    paid_online: paid,
    paid,
    payment_ref: payment_ref || null,
    notes: notes || "",
    created_at: nowIsoLocal(),
    slot: slot || "unknown",
    lines: safeLines,
  };

  s.orders.push(order);
  commit();
  return order;
}

function listOrdersByUser(userId) {
  const s = getState();
  return s.orders.filter((o) => o.user_id === userId).sort((a, b) => b.id - a.id).slice(0, 50);
}

function listOrdersAllWithUsernames() {
  const s = getState();
  const byId = new Map(s.users.map((u) => [u.id, u]));
  return s.orders
    .slice()
    .sort((a, b) => b.id - a.id)
    .slice(0, 200)
    .map((o) => {
      const u = byId.get(o.user_id);
      return { ...o, username: u?.name || u?.email || u?.studentId || "unknown" };
    });
}

function setOrderPaid(orderId, paid) {
  const s = getState();
  const o = s.orders.find((x) => x.id === orderId);
  if (!o) return null;
  o.paid = !!paid;
  if (o.pay_method === "online") o.paid = true;
  commit();
  return o;
}

module.exports = {
  ensureSchemaAndSeed,
  // Backward compat (not used by the new auth system)
  findUserByCredentials,
  registerStudent,
  validateStudentLogin,
  findStudentByEmail,
  listFoodItems,
  listFoodItemsByMeal,
  getFoodItem,
  addFoodItem,
  updateFoodItem,
  deleteFoodItem,
  addOrder,
  addCartOrder,
  listOrdersByUser,
  listOrdersAllWithUsernames,
  setOrderPaid,
};

