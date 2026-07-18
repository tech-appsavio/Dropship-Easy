const WHATSAPP_API_URL = 'https://graph.facebook.com/v21.0';

export class WhatsappService {
    static async getTemplateContent(
        templateName: string,
        businessAccountId?: string
    ): Promise<{ text: string; language: string; buttons: { index: number; type: string; text: string }[] }> {
        const wabaId = businessAccountId || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
        const url = `${WHATSAPP_API_URL}/${wabaId}/message_templates?name=${templateName}`;
        const fallbackLanguage = process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en';

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
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
        buttons?: { index: number; payload: string }[]
    ) {
        const phoneId = fromPhone || process.env.WHATSAPP_PHONE_ID;
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
                'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
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
                    const { language } = await WhatsappService.getTemplateContent(templateName);
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
