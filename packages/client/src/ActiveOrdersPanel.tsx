import { useEffect, useState } from "react";
import { Button, Intent, Tag } from "@blueprintjs/core";
import type { Station, TaskStatus } from "@restaurant/shared";
import { cancelOrder, fetchMeta } from "./api";
import type { QueueState } from "./ws";

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

export function ActiveOrdersPanel({ state }: { state: QueueState | null }) {
  const [stations, setStations] = useState<Station[]>([]);
  useTick(1000);

  useEffect(() => {
    fetchMeta().then(m => setStations(m.stations)).catch(console.error);
  }, []);

  const stationById = new Map(stations.map(s => [s.id, s]));
  const now = Date.now();
  const count = state?.orders.length ?? 0;

  const summarizeOrder = (tasks: NonNullable<typeof state>["orders"][number]["tasks"]) => {
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
    <aside className="pan-active-orders" aria-label="Active orders">
      <div className="pan-active-head">
        <span>Active Orders</span>
        <span className="pan-active-count">{state ? `${count} in flight` : "Connecting"}</span>
      </div>

      {!state ? (
        <div className="pan-active-empty">Waiting for kitchen feed...</div>
      ) : count === 0 ? (
        <div className="pan-active-empty">The pass is clear.</div>
      ) : (
        <div className="pan-active-list">
          {state.orders.map(({ order, tasks }) => {
            const placed = new Date(order.placed_at).getTime();
            const elapsedSec = (now - placed) / 1000;
            const elapsedMin = elapsedSec / 60;
            const remainingSec = order.promise_time_minutes * 60 - elapsedSec;
            const cls = elapsedClass(elapsedMin, order.promise_time_minutes);
            const { maxProj, anyLate } = summarizeOrder(tasks);
            const etaCls = anyLate ? "is-late" : "";

            return (
              <div key={order.id} className="pan-active-ticket">
                <div className="pan-active-ticket-head">
                  <div className="pan-ticket-id"><span className="hash">#</span>{String(order.id).padStart(4, "0")}</div>
                  <Button minimal small intent="danger" icon="cross" onClick={() => cancelOrder(order.id)} />
                </div>
                <div className="pan-active-ticket-meta">
                  {typeof maxProj === "number" && (
                    <span className={"pan-ticket-eta " + etaCls}>ETA {fmtMin(maxProj)}{anyLate ? " late" : ""}</span>
                  )}
                  <span className={"pan-ticket-elapsed " + cls}>
                    {cls === "is-late" ? "late " : ""}{fmtMMSS(remainingSec)}
                  </span>
                </div>
                <div className="pan-active-task-list">
                  {tasks.map(t => {
                    const station = stationById.get(t.station_id);
                    const taskEtaCls = t.projected_late ? "is-late" : "";
                    return (
                      <div key={t.id} className="pan-active-task">
                        <div>
                          <div className="dish">{t.dish_name}</div>
                          <div className="station">{station?.name ?? `station ${t.station_id}`}</div>
                        </div>
                        <div className="pan-active-task-right">
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
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
