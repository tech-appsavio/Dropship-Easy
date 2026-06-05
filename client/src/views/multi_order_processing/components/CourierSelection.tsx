import React, { useState, useMemo } from "react";
import { Dropdown, Button, Loader, Checkbox, Toast } from "@vibe/core";
import { useToast } from "../hooks/useToast";
import { useCourierSelectionData } from "../hooks/useCourierSelectionData";
import { ORDER_ITEM_BOARD_ID, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP, SUPPLIER_ALL_COLUMN_IDS_MAP } from "../constants";
import ShipRocketService from "../../../services/shiprocketCourier";
import { IndeterminateCheckbox } from "./IndeterminateCheckbox";
import mondaySdk from "monday-sdk-js";

const monday = mondaySdk();

const COURIER_OLI_COLUMN_IDS = [
    ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.ORDER,
    ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.PRODUCT,
    ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SUPPLIER,
    ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COURIERNAME,
    ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SUPPLIERMANIFEST,
    ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.STATUS,
];

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

export const CourierSelection = ({
    selectedOrderIds,
    onPrev,
    onNext,
}: {
    selectedOrderIds: string[];
    onPrev: () => void;
    onNext: () => void;
}) => {
    const { loading, ordersWithLineItems, allSuppliers, boardColumns, refetch } = useCourierSelectionData(selectedOrderIds);
    const { toast, showToast, hideToast } = useToast();
    const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
    const [selectedPostalCode, setSelectedPostalCode] = useState<any>(null);
    const [selectedCourier, setSelectedCourier] = useState<any>(null);
    const [selectedLineItemIds, setSelectedLineItemIds] = useState<Set<string>>(new Set());
    const [isUpdating, setIsUpdating] = useState(false);
    const [courierOptions, setCourierOptions] = useState<any[]>([]);
    const [isCouriersLoading, setIsCouriersLoading] = useState(false);
    const [courierError, setCourierError] = useState<string | null>(null);

    const deliveryPostalCodes = useMemo(() => {
        if (!selectedSupplier) return [];
        const codes = new Set<string>();
        ordersWithLineItems.forEach((o) => {
            const hasSupplier = o.lineItems.some((li: any) => li.supplierId === selectedSupplier.value);
            if (hasSupplier && o.customerPostalCode) codes.add(o.customerPostalCode);
        });
        return Array.from(codes).map((code) => ({ label: code, value: code }));
    }, [selectedSupplier, ordersWithLineItems]);

    const filteredLineItems = useMemo(() => {
        if (!selectedSupplier) return [];
        const items: any[] = [];
        ordersWithLineItems.forEach((o) => {
            const postalMatch = !selectedPostalCode || o.customerPostalCode === selectedPostalCode.value;
            if (postalMatch) {
                o.lineItems.forEach((li: any) => {
                    if (li.supplierId === selectedSupplier.value) items.push(li);
                });
            }
        });
        return items;
    }, [selectedSupplier, selectedPostalCode, ordersWithLineItems]);

    const queryCouriers = async (deliveryZip: string) => {
        setIsCouriersLoading(true);
        setCourierError(null);
        setCourierOptions([]);
        const DEFAULT_COURIER = { label: "SP Store (Self)", value: "SP Store (Self)" };
        try {
            const supplierRes: any = await monday.api(`query {
                items(ids: [${selectedSupplier.value}]) {
                    column_values(ids: ["${SUPPLIER_ALL_COLUMN_IDS_MAP.POSTALCODE}"]) { text value }
                }
            }`);
            const supplierCol = supplierRes.data?.items?.[0]?.column_values?.[0];
            let pickupZip = supplierCol?.text || "";
            if (!pickupZip && supplierCol?.value) {
                try {
                    const parsed = JSON.parse(supplierCol.value);
                    pickupZip = typeof parsed === "object" ? parsed.value || parsed.text : String(parsed);
                } catch { pickupZip = supplierCol.value; }
            }
            if (!pickupZip || pickupZip === "-") {
                setCourierError(`Pincode is missing on Supplier board for: ${selectedSupplier.label}`);
                showToast(`Pincode is missing on Supplier board for: ${selectedSupplier.label}`, "negative");
                setIsCouriersLoading(false);
                return;
            }
            const item = filteredLineItems.find((li) => li.supplierId === selectedSupplier.value);
            if (!item) { setCourierError("No line item context found."); return; }

            const getRobustValue = (colId: string) => {
                const cv = item.column_values?.find((c: any) => c.id === colId);
                if (!cv) return null;
                if (cv.display_value) return cv.display_value;
                if (cv.text) return cv.text;
                if (cv.value) {
                    try {
                        const parsed = JSON.parse(cv.value);
                        return typeof parsed === "object" ? parsed.value || parsed.text : String(parsed);
                    } catch { return cv.value; }
                }
                return null;
            };
            const weight = parseFloat(getRobustValue(ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.TOTALPRODUCTWEIGHT) || "0.5") || 0.5;
            const codRaw = getRobustValue(ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COD_STATUS);
            const cod = codRaw?.toLowerCase() === "yes" || codRaw === "1" || codRaw === "true" ? 1 : 0;

            const response = await ShipRocketService.checkCourierServiceability(pickupZip, deliveryZip, weight, cod);
            if (response?.data?.available_courier_companies?.length > 0) {
                setCourierOptions(response.data.available_courier_companies.map((c: any) => ({
                    label: `${c.courier_name} (₹${c.freight_charge})`,
                    value: String(c.courier_company_id),
                })));
            } else {
                setCourierOptions([DEFAULT_COURIER]);
                setCourierError("No serviceability found. Defaulting to SP Store (Self).");
            }
        } catch (error: any) {
            setCourierOptions([DEFAULT_COURIER]);
            setCourierError("Failed to fetch couriers. Defaulting to SP Store (Self).");
            showToast("Error fetching couriers: " + error.message, "negative");
        } finally {
            setIsCouriersLoading(false);
        }
    };

    const handlePostalChange = async (val: any) => {
        setSelectedPostalCode(val);
        setSelectedCourier(null);
        if (val && selectedSupplier) await queryCouriers(val.value);
    };

    const handleUpdateCourier = async () => {
        if (!selectedCourier || selectedLineItemIds.size === 0) return;
        setIsUpdating(true);
        try {
            const updatePromises = Array.from(selectedLineItemIds).map((itemId: string) => {
                const columnValues: any = {
                    [ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COURIERID]: selectedCourier.value,
                    [ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COURIERNAME]: selectedCourier.label,
                    [ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.STATUS]: { label: "Ready for Manifest Generation" },
                };
                return monday.api(`mutation {
                    change_multiple_column_values(
                        item_id: ${itemId},
                        board_id: ${ORDER_ITEM_BOARD_ID},
                        column_values: "${JSON.stringify(columnValues).replace(/"/g, '\\"')}"
                    ) { id }
                }`);
            });
            const results: any = await Promise.all(updatePromises);
            await refetch();
            if (results.some((r: any) => r.errors)) throw new Error(results.find((r: any) => r.errors).errors[0].message);
            showToast("Couriers updated successfully!", "positive");
            setSelectedLineItemIds(new Set());
        } catch (e: any) {
            showToast(`Update failed: ${e.message}`, "negative");
        } finally {
            setIsUpdating(false);
        }
    };

    if (loading) return <Loader size={40} />;

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
                <h3 style={{ margin: 0, fontSize: "20px", fontWeight: 600 }}>Courier Selection</h3>
                <Button disabled={!selectedCourier || selectedLineItemIds.size === 0 || isUpdating} loading={isUpdating} onClick={handleUpdateCourier}>
                    Update Courier
                </Button>
            </div>

            {/* Dropdowns — matches OrderSelection toolbar style */}
            <div style={{ display: "flex", gap: 10, marginBottom: "16px", alignItems: "flex-end", flexWrap: "wrap", position: "relative", zIndex: 10 }}>
                <div style={{ flex: "1 1 180px", minWidth: "160px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 500, display: "block", marginBottom: "6px", color: "#323338" }}>Supplier:</label>
                    <Dropdown options={allSuppliers} value={selectedSupplier} onChange={(v: any) => { setSelectedSupplier(v); setSelectedPostalCode(null); }} />
                </div>
                <div style={{ flex: "1 1 180px", minWidth: "160px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 500, display: "block", marginBottom: "6px", color: "#323338" }}>Delivery Postal Code:</label>
                    <Dropdown options={deliveryPostalCodes} value={selectedPostalCode} onChange={handlePostalChange} disabled={!selectedSupplier} />
                </div>
                <div style={{ flex: "1 1 180px", minWidth: "160px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 500, display: "block", marginBottom: "6px", color: "#323338" }}>Courier:</label>
                    <div style={{ position: "relative" }}>
                        <Dropdown options={courierOptions} value={selectedCourier} onChange={(v: any) => setSelectedCourier(v)} disabled={!selectedPostalCode || isCouriersLoading} placeholder={isCouriersLoading ? "Loading..." : "Select Courier"} />
                        {isCouriersLoading && <div style={{ position: "absolute", right: "35px", top: "8px" }}><Loader size={20} /></div>}
                    </div>
                    {courierError && <p style={{ color: "red", fontSize: "12px", margin: "4px 0 0 0" }}>{courierError}</p>}
                </div>
            </div>

            {!selectedSupplier && <p style={{ color: "#676879", fontStyle: "italic", fontSize: 13, marginBottom: 12 }}>Please select a supplier to view line items</p>}
            {selectedSupplier && !selectedPostalCode && <p style={{ color: "#676879", fontStyle: "italic", fontSize: 13, marginBottom: 12 }}>Select a Delivery Postal Code to filter further and assign a courier</p>}

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
                                        onChange={() => setSelectedLineItemIds(
                                            selectedLineItemIds.size === filteredLineItems.length ? new Set() : new Set(filteredLineItems.map((i) => i.id))
                                        )}
                                    />
                                </th>
                                <th style={thStyle}>Name</th>
                                {COURIER_OLI_COLUMN_IDS.map((colId) => (
                                    <th key={colId} style={thStyle}>{boardColumns[colId] || colId}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody style={{ display: "table-row-group" }}>
                            {filteredLineItems.map((item) => (
                                <tr key={item.id} style={{ backgroundColor: "#fff" }}>
                                    <td style={{ padding: "12px 16px", width: 50, textAlign: "center", border: "1px solid #d0d4e0", verticalAlign: "middle" }}>
                                        <input
                                            type="checkbox"
                                            checked={selectedLineItemIds.has(item.id)}
                                            onChange={() => {
                                                const next = new Set(selectedLineItemIds);
                                                next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                                                setSelectedLineItemIds(next);
                                            }}
                                        />
                                    </td>
                                    <td style={tdStyle}>{item.name}</td>
                                    {COURIER_OLI_COLUMN_IDS.map((colId) => {
                                        const col = item.column_values?.find((cv: any) => cv.id === colId);
                                        return <td key={colId} style={tdStyle}>{col?.display_value || col?.text || "-"}</td>;
                                    })}
                                </tr>
                            ))}
                            {filteredLineItems.length === 0 && (
                                <tr>
                                    <td colSpan={COURIER_OLI_COLUMN_IDS.length + 2} style={{ padding: "32px", textAlign: "center", color: "#676879", fontSize: 13, border: "1px solid #d0d4e0" }}>
                                        No line items to display.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Bottom nav — matches OrderSelection bottom bar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingTop: 12, paddingBottom: 24, borderTop: "1px solid #eee" }}>
                <button onClick={onPrev} style={navBtnStyle(false)}>← Back to Suppliers</button>
                <button onClick={onNext} style={primaryBtnStyle(false)}>Go to Manifest Generation →</button>
            </div>
        </div>
    );
};