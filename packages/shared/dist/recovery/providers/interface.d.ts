export interface CollectionProvider<TInput = unknown, TOutput = unknown> {
    readonly name: string;
    create(input: TInput): Promise<TOutput> | TOutput;
}
//# sourceMappingURL=interface.d.ts.map