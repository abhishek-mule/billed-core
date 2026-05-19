const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

export interface ParsedInvoice {
  customerName: string
  phone?: string
  gstin?: string
  items: { name: string; qty: number; price: number }[]
  notes?: string
}

export interface ParseResult {
  success: boolean
  data?: ParsedInvoice
  error?: string
}

export async function parseWhatsAppInvoice(message: string, businessName: string): Promise<ParseResult> {
  const prompt = buildParsePrompt(message, businessName)

  try {
    const res = await fetch(`${GEMINI_API_URL}?key=${getGeminiKey()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 500,
        },
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[WhatsAppParser] Gemini API error:', err)
      return fallbackParse(message)
    }

    const data = await res.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

    try {
      const parsed = JSON.parse(cleaned) as ParsedInvoice

      if (!parsed.customerName || !parsed.items || parsed.items.length === 0) {
        return fallbackParse(message)
      }

      parsed.items = parsed.items.map((item: any) => ({
        name: item.name || 'Item',
        qty: item.qty || 1,
        price: item.price || 0,
      }))

      return { success: true, data: parsed }
    } catch {
      return fallbackParse(message)
    }
  } catch {
    return fallbackParse(message)
  }
}

function buildParsePrompt(message: string, businessName: string): string {
  return `You are an invoice parser for ${businessName}, a small business billing app in India.

Parse this WhatsApp message into a structured invoice. The message may be in Hindi, Hinglish, or English.

Message: "${message}"

Extract:
- customerName: The buyer's name (required)
- phone: Their phone number if mentioned (optional)
- gstin: GSTIN if mentioned (optional)
- items: Array of { name, qty, price }. qty defaults to 1 if not specified. price is per unit.
- notes: Any additional notes (optional)

Rules:
- Item names should be clean (no qty/price mixed in)
- Prices are in INR
- If qty is not specified, assume 1
- If price is not specified for an item, set it to 0
- Return ONLY valid JSON. No markdown, no explanation.

Example output:
{"customerName":"Suresh Traders","phone":"9876543210","items":[{"name":"Bajaj Fan","qty":3,"price":1200},{"name":"Havells Switch","qty":1,"price":450}],"notes":"Deliver by Friday"}`
}

function fallbackParse(message: string): ParseResult {
  const nameMatch = message.match(/(?:bill|invoice|bhejo|karo)[\s:]+([^,]+)/i)
  const customerName = nameMatch ? nameMatch[1].trim() : 'Customer'

  const itemMatches = message.matchAll(/(\d+)[xX×]\s*([^\d]+?)\s*(?:₹|rs|Rs|INR)?\s*(\d+)/g)
  const items: { name: string; qty: number; price: number }[] = []

  for (const match of itemMatches) {
    items.push({
      name: match[2].trim(),
      qty: parseInt(match[1]),
      price: parseInt(match[3]),
    })
  }

  if (items.length === 0) {
    const simpleMatch = message.match(/(?:₹|rs|Rs|INR)\s*(\d+)/g)
    if (simpleMatch && simpleMatch.length > 0) {
      const total = parseInt(simpleMatch[0].replace(/\D/g, ''))
      items.push({ name: 'Item', qty: 1, price: total })
    }
  }

  if (items.length === 0) {
    return { success: false, error: 'Could not find items in message. Try: "Bill karo: Name, 2x Item ₹1200"' }
  }

  return { success: true, data: { customerName, items } }
}

function getGeminiKey(): string {
  return process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || ''
}