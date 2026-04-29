import { Router } from "express";
import { pool } from "../db.js";
import { loadStations, loadDishes, computeQueues } from "../state.js";
import { broadcastQueueUpdate } from "../ws.js";

export const metaRouter = Router();

metaRouter.get("/meta", async (_req, res) => {
  const [stations, dishes] = await Promise.all([loadStations(), loadDishes()]);
  res.json({ stations, dishes });
});

metaRouter.get("/state", async (_req, res) => {
  res.json(await computeQueues());
});

metaRouter.patch("/stations/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { capacity } = req.body as { capacity?: number };
  if (!Number.isInteger(id)) return res.status(400).json({ error: "bad id" });
  if (!Number.isInteger(capacity) || (capacity as number) < 1) {
    return res.status(400).json({ error: "capacity must be a positive integer" });
  }
  const r = await pool.query<{ id: number; name: string; capacity: number }>(
    "UPDATE stations SET capacity = $1 WHERE id = $2 RETURNING id, name, capacity",
    [capacity, id]
  );
  if (r.rowCount === 0) return res.status(404).json({ error: "station not found" });
  res.json(r.rows[0]);
  broadcastQueueUpdate().catch(e => console.error("broadcast failed", e));
});
