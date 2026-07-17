// Meta Cloud API types

export interface MetaConfig {
  accessToken: string
  phoneNumberId: string
  wabaId: string
  apiVersion?: string
}

export interface TemplateMessage {
  name: string
  language: { code: string }
  components?: TemplateComponent[]
}

export interface TemplateComponent {
  type: 'header' | 'body' | 'footer' | 'button'
  parameters?: TemplateParameter[]
  buttons?: TemplateButton[]
}

export interface TemplateParameter {
  type: 'text' | 'currency' | 'date_time' | 'image' | 'document' | 'video'
  text?: string
  currency?: { fallback_value: string; code: string; amount_1000: number }
  date_time?: { fallback_value: string }
  image?: { link: string }
  document?: { link: string; filename?: string }
}

export interface TemplateButton {
  type: 'url' | 'quick_reply' | 'phone_number'
  text: string
  url?: string
  phone_number?: string
}

export interface TextMessage {
  body: string
  preview_url?: boolean
}

export interface SendMessageRequest {
  messaging_product: 'whatsapp'
  recipient_type?: 'individual'
  to: string
  type: 'text' | 'template' | 'image' | 'document' | 'audio' | 'video' | 'sticker' | 'interactive' | 'reaction' | 'location'
  text?: TextMessage
  template?: TemplateMessage
  image?: { link: string; caption?: string }
  document?: { link: string; filename?: string; caption?: string }
}

export interface SendMessageResponse {
  messaging_product: 'whatsapp'
  contacts: { input: string; wa_id: string }[]
  messages: { id: string }[]
}

export interface WebhookEntry {
  object: 'whatsapp_business_account'
  entry: {
    id: string
    changes: {
      field: 'messages'
      value: {
        messaging_product: 'whatsapp'
        metadata: { phone_number_id: string; display_phone_number: string }
        contacts?: { profile: { name: string }; wa_id: string }[]
        messages?: InboundMessage[]
        statuses?: MessageStatus[]
      }
    }[]
  }[]
}

export interface InboundMessage {
  from: string
  id: string
  timestamp: string
  type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'button' | 'interactive' | 'order' | 'system' | 'unknown'
  text?: { body: string }
  image?: { id: string; mime_type: string; sha256: string }
  document?: { id: string; filename: string; mime_type: string; sha256: string }
  button?: { payload: string; text: string }
  interactive?: { button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string } }
}

export interface MessageStatus {
  id: string
  recipient_id: string
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'pending' | 'warning'
  timestamp: string
  pricing?: { billable: boolean; pricing_model: string; category: string }
  conversation?: { id: string; origin: { type: string } }
  errors?: { code: number; title: string; message: string; error_data?: { details: string } }[]
}

export interface Template {
  id: string
  name: string
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'PENDING_DELETION' | 'DELETED' | 'DISABLED'
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION'
  language: string
  components: TemplateComponent[]
}
