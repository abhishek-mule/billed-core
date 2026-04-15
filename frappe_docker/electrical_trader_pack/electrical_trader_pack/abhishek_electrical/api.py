import frappe
import requests
import json

@frappe.whitelist()
def process_item_label(file_url, item_code=None):
    # 1. Fetch File
    try:
        file_doc = frappe.get_doc("File", {"file_url": file_url})
        file_content = file_doc.get_content()
    except Exception as e:
        frappe.throw(f"Failed to fetch image: {e}")
    
    # 2. Sarvam AI API Call (Placeholder Key)
    # Target: https://api.sarvam.ai/v1/specter/ocr
    api_key = frappe.conf.get("sarvam_api_key") or "YOUR_SARVAM_KEY"
    
    # Mock Response Logic for now
    extracted_data = ["BAJAJ", "230V", "50Hz", "1-Phase", "IP44"]
    
    # 3. Smart Match Logic
    brand = match_brand(extracted_data)
    tech = match_tech_attributes(extracted_data)
    
    if item_code and (brand or tech):
        item_doc = frappe.get_doc("Item", item_code)
        if brand: item_doc.brand_link = brand
        if tech: item_doc.tech_attr_link = tech
        item_doc.save()

    return {
        "brand": brand,
        "tech_attr": tech,
        "extracted_tags": extracted_data
    }

def match_brand(tags):
    known_brands = frappe.get_all("Brand Mapping", fields=["name", "brand_name"])
    for tag in tags:
        for b in known_brands:
            if tag.upper() in (b.brand_name or "").upper():
                return b.name
    return None

def match_tech_attributes(tags):
    known_tech = frappe.get_all("Technical Attributes", fields=["name", "attribute_name"])
    for tag in tags:
        for t in known_tech:
            if tag.upper() == (t.attribute_name or "").upper():
                return t.name
    return None
