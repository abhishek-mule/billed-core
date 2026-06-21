import os
import re
import json
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List
from dataclasses import dataclass, field
from enum import Enum

import requests
import frappe


class OCRConfidence(Enum):
    HIGH = "high"      # > 85%
    MEDIUM = "medium"  # 70-85%
    LOW = "low"       # < 70%
    HEURISTIC = "heuristic"  # Fallback used


@dataclass
class ParsedInvoice:
    invoice_number: Optional[str] = None
    invoice_date: Optional[str] = None
    gstin: Optional[str] = None
    seller_name: Optional[str] = None
    seller_address: Optional[str] = None
    total_amount: Optional[float] = None
    cgst: Optional[float] = None
    sgst: Optional[float] = None
    igst: Optional[float] = None
    items: List[Dict] = field(default_factory=list)
    needs_review: bool = False
    raw_text: str = ""


@dataclass
class OCRResult:
    success: bool
    confidence: OCRConfidence
    confidence_score: float
    parsed_invoice: Optional[ParsedInvoice]
    source: str  # "sarvam" or "heuristic"
    error: Optional[str] = None
    processing_time_ms: float = 0


class SarvamOCR:
    """Primary OCR: Sarvam AI Invoice OCR"""
    
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.getenv("SARVAM_API_KEY")
        self.base_url = os.getenv("SARVAM_API_URL", "https://api.sarvam.ai/v1")
        self.timeout = int(os.getenv("OCR_TIMEOUT", "30"))
    
    def process(self, image_path: str) -> OCRResult:
        """Process invoice image through Sarvam OCR"""
        import time
        start_time = time.time()
        
        try:
            with open(image_path, 'rb') as f:
                files = {'file': f}
                headers = {
                    'Authorization': f'Bearer {self.api_key}'
                }
                
                response = requests.post(
                    f"{self.base_url}/ocr/invoice",
                    files=files,
                    headers=headers,
                    timeout=int(self.timeout)
                )
            
            if response.status_code != 200:
                return OCRResult(
                    success=False,
                    confidence=OCRConfidence.LOW,
                    confidence_score=0,
                    parsed_invoice=None,
                    source="sarvam",
                    error=f"API error: {response.status_code}"
                )
            
            data = response.json()
            
            # Parse response to extract invoice fields
            parsed = self._parse_sarvam_response(data)
            
            processing_time = (time.time() - start_time) * 1000
            
            return OCRResult(
                success=True,
                confidence=self._score_to_confidence(data.get("confidence", 0)),
                confidence_score=data.get("confidence", 0),
                parsed_invoice=parsed,
                source="sarvam",
                processing_time_ms=processing_time
            )
            
        except requests.Timeout:
            return OCRResult(
                success=False,
                confidence=OCRConfidence.LOW,
                confidence_score=0,
                parsed_invoice=None,
                source="sarvam",
                error="API timeout"
            )
        except Exception as e:
            return OCRResult(
                success=False,
                confidence=OCRConfidence.LOW,
                confidence_score=0,
                parsed_invoice=None,
                source="sarvam",
                error=str(e)
            )
    
    def _parse_sarvam_response(self, data: dict) -> ParsedInvoice:
        """Parse Sarvam API response to standard format"""
        ocr_text = data.get("ocr_text", "")
        
        # Extract fields using regex patterns
        invoice_number = self._extract_invoice_number(ocr_text)
        invoice_date = self._extract_date(ocr_text)
        gstin = self._extract_gstin(ocr_text)
        amounts = self._extract_amounts(ocr_text)
        
        return ParsedInvoice(
            invoice_number=invoice_number,
            invoice_date=invoice_date,
            gstin=gstin,
            seller_name=data.get("seller_name"),
            seller_address=data.get("seller_address"),
            total_amount=amounts.get("total"),
            cgst=amounts.get("cgst"),
            sgst=amounts.get("sgst"),
            igst=amounts.get("igst"),
            raw_text=ocr_text
        )
    
    def _extract_invoice_number(self, text: str) -> Optional[str]:
        """Extract invoice number"""
        # Common patterns: Invoice #, Inv No, Invoice No.
        patterns = [
            r'Invoice\s*#?\s*:?\s*([A-Za-z0-9\-\/]+)',
            r'Inv\s*No\.?\s*:?\s*([A-Za-z0-9\-\/]+)',
            r'Invoice\s+Number\s*:?\s*([A-Za-z0-9\-\/]+)'
        ]
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1).strip()
        return None
    
    def _extract_date(self, text: str) -> Optional[str]:
        """Extract invoice date"""
        patterns = [
            r'(\d{1,2}[\-\/\.]\d{1,2}[\-\/\.]\d{2,4})',
            r'(\d{4}[\-\/\.]\d{1,2}[\-\/\.]\d{1,2})'
        ]
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                return match.group(1)
        return None
    
    def _extract_gstin(self, text: str) -> Optional[str]:
        """Extract GSTIN"""
        # GSTIN: 15 chars, 2 digits, 10 chars, 1 digit, 1-3 chars
        pattern = r'GSTIN\s*:?\s*([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Z]{1}[0-9A-Z]{1})'
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1).upper()
        return None
    
    def _extract_amounts(self, text: str) -> dict:
        """Extract amounts"""
        amounts = {}
        
        # Find all currency amounts
        amount_pattern = r'₹?\s*([\d,]+\.?\d*)'
        matches = re.findall(amount_pattern, text.replace(',', ''))
        
        if matches:
            try:
                values = [float(m) for m in matches if m]
                if values:
                    amounts['total'] = max(values)  # Assume highest is total
            except:
                pass
        
        return amounts
    
    def _score_to_confidence(self, score: float) -> OCRConfidence:
        if score >= 0.85:
            return OCRConfidence.HIGH
        elif score >= 0.70:
            return OCRConfidence.MEDIUM
        else:
            return OCRConfidence.LOW


