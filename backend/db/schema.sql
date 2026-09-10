-- Shortify schema
--
-- Provenance: recovered from db_backups/shortifydb.backup (pg_dump custom format,
-- PostgreSQL 15.15) rather than hand-written, so it matches the database the
-- application was actually developed against. Regenerate with:
--
--   docker run --rm -v "$PWD/db_backups:/b:ro" postgres:15 \
--     pg_restore --schema-only --no-owner --no-privileges -f - /b/shortifydb.backup
--
-- Loaded automatically by the postgres container via
-- /docker-entrypoint-initdb.d, which only runs on an EMPTY data volume.
-- Editing this file after the volume exists does nothing. To reload:
--   docker compose -p <project> down -v && docker compose -p <project> up -d
--
-- Only the four tables the application actually queries live here. Two further
-- tables present in the dump (analytics_rollups, click_events) are unreferenced
-- by any code path and are kept in schema_legacy.sql.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- ---------------------------------------------------------------------------
-- urls
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.urls (
    id          serial PRIMARY KEY,
    long_url    text   NOT NULL,
    short_code  text   NOT NULL,
    created_at  timestamp without time zone DEFAULT now(),
    click_count bigint DEFAULT 0,
    owner_email text,
    CONSTRAINT urls_short_code_key UNIQUE (short_code)
);

-- short_code is the redirect lookup key. The UNIQUE constraint above is what
-- makes INSERT ... ON CONFLICT (short_code) possible, so code collisions are
-- arbitrated by the database rather than by a check-then-act race in the app.

-- long_url is indexed but deliberately NOT unique: the same destination may be
-- shortened by different owners. Deduplication is therefore an explicit lookup
-- scoped by owner_email, not an ON CONFLICT.
CREATE INDEX IF NOT EXISTS idx_longurl ON public.urls USING btree (long_url);

-- NOTE: idx_shortcode duplicates the index that urls_short_code_key already
-- creates. It is preserved here because this file reproduces the schema the
-- application ran against, and changing indexes mid-benchmark would confound
-- the before/after comparison. Dropping it is a recommended follow-up.
CREATE INDEX IF NOT EXISTS idx_shortcode ON public.urls USING btree (short_code);

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
    id            serial PRIMARY KEY,
    email         text NOT NULL,
    password_hash text NOT NULL,
    name          text,
    role          text DEFAULT 'user'::text,
    created_at    timestamp with time zone DEFAULT now(),
    updated_at    timestamp with time zone DEFAULT now(),
    avatar        text,
    avatar_url    text,
    CONSTRAINT users_email_key UNIQUE (email)
);

-- NOTE: also redundant with users_email_key. Preserved for the same reason.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON public.users USING btree (email);

-- ---------------------------------------------------------------------------
-- analytics
-- ---------------------------------------------------------------------------
-- One row per redirect. Note the index count below: every insert into this
-- table maintains five secondary indexes plus the primary key, which is a
-- large part of why the click write does not belong on the request path.
CREATE TABLE IF NOT EXISTS public.analytics (
    id          bigserial PRIMARY KEY,
    short_code  text NOT NULL,
    ip_hash     text NOT NULL,
    device      text,
    browser     text,
    os          text,
    country     text,
    is_qr       boolean DEFAULT false,
    referrer    text,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL
);

-- Used by every dashboard query.
CREATE INDEX IF NOT EXISTS idx_analytics_shortcode ON public.analytics USING btree (short_code);
CREATE INDEX IF NOT EXISTS idx_analytics_timestamp ON public.analytics USING btree ("timestamp");

-- Low-cardinality columns. These are of limited use to the planner and are pure
-- write-path cost, but they are part of the recovered schema and are kept so
-- both benchmark phases run against identical storage.
CREATE INDEX IF NOT EXISTS idx_analytics_device  ON public.analytics USING btree (device);
CREATE INDEX IF NOT EXISTS idx_analytics_browser ON public.analytics USING btree (browser);
CREATE INDEX IF NOT EXISTS idx_analytics_country ON public.analytics USING btree (country);

-- ---------------------------------------------------------------------------
-- blacklist
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.blacklist (
    id     serial PRIMARY KEY,
    domain text NOT NULL,
    CONSTRAINT blacklist_domain_key UNIQUE (domain)
);
