import os
import re
import json
import hashlib
import hmac
import time
import uuid
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Optional
import threading

import redis
from fastapi import FastAPI, HTTPException, Header, Depends, BackgroundTasks, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(
    title="Billed-Core Provisioning API",
    description="Secure multi-tenant provisioning infrastructure",
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
SITES_DIR = Path(os.getenv("SITES_DIR", "/home/frappe/frappe-bench/sites"))
BENCH_PATH = os.getenv("BENCH_PATH", "/home/frappe/frappe-bench/env/bin/bench")
PROVISIONING_API_KEY = os.getenv("PROVISIONING_API_KEY", "change-me-in-production")
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "")

REDIS_HOST = os.getenv("REDIS_HOST", "redis-queue")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0, decode_responses=True)

LOG_DIR = Path("/var/log/billed")
LOG_DIR.mkdir(exist_ok=True, parents=True)


def get_logger():
    return logging.getLogger("provisioning")


def setup_logging():
    import logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        handlers=[
            logging.FileHandler(LOG_DIR / "provisioning.log"),
            logging.StreamHandler()
        ]
    )
    return logging.getLogger("provisioning")


logger = setup_logging()


class ProvisionRequest(BaseModel):
    tenant_id: str = Field(..., min_length=3, max_length=63)
    domain: str
    plan: str = "starter"
    admin_email: str
    admin_password: Optional[str] = None
    gstin: Optional[str] = None
    idempotency_key: Optional[str] = None

    @validator("tenant_id")
    def validate_tenant_id(cls, v):
        if not re.match(r"^[a-zA-Z0-9][a-zA-Z0-9-]{2,62}[a-zA-Z0-9]$", v):
            raise ValueError("Invalid tenant_id format")
        return v.lower()


class ProvisionResponse(BaseModel):
    tenant_id: str
    domain: str
    status: str
    estimated_time: Optional[str] = "8s"
    logs: Optional[str] = None
    already_existed: bool = False


class TenantStatusResponse(BaseModel):
    tenant_id: str
    domain: str
    status: str
    created_at: Optional[str]
    plan: str


class HealthResponse(BaseModel):
    status: str
    timestamp: str
    version: str
    redis_connected: bool


class AuditLog(BaseModel):
    tenant_id: str
    event: str
    status: str
    payload: Optional[dict] = None
    error: Optional[str] = None
    source: str = "api"


class WebhookStatsResponse(BaseModel):
    total: int
    pending: int
    processing: int
    completed: int
    failed: int


def verify_hmac_signature(payload: bytes, signature: str, secret: str) -> bool:
    """Verify Razorpay webhook HMAC signature"""
    if not signature or not secret:
        return False
    expected = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def acquire_lock(tenant_id: str, ttl: int = 300) -> bool:
    """Acquire Redis distributed lock for idempotency"""
    lock_key = f"provisioning_lock:{tenant_id}"
    result = redis_client.set(lock_key, "1", nx=True, ex=ttl)
    return result


def release_lock(tenant_id: str):
    """Release Redis lock"""
    lock_key = f"provisioning_lock:{tenant_id}"
    redis_client.delete(lock_key)


def check_site_exists(tenant_id: str) -> bool:
    """Check if site exists in filesystem"""
    return (SITES_DIR / tenant_id).exists()


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
    except FileNotFoundError:
        return -1, "", f"Bench not found at {BENCH_PATH}"


def log_audit(event: str, tenant_id: str, status: str, payload: dict = None, error: str = None):
    """Log provisioning event to audit file"""
    audit_entry = {
        "timestamp": datetime.utcnow().isoformat(),
        "tenant_id": tenant_id,
        "event": event,
        "status": status,
        "payload": payload,
        "error": error
    }
    audit_file = LOG_DIR / f"audit_{datetime.utcnow().strftime('%Y%m%d')}.jsonl"
    with open(audit_file, "a") as f:
        f.write(json.dumps(audit_entry) + "\n")
    logger.info(f"AUDIT: {event} - {tenant_id} - {status}")


def validate_tenant_id(tenant_id: str) -> bool:
    """Validate tenant_id format"""
    return bool(re.match(r"^[a-zA-Z0-9][a-zA-Z0-9-]{2,62}[a-zA-Z0-9]$", tenant_id))


def validate_domain(domain: str) -> bool:
    """Validate domain format"""
    return bool(re.match(r"^[a-zA-Z0-9][a-zA-Z0-9-\.]{4,254}$", domain))


