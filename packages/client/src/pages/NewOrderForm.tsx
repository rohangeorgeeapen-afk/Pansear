import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, H2, Checkbox, NumericInput, Button, FormGroup, NonIdealState } from "@blueprintjs/core";
import type { Station, Dish } from "@restaurant/shared";
import { fetchMeta, createOrder } from "../api";

export function NewOrderForm() {
  const [meta, setMeta] = useState<{ stations: Station[]; dishes: Dish[] } | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [promise, setPromise] = useState(15);
  const [submitting, setSubmitting] = useState(false);
  const nav = useNavigate();

  useEffect(() => { fetchMeta().then(setMeta).catch(console.error); }, []);

  if (!meta) return <NonIdealState icon="time" title="Loading..." />;

  const toggle = (id: number) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id); else next.add(id);
    setPicked(next);
  };

  const submit = async () => {
    if (picked.size === 0) return;
    setSubmitting(true);
    try {
      await createOrder(promise, [...picked]);
      nav("/expo");
    } finally {
      setSubmitting(false);
    }
  };

  const stationName = (id: number) => meta.stations.find(s => s.id === id)?.name ?? "?";

  return (
    <Card style={{ maxWidth: 540 }}>
      <H2>New Order</H2>
      <FormGroup label="Promise time (minutes)">
        <NumericInput min={1} max={120} value={promise} onValueChange={v => setPromise(v)} />
      </FormGroup>
      <FormGroup label="Items">
        {meta.dishes.map(d => (
          <Checkbox
            key={d.id}
            checked={picked.has(d.id)}
            onChange={() => toggle(d.id)}
            label={`${d.name} — ${stationName(d.station_id)} · ${d.cook_time_minutes}m`}
          />
        ))}
      </FormGroup>
      <Button
        intent="primary"
        icon="confirm"
        text={`Submit (${picked.size} item${picked.size === 1 ? "" : "s"})`}
        disabled={picked.size === 0 || submitting}
        loading={submitting}
        onClick={submit}
      />
    </Card>
  );
}
