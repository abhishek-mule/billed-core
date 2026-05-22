"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabaseAdmin = void 0;
exports.saveDeviceToken = saveDeviceToken;
exports.getDeviceTokens = getDeviceTokens;
exports.deleteDeviceTokens = deleteDeviceTokens;
const supabase_js_1 = require("@supabase/supabase-js");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    '';
exports.supabaseAdmin = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
async function saveDeviceToken(tenantId, fcmToken, deviceType) {
    const { data, error } = await exports.supabaseAdmin
        .from('device_tokens')
        .upsert({
        tenant_id: tenantId,
        fcm_token: fcmToken,
        device_type: deviceType,
        updated_at: new Date().toISOString()
    }, { onConflict: 'fcm_token' });
    if (error) {
        console.error('Supabase save error:', error);
        throw error;
    }
    return data;
}
async function getDeviceTokens(tenantId) {
    const { data, error } = await exports.supabaseAdmin
        .from('device_tokens')
        .select('fcm_token')
        .eq('tenant_id', tenantId);
    if (error) {
        console.error('Supabase fetch error:', error);
        return [];
    }
    return data.map(d => d.fcm_token);
}
async function deleteDeviceTokens(tokens) {
    if (tokens.length === 0)
        return;
    const { error } = await exports.supabaseAdmin
        .from('device_tokens')
        .delete()
        .in('fcm_token', tokens);
    if (error) {
        console.error('Supabase token cleanup error:', error);
    }
}
//# sourceMappingURL=supabase-admin.js.map