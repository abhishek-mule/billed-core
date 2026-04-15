import frappe
from frappe import _

def setup_company(company_name, email=None, phone=None, plan="free", gstin=None, address=None, **kwargs):
    """
    Setup company and basic configurations for a new Billed customer.
    
    Args:
        company_name: Name of the company/shop
        email: Contact email
        phone: Contact phone
        plan: Subscription plan (free/starter/pro)
        gstin: GSTIN number (optional)
        address: Business address (optional)
    """
    try:
        # Create Company
        company = frappe.get_doc({
            "doctype": "Company",
            "company_name": company_name,
            "abbr": frappe.generate_hash("", 5).upper(),
            "default_currency": "INR",
            "country": "India",
            "enable_perpetual_inventory": 1,
            "default_finance_book": None,
        })
        company.insert(ignore_permissions=True)
        frappe.db.commit()
        
        # Set default company in system settings
        settings = frappe.get_doc("System Settings")
        if not settings.default_company:
            settings.default_company = company.name
            settings.save(ignore_permissions=True)
            frappe.db.commit()
        
        # Create default warehouses
        create_default_warehouses(company.name)
        
        # Create default expense book
        create_default_accounts(company.name, plan)
        
        # Set company in domain settings for India
        if frappe.db.exists("Domain Settings", {"name": "Domain Settings"}):
            domain_settings = frappe.get_doc("Domain Settings")
            domain_settings.append("active_domains", {
                "domain": "India"
            })
            domain_settings.save(ignore_permissions=True)
            frappe.db.commit()
        
        return {
            "success": True,
            "company": company.name,
            "message": f"Company {company_name} created successfully"
        }
        
    except Exception as e:
        frappe.log_error(f"Company Setup Error: {str(e)}", "Billed Company Setup")
        return {
            "success": False,
            "error": str(e)
        }


def create_default_warehouses(company):
    """Create default warehouses for the company."""
    warehouses = [
        {"name": "Default Warehouse", "warehouse_name": "Default Warehouse"},
        {"name": "Stores", "warehouse_name": "Stores"},
        {"name": "Finished Goods", "warehouse_name": "Finished Goods"},
    ]
    
    for wh in warehouses:
        if not frappe.db.exists("Warehouse", {"warehouse_name": wh["warehouse_name"], "company": company}):
            try:
                doc = frappe.get_doc({
                    "doctype": "Warehouse",
                    "warehouse_name": wh["warehouse_name"],
                    "company": company,
                    "is_group": 0
                })
                doc.insert(ignore_permissions=True)
            except Exception:
                pass
    
    frappe.db.commit()


def create_default_accounts(company, plan="free"):
    """Create default chart of accounts and configure based on plan."""
    
    # Account types to create
    account_types = [
        ("Sales", "Sales", "Income", "Income Account"),
        ("Sales Return", "Sales Return", "Income", "Income Account"),
        ("Purchase", "Purchase", "Expense", "Cost of Goods Sold"),
        ("Purchase Return", "Purchase Return", "Expense", "Cost of Goods Sold"),
        ("Cash", "Cash", "Asset", "Cash"),
        ("Bank", "Bank", "Asset", "Bank"),
        ("Accounts Receivable", "Debtors", "Asset", "Receivable"),
        ("Accounts Payable", "Creditors", "Liability", "Payable"),
    ]
    
    for idx, (name, account_name, root_type, account_type) in enumerate(account_types):
        if not frappe.db.exists("Account", {"account_name": account_name, "company": company}):
            try:
                doc = frappe.get_doc({
                    "doctype": "Account",
                    "account_name": account_name,
                    "company": company,
                    "root_type": root_type,
                    "account_type": account_type,
                    "is_group": 0,
                    "parent_account": f"{root_type} - {company[:3].upper()}"
                })
                doc.insert(ignore_permissions=True)
            except Exception:
                # Try to create parent account first
                if not frappe.db.exists("Account", {"account_name": root_type, "company": company}):
                    parent = frappe.get_doc({
                        "doctype": "Account",
                        "account_name": root_type,
                        "company": company,
                        "root_type": root_type,
                        "is_group": 1,
                        "parent_account": ""
                    })
                    try:
                        parent.insert(ignore_permissions=True)
                        doc.insert(ignore_permissions=True)
                    except Exception:
                        pass
    
    frappe.db.commit()
    
    # Update company with default accounts
    try:
        company_doc = frappe.get_doc("Company", company)
        company_doc.default_cash_account = frappe.db.get_value("Account", 
            {"account_name": "Cash", "company": company}, "name")
        company_doc.default_bank_account = frappe.db.get_value("Account", 
            {"account_name": "Bank", "company": company}, "name")
        company_doc.default_receivable_account = frappe.db.get_value("Account", 
            {"account_name": "Debtors", "company": company}, "name")
        company_doc.default_payable_account = frappe.db.get_value("Account", 
            {"account_name": "Creditors", "company": company}, "name")
        company_doc.default_inventory_account = frappe.db.get_value("Account", 
            {"account_name": "Stores", "company": company}, "name")
        company_doc.stock_received_but_not_billed = frappe.db.get_value("Account", 
            {"account_name": "Purchase", "company": company}, "name")
        company_doc.warehouse = frappe.db.get_value("Warehouse", 
            {"warehouse_name": "Default Warehouse", "company": company}, "name")
        company_doc.save(ignore_permissions=True)
        frappe.db.commit()
    except Exception as e:
        frappe.log_error(f"Error updating company defaults: {str(e)}", "Billed Company Setup")


def update_subscription_plan(company, plan):
    """Update subscription plan limits."""
    try:
        # Create or update subscription limits
        if frappe.db.exists("Subscription Plan", plan.capitalize()):
            return
        
        limits = {
            "free": {"documents": 50, "users": 1},
            "starter": {"documents": 500, "users": 3},
            "pro": {"documents": -1, "users": 10},  # -1 means unlimited
        }
        
        plan_limits = limits.get(plan, limits["free"])
        
        frappe.get_doc({
            "doctype": "Subscription Plan",
            "plan_name": plan.capitalize(),
            "plan_code": plan,
            "amount": 0 if plan == "free" else (499 if plan == "starter" else 999),
            "billing_interval": "Monthly",
            "max_users": plan_limits["users"],
            "currency": "INR"
        }).insert(ignore_permissions=True)
        
        frappe.db.commit()
    except Exception:
        pass


@frappe.whitelist()
def check_site_status(site_name):
    """Check if a site is properly configured and ready."""
    try:
        company = frappe.defaults.get_user_default("Company")
        
        if not company:
            return {"status": "incomplete", "message": "Company not configured"}
        
        # Check required documents
        required = ["Customer", "Supplier", "Item"]
        missing = []
        
        for doctype in required:
            if not frappe.db.exists(doctype, {"company": company}):
                missing.append(doctype)
        
        if missing:
            return {
                "status": "incomplete",
                "missing": missing,
                "company": company
            }
        
        return {
            "status": "ready",
            "company": company,
            "message": "Site is ready to use"
        }
        
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }
