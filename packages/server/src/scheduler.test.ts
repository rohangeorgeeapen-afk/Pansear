import { describe, it, expect } from "vitest";
import { schedule, type SchedulerInput } from "./scheduler.js";
import type { Station, Dish, Order, CookTask } from "@restaurant/shared";

const NOW = new Date("2026-04-25T12:00:00Z");
const minsFromNow = (m: number) => new Date(NOW.getTime() + m * 60_000).toISOString();

const stations: Station[] = [
  { id: 1, name: "Grill", capacity: 2, unlimited: false },
  { id: 2, name: "Fryer", capacity: 2, unlimited: false },
  { id: 3, name: "Cold",  capacity: 1, unlimited: false },
];

const dishes: Dish[] = [
  { id: 10, name: "Burger", station_id: 1, cook_time_minutes: 8 },
  { id: 11, name: "Steak",  station_id: 1, cook_time_minutes: 12 },
  { id: 12, name: "Fries",  station_id: 2, cook_time_minutes: 4 },
  { id: 13, name: "Wings",  station_id: 2, cook_time_minutes: 7 },
  { id: 14, name: "Salad",  station_id: 3, cook_time_minutes: 3 },
];

function mkOrder(id: number, placedMinsAgo: number, promise: number): Order {
  return {
    id,
    placed_at: minsFromNow(-placedMinsAgo),
    promise_time_minutes: promise,
  };
}

function mkTask(
  id: number,
  order_id: number,
  dish_id: number,
  status: CookTask["status"] = "pending"
): CookTask {
  return { id, order_id, dish_id, status };
}

const baseInput = (overrides: Partial<SchedulerInput> = {}): SchedulerInput => ({
  now: NOW,
  stations,
  dishes,
  orders: [],
  tasks: [],
  ...overrides,
});

const findQ = (qs: ReturnType<typeof schedule>, sid: number) =>
  qs.find(q => q.station_id === sid)!;

