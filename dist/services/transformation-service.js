"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class TransformationService {
    static transformText(value, type) {
        switch (type) {
            case 'TO_UPPER_CASE':
                return value.toUpperCase();
            case 'TO_LOWER_CASE':
                return value.toLowerCase();
            default:
                return value.toUpperCase();
        }
    }
}
exports.default = TransformationService;
