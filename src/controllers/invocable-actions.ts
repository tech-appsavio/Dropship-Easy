import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { ApiClient } from '@mondaydotcomorg/api';
import MondayService from '../services/monday-service';
import { WhatsappService } from '../services/whatsapp-service';
import { getAccountConfig } from '../services/account-store';
import { logAccountError } from '../services/error-log';
import { getAllBoardsQuery } from '../queries.graphql';
import { pendingResponses, pendingByItem } from './whatsapp-webhook';
import '../middlewares/authentication'; // Import to ensure type declaration is loaded

const recentRequests = new Set<string>();
const MESSAGE_BATCH_SIZE = 2;
const BATCH_DELAY_MS = 2000; // 2 seconds delay between batches

// Mask a phone number for logging keep only the last 2 digits so logs never contain
// full PII. e.g. "919876543210" → "…10".
const maskPhone = (p: string): string => {
    const d = String(p || "").replace(/\s/g, "");
    return d.length <= 2 ? "…" : `…${d.slice(-2)}`;
};

export class InvocableActions {
    static async actionSendMessage(req: Request, res: Response) {
        try {
            const { payload } = req.body;
            
            const { shortLivedToken, accountId } = req.session;
            if (!shortLivedToken) {
                throw new Error('Missing shortLivedToken');
            }

            const { 
                itemId, boardId, toPhoneColumn, templateId, fromPhone, message,
                messageColumn, wanidColumn, statusColumn
            } = payload.inputFields;
            

            // Check if multiple items selected
            const itemIds = Array.isArray(itemId) ? itemId : [itemId];
            
            if (itemIds.length > 1) {
                // Process in batches
                InvocableActions.processBatchMessages(itemIds, payload, shortLivedToken, accountId, res);
                return res.status(200).json({
                    success: true,
                    message: `Processing ${itemIds.length} messages in batches of ${MESSAGE_BATCH_SIZE}`
                });
            }

            // Single message - process immediately
            await InvocableActions.processSingleMessage(itemIds[0], payload, shortLivedToken, accountId);
            return res.status(200).json({ success: true });

        } catch (error: any) {
            console.error('❌ actionSendMessage error:', error.message);
            return res.status(200).json({ success: false, error: error.message });
        }
    }

    private static async processBatchMessages(
        itemIds: string[],
        payload: any,
        shortLivedToken: string,
        accountId: string | undefined,
        res: Response
    ) {
        // Process in background to avoid timeout
        setImmediate(async () => {
            for (let i = 0; i < itemIds.length; i += MESSAGE_BATCH_SIZE) {
                const batch = itemIds.slice(i, i + MESSAGE_BATCH_SIZE);

                // Process batch in parallel
                await Promise.all(
                    batch.map(itemId =>
                        InvocableActions.processSingleMessage(itemId, payload, shortLivedToken, accountId)
                            .catch(err => console.error(`❌ Error processing item ${itemId}:`, err.message))
                    )
                );
                
                // Delay before next batch (except for last batch)
                if (i + MESSAGE_BATCH_SIZE < itemIds.length) {
                    await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
                }
            }
        });
    }

