'use client'

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

export interface GenerateMessageOptions {
  customerName: string
  amount: number
  invoiceDate: string
  daysOverdue: number
  stage: 'soft' | 'nudge' | 'strong' | 'warning'
  language: 'hindi' | 'hinglish' | 'english'
  pastPayments?: { amount: number; paidAt: string }[]
  lastMessageRead?: boolean
  businessName?: string
  invoiceId?: string
}

export interface GeneratedMessage {
  message: string
  tone: string
  language: string
  reasoning: string
}

function getDaysOverdue(dueDate: string): number {
  const due = new Date(dueDate)
  const now = new Date()
  return Math.max(0, Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)))
}

function formatAmount(amount: number): string {
  return `Rs ${amount.toLocaleString('en-IN')}`
}

function buildFallbackMessage(opts: GenerateMessageOptions): string {
  const { customerName, amount, stage, language } = opts
  const amountStr = formatAmount(amount)
  const businessName = opts.businessName || 'BillZo'

  const messages: Record<string, Record<string, string>> = {
    soft: {
      hindi: `नमस्ते ${customerName} ji, आपका ${amountStr} का भुगतान बकाया है। कृपया जल्द से जल्द भुगतान करें। - ${businessName}`,
      hinglish: `Namaste ${customerName} ji, aapka ${amountStr} ka payment baaki hai. PDF ke saath details mein check karein. - ${businessName}`,
      english: `Hi ${customerName}, a payment of ${amountStr} is pending. Please check the PDF for details. - ${businessName}`,
    },
    nudge: {
      hindi: `${customerName} ji, ${amountStr} का भुगतान अभी भी बकाया है। कृपया आज ही भुगतान करें।`,
      hinglish: `Hi ${customerName}, ${amountStr} abhi bhi baaki hai. Aaj hi payment karo yaar, please! 🙏 - ${businessName}`,
      english: `Hi ${customerName}, a reminder that ${amountStr} is still pending. Please clear it today. - ${businessName}`,
    },
    strong: {
      hindi: `${customerName} ji, ${amountStr} का भुगतान बहुत देर हो चुका है। कृपया अभी भुगतान करें।`,
      hinglish: `${customerName}, ${amountStr} ka payment bahut late ho gaya yaar! Aaj hi karo, please. 🙏 - ${businessName}`,
      english: `Dear ${customerName}, ${amountStr} payment is overdue. Please settle it now to avoid further follow-up. - ${businessName}`,
    },
    warning: {
      hindi: `${customerName} ji, अंतिम रिमाइंडर: ${amountStr} बकाया है। कृपया तुरंत भुगतान करें।`,
      hinglish: `${customerName} ji, last reminder! ${amountStr} baaki hai. Please aaj hi pay karo, kaafi ho gaya yaar 🙏 - ${businessName}`,
      english: `Final reminder, ${customerName}: ${amountStr} is overdue. Please pay immediately to avoid escalation. - ${businessName}`,
    },
  }

  return messages[stage]?.[language] || messages[stage]?.hinglish || messages.soft.hinglish
}

function buildPrompt(opts: GenerateMessageOptions): string {
  const { customerName, amount, daysOverdue, stage, language, pastPayments, lastMessageRead, businessName } = opts
  const amountStr = formatAmount(amount)
  const bn = businessName || 'BillZo'

  let prompt = `You are an expert collection agent for an Indian small business app called ${bn}.\n`
  prompt += `Generate a WhatsApp payment reminder message.\n\n`
  prompt += `Rules:\n`
  prompt += `- Be warm but firm. Indian small business culture.\n`
  prompt += `- Keep under 280 characters (WhatsApp limit).\n`
  prompt += `- NEVER mention "overdue" or "reminder" - sound natural.\n`
  prompt += `- NEVER say "final reminder" or "last chance" - too aggressive.\n`
  prompt += `- Include brief context about the payment.\n`
  prompt += `- The message should motivate them to pay, not feel threatening.\n`
  prompt += `- Add a small relevant emoji at the end for warmth.\n`
  prompt += `- If amount is small (< Rs 500), be very casual.\n`
  prompt += `- If amount is large (> Rs 5000), be more respectful/professional.\n`
  prompt += `- Include "~" before the amount for casual tone.\n\n`
  prompt += `Context:\n`
  prompt += `- Customer: ${customerName}\n`
  prompt += `- Amount pending: ${amountStr}\n`
  prompt += `- Days since due: ${daysOverdue} days\n`
  prompt += `- Tone needed: ${stage}\n`
  prompt += `  - soft: first friendly message\n`
  prompt += `  - nudge: gentle follow-up\n`
  prompt += `  - strong: firm but polite\n`
  prompt += `  - warning: urgent but respectful\n`
  prompt += `- Language: ${language === 'hinglish' ? 'Hinglish (roman Hindi with English mix)' : language}\n`

  if (pastPayments && pastPayments.length > 0) {
    const totalPast = pastPayments.reduce((s, p) => s + p.amount, 0)
    const avgPast = Math.round(totalPast / pastPayments.length)
    prompt += `- Customer usually pays ~Rs ${avgPast.toLocaleString('en-IN')} - reference their past reliability.\n`
  }

  if (lastMessageRead) {
    prompt += `- They opened the last message! Use this to your advantage.\n`
  }

  if (daysOverdue > 30) {
    prompt += `- IMPORTANT: This is 30+ days overdue. Acknowledge delay empathetically but still request payment.\n`
  }

  prompt += `\nRespond ONLY with a valid JSON object:\n`
  prompt += `{"message": "your generated message here", "reasoning": "brief explanation of tone choice"}`
  prompt += `\nNo markdown, no code blocks, just raw JSON.`

  return prompt
}

