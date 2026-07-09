#!/usr/bin/env python3
"""Import Farmhand-local controller data into the OpenCEA dashboard database.

The script supports two modes:

1. Online mode: fetch from a Farmhand controller on the same LAN.
2. Files mode: import previously exported JSON files.

Only the reported-state/debug payload is inserted into reported_state. The other
Farmhand endpoint payloads are stored as farm_config_snapshot records so they can
be inspected and reused by Recipe/Control features without requiring separate
manual imports.
"""

from __future__ import annotations

import html
import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, Mapping, Optional
from urllib.parse import urljoin

import requests
from dotenv import load_dotenv

load_dotenv()

import psycopg
from psycopg.types.json import Jsonb

DEFAULT_BASE_URL = "http://192.168.200.200:3001"
DEFAULT_TIMEOUT_SECONDS = 30
DEFAULT_CONFIG_TYPE = "greenery-s"

ENDPOINTS = {
    "controller": "/",
    "reported_state": "/debug",
    "cameras": "/cameras",
    "modules": "/modules",
    "programming": "/programming",
    "settings": "/settings",
}

REPORTED_STATE_BASE_COLUMNS = [
    "source_url",
    "scraped_at",
    "device_id",
    "device_type",
    "device_last_update_epoch",
    "device_last_update_at",
    "connected",
    "state",
    "mode",
    "shadow",
    "raw_record",
]

REPORTED_STATE_IDENTITY_COLUMNS = ["controller_id", "group_id"]

class IdentityMismatchError(RuntimeError):
    """Raised when configured farm identity conflicts with Farmhand online metadata."""

def fetch_text(url: str, timeout_seconds: int) -> str:
    response = requests.get(url, timeout=timeout_seconds)
    response.raise_for_status()
    return response.text


def parse_controller_metadata(text: str) -> dict[str, str]:
    controller_match = re.search(
        r"Controller ID:\s*([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})",
        text,
    )
    group_match = re.search(
        r"Group ID:\s*([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})",
        text,
    )
    version_match = re.search(r"Controller Version:\s*([^<\r\n]+)", text)

    return {
        "controller_id": controller_match.group(1) if controller_match else "",
        "group_id": group_match.group(1) if group_match else "",
        "controller_version": version_match.group(1).strip() if version_match else "",
    }


def extract_code_json_blocks(text: str, source_url: str) -> list[Any]:
    blocks = re.findall(r"<pre><code>(.*?)</code></pre>", text, flags=re.IGNORECASE | re.DOTALL)

    parsed_blocks: list[Any] = []
    for index, block in enumerate(blocks):
        decoded = html.unescape(block).strip()
        try:
            parsed_blocks.append(json.loads(decoded))
        except json.JSONDecodeError as exc:
            preview = decoded[:500].replace("\n", " ").replace("\r", " ")
            raise ValueError(
                f"Found a <pre><code> block in {source_url}, but block #{index + 1} is not valid JSON. "
                f"Preview: {preview}"
            ) from exc

    if parsed_blocks:
        return parsed_blocks

    return [extract_first_json_object(text, source_url)]


def extract_first_json_object(text: str, source_url: str) -> Any:
    decoder = json.JSONDecoder()

    for index, char in enumerate(text):
        if char not in ("{", "["):
            continue

        try:
            parsed, _ = decoder.raw_decode(text[index:])
            return parsed
        except json.JSONDecodeError:
            continue

    preview = text[:500].replace("\n", " ").replace("\r", " ")
    raise ValueError(
        f"Could not find valid JSON in response from {source_url}. "
        f"Response preview: {preview}"
    )


def normalize_farmhand_page_payload(name: str, blocks: list[Any]) -> Any:
    if name == "reported_state":
        if not blocks:
            raise ValueError("The /debug page did not contain a reported-state JSON block.")
        return blocks[0]

    if name == "settings":
        return {
            "global_settings": blocks[0] if len(blocks) > 0 else {},
            "local_settings": blocks[1] if len(blocks) > 1 else {},
        }

    if name == "programming":
        return {
            "actions": blocks[0] if len(blocks) > 0 else {},
            "rules": blocks[1] if len(blocks) > 1 else {},
            "modes": blocks[2] if len(blocks) > 2 else {},
        }

    if name == "modules":
        return {
            "module_list": blocks[0] if len(blocks) > 0 else {},
            "module_mapping": blocks[1] if len(blocks) > 1 else {},
        }

    if name == "cameras":
        return {
            "camera_list": blocks[0] if len(blocks) > 0 else {},
            "camera_mapping": blocks[1] if len(blocks) > 1 else {},
        }

    if len(blocks) == 1:
        return blocks[0]

    return {"blocks": blocks}


