"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMetaSender = createMetaSender;
const client_1 = require("./client");
function createMetaSender(config) {
    const client = (0, client_1.createMetaClient)(config);
    return {
        sendTemplate(to, templateName, variables, language = 'en') {
            const template = {
                name: templateName,
                language: { code: language },
            };
            if (variables) {
                const keys = Object.keys(variables);
                if (keys.length > 0) {
                    template.components = [
                        {
                            type: 'body',
                            parameters: keys.map((key) => ({
                                type: 'text',
                                text: variables[key],
                            })),
                        },
                    ];
                }
            }
            return client.sendMessage({
                messaging_product: 'whatsapp',
                to,
                type: 'template',
                template,
            });
        },
        sendText(to, body, previewUrl = false) {
            return client.sendMessage({
                messaging_product: 'whatsapp',
                to,
                type: 'text',
                text: { body, preview_url: previewUrl },
            });
        },
        sendImage(to, link, caption) {
            return client.sendMessage({
                messaging_product: 'whatsapp',
                to,
                type: 'image',
                image: { link, caption },
            });
        },
        sendDocument(to, link, filename, caption) {
            return client.sendMessage({
                messaging_product: 'whatsapp',
                to,
                type: 'document',
                document: { link, filename, caption },
            });
        },
        sendUtilityTemplate(to, templateName, variables, language = 'en') {
            return this.sendTemplate(to, templateName, variables, language);
        },
    };
}
//# sourceMappingURL=send.js.map