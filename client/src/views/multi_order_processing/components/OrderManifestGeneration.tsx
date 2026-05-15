// src/views/multi_order_processing/components/OrderManifestGeneration.tsx
import React, { useState } from "react";
import { Button, Loader, Table, TableHeader, TableHeaderCell, TableBody, TableRow, TableCell, RadioButton } from "@vibe/core";
import { useCourierSelectionData } from "../hooks/useCourierSelectionData";
import {
    SUPPLIER_MANIFEST_BOARD_ID,
    SUPPLIER_MANIFEST_COLUMN_IDS_MAP,
    ORDERLINEITEMS_COLUMN_LABELS_VISIBLE,
    SHOPS_BOARD_ID,
    SHOPS_ALL_COLUMN_IDS_MAP,
    ORDERLINEITEMS_ALL_COLUMN_IDS_MAP,
    ORDER_ALL_COLUMN_IDS_MAP,
    CUSTOMER_ALL_COLUMN_IDS_MAP,
} from "../constants";
import mondaySdk from "monday-sdk-js";
import { generateManifestPDF } from "../utils/pdfGenerator";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { LabelPdfTemplate } from "./LabelPdfTemplate";

const monday = mondaySdk();

export const OrderManifestGeneration = ({ selectedOrderIds }: { selectedOrderIds: string[] }) => {
    const { loading, ordersWithLineItems } = useCourierSelectionData(selectedOrderIds);
    const [selectedItemId, setSelectedLineItemId] = useState<string | null>(null);
    const [isCreating, setIsUpdating] = useState(false);

    const labelRef = React.useRef<HTMLDivElement>(null);
    const generateLabelBlob = async (): Promise<Blob> => {
        if (!labelRef.current) throw new Error("Label template not found");
        const canvas = await html2canvas(labelRef.current, { scale: 2 });
        const imgData = canvas.toDataURL("image/png");
        const pdf = new jsPDF("p", "mm", [101, 152]); // 4x6 inch label size
        pdf.addImage(imgData, "PNG", 0, 0, 101, 152);
        return pdf.output("blob");
    };

    // Flatten line items from all selected orders
    const allSelectedLineItems = ordersWithLineItems.flatMap((order) => order.lineItems);
    console.log("fetch shop detial ", allSelectedLineItems);
    const fetchShopDetails = async () => {
        console.log("fetch shop detial ");
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
        console.log("fetch shop det, result boards data =  ", res.data.boards);
        // Step 2: Parse the file column JSON to extract asset ID
        let logoUrl = "";
        const logoRawValue = getCol(SHOPS_ALL_COLUMN_IDS_MAP.LOGO)?.value;
        console.log("logoRawValue ", logoRawValue);
        console.log("logoRawValue col id = ", SHOPS_ALL_COLUMN_IDS_MAP.LOGO);
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

        // Replace the return block in fetchShopDetails:

        // Helper to safely parse Monday column value JSON
        const parseVal = (col: any) => {
            try {
                return col?.value ? JSON.parse(col.value) : null;
            } catch {
                return null;
            }
        };

        const emailCol = getCol(SHOPS_ALL_COLUMN_IDS_MAP.EMAIL);
        const emailParsed = parseVal(emailCol);
        const email =
            emailCol?.text || // try .text first (most reliable)
            emailParsed?.email || // fallback: parsed JSON .email key
            emailParsed?.text || // fallback: parsed JSON .text key
            "";

        // Add a debug log so you can confirm what's coming back
        console.log("email col raw:", emailCol, "parsed:", emailParsed, "resolved:", email);

        // Link column: value JSON is {"url": "...", "text": "..."}
        const websiteParsed = parseVal(getCol(SHOPS_ALL_COLUMN_IDS_MAP.WEBSITE));
        const website = websiteParsed?.url || websiteParsed?.text || "";

        // Phone is text_* column — .text works directly
        const phone = getCol(SHOPS_ALL_COLUMN_IDS_MAP.PHONE)?.text || "";

        return {
            logo: logoUrl,
            contactName: getCol(SHOPS_ALL_COLUMN_IDS_MAP.PRIMARY_CONTACT)?.text || "",
            street: getCol(SHOPS_ALL_COLUMN_IDS_MAP.STREET)?.text || "",
            city: getCol(SHOPS_ALL_COLUMN_IDS_MAP.CITY)?.text || "",
            state: getCol(SHOPS_ALL_COLUMN_IDS_MAP.STATE)?.text || "",
            country: getCol(SHOPS_ALL_COLUMN_IDS_MAP.COUNTRY)?.text || "",
            postalCode: getCol(SHOPS_ALL_COLUMN_IDS_MAP.POSTAL_CODE)?.text || "",
            phone,
            email,
            website,
        };
    };

    const handleGenerateManifest = async () => {
        if (!selectedItemId) return;
        setIsUpdating(true);

        try {
            // 1. Query the Specific Line Item and its parent Order/Customer details
            const itemDataRes: any = await monday.api(`query {
                items(ids: [${selectedItemId}]) {
                    id
                    name
                    column_values {
                        id
                        text
                        ... on BoardRelationValue { linked_item_ids display_value }
                    }
                }
            }`);

            const item = itemDataRes.data.items[0];
            const getVal = (id: string) => item.column_values.find((cv: any) => cv.id === id);

            // Extract Order ID and Supplier ID from the OLI
            const parentOrderId = getVal(ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.ORDER)?.linked_item_ids?.[0];
            const supplierId = getVal(ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SUPPLIER)?.linked_item_ids?.[0];
            const supplierName = getVal(ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SUPPLIER)?.display_value || "N/A";
            const courierName = getVal(ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.COURIERNAME)?.text || "N/A";
            const sku = getVal(ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SKU)?.text || item.name;

            console.log(
                "Parent order id ",
                parentOrderId,
                ", supplier id ",
                supplierId,
                ", supplier name ",
                supplierName,
                ", courier name ",
                courierName,
                ", sku ",
                sku,
            );
            if (!parentOrderId) throw new Error("Order link missing on this line item.");

            // 2. Query Parent Order (Billing Address, Total Price, Payment Method, and Customer Link)
            const orderRes: any = await monday.api(`query {
                items(ids: [${parentOrderId}]) {
                    column_values {
                        id
                        text
                        ... on BoardRelationValue { linked_item_ids }
                    }
                }
            }`);

            const order = orderRes.data.items[0];
            const getOrderVal = (id: string) => order.column_values.find((cv: any) => cv.id === id);

            const billingAddress = getOrderVal(ORDER_ALL_COLUMN_IDS_MAP.BILLING_ADDRESS)?.text || "[Address]";
            const totalPrice = getOrderVal(ORDER_ALL_COLUMN_IDS_MAP.TOTAL_PRICE)?.text || "0";
            const paymentMethod = getOrderVal(ORDER_ALL_COLUMN_IDS_MAP.PAYMENTMETHOD)?.text || "To be paid";
            const customerId = getOrderVal("board_relation_to_customer")?.linked_item_ids?.[0]; // Update with your actual Customer Relation ID

            // 3. Query Customer (Name, Phone, Email)
            let customerData = { name: "[Customer Name]", phone: "[Mobile]", email: "[Email]" };
            if (customerId) {
                const custRes: any = await monday.api(`query {
                items(ids: [${customerId}]) {
                    name
                    column_values { id text }
                }
            }`);
                const cust = custRes.data.items[0];
                customerData = {
                    name: cust.name,
                    phone: cust.column_values.find((cv: any) => cv.id === CUSTOMER_ALL_COLUMN_IDS_MAP.PHONE)?.text || "[Mobile]",
                    email: cust.column_values.find((cv: any) => cv.id === CUSTOMER_ALL_COLUMN_IDS_MAP.EMAIL)?.text || "[Email]",
                };
            }

            // 4. Prepare data for PDF Templates
            const fullItemDetails = {
                ...item,
                sku,
                supplierName,
                courierName,
                orderId: getOrderVal(ORDER_ALL_COLUMN_IDS_MAP.ORDERID)?.text || item.name,
                billingAddress,
                totalPrice,
                paymentMethod,
                customerName: customerData.name,
                customerPhone: customerData.phone,
                customerEmail: customerData.email,
            };
            const now = new Date();
            const timestamp = `${now.getDate()}${now.getMonth() + 1}${now.getFullYear()}_${now.getHours()}${now.getMinutes()}`;
            const manifestName = `${item.supplierName || "NoSupplier"}_${item.courierName || "NoCourier"}_${item.name}_${timestamp}`;
            const columnValues: any = {};

            if (parentOrderId) {
                columnValues[SUPPLIER_MANIFEST_COLUMN_IDS_MAP.ORDER] = { item_ids: [String(parentOrderId)] };
            }
            if (item.id) {
                columnValues[SUPPLIER_MANIFEST_COLUMN_IDS_MAP.ORDER_LINE_ITEM] = { item_ids: [String(item.id)] };
            }
            if (item.supplierId) {
                columnValues[SUPPLIER_MANIFEST_COLUMN_IDS_MAP.SUPPLIER] = { item_ids: [item.supplierId] };
            }

            const shopDetails = await fetchShopDetails();
            console.log("Column values for suppleirManifest record ", columnValues);
            const createRes: any = await monday.api(`mutation {
                create_item (
                    board_id: ${SUPPLIER_MANIFEST_BOARD_ID},
                    item_name: "${manifestName}",
                    column_values: "${JSON.stringify(columnValues).replace(/"/g, '\\"')}"
                ) { id }
            }`);

            const newManifestId = createRes.data.create_item.id;

            // 2. Generate and Upload the PDF
            console.log("orderManifest tsx, handleGenerateManifest methods, generateManifestPDF method 118 line ");
            const manifestBlob = await generateManifestPDF({
                supplierName: item.supplierName,
                courierName: item.courierName,
                lineItems: [item],
                shopDetails,
                manifestName,
            });
            const labelBlob = await generateLabelBlob(); // New HTML-based PDF

            const manifestFile = new File([manifestBlob], `${manifestName}_manifest.pdf`, { type: "application/pdf" });
            const labelFile = new File([labelBlob], `${manifestName}_label.pdf`, { type: "application/pdf" });

            // 3. Upload File to Manifest Column
            await monday.api(
                `mutation ($file: File!) {
                add_file_to_column (
                    item_id: ${newManifestId},
                    column_id: "${SUPPLIER_MANIFEST_COLUMN_IDS_MAP.MANIFEST_FILE}",
                    file: $file
                ) { id }
            }`,
                { variables: { file: manifestFile } },
            );

            await monday.api(
                `mutation ($file: File!) {
                add_file_to_column (item_id: ${newManifestId}, column_id: "${SUPPLIER_MANIFEST_COLUMN_IDS_MAP.LABEL_FILE}", file: $file) { id }
            }`,
                { variables: { file: labelFile } },
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
            <LabelPdfTemplate ref={labelRef} item={allSelectedLineItems.find((li) => li.id === selectedItemId)} />
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
                        {allSelectedLineItems.map((item) => (
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

            <div style={{ display: "flex", gap: "10px", marginTop: "24px", justifyContent: "space-between" }}>
                <div style={{ display: "flex", gap: "10px" }}>
                    <Button disabled={!selectedItemId || isCreating} loading={isCreating} onClick={handleGenerateManifest}>
                        Ready for Manifest Generation
                    </Button>
                </div>
            </div>
        </div>
    );
};