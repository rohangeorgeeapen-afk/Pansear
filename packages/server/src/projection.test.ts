import { describe, it, expect } from "vitest";
import { projectTasks, type ProjectionInput } from "./projection.js";
import type { Station, Dish, Order, CookTask } from "@restaurant/shared";

const NOW = new Date("2026-04-29T12:00:00Z");
const minsFromNow = (m: number) => new Date(NOW.getTime() + m * 60_000).toISOString();

const stations: Station[] = [
  { id: 1, name: "Grill", capacity: 2, unlimited: false },
  { id: 2, name: "Fryer", capacity: 2, unlimited: false },
  { id: 3, name: "Cold",  capacity: 1, unlimited: true  },
];

const dishes: Dish[] = [
  { id: 10, name: "Burger",         station_id: 1, cook_time_minutes: 8 },
  { id: 11, name: "Steak",          station_id: 1, cook_time_minutes: 12 },
  { id: 12, name: "Grilled Chicken",station_id: 1, cook_time_minutes: 10 },
  { id: 20, name: "Fries",          station_id: 2, cook_time_minutes: 4 },
  { id: 30, name: "Salad",          station_id: 3, cook_time_minutes: 3 },
];

function mkOrder(id: number, placedMinsAgo: number, promise: number): Order {
  return {
    id,
    placed_at: minsFromNow(-placedMinsAgo),
    promise_time_minutes: promise,
  };
}

function mkTask(
  id: number, order_id: number, dish_id: number,
  status: CookTask["status"] = "pending",
  startedMinsAgo?: number
): CookTask {
  return {
    id, order_id, dish_id, status,
    started_at: startedMinsAgo !== undefined ? minsFromNow(-startedMinsAgo) : undefined,
  };
}

const baseInput = (overrides: Partial<ProjectionInput> = {}): ProjectionInput => ({
  now: NOW,
  stations,
  dishes,
  orders: [],
  tasks: [],
  ...overrides,
});

