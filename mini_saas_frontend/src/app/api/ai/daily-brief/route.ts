import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest } from '@/lib/billzo/api-middleware'

export const dynamic = 'force-dynamic'

type BriefAction = {
  title: string
  detail: string
  priority: 'high' | 'medium' | 'low'
  actionLabel: string
  actionPath: string
}

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash'

function fallbackBrief(summary: any): { headline: string; actions: BriefAction[] } {
  const pendingAmount = Number(summary?.pendingAmount || 0)
  const overdueCount = Number(summary?.overdueCount || 0)
  const lowStockCount = Number(summary?.lowStockCount || 0)
  const collectedToday = Number(summary?.collectedToday || 0)

  const actions: BriefAction[] = []

  if (pendingAmount > 0) {
    actions.push({
      title: `Collect Rs ${pendingAmount.toLocaleString('en-IN')}`,
      detail: overdueCount > 0
        ? `${overdueCount} overdue bills need follow-up today.`
        : 'Pending bills are open. Start with the oldest customer.',
      priority: overdueCount > 0 ? 'high' : 'medium',
      actionLabel: 'Open Recovery',
      actionPath: '/dashboard',
    })
  }

  if (lowStockCount > 0) {
    actions.push({
      title: `${lowStockCount} low-stock items`,
      detail: 'Restock fast-moving products before sales slow down.',
      priority: 'medium',
      actionLabel: 'Check Stock',
      actionPath: '/products',
    })
  }

  actions.push({
    title: `Collected Rs ${collectedToday.toLocaleString('en-IN')} today`,
    detail: collectedToday > 0 ? 'Good start. Keep collection momentum going.' : 'No collection recorded yet today.',
    priority: collectedToday > 0 ? 'low' : 'medium',
    actionLabel: 'Create Sale',
    actionPath: '/pos',
  })

  return {
    headline: pendingAmount > 0
      ? `Today focus on collecting Rs ${pendingAmount.toLocaleString('en-IN')}.`
      : 'Today focus on new sales and stock health.',
    actions: actions.slice(0, 3),
  }
}

function cleanBrief(value: any, summary: any) {
  const fallback = fallbackBrief(summary)
  const allowedPaths = new Set(['/dashboard', '/pos', '/products', '/reports', '/invoices', '/purchases'])

  const actions = Array.isArray(value?.actions) ? value.actions : []
  const cleanedActions = actions
    .map((action: any) => ({
      title: String(action?.title || '').slice(0, 80),
      detail: String(action?.detail || '').slice(0, 160),
      priority: ['high', 'medium', 'low'].includes(action?.priority) ? action.priority : 'medium',
      actionLabel: String(action?.actionLabel || 'Open').slice(0, 24),
      actionPath: allowedPaths.has(action?.actionPath) ? action.actionPath : '/dashboard',
    }))
    .filter((action: BriefAction) => action.title && action.detail)
    .slice(0, 3)

  return {
    headline: String(value?.headline || fallback.headline).slice(0, 140),
    actions: cleanedActions.length > 0 ? cleanedActions : fallback.actions,
    source: value?.source === 'gemini' ? 'gemini' : 'fallback',
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response

    const summary = await request.json()
    const apiKey = process.env.GEMINI_API_KEY

    if (!apiKey) {
      return NextResponse.json({ ...fallbackBrief(summary), source: 'fallback' })
    }

    const prompt = `
You are BillZo's AI business coach for an Indian small merchant.
Create a daily action brief from the provided business summary.

Rules:
- Be specific and money-focused.
- Use simple Indian small-business language.
- Do not mention AI, Gemini, or internal data.
- Do not advise illegal, threatening, or harassing collection.
- Return only valid JSON.
- actionPath must be one of: /dashboard, /pos, /products, /reports, /invoices, /purchases.

Business summary JSON:
${JSON.stringify(summary)}

Return JSON in this exact shape:
{
  "headline": "one short sentence",
  "source": "gemini",
  "actions": [
    {
      "title": "short action title",
      "detail": "why this matters",
      "priority": "high|medium|low",
      "actionLabel": "button label",
      "actionPath": "/dashboard"
    }
  ]
}
`.trim()

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.35,
            maxOutputTokens: 500,
            responseMimeType: 'application/json',
          },
        }),
      },
    )

    if (!response.ok) {
      console.error('[DailyBrief] Gemini error:', response.status, await response.text())
      return NextResponse.json({ ...fallbackBrief(summary), source: 'fallback' })
    }

    const data = await response.json()
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    if (!raw) {
      return NextResponse.json({ ...fallbackBrief(summary), source: 'fallback' })
    }

    const parsed = JSON.parse(raw)
    return NextResponse.json(cleanBrief(parsed, summary))
  } catch (error: any) {
    console.error('[DailyBrief] Error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
