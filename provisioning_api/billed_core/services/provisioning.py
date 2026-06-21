import frappe
import requests
from frappe import _
from frappe.utils import get_url

def provision_tenant(tenant_id: str, domain: str, plan: str, gstin: str):
    """Provision a tenant via the provisioning API"""

    # Get provisioning API details from site config
    api_url = frappe.conf.get("provisioning_api_url")
    api_key = frappe.conf.get("provisioning_api_key")

    if not api_url or not api_key:
        frappe.throw(_("Provisioning API not configured"))

    try:
        response = requests.post(
            f"{api_url}/api/v1/provision",
            json={
                "tenant_id": tenant_id,
                "domain": domain,
                "plan": plan,
                "gstin": gstin,
                "admin_email": frappe.session.user,  # Use current user as admin
                "admin_password": None  # Will use default
            },
            headers={
                "Authorization": api_key,
                "Content-Type": "application/json"
            },
            timeout=30
        )

        if response.status_code == 200:
            result = response.json()
            if result.get("status") == "provisioning":
                return True
            elif result.get("status") == "already_provisioned":
                return True
        else:
            frappe.throw(_(f"Provisioning failed: {response.text}"))

    except requests.exceptions.RequestException as e:
        frappe.throw(_(f"Provisioning request failed: {str(e)}"))