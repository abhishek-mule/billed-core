"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FakeClock = void 0;
class FakeClock {
    constructor(initial) {
        this.name = 'fake';
        this.current = initial ?? new Date('2026-06-01T00:00:00Z');
    }
    now() {
        return new Date(this.current);
    }
    advance(ms) {
        this.current = new Date(this.current.getTime() + ms);
    }
    setTime(date) {
        this.current = new Date(date);
    }
}
exports.FakeClock = FakeClock;
//# sourceMappingURL=fake-clock.js.map