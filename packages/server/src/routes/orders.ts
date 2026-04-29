import { Router } from "express";
import { pool } from "../db.js";
import { broadcastQueueUpdate } from "../ws.js";

export const ordersRouter = Router();

ordersRouter.post("/orders", async (req, res) => {
  const { promise_time_minutes, items } = req.body as {
    promise_time_minutes?: number;
    items?: number[];
  };
  if (!promise_time_minutes || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "promise_time_minutes and items[] required" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const orderRes = await client.query<{ id: number }>(
      "INSERT INTO orders (promise_time_minutes) VALUES ($1) RETURNING id",
      [promise_time_minutes]
    );
    const orderId = orderRes.rows[0].id;
    for (const dishId of items) {
      await client.query(
        "INSERT INTO cook_tasks (order_id, dish_id) VALUES ($1, $2)",
        [orderId, dishId]
      );
    }
    await client.query("COMMIT");
    res.status(201).json({ order_id: orderId });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  broadcastQueueUpdate().catch(e => console.error("broadcast failed", e));
});

ordersRouter.post("/orders/:id/cancel", async (req, res) => {
  const orderId = Number(req.params.id);
  if (!Number.isInteger(orderId)) return res.status(400).json({ error: "bad id" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE orders SET cancelled_at = NOW() WHERE id = $1", [orderId]);
    await client.query(
      `UPDATE cook_tasks SET status = 'cancelled'
       WHERE order_id = $1 AND status IN ('pending', 'in_progress')`,
      [orderId]
    );
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  broadcastQueueUpdate().catch(e => console.error("broadcast failed", e));
});
