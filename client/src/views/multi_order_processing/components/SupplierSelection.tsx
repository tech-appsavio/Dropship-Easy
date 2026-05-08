// src/views/multi_order_processing/components/SupplierSelection.tsx
import React, { useState } from "react";
import { Dropdown, Button, Loader } from "@vibe/core";
import { useSupplierSelectionData } from "../hooks/useSupplierSelectionData";

export const SupplierSelection = ({ selectedOrderIds, onBack }: { selectedOrderIds: string[], onBack: () => void }) => {
    const { allProducts, suppliersMap, fetchSuppliersForProduct, loading } = useSupplierSelectionData(selectedOrderIds);
    const [selectedProduct, setSelectedProduct] = useState<any>(null);
    const [selectedSupplier, setSelectedSupplier] = useState<any>(null);

    const handleProductChange = (val: any) => {
        setSelectedProduct(val);
        setSelectedSupplier(null);
        if (val) fetchSuppliersForProduct(val.value);
    };

    if (loading) return <Loader size={40} />;

    const currentSuppliers = selectedProduct ? (suppliersMap[selectedProduct.value] || []) : [];

    return (
        <div style={{ padding: "24px" }}>
            <h3>Order Line Items to Update</h3>
            <div style={{ display: "flex", gap: "20px", alignItems: "flex-end", marginBottom: "30px" }}>
                <div style={{ flex: 1 }}>
                    <label>Select Product:</label>
                    <Dropdown
                        options={allProducts}
                        onChange={handleProductChange}
                        value={selectedProduct}
                    />
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
                <Button
                    disabled={!selectedSupplier}
                    onClick={() => console.log("Update logic for product", selectedProduct, "to supplier", selectedSupplier)}
                >
                    Update Supplier
                </Button>
            </div>

            {selectedProduct && currentSuppliers.length === 0 && (
                <div style={{ color: "red", marginBottom: "20px" }}>
                    No Supplier found for Product: {selectedProduct.label}
                </div>
            )}

            <Button kind={Button.kinds.TERTIARY} onClick={onBack}>Back to Orders</Button>
        </div>
    );
};