describe("projectTasks()", () => {
  it("empty input yields empty projection", () => {
    expect(projectTasks(baseInput()).size).toBe(0);
  });

  it("naive case: pending burger projected to finish at cook_time", () => {
    const out = projectTasks(baseInput({
      orders: [mkOrder(1, 0, 20)],
      tasks: [mkTask(100, 1, 10)],
    }));
    const p = out.get(100)!;
    expect(p.earliest_start_ms).toBe(NOW.getTime());
    expect(p.finish_ms).toBe(NOW.getTime() + 8 * 60_000);
    expect(p.slack_ms).toBe(12 * 60_000);
  });

  it("3 grilled chickens at cap 2: third one starts after first finishes", () => {
    // The exact case from the user's report: 2 chickens, 15-min promise -> fine
    // (both fit), but a 3rd one at cap 2 stretches into start at t=10 -> finishes
    // at 20 -> late by 5 against the 15m promise.
    const out = projectTasks(baseInput({
      orders: [mkOrder(1, 0, 15)],
      tasks: [
        mkTask(100, 1, 12),
        mkTask(101, 1, 12),
        mkTask(102, 1, 12),
      ],
    }));
    const p1 = out.get(100)!;
    const p2 = out.get(101)!;
    const p3 = out.get(102)!;
    expect(p1.finish_ms - NOW.getTime()).toBe(10 * 60_000);
    expect(p2.finish_ms - NOW.getTime()).toBe(10 * 60_000);
    expect(p3.earliest_start_ms - NOW.getTime()).toBe(10 * 60_000);
    expect(p3.finish_ms - NOW.getTime()).toBe(20 * 60_000);
    expect(p3.slack_ms).toBe(-5 * 60_000);
  });

  it("in-progress task occupies a slot until its remaining cook time elapses", () => {
    // Steak (cook 12) started 5 min ago -> 7 min remaining. Pending burger
    // gets the second slot now (capacity 2, only one in-progress). With
    // promise 15: burger starts now, finishes at 8 -> on time (slack 7).
    const out = projectTasks(baseInput({
      orders: [mkOrder(1, 5, 20), mkOrder(2, 0, 15)],
      tasks: [
        mkTask(200, 1, 11, "in_progress", 5),
        mkTask(201, 2, 10),
      ],
    }));
    const steak = out.get(200)!;
    const burger = out.get(201)!;
    expect(steak.finish_ms - NOW.getTime()).toBe(7 * 60_000);
    expect(burger.earliest_start_ms).toBe(NOW.getTime());
    expect(burger.finish_ms - NOW.getTime()).toBe(8 * 60_000);
  });

  it("pending task forced to wait when capacity is fully in-progress", () => {
    // Capacity 2 grill, 2 in-progress steaks (7 min remaining each), 1 pending
    // burger. Burger waits 7 min then cooks 8 -> finishes at 15.
    const out = projectTasks(baseInput({
      stations: [{ id: 1, name: "Grill", capacity: 2, unlimited: false }],
      orders: [mkOrder(1, 5, 30), mkOrder(2, 5, 30), mkOrder(3, 0, 20)],
      tasks: [
        mkTask(300, 1, 11, "in_progress", 5),
        mkTask(301, 2, 11, "in_progress", 5),
        mkTask(302, 3, 10),
      ],
    }));
    const b = out.get(302)!;
    expect(b.earliest_start_ms - NOW.getTime()).toBe(7 * 60_000);
    expect(b.finish_ms - NOW.getTime()).toBe(15 * 60_000);
    expect(b.slack_ms).toBe(5 * 60_000);
  });

  it("unlimited station: every pending task starts now regardless of count", () => {
    const out = projectTasks(baseInput({
      orders: [mkOrder(1, 0, 10)],
      tasks: [
        mkTask(400, 1, 30),
        mkTask(401, 1, 30),
        mkTask(402, 1, 30),
      ],
    }));
    for (const id of [400, 401, 402]) {
      const p = out.get(id)!;
      expect(p.earliest_start_ms).toBe(NOW.getTime());
      expect(p.finish_ms - NOW.getTime()).toBe(3 * 60_000);
      expect(p.slack_ms).toBe(7 * 60_000);
    }
  });

  it("walk uses naive-slack ordering: most-urgent gets the open slot first", () => {
    // 1 in-progress steak (7 min left), 2 pending: 'tight' (promise 8), 'loose'
    // (promise 30). Tight should grab the immediate slot; loose waits.
    const out = projectTasks(baseInput({
      stations: [{ id: 1, name: "Grill", capacity: 2, unlimited: false }],
      orders: [mkOrder(1, 5, 20), mkOrder(2, 0, 8), mkOrder(3, 0, 30)],
      tasks: [
        mkTask(500, 1, 11, "in_progress", 5), // steak
        mkTask(501, 2, 10),                    // tight burger
        mkTask(502, 3, 10),                    // loose burger
      ],
    }));
    const tight = out.get(501)!;
    const loose = out.get(502)!;
    // Tight starts now in the second slot; loose waits for steak (7m).
    expect(tight.earliest_start_ms).toBe(NOW.getTime());
    expect(loose.earliest_start_ms - NOW.getTime()).toBe(7 * 60_000);
  });

  it("ignores done and cancelled tasks", () => {
    const out = projectTasks(baseInput({
      orders: [mkOrder(1, 0, 20)],
      tasks: [
        mkTask(600, 1, 10, "done"),
        mkTask(601, 1, 10, "cancelled"),
        mkTask(602, 1, 10),
      ],
    }));
    expect(out.has(600)).toBe(false);
    expect(out.has(601)).toBe(false);
    expect(out.has(602)).toBe(true);
  });

  it("in-progress task that should be done is treated as finishing now, not in the past", () => {
    // Steak (cook 12) started 20 min ago -> nominally finished 8 min ago. The
    // walk should clamp finish to now so a pending task doesn't get an earlier
    // earliest_start than the present.
    const out = projectTasks(baseInput({
      stations: [{ id: 1, name: "Grill", capacity: 1, unlimited: false }],
      orders: [mkOrder(1, 20, 60), mkOrder(2, 0, 20)],
      tasks: [
        mkTask(700, 1, 11, "in_progress", 20),
        mkTask(701, 2, 10),
      ],
    }));
    const burger = out.get(701)!;
    expect(burger.earliest_start_ms).toBe(NOW.getTime());
  });
});
