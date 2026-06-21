from frappe.model.document import Document


class ProvisioningLog(Document):
    def validate(self):
        """Validate provisioning request"""
        if self.status == "failed" and not self.error_message:
            frappe.throw("Error message required when status is failed")
    
    def retry_provisioning(self):
        """Retry failed provisioning"""
        if self.status != "failed":
            frappe.throw("Can only retry failed provisions")
        
        self.retry_count = (self.retry_count or 0) + 1
        self.status = "processing"
        self.save()
        
        # Trigger background job
        frappe.enqueue(
            "billed_core.provisioning.retry_tenant_provisioning",
            tenant_id=self.tenant_id,
            log_name=self.name
        )


@frappe.whitelist()
def retry_tenant_provisioning(tenant_id: str, log_name: str):
    """Background job for retrying provisioning"""
    log = frappe.get_doc("Provisioning Log", log_name)
    
    try:
        # Import provisioning service
        from billed_core.services.provisioning import provision_tenant
        
        provision_tenant(
            tenant_id=tenant_id,
            domain=log.domain,
            plan=log.plan,
            gstin=log.gstin
        )
        
        log.status = "active"
        log.error_message = None
        
    except Exception as e:
        log.status = "failed"
        log.error_message = str(e)
        log.retry_count = (log.retry_count or 0) + 1
    
    log.processed_at = frappe.utils.now()
    log.save()


@frappe.whitelist()
def get_provisioning_stats():
    """Get provisioning statistics"""
    total = frappe.db.count("Provisioning Log")
    active = frappe.db.count("Provisioning Log", {"status": "active"})
    failed = frappe.db.count("Provisioning Log", {"status": "failed"})
    pending = frappe.db.count("Provisioning Log", {"status": "pending"})
    
    return {
        "total": total or 0,
        "active": active or 0,
        "failed": failed or 0,
        "pending": pending or 0,
        "success_rate": round((active / total * 100), 1) if total else 0
    }