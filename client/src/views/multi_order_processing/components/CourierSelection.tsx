// src/views/multi_order_processing/components/CourierSelection.tsx
import React, { useState, useMemo } from "react";
import { Dropdown, Button, Loader, Checkbox } from "@vibe/core";
import { useCourierSelectionData } from "../hooks/useCourierSelectionData";
import { ORDER_ITEM_BOARD_ID, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP, SUPPLIER_ALL_COLUMN_IDS_MAP } from "../constants";
import ShipRocketService from "../../../services/shiprocketCourier";
import mondaySdk from "monday-sdk-js";

const monday = mondaySdk();

// Column IDs to display in the line items table — add more here as needed
const COURIER_OLI_COLUMN_IDS = [
    ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.ORDER,
    ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SUPPLIER,
    ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COURIERNAME,
    ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SUPPLIERMANIFEST,
];

export const CourierSelection = ({ selectedOrderIds }: { selectedOrderIds: string[] }) => {
    const { loading, ordersWithLineItems, allSuppliers, boardColumns } = useCourierSelectionData(selectedOrderIds);
    const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
    const [selectedPostalCode, setSelectedPostalCode] = useState<any>(null);
    const [selectedCourier, setSelectedCourier] = useState<any>(null);
    const [selectedLineItemIds, setSelectedLineItemIds] = useState<Set<string>>(new Set());
    const [isUpdating, setIsUpdating] = useState(false);

    // Inside the CourierSelection component, add these states:
    const [courierOptions, setCourierOptions] = useState<any[]>([]);
    const [isCouriersLoading, setIsCouriersLoading] = useState(false);
    const [courierError, setCourierError] = useState<string | null>(null);

    // 1. Get postal codes for the selected supplier
    const deliveryPostalCodes = useMemo(() => {
        if (!selectedSupplier) return [];
        const codes = new Set<string>();
        ordersWithLineItems.forEach((o) => {
            const hasSupplier = o.lineItems.some((li: any) => li.supplierId === selectedSupplier.value);
            if (hasSupplier && o.deliveryCode) codes.add(o.deliveryCode);
        });
        return Array.from(codes).map((code) => ({ label: code, value: code }));
    }, [selectedSupplier, ordersWithLineItems]);

    // 2. Filter line items based on Supplier AND Postal Code
    const filteredLineItems = useMemo(() => {
        if (!selectedSupplier) return [];
        const items: any[] = [];
        ordersWithLineItems.forEach((o) => {
            // If postal code is selected, filter by both; otherwise filter by supplier only
            const postalMatch = !selectedPostalCode || o.deliveryCode === selectedPostalCode.value;
            if (postalMatch) {
                o.lineItems.forEach((li: any) => {
                    if (li.supplierId === selectedSupplier.value) items.push(li);
                });
            }
        });
        return items;
    }, [selectedSupplier, selectedPostalCode, ordersWithLineItems]);

    // 3. Shiprocket Courier API Method
    const queryCouriers = async (deliveryZip: string) => {
        setIsCouriersLoading(true);
        setCourierError(null);
        setCourierOptions([]);

        try {
            const item = filteredLineItems.find((li) => li.supplierId === selectedSupplier.value);
            if (!item) {
                setCourierError("No item data found for this selection.");
                return;
            }

            // Helper to extract value regardless of column type
            const getRobustValue = (colId: string) => {
                const cv = item.column_values?.find((c: any) => c.id === colId);
                if (!cv) return null;

                // 1. Try display_value (standard for mirrors/status/tags)
                if (cv.display_value) return cv.display_value;

                // 2. Try text (standard for text/numbers)
                if (cv.text) return cv.text;

                // 3. Try parsing 'value' (standard for numeric/complex types)
                if (cv.value) {
                    try {
                        const parsed = JSON.parse(cv.value);
                        // For Numeric columns, value is often just the stringified number
                        return typeof parsed === "object" ? parsed.value || parsed.text : String(parsed);
                    } catch {
                        return cv.value;
                    }
                }
                return null;
            };

            // 1. Pickup Pincode (Supplier Postal Code)
            const pickupZip = getRobustValue(SUPPLIER_ALL_COLUMN_IDS_MAP.POSTALCODE);

            // 2. Weight (Total Product Weight)
            const weightRaw = getRobustValue(ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.TOTALPRODUCTWEIGHT);
            const weight = weightRaw ? parseFloat(weightRaw) : 0.5;

            // 3. COD Status
            const codRaw = getRobustValue(ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COD_STATUS);
            const cod = codRaw?.toLowerCase() === "yes" || codRaw === "1" || codRaw === "true" ? 1 : 0;

            if (!pickupZip || pickupZip === "-") {
                setCourierError("Supplier Pincode is missing or empty in the board.");
                return;
            }

            const response = await ShipRocketService.checkCourierServiceability(pickupZip, deliveryZip, weight, cod);

            if (response?.data?.available_courier_companies) {
                const formatted = response.data.available_courier_companies.map((c: any) => ({
                    label: `${c.courier_name} (₹${c.freight_charge})`,
                    value: String(c.courier_company_id),
                }));
                setCourierOptions(formatted);
                if (formatted.length === 0) setCourierError("No couriers found for this route.");
            }
        } catch (error: any) {
            setCourierError("ShipRocket: " + (error.message || "Serviceability failed"));
        } finally {
            setIsCouriersLoading(false);
        }
    };
    const handlePostalChange = async (val: any) => {
        setSelectedPostalCode(val);
        setSelectedCourier(null);
        console.log("Supplier postal code ", val);
        console.log("Selected upplier = ", selectedSupplier);
        if (val && selectedSupplier) {
            await queryCouriers(val.value);
        }
    };

    const handleUpdateCourier = async () => {
        if (!selectedCourier || selectedLineItemIds.size === 0) return;
        setIsUpdating(true);
        try {
            const updatePromises = Array.from(selectedLineItemIds).map((itemId: string) => {
                const columnValues: any = {
                    [ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COURIERID]: selectedCourier.value,
                    [ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.STATUS]: { label: "Ready for Manifest Generation" },
                };

                if (ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COURIERNAME) {
                    columnValues[ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COURIERNAME] = selectedCourier.label;
                }

                return monday.api(`mutation {
                    change_multiple_column_values(
                        item_id: ${itemId},
                        board_id: ${ORDER_ITEM_BOARD_ID},
                        column_values: "${JSON.stringify(columnValues).replace(/"/g, '\\"')}"
                    ) { id }
                }`);
            });

            const results: any = await Promise.all(updatePromises);

            const hasErrors = results.some((res: any) => res.errors);
            if (hasErrors) {
                throw new Error(results.find((res: any) => res.errors).errors[0].message);
            }

            monday.execute("confirm", { message: "Couriers updated successfully!", type: "success" });
            setSelectedLineItemIds(new Set());
        } catch (e: any) {
            console.error("Update failed:", e);
            monday.execute("confirm", { message: `Update failed: ${e.message}`, type: "error" });
        } finally {
            setIsUpdating(false);
        }
    };

    console.log("All suppliers ", allSuppliers);
    if (loading) return <Loader size={40} />;

    return (
        <div style={{ padding: "24px" }}>
            <h3>Courier Selection</h3>
            <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", marginBottom: "20px" }}>
                <div style={{ flex: 1 }}>
                    <label>Supplier:</label>
                    <Dropdown
                        options={allSuppliers}
                        value={selectedSupplier}
                        onChange={(v: any) => {
                            setSelectedSupplier(v);
                            setSelectedPostalCode(null);
                        }}
                    />
                </div>
                <div style={{ flex: 1 }}>
                    <label>Delivery Postal Code:</label>
                    <Dropdown options={deliveryPostalCodes} value={selectedPostalCode} onChange={handlePostalChange} disabled={!selectedSupplier} />
                </div>
                <div style={{ flex: 1 }}>
                    <label>Courier:</label>
                    <div style={{ position: 'relative' }}>
                        <Dropdown
                            options={courierOptions}
                            value={selectedCourier}
                            onChange={(v: any) => setSelectedCourier(v)}
                            disabled={!selectedPostalCode || isCouriersLoading}
                            placeholder={isCouriersLoading ? "Loading..." : "Select Courier"}
                        />
                        {isCouriersLoading && (
                            <div style={{ position: 'absolute', right: '35px', top: '8px' }}>
                                <Loader size={20} />
                            </div>
                        )}
                    </div>
                    {/* Error/Status Message */}
                    {courierError && (
                        <p style={{ color: "red", fontSize: "12px", margin: "4px 0 0 0" }}>
                            {courierError}
                        </p>
                    )}
                </div>
                <Button disabled={!selectedCourier || selectedLineItemIds.size === 0} loading={isUpdating} onClick={handleUpdateCourier}>
                    Update Courier
                </Button>
            </div>

            {!selectedSupplier && <p style={{ color: "#666", fontStyle: "italic" }}>Please select a supplier to view line items</p>}
            {selectedSupplier && !selectedPostalCode && (
                <p style={{ color: "#666", fontStyle: "italic" }}>Select a Delivery Postal Code to filter further and assign a courier</p>
            )}

            <div style={{ maxHeight: "300px", overflowY: "auto", marginTop: "20px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead style={{ backgroundColor: "#f1f3f5", position: "sticky", top: 0 }}>
                        <tr>
                            <th style={{ padding: "10px" }}>
                                <Checkbox
                                    checked={selectedLineItemIds.size === filteredLineItems.length && filteredLineItems.length > 0}
                                    onChange={() =>
                                        setSelectedLineItemIds(
                                            selectedLineItemIds.size === filteredLineItems.length ? new Set() : new Set(filteredLineItems.map((i) => i.id)),
                                        )
                                    }
                                />
                            </th>
                            <th style={{ padding: "10px", textAlign: "left" }}>Name</th>
                            {COURIER_OLI_COLUMN_IDS.map((colId) => (
                                <th key={colId} style={{ padding: "10px", textAlign: "left" }}>
                                    {boardColumns[colId] || colId}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {filteredLineItems.map((item) => (
                            <tr key={item.id} style={{ borderBottom: "1px solid #eee" }}>
                                <td style={{ padding: "10px", textAlign: "center" }}>
                                    <Checkbox
                                        checked={selectedLineItemIds.has(item.id)}
                                        onChange={() => {
                                            const next = new Set(selectedLineItemIds);
                                            next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                                            setSelectedLineItemIds(next);
                                        }}
                                    />
                                </td>
                                <td style={{ padding: "10px" }}>{item.name}</td>
                                {COURIER_OLI_COLUMN_IDS.map((colId) => {
                                    const col = item.column_values?.find((cv: any) => cv.id === colId);
                                    return (
                                        <td key={colId} style={{ padding: "10px" }}>
                                            {col?.display_value || col?.text || "-"}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};;;
