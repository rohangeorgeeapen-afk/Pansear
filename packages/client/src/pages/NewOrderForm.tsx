import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, NumericInput, Button, FormGroup, NonIdealState } from "@blueprintjs/core";
import type { Station, Dish } from "@restaurant/shared";
import { fetchMeta, createOrder } from "../api";

export function NewOrderForm() {
  const [meta, setMeta] = useState<{ stations: Station[]; dishes: Dish[] } | null>(null);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [promise, setPromise] = useState(15);
  const [submitting, setSubmitting] = useState(false);
  const nav = useNavigate();

  useEffect(() => { fetchMeta().then(setMeta).catch(console.error); }, []);

  if (!meta) return <NonIdealState icon="time" title="Loading..." />;

  const setDishQty = (dishId: number, value: number) => {
    const v = Math.max(0, Math.min(99, Math.floor(value || 0)));
    setQty(prev => {
      const next = { ...prev };
      if (v === 0) delete next[dishId]; else next[dishId] = v;
      return next;
    });
  };
  const bump = (dishId: number, delta: number) =>
    setDishQty(dishId, (qty[dishId] ?? 0) + delta);

  const totalItems = Object.values(qty).reduce((a, b) => a + b, 0);

  const submit = async () => {
    if (totalItems === 0) return;
    const items: number[] = [];
    for (const [dishIdStr, count] of Object.entries(qty)) {
      const dishId = Number(dishIdStr);
      for (let i = 0; i < count; i++) items.push(dishId);
    }
    setSubmitting(true);
    try {
      await createOrder(promise, items);
      nav("/expo");
    } finally {
      setSubmitting(false);
    }
  };

  const stationName = (id: number) => meta.stations.find(s => s.id === id)?.name ?? "?";

  return (
    <>
      <header className="pan-page-header">
        <div>
          <h1 className="pan-page-title">New Order</h1>
          <span className="pan-page-sub">Build a ticket and send it to the line.</span>
        </div>
      </header>

      <Card className="pan-card pan-form">
        <FormGroup label="Promise time" labelInfo="(minutes)">
          <NumericInput min={1} max={120} value={promise} onValueChange={v => setPromise(v)} />
        </FormGroup>

        <FormGroup label="Items">
          <div className="pan-dish-list">
            {meta.dishes.map(d => {
              const count = qty[d.id] ?? 0;
              return (
                <div key={d.id} className="pan-dish-row" style={{ cursor: "default" }}>
                  <div>
                    <div style={{ fontWeight: count > 0 ? "bold" : "normal" }}>{d.name}</div>
                    <div style={{ fontSize: 10, color: "var(--pan-fg-muted)" }}>
                      {stationName(d.station_id)} &middot; {d.cook_time_minutes}m
                    </div>
                  </div>
                  <div className="right">
                    <Button small text="−" disabled={count === 0} onClick={() => bump(d.id, -1)} />
                    <span className="pan-num" style={{ minWidth: 22, textAlign: "center", fontWeight: "bold" }}>{count}</span>
                    <Button small text="+" onClick={() => bump(d.id, +1)} />
                  </div>
                </div>
              );
            })}
          </div>
        </FormGroup>

        <Button
          intent="primary"
          icon="confirm"
          text={`Send to line — ${totalItems} item${totalItems === 1 ? "" : "s"}`}
          disabled={totalItems === 0 || submitting}
          loading={submitting}
          onClick={submit}
        />
      </Card>
    </>
  );
}
