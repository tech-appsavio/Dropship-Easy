import { Request, Response } from 'express';
import MondayService from '../services/monday-service';

const SHIPROCKET_API_URL = 'https://apiv2.shiprocket.in/v1/external';

export class ShipmentCancelController {
    
    static async onStatusChange(req: Request, res: Response) {
        try {
            if (req.body.challenge) {
                return res.status(200).json({ challenge: req.body.challenge });
            }

            const { event } = req.body;
            
            if (event?.type !== 'update_column_value') {
                return res.status(200).json({ message: 'Not a column change event' });
            }

            const { boardId, pulseId, value } = event;
            const itemId = pulseId;
            const shortLivedToken = (req as any).session?.shortLivedToken;

            if (!shortLivedToken) {
                throw new Error('Missing authentication token');
            }

            const statusLabel = value?.label?.text || '';

            if (statusLabel.toLowerCase() !== 'cancel') {
                return res.status(200).json({ message: 'Status not cancel' });
            }

            // Fetch AWB code from Monday
            const awbCode = await ShipmentCancelController.fetchAWBCode(shortLivedToken, boardId, itemId);
            
            if (!awbCode) {
                throw new Error('AWB code not found');
            }

            // Authenticate with Shiprocket
            const shiprocketToken = await ShipmentCancelController.authenticateShiprocket();
            
            // Cancel shipment in Shiprocket
            await ShipmentCancelController.cancelShipment(awbCode, shiprocketToken);

            // Update Monday with cancellation status
            await ShipmentCancelController.updateMondayStatus(
                shortLivedToken,
                boardId,
                itemId,
                '✅ Shipment Cancelled'
            );

            return res.status(200).json({ 
                success: true, 
                message: 'Shipment cancelled successfully' 
            });

        } catch (error: any) {
            try {
                const shortLivedToken = (req as any).session?.shortLivedToken;
                const { boardId, pulseId } = req.body.event;
                if (shortLivedToken && boardId && pulseId) {
                    await ShipmentCancelController.updateMondayStatus(
                        shortLivedToken,
                        boardId,
                        pulseId,
                        `❌ Cancellation Failed: ${error.message}`
                    );
                }
            } catch (updateError) {
                // Failed to update Monday with error
            }
            
            return res.status(500).json({ error: error.message });
        }
    }

    private static async fetchAWBCode(token: string, boardId: string, itemId: string): Promise<string> {
        const mondayClient = new (await import('@mondaydotcomorg/api')).ApiClient({ token });
        
        const query = `query ($itemId: [ID!]) {
            items(ids: $itemId) {
                column_values {
                    id
                    text
                    column {
                        title
                    }
                }
            }
        }`;
        
        const response: any = await mondayClient.request(query, { itemId: [itemId] });
        const item = response?.items?.[0];
        
        if (!item) {
            throw new Error('Shipment not found');
        }
        
        const awbColumn = item.column_values.find((col: any) => 
            col.column?.title === 'AWB Code' || col.column?.title === 'AWB'
        );
        
        return awbColumn?.text || '';
    }

    private static async authenticateShiprocket(): Promise<string> {
        // Check if API token is directly provided
        const apiToken = process.env.SHIPROCKET_API_TOKEN;
        if (apiToken && apiToken !== 'paste_your_api_token_here') {
            return apiToken;
        }

        // Otherwise, authenticate with email/password
        const email = process.env.SHIPROCKET_EMAIL;
        const password = process.env.SHIPROCKET_PASSWORD;

        if (!email || !password) {
            throw new Error('Shiprocket credentials not configured');
        }

        const response = await fetch(`${SHIPROCKET_API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        if (!response.ok) {
            const errorData = await response.json();
            if (errorData.message?.includes('blocked')) {
                throw new Error('Shiprocket account is blocked. Please wait 1-2 hours or contact support.');
            }
            throw new Error(`Shiprocket auth failed: ${errorData.message || response.statusText}`);
        }

        const data = await response.json();
        return data.token;
    }

    private static async cancelShipment(awbCode: string, token: string) {
        const response = await fetch(`${SHIPROCKET_API_URL}/orders/cancel/shipment/awbs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ awbs: [awbCode] })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Shiprocket cancellation failed: ${error}`);
        }

        return await response.json();
    }

    private static async updateMondayStatus(
        token: string,
        boardId: string,
        itemId: string,
        statusMessage: string
    ) {
        const columns = await MondayService.getBoardColumns(token, boardId);
        const responseCol = columns.find((c: any) => c.title === 'Cancellation Response');

        if (responseCol) {
            await MondayService.changeMultipleColumnValues(token, boardId, itemId, {
                [responseCol.id]: statusMessage
            });
        }
    }
}
