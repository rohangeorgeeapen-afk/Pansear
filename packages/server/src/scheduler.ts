import type {
  Station,
  Dish,
  Order,
  CookTask,
  StationQueue,
  CookNextItem,
} from "@restaurant/shared";

export interface SchedulerInput {
  now: Date;
  stations: Station[];
  dishes: Dish[];
  orders: Order[];
  tasks: CookTask[];
}

interface PendingRow {
  task: CookTask;
  station_id: number;
  slack: number;
  placed_at_ms: number;
}

export function schedule(input: SchedulerInput): StationQueue[] {
  const dishById = new Map(input.dishes.map(d => [d.id, d]));
  const orderById = new Map(input.orders.map(o => [o.id, o]));
  const nowMs = input.now.getTime();

  const pendingByStation = new Map<number, PendingRow[]>();
  const inProgressByStation = new Map<number, number[]>();

  for (const t of input.tasks) {
    if (t.status !== "pending" && t.status !== "in_progress") continue;
    const dish = dishById.get(t.dish_id);
    const order = orderById.get(t.order_id);
    if (!dish || !order) continue;

    if (t.status === "in_progress") {
      const arr = inProgressByStation.get(dish.station_id) ?? [];
      arr.push(t.id);
      inProgressByStation.set(dish.station_id, arr);
      continue;
    }

    const placedMs = new Date(order.placed_at).getTime();
    const deadlineMs = placedMs + order.promise_time_minutes * 60_000;
    const slackMs = deadlineMs - nowMs - dish.cook_time_minutes * 60_000;
    const slack = slackMs / 60_000;

    const arr = pendingByStation.get(dish.station_id) ?? [];
    arr.push({ task: t, station_id: dish.station_id, slack, placed_at_ms: placedMs });
    pendingByStation.set(dish.station_id, arr);
  }

  return input.stations.map(s => {
    const inProg = (inProgressByStation.get(s.id) ?? []).slice().sort((a, b) => a - b);
    const pending = (pendingByStation.get(s.id) ?? []).slice().sort((a, b) => {
      if (a.slack !== b.slack) return a.slack - b.slack;
      if (a.placed_at_ms !== b.placed_at_ms) return a.placed_at_ms - b.placed_at_ms;
      return a.task.id - b.task.id;
    });
    const slots = Math.max(0, s.capacity - inProg.length);
    const cook_next: CookNextItem[] = pending.slice(0, slots).map(p => ({
      task_id: p.task.id,
      slack_minutes: p.slack,
    }));
    return { station_id: s.id, cook_next, in_progress: inProg, pending_count: pending.length };
  });
}