class HeuristicMatcher:
    """Fallback: Rule-based invoice parsing"""
    
    def __init__(self):
        self.item_cache = self._load_item_master()
    
    def _load_item_master(self) -> List[dict]:
        """Load items from ERPNext for fuzzy matching"""
        items = frappe.get_all(
            "Item",
            fields=["item_code", "item_name", "description", "stock_uom"],
            filters={"disabled": 0}
        )
        return items
    
    def match(self, image_path: str) -> OCRResult:
        """Use heuristics when OCR fails"""
        import time
        start_time = time.time()
        
        # Read image and extract text using simple OCR or return raw
        # For now, placeholder - integrate with Tesseract if needed
        
        # Match found items via fuzzy search
        items = self._find_similar_items("invoice")  # Placeholder
        
        parsed = ParsedInvoice(
            needs_review=True,
            items=items,
            raw_text="[Heuristic parsing - needs review]"
        )
        
        processing_time = (time.time() - start_time) * 1000
        
        return OCRResult(
            success=True,
            confidence=OCRConfidence.HEURISTIC,
            confidence_score=0.5,
            parsed_invoice=parsed,
            source="heuristic",
            processing_time_ms=processing_time
        )
    
    def _find_similar_items(self, query: str) -> List[Dict]:
        """Find similar items from Item Master"""
        # Simple contains search - upgrade to fuzzy matching with fuzzywuzzy
        matches = [
            {"item_code": i.item_code, "item_name": i.item_name, "score": 0.8}
            for i in self.item_cache
            if query.lower() in i.item_name.lower()
        ][:5]
        return matches


class InvoiceOCRPipeline:
    """Complete OCR Pipeline with retry and fallback"""
    
    def __init__(self):
        self.sarvam = SarvamOCR()
        self.heuristic = HeuristicMatcher()
        self.min_confidence = float(os.getenv("MIN_CONFIDENCE", "0.70"))
    
    def process(self, image_path: str) -> OCRResult:
        """Process invoice with automatic fallback"""
        
        # 1. Try Sarvam OCR first
        result = self.sarvam.process(image_path)
        
        # 2. If high confidence, return
        if result.success and result.confidence in [OCRConfidence.HIGH, OCRConfidence.MEDIUM]:
            # Log success
            self._log_ocr_result(result)
            return result
        
        # 3. If Sarvam failed or low confidence, try heuristic
        if not result.success or result.confidence == OCRConfidence.LOW:
            heuristic_result = self.heuristic.match(image_path)
            self._log_ocr_result(heuristic_result)
            return heuristic_result
        
        return result
    
    def _log_ocr_result(self, result: OCRResult):
        """Log OCR result for analytics"""
        frappe.publish_realtime(
            "ocr_result",
            {
                "success": result.success,
                "confidence": result.confidence.value,
                "source": result.source,
                "processing_time_ms": result.processing_time_ms
            }
        )


# API endpoint for use in ERPNext
@frappe.whitelist()
def process_invoice(file_url: str) -> dict:
    """Process invoice from ERPNext file URL"""
    # file_url is typically /private/files/filename.pdf
    file_path = frappe.get_site_path("..", file_url.lstrip("/"))
    
    pipeline = InvoiceOCRPipeline()
    result = pipeline.process(file_path)
    
    return {
        "success": result.success,
        "confidence": result.confidence.value,
        "confidence_score": result.confidence_score,
        "source": result.source,
        "invoice": result.parsed_invoice.__dict__ if result.parsed_invoice else None,
        "needs_review": result.parsed_invoice.needs_review if result.parsed_invoice else True
    }