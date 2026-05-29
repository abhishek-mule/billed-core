import type { AuthorityConfig } from './schema';
interface EnvSource {
    [key: string]: string | undefined;
}
export declare function parseEnv(env: EnvSource): AuthorityConfig;
export {};
//# sourceMappingURL=env.d.ts.map