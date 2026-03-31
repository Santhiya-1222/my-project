const path = require("path");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const cookieParser = require("cookie-parser");

const store = require("./storage/db");
const { requireAuth, requireRole } = require("./web/middleware/auth");
const { getOrderingState } = require("./web/time/ordering");

store.ensureSchemaAndSeed();

const app = express();
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "web", "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
  })
);

app.use("/static", express.static(path.join(__dirname, "web", "static")));

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.ordering = getOrderingState(new Date());
  next();
});

app.get("/health", (req, res) => {
  res.type("text/plain").send("OK");
});

app.get("/", (req, res) => {
  res.render("login"); // or "home" or your main page
});

// Auth
app.get("/login", (req, res) => res.render("login", { error: null }));

app.post("/login/admin", (req, res) => {
  const adminId = String(req.body.username || "").trim();
  const password = String(req.body.password || "");

  // Hardcoded admin credentials (no registration)
  if (adminId !== "kc@6213" || password !== "kc6213") {
    return res.status(401).render("login", { error: "Invalid admin credentials." });
  }

  req.session.user = { id: "admin", username: "admin", role: "admin" };
  return res.redirect("/admin/dashboard");
});

app.post("/login/student", (req, res) => {
  const email = String(req.body.email || "").trim();
  const password = String(req.body.password || "");

  const student = store.validateStudentLogin({ email, password });
  if (!student) return res.status(401).render("login", { error: "Invalid student credentials. Please register first." });

  req.session.user = { id: student.id, username: student.name, role: "student", studentId: student.studentId };
  return res.redirect("/home");
});

app.get("/register", (req, res) => {
  if (req.session.user?.role === "student") return res.redirect("/home");
  return res.render("student-register", { error: null });
});

app.post("/register/student", (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim();
  const studentId = String(req.body.studentId || "").trim();
  const password = String(req.body.password || "");

  try {
    const user = store.registerStudent({ name, email, studentId, password });
    // Auto-login for convenience
    req.session.user = { id: user.id, username: user.name, role: "student", studentId: user.studentId };
    return res.redirect("/home");
  } catch (e) {
    return res.status(400).render("student-register", { error: String(e.message || e) });
  }
});
app.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// Student UI
app.get("/home", requireAuth, requireRole("student"), (req, res) => {
  res.render("student-home");
});

app.get("/menu", requireAuth, requireRole("student"), (req, res) => {
  const afternoon = store.listFoodItemsByMeal("afternoon");
  const evening = store.listFoodItemsByMeal("evening");

  res.render("student-menu", {
    afternoon,
    evening,
  });
});

app.get("/api/foods", requireAuth, (req, res) => {
  res.json(store.listFoodItems());
});

// Cart stored in browser localStorage (server validates everything on checkout)
app.get("/cart", requireAuth, requireRole("student"), (req, res) => {
  const ordering = getOrderingState(new Date());
  const allItems = store.listFoodItems();
  res.render("student-cart", { ordering, allItems });
});

app.post("/checkout", requireAuth, requireRole("student"), (req, res) => {
  const ordering = getOrderingState(new Date());
  if (!ordering.isOrderingOpen) return res.status(403).render("error", { message: ordering.reason });

  const payMethod = String(req.body.payMethod || "offline");
  const notes = String(req.body.notes || "").slice(0, 200);
  let rawLines = req.body.lines;
  if (typeof rawLines === "string") {
    try {
      rawLines = JSON.parse(rawLines);
    } catch (e) {
      rawLines = [];
    }
  }
  if (!Array.isArray(rawLines)) rawLines = [];

  if (!["online", "offline"].includes(payMethod)) return res.status(400).render("error", { message: "Invalid payment method." });
  if (rawLines.length === 0) return res.status(400).render("error", { message: "Cart is empty." });

  const lines = [];
  for (const l of rawLines) {
    const id = Number(l.item_id ?? l.itemId ?? l.id);
    const qty = Math.max(1, Math.min(20, Number(l.quantity ?? 1)));
    const it = store.getFoodItem(id);
    if (!it) return res.status(400).render("error", { message: "A cart item no longer exists." });
    if (!it.available) return res.status(400).render("error", { message: `${it.name} is not available.` });
    if (ordering.window === "afternoon" && it.meal !== "afternoon") {
      return res.status(400).render("error", { message: "Afternoon ordering is open; remove evening items from cart." });
    }
    if (ordering.window === "evening" && it.meal !== "evening") {
      return res.status(400).render("error", { message: "Evening ordering is open; remove afternoon items from cart." });
    }
    lines.push({ item_id: it.id, item_name: it.name, unit_price: Number(it.price), quantity: qty });
  }

  if (lines.length === 0) return res.status(400).render("error", { message: "Cart is empty." });

  const paymentRef = payMethod === "online" ? `SIM-${Date.now()}-${Math.floor(Math.random() * 1000)}` : null;

  const order = store.addCartOrder({
    user_id: req.session.user.id,
    lines,
    pay_method: payMethod,
    payment_ref: paymentRef,
    notes,
    slot: ordering.window,
  });

  return res.render("order-success", { order });
});

