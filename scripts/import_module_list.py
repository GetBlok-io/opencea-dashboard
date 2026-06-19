import json
import os
import re
import sys
from typing import Any, Dict, Iterable, Tuple

import psycopg
from psycopg.types.json import Jsonb

DATABASE_URL = os.getenv("DATABASE_URL")

UPSERT_SQL = """
INSERT INTO module_list (
    alias_key,
    module_id,
    io_key,
    io_override,
    display_name,
    zone,
    aliased_zone,
    display_order,
    module_type,
    raw_record
)
VALUES (
    %(alias_key)s,
    %(module_id)s,
    %(io_key)s,
    %(io_override)s,
    %(display_name)s,
    %(zone)s,
    %(aliased_zone)s,
    %(display_order)s,
    %(module_type)s,
    %(raw_record)s
)
ON CONFLICT (alias_key)
DO UPDATE SET
    module_id = EXCLUDED.module_id,
    io_key = EXCLUDED.io_key,
    io_override = EXCLUDED.io_override,
    display_name = EXCLUDED.display_name,
    zone = EXCLUDED.zone,
    aliased_zone = EXCLUDED.aliased_zone,
    display_order = EXCLUDED.display_order,
    module_type = EXCLUDED.module_type,
    raw_record = EXCLUDED.raw_record;
"""


def extract_json_objects(text: str) -> list[Dict[str, Any]]:
    """
    The uploaded module_list file may be either clean JSON or copied page text that
    contains more than one JSON object. This extracts balanced top-level objects.
    """
    objects: list[Dict[str, Any]] = []
    depth = 0
    start = None
    in_string = False
    escape = False

    for index, char in enumerate(text):
        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
            continue

        if char == "{":
            if depth == 0:
                start = index
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0 and start is not None:
                candidate = text[start : index + 1]
                try:
                    parsed = json.loads(candidate)
                    if isinstance(parsed, dict):
                        objects.append(parsed)
                except json.JSONDecodeError:
                    pass
                start = None

    return objects


def choose_mapping_object(objects: list[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Prefer the alias mapping object because it contains module/io/name/zone fields.
    Fallback to the first object if only the plain module list exists.
    """
    for obj in reversed(objects):
        values = list(obj.values())
        if values and all(isinstance(value, dict) for value in values):
            records = [value for value in values if isinstance(value, dict)]
            alias_like_count = sum(
                1
                for record in records
                if "module" in record and "io" in record and "name" in record
            )
            if alias_like_count >= max(1, len(records) // 2):
                return obj

    if not objects:
        raise ValueError("No JSON object found in module list file.")

    return objects[0]


def load_mapping(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as file:
        text = file.read()

    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    return choose_mapping_object(extract_json_objects(text))


def normalize_rows(mapping: Dict[str, Any]) -> Iterable[Dict[str, Any]]:
    for key, record in mapping.items():
        if not isinstance(record, dict):
            continue

        # Alias mapping records use { module, io, name, zone, order }.
        # Plain module records use { type, name } and the key itself is the module id.
        module_id = record.get("module") or key
        io_key = record.get("io")
        name = record.get("name") or key

        yield {
            "alias_key": str(key),
            "module_id": str(module_id),
            "io_key": str(io_key) if io_key is not None else None,
            "io_override": record.get("io_override"),
            "display_name": str(name),
            "zone": record.get("zone"),
            "aliased_zone": record.get("aliased_zone"),
            "display_order": int(record.get("order", 0) or 0),
            "module_type": record.get("type"),
            "raw_record": Jsonb(record),
        }


def import_rows(rows: Iterable[Dict[str, Any]]) -> int:
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL environment variable is required.")

    rows = list(rows)
    if not rows:
        return 0

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.executemany(UPSERT_SQL, rows)
        conn.commit()

    return len(rows)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python scripts/import_module_list.py /path/to/module_list.json")

    mapping = load_mapping(sys.argv[1])
    count = import_rows(normalize_rows(mapping))
    print(f"Module list import complete. Rows processed: {count}")


if __name__ == "__main__":
    main()
