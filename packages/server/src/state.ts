import { pool } from "./db.js";
import { schedule } from "./scheduler.js";
import { projectTasks } from "./projection.js";
import type {
  Station, Dish, Order, CookTask, StationQueue, ActiveOrderView, ActiveOrderTask,
} from "@restaurant/shared";

export async function loadStations(): Promise<Station[]> {
  const r = await pool.query<Station>("SELECT id, name, capacity, unlimited FROM stations ORDER BY id");
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

interface OrderTaskRow extends CookTask {
  dish_name: string;
  station_id: number;
}

async function loadActiveOrderTasks(orderIds: number[]): Promise<OrderTaskRow[]> {
  if (orderIds.length === 0) return [];
  const r = await pool.query<OrderTaskRow>(
    `SELECT ct.id, ct.order_id, ct.dish_id, ct.status, ct.started_at, ct.ended_at,
            d.name AS dish_name, d.station_id
     FROM cook_tasks ct
     JOIN dishes d ON d.id = ct.dish_id
     WHERE ct.order_id = ANY($1::int[])
     ORDER BY ct.id`,
    [orderIds]
  );
  return r.rows;
}

export async function computeQueues(): Promise<{ queues: StationQueue[]; orders: ActiveOrderView[] }> {
  const now = new Date();
  const [stations, dishes, orders, tasks] = await Promise.all([
    loadStations(),
    loadDishes(),
    loadActiveOrders(),
    loadActiveTasks(),
  ]);
  const orderTaskRows = await loadActiveOrderTasks(orders.map(o => o.id));

  const queues = schedule({ now, stations, dishes, orders, tasks });
  const projection = projectTasks({ now, stations, dishes, orders, tasks });
  const nowMs = now.getTime();

  const ordersView: ActiveOrderView[] = orders.map(order => {
    const deadline = new Date(order.placed_at).getTime() + order.promise_time_minutes * 60_000;
    const taskRows = orderTaskRows.filter(t => t.order_id === order.id);
    const enriched: ActiveOrderTask[] = taskRows.map(row => {
      const proj = projection.get(row.id);
      if (!proj) return { ...row };
      return {
        ...row,
        projected_minutes_from_now: Math.max(0, (proj.finish_ms - nowMs) / 60_000),
        projected_late: proj.finish_ms > deadline,
      };
    });
    return { order, tasks: enriched };
  });

  return { queues, orders: ordersView };
}
