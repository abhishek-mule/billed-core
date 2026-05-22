export declare const supabaseAdmin: import("@supabase/supabase-js").SupabaseClient<any, "public", "public", any, any>;
export declare function saveDeviceToken(tenantId: string, fcmToken: string, deviceType: string): Promise<null>;
export declare function getDeviceTokens(tenantId: string): Promise<any[]>;
export declare function deleteDeviceTokens(tokens: string[]): Promise<void>;
//# sourceMappingURL=supabase-admin.d.ts.map