"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMetaTemplateManager = createMetaTemplateManager;
const client_1 = require("./client");
function createMetaTemplateManager(config) {
    const client = (0, client_1.createMetaClient)(config);
    return {
        async list() {
            const res = await client.getTemplates();
            return (res.data || []);
        },
        async findByName(name) {
            const templates = await this.list();
            return templates.find((t) => t.name === name) || null;
        },
        async getApproved() {
            const templates = await this.list();
            return templates.filter((t) => t.status === 'APPROVED');
        },
        async create(name, category, components, language = 'en') {
            return client.createTemplate(name, category, components, language);
        },
        async remove(name) {
            return client.deleteTemplate(name);
        },
    };
}
//# sourceMappingURL=templates.js.map