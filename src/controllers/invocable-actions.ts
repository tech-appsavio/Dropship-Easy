import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { ApiClient } from '@mondaydotcomorg/api';
import MondayService from '../services/monday-service';
import { WhatsappService } from '../services/whatsapp-service';
import { getAllBoardsQuery } from '../queries.graphql';
import { pendingResponses } from './whatsapp-webhook';
import '../middlewares/authentication'; // Import to ensure type declaration is loaded

const recentRequests = new Set<string>();
const MESSAGE_BATCH_SIZE = 2;
const BATCH_DELAY_MS = 2000; // 2 seconds delay between batches

export class InvocableActions {
    static async actionSendMessage(req: Request, res: Response) {
        try {
            console.log('📨 actionSendMessage called');
            const { payload } = req.body;
            console.log('📦 Payload:', JSON.stringify(payload, null, 2));
            
            const { shortLivedToken } = req.session;
            if (!shortLivedToken) {
                console.log('❌ Missing shortLivedToken');
                throw new Error('Missing shortLivedToken');
            }
            console.log('✅ shortLivedToken present');

            const { 
                itemId, boardId, toPhoneColumn, templateId, fromPhone, message,
                messageColumn, wanidColumn, statusColumn
            } = payload.inputFields;
            
            console.log('📋 Input fields:', {
                itemId,
                boardId,
                toPhoneColumn,
                templateId,
                fromPhone,
                message,
                messageColumn,
                wanidColumn,
                statusColumn
            });

            // Check if multiple items selected
            const itemIds = Array.isArray(itemId) ? itemId : [itemId];
            console.log(`📊 Processing ${itemIds.length} item(s)`);
            
            if (itemIds.length > 1) {
                console.log('🔄 Multiple items detected, processing in batches');
                // Process in batches
                InvocableActions.processBatchMessages(itemIds, payload, shortLivedToken, res);
                return res.status(200).json({ 
                    success: true, 
                    message: `Processing ${itemIds.length} messages in batches of ${MESSAGE_BATCH_SIZE}` 
                });
            }

            console.log('📤 Processing single message');
            // Single message - process immediately
            await InvocableActions.processSingleMessage(itemIds[0], payload, shortLivedToken);
            console.log('✅ Message processed successfully');
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
        res: Response
    ) {
        // Process in background to avoid timeout
        setImmediate(async () => {
            for (let i = 0; i < itemIds.length; i += MESSAGE_BATCH_SIZE) {
                const batch = itemIds.slice(i, i + MESSAGE_BATCH_SIZE);
                console.log(`📤 Processing batch ${Math.floor(i / MESSAGE_BATCH_SIZE) + 1}: ${batch.length} messages`);
                
                // Process batch in parallel
                await Promise.all(
                    batch.map(itemId => 
                        InvocableActions.processSingleMessage(itemId, payload, shortLivedToken)
                            .catch(err => console.error(`❌ Error processing item ${itemId}:`, err.message))
                    )
                );
                
                // Delay before next batch (except for last batch)
                if (i + MESSAGE_BATCH_SIZE < itemIds.length) {
                    console.log(`⏳ Waiting ${BATCH_DELAY_MS}ms before next batch...`);
                    await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
                }
            }
            console.log(`✅ Completed processing ${itemIds.length} messages`);
        });
    }

    private static async processSingleMessage(
        itemId: string,
        payload: any,
        shortLivedToken: string
    ) {
        console.log(`🔹 processSingleMessage started for item: ${itemId}`);
        const {
            boardId, toPhoneColumn, templateId, fromPhone, message,
            messageColumn, wanidColumn, statusColumn
        } = payload.inputFields;

        // Deduplicate: ignore duplicate requests within 5 seconds
        const dedupKey = `${itemId}-${toPhoneColumn}-${Date.now() - (Date.now() % 5000)}`;
        if (recentRequests.has(dedupKey)) {
            console.log(`⏭️ Skipping duplicate request: ${dedupKey}`);
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
        
        console.log(`🎯 Template: ${finalTemplateName}, Phone Column: ${finalPhoneColumn}`);

        if (!itemId || !finalPhoneColumn) {
            console.log('❌ Missing itemId or toPhoneColumn');
            throw new Error('Missing itemId or toPhoneColumn');
        }

        console.log(`📞 Fetching phone number from column ${finalPhoneColumn}...`);
        const rawValue = await MondayService.getColumnValue(shortLivedToken, itemId, finalPhoneColumn);

        if (!rawValue) {
            console.log(`❌ No value found in column '${finalPhoneColumn}'`);
            throw new Error(`No value found in column '${finalPhoneColumn}' for item ${itemId}.`);
        }
        
        console.log(`📱 Raw phone value: ${rawValue}`);

        let phoneNumber = rawValue;
        try {
            const parsed = JSON.parse(rawValue);
            phoneNumber = parsed.phone || rawValue;
        } catch { /* not JSON, use as-is */ }

        const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
        console.log(`✅ Clean phone: ${cleanPhone}`);

        if (cleanPhone.length < 10) {
            console.log(`❌ Invalid phone number length: ${cleanPhone.length}`);
            throw new Error(`Invalid phone number: ${rawValue}`);
        }

        // Build the template body variables from the order item, in {{1}},{{2}},{{3}} order:
        //   {{1}} = order item name, {{2}} = "Total Price" column, {{3}} = connected line-item names
        const orderParams = await MondayService.getOrderWhatsappParams(shortLivedToken, itemId);
        const bodyParams: string[] = [orderParams.orderName, orderParams.totalPrice, orderParams.products];
        console.log(`🧩 Template body params: ${JSON.stringify(bodyParams)}`);

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
        let templateLanguage = process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en';
        let templateButtons: { index: number; type: string; text: string }[] = [];
        try {
            console.log(`📝 Fetching template content for: ${finalTemplateName}`);
            const template = await WhatsappService.getTemplateContent(finalTemplateName);
            templateLanguage = template.language;
            templateButtons = template.buttons || [];
            // Build a faithful log of what was sent by substituting each {{n}} with its param.
            actualMessageSent = bodyParams.reduce(
                (text, param, i) => text.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, 'g'), param),
                template.text
            );
            console.log(`✅ Template content fetched (language: ${templateLanguage})`);
        } catch (err: any) {
            console.log(`⚠️ Could not fetch template: ${err.message}`);
        }

        // Encode the order identity + intended status into each quick-reply button's
        // payload. The reply webhook reads this back to update the exact order —
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
            console.log(`🔘 Reply button payloads: ${replyButtons.map(b => b.payload).join(' | ')}`);
        }

