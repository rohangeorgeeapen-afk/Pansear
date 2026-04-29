import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, NumericInput, Button, FormGroup, NonIdealState, Dialog } from "@blueprintjs/core";
import type { Station, Dish } from "@restaurant/shared";
import { fetchMeta, createOrder, type FeasibilityWarning } from "../api";

export function NewOrderForm() {
  const [meta, setMeta] = useState<{ stations: Station[]; dishes: Dish[] } | null>(null);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [promise, setPromise] = useState(15);
  const [submitting, setSubmitting] = useState(false);
  const [warning, setWarning] = useState<FeasibilityWarning | null>(null);
  const nav = useNavigate();

  useEffect(() => { fetchMeta().then(setMeta).catch(console.error); }, []);

  const items = useMemo(() => {
    const out: number[] = [];
    for (const [dishIdStr, count] of Object.entries(qty)) {
      const dishId = Number(dishIdStr);
      for (let i = 0; i < count; i++) out.push(dishId);
    }
    return out;
  }, [qty]);

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

  const totalItems = items.length;

  const dishById = new Map(meta.dishes.map(d => [d.id, d]));
  const stationName = (id: number) => meta.stations.find(s => s.id === id)?.name ?? "?";

  const submit = async (force: boolean, overridePromise?: number) => {
    if (totalItems === 0) return;
    const promiseToUse = overridePromise ?? promise;
    setSubmitting(true);
    try {
      const result = await createOrder(promiseToUse, items, { force });
      if (result.ok) {
        setWarning(null);
        nav("/overview");
        return;
      }
      // Server flagged the order as infeasible.
      setWarning(result.warning);
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmitClick = () => submit(false);
  const onUseSuggested = () => {
    if (!warning) return;
    setPromise(warning.suggested_minimum_minutes);
    submit(false, warning.suggested_minimum_minutes);
  };
  const onForce = () => submit(true);

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

        <div className="pan-form-actions">
          <Button
            intent="primary"
            icon="confirm"
            text={`Send to line — ${totalItems} item${totalItems === 1 ? "" : "s"}`}
            disabled={totalItems === 0 || submitting}
            loading={submitting}
            onClick={onSubmitClick}
          />
        </div>
      </Card>

      <Dialog
        isOpen={!!warning}
        onClose={() => !submitting && setWarning(null)}
        title="Promise time may not be met"
        icon="warning-sign"
        canEscapeKeyClose={!submitting}
        canOutsideClickClose={!submitting}
      >
        {warning && (
          <div className="pan-feasibility">
            <p>
              Given the current queue, this order can&apos;t be delivered in
              {" "}<b>{warning.promise_time_minutes} minute{warning.promise_time_minutes === 1 ? "" : "s"}</b>.
              The earliest feasible promise is
              {" "}<b>{warning.suggested_minimum_minutes} minute{warning.suggested_minimum_minutes === 1 ? "" : "s"}</b>.
            </p>
            <table className="pan-feasibility-table">
              <thead>
                <tr><th>Item</th><th>Station</th><th>ETA</th><th>Late by</th></tr>
              </thead>
              <tbody>
                {warning.late_items.map((li, i) => {
                  const dish = dishById.get(li.dish_id);
                  return (
                    <tr key={i}>
                      <td>{dish?.name ?? `dish ${li.dish_id}`}</td>
                      <td>{dish ? stationName(dish.station_id) : "—"}</td>
                      <td className="pan-num">{li.projected_minutes_from_now}m</td>
                      <td className="pan-num is-late">+{li.late_by_minutes}m</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="pan-feasibility-actions">
              <Button text="Cancel" onClick={() => setWarning(null)} disabled={submitting} />
              <Button
                text={`Use ${warning.suggested_minimum_minutes}m and submit`}
                onClick={onUseSuggested}
                disabled={submitting}
                loading={submitting}
              />
              <Button
                intent="danger"
                text="Submit anyway"
                onClick={onForce}
                disabled={submitting}
                loading={submitting}
              />
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
