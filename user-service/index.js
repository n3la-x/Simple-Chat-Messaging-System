import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { db } from "./db.js";

const PORT = process.env.PORT || 4001;
const JWT_SECRET = process.env.JWT_SECRET;

const app = express();
app.use(express.json());

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
      { userId: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: "2h" }
    );

    res.json({ token });
  });
});

app.listen(PORT, () => console.log(`User Service on :${PORT}`));
