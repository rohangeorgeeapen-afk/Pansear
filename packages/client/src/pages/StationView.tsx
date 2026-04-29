import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, Button, H2, H4, Tag, NonIdealState } from "@blueprintjs/core";
import type { Station, Dish } from "@restaurant/shared";
import { useQueueState } from "../ws";
import { fetchMeta, startTask, endTask } from "../api";

export function StationView() {
  const { id } = useParams();
  const stationId = Number(id);
  const state = useQueueState();
  const [meta, setMeta] = useState<{ stations: Station[]; dishes: Dish[] } | null>(null);

  useEffect(() => { fetchMeta().then(setMeta).catch(console.error); }, []);

  if (!state || !meta) return <NonIdealState icon="time" title="Connecting..." />;

  const station = meta.stations.find(s => s.id === stationId);
  const queue = state.queues.find(q => q.station_id === stationId);
  if (!station || !queue) return <NonIdealState icon="error" title="Unknown station" />;

  const dishById = new Map(meta.dishes.map(d => [d.id, d]));
  const taskMeta = (taskId: number) => {
    const order = state.orders.find(o => o.tasks.some(t => t.id === taskId));
    const t = order?.tasks.find(t => t.id === taskId);
    const dish = t ? dishById.get(t.dish_id) : undefined;
    return { order_id: order?.order.id, dish_name: dish?.name ?? `dish ${t?.dish_id}` };
  };

  return (
    <div>
      <H2>{station.name} <Tag minimal large>capacity {station.capacity}</Tag></H2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card>
          <H4>Cook Next</H4>
          {queue.cook_next.length === 0 && <p>Nothing pending.</p>}
          {queue.cook_next.map(c => {
            const m = taskMeta(c.task_id);
            return (
              <div key={c.task_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #eee" }}>
                <div>
                  <strong>{m.dish_name}</strong>
                  <div><small>order #{m.order_id} · slack {c.slack_minutes.toFixed(1)}m</small></div>
                </div>
                <Button large intent="primary" icon="play" text="Start" onClick={() => startTask(c.task_id)} />
              </div>
            );
          })}
        </Card>
        <Card>
          <H4>In Progress</H4>
          {queue.in_progress.length === 0 && <p>Nothing cooking.</p>}
          {queue.in_progress.map(taskId => {
            const m = taskMeta(taskId);
            return (
              <div key={taskId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #eee" }}>
                <div>
                  <strong>{m.dish_name}</strong>
                  <div><small>order #{m.order_id}</small></div>
                </div>
                <Button large intent="success" icon="tick" text="End" onClick={() => endTask(taskId)} />
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
}
