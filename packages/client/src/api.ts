import type { Station, Dish } from "@restaurant/shared";

export async function fetchMeta(): Promise<{ stations: Station[]; dishes: Dish[] }> {
  const r = await fetch("/meta");
  if (!r.ok) throw new Error("meta failed");
  return r.json();
}

export interface FeasibilityWarning {
  promise_time_minutes: number;
  suggested_minimum_minutes: number;
  late_items: Array<{
    dish_id: number;
    index: number;
    projected_minutes_from_now: number;
    late_by_minutes: number;
  }>;
}

export type CreateOrderResult =
  | { ok: true; order_id: number; forced: boolean }
  | { ok: false; warning: FeasibilityWarning };

export async function createOrder(
  promise_time_minutes: number,
  items: number[],
  options: { force?: boolean } = {}
): Promise<CreateOrderResult> {
  const r = await fetch("/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ promise_time_minutes, items, force: !!options.force }),
  });
  if (r.status === 409) {
    const body = await r.json();
    return {
      ok: false,
      warning: {
        promise_time_minutes: body.promise_time_minutes,
        suggested_minimum_minutes: body.suggested_minimum_minutes,
        late_items: body.late_items ?? [],
      },
    };
  }
  if (!r.ok) throw new Error("create order failed");
  const body = await r.json();
  return { ok: true, order_id: body.order_id, forced: !!body.forced };
}

export async function startTask(id: number): Promise<void> {
  const r = await fetch(`/tasks/${id}/start`, { method: "POST" });
  if (!r.ok) throw new Error("start failed");
}

export async function endTask(id: number): Promise<void> {
  const r = await fetch(`/tasks/${id}/end`, { method: "POST" });
  if (!r.ok) throw new Error("end failed");
}

export async function cancelOrder(id: number): Promise<void> {
  const r = await fetch(`/orders/${id}/cancel`, { method: "POST" });
  if (!r.ok) throw new Error("cancel failed");
}

export async function updateStationCapacity(id: number, capacity: number): Promise<Station> {
  const r = await fetch(`/stations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ capacity }),
  });
  if (!r.ok) throw new Error("capacity update failed");
  return r.json();
}
