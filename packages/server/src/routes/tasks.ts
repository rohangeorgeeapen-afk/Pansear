import { Router } from "express";
import { pool } from "../db.js";
import { broadcastQueueUpdate } from "../ws.js";

export const tasksRouter = Router();

tasksRouter.post("/tasks/:id/start", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "bad id" });
  const r = await pool.query(
    `UPDATE cook_tasks
     SET status = 'in_progress', started_at = NOW()
     WHERE id = $1 AND status = 'pending'
     RETURNING id`,
    [id]
  );
  if (r.rowCount === 0) return res.status(409).json({ error: "task not pending" });
  res.json({ ok: true });
  broadcastQueueUpdate().catch(e => console.error("broadcast failed", e));
});

tasksRouter.post("/tasks/:id/end", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "bad id" });
  const r = await pool.query(
    `UPDATE cook_tasks
     SET status = 'done', ended_at = NOW()
     WHERE id = $1 AND status = 'in_progress'
     RETURNING id`,
    [id]
  );
  if (r.rowCount === 0) return res.status(409).json({ error: "task not in_progress" });
  res.json({ ok: true });
  broadcastQueueUpdate().catch(e => console.error("broadcast failed", e));
});
