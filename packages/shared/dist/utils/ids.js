"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateId = generateId;
exports.resetIdCounter = resetIdCounter;
let counter = 0;
function generateId(prefix = 'test') {
    counter++;
    return `${prefix}-${Date.now()}-${counter}`;
}
function resetIdCounter() {
    counter = 0;
}
//# sourceMappingURL=ids.js.map