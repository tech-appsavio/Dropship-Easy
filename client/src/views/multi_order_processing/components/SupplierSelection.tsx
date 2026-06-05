import React, { useState, useMemo } from "react";
import { Dropdown, Button, Loader, Checkbox, Toast } from "@vibe/core";
import { useSupplierSelectionData } from "../hooks/useSupplierSelectionData";
import { ORDER_ITEM_BOARD_ID, ORDERLINEITEMS_COLUMN_LABELS_VISIBLE, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP } from "../constants";
import mondaySdk from "monday-sdk-js";
import { IndeterminateCheckbox } from "./IndeterminateCheckbox";
import { useToast } from "../hooks/useToast";
const monday = mondaySdk();

const thStyle: React.CSSProperties = {
    padding: "12px 16px",
    textAlign: "center",
    fontSize: 13,
    fontWeight: 600,
    color: "#323338",
    border: "1px solid #d0d4e0",
    whiteSpace: "nowrap",
    minWidth: 140,
    backgroundColor: "#f1f3f5",
};

const tdStyle: React.CSSProperties = {
    padding: "10px 16px",
    textAlign: "center",
    border: "1px solid #d0d4e0",
    fontSize: 13,
    whiteSpace: "nowrap",
    minWidth: 140,
};

const navBtnStyle = (disabled: boolean): React.CSSProperties => ({
    padding: "10px 22px",
    borderRadius: 6,
    border: "1px solid #d0d4e0",
    background: disabled ? "#f4f5f7" : "#fff",
    color: disabled ? "#aaa" : "#323338",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 14,
    fontWeight: 500,
});

const primaryBtnStyle = (disabled: boolean): React.CSSProperties => ({
    padding: "10px 22px",
    borderRadius: 6,
    background: disabled ? "#c5c7d4" : "#0073ea",
    color: "#fff",
    border: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 14,
    fontWeight: 600,
    boxShadow: disabled ? "none" : "0 2px 8px rgba(0,115,234,0.3)",
    transition: "all 0.2s ease",
});

