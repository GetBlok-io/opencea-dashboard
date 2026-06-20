import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import psycopg
from psycopg.types.json import Jsonb

DATABASE_URL = os.getenv("DATABASE_URL")
CONTROLLER_ID = os.getenv("CONTROLLER_ID", "e5f03cd6-8d1c-11ed-897e-17d755fdf10c")
GROUP_ID = os.getenv("GROUP_ID", "e7aaaf4e-28c2-4e3f-81be-1584b4386416")
FARM_NAME = os.getenv("FARM_NAME", "PeaPod-1")
CONFIG_TYPE = os.getenv("CONFIG_TYPE", "greenery-s")

CONFIG_FILES = {
    "camera_mapping": "camera_mapping.json",
    "current_cameras": "current_cameras.json",
    "current_modules": "current_modules.json",
    "global_settings": "global_settings.json",
    "local_settings": "local_settings.json",
    "module_mapping": "module_mapping.json",
    "programming_actions": "programming_actions.json",
    "programming_modes": "programming_modes.json",
    "programming_rules": "programming_rules.json",
    "reported_state_sample": "reported_state.json",
}


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as file:
        payload = json.load(file)
    if not isinstance(payload, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return payload


def epoch_ms_to_dt(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if numeric > 10_000_000_000:
        numeric = numeric / 1000
    return datetime.fromtimestamp(numeric, tz=timezone.utc)


def import_configs(data_dir: Path) -> int:
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL environment variable is required")

    now = datetime.now(timezone.utc)
    rows = []

    for config_name, filename in CONFIG_FILES.items():
        path = data_dir / filename
        example_path = data_dir / filename.replace(".json", ".example.json")
        actual_path = path if path.exists() else example_path
        if not actual_path.exists():
            print(f"Skipping missing file: {filename}")
            continue

        payload = load_json(actual_path)
        meta = payload.get("meta") if isinstance(payload.get("meta"), dict) else {}
        rows.append({
            "controller_id": CONTROLLER_ID,
            "group_id": GROUP_ID,
            "config_name": config_name,
            "source_filename": actual_path.name,
            "config_payload": Jsonb(payload),
            "captured_at": now,
            "payload_updated_at": epoch_ms_to_dt(meta.get("updated_at")),
            "payload_recipe_id": meta.get("recipe_id"),
            "payload_recipe_name": meta.get("recipe_name") or payload.get("recipe_name"),
        })

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO farm_registry (controller_id, group_id, farm_name, config_type)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (controller_id)
                DO UPDATE SET
                    group_id = EXCLUDED.group_id,
                    farm_name = EXCLUDED.farm_name,
                    config_type = EXCLUDED.config_type;
                """,
                (CONTROLLER_ID, GROUP_ID, FARM_NAME, CONFIG_TYPE),
            )
            cur.executemany(
                """
                INSERT INTO farm_config_snapshot (
                    controller_id,
                    group_id,
                    config_name,
                    source_filename,
                    config_payload,
                    captured_at,
                    payload_updated_at,
                    payload_recipe_id,
                    payload_recipe_name
                )
                VALUES (
                    %(controller_id)s,
                    %(group_id)s,
                    %(config_name)s,
                    %(source_filename)s,
                    %(config_payload)s,
                    %(captured_at)s,
                    %(payload_updated_at)s,
                    %(payload_recipe_id)s,
                    %(payload_recipe_name)s
                );
                """,
                rows,
            )
        conn.commit()

    return len(rows)


if __name__ == "__main__":
    data_dir = Path(os.getenv("CONFIG_DATA_DIR", "data"))
    count = import_configs(data_dir)
    print(f"Imported {count} farm config snapshots for {FARM_NAME} ({CONTROLLER_ID})")
