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

const app = express();
app.use(cors());
app.use(express.json());

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

/** Proxy Stats */
app.get("/api/stats", async (_req, res) => {
  const r = await fetch(`${ANALYTICS_SERVICE_URL}/stats`);
  res.status(r.status).json(await r.json());
});

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
