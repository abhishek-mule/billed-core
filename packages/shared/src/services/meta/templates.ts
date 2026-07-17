import type { MetaConfig, Template } from './types'
import { createMetaClient } from './client'

export function createMetaTemplateManager(config: MetaConfig) {
  const client = createMetaClient(config)

  return {
    async list(): Promise<Template[]> {
      const res = await client.getTemplates()
      return (res.data || []) as Template[]
    },

    async findByName(name: string): Promise<Template | null> {
      const templates = await this.list()
      return templates.find((t) => t.name === name) || null
    },

    async getApproved(): Promise<Template[]> {
      const templates = await this.list()
      return templates.filter((t) => t.status === 'APPROVED')
    },

    async create(
      name: string,
      category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION',
      components: any[],
      language = 'en',
    ): Promise<any> {
      return client.createTemplate(name, category, components, language)
    },

    async remove(name: string): Promise<any> {
      return client.deleteTemplate(name)
    },
  }
}
