import mondaySdk from "monday-sdk-js";

const monday = mondaySdk();

class ShipRocketService {
    // monday session token → lets the backend resolve this account's Shiprocket credentials.
    private static async authHeaders(): Promise<Record<string, string>> {
        try {
            const res: any = await monday.get("sessionToken");
            return res?.data ? { Authorization: res.data } : {};
        } catch {
            return {};
        }
    }

    private static async post(path: string, body: object) {
        const response = await fetch(path, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(await this.authHeaders()) },
            body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error(`${path} failed: ${response.statusText}`);
        return response.json();
    }

    private static async get(path: string) {
        const response = await fetch(path, { headers: await this.authHeaders() });
        if (!response.ok) throw new Error(`${path} failed: ${response.statusText}`);
        return response.json();
    }

    static async checkCourierServiceability(
        pickupPincode: string,
        deliveryPincode: string,
        weight: number = 0.5,
        cod: number = 0,
        shipmentId?: string,
    ) {
        const params = new URLSearchParams({
            pickup_postcode: pickupPincode,
            delivery_postcode: deliveryPincode,
            weight: String(weight),
            cod: String(cod),
        });
        if (shipmentId) params.set("shipment_id", shipmentId);
        return this.get(`/api/shiprocket/serviceability?${params}`);
    }

    static async getPickupLocations(): Promise<any> {
        return this.get("/api/shiprocket/pickup-locations");
    }

    static async addPickupAddress(payload: {
        pickup_location: string;
        name: string;
        email: string;
        phone: string;
        address: string;
        address_2?: string;
        city: string;
        state: string;
        country: string;
        pin_code: string;
    }): Promise<any> {
        return this.post("/api/shiprocket/pickup/add", payload);
    }

    static async updatePickupLocation(shiprocketOrderId: number, pickupLocation: string): Promise<any> {
        return this.post("/api/shiprocket/pickup/update", {
            order_id: [shiprocketOrderId],
            pickup_location: pickupLocation,
        });
    }

    static async assignAWB(shipmentId: string, courierId: string): Promise<any> {
        return this.post("/api/shiprocket/awb/assign", {
            shipment_id: shipmentId,
            courier_id: courierId,
        });
    }

    static async createOrder(payload: object): Promise<any> {
        return this.post("/api/shiprocket/orders/create", payload);
    }

    static async generatePickup(shipmentId: string): Promise<any> {
        return this.post("/api/shiprocket/pickup/generate", {
            shipment_id: [shipmentId],
        });
    }

    static async cancelShipmentByAwbs(awbs: string[]): Promise<any> {
        return this.post("/api/shiprocket/shipment/cancel-awbs", { awbs });
    }

    static async trackShipment(shipmentId: string): Promise<any> {
        return this.get(`/api/shiprocket/track/shipment/${encodeURIComponent(shipmentId)}`);
    }

    static async trackByOrderId(orderId: string): Promise<any> {
        return this.get(`/api/shiprocket/track/order?order_id=${encodeURIComponent(orderId)}`);
    }
}

export default ShipRocketService;