def fetch_farmhand_page(name: str, url: str, timeout_seconds: int) -> Any:
    text = fetch_text(url, timeout_seconds=timeout_seconds)

    if name == "controller":
        return parse_controller_metadata(text)

    blocks = extract_code_json_blocks(text, source_url=url)
    return normalize_farmhand_page_payload(name, blocks)

def safe_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def epoch_to_datetime(epoch_value: Any) -> Optional[datetime]:
    epoch_float = safe_float(epoch_value)
    if epoch_float is None:
        return None

    try:
        return datetime.fromtimestamp(epoch_float, tz=timezone.utc)
    except (OSError, OverflowError, ValueError):
        return None

def normalize_url(base_url: str, endpoint: str) -> str:
    return urljoin(base_url.rstrip("/") + "/", endpoint.lstrip("/"))

def load_json_file(path: Optional[str]) -> Any:
    if not path:
        return None

    with Path(path).open("r", encoding="utf-8") as file:
        return json.load(file)


def recursive_find_id(payload: Any, preferred_keys: Iterable[str]) -> Optional[str]:
    keys = {key.lower() for key in preferred_keys}

    def walk(value: Any) -> Optional[str]:
        if isinstance(value, Mapping):
            for key, child in value.items():
                normalized_key = str(key).lower().replace("-", "_")
                if normalized_key in keys and child:
                    return str(child)
            for child in value.values():
                found = walk(child)
                if found:
                    return found
        elif isinstance(value, list):
            for child in value:
                found = walk(child)
                if found:
                    return found
        return None

    return walk(payload)