export async function generateSmartMessage(opts: GenerateMessageOptions): Promise<GeneratedMessage> {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY

  if (!apiKey) {
    if (typeof console !== 'undefined') console.warn('[BillZo] Gemini API key not configured. Using fallback message.')
    return {
      message: buildFallbackMessage(opts),
      tone: opts.stage,
      language: opts.language,
      reasoning: 'Fallback: Gemini API key not configured',
    }
  }

  const prompt = buildPrompt(opts)

  try {
    const response = await fetch(
      `${GEMINI_API_URL}?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.75,
            maxOutputTokens: 200,
            topP: 0.9,
          },
        }),
      }
    )

    if (!response.ok) {
      console.error('Gemini API error:', response.status, await response.text())
      return {
        message: buildFallbackMessage(opts),
        tone: opts.stage,
        language: opts.language,
        reasoning: 'Fallback: API error',
      }
    }

    const data = await response.json()
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()

    if (!raw) {
      return {
        message: buildFallbackMessage(opts),
        tone: opts.stage,
        language: opts.language,
        reasoning: 'Fallback: Empty response',
      }
    }

    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return {
        message: buildFallbackMessage(opts),
        tone: opts.stage,
        language: opts.language,
        reasoning: 'Fallback: Could not parse JSON',
      }
    }

    const parsed = JSON.parse(jsonMatch[0])
    const message = (parsed.message || '').trim()

    if (!message || message.length < 10) {
      return {
        message: buildFallbackMessage(opts),
        tone: opts.stage,
        language: opts.language,
        reasoning: 'Fallback: Invalid message',
      }
    }

    return {
      message,
      tone: opts.stage,
      language: opts.language,
      reasoning: parsed.reasoning || 'AI-generated',
    }
  } catch (err) {
    console.error('Gemini generateMessage error:', err)
    return {
      message: buildFallbackMessage(opts),
      tone: opts.stage,
      language: opts.language,
      reasoning: 'Fallback: Exception caught',
    }
  }
}

export function detectLanguage(text: string): 'hindi' | 'hinglish' | 'english' {
  const hindiWords = ['namaste', 'ji', 'bahut', 'jaldi', 'kaafi', 'ho', 'gaya', 'hai', 'ke', 'ko', 'se', 'de', 'diya', 'tha', 'thi', 'tum', 'aap', 'hum', 'sirf', 'bas', 'ab', 'yaar', 'koi']
  const hindiRegex = /[\u0900-\u097F]/
  const words = text.toLowerCase().split(/\s+/)
  const hindiCount = words.filter(w => hindiWords.includes(w) || hindiRegex.test(w)).length
  const hindiRatio = hindiCount / words.length

  if (hindiRatio > 0.3 || hindiRegex.test(text)) {
    return 'hindi'
  }
  if (hindiCount > 2 || /ji|yaar|kya|hai|bhi/i.test(text)) {
    return 'hinglish'
  }
  return 'english'
}

export async function analyzeCustomerPaymentPattern(
  customerId: string,
  payments: { amount: number; paidAt: string; createdAt: string }[]
) {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY

  if (!apiKey || payments.length === 0) {
    return { recommendedTone: 'nudge' as const, insight: 'Not enough data for AI analysis' }
  }

  let prompt = `Analyze this customer's payment pattern and give a one-line insight:\n`
  const totalAmount = payments.reduce((s, p) => s + p.amount, 0)
  const avgAmount = Math.round(totalAmount / payments.length)
  const daySpan = payments.length > 1
    ? Math.round((new Date(payments[payments.length - 1].paidAt).getTime() - new Date(payments[0].paidAt).getTime()) / (1000 * 60 * 60 * 24))
    : 0

  prompt += `- Total payments: ${payments.length}\n`
  prompt += `- Total amount paid: Rs ${totalAmount.toLocaleString('en-IN')}\n`
  prompt += `- Average payment: Rs ${avgAmount.toLocaleString('en-IN')}\n`
  prompt += `- Period: ${daySpan} days\n`
  prompt += `- Last payment: ${payments[payments.length - 1]?.paidAt || 'N/A'}\n`
  prompt += `\nRespond ONLY with JSON: {"insight": "one line about their payment behavior", "recommendedTone": "soft|nudge|strong|warning", "urgency": "low|medium|high"}`

  try {
    const response = await fetch(
      `${GEMINI_API_URL}?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 100 },
        }),
      }
    )

    if (!response.ok) throw new Error('Gemini error')

    const data = await response.json()
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    if (!raw) return { recommendedTone: 'nudge' as const, insight: 'Analysis unavailable' }

    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return { recommendedTone: 'nudge' as const, insight: 'Could not parse analysis' }

    return JSON.parse(jsonMatch[0])
  } catch (err) {
    console.error('Gemini customer analysis error:', err)
    return { recommendedTone: 'nudge' as const, insight: 'Analysis unavailable' }
  }
}