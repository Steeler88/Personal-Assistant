-- Recurring calendar events. Run in Supabase → SQL Editor.
-- SAFE TO RE-RUN — adds columns only, deletes nothing.
--
-- A repeating event stays ONE row. `event_date` is the series start, and the
-- app expands occurrences for whichever month you're looking at. Generating a
-- row per occurrence would bloat the table and make "change the class time"
-- a bulk update instead of a single edit.

alter table calendar_events
  add column if not exists repeat_weekdays smallint[],   -- 0=Sun … 6=Sat; null = one-off
  add column if not exists repeat_until    date;         -- inclusive last day; null = no end

-- Keep weekday numbers sane. <@ is "contained by", so every element must be 0-6.
alter table calendar_events drop constraint if exists calendar_events_weekdays_valid;
alter table calendar_events add constraint calendar_events_weekdays_valid
  check (
    repeat_weekdays is null
    or repeat_weekdays <@ ARRAY[0,1,2,3,4,5,6]::smallint[]
  );

-- A repeat window that ends before it starts would silently render nothing.
alter table calendar_events drop constraint if exists calendar_events_repeat_window;
alter table calendar_events add constraint calendar_events_repeat_window
  check (repeat_until is null or repeat_until >= event_date);
