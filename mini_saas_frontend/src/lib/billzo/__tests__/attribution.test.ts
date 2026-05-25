import { describe, it, expect, vi, beforeEach } from 'vitest'

// Shared mutable mock state for supabaseAdmin.from
let mockFromImpl: ((table: string) => any) | null = null
const mockFrom = vi.fn((table: string) => {
  if (mockFromImpl) return mockFromImpl(table)
  return defaultMockChain()
})

function defaultMockChain() {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn(() => chain),
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    })),
  }
  return chain
}

vi.mock('../supabase-admin', () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}))

vi.mock('../outbox', () => ({
  writeOutboxEvent: vi.fn().mockResolvedValue('evt_mock_001'),
}))

vi.mock('../idempotency', async () => {
  const actual = await vi.importActual('../idempotency')
  return {
    ...actual,
    executeIdempotent: vi.fn((_key, _type, _tenant, executor) => executor()),
    checkIdempotency: vi.fn().mockResolvedValue({ isDuplicate: false }),
    recordProcessedJob: vi.fn().mockResolvedValue(true),
  }
})

describe('attribution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFromImpl = null
  })

  describe('attributeRecovery', () => {
    it('should not attribute when no reminder found in window', async () => {
      mockFromImpl = (_table: string) => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: vi.fn(() => ({
                  lte: vi.fn(() => ({
                    order: vi.fn(() => ({
                      limit: vi.fn(() => ({
                        data: [],
                        error: null,
                      })),
                    })),
                  })),
                })),
              })),
            })),
          })),
        })),
      })

      const { attributeRecovery } = await import('../attribution')
      const result = await attributeRecovery({
        invoiceId: 'inv_test_001',
        tenantId: 'tenant_test_123',
        paymentTimestamp: new Date().toISOString(),
      })

      expect(result.attributed).toBe(false)
      expect(result.reminderEventId).toBeNull()
      expect(result.confidenceScore).toBe(0)
      expect(result.attributionType).toBe('none')
    })

    it('should attribute to most recent reminder within window', async () => {
      const paymentTime = new Date('2026-05-25T12:00:00Z')
      const reminderTime = new Date('2026-05-25T10:00:00Z') // 2 hours before

      mockFromImpl = (table: string) => {
        if (table === 'outbox') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    gte: vi.fn(() => ({
                      lte: vi.fn(() => ({
                        order: vi.fn(() => ({
                          limit: vi.fn(() => ({
                            data: [
                              {
                                id: 'reminder_001',
                                created_at: reminderTime.toISOString(),
                                causation_id: 'causation_001',
                              },
                            ],
                            error: null,
                          })),
                        })),
                      })),
                    })),
                  })),
                })),
              })),
            })),
          }
        }
        if (table === 'recovery_attributions') {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'attr_001' },
                  error: null,
                }),
              })),
            })),
          }
        }
        return defaultMockChain()
      }

      const { attributeRecovery } = await import('../attribution')
      const result = await attributeRecovery({
        invoiceId: 'inv_test_001',
        tenantId: 'tenant_test_123',
        paymentTimestamp: paymentTime.toISOString(),
      })

      expect(result.attributed).toBe(true)
      expect(result.reminderEventId).toBe('reminder_001')
      expect(result.attributionType).toBe('last_touch')
      // 2 hours <= 6 hours -> confidence = 1.0 (default, not in any >X branch)
      expect(result.confidenceScore).toBe(1.0)
      expect(result.hoursBetweenReminderAndPayment).toBeCloseTo(2, 0)
    })

    it('should adjust confidence based on time proximity', async () => {
      const paymentTime = new Date('2026-05-25T12:00:00Z')

      // Confidence thresholds from code:
      // > 24 -> 0.7, > 12 -> 0.85, > 6 -> 0.95, else -> 1.0
      const cases = [
        { reminderTime: '2026-05-25T04:00:00Z', expected: 0.95, label: '8 hours (>6 = 0.95)' },
        { reminderTime: '2026-05-24T22:00:00Z', expected: 0.85, label: '14 hours (>12 = 0.85)' },
        { reminderTime: '2026-05-24T04:00:00Z', expected: 0.7, label: '32 hours (>24 = 0.7)' },
      ]

      for (const c of cases) {
        vi.clearAllMocks()
        mockFromImpl = (table: string) => {
          if (table === 'outbox') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      gte: vi.fn(() => ({
                        lte: vi.fn(() => ({
                          order: vi.fn(() => ({
                            limit: vi.fn(() => ({
                              data: [
                                {
                                  id: 'reminder_test',
                                  created_at: c.reminderTime,
                                  causation_id: 'causation_test',
                                },
                              ],
                              error: null,
                            })),
                          })),
                        })),
                      })),
                    })),
                  })),
                })),
              })),
            }
          }
          if (table === 'recovery_attributions') {
            return {
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'attr_test' },
                    error: null,
                  }),
                })),
              })),
            }
          }
          return defaultMockChain()
        }

        const { attributeRecovery } = await import('../attribution')
        const result = await attributeRecovery({
          invoiceId: 'inv_test_001',
          tenantId: 'tenant_test_123',
          paymentTimestamp: paymentTime.toISOString(),
        })

        expect(result.attributed).toBe(true)
        expect(result.confidenceScore).toBe(c.expected)
      }
    })

    it('should write attribution record to database', async () => {
      const paymentTime = new Date('2026-05-25T12:00:00Z')
      const reminderTime = new Date('2026-05-25T10:00:00Z')

      let insertCallArgs: any = null

      mockFromImpl = (table: string) => {
        if (table === 'outbox') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    gte: vi.fn(() => ({
                      lte: vi.fn(() => ({
                        order: vi.fn(() => ({
                          limit: vi.fn(() => ({
                            data: [
                              {
                                id: 'reminder_001',
                                created_at: reminderTime.toISOString(),
                                causation_id: 'causation_001',
                              },
                            ],
                            error: null,
                          })),
                        })),
                      })),
                    })),
                  })),
                })),
              })),
            })),
          }
        }
        if (table === 'recovery_attributions') {
          return {
            insert: vi.fn((args: any) => {
              insertCallArgs = args
              return {
                select: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'attr_written' },
                    error: null,
                  }),
                })),
              }
            }),
          }
        }
        return defaultMockChain()
      }

      const { attributeRecovery } = await import('../attribution')
      await attributeRecovery({
        invoiceId: 'inv_test_001',
        tenantId: 'tenant_test_123',
        paymentId: 'pay_test_001',
        paymentTimestamp: paymentTime.toISOString(),
      })

      expect(insertCallArgs).not.toBeNull()
      expect(insertCallArgs.invoice_id).toBe('inv_test_001')
      expect(insertCallArgs.payment_id).toBe('pay_test_001')
      expect(insertCallArgs.reminder_event_id).toBe('reminder_001')
      expect(insertCallArgs.attribution_type).toBe('last_touch')
      expect(insertCallArgs.attribution_window_hours).toBe(48)
      // 2 hours <= 6 -> confidence = 1.0
      expect(insertCallArgs.confidence_score).toBe(1.0)
    })
  })
})
