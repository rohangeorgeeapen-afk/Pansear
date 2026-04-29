# Server

Node + Express + Postgres + WebSockets.

## HTTP

| Method | Path                     | Purpose                                       |
| ------ | ------------------------ | --------------------------------------------- |
| GET    | `/meta`                  | stations + dishes (for forms / station views) |
| GET    | `/state`                 | full snapshot (initial render before WS)      |
| POST   | `/orders`                | `{ promise_time_minutes, items: [dishId] }`   |
| POST   | `/orders/:id/cancel`     | cancel order + its non-terminal tasks         |
| POST   | `/tasks/:id/start`       | pending → in_progress, sets `started_at`      |
| POST   | `/tasks/:id/end`         | in_progress → done, sets `ended_at`           |

Every mutation runs the scheduler and broadcasts to all WS clients.

## WebSocket protocol

Server → client only in v1. Clients act via HTTP.

```ts
type ServerToClientMessage = {
  type: "queue_update";
  payload: {
    queues: StationQueue[];     // per-station cook_next + in_progress
    orders: ActiveOrderView[];  // active orders + their tasks (for /expo)
  };
};
```

A fresh WS connection receives a `queue_update` immediately on connect.

## Scheduler

The pure brain lives in `src/scheduler.ts`. Tested in `src/scheduler.test.ts` (`npm test`). The algorithm is exactly the spec — slack = (placed_at + promise) − now − cook_time, sort ascending per station, top N where N = capacity − in_progress count.
