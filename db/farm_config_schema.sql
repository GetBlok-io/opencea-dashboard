CREATE TABLE IF NOT EXISTS farm_registry (
    id BIGSERIAL PRIMARY KEY,
    controller_id UUID NOT NULL UNIQUE,
    group_id UUID,
    farm_name TEXT NOT NULL,
    config_type TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS farm_config_snapshot (
    id BIGSERIAL PRIMARY KEY,
    controller_id UUID NOT NULL REFERENCES farm_registry(controller_id) ON DELETE CASCADE,
    group_id UUID,
    config_name TEXT NOT NULL,
    source_filename TEXT NOT NULL,
    config_payload JSONB NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payload_updated_at TIMESTAMPTZ,
    payload_recipe_id UUID,
    payload_recipe_name TEXT,
    UNIQUE (controller_id, config_name, captured_at)
);

CREATE INDEX IF NOT EXISTS idx_farm_config_snapshot_controller
    ON farm_config_snapshot (controller_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_farm_config_snapshot_config_name
    ON farm_config_snapshot (config_name);

CREATE INDEX IF NOT EXISTS idx_farm_config_snapshot_payload_gin
    ON farm_config_snapshot USING GIN (config_payload);

CREATE OR REPLACE FUNCTION set_farm_registry_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_farm_registry_updated_at ON farm_registry;
CREATE TRIGGER trg_farm_registry_updated_at
BEFORE UPDATE ON farm_registry
FOR EACH ROW
EXECUTE FUNCTION set_farm_registry_updated_at();
