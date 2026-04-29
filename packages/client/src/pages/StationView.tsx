import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, Button, NonIdealState, NumericInput } from "@blueprintjs/core";
import type { Station, Dish } from "@restaurant/shared";
import { useQueueState } from "../ws";
import { fetchMeta, startTask, endTask, updateStationCapacity } from "../api";

function slackClass(slack: number) {
  if (slack < 0) return "is-late";
  if (slack < 2) return "is-tight";
  return "";
}

export function StationView() {
  const { id } = useParams();
  const stationId = Number(id);
  const state = useQueueState();
  const [meta, setMeta] = useState<{ stations: Station[]; dishes: Dish[] } | null>(null);
  const [capacityDraft, setCapacityDraft] = useState<number | null>(null);
  const [savingCapacity, setSavingCapacity] = useState(false);

  useEffect(() => { fetchMeta().then(setMeta).catch(console.error); }, []);

  if (!state || !meta) return <NonIdealState icon="time" title="Connecting..." description="Please wait while the kitchen feed loads." />;

  const station = meta.stations.find(s => s.id === stationId);
  const queue = state.queues.find(q => q.station_id === stationId);
  if (!station || !queue) return <NonIdealState icon="error" title="Unknown station" />;

  const currentCapacityDraft = capacityDraft ?? station.capacity;
  const capacityDirty = currentCapacityDraft !== station.capacity;

  const saveCapacity = async () => {
    if (!capacityDirty) return;
    setSavingCapacity(true);
    try {
      const updated = await updateStationCapacity(station.id, currentCapacityDraft);
      setMeta(m => m ? { ...m, stations: m.stations.map(s => s.id === updated.id ? { ...s, capacity: updated.capacity } : s) } : m);
      setCapacityDraft(null);
    } finally {
      setSavingCapacity(false);
    }
  };

  const dishById = new Map(meta.dishes.map(d => [d.id, d]));
  const taskMeta = (taskId: number) => {
    const order = state.orders.find(o => o.tasks.some(t => t.id === taskId));
    const t = order?.tasks.find(t => t.id === taskId);
    const dish = t ? dishById.get(t.dish_id) : undefined;
    return { order_id: order?.order.id, dish_name: dish?.name ?? `dish ${t?.dish_id}`, cook_time: dish?.cook_time_minutes };
  };

  const inProgress = queue.in_progress.length;
  const pendingTotal = queue.pending_count;
  const blocked = Math.max(0, pendingTotal - queue.cook_next.length);

  const next = queue.cook_next[0];
  const upcoming = queue.cook_next.slice(1);
  const nextMeta = next ? taskMeta(next.task_id) : null;
  const nextCls = next ? slackClass(next.slack_minutes) : "";

  const verb = station.unlimited ? "PLATE & SEND" : "START COOKING";
  const nextLabel = station.unlimited ? "▶ Plate this next" : "▶ Cook this next";
  const inProgLabel = station.unlimited ? "Being plated" : "On the burners";

  return (
    <>
      <header className="pan-page-header">
        <div>
          <h1 className="pan-page-title">{station.name} Station</h1>
          <span className="pan-page-sub">
            {station.unlimited ? "No capacity limit" : `Capacity ${station.capacity}`} &middot; {inProgress} {station.unlimited ? "in hand" : "cooking"} &middot; {pendingTotal} pending
          </span>
        </div>
      </header>

      {station.unlimited ? (
        <div className="pan-capacity-bar">
          <b>Capacity:</b>
          <span style={{ fontStyle: "italic", color: "var(--pan-fg-muted)" }}>
            {station.name} pulls pre-prepped items &mdash; no capacity limit applies.
          </span>
        </div>
      ) : (
        <div className="pan-capacity-bar">
          <b>Capacity:</b>
          <NumericInput
            min={1}
            max={20}
            value={currentCapacityDraft}
            onValueChange={v => setCapacityDraft(Number.isFinite(v) ? v : station.capacity)}
            style={{ width: 70 }}
          />
          <Button intent="primary" text="Save" disabled={!capacityDirty || savingCapacity} loading={savingCapacity} onClick={saveCapacity} />
          {capacityDirty && <Button text="Cancel" onClick={() => setCapacityDraft(null)} disabled={savingCapacity} />}
          <span className="pan-capacity-help">
            Lowering below current cooking count blocks new starts until the line drains.
          </span>
        </div>
      )}

      {/* HERO — the one thing the chef should look at */}
      {next && nextMeta ? (
        <div className={"pan-hero " + nextCls}>
          <div className="pan-hero-label">{nextLabel}</div>
          <div className="pan-hero-dish">{nextMeta.dish_name}</div>
          <div className="pan-hero-meta">
            <span>Order #{String(nextMeta.order_id).padStart(4, "0")}</span>
            <span>·</span>
            <span>{nextMeta.cook_time}m cook</span>
            <span>·</span>
            <span>slack <b className={"pan-slack " + nextCls}>{next.slack_minutes.toFixed(1)}m</b></span>
          </div>
          <button className="pan-hero-btn" onClick={() => startTask(next.task_id)}>
            ▶ {verb}
          </button>
        </div>
      ) : pendingTotal > 0 ? (
        <div className="pan-hero is-idle">
          <div className="pan-hero-label">At capacity</div>
          <div className="pan-hero-dish">Hold the line</div>
          <div className="pan-hero-meta">
            {pendingTotal} item{pendingTotal === 1 ? "" : "s"} waiting · finish current items first
          </div>
        </div>
      ) : (
        <div className="pan-hero is-idle">
          <div className="pan-hero-label">All caught up</div>
          <div className="pan-hero-dish">Queue is clear</div>
        </div>
      )}

      {/* In progress strip — chef ends items here */}
      {inProgress > 0 && (
        <div className="pan-strip">
          <div className="pan-strip-title">{inProgLabel} ({inProgress})</div>
          <div className="pan-strip-rows">
            {queue.in_progress.map(taskId => {
              const m = taskMeta(taskId);
              return (
                <div key={taskId} className="pan-strip-row">
                  <div>
                    <div className="dish-name">{m.dish_name}</div>
                    <div className="meta">#{String(m.order_id).padStart(4, "0")}</div>
                  </div>
                  <Button intent="success" icon="tick" text="Done" onClick={() => endTask(taskId)} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* After that — collapsed list */}
      {(upcoming.length > 0 || blocked > 0) && (
        <div className="pan-strip">
          <div className="pan-strip-title">
            After that ({upcoming.length}{blocked > 0 ? ` shown · ${blocked} blocked at capacity` : ""})
          </div>
          <div className="pan-strip-rows">
            {upcoming.map(c => {
              const m = taskMeta(c.task_id);
              const cls = slackClass(c.slack_minutes);
              return (
                <div key={c.task_id} className="pan-strip-row">
                  <div>
                    <div className="dish-name">{m.dish_name}</div>
                    <div className="meta">
                      #{String(m.order_id).padStart(4, "0")} · slack <span className={"pan-slack " + cls}>{c.slack_minutes.toFixed(1)}m</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
