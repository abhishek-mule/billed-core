import type { Clock } from './clock';
export declare class FakeClock implements Clock {
    readonly name = "fake";
    private current;
    constructor(initial?: Date);
    now(): Date;
    advance(ms: number): void;
    setTime(date: Date): void;
}
//# sourceMappingURL=fake-clock.d.ts.map