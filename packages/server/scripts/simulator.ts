// Fires synthetic orders at the running server. Usage:
//   npm run simulate -- --orders 20 --base http://localhost:3001
const argv = process.argv.slice(2);
function arg(name: string, def: string): string {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
}
const ORDERS = Number(arg("orders", "10"));
const BASE = arg("base", "http://localhost:3001");

const pick = <T,>(arr: T[], n: number): T[] => {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < n && copy.length) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
};
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const rand = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));

async function main() {
  const meta = await fetch(`${BASE}/meta`).then(r => r.json()) as { dishes: { id: number }[] };
  const dishIds = meta.dishes.map(d => d.id);
  if (dishIds.length === 0) {
    console.error("no dishes — run migrations first");
    process.exit(1);
  }
  console.log(`firing ${ORDERS} orders at ${BASE}`);
  for (let i = 0; i < ORDERS; i++) {
    const items = pick(dishIds, rand(1, 4));
    const promise_time_minutes = rand(10, 25);
    const r = await fetch(`${BASE}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ promise_time_minutes, items }),
    });
    if (!r.ok) {
      console.error(`order ${i} failed: ${r.status}`);
    } else {
      const { order_id } = await r.json() as { order_id: number };
      console.log(`order ${order_id}: ${items.length} items, promise ${promise_time_minutes}m`);
    }
    await sleep(rand(5000, 20000));
  }
  console.log("done");
}

main().catch(err => { console.error(err); process.exit(1); });
