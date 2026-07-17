import type { MetaConfig, SendMessageRequest, SendMessageResponse } from './types'

const DEFAULT_API_VERSION = 'v22.0'

function baseUrl(config: MetaConfig): string {
  return `https://graph.facebook.com/${config.apiVersion || DEFAULT_API_VERSION}/${config.phoneNumberId}`
}

export function createMetaClient(config: MetaConfig) {
  const headers = {
    Authorization: `Bearer ${config.accessToken}`,
    'Content-Type': 'application/json',
  }

  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${baseUrl(config)}${path}`
    const res = await fetch(url, { ...options, headers: { ...headers, ...(options.headers as Record<string, string>) } })
    const data = await res.json()
    if (!res.ok) {
      const err = (data as any)?.error || data
      throw new Error(err.message || err.error_user_title || `Meta API error (${res.status})`)
    }
    return data as T
  }

  return {
    sendMessage(payload: SendMessageRequest): Promise<SendMessageResponse> {
      return request<SendMessageResponse>('/messages', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    },

    getTemplates(): Promise<{ data: any[] }> {
      const url = `https://graph.facebook.com/${config.apiVersion || DEFAULT_API_VERSION}/${config.wabaId}/message_templates`
      return fetch(url, { headers }).then((r) => r.json())
    },

    createTemplate(name: string, category: string, components: any[], language: string): Promise<any> {
      const url = `https://graph.facebook.com/${config.apiVersion || DEFAULT_API_VERSION}/${config.wabaId}/message_templates`
      return fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name, category, components, language }),
      }).then((r) => r.json())
    },

    deleteTemplate(name: string): Promise<any> {
      const url = `https://graph.facebook.com/${config.apiVersion || DEFAULT_API_VERSION}/${config.wabaId}/message_templates?name=${name}`
      return fetch(url, { method: 'DELETE', headers }).then((r) => r.json())
    },

    registerWebhook(webhookUrl: string, verifyToken: string): Promise<any> {
      const url = `https://graph.facebook.com/${config.apiVersion || DEFAULT_API_VERSION}/${config.wabaId}/subscribed_apps`
      return fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ subscribed_fields: ['messages', 'message_template_status_update'] }),
      }).then((r) => r.json())
    },
  }
}
