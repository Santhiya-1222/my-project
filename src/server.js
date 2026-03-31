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

// ✅ Session secret (safe)
const sessionSecret =
process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

// ✅ View engine + correct views path
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "web", "views"));

// ✅ Middleware
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

// ✅ Static files
app.use("/static", express.static(path.join(__dirname, "web", "static")));

// ✅ Global locals
app.use((req, res, next) => {
res.locals.user = req.session.user || null;
res.locals.ordering = getOrderingState(new Date());
next();
});

// ✅ Health check routes
app.get("/health", (req, res) => {
res.type("text/plain").send("OK");
});

app.get("/", (req, res) => {
res.render("login"); // main page
});

// ================= AUTH =================

app.get("/login", (req, res) => res.render("login", { error: null }));

app.post("/login/admin", (req, res) => {
const adminId = String(req.body.username || "").trim();
const password = String(req.body.password || "");

if (adminId !== "kc@6213" || password !== "kc6213") {
return res
.status(401)
.render("login", { error: "Invalid admin credentials." });
}

req.session.user = { id: "admin", username: "admin", role: "admin" };
return res.redirect("/admin/dashboard");
});

app.post("/login/student", (req, res) => {
const email = String(req.body.email || "").trim();
const password = String(req.body.password || "");

const student = store.validateStudentLogin({ email, password });

if (!student) {
return res
.status(401)
.render("login", {
error: "Invalid student credentials. Please register first.",
});
}

req.session.user = {
id: student.id,
username: student.name,
role: "student",
studentId: student.studentId,
};

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

```
req.session.user = {
  id: user.id,
  username: user.name,
  role: "student",
  studentId: user.studentId,
};

return res.redirect("/home");
```

} catch (e) {
return res
.status(400)
.render("student-register", { error: String(e.message || e) });
}
});

app.post("/logout", (req, res) => {
req.session.destroy(() => res.redirect("/login"));
});

// ================= STUDENT =================

app.get("/home", requireAuth, requireRole("student"), (req, res) => {
res.render("student-home");
});

app.get("/menu", requireAuth, requireRole("student"), (req, res) => {
const afternoon = store.listFoodItemsByMeal("afternoon");
const evening = store.listFoodItemsByMeal("evening");

res.render("student-menu", { afternoon, evening });
});

app.get("/cart", requireAuth, requireRole("student"), (req, res) => {
const ordering = getOrderingState(new Date());
const allItems = store.listFoodItems();

res.render("student-cart", { ordering, allItems });
});

app.post("/checkout", requireAuth, requireRole("student"), (req, res) => {
const ordering = getOrderingState(new Date());

if (!ordering.isOrderingOpen) {
return res.status(403).render("error", { message: ordering.reason });
}

const payMethod = String(req.body.payMethod || "offline");
const notes = String(req.body.notes || "").slice(0, 200);

let rawLines = req.body.lines;
if (typeof rawLines === "string") {
try {
rawLines = JSON.parse(rawLines);
} catch {
rawLines = [];
}
}

if (!Array.isArray(rawLines) || rawLines.length === 0) {
return res.status(400).render("error", { message: "Cart is empty." });
}

const lines = rawLines.map((l) => ({
item_id: Number(l.id),
quantity: Math.max(1, Number(l.quantity)),
}));

const order = store.addCartOrder({
user_id: req.session.user.id,
lines,
pay_method: payMethod,
notes,
slot: ordering.window,
});

return res.render("order-success", { order });
});

// ================= ADMIN =================

app.get("/admin/dashboard", requireAuth, requireRole("admin"), (req, res) => {
const items = store.listFoodItems();
const orders = store.listOrdersAllWithUsernames();

res.render("admin-dashboard", {
totalOrders: orders.length,
activeItems: items.filter((i) => i.available).length,
});
});

// ================= ERROR =================

app.use((err, req, res, next) => {
console.error(err);
return res.status(500).render("error", { message: "Internal server error." });
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