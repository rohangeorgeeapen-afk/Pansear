CREATE TABLE IF NOT EXISTS stations (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  capacity    INT NOT NULL CHECK (capacity > 0)
);

CREATE TABLE IF NOT EXISTS dishes (
  id                SERIAL PRIMARY KEY,
  name              TEXT NOT NULL,
  station_id        INT NOT NULL REFERENCES stations(id),
  cook_time_minutes INT NOT NULL CHECK (cook_time_minutes > 0)
);

CREATE TABLE IF NOT EXISTS orders (
  id                     SERIAL PRIMARY KEY,
  placed_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  promise_time_minutes   INT NOT NULL,
  cancelled_at           TIMESTAMPTZ
);

DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'done', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS cook_tasks (
  id          SERIAL PRIMARY KEY,
  order_id    INT NOT NULL REFERENCES orders(id),
  dish_id     INT NOT NULL REFERENCES dishes(id),
  status      task_status NOT NULL DEFAULT 'pending',
  started_at  TIMESTAMPTZ,
  ended_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON cook_tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_order  ON cook_tasks(order_id);
