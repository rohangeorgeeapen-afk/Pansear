import { pool } from "./db.js";
import { schedule } from "./scheduler.js";
import type {
  Station, Dish, Order, CookTask, StationQueue, ActiveOrderView,
} from "@restaurant/shared";

export async function loadStations(): Promise<Station[]> {
  const r = await pool.query<Station>("SELECT id, name, capacity FROM stations ORDER BY id");
  return r.rows;
}

export async function loadDishes(): Promise<Dish[]> {
  const r = await pool.query<Dish>(
    "SELECT id, name, station_id, cook_time_minutes FROM dishes ORDER BY id"
  );
  return r.rows;
}

export async function loadActiveOrders(): Promise<Order[]> {
  const r = await pool.query<Order>(
    `SELECT id, placed_at, promise_time_minutes, cancelled_at
     FROM orders
     WHERE cancelled_at IS NULL
       AND id IN (SELECT DISTINCT order_id FROM cook_tasks WHERE status IN ('pending','in_progress'))
     ORDER BY placed_at ASC`
  );
  return r.rows;
}

export async function loadActiveTasks(): Promise<CookTask[]> {
  const r = await pool.query<CookTask>(
    `SELECT id, order_id, dish_id, status, started_at, ended_at
     FROM cook_tasks
     WHERE status IN ('pending','in_progress')
     ORDER BY id`
  );
  return r.rows;
}

export async function loadActiveOrdersView(): Promise<ActiveOrderView[]> {
  const orders = await loadActiveOrders();
  if (orders.length === 0) return [];
  const ids = orders.map(o => o.id);
  const r = await pool.query<CookTask & { dish_name: string; station_id: number }>(
    `SELECT ct.id, ct.order_id, ct.dish_id, ct.status, ct.started_at, ct.ended_at,
            d.name AS dish_name, d.station_id
     FROM cook_tasks ct
     JOIN dishes d ON d.id = ct.dish_id
     WHERE ct.order_id = ANY($1::int[])
     ORDER BY ct.id`,
    [ids]
  );
  return orders.map(order => ({
    order,
    tasks: r.rows.filter(t => t.order_id === order.id),
  }));
}

export async function computeQueues(): Promise<{ queues: StationQueue[]; orders: ActiveOrderView[] }> {
  const [stations, dishes, orders, tasks, ordersView] = await Promise.all([
    loadStations(),
    loadDishes(),
    loadActiveOrders(),
    loadActiveTasks(),
    loadActiveOrdersView(),
  ]);
  const queues = schedule({ now: new Date(), stations, dishes, orders, tasks });
  return { queues, orders: ordersView };
}