        // Prepare logging values
        let statusMsg = 'Sent successfully';
        let wanid = '';

        try {
            console.log(`📤 Sending WhatsApp message to ${cleanPhone}...`);
            // Send WhatsApp message with body variables + order-tracking button payloads.
            const waResponse: any = await WhatsappService.sendTemplate(cleanPhone, finalTemplateName, templateLanguage, fromPhone, bodyParams, replyButtons);

            // Extract wamid from Meta response
            if (waResponse?.messages?.length > 0) {
                wanid = waResponse.messages[0].id;
                console.log(`✅ Message sent! WAMID: ${wanid}`);
            }

        } catch (waError: any) {
            console.log(`❌ WhatsApp send error: ${waError.message}`);
            statusMsg = `Failed: ${waError.message}`.substring(0, 255);
        }

        // Update Monday columns
        if (boardId) {
            console.log(`📝 Updating Monday columns one by one...`);

            // boardColumns was already fetched above (reused here to avoid a second call).
            console.log(`📋 Available columns:`, boardColumns.map((c: any) => `${c.title} (${c.id}, ${c.type})`).join(', '));
            const getColumnType = (colId: string) => {
                const col = boardColumns.find((c: any) => c.id === colId);
                return col?.type;
            };
            
            // Update each column separately to avoid batch errors
            try {
                if (messageColumn && actualMessageSent) {
                    const colId = resolveField(messageColumn);
                    const colType = getColumnType(colId);
                    console.log(`📝 Message column type: ${colType}`);
                    console.log(`📝 Message to store: "${actualMessageSent}"`);
                    
                    // Format value based on column type
                    let value;
                    if (colType === 'long_text') {
                        value = JSON.stringify({ text: actualMessageSent });
                    } else {
                        value = JSON.stringify(actualMessageSent);
                    }
                    
                    await MondayService.changeColumnValue(shortLivedToken, boardId, itemId, colId, value);
                    console.log(`✅ Message column updated`);
                }
            } catch (err: any) {
                console.error(`❌ Message column error:`, err.message);
            }
            
            try {
                if (wanidColumn && wanid) {
                    const colId = resolveField(wanidColumn);
                    const colType = getColumnType(colId);
                    console.log(`📝 WANID column type: ${colType}`);
                    console.log(`📝 WANID to store: "${wanid}"`);
                    console.log(`📏 WANID length: ${wanid.length} characters`);
                    
                    // Store last 30 chars (Monday column seems to have strict limit)
                    const shortWanid = wanid.length > 30 ? wanid.slice(-30) : wanid;
                    console.log(`📝 Storing shortened WANID: "${shortWanid}" (${shortWanid.length} chars)`);
                    
                    await MondayService.changeMultipleColumnValues(
                        shortLivedToken, 
                        boardId, 
                        itemId, 
                        { [colId]: { text: shortWanid } }
                    );
                    console.log(`✅ WANID column updated`);
                }
            } catch (err: any) {
                console.error(`❌ WANID column error:`, err.message);
            }
            
            try {
                if (statusColumn && statusMsg) {
                    console.log(`📝 Status to store: "${statusMsg}"`);
                    await MondayService.changeColumnValue(shortLivedToken, boardId, itemId, resolveField(statusColumn), JSON.stringify(statusMsg));
                    console.log(`✅ Status column updated`);
                }
            } catch (err: any) {
                console.error(`❌ Status column error:`, err.message);
            }

            // Fallback mapping for plain-text replies that carry no button payload
            // (statusColumnId was resolved above). Button replies do not rely on this.
            pendingResponses.set(cleanPhone, {
                token: shortLivedToken,
                boardId: String(boardId),
                itemId: String(itemId),
                statusColumnId: statusColumnId as string
            });
            console.log(`📌 Stored fallback webhook mapping for ${cleanPhone}`);
        }
        
        console.log(`✅ processSingleMessage completed for item: ${itemId}`);
    }

    static async getColumnsDropdownOptions(req: Request, res: Response) {
        try {
            console.log('🔍 Remote options request received');
            
            const boardId = req.body?.payload?.dependencyData?.boardId
                || req.body?.payload?.boardId;

            console.log('📋 Board ID:', boardId);
            
            if (!boardId) {
                console.log('❌ No boardId found');
                return res.status(200).json({ options: [] });
            }

            // Use the API token from environment for remote options
            const token = process.env.MONDAY_API_TOKEN;
            if (!token) {
                console.log('❌ No MONDAY_API_TOKEN in environment');
                return res.status(200).json({ options: [] });
            }

            const boardColumns = await MondayService.getBoardColumns(token, boardId);
            console.log(`✅ Found ${boardColumns.length} columns`);

            const options = boardColumns.map((col: any) => ({
                title: `${col.title} (${col.type})`,
                value: col.id
            }));

            console.log('📤 Returning options:', options.length);
            return res.status(200).json({ options });

        } catch (error: any) {
            console.error('❌ Error in getColumnsDropdownOptions:', error.message);
            return res.status(200).json({ options: [] });
        }
    }
}
