import type { Station, Dish } from "@restaurant/shared";

export async function fetchMeta(): Promise<{ stations: Station[]; dishes: Dish[] }> {
  const r = await fetch("/meta");
  if (!r.ok) throw new Error("meta failed");
  return r.json();
}

export async function createOrder(promise_time_minutes: number, items: number[]): Promise<void> {
  const r = await fetch("/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ promise_time_minutes, items }),
  });
  if (!r.ok) throw new Error("create order failed");
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
