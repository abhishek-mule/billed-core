import frappe
import time
from collections import defaultdict


# In-memory metrics store (use Redis in production)
_metrics_store = defaultdict(list)
MAX_STORE_SIZE = 1000


def record_metric(name: str, value: float, labels: dict = None):
    """Record a metric value"""
    key = f"{name}:{json.dumps(labels) if labels else ''}"
    _metrics_store[key].append({
        "timestamp": time.time(),
        "value": value,
        "labels": labels or {}
    })
    
    # Keep only last N values
    if len(_metrics_store[key]) > MAX_STORE_SIZE:
        _metrics_store[key] = _metrics_store[key][-MAX_STORE_SIZE:]


@frappe.whitelist()
def get_metrics():
    """Get all current metrics"""
    return dict(_metrics_store)


# ========================================
# PROVISIONING METRICS
# ========================================

def record_provisioning_time(duration_ms: float, success: bool):
    """Record tenant provisioning time"""
    record_metric(
        "provisioning_duration_seconds",
        duration_ms / 1000,
        {"success": str(success).lower()}
    )


# ========================================
# OCR METRICS
# ========================================

def record_ocr_result(source: str, confidence: float, processing_time_ms: float):
    """Record OCR processing result"""
    record_metric(
        "ocr_confidence",
        confidence,
        {"source": source}
    )
    record_metric(
        "ocr_processing_time_ms",
        processing_time_ms,
        {"source": source}
    )


# ========================================
# API METRICS
# ========================================

def record_api_request(endpoint: str, method: str, status_code: int, duration_ms: float):
    """Record API request metrics"""
    record_metric(
        "http_request_duration_seconds",
        duration_ms / 1000,
        {"endpoint": endpoint, "method": method, "status": str(status_code)}
    )
    record_metric(
        "http_requests_total",
        1,
        {"endpoint": endpoint, "method": method, "status": str(status_code)}
    )


# ========================================
# DATABASE METRICS
# ========================================

def record_query_duration(query_name: str, duration_ms: float):
    """Record database query duration"""
    record_metric(
        "mariadb_query_duration_seconds",
        duration_ms / 1000,
        {"query": query_name}
    )


# ========================================
# WEBHOOK METRICS
# ========================================

def record_webhook_received(source: str, status: str):
    """Record webhook events"""
    record_metric(
        "webhook_received_total",
        1,
        {"source": source, "status": status}
    )


# ========================================
# JSON ENDPOINT (For Prometheus Scraping)
# ========================================

@frappe.whitelist()
def prometheus_metrics():
    """Expose metrics in Prometheus format"""
    import json
    
    lines = []
    
    for key, values in _metrics_store.items():
        metric_name = key.split(":")[0]
        
        # Calculate aggregates
        latest = values[-1]["value"] if values else 0
        avg = sum(v["value"] for v in values) / len(values) if values else 0
        
        # Prometheus format: metric_name{labels} value
        lines.append(f"# TYPE {metric_name} gauge")
        lines.append(f"# HELP {metric_name} Billed-Core metric")
        
        for v in values[-100:]:  # Last 100 samples
            label_str = ",".join(f'{k}="{v}"' for k, v in (v.get("labels") or {}).items())
            if label_str:
                lines.append(f"{metric_name}{{{label_str}}} {v['value']}")
            else:
                lines.append(f"{metric_name} {v['value']}")
    
    return "\n".join(lines)


# ========================================
# STATUS DASHBOARD DATA
# ========================================

@frappe.whitelist()
def get_status_dashboard():
    """Get dashboard data for UI"""
    
    # Get active tenants count
    active_tenants = frappe.db.count("Customer", {"custom_is_active_tenant": 1})
    
    # Get recent provisioning
    recent = frappe.get_all(
        "Provisioning Log",
        fields=["tenant_id", "status", "created_at"],
        order_by="created_at desc",
        limit=10
    )
    
    # Calculate success rate
    total = frappe.db.count("Provisioning Log")
    success = frappe.db.count("Provisioning Log", {"status": "active"})
    success_rate = (success / total * 100) if total else 0
    
    return {
        "active_tenants": active_tenants or 0,
        "recent_provisioning": recent,
        "provisioning_success_rate": round(success_rate, 1),
        "total_transactions": total,
        "ocr_confidence": 0.85,  # Placeholder
        "avg_provisioning_time_ms": 8500,  # Placeholder
    }


# ========================================
# HEALTH CHECK
# ========================================

@frappe.whitelist()
def health_check():
    """System health check"""
    
    checks = {
        "database": False,
        "redis_cache": False,
        "redis_queue": False,
    }
    
    # Check DB
    try:
        frappe.db.sql("SELECT 1")
        checks["database"] = True
    except:
        pass
    
    # Check Redis
    try:
        import redis
        r = redis.from_url(frappe.conf.get("redis_cache"))
        r.ping()
        checks["redis_cache"] = True
    except:
        pass
    
    return {
        "healthy": all(checks.values()),
        "checks": checks,
        "timestamp": frappe.utils.now(),
    }