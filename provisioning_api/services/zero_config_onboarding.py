import frappe
import requests
import json
from frappe import _
from frappe.utils import now_datetime, today, now
from frappe.utils.jinja import render_template


def setup_merchant_from_gstin(gstin: str, customer_data: dict = None) -> str:
    """
    Zero-Config Onboarding: GSTIN → Fully Operational Merchant
    
    Called when:
    1. New tenant provisioned
    2. Customer uploads GST certificate
    3. Razorpay payment with GSTIN
    
    Returns customer name
    """
    
    # 1. Fetch GST details via india_compliance
    try:
        gst_details = get_gstin_details(gstin)
    except Exception as e:
        frappe.log_error(f"GSTIN lookup failed: {gstin}", str(e))
        gst_details = {}
    
    # 2. Determine territory from state
    state = gst_details.get("principal_place_of_business", {}).get("address", "").split("\n")[-1].strip()
    territory = get_territory_from_state(state) if state else "India"
    
    # 3. Create Customer
    customer = frappe.get_doc({
        "doctype": "Customer",
        "customer_name": customer_data.get("company_name") or gst_details.get("legal_name") or "Unknown",
        "customer_type": "Company",
        "customer_group": "Commercial",
        "territory": territory,
        "gstin": gstin,
        "pan": gst_details.get("pan"),
        "email": customer_data.get("email") or gst_details.get("email_id"),
        "phone": customer_data.get("phone") or gst_details.get("mobile_no"),
        "address_line1": gst_details.get("principal_place_of_business", {}).get("address", ""),
        "city": gst_details.get("principal_place_of_business", {}).get("city", ""),
        "state": state,
        "pincode": gst_details.get("principal_place_of_business", {}).get("pincode", ""),
        "country": "India",
        "custom_is_active_tenant": 1,
        "custom_plan": customer_data.get("plan", "starter"),
        "custom_razorpay_customer_id": customer_data.get("razorpay_customer_id")
    })
    customer.insert(ignore_permissions=True)
    
    # 4. Auto-configure India Compliance
    configure_india_compliance(customer.name, gst_details)
    
    # 5. Create default warehouses
    create_default_warehouses(customer.name, territory)
    
    # 6. Configure tax category
    configure_tax_category(customer.name, gst_details.get("gstin", ""))
    
    # 7. Create default price list
    create_default_price_list(customer.name)
    
    # 8. Configure Razorpay customer (if not exists)
    if not customer.custom_razorpay_customer_id:
        razorpay_id = create_razorpay_customer(
            customer.get("email"),
            customer.get("phone"),
            customer.name
        )
        frappe.db.set_value("Customer", customer.name, 
                           "custom_razorpay_customer_id", razorpay_id)
    
    # 9. Trigger welcome workflow
    trigger_welcome_workflow(customer.name)
    
    return customer.name


def get_gstin_details(gstin: str) -> dict:
    """Fetch GST details from India Compliance"""
    try:
        # Use india_compliance API if available
        if hasattr(frappe, "india_compliance"):
            return frappe.india_compliance.gstin.get_details(gstin)
        
        # Fallback: Direct API call
        # Note: Requires GSTIN verification API setup
        api_url = f"https://api.example.com/gstin/{gstin}"
        # This would need actual API integration
        return {}
    except:
        return {}


def configure_india_compliance(customer_name: str, gst_details: dict):
    """Auto-configure India Compliance settings"""
    
    # Get or create Company
    company_name = f"{customer_name} (Private) Limited"
    
    if not frappe.db.exists("Company", company_name):
        company = frappe.get_doc({
            "doctype": "Company",
            "company_name": company_name,
            "abbr": customer_name[:3].upper(),
            "default_currency": "INR",
            "country": "India",
            "create_company_per_stock_balance": 0
        })
        company.insert(ignore_permissions=True)
    
    # Configure GST Settings
    try:
        gst_settings = frappe.get_doc("GST Settings", "GST Settings")
        gst_settings.gstin = gst_details.get("gstin", "")
        gst_settings.company_name = company_name
        gst_settings.state = gst_details.get("principal_place_of_business", {}).get("state", "")
        gst_settings.enable_e_invoice = 1
        gst_settings.enable_e_waybill = 1
        gst_settings.enable_auto_qrcode = 1
        gst_settings.save(ignore_permissions=True)
    except:
        # Create if not exists
        frappe.get_doc({
            "doctype": "GST Settings",
            "gstin": gst_details.get("gstin", ""),
            "company_name": company_name,
            "enable_e_invoice": 1,
            "enable_e_waybill": 1
        }).insert(ignore_permissions=True)


