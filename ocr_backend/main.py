"""
Invoice OCR Backend using Gemini 2.0 Flash + Tesseract Fallback
Run: uvicorn main:app --reload --port 8000

Set GEMINI_API_KEY in environment or .env file
Get free key at: https://aistudio.google.com/app
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
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import Google Generative AI
try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    print("Warning: google-generativeai not installed")

# Import Tesseract for offline fallback
try:
    import pytesseract
    from PIL import Image
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False
    print("Warning: pytesseract not installed")

# Configure Gemini
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
if GEMINI_API_KEY and GEMINI_AVAILABLE:
    genai.configure(api_key=GEMINI_API_KEY)
    print("Gemini AI configured successfully!")
else:
    print("Warning: GEMINI_API_KEY not set")

app = FastAPI(title="BillZo OCR API", version="2.0.0")

allowed_origins_env = os.getenv("OCR_ALLOWED_ORIGINS", "")
allowed_origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()]
if not allowed_origins:
    allowed_origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
allow_credentials = os.getenv("OCR_CORS_ALLOW_CREDENTIALS", "false").lower() == "true"
if "*" in allowed_origins:
    allow_credentials = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=allow_credentials,
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
    confidence: float
    offline_fallback: bool = False
    raw_text: Optional[str] = None


def extract_amount(text: str) -> Optional[float]:
    """Extract numeric amount from text"""
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
            except Exception:
                pass
    return None


def extract_date(text: str) -> Optional[str]:
    """Extract date from text"""
    patterns = [
        r'(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})',
        r'(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{2,4})',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(0)
    return None


def extract_invoice_number(text: str) -> Optional[str]:
    """Extract invoice/bill number"""
    patterns = [
        r'(?:invoice|bill|inv)[#:\s]*([A-Z0-9\-]+)',
        r'(INV|BILL|TAX)[\s#]*([A-Z0-9\-]+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return f"{match.group(1)}-{match.group(2)}"
    return None


def extract_supplier(text: str) -> Optional[str]:
    """Extract supplier name"""
    lines = text.split('\n')
    for line in lines[:5]:
        line = line.strip()
        if len(line) > 3 and len(line) < 50:
            if not re.match(r'^[\d\-\+\s]+$', line):
                return line.title()
    return None


def parse_invoice_items(text: str) -> List[dict]:
    """Parse line items from text"""
    items = []
    lines = text.split('\n')
    
    for line in lines:
        match = re.search(r'(.+?)\s+(?:₹|Rs\.?)?\s*([\d,]+\.?\d*)\s*$', line.strip(), re.IGNORECASE)
        if match:
            name = match.group(1).strip()
            amount = extract_amount(match.group(2))
            if name and amount and 0 < amount < 100000:
                items.append({
                    "name": name,
                    "quantity": 1,
                    "rate": amount,
                    "amount": amount
                })
    
    return items[:20]


def extract_totals(text: str) -> dict:
    """Extract subtotal, tax, total"""
    result = {"subtotal": None, "tax": None, "total": None}
    lines = text.split('\n')
    
    for line in lines:
        line_lower = line.lower()
        if any(x in line_lower for x in ['total', 'grand total', 'amount due', 'payable']):
            amount = extract_amount(line)
            if amount and not result["total"]:
                result["total"] = amount
        if 'subtotal' in line_lower:
            result["subtotal"] = extract_amount(line)
        if any(x in line_lower for x in ['gst', 'tax', 'cgst', 'sgst']):
            result["tax"] = extract_amount(line)
    
    return result


def extract_with_tesseract(image_bytes: bytes) -> dict:
    """Fallback: Use Tesseract OCR"""
    if not TESSERACT_AVAILABLE:
        raise HTTPException(status_code=503, detail="Tesseract not available")
    
    try:
        image = Image.open(io.BytesIO(image_bytes))
        raw_text = pytesseract.image_to_string(image)
        
        supplier = extract_supplier(raw_text)
        invoice_number = extract_invoice_number(raw_text)
        date = extract_date(raw_text)
        items = parse_invoice_items(raw_text)
        totals = extract_totals(raw_text)
        
        return {
            "supplier": supplier,
            "invoice_number": invoice_number,
            "date": date,
            "items": items,
            "subtotal": totals.get("subtotal"),
            "tax": totals.get("tax"),
            "total": totals.get("total"),
            "raw_text": raw_text[:2000],
            "confidence": 0.5,  # Lower confidence for Tesseract
            "offline_fallback": True
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Tesseract failed: {str(e)}")


def extract_with_gemini(image_bytes: bytes) -> dict:
    """Extract using Gemini 2.0 Flash"""
    if not GEMINI_AVAILABLE:
        raise HTTPException(status_code=503, detail="Google Generative AI not installed")
    
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY not configured")
    
    try:
        # Convert to base64
        image_base64 = base64.b64encode(image_bytes).decode('utf-8')
        
        # Use Gemini model
        model = genai.GenerativeModel('gemini-2.0-flash')
        
        # Create prompt
        prompt = """Extract invoice/bill details from this image. Return ONLY valid JSON (no markdown):
{
  "supplier": "Company name or null",
  "invoice_number": "Invoice/Bill number or null", 
  "date": "Date in DD/MM/YYYY or null",
  "items": [{"name": "Item name", "quantity": number, "rate": price, "amount": total}],
  "subtotal": number or null,
  "tax": number or null,
  "total": number or null,
  "confidence": number between 0 and 1
}
Set unknown fields to null. Be precise with amounts."""
        
        # Generate content
        response = model.generate_content([
            prompt,
            {"inline_data": {"data": image_base64, "mime_type": "image/jpeg"}}
        ])
        
        # Parse JSON response
        response_text = response.text
        
        # Clean up markdown JSON
        response_text = re.sub(r'```json|```', '', response_text).strip()
        
        # Parse JSON
        data = json.loads(response_text)
        
        # Ensure required fields exist
        data.setdefault("supplier")
        data.setdefault("invoice_number")
        data.setdefault("date")
        data.setdefault("items", [])
        data.setdefault("subtotal")
        data.setdefault("tax")
        data.setdefault("total")
        data.setdefault("confidence", 0.9)
        data["offline_fallback"] = False
        
        return data
        
    except Exception as e:
        print(f"Gemini Error: {e}")
        raise HTTPException(status_code=500, detail=f"Gemini extraction failed: {str(e)}")


@app.get("/")
def root():
    return {
        "message": "BillZo OCR API v2.0",
        "status": "running",
        "ocr_engine": "gemini-2.0-flash",
        "fallback": "tesseract" if TESSERACT_AVAILABLE else "none"
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "gemini_configured": bool(GEMINI_API_KEY),
        "tesseract_available": TESSERACT_AVAILABLE,
        "engine": "gemini-2.0-flash"
    }


@app.post("/scan", response_model=OCRResponse)
async def scan_invoice(
    image: UploadFile = File(...),
):
    """
    Scan invoice image using Gemini 2.0 Flash with Tesseract fallback
    """
    try:
        # Read image
        contents = await image.read()
        
        # Try Gemini first
        try:
            result = extract_with_gemini(contents)
            print(f"Gemini extraction successful, confidence: {result.get('confidence', 0)}")
            return OCRResponse(success=True, **result)
        except Exception as gemini_error:
            print(f"Gemini failed: {gemini_error}")
            
            # Fallback to Tesseract if available
            if TESSERACT_AVAILABLE:
                print("Falling back to Tesseract...")
                result = extract_with_tesseract(contents)
                return OCRResponse(success=True, **result)
            else:
                raise HTTPException(
                    status_code=503, 
                    detail=f"Gemini failed and Tesseract not available: {str(gemini_error)}"
                )
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"Unexpected error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/scan-base64")
async def scan_invoice_base64(data: dict):
    """
    Scan invoice from base64 encoded image
    """
    try:
        image_data = base64.b64decode(data.get("image", ""))
        
        # Try Gemini first
        try:
            result = extract_with_gemini(image_data)
            return {"success": True, **result}
        except Exception:
            if TESSERACT_AVAILABLE:
                result = extract_with_tesseract(image_data)
                return {"success": True, **result}
            raise HTTPException(status_code=503, detail="OCR failed")
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
