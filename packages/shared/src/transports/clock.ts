export interface Clock {
  now(): Date
  advance(ms: number): void
  setTime(date: Date): void
  name: string
}
