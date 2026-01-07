import express from "express";
import { db } from "./db.js";
import { kafka, TOPIC } from "./kafka.js";

const PORT = process.env.PORT || 4003;
const app = express();

const consumer = kafka.consumer({ groupId: "analytics-group" });

await consumer.connect();
await consumer.subscribe({ topic: TOPIC, fromBeginning: true });

consumer.run({
  eachMessage: async ({ message }) => {
    try {
      const event = JSON.parse(message.value.toString());
      if (event.type === "MessageSent") {
        db.run(`UPDATE counters SET total_messages = total_messages + 1 WHERE id = 1`);
      }
    } catch {}
  },
});

app.get("/stats", (_req, res) => {
  db.get(`SELECT total_messages FROM counters WHERE id = 1`, [], (err, row) => {
    if (err) return res.status(500).json({ message: "DB error." });
    res.json({
      totalMessages: row?.total_messages ?? 0,
      note: "Active users can be tracked via socket connections (optional)."
    });
  });
});

app.listen(PORT, () => console.log(`Analytics Service on :${PORT}`));
