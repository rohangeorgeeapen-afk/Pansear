import { useEffect, useState } from "react";
import { Card, Tag, Button, NonIdealState, Intent } from "@blueprintjs/core";
import type { Dish, Station, TaskStatus } from "@restaurant/shared";
import { useQueueState } from "../ws";
import { fetchMeta, cancelOrder } from "../api";

const STATUS_INTENT: Record<TaskStatus, Intent> = {
  pending: "none",
  in_progress: "warning",
  done: "success",
  cancelled: "danger",
};

function useTick(intervalMs = 1000) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set(n => n + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

function elapsedClass(elapsedMin: number, promiseMin: number) {
  const ratio = elapsedMin / Math.max(1, promiseMin);
  if (ratio >= 1) return "is-late";
  if (ratio >= 0.66) return "is-warn";
  return "";
}

function fmtMMSS(totalSec: number) {
  const sign = totalSec < 0 ? "-" : "";
  const s = Math.abs(Math.floor(totalSec));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${sign}${mm}:${ss}`;
}

function fmtMin(min: number): string {
  if (min < 1) return "<1m";
  return `${Math.ceil(min)}m`;
}

export function ExpeditorView() {
  const state = useQueueState();
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  useTick(1000);

  useEffect(() => { fetchMeta().then(m => { setDishes(m.dishes); setStations(m.stations); }).catch(console.error); }, []);

  if (!state) return <NonIdealState icon="time" title="Connecting..." description="Please wait while the kitchen feed loads." />;
  if (state.orders.length === 0) {
    return (
      <>
        <header className="pan-page-header">
          <h1 className="pan-page-title">Active Orders</h1>
          <span className="pan-page-sub">0 orders in flight</span>
        </header>
        <NonIdealState icon="clean" title="The pass is clear" description="There are no active orders at this time." />
      </>
    );
  }

  const dishById = new Map(dishes.map(d => [d.id, d]));
  const stationById = new Map(stations.map(s => [s.id, s]));
  const now = Date.now();

  // Surface predictive delivery time per ticket: take the latest projected
  // finish across the order's still-active tasks. If any is past the promise,
  // the ticket reads as "projected late".
  const summarizeOrder = (tasks: typeof state.orders[number]["tasks"]) => {
    let maxProj: number | undefined;
    let anyLate = false;
    for (const t of tasks) {
      if (t.status === "done" || t.status === "cancelled") continue;
      if (typeof t.projected_minutes_from_now === "number") {
        if (maxProj === undefined || t.projected_minutes_from_now > maxProj) {
          maxProj = t.projected_minutes_from_now;
        }
      }
      if (t.projected_late) anyLate = true;
    }
    return { maxProj, anyLate };
  };

  return (
    <>
      <header className="pan-page-header">
        <h1 className="pan-page-title">Active Orders</h1>
        <span className="pan-page-sub">{state.orders.length} order{state.orders.length === 1 ? "" : "s"} in flight</span>
      </header>
      {state.orders.map(({ order, tasks }) => {
        const placed = new Date(order.placed_at).getTime();
        const elapsedSec = (now - placed) / 1000;
        const elapsedMin = elapsedSec / 60;
        const remainingSec = order.promise_time_minutes * 60 - elapsedSec;
        const cls = elapsedClass(elapsedMin, order.promise_time_minutes);
        const { maxProj, anyLate } = summarizeOrder(tasks);
        const etaCls = anyLate ? "is-late" : "";
        return (
          <Card key={order.id} className="pan-card pan-ticket">
            <div className="pan-ticket-head">
              <div className="pan-ticket-id"><span className="hash">#</span>{String(order.id).padStart(4, "0")}</div>
              <div className="pan-ticket-meta">
                <span>placed {new Date(order.placed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                <span>promise {order.promise_time_minutes}m</span>
                {typeof maxProj === "number" && (
                  <span className={"pan-ticket-eta " + etaCls} title="Projected delivery based on current queue">
                    ETA {fmtMin(maxProj)}{anyLate ? " (late)" : ""}
                  </span>
                )}
                <span className={"pan-ticket-elapsed " + cls}>
                  {cls === "is-late" ? "late " : ""}{fmtMMSS(remainingSec)}
                </span>
                <Button minimal small intent="danger" icon="cross" onClick={() => cancelOrder(order.id)} />
              </div>
            </div>
            <div className="pan-ticket-rows">
              {tasks.map(t => {
                const dish = dishById.get(t.dish_id);
                const station = dish ? stationById.get(dish.station_id) : undefined;
                const taskEtaCls = t.projected_late ? "is-late" : "";
                return (
                  <div key={t.id} className="pan-ticket-row">
                    <div>
                      <div className="dish">{dish?.name ?? `dish ${t.dish_id}`}</div>
                      <div className="station">{station?.name ?? "—"}</div>
                    </div>
                    <div className="pan-ticket-row-right">
                      {typeof t.projected_minutes_from_now === "number" && t.status !== "done" && t.status !== "cancelled" && (
                        <span className={"pan-task-eta " + taskEtaCls}>{fmtMin(t.projected_minutes_from_now)}</span>
                      )}
                      <Tag intent={STATUS_INTENT[t.status]} minimal={t.status === "pending"}>
                        {t.status.replace("_", " ")}
                      </Tag>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </>
  );
}
