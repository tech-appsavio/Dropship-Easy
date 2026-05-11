import { SHIPROCKET_LOGIN_URL, SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD } from "../constants";

class ShipRocketService {
    /**
     * Ports Python generate_token method
     * Authenticates with ShipRocket and returns a JWT token
     */
    static async generateToken() {
        const payload = {
            email: SHIPROCKET_EMAIL,
            password: SHIPROCKET_PASSWORD
        };

        try {
            const response = await fetch(SHIPROCKET_LOGIN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error(`Auth failed: ${response.statusText}`);

            const data = await response.json();
            return {
                success: true,
                token: data.token,
                error: null
            };
        } catch (error: any) {
            return {
                success: false,
                token: null,
                error: error.message
            };
        }
    }

    /**
     * Ports Python check_courier_serviceability method
     * Checks which couriers can deliver from pickup to delivery pincode
     */
    static async checkCourierServiceability(pickupPincode: string, deliveryPincode: string, weight: number = 0.5, cod: number = 0) {
        const auth = await this.generateToken();

        if (!auth.success) {
            throw new Error(`ShipRocket Authentication Error: ${auth.error}`);
        }

        const url = `https://apiv2.shiprocket.in/v1/external/courier/serviceability/?pickup_postcode=${pickupPincode}&delivery_postcode=${deliveryPincode}&weight=${weight}&cod=${cod}`;

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${auth.token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) throw new Error(`Serviceability check failed: ${response.statusText}`);

            return await response.json();
        } catch (error: any) {
            console.error("ShipRocket API Error:", error.message);
            throw error;
        }
    }
}

export default ShipRocketService;