#!/usr/bin/env python3
"""Provision a Frappe/ERPNext site inside the running Docker stack.

This script is intentionally idempotent:
- starts the current compose stack unless disabled
- creates the site only if it does not already exist
- installs missing apps that are already present in the image
- seeds a small electrical-trader starter catalog
- attempts GST tax template creation when a company and matching tax accounts exist
"""

from __future__ import annotations

import argparse
import os
import shlex
import subprocess
import sys
import textwrap
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / ".env"


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


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Provision a Frappe site in Docker.")
    parser.add_argument("--compose-file", action="append", default=[], help="Additional compose file.")
    parser.add_argument("--project-name", help="Optional docker compose project name.")
    parser.add_argument("--service", default="backend", help="Container service running bench commands.")
    parser.add_argument("--site-name", default=os.environ.get("SITE_NAME", "client.localhost"))
    parser.add_argument(
        "--admin-password",
        default=os.environ.get("ADMIN_PASSWORD", "admin"),
        help="Administrator password for a newly created site.",
    )
    parser.add_argument(
        "--db-root-password",
        default=os.environ.get("DB_PASSWORD", "123"),
        help="Database root password used during site creation.",
    )
    parser.add_argument("--db-root-username", default="root")
    parser.add_argument(
        "--apps",
        default=os.environ.get("INSTALL_APPS", "erpnext"),
        help="Comma separated app list to install if available in the image.",
    )
    parser.add_argument(
        "--skip-up",
        action="store_true",
        help="Do not run `docker compose up -d` before provisioning.",
    )
    parser.add_argument(
        "--allow-missing-apps",
        action="store_true",
        default=True,
        help="Warn instead of failing when requested apps are not available in the container image.",
    )
    parser.add_argument(
        "--strict-apps",
        action="store_true",
        help="Fail if any requested app is not available in the image.",
    )
    return parser


def compose_base(args: argparse.Namespace) -> list[str]:
    command = ["docker", "compose"]
    for compose_file in args.compose_file:
        command.extend(["-f", compose_file])
    if args.project_name:
        command.extend(["-p", args.project_name])
    return command


def run(command: list[str], *, check: bool = True, input_text: str | None = None) -> subprocess.CompletedProcess[str]:
    printable = " ".join(shlex.quote(part) for part in command)
    print(f"$ {printable}")
    completed = subprocess.run(
        command,
        input=input_text,
        text=True,
        capture_output=True,
        cwd=ROOT,
        check=False,
    )
    if completed.stdout.strip():
        print(completed.stdout.strip())
    if completed.stderr.strip():
        print(completed.stderr.strip(), file=sys.stderr)
    if check and completed.returncode != 0:
        raise SystemExit(completed.returncode)
    return completed


def compose_run(args: argparse.Namespace, extra: list[str], *, check: bool = True, input_text: str | None = None) -> subprocess.CompletedProcess[str]:
    return run(compose_base(args) + extra, check=check, input_text=input_text)


def parse_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def list_sites(args: argparse.Namespace) -> list[str]:
    completed = compose_run(
        args,
        ["exec", "-T", args.service, "bench", "list-sites"],
        check=False,
    )
    if completed.returncode != 0:
        return []
    return [line.strip() for line in completed.stdout.splitlines() if line.strip()]


def list_available_apps(args: argparse.Namespace) -> list[str]:
    completed = compose_run(
        args,
        ["exec", "-T", args.service, "bash", "-lc", "cd /home/frappe/frappe-bench && ls -1 apps"],
    )
    return [line.strip() for line in completed.stdout.splitlines() if line.strip()]


def list_installed_apps(args: argparse.Namespace, site_name: str) -> list[str]:
    completed = compose_run(
        args,
        ["exec", "-T", args.service, "bench", "--site", site_name, "list-apps"],
    )
    return [line.strip() for line in completed.stdout.splitlines() if line.strip()]


def ensure_stack_running(args: argparse.Namespace) -> None:
    if args.skip_up:
        return
    compose_run(args, ["up", "-d"])


def ensure_site(args: argparse.Namespace) -> None:
    sites = list_sites(args)
    if args.site_name in sites:
        print(f"Site already exists: {args.site_name}")
        return
    compose_run(
        args,
        [
            "exec",
            "-T",
            args.service,
            "bench",
            "new-site",
            args.site_name,
            "--mariadb-user-host-login-scope=%",
            f"--admin-password={args.admin_password}",
            f"--db-root-username={args.db_root_username}",
            f"--db-root-password={args.db_root_password}",
        ],
    )


