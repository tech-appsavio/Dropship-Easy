// src/views/multi_order_processing/components/OrderManifestGeneration.tsx
import React, { useState } from "react";
import { Button, Loader, Table, TableHeader, TableHeaderCell, TableBody, TableRow, TableCell, RadioButton } from "@vibe/core";
import { useCourierSelectionData } from "../hooks/useCourierSelectionData";
import {
    SUPPLIER_MANIFEST_BOARD_ID,
    SUPPLIER_MANIFEST_COLUMN_IDS_MAP,
    ORDERLINEITEMS_COLUMN_LABELS_VISIBLE,
    SHOPS_BOARD_ID,
    SHOPS_MANIFEST_COLUMN_IDS_MAP,
} from "../constants";
import mondaySdk from "monday-sdk-js";
import { generateManifestPDF } from "../utils/pdfGenerator";


const monday = mondaySdk();

export const OrderManifestGeneration = ({ selectedOrderIds, onBack }: { selectedOrderIds: string[], onBack: () => void }) => {
    const { loading, ordersWithLineItems } = useCourierSelectionData(selectedOrderIds);
    const [selectedItemId, setSelectedLineItemId] = useState<string | null>(null);
    const [isCreating, setIsUpdating] = useState(false);

    // Flatten line items from all selected orders
    const allSelectedLineItems = ordersWithLineItems.flatMap(order => order.lineItems);
    const fetchShopDetails = async () => {
        // Step 1: Fetch raw column values (no inline fragment needed)
        const res: any = await monday.api(`query {
            boards(ids: ${SHOPS_BOARD_ID}) {
                items_page(limit: 1) {
                    items {
                        id
                        column_values {
                            id
                            text
                            value
                        }
                    }
                }
            }
        }`);

        if (res.errors) {
            throw new Error(`GraphQL: ${res.errors.map((e: any) => e.message).join(", ")}`);
        }

        if (!res.data?.boards?.[0]?.items_page?.items?.[0]) {
            throw new Error("Shop details not found.");
        }

        const shopItem = res.data.boards[0].items_page.items[0];
        const getCol = (id: string) => shopItem.column_values.find((cv: any) => cv.id === id);

        // Step 2: Parse the file column JSON to extract asset ID
        let logoUrl = "";
        const logoRawValue = getCol(SHOPS_MANIFEST_COLUMN_IDS_MAP.LOGO)?.value;

        if (logoRawValue) {
            try {
                const parsed = JSON.parse(logoRawValue);
                const assetId = parsed?.files?.[0]?.assetId;

                if (assetId) {
                    // Step 3: Fetch public URL via assets query
                    const assetRes: any = await monday.api(`query {
                        assets(ids: [${assetId}]) {
                            public_url
                        }
                    }`);
                    logoUrl = assetRes.data?.assets?.[0]?.public_url || "";
                }
            } catch (e) {
                console.warn("Could not parse logo column — skipping logo:", e);
                // logoUrl stays "" — PDF will skip logo gracefully
            }
        }

        return {
            logo: logoUrl, // empty string if column is blank or parsing fails
            contactName: getCol(SHOPS_MANIFEST_COLUMN_IDS_MAP.PRIMARY_CONTACT)?.text || "",
            address: `${getCol(SHOPS_MANIFEST_COLUMN_IDS_MAP.STREET)?.text || ""}, ${getCol(SHOPS_MANIFEST_COLUMN_IDS_MAP.CITY)?.text || ""}`,
        };
    };

    const handleGenerateManifest = async () => {
        if (!selectedItemId) return;
        const item = allSelectedLineItems.find((li) => li.id === selectedItemId);
        if (!item) return;

        setIsUpdating(true);
        try {
            const shopDetails = await fetchShopDetails();
            const now = new Date();
            const timestamp = `${now.getDate()}${now.getMonth() + 1}${now.getFullYear()}_${now.getHours()}${now.getMinutes()}`;
            const manifestName = `${item.supplierName || "NoSupplier"}_${item.courierName || "NoCourier"}_${item.name}_${timestamp}`;

            // FIX: Ensure Item IDs are linked to their respective connected board columns
            const columnValues = {
                // Link to the parent ORDER board
                [SUPPLIER_MANIFEST_COLUMN_IDS_MAP.ORDER]: { item_ids: [item.linkedOrderId] },
                // Link to the ORDER LINE ITEM board
                [SUPPLIER_MANIFEST_COLUMN_IDS_MAP.ORDER_LINE_ITEM]: { item_ids: [item.id] },
                // Link to the SUPPLIER board
                [SUPPLIER_MANIFEST_COLUMN_IDS_MAP.SUPPLIER]: { item_ids: [item.supplierId] },
            };
            const createRes: any = await monday.api(`mutation {
                create_item (
                    board_id: ${SUPPLIER_MANIFEST_BOARD_ID},
                    item_name: "${manifestName}",
                    column_values: "${JSON.stringify(columnValues).replace(/"/g, '\\"')}"
                ) { id }
            }`);

            const newManifestId = createRes.data.create_item.id;

            // 2. Generate and Upload the PDF
            const pdfBlob = await generateManifestPDF({
                supplierName: item.supplierName,
                courierName: item.courierName,
                lineItem: item,
                shopDetails,
                manifestName,
            });
            const pdfFile = new File([pdfBlob], `${manifestName}.pdf`, { type: "application/pdf" });



            // 3. Upload File to Manifest Column
            await monday.api(
                `mutation ($file: File!) {
                add_file_to_column (
                    item_id: ${newManifestId},
                    column_id: "${SUPPLIER_MANIFEST_COLUMN_IDS_MAP.MANIFEST_FILE}",
                    file: $file
                ) { id }
            }`,
                { variables: { file: pdfFile } },
            );

            monday.execute("confirm", { message: "Manifest Generated and File Uploaded!", type: "success" });
        } catch (e: any) {
            console.error("Manifest Creation Failed:", e);
            monday.execute("confirm", {
                message: "Manifest Generation Failed",
                description: e.message, // This will show the detailed line from the console
                type: "error",
                confirmButtonText: "OK",
                excludeCancelButton: true,
            });
        } finally {
            setIsUpdating(false);
        }
    };

    if (loading) return <Loader size={40} />;

    return (
        <div style={{ padding: "24px" }}>
            <h3>Generate Supplier Manifests</h3>

            <div style={{ maxHeight: "500px", overflowY: "auto", marginBottom: "20px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead style={{ backgroundColor: "#f1f3f5", position: "sticky", top: 0 }}>
                        <tr>
                            <th style={{ padding: "10px" }}>Select</th>
                            <th style={{ padding: "10px", textAlign: "left" }}>Name</th>
                            <th style={{ padding: "10px", textAlign: "left" }}>Supplier</th>
                        </tr>
                    </thead>
                    <tbody>
                        {allSelectedLineItems.map(item => (
                            <tr key={item.id} style={{ borderBottom: "1px solid #eee" }}>
                                <td style={{ padding: "10px", textAlign: "center" }}>
                                    <RadioButton
                                        checked={selectedItemId === item.id}
                                        onSelect={() => setSelectedLineItemId(item.id)} // Note: Vibe uses 'onSelect' for RadioButtons
                                    />
                                </td>
                                <td style={{ padding: "10px" }}>{item.name}</td>
                                <td style={{ padding: "10px" }}>{item.supplierName || "N/A"}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
                <Button kind={Button.kinds.TERTIARY} onClick={onBack}>Back to Courier Selection</Button>
                <Button
                    disabled={!selectedItemId || isCreating}
                    loading={isCreating}
                    onClick={handleGenerateManifest}
                >
                    Ready for Manifest Generation
                </Button>
            </div>
        </div>
    );
};