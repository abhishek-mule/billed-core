export interface FakeRecoveryCase {
  caseId: string
  customerId: string
  tenantId: string
  totalOverdue: number
  status: 'active' | 'recovered' | 'closed'
  nextActionType: string
  brokenPromises: number
  ignoredReminders: number
  automationMode: string
  updatedAt: string
}

export class FakeRecoveryProjection {
  readonly name = 'fake'
  cases: Map<string, FakeRecoveryCase> = new Map()
  updateCallCount = 0

  async createCase(c: FakeRecoveryCase): Promise<void> {
    this.cases.set(c.caseId, { ...c })
  }

  async updateCase(caseId: string, update: Partial<FakeRecoveryCase>): Promise<void> {
    this.updateCallCount++
    const existing = this.cases.get(caseId)
    if (!existing) throw new Error(`Recovery case ${caseId} not found`)
    this.cases.set(caseId, { ...existing, ...update, updatedAt: new Date().toISOString() })
  }

  getCase(caseId: string): FakeRecoveryCase | undefined {
    return this.cases.get(caseId)
  }

  getAllCases(): FakeRecoveryCase[] {
    return Array.from(this.cases.values())
  }

  clear() {
    this.cases.clear()
    this.updateCallCount = 0
  }
}