def ensure_apps(args: argparse.Namespace, requested_apps: list[str]) -> None:
    available_apps = set(list_available_apps(args))
    installed_apps = set(list_installed_apps(args, args.site_name))
    missing_from_image = [app for app in requested_apps if app not in available_apps]
    if missing_from_image and args.strict_apps:
        print(
            "Missing apps in container image: "
            + ", ".join(missing_from_image)
            + ". Build/use a custom image that already contains these apps, then rerun provisioning.",
            file=sys.stderr,
        )
        raise SystemExit(1)
    if missing_from_image:
        print("Skipping unavailable apps: " + ", ".join(missing_from_image))
    for app in requested_apps:
        if app in installed_apps or app in missing_from_image:
            continue
        compose_run(
            args,
            ["exec", "-T", args.service, "bench", "--site", args.site_name, "install-app", app],
        )


def seed_data(args: argparse.Namespace) -> None:
    bootstrap = textwrap.dedent(
        f"""
        import json
        import sys

        import frappe

        SITE_NAME = {args.site_name!r}

        def log(message):
            print(message)

        def ensure_doc(doctype, name, values):
            if frappe.db.exists(doctype, name):
                return frappe.get_doc(doctype, name), False
            doc = frappe.get_doc({{"doctype": doctype, "name": name, **values}})
            doc.insert(ignore_permissions=True)
            return doc, True

        def ensure_item_group(name, parent_item_group):
            values = {{
                "item_group_name": name,
                "parent_item_group": parent_item_group,
                "is_group": 0,
            }}
            doc, created = ensure_doc("Item Group", name, values)
            if created:
                log(f"Created Item Group: {{name}}")
            else:
                log(f"Item Group already present: {{name}}")
            return doc

        def find_account(company, keywords):
            for account_name in frappe.get_all(
                "Account",
                filters={{"company": company, "is_group": 0, "disabled": 0}},
                pluck="name",
                order_by="name asc",
            ):
                lowered = account_name.lower()
                if any(keyword in lowered for keyword in keywords):
                    return account_name
            return None

        def ensure_tax_template(doctype, template_name, company, account_head, rate):
            if frappe.db.exists(doctype, template_name):
                log(f"Tax template already present: {{template_name}}")
                return
            doc = frappe.get_doc(
                {{
                    "doctype": doctype,
                    "title": template_name,
                    "company": company,
                    "taxes": [
                        {{
                            "charge_type": "On Net Total",
                            "account_head": account_head,
                            "description": template_name,
                            "rate": rate,
                        }}
                    ],
                }}
            )
            doc.insert(ignore_permissions=True)
            log(f"Created tax template: {{template_name}}")

        frappe.init(site=SITE_NAME)
        frappe.connect()
        try:
            ensure_item_group("Electrical Goods", "All Item Groups")
            ensure_item_group("Cables", "Electrical Goods")
            ensure_item_group("Switches", "Electrical Goods")

            companies = frappe.get_all("Company", pluck="name")
            if not companies:
                log("No Company found yet, skipped GST template creation. Rerun after ERPNext company setup.")
            else:
                template_rates = [5, 12, 18, 28]
                sales_keywords = [
                    "output tax",
                    "output gst",
                    "igst output",
                    "cgst output",
                    "sgst output",
                    "gst payable",
                    "sales tax",
                ]
                purchase_keywords = [
                    "input tax",
                    "input gst",
                    "igst input",
                    "cgst input",
                    "sgst input",
                    "gst receivable",
                    "purchase tax",
                ]
                for company in companies:
                    abbreviation = frappe.db.get_value("Company", company, "abbr") or company
                    sales_account = find_account(company, sales_keywords)
                    purchase_account = find_account(company, purchase_keywords)
                    if not sales_account or not purchase_account:
                        log(
                            "Skipped GST templates for "
                            + company
                            + " because matching GST ledger accounts were not found."
                        )
                        continue
                    for rate in template_rates:
                        ensure_tax_template(
                            "Sales Taxes and Charges Template",
                            f"GST {{rate}}% Sales - {{abbreviation}}",
                            company,
                            sales_account,
                            rate,
                        )
                        ensure_tax_template(
                            "Purchase Taxes and Charges Template",
                            f"GST {{rate}}% Purchase - {{abbreviation}}",
                            company,
                            purchase_account,
                            rate,
                        )
            frappe.db.commit()
        finally:
            frappe.destroy()
        """
    ).strip()
    compose_run(
        args,
        [
            "exec",
            "-T",
            args.service,
            "bash",
            "-lc",
            "cd /home/frappe/frappe-bench && python -",
        ],
        input_text=bootstrap,
    )


def set_default_site(args: argparse.Namespace) -> None:
    compose_run(
        args,
        ["exec", "-T", args.service, "bench", "use", args.site_name],
    )


def main() -> None:
    load_dotenv(ENV_FILE)
    parser = build_parser()
    args = parser.parse_args()
    requested_apps = parse_csv(args.apps)

    ensure_stack_running(args)
    ensure_site(args)
    if requested_apps:
        ensure_apps(args, requested_apps)
    set_default_site(args)
    seed_data(args)
    print(f"Provisioning finished for {args.site_name}")


if __name__ == "__main__":
    main()
