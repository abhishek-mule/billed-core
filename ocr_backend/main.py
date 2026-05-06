"""
Invoice OCR Backend using EasyOCR
Run: uvicorn main:app --reload --port 8000
"""

import os
import io
import re
import json
import base64
from typing import Optional, List
from datetime import datetime

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import numpy as np
from PIL import Image
import cv2

# Initialize EasyOCR reader (English + Hindi for Indian invoices)
# Using GPU=False since we're on CPU
print("Loading EasyOCR model... (first request will be slow)")
try:
    import easyocr
    reader = easyocr.Reader(['en'], gpu=False, verbose=False)
    print("EasyOCR loaded successfully!")
except Exception as e:
    print(f"Failed to load EasyOCR: {e}")
    reader = None

app = FastAPI(title="BillZo OCR API", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class OCRResponse(BaseModel):
    success: bool
    supplier: Optional[str] = None
    invoice_number: Optional[str] = None
    date: Optional[str] = None
    items: List[dict] = []
    subtotal: Optional[float] = None
    tax: Optional[float] = None
    total: Optional[float] = None
    raw_text: str
    confidence: float


def extract_amount(text: str) -> Optional[float]:
    """Extract numeric amount from text"""
    # Match patterns like ₹1,234.56 or 1234.56 or 1,234.56
    patterns = [
        r'₹\s*([\d,]+\.?\d*)',
        r'Rs\.?\s*([\d,]+\.?\d*)',
        r'INR\s*([\d,]+\.?\d*)',
        r'([\d,]+\.\d{2})',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            try:
                return float(match.group(1).replace(',', ''))
            except:
                pass
    return None


def extract_date(text: str) -> Optional[str]:
    """Extract date from text"""
    patterns = [
        r'(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})',
        r'(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{2,4})',
        r'(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(0)
    return None


def extract_invoice_number(text: str) -> Optional[str]:
    """Extract invoice/bill number"""
    patterns = [
        r'(?:invoice|bill|inv|tax|tax\s*invoice)[#:\s]*([A-Z0-9\-]+)',
        r'(?:tax\s*invoice|tax\s*bill)[#:\s]*([A-Z0-9\-]+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1).strip()
    # Fallback: look for common invoice patterns
    match = re.search(r'(INV|BILL|TAX)[\s#]*([A-Z0-9\-]+)', text, re.IGNORECASE)
    if match:
        return f"{match.group(1)}-{match.group(2)}"
    return None


def extract_supplier(text: str) -> Optional[str]:
    """Extract supplier name (usually at the top of invoice)"""
    lines = text.split('\n')
    # First few non-empty lines usually contain supplier info
    for i, line in enumerate(lines[:5]):
        line = line.strip()
        if len(line) > 3 and not line.startswith(('invoice', 'bill', 'date', 'tax', 'total', 'amount')):
            # Skip lines that look like addresses or phone numbers
            if not re.match(r'^[\d\-\+\s]+$', line) and len(line) < 50:
                return line.title()
    return None


def parse_invoice_items(text: str) -> List[dict]:
    """Parse line items from OCR text"""
    items = []
    lines = text.split('\n')
    
    # Look for lines with amounts (likely line items)
    for line in lines:
        # Match patterns like "Item name 100.00" or "Item name ₹100"
        match = re.search(r'(.+?)\s+(?:₹|Rs\.?)?\s*([\d,]+\.?\d*)\s*$', line.strip(), re.IGNORECASE)
        if match:
            name = match.group(1).strip()
            amount = extract_amount(match.group(2))
            if name and amount and amount > 0 and amount < 100000:  # Reasonable amounts
                # Try to extract quantity and rate
                qty_match = re.search(r'(\d+)\s*[xX×]\s*', name)
                if qty_match:
                    qty = int(qty_match.group(1))
                    rate = amount / qty
                    items.append({
                        "name": name.replace(qty_match.group(0), '').strip(),
                        "quantity": qty,
                        "rate": round(rate, 2),
                        "amount": amount
                    })
                else:
                    items.append({
                        "name": name,
                        "quantity": 1,
                        "rate": amount,
                        "amount": amount
                    })
    
    return items[:20]  # Limit to 20 items


def extract_totals(text: str) -> dict:
    """Extract subtotal, tax, and total"""
    result = {"subtotal": None, "tax": None, "total": None}
    
    lines = text.split('\n')
    for line in lines:
        line_lower = line.lower()
        
        # Total - usually the largest amount at the bottom
        if any(x in line_lower for x in ['total', 'grand total', 'amount due', 'payable', 'balance']):
            amount = extract_amount(line)
            if amount and not result["total"]:
                result["total"] = amount
        
        # Subtotal
        if 'subtotal' in line_lower or 'sub total' in line_lower:
            amount = extract_amount(line)
            if amount:
                result["subtotal"] = amount
        
        # Tax
        if any(x in line_lower for x in ['gst', 'tax', 'cgst', 'sgst', 'igst', 'vat']):
            amount = extract_amount(line)
            if amount:
                result["tax"] = amount
    
    # If no subtotal found, calculate from items
    if not result["subtotal"] and not result["total"]:
        # Use total as fallback
        pass
    
    return result


@app.get("/")
def root():
    return {"message": "BillZo OCR API", "status": "running"}


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "ocr_ready": reader is not None,
        "model": "EasyOCR"
    }


@app.post("/scan", response_model=OCRResponse)
async def scan_invoice(
    image: UploadFile = File(...),
    mode: str = Form("auto")
):
    """
    Scan invoice image and extract structured data
    """
    if reader is None:
        raise HTTPException(status_code=503, detail="OCR model not loaded")
    
    try:
        # Read image
        contents = await image.read()
        image_bytes = io.BytesIO(contents)
        
        # Convert to numpy array for EasyOCR
        image_pil = Image.open(image_bytes).convert('RGB')
        image_np = np.array(image_pil)
        
        # Run EasyOCR
        print("Running OCR...")
        results = reader.readtext(image_np)
        
        # Combine all text
        raw_text = "\n".join([text for _, text, confidence in results if confidence > 0.3])
        
        # Calculate average confidence
        confidences = [confidence for _, _, confidence in results]
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0
        
        # Extract structured data
        supplier = extract_supplier(raw_text)
        invoice_number = extract_invoice_number(raw_text)
        date = extract_date(raw_text)
        items = parse_invoice_items(raw_text)
        totals = extract_totals(raw_text)
        
        return OCRResponse(
            success=True,
            supplier=supplier,
            invoice_number=invoice_number,
            date=date,
            items=items,
            subtotal=totals.get("subtotal"),
            tax=totals.get("tax"),
            total=totals.get("total"),
            raw_text=raw_text[:2000],  # Limit raw text length
            confidence=round(avg_confidence * 100, 2)
        )
        
    except Exception as e:
        print(f"OCR Error: {e}")
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")


@app.post("/scan-base64")
async def scan_invoice_base64(data: dict):
    """
    Scan invoice from base64 encoded image
    """
    if reader is None:
        raise HTTPException(status_code=503, detail="OCR model not loaded")
    
    try:
        # Decode base64
        image_data = base64.b64decode(data.get("image", ""))
        image_bytes = io.BytesIO(image_data)
        
        # Convert to numpy array
        image_pil = Image.open(image_bytes).convert('RGB')
        image_np = np.array(image_pil)
        
        # Run OCR
        results = reader.readtext(image_np)
        
        raw_text = "\n".join([text for _, text, confidence in results if confidence > 0.3])
        
        confidences = [confidence for _, _, confidence in results]
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0
        
        supplier = extract_supplier(raw_text)
        invoice_number = extract_invoice_number(raw_text)
        date = extract_date(raw_text)
        items = parse_invoice_items(raw_text)
        totals = extract_totals(raw_text)
        
        return {
            "success": True,
            "supplier": supplier,
            "invoice_number": invoice_number,
            "date": date,
            "items": items,
            "subtotal": totals.get("subtotal"),
            "tax": totals.get("tax"),
            "total": totals.get("total"),
            "raw_text": raw_text[:2000],
            "confidence": round(avg_confidence * 100, 2)
        }
        
    except Exception as e:
        print(f"OCR Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)