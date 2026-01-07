import express from "express";
import { db } from "./db.js";
import { kafka, TOPIC } from "./kafka.js";

const PORT = process.env.PORT || 4002;
const app = express();
app.use(express.json());

const producer = kafka.producer();

await producer.connect();
console.log("Message Service Kafka producer connected");

app.post("/messages", (req, res) => {
  const { senderId, senderUsername, content } = req.body || {};
  if (!senderId || !senderUsername || !content) {
    return res.status(400).json({ message: "Invalid input." });
  }

  db.run(
    `INSERT INTO messages (sender_id, sender_username, content) VALUES (?, ?, ?)`,
    [senderId, senderUsername, content],
    async function (err) {
      if (err) return res.status(500).json({ message: "DB error." });

      const message = {
        id: this.lastID,
        senderId,
        senderUsername,
        content,
        createdAt: new Date().toISOString(),
      };

      // Publish event to Kafka
      await producer.send({
        topic: TOPIC,
        messages: [{ key: String(senderId), value: JSON.stringify({ type: "MessageSent", payload: message }) }],
      });

      res.status(201).json(message);
    }
  );
});

app.listen(PORT, () => console.log(`Message Service on :${PORT}`));
