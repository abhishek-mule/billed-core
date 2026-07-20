"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMetaClient = createMetaClient;
const DEFAULT_API_VERSION = 'v25.0';
function baseUrl(config) {
    return `https://graph.facebook.com/${config.apiVersion || DEFAULT_API_VERSION}/${config.phoneNumberId}`;
}
function createMetaClient(config) {
    const headers = {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
    };
    async function request(path, options = {}) {
        const url = `${baseUrl(config)}${path}`;
        const res = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });
        const data = await res.json();
        if (!res.ok) {
            const err = data?.error || data;
            throw new Error(err.message || err.error_user_title || `Meta API error (${res.status})`);
        }
        return data;
    }
    return {
        sendMessage(payload) {
            return request('/messages', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
        },
        getTemplates() {
            const url = `https://graph.facebook.com/${config.apiVersion || DEFAULT_API_VERSION}/${config.wabaId}/message_templates`;
            return fetch(url, { headers }).then((r) => r.json());
        },
        createTemplate(name, category, components, language) {
            const url = `https://graph.facebook.com/${config.apiVersion || DEFAULT_API_VERSION}/${config.wabaId}/message_templates`;
            return fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name, category, components, language }),
            }).then((r) => r.json());
        },
        deleteTemplate(name) {
            const url = `https://graph.facebook.com/${config.apiVersion || DEFAULT_API_VERSION}/${config.wabaId}/message_templates?name=${name}`;
            return fetch(url, { method: 'DELETE', headers }).then((r) => r.json());
        },
        registerWebhook(webhookUrl, verifyToken) {
            const url = `https://graph.facebook.com/${config.apiVersion || DEFAULT_API_VERSION}/${config.wabaId}/subscribed_apps`;
            return fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify({ subscribed_fields: ['messages', 'message_template_status_update'] }),
            }).then((r) => r.json());
        },
    };
}
//# sourceMappingURL=client.js.map