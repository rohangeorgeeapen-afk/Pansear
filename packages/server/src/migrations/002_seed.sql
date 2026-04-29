-- Idempotent seed: only inserts if stations table is empty.
INSERT INTO stations (name, capacity)
SELECT * FROM (VALUES
  ('Grill', 2),
  ('Fryer', 2),
  ('Cold', 1)
) AS v(name, capacity)
WHERE NOT EXISTS (SELECT 1 FROM stations);

INSERT INTO dishes (name, station_id, cook_time_minutes)
SELECT v.name, s.id, v.ct FROM (VALUES
  ('Burger',         'Grill', 8),
  ('Steak',          'Grill', 12),
  ('Grilled Chicken','Grill', 10),
  ('Salmon',         'Grill', 9),
  ('Fries',          'Fryer', 4),
  ('Onion Rings',    'Fryer', 5),
  ('Chicken Wings',  'Fryer', 7),
  ('Caesar Salad',   'Cold',  3),
  ('Garden Salad',   'Cold',  3),
  ('Fruit Plate',    'Cold',  2)
) AS v(name, station_name, ct)
JOIN stations s ON s.name = v.station_name
WHERE NOT EXISTS (SELECT 1 FROM dishes);
