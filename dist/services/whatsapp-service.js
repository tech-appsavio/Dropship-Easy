"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsappService = void 0;
const account_store_1 = require("./account-store");
const WHATSAPP_API_URL = 'https://graph.facebook.com/v21.0';
// Resolves WhatsApp credentials for an account STRICTLY from that account's saved Settings.
// This is a multi-tenant marketplace app: credentials must NEVER fall back to the app's own
// env vars, or one tenant would silently send through the developer's WhatsApp account. An
// account that hasn't configured WhatsApp gets empty values here and a clear error at the
// call site telling them to fill in Account Settings.
function waConfig(accountId) {
    return __awaiter(this, void 0, void 0, function* () {
        const s = accountId ? yield (0, account_store_1.getAccountSettings)(accountId) : null;
        return {
            accessToken: s === null || s === void 0 ? void 0 : s.whatsappAccessToken,
            phoneId: s === null || s === void 0 ? void 0 : s.whatsappPhoneId,
            businessAccountId: s === null || s === void 0 ? void 0 : s.whatsappBusinessAccountId,
            templateLanguage: (s === null || s === void 0 ? void 0 : s.whatsappTemplateLanguage) || 'en',
        };
    });
}
class WhatsappService {
    static getTemplateContent(templateName, accountId) {
        var _a, _b, _c;
        return __awaiter(this, void 0, void 0, function* () {
            const cfg = yield waConfig(accountId);
            if (!cfg.businessAccountId || !cfg.accessToken) {
                throw new Error("WhatsApp is not configured for this account. Add the Access Token and Business Account ID in Account Settings → WhatsApp.");
            }
            const url = `${WHATSAPP_API_URL}/${cfg.businessAccountId}/message_templates?name=${templateName}`;
            const fallbackLanguage = cfg.templateLanguage;
            const response = yield fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${cfg.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch template: ${response.statusText}`);
            }
            const data = yield response.json();
            if (((_a = data === null || data === void 0 ? void 0 : data.data) === null || _a === void 0 ? void 0 : _a.length) > 0) {
                const template = data.data[0];
                const bodyComponent = (_b = template.components) === null || _b === void 0 ? void 0 : _b.find((c) => c.type === 'BODY');
                const buttonsComponent = (_c = template.components) === null || _c === void 0 ? void 0 : _c.find((c) => c.type === 'BUTTONS');
                const buttons = ((buttonsComponent === null || buttonsComponent === void 0 ? void 0 : buttonsComponent.buttons) || []).map((b, index) => ({
                    index,
                    type: b.type || '',
                    text: b.text || ''
                }));
                // Use the template's actual registered language so the send call requests
                // the exact language variant Meta has approved (avoids "template does not
                // exist in <lang>" errors from guessing en / en_US).
                return {
                    text: (bodyComponent === null || bodyComponent === void 0 ? void 0 : bodyComponent.text) || templateName,
                    language: template.language || fallbackLanguage,
                    buttons
                };
            }
            return { text: templateName, language: fallbackLanguage, buttons: [] };
        });
    }
    static sendTemplate(toPhone, templateName, languageCode = 'en', fromPhone, bodyParams, buttons, accountId) {
        var _a, _b, _c;
        return __awaiter(this, void 0, void 0, function* () {
            const cfg = yield waConfig(accountId);
            // Prefer the recipe-provided sender, fall back to the account's saved Phone Number ID.
            // Treat blank/whitespace as "not set" so we don't send an undefined id to Meta (which
            // returns the confusing "Object with ID 'undefined' does not exist" error).
            const phoneId = (typeof fromPhone === 'string' && fromPhone.trim()) ? fromPhone.trim() : cfg.phoneId;
            if (!phoneId) {
                throw new Error("WhatsApp Phone Number ID is not configured. Add it in Account Settings → WhatsApp → 'Phone Number ID'.");
            }
            if (!cfg.accessToken) {
                throw new Error("WhatsApp Access Token is not configured. Add it in Account Settings → WhatsApp → 'Access Token'.");
            }
            const url = `${WHATSAPP_API_URL}/${phoneId}/messages`;
            const payload = {
                messaging_product: 'whatsapp',
                to: toPhone,
                type: 'template',
                template: {
                    name: templateName,
                    language: { code: languageCode },
                    components: []
                }
            };
            // Fill the template body variables ({{1}}, {{2}}, ...) in order. The count
            // must match the number of variables the template was created with, or Meta
            // rejects the send with a parameter-count error.
            if (bodyParams && bodyParams.length > 0) {
                payload.template.components.push({
                    type: 'body',
                    parameters: bodyParams.map(value => ({ type: 'text', text: value !== null && value !== void 0 ? value : '' }))
                });
            }
            // Attach a dynamic payload to each quick-reply button so the reply webhook can
            // identify exactly which order the customer responded to — independent of phone
            // number or time elapsed (Meta echoes this payload back whenever the button is tapped).
            if (buttons && buttons.length > 0) {
                for (const btn of buttons) {
                    payload.template.components.push({
                        type: 'button',
                        sub_type: 'quick_reply',
                        index: String(btn.index),
                        parameters: [{ type: 'payload', payload: btn.payload }]
                    });
                }
            }
            const postPayload = () => fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${cfg.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            let response = yield postPayload();
            // If the send fails because the template isn't registered in the requested
            // language, look up the template's actual language from Meta and retry once
            // with the correct code.
            if (!response.ok) {
                const errorText = yield response.clone().text();
                const isLanguageError = /does not exist in/i.test(errorText);
                if (isLanguageError) {
                    let correctedLanguage;
                    try {
                        const { language } = yield WhatsappService.getTemplateContent(templateName, accountId);
                        correctedLanguage = language;
                    }
                    catch ( /* fall through to en_US guess below */_d) { /* fall through to en_US guess below */ }
                    const retryCode = correctedLanguage && correctedLanguage !== payload.template.language.code
                        ? correctedLanguage
                        : (payload.template.language.code === 'en' ? 'en_US' : undefined);
                    if (retryCode) {
                        payload.template.language.code = retryCode;
                        response = yield postPayload();
                    }
                }
            }
            if (!response.ok) {
                const error = yield response.text();
                const parsed = JSON.parse(error);
                const details = ((_b = (_a = parsed === null || parsed === void 0 ? void 0 : parsed.error) === null || _a === void 0 ? void 0 : _a.error_data) === null || _b === void 0 ? void 0 : _b.details) || ((_c = parsed === null || parsed === void 0 ? void 0 : parsed.error) === null || _c === void 0 ? void 0 : _c.message) || error;
                throw new Error(`WhatsApp API Error: ${details}`);
            }
            return yield response.json();
        });
    }
}
exports.WhatsappService = WhatsappService;