export const SupplierSelection = ({
    selectedOrderIds,
    onPrev,
    onNext,
}: {
    selectedOrderIds: string[];
    onPrev: () => void;
    onNext: () => void;
}) => {
    const { allProducts, suppliersMap, fetchSuppliersForProduct, loading, lineItems, refetch } = useSupplierSelectionData(selectedOrderIds);
    const { toast, showToast, hideToast } = useToast();
    const [selectedProduct, setSelectedProduct] = useState<any>(null);
    const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
    const [selectedLineItemIds, setSelectedLineItemIds] = useState<Set<string>>(new Set());
    const [isUpdating, setIsUpdating] = useState(false);

    const filteredLineItems = useMemo(() => {
        if (!selectedProduct) return [];
        return lineItems.filter((item) => item.productId === selectedProduct.value);
    }, [lineItems, selectedProduct]);

    const handleProductChange = (val: any) => {
        setSelectedProduct(val);
        setSelectedSupplier(null);
        setSelectedLineItemIds(new Set());
        if (val) fetchSuppliersForProduct(val.value);
    };

    const toggleLineItem = (id: string) => {
        const next = new Set(selectedLineItemIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedLineItemIds(next);
    };

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
            const updatePromises = Array.from(selectedLineItemIds).map((itemId: string) =>
                updateSupplierAndStatusOnOrderLineItem(itemId, ORDER_ITEM_BOARD_ID.toString(), selectedSupplier.value),
            );
            await Promise.all(updatePromises);
            await refetch();
            showToast("Supplier updated successfully!", "positive");
            setSelectedLineItemIds(new Set());
        } catch (e: any) {
            showToast("Update failed: " + e.message, "negative");
            console.error("Update failed:", e);
        } finally {
            setIsUpdating(false);
        }
    };

    if (loading) return <Loader size={40} />;

    const currentSuppliers = selectedProduct ? suppliersMap[selectedProduct.value] || [] : [];

    return (
        <div>
            <Toast open={toast.open} type={toast.type} onClose={hideToast} autoHideDuration={4000} style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999 }}>
                {toast.message}
            </Toast>

            {/* Header row — matches OrderSelection layout */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "20px",
                }}
            >
                <h3 style={{ margin: 0, fontSize: "20px", fontWeight: 600 }}>Supplier Selection</h3>
                <Button disabled={!selectedSupplier || selectedLineItemIds.size === 0 || isUpdating} loading={isUpdating} onClick={handleUpdateSupplier}>
                    Update Supplier
                </Button>
            </div>

            {/* Dropdowns — matches OrderSelection toolbar style */}
            <div style={{ display: "flex", gap: 10, marginBottom: "16px", alignItems: "center", flexWrap: "wrap", position: "relative", zIndex: 10 }}>
                <div style={{ flex: "1 1 220px", minWidth: "180px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 500, display: "block", marginBottom: "6px", color: "#323338" }}>Select Product:</label>
                    <Dropdown options={allProducts} onChange={handleProductChange} value={selectedProduct} />
                </div>
                <div style={{ flex: "1 1 220px", minWidth: "180px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 500, display: "block", marginBottom: "6px", color: "#323338" }}>Select Supplier:</label>
                    <Dropdown options={currentSuppliers} onChange={(val: any) => setSelectedSupplier(val)} value={selectedSupplier} disabled={!selectedProduct} />
                </div>
            </div>

            {/* Table — matches OrderSelection table structure */}
            <div style={{ overflowX: "auto", border: "1px solid #d0d4e0", borderRadius: 6 }}>
                <div style={{ overflowY: "auto", maxHeight: 420 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                        <thead style={{ backgroundColor: "#f1f3f5", position: "sticky", top: 0, zIndex: 5 }}>
                            <tr>
                                <th style={{ padding: "12px 16px", width: 50, border: "1px solid #d0d4e0", textAlign: "center", backgroundColor: "#f1f3f5" }}>
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
                                    <th key={label} style={thStyle}>{label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody style={{ display: "table-row-group" }}>
                            {filteredLineItems.length > 0 ? filteredLineItems.map((item) => (
                                <tr key={item.id} style={{ backgroundColor: "#fff" }}>
                                    <td style={{ padding: "12px 16px", width: 50, textAlign: "center", border: "1px solid #d0d4e0", verticalAlign: "middle" }}>
                                        <input
                                            type="checkbox"
                                            checked={selectedLineItemIds.has(item.id)}
                                            onChange={() => toggleLineItem(item.id)}
                                        />
                                    </td>
                                    {ORDERLINEITEMS_COLUMN_LABELS_VISIBLE.map((label) => (
                                        <td key={label} style={tdStyle}>
                                            {label === "Name"
                                                ? item.name
                                                : (() => {
                                                      const colId = ORDERLINEITEMS_ALL_COLUMN_IDS_MAP[
                                                          label.toUpperCase().replace(/\s/g, "") as keyof typeof ORDERLINEITEMS_ALL_COLUMN_IDS_MAP
                                                      ];
                                                      const col = item.column_values?.find((cv: any) => cv.id === colId);
                                                      return col?.display_value || col?.text || "-";
                                                  })()}
                                        </td>
                                    ))}
                                </tr>
                            )) : (
                                <tr>
                                    <td
                                        colSpan={ORDERLINEITEMS_COLUMN_LABELS_VISIBLE.length + 1}
                                        style={{ padding: "32px", textAlign: "center", color: "#676879", fontSize: 13, border: "1px solid #d0d4e0" }}
                                    >
                                        {selectedProduct ? "No line items found for this product." : "No items to display. Please select a product."}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Bottom nav — matches OrderSelection bottom bar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingTop: 12, paddingBottom: 24, borderTop: "1px solid #eee" }}>
                <button onClick={onPrev} style={navBtnStyle(false)}>← Back to Orders</button>
                <button onClick={onNext} style={primaryBtnStyle(false)}>Go to Courier Selection →</button>
            </div>
        </div>
    );
};