app.get("/orders", requireAuth, requireRole("student"), (req, res) => {
  const orders = store.listOrdersByUser(req.session.user.id);
  res.render("student-orders", { orders });
});

// Admin panel
app.get("/admin", requireAuth, requireRole("admin"), (req, res) => res.redirect("/admin/dashboard"));

app.get("/admin/dashboard", requireAuth, requireRole("admin"), (req, res) => {
  const items = store.listFoodItems();
  const orders = store.listOrdersAllWithUsernames();

  const todayKey = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = `${todayKey.getFullYear()}-${pad(todayKey.getMonth() + 1)}-${pad(todayKey.getDate())}`;
  const todays = orders.filter((o) => String(o.created_at || "").startsWith(ymd));

  const totalOrders = orders.length;
  const todaysRevenue = todays.reduce((s, o) => s + Number(o.total_price || 0), 0);
  const activeItems = items.filter((i) => i.available).length;

  res.render("admin-dashboard", { totalOrders, todaysRevenue, activeItems });
});

app.get("/admin/items", requireAuth, requireRole("admin"), (req, res) => {
  const items = store.listFoodItems();
  res.render("admin-items", { items });
});

app.post("/admin/item/add", requireAuth, requireRole("admin"), (req, res) => {
  const name = String(req.body.name || "").trim();
  const meal = String(req.body.meal || "").trim();
  const price = Number(req.body.price);
  const available = req.body.available === "on" ? 1 : 0;

  if (!name) return res.status(400).render("error", { message: "Name is required." });
  if (!["afternoon", "evening"].includes(meal))
    return res.status(400).render("error", { message: "Meal must be afternoon or evening." });
  if (!Number.isFinite(price) || price < 0) return res.status(400).render("error", { message: "Invalid price." });

  store.addFoodItem({ name, meal, price, available: !!available });
  return res.redirect("/admin/items");
});

app.post("/admin/item/delete", requireAuth, requireRole("admin"), (req, res) => {
  const id = Number(req.body.id);
  store.deleteFoodItem(id);
  return res.redirect("/admin/items");
});

app.post("/admin/item/update", requireAuth, requireRole("admin"), (req, res) => {
  const id = Number(req.body.id);
  const price = Number(req.body.price);
  const available = req.body.available === "on" ? 1 : 0;

  if (!Number.isFinite(price) || price < 0) return res.status(400).render("error", { message: "Invalid price." });
  store.updateFoodItem(id, { price, available: !!available });
  return res.redirect("/admin/items");
});

// Admin: view all orders
app.get("/admin/orders", requireAuth, requireRole("admin"), (req, res) => {
  const slot = String(req.query.slot || "all"); // all | afternoon | evening
  const pay = String(req.query.pay || "all"); // all | paid | unpaid

  let orders = store.listOrdersAllWithUsernames();
  if (slot !== "all") orders = orders.filter((o) => o.slot === slot);
  if (pay === "paid") orders = orders.filter((o) => !!o.paid);
  if (pay === "unpaid") orders = orders.filter((o) => !o.paid);

  res.render("admin-orders", { orders, slot, pay });
});

app.post("/admin/order/paid", requireAuth, requireRole("admin"), (req, res) => {
  const id = Number(req.body.id);
  const paid = req.body.paid === "on";
  store.setOrderPaid(id, paid);
  const back = String(req.body.back || "/admin/orders");
  return res.redirect(back);
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  if (res.headersSent) return next(err);
  return res.status(500).render("error", { message: "Internal server error." });
});

app.use((req, res) => res.status(404).render("error", { message: "Page not found." }));

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
app.listen(PORT, HOST, () => {
  console.log(`EatClub running at http://localhost:${PORT}`);
});

