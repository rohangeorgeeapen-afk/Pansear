import type { Station, Dish, Order, CookTask } from "@restaurant/shared";
import { projectTasks } from "./projection.js";

export interface FeasibilityInput {
  now: Date;
  promise_time_minutes: number;
  /** Dish ids being ordered. Duplicates are allowed (= multiple of the same dish). */
  items: number[];
  stations: Station[];
  dishes: Dish[];
  /** Currently active orders (excluding the new hypothetical one). */
  orders: Order[];
  /** Currently active tasks (pending + in-progress). */
  tasks: CookTask[];
}

export interface FeasibilityLateItem {
  /** Dish id of the late item. */
  dish_id: number;
  /** Position within the submitted items array (0-based). */
  index: number;
  /** Projected minutes from now until this item finishes. */
  projected_minutes_from_now: number;
  /** Minutes by which this item busts the promise. */
  late_by_minutes: number;
}

export type FeasibilityResult =
  | { feasible: true }
  | {
      feasible: false;
      /** Smallest promise time (minutes, rounded up) under which every item finishes on time. */
      suggested_minimum_minutes: number;
      late_items: FeasibilityLateItem[];
    };

/**
 * Project the queue with the new order's tasks appended, then check whether
 * any of those new tasks finish after the promise deadline.
 *
 * Uses synthetic (negative) ids so the hypothetical order/tasks can't collide
 * with anything in the live data.
 */
export function checkFeasibility(input: FeasibilityInput): FeasibilityResult {
  const HYPOTHETICAL_ORDER_ID = -1;
  const nowMs = input.now.getTime();

  const hypotheticalOrder: Order = {
    id: HYPOTHETICAL_ORDER_ID,
    placed_at: input.now.toISOString(),
    promise_time_minutes: input.promise_time_minutes,
    cancelled_at: null,
  };

  const hypotheticalTasks: CookTask[] = input.items.map((dish_id, i) => ({
    id: -1000 - i,
    order_id: HYPOTHETICAL_ORDER_ID,
    dish_id,
    status: "pending",
  }));

  const projection = projectTasks({
    now: input.now,
    stations: input.stations,
    dishes: input.dishes,
    orders: [...input.orders, hypotheticalOrder],
    tasks: [...input.tasks, ...hypotheticalTasks],
  });

  const deadline = nowMs + input.promise_time_minutes * 60_000;

  const lateItems: FeasibilityLateItem[] = [];
  let latestFinishMs = nowMs;

  for (let i = 0; i < hypotheticalTasks.length; i++) {
    const proj = projection.get(hypotheticalTasks[i].id);
    if (!proj) continue;
    if (proj.finish_ms > latestFinishMs) latestFinishMs = proj.finish_ms;
    if (proj.finish_ms > deadline) {
      lateItems.push({
        dish_id: hypotheticalTasks[i].dish_id,
        index: i,
        projected_minutes_from_now: Math.ceil((proj.finish_ms - nowMs) / 60_000),
        late_by_minutes: Math.ceil((proj.finish_ms - deadline) / 60_000),
      });
    }
  }

  if (lateItems.length === 0) return { feasible: true };

  return {
    feasible: false,
    suggested_minimum_minutes: Math.ceil((latestFinishMs - nowMs) / 60_000),
    late_items: lateItems,
  };
}
