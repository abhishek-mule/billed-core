import type { MetaConfig, SendMessageResponse, TemplateMessage, TextMessage } from './types'
import { createMetaClient } from './client'

export function createMetaSender(config: MetaConfig) {
  const client = createMetaClient(config)

  return {
    sendTemplate(
      to: string,
      templateName: string,
      variables?: Record<string, string>,
      language = 'en',
    ): Promise<SendMessageResponse> {
      const template: TemplateMessage = {
        name: templateName,
        language: { code: language },
      }

      if (variables) {
        const keys = Object.keys(variables)
        if (keys.length > 0) {
          template.components = [
            {
              type: 'body',
              parameters: keys.map((key) => ({
                type: 'text' as const,
                text: variables[key],
              })),
            },
          ]
        }
      }

      return client.sendMessage({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template,
      })
    },

    sendText(to: string, body: string, previewUrl = false): Promise<SendMessageResponse> {
      return client.sendMessage({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body, preview_url: previewUrl },
      })
    },

    sendImage(to: string, link: string, caption?: string): Promise<SendMessageResponse> {
      return client.sendMessage({
        messaging_product: 'whatsapp',
        to,
        type: 'image',
        image: { link, caption },
      })
    },

    sendDocument(to: string, link: string, filename: string, caption?: string): Promise<SendMessageResponse> {
      return client.sendMessage({
        messaging_product: 'whatsapp',
        to,
        type: 'document',
        document: { link, filename, caption },
      })
    },

    sendUtilityTemplate(
      to: string,
      templateName: string,
      variables: Record<string, string>,
      language = 'en',
    ): Promise<SendMessageResponse> {
      return this.sendTemplate(to, templateName, variables, language)
    },
  }
}