describe("schedule()", () => {
  it("returns empty queues for each station with no tasks", () => {
    const out = schedule(baseInput());
    expect(out).toHaveLength(3);
    for (const q of out) {
      expect(q.cook_next).toEqual([]);
      expect(q.in_progress).toEqual([]);
    }
  });

  it("places a single pending task into cook_next of its station", () => {
    const out = schedule(baseInput({
      orders: [mkOrder(1, 0, 20)],
      tasks: [mkTask(100, 1, 10)], // burger -> grill
    }));
    expect(findQ(out, 1).cook_next).toEqual([{ task_id: 100, slack_minutes: 12 }]); // 20 - 0 - 8
    expect(findQ(out, 2).cook_next).toEqual([]);
    expect(findQ(out, 3).cook_next).toEqual([]);
  });

  it("sorts ascending by slack within a station (lowest = most urgent first)", () => {
    // both grill, same order
    const out = schedule(baseInput({
      orders: [mkOrder(1, 0, 20)],
      tasks: [
        mkTask(200, 1, 10), // burger, ct=8 -> slack 12
        mkTask(201, 1, 11), // steak,  ct=12 -> slack 8
      ],
    }));
    const grill = findQ(out, 1).cook_next;
    expect(grill.map(c => c.task_id)).toEqual([201, 200]);
    expect(grill[0].slack_minutes).toBe(8);
  });

  it("respects station capacity", () => {
    // grill capacity 2, three pending
    const out = schedule(baseInput({
      orders: [mkOrder(1, 0, 30), mkOrder(2, 0, 25), mkOrder(3, 0, 20)],
      tasks: [
        mkTask(300, 1, 10), // slack 22
        mkTask(301, 2, 10), // slack 17
        mkTask(302, 3, 10), // slack 12
      ],
    }));
    const grill = findQ(out, 1).cook_next;
    expect(grill).toHaveLength(2);
    expect(grill.map(c => c.task_id)).toEqual([302, 301]);
  });

  it("in_progress consumes capacity, leaving fewer cook_next slots", () => {
    const out = schedule(baseInput({
      orders: [mkOrder(1, 0, 30), mkOrder(2, 0, 25), mkOrder(3, 0, 20), mkOrder(4, 0, 15)],
      tasks: [
        mkTask(400, 1, 10, "in_progress"),
        mkTask(401, 2, 10),
        mkTask(402, 3, 10),
        mkTask(403, 4, 10),
      ],
    }));
    const grill = findQ(out, 1);
    expect(grill.in_progress).toEqual([400]);
    expect(grill.cook_next).toHaveLength(1);
    expect(grill.cook_next[0].task_id).toBe(403); // most urgent
  });

  it("saturated capacity yields empty cook_next", () => {
    const out = schedule(baseInput({
      orders: [mkOrder(1, 0, 30), mkOrder(2, 0, 25), mkOrder(3, 0, 20)],
      tasks: [
        mkTask(500, 1, 10, "in_progress"),
        mkTask(501, 2, 10, "in_progress"),
        mkTask(502, 3, 10), // pending but no slot
      ],
    }));
    const grill = findQ(out, 1);
    expect(grill.in_progress.sort()).toEqual([500, 501]);
    expect(grill.cook_next).toEqual([]);
  });

  it("stations are independent", () => {
    const out = schedule(baseInput({
      orders: [mkOrder(1, 0, 5), mkOrder(2, 0, 30)],
      tasks: [
        mkTask(600, 1, 12, "pending"), // fries on fryer, super urgent
        mkTask(601, 2, 10, "pending"), // burger on grill, leisurely
      ],
    }));
    expect(findQ(out, 1).cook_next.map(c => c.task_id)).toEqual([601]);
    expect(findQ(out, 2).cook_next.map(c => c.task_id)).toEqual([600]);
  });

  it("negative slack (already late) ranks first", () => {
    // promise 5 min, placed 10 min ago, cook 8 -> slack = 5 - 10 - 8 = -13
    const out = schedule(baseInput({
      orders: [mkOrder(1, 10, 5), mkOrder(2, 0, 30)],
      tasks: [
        mkTask(700, 1, 10), // slack -13
        mkTask(701, 2, 10), // slack 22
      ],
    }));
    const grill = findQ(out, 1).cook_next;
    expect(grill[0].task_id).toBe(700);
    expect(grill[0].slack_minutes).toBe(-13);
  });

  it("ties broken by earlier placed_at, then lower task_id", () => {
    const out = schedule(baseInput({
      orders: [mkOrder(1, 5, 25), mkOrder(2, 5, 25), mkOrder(3, 0, 20)],
      tasks: [
        // all burger (ct 8). orders 1 & 2 placed 5 min ago, promise 25 -> slack 12
        // order 3 placed now, promise 20 -> slack 12
        mkTask(803, 3, 10),
        mkTask(802, 2, 10),
        mkTask(801, 1, 10),
      ],
    }));
    const grill = findQ(out, 1).cook_next;
    // capacity 2: top 2. earlier placed_at first -> orders 1 & 2; tiebreak lower task id -> 801, 802
    expect(grill.map(c => c.task_id)).toEqual([801, 802]);
  });

  it("ignores done and cancelled tasks if mistakenly included", () => {
    const out = schedule(baseInput({
      orders: [mkOrder(1, 0, 20)],
      tasks: [
        mkTask(900, 1, 10, "done"),
        mkTask(901, 1, 10, "cancelled"),
        mkTask(902, 1, 10, "pending"),
      ],
    }));
    const grill = findQ(out, 1);
    expect(grill.cook_next.map(c => c.task_id)).toEqual([902]);
    expect(grill.in_progress).toEqual([]);
  });

  it("unlimited stations promote every pending task regardless of capacity", () => {
    const out = schedule(baseInput({
      stations: [
        { id: 1, name: "Grill", capacity: 2, unlimited: false },
        { id: 3, name: "Cold",  capacity: 1, unlimited: true },
      ],
      orders: [mkOrder(1, 0, 30), mkOrder(2, 0, 25), mkOrder(3, 0, 20)],
      tasks: [
        mkTask(800, 1, 14), // salad on cold
        mkTask(801, 2, 14),
        mkTask(802, 3, 14),
      ],
    }));
    const cold = findQ(out, 3);
    expect(cold.cook_next).toHaveLength(3);
    expect(cold.pending_count).toBe(3);
  });

  it("pending_count reflects all pending tasks at a station, not just shown ones", () => {
    // grill cap 2; one in_progress + three pending => cook_next shows 1, pending_count = 3
    const out = schedule(baseInput({
      orders: [mkOrder(1, 0, 30), mkOrder(2, 0, 25), mkOrder(3, 0, 20), mkOrder(4, 0, 15)],
      tasks: [
        mkTask(400, 1, 10, "in_progress"),
        mkTask(401, 2, 10),
        mkTask(402, 3, 10),
        mkTask(403, 4, 10),
      ],
    }));
    const grill = findQ(out, 1);
    expect(grill.pending_count).toBe(3);
    expect(grill.cook_next).toHaveLength(1);
  });

  it("is deterministic across repeated calls", () => {
    const input = baseInput({
      orders: [mkOrder(1, 2, 25), mkOrder(2, 2, 25), mkOrder(3, 0, 20)],
      tasks: [
        mkTask(1003, 3, 10),
        mkTask(1001, 1, 10),
        mkTask(1002, 2, 10),
      ],
    });
    expect(schedule(input)).toEqual(schedule(input));
  });
});
