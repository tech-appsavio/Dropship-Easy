// src/views/multi_order_processing/components/SupplierSelection.tsx
import React, { useState, useMemo } from "react";
import { Dropdown, Button, Loader, Table, TableHeader, TableHeaderCell, TableBody, TableRow, TableCell, Checkbox } from "@vibe/core";
import { useSupplierSelectionData } from "../hooks/useSupplierSelectionData";
import { ORDER_ITEM_BOARD_ID, ORDERLINEITEMS_COLUMN_LABELS_VISIBLE, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP } from "../constants";
import mondaySdk from "monday-sdk-js";
import { IndeterminateCheckbox } from "./IndeterminateCheckbox";
const monday = mondaySdk();

export const SupplierSelection = ({ selectedOrderIds }: { selectedOrderIds: string[] }) => {
    const { allProducts, suppliersMap, fetchSuppliersForProduct, loading, lineItems, refetch } = useSupplierSelectionData(selectedOrderIds);
    const [selectedProduct, setSelectedProduct] = useState<any>(null);
    const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
    const [selectedLineItemIds, setSelectedLineItemIds] = useState<Set<string>>(new Set());
    const [isUpdating, setIsUpdating] = useState(false);

    // Filter line items based on selected product
    const filteredLineItems = useMemo(() => {
        if (!selectedProduct) return [];
        return lineItems.filter((item) => item.productId === selectedProduct.value);
    }, [lineItems, selectedProduct]);

    const handleProductChange = (val: any) => {
        setSelectedProduct(val);
        setSelectedSupplier(null);
        setSelectedLineItemIds(new Set()); // Reset selection on product change
        if (val) fetchSuppliersForProduct(val.value);
    };

    const toggleLineItem = (id: string) => {
        const next = new Set(selectedLineItemIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedLineItemIds(next);
    };

    // Define a modular function for the mutation to keep handleUpdateSupplier clean
    const updateSupplierAndStatusOnOrderLineItem = async (itemId: string, boardId: string, supplierId: string) => {
        const columnValues = {
            [ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SUPPLIER]: { item_ids: [supplierId] },
            [ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.STATUS]: { label: "Supplier Selected" },
        };

        return monday.api(`mutation {
            change_multiple_column_values(
                item_id: ${itemId},
                board_id: ${boardId},
                column_values: "${JSON.stringify(columnValues).replace(/"/g, '\\"')}"
            ) { id }
        }`);
    };

    const handleUpdateSupplier = async () => {
        if (!selectedSupplier || selectedLineItemIds.size === 0) return;

        setIsUpdating(true);
        try {
            // Use the constant ID for the line items board instead of context
            const boardId = ORDER_ITEM_BOARD_ID;

            const updatePromises = Array.from(selectedLineItemIds).map((itemId: string) =>
                updateSupplierAndStatusOnOrderLineItem(itemId, boardId.toString(), selectedSupplier.value),
            );

            await Promise.all(updatePromises);
            await refetch();
            monday.execute("confirm", { message: "Supplier updated for selected items!", type: "success" });
            setSelectedLineItemIds(new Set());
        } catch (e) {
            console.error("Update failed:", e);
        } finally {
            setIsUpdating(false);
        }
    };

    if (loading) return <Loader size={40} />;

    console.log("Selected prdoc ", selectedProduct);
    const currentSuppliers = selectedProduct ? suppliersMap[selectedProduct.value] || [] : [];

    console.log("Suppliers supplier ", currentSuppliers);
    return (
        <div style={{ padding: "24px" }}>
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "20px",
                }}
            >
                <h3 style={{ margin: 0, fontSize: "20px", fontWeight: 600 }}>Supplier Selection</h3>
            </div>

            {/* Top Selection Controls */}
            <div style={{ display: "flex", gap: "20px", alignItems: "flex-end", marginBottom: "30px" }}>
                <div style={{ flex: 1 }}>
                    <label>Select Product:</label>
                    <Dropdown options={allProducts} onChange={handleProductChange} value={selectedProduct} />
                </div>
                <div style={{ flex: 1 }}>
                    <label>Select Supplier:</label>
                    <Dropdown
                        options={currentSuppliers}
                        onChange={(val: any) => setSelectedSupplier(val)}
                        value={selectedSupplier}
                        disabled={!selectedProduct}
                    />
                </div>
                <Button disabled={!selectedSupplier || selectedLineItemIds.size === 0 || isUpdating} loading={isUpdating} onClick={handleUpdateSupplier}>
                    Update Supplier
                </Button>
            </div>

            {/* Dynamic Line Items Table */}
            {selectedProduct && (
                <div style={{ marginBottom: "20px", maxHeight: "400px", overflowY: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ backgroundColor: "#f1f3f5", textAlign: "left", position: "sticky", top: 0 }}>
                                <th style={{ padding: "12px" }}>
                                    <IndeterminateCheckbox
                                        checked={filteredLineItems.length > 0 && selectedLineItemIds.size === filteredLineItems.length}
                                        indeterminate={selectedLineItemIds.size > 0 && selectedLineItemIds.size < filteredLineItems.length}
                                        onChange={() => {
                                            if (selectedLineItemIds.size === filteredLineItems.length) {
                                                setSelectedLineItemIds(new Set());
                                            } else {
                                                setSelectedLineItemIds(new Set(filteredLineItems.map((i) => i.id)));
                                            }
                                        }}
                                    />
                                </th>
                                {ORDERLINEITEMS_COLUMN_LABELS_VISIBLE.map((label) => (
                                    <th key={label} style={{ padding: "12px" }}>
                                        {label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredLineItems.map((item) => (
                                <tr key={item.id} style={{ borderBottom: "1px solid #eee" }}>
                                    <td style={{ padding: "12px" }}>
                                        <Checkbox checked={selectedLineItemIds.has(item.id)} onChange={() => toggleLineItem(item.id)} />
                                    </td>
                                    {ORDERLINEITEMS_COLUMN_LABELS_VISIBLE.map((label) => (
                                        <td key={label} style={{ padding: "12px" }}>
                                            {label === "Name"
                                                ? item.name
                                                : (() => {
                                                      const colId =
                                                          ORDERLINEITEMS_ALL_COLUMN_IDS_MAP[
                                                              label.toUpperCase().replace(/\s/g, "") as keyof typeof ORDERLINEITEMS_ALL_COLUMN_IDS_MAP
                                                          ];
                                                      const col = item.column_values?.find((cv: any) => cv.id === colId);
                                                      return col?.display_value || col?.text || "N/A";
                                                  })()}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {filteredLineItems.length === 0 && <p style={{ padding: "20px", textAlign: "center" }}>No line items found for this product.</p>}
                </div>
            )}

            {selectedProduct && currentSuppliers.length === 0 && (
                <div style={{ color: "red", marginBottom: "20px" }}>No Supplier found for Product: {selectedProduct.label}</div>
            )}
        </div>
    );
};