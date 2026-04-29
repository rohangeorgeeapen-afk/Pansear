import { useEffect, useState } from "react";
import { Card, H2, HTMLTable, Tag, Button, NonIdealState, Intent } from "@blueprintjs/core";
import type { Dish, TaskStatus } from "@restaurant/shared";
import { useQueueState } from "../ws";
import { fetchMeta, cancelOrder } from "../api";

const STATUS_INTENT: Record<TaskStatus, Intent> = {
  pending: "none",
  in_progress: "warning",
  done: "success",
  cancelled: "danger",
};

export function ExpeditorView() {
  const state = useQueueState();
  const [dishes, setDishes] = useState<Dish[]>([]);

  useEffect(() => { fetchMeta().then(m => setDishes(m.dishes)).catch(console.error); }, []);

  if (!state) return <NonIdealState icon="time" title="Connecting..." />;
  if (state.orders.length === 0) return <NonIdealState icon="clean" title="No active orders" />;

  const dishById = new Map(dishes.map(d => [d.id, d]));

  return (
    <div>
      <H2>Active Orders</H2>
      {state.orders.map(({ order, tasks }) => (
        <Card key={order.id} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong>Order #{order.id}</strong>{" "}
              <small>placed {new Date(order.placed_at).toLocaleTimeString()} · promise {order.promise_time_minutes}m</small>
            </div>
            <Button intent="danger" icon="cross" text="Cancel" onClick={() => cancelOrder(order.id)} />
          </div>
          <HTMLTable compact style={{ width: "100%", marginTop: 8 }}>
            <thead><tr><th>Dish</th><th>Status</th></tr></thead>
            <tbody>
              {tasks.map(t => (
                <tr key={t.id}>
                  <td>{dishById.get(t.dish_id)?.name ?? `dish ${t.dish_id}`}</td>
                  <td><Tag intent={STATUS_INTENT[t.status]}>{t.status}</Tag></td>
                </tr>
              ))}
            </tbody>
          </HTMLTable>
        </Card>
      ))}
    </div>
  );
}
