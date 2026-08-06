import { getAccountSettings } from './account-store';

const WHATSAPP_API_URL = 'https://graph.facebook.com/v21.0';

// Resolves WhatsApp credentials for an account STRICTLY from that account's saved Settings.
// This is a multi-tenant marketplace app: credentials must NEVER fall back to the app's own
// env vars, or one tenant would silently send through the developer's WhatsApp account. An
// account that hasn't configured WhatsApp gets empty values here and a clear error at the
// call site telling them to fill in Account Settings.
async function waConfig(accountId?: string) {
    const s = accountId ? await getAccountSettings(accountId) : null;
    return {
        accessToken: s?.whatsappAccessToken,
        phoneId: s?.whatsappPhoneId,
        businessAccountId: s?.whatsappBusinessAccountId,
        templateLanguage: s?.whatsappTemplateLanguage || 'en',
    };
}

export class WhatsappService {
    static async getTemplateContent(
        templateName: string,
        accountId?: string
    ): Promise<{ text: string; language: string; buttons: { index: number; type: string; text: string }[] }> {
        const cfg = await waConfig(accountId);
        if (!cfg.businessAccountId || !cfg.accessToken) {
            throw new Error("WhatsApp is not configured for this account. Add the Access Token and Business Account ID in Account Settings → WhatsApp.");
        }
        const url = `${WHATSAPP_API_URL}/${cfg.businessAccountId}/message_templates?name=${templateName}`;
        const fallbackLanguage = cfg.templateLanguage;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${cfg.accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch template: ${response.statusText}`);
        }

        const data = await response.json();
        if (data?.data?.length > 0) {
            const template = data.data[0];
            const bodyComponent = template.components?.find((c: any) => c.type === 'BODY');
            const buttonsComponent = template.components?.find((c: any) => c.type === 'BUTTONS');
            const buttons = (buttonsComponent?.buttons || []).map((b: any, index: number) => ({
                index,
                type: b.type || '',
                text: b.text || ''
            }));
            // Use the template's actual registered language so the send call requests
            // the exact language variant Meta has approved (avoids "template does not
            // exist in <lang>" errors from guessing en / en_US).
            return {
                text: bodyComponent?.text || templateName,
                language: template.language || fallbackLanguage,
                buttons
            };
        }

        return { text: templateName, language: fallbackLanguage, buttons: [] };
    }

    static async sendTemplate(
        toPhone: string,
        templateName: string,
        languageCode: string = 'en',
        fromPhone?: string,
        bodyParams?: string[],
        buttons?: { index: number; payload: string }[],
        accountId?: string
    ) {
        const cfg = await waConfig(accountId);
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

        const payload: any = {
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
                parameters: bodyParams.map(value => ({ type: 'text', text: value ?? '' }))
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

        let response = await postPayload();

        // If the send fails because the template isn't registered in the requested
        // language, look up the template's actual language from Meta and retry once
        // with the correct code.
        if (!response.ok) {
            const errorText = await response.clone().text();
            const isLanguageError = /does not exist in/i.test(errorText);
            if (isLanguageError) {
                let correctedLanguage: string | undefined;
                try {
                    const { language } = await WhatsappService.getTemplateContent(templateName, accountId);
                    correctedLanguage = language;
                } catch { /* fall through to en_US guess below */ }

                const retryCode = correctedLanguage && correctedLanguage !== payload.template.language.code
                    ? correctedLanguage
                    : (payload.template.language.code === 'en' ? 'en_US' : undefined);

                if (retryCode) {
                    payload.template.language.code = retryCode;
                    response = await postPayload();
                }
            }
        }

        if (!response.ok) {
            const error = await response.text();
            const parsed = JSON.parse(error);
            const details = parsed?.error?.error_data?.details || parsed?.error?.message || error;
            throw new Error(`WhatsApp API Error: ${details}`);
        }

        return await response.json();
    }
}
