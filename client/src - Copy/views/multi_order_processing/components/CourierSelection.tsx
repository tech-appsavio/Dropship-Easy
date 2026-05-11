// src/views/multi_order_processing/components/CourierSelection.tsx
import React, { useState, useMemo } from "react";
import { Dropdown, Button, Loader, Checkbox } from "@vibe/core";
import { useCourierSelectionData } from "../hooks/useCourierSelectionData";
import { ORDER_ITEM_BOARD_ID, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP, SUPPLIER_BOARD_ID, SUPPLIER_ALL_COLUMN_IDS_MAP } from "../constants";
import mondaySdk from "monday-sdk-js";

const monday = mondaySdk();

export const CourierSelection = ({ selectedOrderIds }: { selectedOrderIds: string[] }) => {
    const { loading, ordersWithLineItems, allSuppliers } = useCourierSelectionData(selectedOrderIds);
    const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
    const [selectedPostalCode, setSelectedPostalCode] = useState<any>(null);
    const [selectedCourier, setSelectedCourier] = useState<any>(null);
    const [selectedLineItemIds, setSelectedLineItemIds] = useState<Set<string>>(new Set());
    const [isUpdating, setIsUpdating] = useState(false);

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
        if (!selectedSupplier || !selectedPostalCode) return [];
        const items: any[] = [];
        ordersWithLineItems.forEach((o) => {
            if (o.deliveryCode === selectedPostalCode.value) {
                o.lineItems.forEach((li: any) => {
                    if (li.supplierId === selectedSupplier.value) items.push(li);
                });
            }
        });
        return items;
    }, [selectedSupplier, selectedPostalCode, ordersWithLineItems]);

    // 3. Mock Courier API Method
    const queryCouriers = async (supplierZip: string, deliveryZip: string) => {
        console.log(`Querying couriers for route: ${supplierZip} -> ${deliveryZip}`);
        return [
            { label: "Courier 1", value: "cour_1" },
            { label: "Courier 2", value: "cour_2" },
        ];
    };

    const handlePostalChange = async (val: any) => {
        setSelectedPostalCode(val);
        setSelectedCourier(null);
        if (val && selectedSupplier) {
            // Placeholder: Fetch supplier zip first in a real scenario
            await queryCouriers("SUPPLIER_ZIP_PLACEHOLDER", val.value);
        }
    };

    const handleUpdateCourier = async () => {
        if (!selectedCourier || selectedLineItemIds.size === 0) return;
        setIsUpdating(true);
        try {
            const updatePromises = Array.from(selectedLineItemIds).map((itemId: string) => {
                // Build the column values object
                const columnValues: any = {
                    [ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COURIERID]: selectedCourier.value,
                    [ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.STATUS]: { label: "Ready for Manifest Generation" },
                };

                // ONLY add Courier Name if the ID is actually defined to prevent API errors
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

            // Check if any individual mutation returned errors
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
                    <Dropdown
                        options={[
                            { label: "Courier 1", value: "cour_1" },
                            { label: "Courier 2", value: "cour_2" },
                        ]}
                        value={selectedCourier}
                        onChange={(v: any) => setSelectedCourier(v)}
                        disabled={!selectedPostalCode}
                    />
                </div>
                <Button disabled={!selectedCourier || selectedLineItemIds.size === 0} loading={isUpdating} onClick={handleUpdateCourier}>
                    Update Courier
                </Button>
            </div>

            {(!selectedSupplier || !selectedPostalCode) && (
                <p style={{ color: "#666", fontStyle: "italic" }}>Please select both supplier and Delivery Postal Code</p>
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
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};