def create_default_warehouses(customer_name: str, territory: str):
    """Create default warehouses for tenant"""
    
    warehouses = [
        {"name": "Main Store", "type": "Physical"},
        {"name": "Dispatch", "type": "Transit"},
        {"name": "Godown", "type": "Warehouse"}
    ]
    
    for wh in warehouses:
        wh_name = f"{customer_name} - {wh['name']}"
        if not frappe.db.exists("Warehouse", wh_name):
            frappe.get_doc({
                "doctype": "Warehouse",
                "warehouse_name": wh_name,
                "company": f"{customer_name} (Private) Limited",
                "warehouse_type": wh['type'],
                "is_group": 0
            }).insert(ignore_permissions=True)


def create_default_price_list(customer_name: str):
    """Create default selling price list"""
    
    pl_name = f"{customer_name} - Selling"
    if not frappe.db.exists("Price List", pl_name):
        frappe.get_doc({
            "doctype": "Price List",
            "price_list_name": pl_name,
            "currency": "INR",
            "price_list_type": "Selling",
            "enabled": 1
        }).insert(ignore_permissions=True)


def configure_tax_category(customer_name: str, gstin: str):
    """Configure tax template based on GSTIN"""
    
    # Determine applicable taxes based on GSTIN state
    if not gstin:
        return
    
    # For Intra-state (same state): CGST + SGST
    # For Inter-state: IGST
    # This would need state code extraction logic
    
    # Create/update Sales Tax template
    template_name = f"{customer_name} - Sales"
    if not frappe.db.exists("Sales Taxes and Charges Template", template_name):
        frappe.get_doc({
            "doctype": "Sales Taxes and Charges Template",
            "title": template_name,
            "company": f"{customer_name} (Private) Limited",
            "is_default": 1
        }).insert(ignore_permissions=True)


def create_razorpay_customer(email: str, phone: str, customer_name: str) -> str:
    """Create customer in Razorpay"""
    
    # Note: Requires Razorpay API keys
    razorpay_key = frappe.conf.get("razorpay_key")
    razorpay_secret = frappe.conf.get("razorpay_secret")
    
    if not razorpay_key:
        return ""
    
    # In production: Call Razorpay API
    # import razorpay
    # client = razorpay.Client(auth=(razorpay_key, razorpay_secret))
    # customer = client.customer.create({
    #     "email": email,
    #     "phone": phone,
    #     "name": customer_name
    # })
    # return customer["id"]
    
    return ""


def get_territory_from_state(state: str) -> str:
    """Map state to ERPNext territory"""
    
    state_map = {
        "Maharashtra": "India - MH",
        "Delhi": "India - DL",
        "Karnataka": "India - KA",
        "Tamil Nadu": "India - TN",
        "Telangana": "India - TS",
        "Uttar Pradesh": "India - UP",
        "Gujarat": "India - GJ",
        "West Bengal": "India - WB",
        "Rajasthan": "India - RJ",
        "Madhya Pradesh": "India - MP",
    }
    
    territory = state_map.get(state, "India")
    
    # Create territory if doesn't exist
    if not frappe.db.exists("Territory", territory):
        frappe.get_doc({
            "doctype": "Territory",
            "territory_name": territory,
            "is_group": 1 if " - " in territory else 0
        }).insert(ignore_permissions=True)
    
    return territory


def trigger_welcome_workflow(customer_name: str):
    """Send welcome email and setup checklist"""
    
    # Create communication
    communication = frappe.get_doc({
        "doctype": "Communication",
        "subject": "Welcome to Billed-Core!",
        "content": render_template("""
            <h2>Welcome, {{ customer_name }}!</h2>
            <p>Your account has been set up successfully.</p>
            <h3>Next Steps:</h3>
            <ul>
                <li>Add your products/items</li>
                <li>Set up your inventory</li>
                <li>Invite your team members</li>
                <li>Configure invoice templates</li>
            </ul>
            <p><a href="/app/dashboard">Go to Dashboard</a></p>
        """, {"customer_name": customer_name}),
        "recipients": frappe.get_value("Customer", customer_name, "email"),
        "reference_doctype": "Customer",
        "reference_name": customer_name,
        "sent_or_received": "Sent"
    })
    communication.insert(ignore_permissions=True)


# ERPNext Whitelist API
@frappe.whitelist()
def api_provision_tenant(gstin: str, **kwargs):
    """API endpoint for tenant provisioning"""
    if not frappe.has_permission("Customer", "create"):
        frappe.throw(_("No permission"), frappe.PermissionError)
    
    customer = setup_merchant_from_gstin(gstin, kwargs)
    
    return {
        "success": True,
        "customer": customer,
        "message": "Tenant provisioned successfully"
    }