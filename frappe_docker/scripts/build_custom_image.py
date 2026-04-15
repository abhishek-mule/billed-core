#!/usr/bin/env python3
"""Build a custom ERPNext image with bundled apps from .env settings."""

from __future__ import annotations

import argparse
import base64
import json
import os
import shlex
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / ".env"
GENERATED_DIR = ROOT / "generated"
GENERATED_APPS_JSON = GENERATED_DIR / "apps.json"


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key or key in os.environ:
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        os.environ[key] = value


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def run(command: list[str]) -> None:
    printable = " ".join(shlex.quote(part) for part in command)
    print(f"$ {printable}")
    completed = subprocess.run(command, cwd=ROOT, check=False)
    if completed.returncode != 0:
        raise SystemExit(completed.returncode)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Build a custom frappe/erpnext image with bundled apps.")
    parser.add_argument("--image", default=env("CUSTOM_IMAGE", "local/erpnext-custom"))
    parser.add_argument("--tag", default=env("CUSTOM_TAG", "v16.13.3-local"))
    parser.add_argument("--containerfile", default="images/custom/Containerfile")
    parser.add_argument("--push", action="store_true", help="Pass --push to docker buildx build.")
    parser.add_argument("--load", action="store_true", help="Pass --load to docker buildx build.")
    return parser


def build_apps_manifest() -> list[dict[str, str]]:
    apps = [
        {
            "url": "https://github.com/frappe/erpnext",
            "branch": env("ERPNEXT_APP_BRANCH", env("FRAPPE_BRANCH", "version-16")),
        }
    ]

    india_repo = env("INDIA_COMPLIANCE_REPO", "https://github.com/resilient-tech/india-compliance")
    india_branch = env("INDIA_COMPLIANCE_BRANCH", "version-16")
    if india_repo:
        apps.append({"url": india_repo, "branch": india_branch})

    electrical_repo = env("ELECTRICAL_TRADER_PACK_REPO")
    electrical_branch = env("ELECTRICAL_TRADER_PACK_BRANCH", "main")
    if electrical_repo:
        apps.append({"url": electrical_repo, "branch": electrical_branch})

    return apps


def write_apps_json(apps: list[dict[str, str]]) -> str:
    GENERATED_DIR.mkdir(exist_ok=True)
    GENERATED_APPS_JSON.write_text(json.dumps(apps, indent=2) + "\n", encoding="utf-8")
    return base64.b64encode(GENERATED_APPS_JSON.read_bytes()).decode("ascii")


def main() -> None:
    load_dotenv(ENV_FILE)
    parser = build_parser()
    args = parser.parse_args()

    apps = build_apps_manifest()
    encoded_apps = write_apps_json(apps)

    command = [
        "docker",
        "buildx",
        "build",
        "--build-arg",
        f"FRAPPE_PATH={env('FRAPPE_PATH', 'https://github.com/frappe/frappe')}",
        "--build-arg",
        f"FRAPPE_BRANCH={env('FRAPPE_BRANCH', 'version-16')}",
        "--build-arg",
        f"APPS_JSON_BASE64={encoded_apps}",
        "--tag",
        f"{args.image}:{args.tag}",
        "--file",
        args.containerfile,
        ".",
    ]
    if args.push:
        command.append("--push")
    elif args.load:
        command.append("--load")

    print("Generated apps manifest at " + str(GENERATED_APPS_JSON))
    print("Bundled apps: " + ", ".join(Path(app["url"]).stem for app in apps))
    run(command)


if __name__ == "__main__":
    main()
