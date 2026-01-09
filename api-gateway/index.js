import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";

const PORT = process.env.PORT || 4000;
const USER_SERVICE_URL = process.env.USER_SERVICE_URL;
const MESSAGE_SERVICE_URL = process.env.MESSAGE_SERVICE_URL;
const ANALYTICS_SERVICE_URL = process.env.ANALYTICS_SERVICE_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;


const app = express();
app.use(cors());
app.use(express.json());
// ketu i kom shtu dy middleware qe e kontrollojn request
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: "Unauthorized" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
}



/** Proxy REST to User Service */
app.post("/api/auth/register", async (req, res) => {
  const r = await fetch(`${USER_SERVICE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req.body),
  });
  res.status(r.status).json(await r.json());
});

app.post("/api/auth/login", async (req, res) => {
  const r = await fetch(`${USER_SERVICE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req.body),
  });
  res.status(r.status).json(await r.json());
});
/**ADMIN ROUTES */
/** Admin proxy -> User Service (vetëm admin) */
app.get("/api/admin/users", requireAuth, requireAdmin, async (_req, res) => {
  const r = await fetch(`${USER_SERVICE_URL}/admin/users`, {
    headers: { "x-internal-key": INTERNAL_API_KEY },
  });
  res.status(r.status).json(await r.json());
});

app.post("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
  const r = await fetch(`${USER_SERVICE_URL}/admin/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": INTERNAL_API_KEY,
    },
    body: JSON.stringify(req.body),
  });
  res.status(r.status).json(await r.json());
});

app.delete("/api/admin/users/:id", requireAuth, requireAdmin, async (req, res) => {
  const r = await fetch(`${USER_SERVICE_URL}/admin/users/${req.params.id}`, {
    method: "DELETE",
    headers: { "x-internal-key": INTERNAL_API_KEY },
  });
  res.status(r.status).json(await r.json());
});

/** Proxy Stats */
app.get("/api/stats", async (_req, res) => {
  const r = await fetch(`${ANALYTICS_SERVICE_URL}/stats`);
  res.status(r.status).json(await r.json());
});
//UI MUN  ME PERDOR REST OSE SOCKET NE MENYR QE ME MUJT ME DEMONSTRU PROJEKTIN ME CURL/ Postman pa u lidh me socket
//KTU E KOM BO NI NDRYSHIM QE USER NORMAL NUK E SHEH HISTORINE ME REST POR VETEM ADINI
app.get("/api/messages", requireAuth, requireAdmin, async (_req, res) =>  {
  const r = await fetch(`${MESSAGE_SERVICE_URL}/messages`);
  res.status(r.status).json(await r.json());
});

app.post("/api/messages", async (req, res) => {
  // nëse doni ta mbroni me JWT edhe në REST:
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  let user;
  try {
    user = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const { content } = req.body || {};
  if (!content || String(content).length > 500) {
    return res.status(400).json({ message: "Invalid input." });
  }

  const r = await fetch(`${MESSAGE_SERVICE_URL}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      senderId: user.userId,
      senderUsername: user.username,
      content,
    }),
  });

  res.status(r.status).json(await r.json());
});

/** Kryhert ktu Proxy Messages (REST) */
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

/** Socket auth with JWT */
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Unauthorized"));
  try {
    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
});

io.on("connection", (socket) => {
  console.log("user connected:", socket.user.username);

  socket.on("message:send", async ({ content }) => {
    if (!content || String(content).length > 500) return;

    // send to message-service -> it saves + emits kafka event
    const r = await fetch(`${MESSAGE_SERVICE_URL}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        senderId: socket.user.userId,
        senderUsername: socket.user.username,
        content,
      }),
    });

    if (!r.ok) return;

    const saved = await r.json();

    // real time broadcast
    
    io.emit("message:new", saved);

    console.log("message sent by:", socket.user.username);
  });

  socket.on("disconnect", () => {
    console.log("user disconnected:", socket.user.username);
  });
});

server.listen(PORT, () => console.log(`API Gateway on :${PORT}`));