def validate_gstin(gstin: str) -> bool:
    """Validate GSTIN format"""
    if not gstin:
        return True
    pattern = r"^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$"
    return bool(re.match(pattern, gstin.upper()))


async def check_tenant_health(tenant_id: str, max_attempts: int = 36, interval: int = 5) -> bool:
    """Poll health endpoint with exponential backoff"""
    import httpx
    url = f"http://backend:8000/api/method/ping?site={tenant_id}"
    
    for attempt in range(max_attempts):
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    return True
        except Exception:
            pass
        await asyncio.sleep(interval * (1 + attempt * 0.1))
    return False


def provision_tenant_async(tenant_id: str, domain: str, plan: str, gstin: str, admin_email: str, admin_password: str):
    """Async provisioning worker"""
    import asyncio
    log_audit("provisioning_started", tenant_id, "processing", {"domain": domain, "plan": plan})
    
    try:
        returncode, stdout, stderr = run_bench_command([
            "clone-site",
            TEMPLATE_SITE,
            tenant_id,
            "--mariadb-root-password", DB_PASSWORD,
            "--new-site-name", domain
        ], timeout=120)
        
        if returncode != 0:
            log_audit("provisioning_failed", tenant_id, "failed", error=stderr[-500:])
            return
        
        site_config = SITES_DIR / tenant_id / "site_config.json"
        if site_config.exists():
            config = json.loads(site_config.read_text())
            config["plan"] = plan
            config["gstin"] = gstin
            site_config.write_text(json.dumps(config, indent=2))
        
        if admin_password:
            run_bench_command([
                "--site", tenant_id,
                "set-admin-password", admin_password
            ])
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        is_healthy = loop.run_until_complete(check_tenant_health(tenant_id))
        
        if is_healthy:
            log_audit("provisioning_completed", tenant_id, "active", {"domain": domain})
        else:
            log_audit("provisioning_health_check_failed", tenant_id", "warning")
            
    except Exception as e:
        log_audit("provisioning_error", tenant_id, "failed", error=str(e))


async def verify_api_key(authorization: str = Header(None)):
    """Verify API key authentication"""
    if authorization != PROVISIONING_API_KEY:
        raise HTTPException(401, "Invalid API key")
    return True


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    redis_ok = False
    try:
        redis_client.ping()
        redis_ok = True
    except Exception:
        pass
    
    return HealthResponse(
        status="healthy" if redis_ok else "degraded",
        timestamp=datetime.utcnow().isoformat(),
        version="1.0.0",
        redis_connected=redis_ok
    )


@app.post("/api/v1/provision", response_model=ProvisionResponse)
async def provision_tenant(
    req: ProvisionRequest,
    background_tasks: BackgroundTasks,
    _verified: bool = Depends(verify_api_key)
):
    """Provision a new tenant site - Idempotent with Redis locking"""
    
    log_audit("provision_request", req.tenant_id, "received", 
              payload=req.dict(exclude={"admin_password"}))
    
    if not validate_tenant_id(req.tenant_id):
        raise HTTPException(400, "Invalid tenant_id format")
    
    if not validate_domain(req.domain):
        raise HTTPException(400, "Invalid domain format")
    
    if req.gstin and not validate_gstin(req.gstin):
        raise HTTPException(400, "Invalid GSTIN format")
    
    if not acquire_lock(req.tenant_id, ttl=300):
        existing = check_site_exists(req.tenant_id)
        if existing:
            log_audit("provision_skipped_already_exists", req.tenant_id, "completed")
            return ProvisionResponse(
                tenant_id=req.tenant_id,
                domain=req.domain,
                status="already_provisioned",
                already_existed=True
            )
        raise HTTPException(409, "Provisioning in progress, retry later")
    
    try:
        if check_site_exists(req.tenant_id):
            log_audit("provision_skipped_already_exists", req.tenant_id, "completed")
            return ProvisionResponse(
                tenant_id=req.tenant_id,
                domain=req.domain,
                status="already_provisioned",
                already_existed=True
            )
        
        background_tasks.add_task(
            provision_tenant_async,
            req.tenant_id,
            req.domain,
            req.plan,
            req.gstin or "",
            req.admin_email,
            req.admin_password or ADMIN_PASSWORD
        )
        
        return ProvisionResponse(
            tenant_id=req.tenant_id,
            domain=req.domain,
            status="provisioning",
            estimated_time="2-3 minutes"
        )
        
    finally:
        release_lock(req.tenant_id)


@app.get("/api/v1/tenant/{tenant_id}", response_model=TenantStatusResponse)
async def get_tenant_status(tenant_id: str, _verified: bool = Depends(verify_api_key)):
    """Get tenant status with health check"""
    
    if not check_site_exists(tenant_id):
        raise HTTPException(404, f"Tenant '{tenant_id}' not found")
    
    returncode, stdout, stderr = run_bench_command([
        "--site", tenant_id, "list-apps"
    ])
    
    status = "active" if returncode == 0 else "error"
    site_path = SITES_DIR / tenant_id
    
    created_at = datetime.fromtimestamp(site_path.stat().st_ctime).isoformat() if site_path.exists() else None
    
    return TenantStatusResponse(
        tenant_id=tenant_id,
        domain=f"{tenant_id}.billed.app",
        status=status,
        created_at=created_at,
        plan="starter"
    )


@app.delete("/api/v1/tenant/{tenant_id}")
async def deprovision_tenant(tenant_id: str, _verified: bool = Depends(verify_api_key)):
    """Deprovision a tenant (soft delete to archive)"""
    
    if not check_site_exists(tenant_id):
        raise HTTPException(404, f"Tenant '{tenant_id}' not found")
    
    log_audit("deprovision_request", tenant_id, "processing")
    
    returncode, stdout, stderr = run_bench_command([
        "drop-site", tenant_id,
        "--mariadb-root-password", DB_PASSWORD,
        "--force", "--no-backup"
    ], timeout=60)
    
    if returncode != 0:
        log_audit("deprovision_failed", tenant_id, "failed", error=stderr[-200:])
        raise HTTPException(500, f"Failed to drop site: {stderr[-200:]}")
    
    log_audit("deprovision_completed", tenant_id, "completed")
    
    return {"status": "deprovisioned", "tenant_id": tenant_id}


@app.get("/api/v1/tenants")
async def list_tenants(_verified: bool = Depends(verify_api_key)):
    """List all tenants"""
    
    if not SITES_DIR.exists():
        return {"tenants": [], "count": 0}
    
    tenants = [item.name for item in SITES_DIR.iterdir() 
               if item.is_dir() and not item.name.startswith(".")]
    
    return {"tenants": tenants, "count": len(tenants)}


@app.post("/api/v1/webhook/razorpay")
async def razorpay_webhook(
    request: Request,
    x_razorpay_signature: str = Header(None)
):
    """Razorpay webhook with HMAC verification and audit logging"""
    
    body = await request.body()
    
    if WEBHOOK_SECRET and x_razorpay_signature:
        if not verify_hmac_signature(body, x_razorpay_signature, WEBHOOK_SECRET):
            log_audit("webhook_rejected", "razorpay", "failed", 
                     error="Invalid signature", payload={"source": "razorpay"})
            raise HTTPException(401, "Invalid signature")
    
    payload = json.loads(body)
    event = payload.get("event")
    
    log_audit("webhook_received", f"razorpay:{event}", "received", 
              payload=payload)
    
    if event == "payment.captured":
        payload_data = payload.get("payload", {}).get("payment", {}).get("notes", {})
        tenant_id = payload_data.get("tenant_id") or payload_data.get("tenant_slug")
        
        if tenant_id:
            background_tasks = BackgroundTasks()
            background_tasks.add_task(
                provision_tenant_async,
                tenant_id,
                f"{tenant_id}.billed.app",
                "starter",
                payload_data.get("gstin", ""),
                payload_data.get("email", ""),
                None
            )
            return JSONResponse({"status": "queued"}, background=background_tasks)
    
    return {"status": "ignored", "event": event}


@app.get("/api/v1/stats", response_model=WebhookStatsResponse)
async def get_provisioning_stats(_verified: bool = Depends(verify_api_key)):
    """Get provisioning statistics"""
    
    stats = {"total": 0, "pending": 0, "processing": 0, "completed": 0, "failed": 0}
    
    if not LOG_DIR.exists():
        return WebhookStatsResponse(**stats)
    
    today = datetime.utcnow().strftime("%Y%m%d")
    audit_file = LOG_DIR / f"audit_{today}.jsonl"
    
    if not audit_file.exists():
        return WebhookStatsResponse(**stats)
    
    with open(audit_file) as f:
        for line in f:
            try:
                entry = json.loads(line)
                status = entry.get("status", "")
                if status in stats:
                    stats[status] = stats.get(status, 0) + 1
                stats["total"] += 1
            except:
                pass
    
    return WebhookStatsResponse(**stats)


if __name__ == "__main__":
    import subprocess
    import asyncio
    uvicorn.run(app, host="0.0.0.0", port=8001)