-- Stations like Cold (pulling pre-prepped items from the fridge) don't have a
-- meaningful capacity bottleneck. Mark them as unlimited so the scheduler
-- promotes every pending task without enforcing the capacity check.
ALTER TABLE stations
  ADD COLUMN IF NOT EXISTS unlimited BOOLEAN NOT NULL DEFAULT false;

UPDATE stations SET unlimited = true WHERE name = 'Cold';
