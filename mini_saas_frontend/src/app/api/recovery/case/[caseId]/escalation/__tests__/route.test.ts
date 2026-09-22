import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/billzo/api-middleware', () => ({
  verifyRequest: vi.fn(async () => ({ tenantId: 't1', userId: 'u1' })),
  errorResponse: vi.fn((msg: string, status: number) => new Response(msg, { status })),
  validateJsonBody: vi.fn(async (req: Request) => ({ data: await req.json(), response: null })),
  logApiAccess: vi.fn(),
}))

vi.mock('@/lib/auth/feature-gate', () => ({
  requireFeature: vi.fn(async () => ({
    allowed: true,
    code: null,
    error: null,
    message: null,
    upgradeTo: null,
  })),
}))

vi.mock('@/lib/billzo/recovery-escalation', () => ({
  assessRecoveryCase: vi.fn(),
  recordMerchantDecision: vi.fn(),
}))

vi.mock('@billzo/shared', async (importOriginal) => {
  const original: any = await importOriginal()
  return { ...original, MERCHANT_DECISIONS: ['authorize', 'offer_plan', 'pause', 'decline'] }
})

import { GET, POST } from '@/app/api/recovery/case/[caseId]/escalation/route'
import { verifyRequest } from '@/lib/billzo/api-middleware'
import { requireFeature } from '@/lib/auth/feature-gate'
import { assessRecoveryCase, recordMerchantDecision } from '@/lib/billzo/recovery-escalation'

function makeReq(body?: unknown) {
  return {
    nextUrl: new URL('http://localhost/api/recovery/case/c-1/escalation'),
    json: async () => body ?? {},
  } as any
}

describe('GET /api/recovery/case/[caseId]/escalation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requires authentication', async () => {
    ;(verifyRequest as any).mockResolvedValueOnce({ response: new Response('no', { status: 401 }) })
    const res = await GET(makeReq(), { params: { caseId: 'c-1' } })
    expect(res.status).toBe(401)
  })

  it('returns 403 when the escalation_pack feature is locked', async () => {
    ;(requireFeature as any).mockResolvedValueOnce({
      allowed: false,
      code: 'FEATURE_LOCKED',
      error: 'locked',
      message: 'Requires business plan',
      upgradeTo: 'business',
    })
    const res = await GET(makeReq(), { params: { caseId: 'c-1' } })
    const json = await res.json()
    expect(res.status).toBe(403)
    expect(json.code).toBe('FEATURE_LOCKED')
    expect(json.upgradeTo).toBe('business')
  })

  it('returns 404 when the tenant does not exist', async () => {
    ;(requireFeature as any).mockResolvedValueOnce({
      allowed: false,
      code: 'TENANT_NOT_FOUND',
      error: 'no tenant',
      message: 'no tenant',
      upgradeTo: null,
    })
    const res = await GET(makeReq(), { params: { caseId: 'c-1' } })
    expect(res.status).toBe(404)
  })

  it('returns the assessment with recommendation and immutable basis', async () => {
    ;(assessRecoveryCase as any).mockResolvedValueOnce({
      recommended: true,
      stage: 'urgent',
      grade: 84,
      basis: [{ kind: 'overdue', fact: '22 days overdue' }],
      effort: { attempts: 1, noise: '1 attempt', result: 'No payment' },
      escalation: {
        id: 'esc-1',
        status: 'recommended',
        recommended: true,
        basis: [{ kind: 'overdue', fact: '22 days overdue' }],
      },
    })
    const res = await GET(makeReq(), { params: { caseId: 'c-1' } })
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.assessment.recommended).toBe(true)
    expect(json.assessment.stage).toBe('urgent')
    expect(json.assessment.basis.length).toBeGreaterThan(0)
    expect(assessRecoveryCase).toHaveBeenCalledWith('t1', 'c-1')
  })

  it('returns 404 when the recovery case is unknown', async () => {
    ;(assessRecoveryCase as any).mockResolvedValueOnce(null)
    const res = await GET(makeReq(), { params: { caseId: 'nope' } })
    expect(res.status).toBe(404)
  })
})

describe('POST /api/recovery/case/[caseId]/escalation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects a decision outside MERCHANT_DECISIONS with 400', async () => {
    const res = await POST(makeReq({ decision: 'attack' }), { params: { caseId: 'c-1' } })
    expect(res.status).toBe(400)
    expect(recordMerchantDecision).not.toHaveBeenCalled()
  })

  it('authorizes the escalation and returns the refresh set', async () => {
    ;(recordMerchantDecision as any).mockResolvedValueOnce({
      escalation: { id: 'esc-1', merchantDecision: 'authorize', status: 'prepared' },
      eventId: 'o-1',
    })
    const res = await POST(makeReq({ decision: 'authorize', note: 'Proceed' }), {
      params: { caseId: 'c-1' },
    })
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.escalation.merchantDecision).toBe('authorize')
    expect(json.eventId).toBe('o-1')
    expect(recordMerchantDecision).toHaveBeenCalledWith(
      't1',
      'c-1',
      'u1',
      expect.objectContaining({ decision: 'authorize', note: 'Proceed', emitEscalatedEvent: true }),
    )
    expect(json.refresh).toContain('command_center')
  })

  it('passes a null note when the body omits it', async () => {
    ;(recordMerchantDecision as any).mockResolvedValueOnce({
      escalation: { id: 'esc-1', merchantDecision: 'pause' },
      eventId: null,
    })
    const res = await POST(makeReq({ decision: 'pause' }), { params: { caseId: 'c-1' } })
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(recordMerchantDecision).toHaveBeenCalledWith(
      't1',
      'c-1',
      'u1',
      expect.objectContaining({ decision: 'pause', note: null }),
    )
    expect(json.eventId).toBeNull()
  })
})