    private static async processSingleMessage(
        itemId: string,
        payload: any,
        shortLivedToken: string,
        accountId?: string
    ) {
        const {
            boardId, toPhoneColumn, templateId, fromPhone, message,
            messageColumn, wanidColumn, statusColumn
        } = payload.inputFields;

        // Deduplicate: ignore duplicate requests within 5 seconds
        const dedupKey = `${itemId}-${toPhoneColumn}-${Date.now() - (Date.now() % 5000)}`;
        if (recentRequests.has(dedupKey)) {
            return;
        }
        recentRequests.add(dedupKey);
        setTimeout(() => recentRequests.delete(dedupKey), 5000);

        // Extract string value from dropdown objects
        const resolveField = (field: any) => {
            if (!field) return undefined;
            if (typeof field === 'object' && field.value) return field.value;
            return field;
        };

        const finalTemplateName = resolveField(templateId) || 'hello_world';
        const finalPhoneColumn = resolveField(toPhoneColumn);
        // fromPhone may arrive as a dropdown object ({value}), an empty string, or be omitted.
        // Unwrap it to a plain string (or undefined) so the service can cleanly fall back to
        // the account's saved WhatsApp Phone Number ID instead of sending "[object Object]"
        // or an undefined id to Meta.
        const finalFromPhone = resolveField(fromPhone);
        

        if (!itemId || !finalPhoneColumn) {
            throw new Error('Missing itemId or toPhoneColumn');
        }

        const rawValue = await MondayService.getColumnValue(shortLivedToken, itemId, finalPhoneColumn);

        if (!rawValue) {
            throw new Error(`No value found in column '${finalPhoneColumn}' for item ${itemId}.`);
        }
        

        let phoneNumber = rawValue;
        try {
            const parsed = JSON.parse(rawValue);
            phoneNumber = parsed.phone || rawValue;
        } catch { /* not JSON, use as-is */ }

        const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');

        if (cleanPhone.length < 10) {
            throw new Error(`Invalid phone number: ${rawValue}`);
        }

        // Build the template body variables from the order item, in {{1}},{{2}},{{3}} order:
        //   {{1}} = order item name, {{2}} = "Total Price" column, {{3}} = connected line-item names
        // Resolve THIS account's line-items board so "products" isn't scanned on the wrong
        // board (env fallback) and come back empty.
        const lineItemsBoardId = accountId ? (await getAccountConfig(accountId))?.boards?.lineItems : undefined;
        const orderParams = await MondayService.getOrderWhatsappParams(shortLivedToken, itemId, lineItemsBoardId);
        // WhatsApp Cloud API rejects EMPTY body parameters ("Parameter of type text is
        // missing text value"), so substitute a dash for any blank value.
        const safe = (v: string) => (v && v.trim() ? v.trim() : '-');
        const bodyParams: string[] = [safe(orderParams.orderName), safe(orderParams.totalPrice), safe(orderParams.products)];

        // Resolve the order's board columns + Status column up front, so the Status
        // column id can be embedded in the reply-button payloads below.
        let boardColumns: any[] = [];
        let statusColumnId = 'status';
        if (boardId) {
            boardColumns = await MondayService.getBoardColumns(shortLivedToken, boardId);
            const statusColData = boardColumns.find((col: any) => (col.title || '').toLowerCase() === 'status');
            statusColumnId = (resolveField(payload.inputFields?.statusColumnId) || statusColData?.id || 'status') as string;
        }

        // Fetch actual template content from WhatsApp API
        let actualMessageSent = message || '';
        let templateLanguage = 'en'; // default; overwritten by the template's actual language below
        let templateButtons: { index: number; type: string; text: string }[] = [];
        try {
            const template = await WhatsappService.getTemplateContent(finalTemplateName, accountId);
            templateLanguage = template.language;
            templateButtons = template.buttons || [];
            // Build a faithful log of what was sent by substituting each {{n}} with its param.
            actualMessageSent = bodyParams.reduce(
                (text, param, i) => text.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, 'g'), param),
                template.text
            );
        } catch (err: any) {
        }

        // Encode the order identity + intended status into each quick-reply button's
        // payload. The reply webhook reads this back to update the exact order
        // independent of phone-number reuse or how long the customer takes to respond.
        const orderRef = { i: String(itemId), b: String(boardId ?? ''), s: statusColumnId };
        const replyButtons = templateButtons
            .filter(b => String(b.type).toUpperCase() === 'QUICK_REPLY')
            .map(b => {
                const label = (b.text || '').toLowerCase();
                const action = /(cancel|reject|\bno\b)/.test(label) ? 'Cancelled'
                    : /(confirm|approve|\byes\b)/.test(label) ? 'Confirmed'
                    : b.text;
                return { index: b.index, payload: JSON.stringify({ ...orderRef, a: action }) };
            });
        if (replyButtons.length > 0) {
        }

        // Prepare logging values
        let statusMsg = 'Sent successfully';
        let wanid = '';

        try {
            // Send WhatsApp message with body variables + order-tracking button payloads.
            const waResponse: any = await WhatsappService.sendTemplate(cleanPhone, finalTemplateName, templateLanguage, finalFromPhone, bodyParams, replyButtons, accountId);

            // Extract wamid from Meta response
            if (waResponse?.messages?.length > 0) {
                wanid = waResponse.messages[0].id;
            }

        } catch (waError: any) {
            statusMsg = `Failed: ${waError.message}`.substring(0, 255);
            logAccountError(accountId, {
                stage: 'WhatsApp', severity: 'Error',
                message: `WhatsApp message failed to send: ${waError.message}`,
                technicalDetails: String(waError?.stack || waError),
                orderId: String(itemId),
                orderItemId: String(itemId), // itemId IS the order's monday item id → link it
                suggestedSolution: 'Check the WhatsApp credentials in Account Settings and that the customer phone number is valid, then resend.',
                retry: true,
            });
        }

        // Update Monday columns
        if (boardId) {

            // boardColumns was already fetched above (reused here to avoid a second call).
            const getColumnType = (colId: string) => {
                const col = boardColumns.find((c: any) => c.id === colId);
                return col?.type;
            };
            
            // Update each column separately to avoid batch errors
            try {
                if (messageColumn && actualMessageSent) {
                    const colId = resolveField(messageColumn);
                    const colType = getColumnType(colId);
                    
                    // Format value based on column type
                    let value;
                    if (colType === 'long_text') {
                        value = JSON.stringify({ text: actualMessageSent });
                    } else {
                        value = JSON.stringify(actualMessageSent);
                    }
                    
                    await MondayService.changeColumnValue(shortLivedToken, boardId, itemId, colId, value);
                }
            } catch (err: any) {
                console.error(`❌ Message column error:`, err.message);
            }
            
            try {
                if (wanidColumn && wanid) {
                    const colId = resolveField(wanidColumn);
                    const colType = getColumnType(colId);
                    // A text column takes a plain string; long_text needs {"text": "..."}.
                    // Previously this always used the {text} form, which is invalid for a
                    // text column, so the WANID silently never saved.
                    const columnValues = colType === 'long_text'
                        ? { [colId]: { text: wanid } }
                        : { [colId]: wanid };
                    await MondayService.changeMultipleColumnValues(shortLivedToken, boardId, itemId, columnValues);
                }
            } catch (err: any) {
                console.error(`❌ WANID column error:`, err.message);
            }
            
            try {
                if (statusColumn && statusMsg) {
                    const colId = resolveField(statusColumn);
                    const colType = getColumnType(colId);
                    // long_text needs {"text": "..."}, plain text/other take the raw string.
                    const value = colType === 'long_text'
                        ? JSON.stringify({ text: statusMsg })
                        : JSON.stringify(statusMsg);
                    await MondayService.changeColumnValue(shortLivedToken, boardId, itemId, colId, value);
                }
            } catch (err: any) {
                console.error(`❌ Status column error:`, err.message);
            }

            // Capture the account-scoped token against this order so the reply webhook
            // (which has no monday session) can update the correct order dynamically.
            pendingByItem.set(String(itemId), shortLivedToken);

            // Fallback mapping for plain-text replies that carry no button payload
            // (statusColumnId was resolved above). Button replies do not rely on this.
            pendingResponses.set(cleanPhone, {
                token: shortLivedToken,
                boardId: String(boardId),
                itemId: String(itemId),
                statusColumnId: statusColumnId as string
            });
        }
        
    }

    static async getColumnsDropdownOptions(req: Request, res: Response) {
        try {
            
            const boardId = req.body?.payload?.dependencyData?.boardId
                || req.body?.payload?.boardId;

            
            if (!boardId) {
                return res.status(200).json({ options: [] });
            }

            // Use the account-scoped short-lived token from the signed monday request
            // (same dynamic approach the Multi-Order Processing views use) no hardcoded token.
            const token = req.session?.shortLivedToken;
            if (!token) {
                return res.status(200).json({ options: [] });
            }

            const boardColumns = await MondayService.getBoardColumns(token, boardId);

            const options = boardColumns.map((col: any) => ({
                title: `${col.title} (${col.type})`,
                value: col.id
            }));

            return res.status(200).json({ options });

        } catch (error: any) {
            console.error('❌ Error in getColumnsDropdownOptions:', error.message);
            return res.status(200).json({ options: [] });
        }
    }
}
