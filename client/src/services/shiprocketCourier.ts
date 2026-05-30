class ShipRocketService {
    private static async post(path: string, body: object) {
        const response = await fetch(path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error(`${path} failed: ${response.statusText}`);
        return response.json();
    }

    static async checkCourierServiceability(pickupPincode: string, deliveryPincode: string, weight: number = 0.5, cod: number = 0) {
        const params = new URLSearchParams({
            pickup_postcode: pickupPincode,
            delivery_postcode: deliveryPincode,
            weight: String(weight),
            cod: String(cod),
        });
        const response = await fetch(`/api/shiprocket/serviceability?${params}`);
        if (!response.ok) throw new Error(`Serviceability check failed: ${response.statusText}`);
        return response.json();
    }

    static async getPickupLocations(): Promise<any> {
        const response = await fetch("/api/shiprocket/pickup-locations");
        if (!response.ok) throw new Error(`Failed to fetch pickup locations: ${response.statusText}`);
        return response.json();
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

    static async generatePickup(shipmentId: string): Promise<any> {
        return this.post("/api/shiprocket/pickup/generate", {
            shipment_id: [shipmentId],
        });
    }
}

export default ShipRocketService;
