-- Legacy tables, NOT loaded by default.
--
-- These two tables exist in db_backups/shortifydb.backup but no code path in
-- src/ reads or writes them. They are kept here so the recovered schema is not
-- silently lossy, and excluded from schema.sql so the benchmark stack does not
-- carry storage the application never touches.
--
-- To load them:
--   psql "$POSTGRES_URL" -f db/schema_legacy.sql
--
-- click_events is worth a look before deleting it: it was evidently an earlier
-- design for the same data analytics now holds, with richer fields
-- (region, city, redirect_time_ms, status_code) and a real foreign key to urls.
-- The current analytics table has neither the FK nor the timing column.

CREATE TABLE IF NOT EXISTS public.analytics_rollups (
    day        date NOT NULL,
    short_code text NOT NULL,
    clicks     integer DEFAULT 0,
    qr_scans   integer DEFAULT 0,
    PRIMARY KEY (day, short_code)
);

CREATE TABLE IF NOT EXISTS public.click_events (
    id               bigserial PRIMARY KEY,
    url_id           integer REFERENCES public.urls(id) ON DELETE CASCADE,
    clicked_at       timestamp without time zone DEFAULT now(),
    ip_hash          text,
    country          text,
    region           text,
    city             text,
    device_type      text,
    os               text,
    browser          text,
    referrer         text,
    redirect_time_ms integer,
    status_code      integer
);
