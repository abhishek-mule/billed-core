# Invoice creation API for Billed

import frappe
from frappe import _
from datetime import datetime, timedelta

@frappe.whitelist()
def create_invoice(
    customer_name,
    company,
    items,
    customer_phone=None,
    posting_date=None,
    due_date=None,
    custom_invoice_number=None,
    remarks=None,
    is_pos=0,
    **kwargs
):
    try:
        customer_id = _get_or_create_customer(customer_name, customer_phone)
        
        processed_items = []
        for item in items:
            item_doc = frappe.get_doc('Item', item['item_code'])
            gst_rate = _get_item_gst_rate(item['item_code'])
            tax_amount = (item['amount'] * gst_rate) / 100
            
            processed_items.append({
                'item_code': item['item_code'],
                'item_name': item.get('item_name', item_doc.item_name),
                'qty': item['qty'],
                'rate': item['rate'],
                'amount': item['amount'],
                'tax_rate': gst_rate,
                'tax_amount': tax_amount,
                'income_account': item_doc.income_account or _get_default_income_account(company),
            })
        
        invoice_doc = frappe.get_doc({
            'doctype': 'Sales Invoice',
            'customer': customer_id,
            'company': company,
            'posting_date': posting_date or datetime.now().strftime('%Y-%m-%d'),
            'due_date': due_date or (datetime.now() + timedelta(days=15)).strftime('%Y-%m-%d'),
            'items': processed_items,
            'remarks': remarks or '',
            'is_pos': is_pos,
            'custom_invoice_number': custom_invoice_number,
        })
        
        invoice_doc.insert(ignore_permissions=True)
        invoice_doc.submit()
        frappe.db.commit()
        
        return {
            'success': True,
            'name': invoice_doc.name,
            'invoice_number': invoice_doc.name,
            'customer': customer_id,
            'total': invoice_doc.grand_total,
            'message': f'Invoice {invoice_doc.name} created successfully'
        }
        
    except Exception as e:
        frappe.log_error(f'Invoice Creation Error: {str(e)}', 'Billed Invoice API')
        return {
            'success': False,
            'error': str(e)
        }


def _get_or_create_customer(customer_name, phone=None):
    if phone:
        customer = frappe.db.get_value(
            'Customer',
            filters={'phone': phone},
            fieldname='name'
        )
        if customer:
            return customer
    
    customer = frappe.db.get_value(
        'Customer',
        filters={'customer_name': customer_name},
        fieldname='name'
    )
    if customer:
        return customer
    
    customer_doc = frappe.get_doc({
        'doctype': 'Customer',
        'customer_type': 'Individual',
        'customer_name': customer_name,
        'phone': phone or '',
        'territory': 'India',
    })
    
    customer_doc.insert(ignore_permissions=True)
    frappe.db.commit()
    
    return customer_doc.name


def _get_item_gst_rate(item_code):
    try:
        item_doc = frappe.get_doc('Item', item_code)
        
        gst_rates = {
            'Electronics': 18,
            'Electrical Equipment': 18,
            'Mobile & Accessories': 18,
            'Grocery': 0,
            'Pharmacy': 0,
            'Clothing': 5,
            'Hardware': 18,
            'Auto Parts': 18,
            'Services': 18,
        }
        
        if item_doc.item_tax_template:
            tax_template = frappe.get_doc('Item Tax Template', item_doc.item_tax_template)
            for tax_detail in tax_template.taxes:
                if tax_detail.tax_type == 'GST':
                    return float(tax_detail.tax_rate)
        
        if item_doc.item_group in gst_rates:
            return gst_rates[item_doc.item_group]
        
        return 18
        
    except Exception:
        return 18


def _get_default_income_account(company):
    account = frappe.db.get_value(
        'Account',
        filters={
            'company': company,
            'account_type': 'Income Account',
            'is_group': 0
        },
        fieldname='name'
    )
    return account or f'Sales - {company[:3].upper()}'


@frappe.whitelist()
def get_today_invoices(company):
    today = datetime.now().strftime('%Y-%m-%d')
    
    invoices = frappe.get_list(
        'Sales Invoice',
        filters={
            'company': company,
            'posting_date': today,
            'docstatus': ['!=', 2]
        },
        fields=['name', 'customer', 'customer_name', 'total', 'creation'],
        order_by='creation desc'
    )
    
    return invoices


@frappe.whitelist()
def get_invoice_totals(company):
    today = datetime.now().strftime('%Y-%m-%d')
    
    result = frappe.db.get_value(
        'Sales Invoice',
        filters={
            'company': company,
            'posting_date': today,
            'docstatus': 1
        },
        fieldname=['count(name) as count', 'sum(grand_total) as total'],
        as_dict=True
    )
    
    return {
        'invoice_count': result.get('count', 0) or 0,
        'total_sales': result.get('total', 0) or 0,
    }