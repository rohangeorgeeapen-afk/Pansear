import { Router } from "express";
import { loadStations, loadDishes, computeQueues } from "../state.js";

export const metaRouter = Router();

metaRouter.get("/meta", async (_req, res) => {
  const [stations, dishes] = await Promise.all([loadStations(), loadDishes()]);
  res.json({ stations, dishes });
});

metaRouter.get("/state", async (_req, res) => {
  res.json(await computeQueues());
});
