CREATE TABLE IF NOT EXISTS module_list (
    id BIGSERIAL PRIMARY KEY,

    -- Stable alias key from module_aliases.json, such as cultivation_ph or air_temperature.
    alias_key TEXT NOT NULL UNIQUE,

    -- Hardware module/device id. This matches reported_state.device_id.
    module_id TEXT NOT NULL,

    -- IO/state key on that module, such as temp, pH, ec, output_1, pump_1, analog_1.
    io_key TEXT,

    -- Optional override from the mapping file. When present, use this as the display IO key.
    io_override TEXT,

    -- User-facing label and grouping metadata.
    display_name TEXT NOT NULL,
    zone TEXT,
    aliased_zone TEXT,
    display_order INTEGER DEFAULT 0,

    -- Keep the source type if the upload contains top-level module records.
    module_type TEXT,

    -- Full raw mapping record for audit/debugging and future fields.
    raw_record JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_module_list_module_id
    ON module_list (module_id);

CREATE INDEX IF NOT EXISTS idx_module_list_module_io
    ON module_list (module_id, io_key);

CREATE INDEX IF NOT EXISTS idx_module_list_zone
    ON module_list (zone);

CREATE INDEX IF NOT EXISTS idx_module_list_display_order
    ON module_list (zone, display_order, display_name);

CREATE OR REPLACE FUNCTION set_module_list_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_module_list_updated_at ON module_list;
CREATE TRIGGER trg_module_list_updated_at
BEFORE UPDATE ON module_list
FOR EACH ROW
EXECUTE FUNCTION set_module_list_updated_at();
