import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { NonIdealState } from "@blueprintjs/core";
import type { Station, Dish } from "@restaurant/shared";
import { useQueueState } from "../ws";
import { fetchMeta } from "../api";

function slackClass(slack: number) {
  if (slack < 0) return "is-late";
  if (slack < 2) return "is-tight";
  return "";
}

export function Overview() {
  const state = useQueueState();
  const [meta, setMeta] = useState<{ stations: Station[]; dishes: Dish[] } | null>(null);

  useEffect(() => { fetchMeta().then(setMeta).catch(console.error); }, []);

  if (!state || !meta) return <NonIdealState icon="time" title="Connecting..." description="Please wait while the kitchen feed loads." />;

  const dishById = new Map(meta.dishes.map(d => [d.id, d]));

  const tiles = meta.stations.map(s => {
    const q = state.queues.find(x => x.station_id === s.id);
    const inProgress = q?.in_progress.length ?? 0;
    const pending = q?.pending_count ?? 0;
    const next = q?.cook_next[0];
    let nextDish: string | null = null;
    let order_id: number | undefined;
    if (next) {
      const order = state.orders.find(o => o.tasks.some(t => t.id === next.task_id));
      const t = order?.tasks.find(t => t.id === next.task_id);
      nextDish = t ? (dishById.get(t.dish_id)?.name ?? `dish ${t.dish_id}`) : null;
      order_id = order?.order.id;
    }
    const minSlack = q?.cook_next.reduce<number | null>((acc, c) => acc === null ? c.slack_minutes : Math.min(acc, c.slack_minutes), null) ?? null;
    const stationCls = minSlack === null ? "" : slackClass(minSlack);
    return { station: s, q, inProgress, pending, next, nextDish, order_id, minSlack, stationCls };
  });

  const lateStations = tiles.filter(t => t.stationCls === "is-late");
  const tightStations = tiles.filter(t => t.stationCls === "is-tight");
  const totalActive = state.orders.length;
  const totalPending = tiles.reduce((a, t) => a + t.pending, 0);

  return (
    <>
      <header className="pan-page-header">
        <div>
          <h1 className="pan-page-title">Kitchen Overview</h1>
          <span className="pan-page-sub">{totalActive} active order{totalActive === 1 ? "" : "s"} &middot; {totalPending} item{totalPending === 1 ? "" : "s"} pending across all stations</span>
        </div>
      </header>

      {lateStations.length > 0 && (
        <div className="pan-overview-banner">
          ⚠ {lateStations.length} station{lateStations.length === 1 ? " is" : "s are"} LATE — {lateStations.map(s => s.station.name).join(", ")}
        </div>
      )}
      {lateStations.length === 0 && tightStations.length > 0 && (
        <div className="pan-overview-banner is-warn">
          ⚠ Tight slack at: {tightStations.map(s => s.station.name).join(", ")}
        </div>
      )}

      <div className="pan-overview-grid">
        {tiles.map(t => (
          <Link key={t.station.id} to={`/station/${t.station.id}`} className={`pan-tile ${t.stationCls}`}>
            <div className="pan-tile-head">
              <span className="pan-tile-name">{t.station.name}</span>
              <span className="pan-tile-cap">{t.inProgress}/{t.station.capacity}</span>
            </div>
            <div className="pan-tile-body">
              <div className={`pan-tile-stat ${t.stationCls === "is-late" ? "is-late" : ""}`}>
                <div className="num">{t.pending}</div>
                <div className="lbl">Pending</div>
              </div>
              <div className="pan-tile-stat">
                <div className="num">{t.inProgress}</div>
                <div className="lbl">Cooking</div>
              </div>
              <div className="pan-tile-stat">
                <div className="num">{t.station.capacity}</div>
                <div className="lbl">Capacity</div>
              </div>
            </div>
            {t.next && t.nextDish ? (
              <div className="pan-tile-next">
                <span className="label">Up next</span>
                <span className="dish">{t.nextDish}</span>
                {" — "}
                <span>#{String(t.order_id).padStart(4, "0")}</span>
                {" · slack "}
                <span className={`slack ${slackClass(t.next.slack_minutes)}`}>{t.next.slack_minutes.toFixed(1)}m</span>
              </div>
            ) : t.pending > 0 ? (
              <div className="pan-tile-next">
                <span className="label">Up next</span>
                <span style={{ fontStyle: "italic", color: "var(--pan-fg-muted)" }}>
                  {t.pending} waiting — at capacity
                </span>
              </div>
            ) : (
              <div className="pan-tile-next">
                <span style={{ fontStyle: "italic", color: "var(--pan-fg-muted)" }}>Queue clear.</span>
              </div>
            )}
          </Link>
        ))}
      </div>
    </>
  );
}
