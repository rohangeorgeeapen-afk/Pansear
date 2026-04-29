import type { Station, Dish, Order, CookTask } from "@restaurant/shared";

export interface ProjectionInput {
  now: Date;
  stations: Station[];
  dishes: Dish[];
  orders: Order[];
  tasks: CookTask[];
}

export interface TaskProjection {
  task_id: number;
  station_id: number;
  earliest_start_ms: number;
  finish_ms: number;
  slack_ms: number;
  cook_time_minutes: number;
}

/**
 * Walks each station's queue and assigns earliest-possible start times to every
 * active task (pending + in_progress). The result lets us compute *predictive*
 * slack — slack that accounts for queue depth and in-progress remaining time —
 * instead of the naive "as if it could start now" slack.
 *
 * Sorting key for the walk matches schedule()'s tie-breakers so cook_next
 * decisions and projected ETAs stay consistent.
 */
export function projectTasks(input: ProjectionInput): Map<number, TaskProjection> {
  const dishById = new Map(input.dishes.map(d => [d.id, d]));
  const orderById = new Map(input.orders.map(o => [o.id, o]));
  const nowMs = input.now.getTime();
  const out = new Map<number, TaskProjection>();

  const deadlineFor = (orderId: number): number => {
    const o = orderById.get(orderId);
    if (!o) return Infinity;
    return new Date(o.placed_at).getTime() + o.promise_time_minutes * 60_000;
  };

  for (const station of input.stations) {
    // Active tasks belonging to this station, by their dish's station_id.
    const stationTasks = input.tasks.filter(t => {
      if (t.status !== "pending" && t.status !== "in_progress") return false;
      const d = dishById.get(t.dish_id);
      return d?.station_id === station.id;
    });
    if (stationTasks.length === 0) continue;

    const inProgress = stationTasks.filter(t => t.status === "in_progress");
    const pending = stationTasks.filter(t => t.status === "pending");

    // Unlimited stations have no queueing. Every task starts now and finishes
    // exactly cook_time_minutes from now (or its true start, for in_progress).
    if (station.unlimited) {
      for (const t of stationTasks) {
        const dish = dishById.get(t.dish_id);
        if (!dish || !orderById.has(t.order_id)) continue;
        const cookMs = dish.cook_time_minutes * 60_000;
        const start = t.status === "in_progress" && t.started_at
          ? new Date(t.started_at).getTime()
          : nowMs;
        const finish = Math.max(start + cookMs, nowMs);
        out.set(t.id, {
          task_id: t.id,
          station_id: station.id,
          earliest_start_ms: start,
          finish_ms: finish,
          slack_ms: deadlineFor(t.order_id) - finish,
          cook_time_minutes: dish.cook_time_minutes,
        });
      }
      continue;
    }

    // Capacity-limited path. Build "slot free times" — when each cooking slot
    // next becomes available. In-progress tasks occupy slots until their
    // remaining cook time elapses.
    const slotFreeAt: number[] = [];
    for (const t of inProgress) {
      const dish = dishById.get(t.dish_id);
      if (!dish || !orderById.has(t.order_id)) continue;
      const startedAt = t.started_at ? new Date(t.started_at).getTime() : nowMs;
      const finish = Math.max(startedAt + dish.cook_time_minutes * 60_000, nowMs);
      slotFreeAt.push(finish);
      out.set(t.id, {
        task_id: t.id,
        station_id: station.id,
        earliest_start_ms: startedAt,
        finish_ms: finish,
        slack_ms: deadlineFor(t.order_id) - finish,
        cook_time_minutes: dish.cook_time_minutes,
      });
    }
    // Pad with empty slots up to capacity.
    while (slotFreeAt.length < station.capacity) slotFreeAt.push(nowMs);
    // If capacity was lowered below in_progress count, the extra slots simply
    // stay over-subscribed; we'll still drain them in finish-time order.

    // Sort pending by *naive* slack (then placed_at, task id). This priority
    // order is what schedule() already uses to decide what the chef sees in
    // cook_next; using the same key keeps projection consistent with picks.
    const naiveSlack = (t: CookTask): number => {
      const dish = dishById.get(t.dish_id);
      const order = orderById.get(t.order_id);
      if (!dish || !order) return 0;
      const placed = new Date(order.placed_at).getTime();
      const deadline = placed + order.promise_time_minutes * 60_000;
      return deadline - nowMs - dish.cook_time_minutes * 60_000;
    };
    pending.sort((a, b) => {
      const sa = naiveSlack(a), sb = naiveSlack(b);
      if (sa !== sb) return sa - sb;
      const orderA = orderById.get(a.order_id);
      const orderB = orderById.get(b.order_id);
      const pa = orderA ? new Date(orderA.placed_at).getTime() : 0;
      const pb = orderB ? new Date(orderB.placed_at).getTime() : 0;
      if (pa !== pb) return pa - pb;
      return a.id - b.id;
    });

    // Walk: each pending task takes the earliest-free slot.
    for (const t of pending) {
      const dish = dishById.get(t.dish_id);
      if (!dish || !orderById.has(t.order_id)) continue;
      // Earliest-free slot
      let earliestIdx = 0;
      for (let i = 1; i < slotFreeAt.length; i++) {
        if (slotFreeAt[i] < slotFreeAt[earliestIdx]) earliestIdx = i;
      }
      const start = Math.max(slotFreeAt[earliestIdx], nowMs);
      const finish = start + dish.cook_time_minutes * 60_000;
      slotFreeAt[earliestIdx] = finish;

      out.set(t.id, {
        task_id: t.id,
        station_id: station.id,
        earliest_start_ms: start,
        finish_ms: finish,
        slack_ms: deadlineFor(t.order_id) - finish,
        cook_time_minutes: dish.cook_time_minutes,
      });
    }
  }

  return out;
}
