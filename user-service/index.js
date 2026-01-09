import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { db } from "./db.js";

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123456";

const PORT = process.env.PORT || 4001;
const JWT_SECRET = process.env.JWT_SECRET;

const app = express();
app.use(express.json());

// kjo e kontrollon a po vjen kerkesa prej API-GATEWAY apo nga dikush tjeter
function requireInternal(req, res, next) {
  const key = req.headers["x-internal-key"];
  if (!INTERNAL_API_KEY || key !== INTERNAL_API_KEY) {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
}


async function ensureAdmin() {
  db.get(`SELECT id FROM users WHERE username = ?`, [ADMIN_USERNAME], async (_err, row) => {
    if (row) return;
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    db.run(
      `INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, 'admin')`,
      [ADMIN_USERNAME, `${ADMIN_USERNAME}@test.com`, passwordHash]
    );
    console.log("Admin user seeded:", ADMIN_USERNAME);
  });
}
ensureAdmin();


app.post("/auth/register", async (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !password || password.length < 6) {
    return res.status(400).json({ message: "Invalid input." });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  db.run(
    `INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)`,
    [username, email || null, passwordHash],
    function (err) {
      if (err) return res.status(409).json({ message: "User/email exists." });
      res.status(201).json({ message: "Registered." });
    }
  );
});

app.post("/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ message: "Invalid input." });

  db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
    if (err || !user) return res.status(401).json({ message: "Invalid credentials." });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ message: "Invalid credentials." });

    const token = jwt.sign(
  { userId: user.id, username: user.username, role: user.role },
  JWT_SECRET,
  { expiresIn: "2h" }
);


    res.json({ token });
  });
});
// ===== ADMIN endpoints (vetëm nga API-GATEWAY me x-internal-key) =====

// Lista users
app.get("/admin/users", requireInternal, (req, res) => {
  db.all(
    `SELECT id, username, email, role, created_at FROM users ORDER BY id DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ message: "DB error." });
      res.json(rows);
    }
  );
});

// Add user (admin creates)
app.post("/admin/users", requireInternal, async (req, res) => {
  const { username, email, password, role } = req.body || {};
  if (!username || !password || password.length < 6) {
    return res.status(400).json({ message: "Invalid input." });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const safeRole = role === "admin" ? "admin" : "user";

  db.run(
    `INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, 'user')`,
    [username, email || null, passwordHash, safeRole],
    function (err) {
      if (err) return res.status(409).json({ message: "User/email exists." });
      res.status(201).json({ id: this.lastID, username, email: email || null, role: safeRole });
    }
  );
});

// Delete user (admin deletes) — mos lejo fshirjen e admin-it kryesor
app.delete("/admin/users/:id", requireInternal, (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid id." });

  db.get(`SELECT id, username, role FROM users WHERE id=?`, [id], (err, user) => {
    if (err || !user) return res.status(404).json({ message: "Not found." });

    if (user.role === "admin" && user.username === ADMIN_USERNAME) {
      return res.status(400).json({ message: "Cannot delete primary admin." });
    }

    db.run(`DELETE FROM users WHERE id=?`, [id], function (err2) {
      if (err2) return res.status(500).json({ message: "DB error." });
      res.json({ deleted: this.changes });
    });
  });
});

app.listen(PORT, () => console.log(`User Service on :${PORT}`));
