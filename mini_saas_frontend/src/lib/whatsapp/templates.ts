// src/lib/whatsapp/templates.ts
export const WA_TEMPLATES = {
  invoice_delivery: {
    en: "Hi {{name}}, here is your invoice {{invoice_no}}. Pay here: {{pdf_url}}",
    hi: "नमस्ते {{name}}, आपका इनवॉइस {{invoice_no}} यहाँ है। यहाँ भुगतान करें: {{pdf_url}}",
    mr: "नमस्कार {{name}}, तुमचे इनवॉइस {{invoice_no}} येथे आहे. येथे पैसे द्या: {{pdf_url}}"
  },
  reminder_gentle: {
    en: "Hi {{name}}, just a reminder for invoice {{invoice_no}} of ₹{{amount}}.",
    hi: "नमस्ते {{name}}, इनवॉइस {{invoice_no}} (₹{{amount}}) के लिए एक रिमाइंडर है।",
    mr: "नमस्कार {{name}}, इनवॉइस {{invoice_no}} (₹{{amount}}) साठी एक रिमाइंडर आहे."
  }
};
