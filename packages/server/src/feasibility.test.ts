import { describe, it, expect } from "vitest";
import { checkFeasibility, type FeasibilityInput } from "./feasibility.js";
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

const baseInput = (
  promise_time_minutes: number,
  items: number[],
  overrides: Partial<FeasibilityInput> = {}
): FeasibilityInput => ({
  now: NOW,
  promise_time_minutes,
  items,
  stations,
  dishes,
  orders: [],
  tasks: [],
  ...overrides,
});

describe("checkFeasibility()", () => {
  it("empty kitchen + small order = feasible", () => {
    const r = checkFeasibility(baseInput(20, [10])); // 1 burger, 8m cook, 20m promise
    expect(r.feasible).toBe(true);
  });

  it("2 grilled chickens at cap 2, 15m promise = feasible (the user's example)", () => {
    const r = checkFeasibility(baseInput(15, [12, 12]));
    expect(r.feasible).toBe(true);
  });

  it("3 grilled chickens at cap 2, 15m promise = infeasible", () => {
    const r = checkFeasibility(baseInput(15, [12, 12, 12]));
    expect(r.feasible).toBe(false);
    if (r.feasible) return;
    expect(r.suggested_minimum_minutes).toBe(20);
    expect(r.late_items).toHaveLength(1);
    expect(r.late_items[0].dish_id).toBe(12);
    expect(r.late_items[0].late_by_minutes).toBe(5);
    expect(r.late_items[0].projected_minutes_from_now).toBe(20);
  });

  it("infeasibility considers existing in-progress tasks", () => {
    // Two steaks already cooking on grill (7m left each). User adds 1 chicken.
    // Capacity 2 → both slots busy until 7m. Chicken starts at 7m, finishes 17m.
    // 15m promise → late by 2m. Suggested = 17.
    const r = checkFeasibility(baseInput(15, [12], {
      orders: [
        { id: 1, placed_at: minsFromNow(-5), promise_time_minutes: 30 },
        { id: 2, placed_at: minsFromNow(-5), promise_time_minutes: 30 },
      ],
      tasks: [
        { id: 100, order_id: 1, dish_id: 11, status: "in_progress", started_at: minsFromNow(-5) },
        { id: 101, order_id: 2, dish_id: 11, status: "in_progress", started_at: minsFromNow(-5) },
      ],
    }));
    expect(r.feasible).toBe(false);
    if (r.feasible) return;
    expect(r.suggested_minimum_minutes).toBe(17);
    expect(r.late_items[0].late_by_minutes).toBe(2);
  });

  it("cold dishes are always feasible (unlimited station)", () => {
    const r = checkFeasibility(baseInput(5, [30, 30, 30, 30, 30])); // 5 salads, 3m each
    expect(r.feasible).toBe(true);
  });

  it("mixed order: only the late items appear in late_items", () => {
    // 1 burger (8m, fine for 20m) + 1 steak (12m, fine for 20m) + 1 chicken (10m, fine).
    // But all three on grill capacity 2: 3rd starts at 8 (when burger done),
    // finishes at 18 -> still within 20. So all feasible.
    let r = checkFeasibility(baseInput(20, [10, 11, 12]));
    expect(r.feasible).toBe(true);

    // Now tighten promise to 15m. With EDF, the steak (tightest naive slack
    // of 3) gets a slot first along with the chicken (slack 5). The burger
    // (slack 7) gets pushed to the second wave: starts at 10 (when chicken
    // done) and finishes at 18 → late by 3 against the 15-min promise.
    r = checkFeasibility(baseInput(15, [10, 11, 12]));
    expect(r.feasible).toBe(false);
    if (r.feasible) return;
    expect(r.late_items).toHaveLength(1);
    expect(r.late_items[0].dish_id).toBe(10);
  });
});
