import type {
  Station,
  Dish,
  Order,
  CookTask,
  StationQueue,
  CookNextItem,
} from "@restaurant/shared";
import { projectTasks } from "./projection.js";

export interface SchedulerInput {
  now: Date;
  stations: Station[];
  dishes: Dish[];
  orders: Order[];
  tasks: CookTask[];
}

export function schedule(input: SchedulerInput): StationQueue[] {
  const dishById = new Map(input.dishes.map(d => [d.id, d]));
  const orderById = new Map(input.orders.map(o => [o.id, o]));
  const projection = projectTasks(input);
  const nowMs = input.now.getTime();

  // Naive slack — used for *priority* (EDF). Predictive slack is shown to the
  // chef but priority ordering must follow naive slack, otherwise items that
  // would be late if delayed could lose their start slot to "less urgent looking"
  // items that already finished projecting late.
  const naiveSlack = (t: CookTask): number => {
    const dish = dishById.get(t.dish_id);
    const order = orderById.get(t.order_id);
    if (!dish || !order) return 0;
    const placed = new Date(order.placed_at).getTime();
    const deadline = placed + order.promise_time_minutes * 60_000;
    return deadline - nowMs - dish.cook_time_minutes * 60_000;
  };

  return input.stations.map(s => {
    const inProgress: number[] = [];
    const pending: CookTask[] = [];

    for (const t of input.tasks) {
      if (t.status !== "pending" && t.status !== "in_progress") continue;
      const dish = dishById.get(t.dish_id);
      if (!dish || dish.station_id !== s.id) continue;
      if (t.status === "in_progress") inProgress.push(t.id);
      else pending.push(t);
    }
    inProgress.sort((a, b) => a - b);

    pending.sort((a, b) => {
      const sa = naiveSlack(a);
      const sb = naiveSlack(b);
      if (sa !== sb) return sa - sb;
      const orderA = orderById.get(a.order_id);
      const orderB = orderById.get(b.order_id);
      const pa = orderA ? new Date(orderA.placed_at).getTime() : 0;
      const pb = orderB ? new Date(orderB.placed_at).getTime() : 0;
      if (pa !== pb) return pa - pb;
      return a.id - b.id;
    });

    const slots = s.unlimited
      ? pending.length
      : Math.max(0, s.capacity - inProgress.length);

    const cook_next: CookNextItem[] = pending.slice(0, slots).map(t => {
      const p = projection.get(t.id);
      // Display predictive slack so the chef sees realistic urgency given the
      // queue depth — not the naive "as if I could start everything now" value.
      return {
        task_id: t.id,
        slack_minutes: p ? p.slack_ms / 60_000 : naiveSlack(t) / 60_000,
      };
    });

    return {
      station_id: s.id,
      cook_next,
      in_progress: inProgress,
      pending_count: pending.length,
    };
  });
}
