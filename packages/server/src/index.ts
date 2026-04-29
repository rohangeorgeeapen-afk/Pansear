import express from "express";
import { createServer } from "node:http";
import { metaRouter } from "./routes/meta.js";
import { ordersRouter } from "./routes/orders.js";
import { tasksRouter } from "./routes/tasks.js";
import { attachWss } from "./ws.js";

const app = express();
app.use(express.json());

app.use((req, _res, next) => { console.log(req.method, req.url); next(); });

// CORS for the Vite dev client.
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (_req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(metaRouter);
app.use(ordersRouter);
app.use(tasksRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: String(err) });
});

const server = createServer(app);
attachWss(server);

const port = Number(process.env.PORT ?? 3001);
server.listen(port, () => console.log(`server on :${port}`));