def looks_like_uuid(value: Optional[str]) -> bool:
    if not value:
        return False
    return bool(re.fullmatch(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", value))

def normalize_uuid(value: Optional[str]) -> Optional[str]:
    if value and looks_like_uuid(value):
        return value.lower()
    return value


def discover_controller_identity(controller_payload: Any) -> tuple[Optional[str], Optional[str]]:
    if controller_payload is None:
        return None, None

    controller_id = recursive_find_id(
        controller_payload,
        ["controller_id", "controllerId", "controller", "controller_uuid", "id"],
    )
    group_id = recursive_find_id(
        controller_payload,
        ["group_id", "groupId", "group", "organization_id", "organizationId", "farm_group_id"],
    )

    return normalize_uuid(controller_id), normalize_uuid(group_id)


def validate_online_identity(
    controller_payload: Any,
    configured_controller_id: Optional[str],
    configured_group_id: Optional[str],
    allow_identity_mismatch: bool,
) -> tuple[Optional[str], Optional[str]]:
    discovered_controller_id, discovered_group_id = discover_controller_identity(controller_payload)

    configured_controller_id = normalize_uuid(configured_controller_id)
    configured_group_id = normalize_uuid(configured_group_id)

    mismatches: list[str] = []

    if configured_controller_id and discovered_controller_id and configured_controller_id != discovered_controller_id:
        mismatches.append(
            f"Configured controller_id: {configured_controller_id}\n"
            f"Discovered controller_id: {discovered_controller_id}"
        )

    if configured_group_id and discovered_group_id and configured_group_id != discovered_group_id:
        mismatches.append(
            f"Configured group_id: {configured_group_id}\n"
            f"Discovered group_id: {discovered_group_id}"
        )

    if mismatches and not allow_identity_mismatch:
        raise IdentityMismatchError(
            "Farmhand identity mismatch.\n"
            + "\n".join(mismatches)
            + "\nRefusing to ingest because this could co-mingle farm telemetry.\n"
            + "Correct the .env file or rerun with --allow-identity-mismatch only for debugging."
        )

    return (
        configured_controller_id or discovered_controller_id,
        configured_group_id or discovered_group_id,
    )

def resolve_controller_identity(
    controller_payload: Any,
    explicit_controller_id: Optional[str],
    explicit_group_id: Optional[str],
) -> tuple[Optional[str], Optional[str]]:
    controller_id = explicit_controller_id or os.getenv("FARMHAND_CONTROLLER_ID")
    group_id = explicit_group_id or os.getenv("FARMHAND_GROUP_ID")

    if controller_payload is not None:
        controller_id = controller_id or recursive_find_id(
            controller_payload,
            ["controller_id", "controllerId", "controller", "controller_uuid", "id"],
        )
        group_id = group_id or recursive_find_id(
            controller_payload,
            ["group_id", "groupId", "group", "organization_id", "organizationId", "farm_group_id"],
        )

    return controller_id if looks_like_uuid(controller_id) else controller_id, group_id if looks_like_uuid(group_id) else group_id


def ensure_farm_registry(
    conn: psycopg.Connection,
    controller_id: Optional[str],
    group_id: Optional[str],
    farm_name: str,
    config_type: str,
) -> None:
    if not controller_id or not looks_like_uuid(controller_id):
        return

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO farm_registry (controller_id, group_id, farm_name, config_type)
            VALUES (%s::uuid, %s::uuid, %s, %s)
            ON CONFLICT (controller_id)
            DO UPDATE SET
              group_id = EXCLUDED.group_id,
              farm_name = EXCLUDED.farm_name,
              config_type = EXCLUDED.config_type;
            """,
            [controller_id, group_id if looks_like_uuid(group_id) else None, farm_name, config_type],
        )


def get_reported_state_columns(conn: psycopg.Connection) -> set[str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'reported_state';
            """
        )
        return {str(row[0]) for row in cur.fetchall()}


def build_reported_state_insert_sql(include_identity: bool) -> str:
    columns = REPORTED_STATE_BASE_COLUMNS.copy()
    if include_identity:
        columns = ["controller_id", "group_id", *columns]

    value_names = [f"%({column})s" for column in columns]

    update_columns = [
        "source_url",
        "scraped_at",
        "device_type",
        "device_last_update_at",
        "connected",
        "state",
        "mode",
        "shadow",
        "raw_record",
    ]
    if include_identity:
        update_columns = ["controller_id", "group_id", *update_columns]

    assignments = ",\n    ".join(f"{column} = EXCLUDED.{column}" for column in update_columns)

    return f"""
    INSERT INTO reported_state (
        {", ".join(columns)}
    )
    VALUES (
        {", ".join(value_names)}
    )
    ON CONFLICT (device_id, device_last_update_epoch)
    DO UPDATE SET
        {assignments};
    """


def build_reported_state_rows(
    payload: Dict[str, Any],
    source_url: str,
    scraped_at: datetime,
    controller_id: Optional[str],
    group_id: Optional[str],
    include_identity: bool,
) -> list[Dict[str, Any]]:
    rows: list[Dict[str, Any]] = []

    for device_id, record in payload.items():
        if not isinstance(record, dict):
            print(f"Skipping device {device_id}: expected object record.", file=sys.stderr)
            continue

        last_update_epoch = safe_float(record.get("last_update"))
        row: Dict[str, Any] = {
            "source_url": source_url,
            "scraped_at": scraped_at,
            "device_id": str(device_id),
            "device_type": str(record.get("type", "unknown")),
            "device_last_update_epoch": last_update_epoch,
            "device_last_update_at": epoch_to_datetime(last_update_epoch),
            "connected": record.get("connected"),
            "state": Jsonb(record.get("state") or {}),
            "mode": Jsonb(record.get("mode") or {}),
            "shadow": Jsonb(record.get("shadow") or {}),
            "raw_record": Jsonb(record),
        }

        if include_identity:
            row["controller_id"] = controller_id if looks_like_uuid(controller_id) else None
            row["group_id"] = group_id if looks_like_uuid(group_id) else None

        rows.append(row)

    return rows


def ingest_reported_state(
    conn: psycopg.Connection,
    payload: Any,
    source_url: str,
    scraped_at: datetime,
    controller_id: Optional[str],
    group_id: Optional[str],
) -> int:
    if not isinstance(payload, dict):
        raise ValueError("Reported-state payload must be a root JSON object keyed by device_id.")

    table_columns = get_reported_state_columns(conn)
    include_identity = all(column in table_columns for column in REPORTED_STATE_IDENTITY_COLUMNS)
    sql = build_reported_state_insert_sql(include_identity=include_identity)
    rows = build_reported_state_rows(
        payload,
        source_url=source_url,
        scraped_at=scraped_at,
        controller_id=controller_id,
        group_id=group_id,
        include_identity=include_identity,
    )

    if not rows:
        return 0

    with conn.cursor() as cur:
        cur.executemany(sql, rows)
    return len(rows)


def maybe_extract_recipe_id(payload: Any) -> Optional[str]:
    value = recursive_find_id(payload, ["recipe_id", "recipeId", "active_recipe_id", "activeRecipeId"])
    return value if looks_like_uuid(value) else None


def maybe_extract_recipe_name(payload: Any) -> Optional[str]:
    value = recursive_find_id(payload, ["recipe_name", "recipeName", "active_recipe_name", "activeRecipeName", "name"])
    return value


def ingest_config_snapshot(
    conn: psycopg.Connection,
    config_name: str,
    payload: Any,
    source_name: str,
    captured_at: datetime,
    controller_id: Optional[str],
    group_id: Optional[str],
) -> bool:
    if payload is None:
        return False
    if not controller_id or not looks_like_uuid(controller_id):
        print(f"Skipping {config_name}: controller_id is required for farm_config_snapshot.", file=sys.stderr)
        return False

    recipe_id = maybe_extract_recipe_id(payload)
    recipe_name = maybe_extract_recipe_name(payload)

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO farm_config_snapshot (
                controller_id,
                group_id,
                config_name,
                source_filename,
                config_payload,
                captured_at,
                payload_recipe_id,
                payload_recipe_name
            )
            VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s, %s::uuid, %s);
            """,
            [
                controller_id,
                group_id if looks_like_uuid(group_id) else None,
                config_name,
                source_name,
                Jsonb(payload),
                captured_at,
                recipe_id,
                recipe_name,
            ],
        )

    return True


def fetch_online_payloads(base_url: str, timeout_seconds: int) -> tuple[dict[str, Any], dict[str, str]]:
    payloads: dict[str, Any] = {}
    sources: dict[str, str] = {}

    for name, endpoint in ENDPOINTS.items():
        url = normalize_url(base_url, endpoint)
        payloads[name] = fetch_farmhand_page(name, url, timeout_seconds=timeout_seconds)
        sources[name] = url

    return payloads, sources

def load_file_payloads(args: argparse.Namespace) -> tuple[dict[str, Any], dict[str, str]]:
    paths = {
        "controller": args.controller_file,
        "reported_state": args.reported_state_file,
        "cameras": args.cameras_file,
        "modules": args.modules_file,
        "programming": args.programming_file,
        "settings": args.settings_file,
    }

    payloads: dict[str, Any] = {}
    sources: dict[str, str] = {}

    for name, path in paths.items():
        payload = load_json_file(path)
        if payload is not None:
            payloads[name] = payload
            sources[name] = f"file://{Path(path).resolve()}"

    return payloads, sources


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import Farmhand local controller data into OpenCEA.")
    subparsers = parser.add_subparsers(dest="mode")

    online = subparsers.add_parser("online", help="Fetch from the farm-local Farmhand controller.")
    online.add_argument("--base-url", default=os.getenv("FARMHAND_BASE_URL", DEFAULT_BASE_URL))
    online.add_argument("--timeout", type=int, default=int(os.getenv("REQUEST_TIMEOUT_SECONDS", str(DEFAULT_TIMEOUT_SECONDS))))

    online.add_argument(
    "--allow-identity-mismatch",
    action="store_true",
    help="Allow .env/CLI controller or group IDs to differ from the Farmhand root page. Debug use only.",
    )
    
    online.add_argument(
    "--check-identity",
    action="store_true",
    help="Fetch online metadata, validate identity, print the result, and exit without database writes.",
    )

    files = subparsers.add_parser("files", help="Import already exported JSON files.")
    files.add_argument("--controller-file")
    files.add_argument("--reported-state-file", required=True)
    files.add_argument("--cameras-file")
    files.add_argument("--modules-file")
    files.add_argument("--programming-file")
    files.add_argument("--settings-file")

    for subparser in (online, files):
        subparser.add_argument("--database-url", default=os.getenv("DATABASE_URL"))
        subparser.add_argument("--controller-id", default=os.getenv("FARMHAND_CONTROLLER_ID"))
        subparser.add_argument("--group-id", default=os.getenv("FARMHAND_GROUP_ID"))
        subparser.add_argument("--farm-name", default=os.getenv("FARM_NAME", "OpenCEA Farm"))
        subparser.add_argument("--config-type", default=os.getenv("FARM_CONFIG_TYPE", DEFAULT_CONFIG_TYPE))
        subparser.add_argument("--skip-config", action="store_true", help="Only ingest /debug reported-state data.")
        subparser.add_argument(
            "--dry-run",
            action="store_true",
            help="Fetch and parse payloads, print a summary, and exit without database writes.",
        )

    args = parser.parse_args()
    if args.mode is None:
        args.mode = "online"
        args.base_url = os.getenv("FARMHAND_BASE_URL", DEFAULT_BASE_URL)
        args.timeout = int(os.getenv("REQUEST_TIMEOUT_SECONDS", str(DEFAULT_TIMEOUT_SECONDS)))
        args.database_url = os.getenv("DATABASE_URL")
        args.controller_id = os.getenv("FARMHAND_CONTROLLER_ID")
        args.group_id = os.getenv("FARMHAND_GROUP_ID")
        args.farm_name = os.getenv("FARM_NAME", "OpenCEA Farm")
        args.config_type = os.getenv("FARM_CONFIG_TYPE", DEFAULT_CONFIG_TYPE)
        args.skip_config = False
        args.allow_identity_mismatch = False
        args.check_identity = False
        args.dry_run = False

    return args


def main() -> None:
    args = parse_args()
    captured_at = datetime.now(timezone.utc)

    if args.mode == "files":
        payloads, sources = load_file_payloads(args)
        controller_id, group_id = resolve_controller_identity(
            payloads.get("controller"),
            explicit_controller_id=args.controller_id,
            explicit_group_id=args.group_id,
        )
    else:
        payloads, sources = fetch_online_payloads(args.base_url, timeout_seconds=args.timeout)
        controller_id, group_id = validate_online_identity(
            payloads.get("controller"),
            configured_controller_id=args.controller_id,
            configured_group_id=args.group_id,
            allow_identity_mismatch=getattr(args, "allow_identity_mismatch", False),
        )

    if "reported_state" not in payloads:
        raise RuntimeError("Reported-state/debug payload is required.")

    if not controller_id:
        print(
            "Warning: controller_id was not discovered. Set FARMHAND_CONTROLLER_ID or pass --controller-id for farm-aware inserts.",
            file=sys.stderr,
        )

    if getattr(args, "dry_run", False) or getattr(args, "check_identity", False):
        reported_state = payloads.get("reported_state")
        reported_state_count = len(reported_state) if isinstance(reported_state, dict) else 0

        print("Farmhand import dry run complete. No database writes performed.")
        print(f"  mode: {args.mode}")
        print(f"  controller_id: {controller_id or '-'}")
        print(f"  group_id: {group_id or '-'}")
        print(f"  reported_state devices: {reported_state_count}")
        print(f"  payloads fetched: {', '.join(sorted(payloads.keys()))}")
        return

    if not args.database_url:
        raise RuntimeError("DATABASE_URL is required.")

    with psycopg.connect(args.database_url) as conn:
        ensure_farm_registry(
            conn,
            controller_id=controller_id,
            group_id=group_id,
            farm_name=args.farm_name,
            config_type=args.config_type,
        )

        reported_count = ingest_reported_state(
            conn,
            payloads["reported_state"],
            source_url=sources.get("reported_state", "unknown"),
            scraped_at=captured_at,
            controller_id=controller_id,
            group_id=group_id,
        )

        config_count = 0
        if not args.skip_config:
            for config_name in ("controller", "cameras", "modules", "programming", "settings"):
                if ingest_config_snapshot(
                    conn,
                    config_name=config_name,
                    payload=payloads.get(config_name),
                    source_name=sources.get(config_name, config_name),
                    captured_at=captured_at,
                    controller_id=controller_id,
                    group_id=group_id,
                ):
                    config_count += 1

        conn.commit()

    print("Farmhand import complete.")
    print(f"  mode: {args.mode}")
    print(f"  controller_id: {controller_id or '-'}")
    print(f"  group_id: {group_id or '-'}")
    print(f"  reported_state rows: {reported_count}")
    print(f"  config snapshots: {config_count}")


if __name__ == "__main__":
    main()
