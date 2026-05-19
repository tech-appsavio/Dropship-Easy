// src/views/multi_order_processing/utils/labelPdfGenerator.ts
import { jsPDF } from "jspdf";
import { ORDERLINEITEMS_ALL_COLUMN_IDS_MAP } from "../constants";

export const generateLabelPDF = async (items: any[]): Promise<Blob> => {
    // Initialize jsPDF with standard 4x6 inch dimension specs (101.6mm x 152.4mm)
    const doc = new jsPDF("p", "mm", [101.6, 152.4]);

    const cleanDisplay = (val: any) => {
        if (!val || val === "N/A" || val === "-" || val === "Null" || val === "[Address]") return "";
        return String(val);
    };

    const getRobustValue = (item: any, colId: string) => {
        const cv = item.column_values?.find((c: any) => c.id === colId);
        if (!cv) return "";
        return cv.text || cv.display_value || "";
    };

    // Generates a compact razor-sharp vector barcode structure page-by-page
    const drawCrispBarcode = (pdf: jsPDF, startX: number, startY: number, totalWidth: number, height: number) => {
        pdf.setLineWidth(0.3);
        pdf.setDrawColor(0, 0, 0);
        let currentX = startX;
        let index = 0;

        while (currentX < startX + totalWidth) {
            const barWidth = index % 3 === 0 ? 0.7 : index % 5 === 0 ? 0.2 : 0.4;
            pdf.setLineWidth(barWidth);
            pdf.line(currentX, startY, currentX, startY + height);

            const gap = index % 4 === 0 ? 0.9 : 0.4;
            currentX += barWidth + gap;
            index++;
        }
    };

    items.forEach((item, index) => {
        if (index > 0) doc.addPage();

        const pageWidth = 101.6;
        const pageHeight = 152.4;
        const margin = 4; // Compressed page gutter margin to rescue printable height

        // 1. Solid Outer Border Boundary
        doc.setLineWidth(0.6);
        doc.setDrawColor(0, 0, 0);
        doc.rect(margin, margin, pageWidth - margin * 2, pageHeight - margin * 2);

        // 2. Section Separators (Top horizontal grid layout split)
        const middleY = 38; // Compressed from 48 to rescue header space
        doc.setLineWidth(0.4);
        doc.line(margin, middleY, pageWidth - margin, middleY);

        const splitX = 54;
        doc.line(splitX, margin, splitX, middleY);

        // --- SECTION 1: DELIVER TO ---
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(8); // Reduced font sizes globally to prevent oversized scaling text
        doc.text("DELIVER TO:", margin + 2, margin + 4);

        doc.setFontSize(9);
        doc.text(cleanDisplay(item.customerName), margin + 2, margin + 8);

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(7.5);
        const addressLines = doc.splitTextToSize(cleanDisplay(item.billingAddress), splitX - margin - 4);
        doc.text(addressLines, margin + 2, margin + 12);

        const customerPhone = cleanDisplay(item.customerPhone);
        if (customerPhone) {
            doc.setFont("Helvetica", "bold");
            doc.setFontSize(8);
            doc.text(`MOBILE NO.: ${customerPhone}`, margin + 2, middleY - 4);
        }

        const customerEmail = cleanDisplay(item.customerEmail);
        if (customerEmail) {
            doc.setFont("Helvetica", "normal");
            doc.setFontSize(7);
            doc.text(`Email: ${customerEmail}`, margin + 2, middleY - 1);
        }

        // --- SECTION 3: SHIPPED BY ---
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(7);
        const returnLabelLines = doc.splitTextToSize("Shipped By (If undelivered, return to):", pageWidth - splitX - 5);
        doc.text(returnLabelLines, splitX + 2, margin + 4);

        doc.setFontSize(8.5);
        doc.text(cleanDisplay(item.supplierName), splitX + 2, margin + 10);

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(7.5);
        const supplierAddressLines = doc.splitTextToSize(cleanDisplay(item.supplierAddress), pageWidth - splitX - 6);
        doc.text(supplierAddressLines, splitX + 2, margin + 14);

        const supplierPhone = cleanDisplay(item.supplierPhone);
        if (supplierPhone) {
            doc.text(`Phone: ${supplierPhone}`, splitX + 2, middleY - 4);
        }
        const supplierEmail = cleanDisplay(item.supplierEmail);
        if (supplierEmail) {
            doc.text(`Email: ${supplierEmail}`, splitX + 2, middleY - 1);
        }

        // --- SECTION 2: ORDER INFO BLOCK ---
        const section2BottomY = 66; // Compressed from 84 to rescue table visibility
        doc.setLineWidth(0.4);
        doc.line(margin, section2BottomY, pageWidth - margin, section2BottomY);

        doc.setFont("Helvetica", "bold");
        doc.setFontSize(10);
        doc.text(`ORDER #: ${cleanDisplay(item.orderId)}`, margin + 2, middleY + 5);

        // Shrunk barcode height to 12mm to save downstream structural volume
        drawCrispBarcode(doc, margin + 3, middleY + 8, pageWidth - margin * 2 - 6, 12);

        // --- SECTION 4: WEIGHT & DIMENSIONS ---
        const section4BottomY = 90; // Compressed from 114
        doc.line(margin, section4BottomY, pageWidth - margin, section4BottomY);

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(8);
        doc.text("WEIGHT: 1 | DIMENSIONS: 29×26×23 (cm)", margin + 2, section2BottomY + 4);

        doc.setFont("Helvetica", "bold");
        doc.setFontSize(9);
        const method = item.paymentMethod ? String(item.paymentMethod).toUpperCase() : "CASH ON DELIVERY";
        doc.text(method, margin + 2, section2BottomY + 9);

        doc.setFontSize(11);
        doc.text(`COLLECT COD - Rs. ${cleanDisplay(item.totalPrice)}`, margin + 2, section2BottomY + 17);

        // --- SECTION 5: COURIER ROUTING ---
        const section5BottomY = 114; // Compressed from 144
        doc.line(margin, section5BottomY, pageWidth - margin, section5BottomY);

        doc.setFont("Helvetica", "bold");
        doc.setFontSize(11);
        doc.text(cleanDisplay(item.courierName), margin + 2, section4BottomY + 5);

        doc.setFontSize(8.5);
        doc.text(`AWB #: ${cleanDisplay(item.sku)}`, margin + 2, section4BottomY + 9);

        // Shrunk secondary routing barcode track to 9mm height
        drawCrispBarcode(doc, margin + 3, section4BottomY + 11, pageWidth - margin * 2 - 6, 9);

        // ==========================================
        // PROPORTIONAL TABLE & TERMS INJECTION
        // ==========================================

        // --- 1. PRODUCT DETAILS ITEMIZATION TABLE ---
        const tableStartY = section5BottomY + 2;
        const rowHeight = 4.5; // Compact rows to ensure full visibility

        const colX = {
            sku: margin,
            item: margin + 22,
            qty: margin + 66,
            price: margin + 76,
        };

        // Header Box Mesh
        doc.setFillColor(245, 245, 245);
        doc.rect(margin, tableStartY, pageWidth - margin * 2, rowHeight, "F");
        doc.setLineWidth(0.15);
        doc.rect(margin, tableStartY, pageWidth - margin * 2, rowHeight, "S");

        doc.setFont("Helvetica", "bold");
        doc.setFontSize(7);
        doc.text("SKU", colX.sku + 1.5, tableStartY + 3.2);
        doc.text("ITEM", colX.item + 1.5, tableStartY + 3.2);
        doc.text("QTY", colX.qty + 1.5, tableStartY + 3.2);
        doc.text("PRICE", colX.price + 1.5, tableStartY + 3.2);

        doc.line(colX.item, tableStartY, colX.item, tableStartY + rowHeight);
        doc.line(colX.qty, tableStartY, colX.qty, tableStartY + rowHeight);
        doc.line(colX.price, tableStartY, colX.price, tableStartY + rowHeight);

        // Body Row Generation
        const bodyY = tableStartY + rowHeight;
        doc.rect(margin, bodyY, pageWidth - margin * 2, rowHeight, "S");
        doc.setFont("Helvetica", "normal");
        doc.setFontSize(6.5);

        const rawQty = getRobustValue(item, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.QUANTITY) || "1";
        const qty = parseInt(rawQty) || 1;
        const rawUnitPrice = getRobustValue(item, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.UNITPRICE) || "0";
        const unitPrice = parseFloat(rawUnitPrice.replace(/[^0-9.]/g, "")) || 0;
        const calculatedTotalPrice = qty * unitPrice;

        const truncatedName = item.name.length > 32 ? `${item.name.substring(0, 30)}...` : item.name;
        doc.text(cleanDisplay(item.sku), colX.sku + 1.5, bodyY + 3.2);
        doc.text(truncatedName, colX.item + 1.5, bodyY + 3.2);
        doc.text(String(qty), colX.qty + 1.5, bodyY + 3.2);
        doc.text(`Rs. ${unitPrice.toFixed(2)}`, colX.price + 1.5, bodyY + 3.2);

        doc.line(colX.item, bodyY, colX.item, bodyY + rowHeight);
        doc.line(colX.qty, bodyY, colX.qty, bodyY + rowHeight);
        doc.line(colX.price, bodyY, colX.price, bodyY + rowHeight);

        // --- 2. TOTAL ACCUMULATION ROW ---
        const totalY = bodyY + rowHeight;
        doc.rect(margin, totalY, pageWidth - margin * 2, rowHeight, "S");
        doc.setFont("Helvetica", "bold");
        doc.text("TOTAL:", colX.sku + 1.5, totalY + 3.2);
        doc.text(`Rs. ${calculatedTotalPrice.toFixed(2)}`, colX.price + 1.5, totalY + 3.2);

        doc.line(colX.qty, totalY, colX.qty, totalY + rowHeight);
        doc.line(colX.price, totalY, colX.price, totalY + rowHeight);

        // --- 3. INVOICE METADATA ROW ---
        const metadataY = totalY + rowHeight + 3;
        doc.setFont("Helvetica", "normal");
        doc.setFontSize(7);
        const invoiceNo = cleanDisplay(item.orderId) || "N/A";
        const now = new Date();
        const formattedDate = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        const formattedTime = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });

        doc.text(`Invoice No.: ${invoiceNo} | Invoice Date: ${formattedDate} at ${formattedTime}`, margin + 0.5, metadataY);

        // --- 4. TERMS & CONDITIONS SECTION ---
        const tcStartY = metadataY + 3.5;
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(7);
        doc.text("TERMS AND CONDITIONS:", margin + 0.5, tcStartY);

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(6.2); // Tightly scaled line heights to protect cutoff space
        const terms = [
            "1. Visit official website of DTDC Surface 2kg to view the Conditions of Carriage.",
            "2. Shipping charges are inclusive of service tax and all figures are in INR.",
            "3. All disputes will be resolved under Delhi jurisdiction.",
            "4. Sold goods are eligible for return or exchange according to the store's policy.",
        ];

        terms.forEach((term, tIdx) => {
            doc.text(term, margin + 0.5, tcStartY + 2.8 + tIdx * 2.5);
        });

        // Footnote system disclaimer safely tucked right above the bottom margin
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(6.5);
        doc.text("THIS IS AN AUTO-GENERATED LABEL AND DOES NOT NEED SIGNATURE.", margin + 0.5, pageHeight - margin - 2);
    });

    return doc.output("blob");
};