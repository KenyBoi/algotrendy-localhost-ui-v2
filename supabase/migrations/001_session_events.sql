-- ═══════════════════════════════════════════════════════════════════════════
-- AlgoTrendy Session Events Table
-- Feature #3: Session Recording / Export
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.session_events (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id    TEXT NOT NULL,
    user_id       UUID NOT NULL,
    event_type    TEXT NOT NULL,
    event_payload JSONB NOT NULL DEFAULT '{}',
    timestamp_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for query patterns
CREATE INDEX IF NOT EXISTS idx_session_events_session_id
    ON public.session_events(session_id);

CREATE INDEX IF NOT EXISTS idx_session_events_user_id
    ON public.session_events(user_id);

CREATE INDEX IF NOT EXISTS idx_session_events_timestamp
    ON public.session_events(timestamp_utc DESC);

CREATE INDEX IF NOT EXISTS idx_session_events_type
    ON public.session_events(event_type);

-- Composite for paginated session listing
CREATE INDEX IF NOT EXISTS idx_session_events_session_time
    ON public.session_events(session_id, timestamp_utc DESC);

-- Row Level Security
ALTER TABLE public.session_events ENABLE ROW LEVEL SECURITY;

-- Users can only read their own session events
CREATE POLICY "Users read own sessions"
    ON public.session_events
    FOR SELECT
    USING (auth.uid() = user_id);

-- Service role can insert events for any user
CREATE POLICY "Service role insert"
    ON public.session_events
    FOR INSERT
    WITH CHECK (true);

-- Permissions
GRANT SELECT ON public.session_events TO authenticated;
GRANT INSERT ON public.session_events TO service_role;
GRANT SELECT ON public.session_events TO service_role;
