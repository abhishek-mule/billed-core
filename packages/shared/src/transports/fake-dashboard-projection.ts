export interface DashboardMetric {
  name: string
  value: number
  updatedAt: string
}

export interface DashboardSectionUpdate {
  type: string
  itemCount: number
  updatedAt: string
}

export class FakeDashboardProjection {
  readonly name = 'fake'
  metrics: Map<string, DashboardMetric> = new Map()
  sections: Map<string, DashboardSectionUpdate> = new Map()
  refreshCallCount = 0
  lastRefreshAt: string | null = null

  async updateMetric(name: string, value: number): Promise<void> {
    this.metrics.set(name, { name, value, updatedAt: new Date().toISOString() })
  }

  async updateSection(type: string, itemCount: number): Promise<void> {
    this.sections.set(type, { type, itemCount, updatedAt: new Date().toISOString() })
  }

  async refresh(): Promise<void> {
    this.refreshCallCount++
    this.lastRefreshAt = new Date().toISOString()
  }

  getMetric(name: string): DashboardMetric | undefined {
    return this.metrics.get(name)
  }

  getSection(type: string): DashboardSectionUpdate | undefined {
    return this.sections.get(type)
  }

  clear() {
    this.metrics.clear()
    this.sections.clear()
    this.refreshCallCount = 0
    this.lastRefreshAt = null
  }
}
