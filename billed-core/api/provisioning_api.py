import os
import subprocess
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Billed-Core Provisioning API",
    description="Multi-tenant provisioning infrastructure",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PASSWORD = os.getenv("DB_PASSWORD", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin")
TEMPLATE_SITE = os.getenv("TEMPLATE_SITE", "template.site")
SITES_DIR = Path("/home/frappe/frappe-bench/sites")
BENCH_PATH = "/home/frappe/frappe-bench/env/bin/bench"


class ProvisionRequest(BaseModel):
    tenant_id: str
    domain: str
    plan: str = "starter"
    admin_email: str
    admin_password: Optional[str] = None
    gstin: Optional[str] = None


class ProvisionResponse(BaseModel):
    tenant_id: str
    domain: str
    status: str
    estimated_time: Optional[str] = "8s"
    logs: Optional[str] = None


class TenantStatusResponse(BaseModel):
    tenant_id: str
    domain: str
    status: str
    created_at: Optional[str]
    plan: str


def run_bench_command(args: list, timeout: int = 60) -> tuple:
    """Run a bench command and return (returncode, stdout, stderr)"""
    cmd = [BENCH_PATH] + args
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=str(SITES_DIR.parent)
        )
        return result.returncode, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        return -1, "", "Command timeout"


def validate_tenant_id(tenant_id: str) -> bool:
    """Validate tenant_id format (alphanumeric + hyphens)"""
    import re
    return bool(re.match(r"^[a-zA-Z0-9][a-zA-Z0-9-]{2,62}[a-zA-Z0-9]$", tenant_id))


def validate_domain(domain: str) -> bool:
    """Validate domain format"""
    import re
    return bool(re.match(r"^[a-zA-Z0-9][a-zA-Z0-9-\.]{4,254}$", domain))


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "1.0.0"
    }


@app.post("/api/v1/provision", response_model=ProvisionResponse)
async def provision_tenant(
    req: ProvisionRequest,
    background_tasks: BackgroundTasks
):
    """Provision a new tenant site"""
    
    # 1. Validate inputs
    if not validate_tenant_id(req.tenant_id):
        raise HTTPException(
            400, 
            "Invalid tenant_id. Use 3-63 chars, alphanumeric + hyphens only."
        )
    
    if not validate_domain(req.domain):
        raise HTTPException(400, "Invalid domain format.")
    
    # 2. Check if tenant already exists
    if (SITES_DIR / req.tenant_id).exists():
        raise HTTPException(
            400, 
            f"Tenant '{req.tenant_id}' already exists."
        )
    
    # 3. Create site via bench clone-site
    # Note: In production, use threading for async provisioning
    returncode, stdout, stderr = run_bench_command([
        "clone-site",
        TEMPLATE_SITE,
        req.tenant_id,
        "--mariadb-root-password", DB_PASSWORD,
        "--new-site-name", req.domain
    ], timeout=120)
    
    if returncode != 0:
        # Log failure
        return ProvisionResponse(
            tenant_id=req.tenant_id,
            domain=req.domain,
            status="failed",
            logs=stderr[-500:]
        )
    
    # 4. Update site config
    site_config = SITES_DIR / req.tenant_id / "site_config.json"
    if site_config.exists():
        import json
        config = json.loads(site_config.read_text())
        config["plan"] = req.plan
        config["gstin"] = req.gstin
        site_config.write_text(json.dumps(config, indent=2))
    
    # 5. Set admin password
    if req.admin_password:
        run_bench_command([
            "--site", req.tenant_id,
            "set-admin-password", req.admin_password
        ])
    
    # 6. Schedule post-provision tasks
    background_tasks.add_task(
        post_provision_setup,
        req.tenant_id,
        req.gstin,
        req.admin_email
    )
    
    return ProvisionResponse(
        tenant_id=req.tenant_id,
        domain=req.domain,
        status="provisioned",
        estimated_time=None
    )


async def post_provision_setup(tenant_id: str, gstin: Optional[str], admin_email: str):
    """Post-provisioning setup tasks"""
    # 1. Configure India Compliance
    # 2. Set up GSTIN if provided
    # 3. Configure default warehouse
    # 4. Send welcome email
    pass


@app.get("/api/v1/tenant/{tenant_id}", response_model=TenantStatusResponse)
async def get_tenant_status(tenant_id: str):
    """Get tenant status"""
    site_path = SITES_DIR / tenant_id
    
    if not site_path.exists():
        raise HTTPException(404, f"Tenant '{tenant_id}' not found.")
    
    # Check if site is active (can connect to DB)
    returncode, stdout, stderr = run_bench_command([
        "--site", tenant_id, "list-apps"
    ])
    
    status = "active" if returncode == 0 else "error"
    
    # Get created_at from site directory
    created_at = datetime.fromtimestamp(
        site_path.stat().st_ctime
    ).isoformat()
    
    return TenantStatusResponse(
        tenant_id=tenant_id,
        domain=f"{tenant_id}.billed.app",
        status=status,
        created_at=created_at,
        plan="starter"
    )


@app.delete("/api/v1/tenant/{tenant_id}")
async def deprovision_tenant(tenant_id: str):
    """Deprovision a tenant (soft delete to archive)"""
    site_path = SITES_DIR / tenant_id
    
    if not site_path.exists():
        raise HTTPException(404, f"Tenant '{tenant_id}' not found.")
    
    # In production: Move to archive, don't delete immediately
    # For now: Hard delete
    returncode, stdout, stderr = run_bench_command([
        "drop-site", tenant_id, 
        "--mariadb-root-password", DB_PASSWORD,
        "--force", "--no-backup"
    ], timeout=60)
    
    if returncode != 0:
        raise HTTPException(500, f"Failed to drop site: {stderr[-200:]}")
    
    return {"status": "deprovisioned", "tenant_id": tenant_id}


@app.get("/api/v1/tenants")
async def list_tenants():
    """List all tenants"""
    if not SITES_DIR.exists():
        return {"tenants": []}
    
    tenants = []
    for item in SITES_DIR.iterdir():
        if item.is_dir() and not item.name.startswith("."):
            tenants.append(item.name)
    
    return {"tenants": tenants, "count": len(tenants)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)