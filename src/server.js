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

// ================= CONFIG =================
const sessionSecret =
process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

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

// ================= ROUTES =================

// Health
app.get("/health", (req, res) => res.send("OK"));

// Home
app.get("/", (req, res) => {
res.render("login", { error: null });
});

// ================= AUTH =================
app.get("/login", (req, res) => {
res.render("login", { error: null });
});

// ================= STUDENT =================
app.get("/home", requireAuth, requireRole("student"), (req, res) => {
res.render("student-home");
});

app.get("/menu", requireAuth, requireRole("student"), (req, res) => {
const afternoon = store.listFoodItemsByMeal("afternoon") || [];
const evening = store.listFoodItemsByMeal("evening") || [];

res.render("student-menu", { afternoon, evening });
});

app.get("/cart", requireAuth, requireRole("student"), (req, res) => {
const ordering = getOrderingState(new Date());
const allItems = store.listFoodItems() || [];

res.render("student-cart", { ordering, allItems });
});

// ================= ADMIN =================
app.get("/admin/dashboard", requireAuth, requireRole("admin"), (req, res) => {
try {
const items = store.listFoodItems() || [];
const orders = store.listOrdersAllWithUsernames() || [];

```
const todaysRevenue = 0;

res.render("admin-dashboard", {
  totalOrders: orders.length || 0,
  activeItems: items.filter((i) => i.available).length || 0,
  todaysRevenue,
});
```

} catch (err) {
console.error("ADMIN ERROR:", err);
res.status(500).render("error", { message: err.message });
}
});

// ================= ERROR =================
app.use((err, req, res, next) => {
console.error(err);
res.status(500).render("error", { message: "Internal server error." });
});

app.use((req, res) => {
res.status(404).render("error", { message: "Page not found." });
});

// ================= SERVER =================
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

app.listen(PORT, HOST, () => {
console.log(`Server running on ${HOST}:${PORT}`);
});
