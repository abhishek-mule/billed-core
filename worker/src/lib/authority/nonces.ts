export class NonceStore {
  private readonly seen = new Set<string>()

  checkAndMark(nonce: string): { valid: boolean } {
    if (this.seen.has(nonce)) {
      return { valid: false }
    }
    this.seen.add(nonce)
    return { valid: true }
  }

  isReplay(nonce: string): boolean {
    return this.seen.has(nonce)
  }

  reset(): void {
    this.seen.clear()
  }

  get size(): number {
    return this.seen.size
  }
}
