import type { Clock } from './clock'

export class FakeClock implements Clock {
  readonly name = 'fake'
  private current: Date

  constructor(initial?: Date) {
    this.current = initial ?? new Date('2026-06-01T00:00:00Z')
  }

  now(): Date {
    return new Date(this.current)
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms)
  }

  setTime(date: Date): void {
    this.current = new Date(date)
  }
}
