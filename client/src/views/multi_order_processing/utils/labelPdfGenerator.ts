// src/views/multi_order_processing/utils/labelPdfGenerator.ts
import { jsPDF } from "jspdf";
import { ORDERLINEITEMS_ALL_COLUMN_IDS_MAP } from "../constants";

export const generateLabelPDF = async (items: any[]): Promise<Blob> => {
    // Standard 4x6 inch shipping label (101.6mm x 152.4mm)
    const doc = new jsPDF("p", "mm", [101.6, 152.4]);

    const cleanDisplay = (val: any): string => {
        if (!val || val === "N/A" || val === "-" || val === "Null" || val === "[Address]") return "";
        return String(val);
    };

    const getRobustValue = (item: any, colId: string): string => {
        const cv = item.column_values?.find((c: any) => c.id === colId);
        if (!cv) return "";
        return cv.text || cv.display_value || "";
    };

    /**
     * Draws a compact, representational barcode centered within given bounds.
     * Width is constrained so it never bleeds into surrounding sections.
     */
    const drawBarcode = (pdf: jsPDF, centerX: number, startY: number, width: number, height: number) => {
        const startX = centerX - width / 2;
        pdf.setDrawColor(0, 0, 0);
        let currentX = startX;
        let index = 0;

        while (currentX < startX + width) {
            // Alternate between narrow (0.25mm) and wide (0.6mm) bars
            const barWidth = index % 7 === 0 ? 0.6 : index % 3 === 0 ? 0.4 : 0.25;
            pdf.setLineWidth(barWidth);
            pdf.line(currentX, startY, currentX, startY + height);
            // Alternate between narrow and wide gaps
            const gap = index % 5 === 0 ? 0.7 : 0.35;
            currentX += barWidth + gap;
            index++;
        }
    };

    const drawHRule = (pdf: jsPDF, y: number, margin: number, usableWidth: number) => {
        pdf.setLineWidth(0.3);
        pdf.setDrawColor(0);
        pdf.line(margin, y, margin + usableWidth, y);
    };

    items.forEach((item, pageIndex) => {
        if (pageIndex > 0) doc.addPage();

        const PW = 101.6; // page width mm
        const PH = 152.4; // page height mm
        const M = 3.5; // margin mm
        const W = PW - M * 2; // usable width ~94.6mm
        const MID_X = M + W / 2; // horizontal center for barcode

        // ── Outer border ──────────────────────────────────────────────
        doc.setLineWidth(0.5);
        doc.setDrawColor(0);
        doc.rect(M, M, W, PH - M * 2);

        let y = M; // incremental cursor — moves only downward

        // ══════════════════════════════════════════════════════════════
        // SECTION 1 — HEADER: DELIVER TO | SHIPPED BY
        // ══════════════════════════════════════════════════════════════
        const HEADER_H = 34;
        const SPLIT_X = M + W / 2;

        // Vertical divider between the two header columns
        doc.setLineWidth(0.3);
        doc.line(SPLIT_X, y, SPLIT_X, y + HEADER_H);

        // ── Left: Deliver To ──────────────────────────────────────────
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(6.5);
        doc.text("DELIVER TO:", M + 2, y + 4.5);

        doc.setFontSize(8.5);
        doc.text(cleanDisplay(item.customerName) || "—", M + 2, y + 9);

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(6.5);
        const addrText = cleanDisplay(item.billingAddress);
        if (addrText) {
            const addrLines = doc.splitTextToSize(addrText, W / 2 - 5);
            doc.text(addrLines.slice(0, 4), M + 2, y + 13);
        }

        const custPhone = cleanDisplay(item.customerPhone);
        if (custPhone) {
            doc.setFont("Helvetica", "bold");
            doc.setFontSize(6.5);
            doc.text(`MOBILE NO.: ${custPhone}`, M + 2, y + 27);
        }
        const custEmail = cleanDisplay(item.customerEmail);
        if (custEmail) {
            doc.setFont("Helvetica", "normal");
            doc.setFontSize(6);
            doc.text(`Email: ${custEmail}`, M + 2, y + 31);
        }

        // ── Right: Shipped By ────────────────────────────────────────
        const RX = SPLIT_X + 2;
        const rColW = W / 2 - 5;

        doc.setFont("Helvetica", "bold");
        doc.setFontSize(6);
        const returnLabel = doc.splitTextToSize("Shipped By (If undelivered, return to):", rColW);
        doc.text(returnLabel, RX, y + 4.5);

        doc.setFontSize(8);
        doc.text(cleanDisplay(item.supplierName) || "—", RX, y + 11);

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(6);
        const suppAddr = cleanDisplay(item.supplierAddress);
        if (suppAddr) {
            const suppLines = doc.splitTextToSize(suppAddr, rColW);
            doc.text(suppLines.slice(0, 3), RX, y + 15);
        }

        const suppPhone = cleanDisplay(item.supplierPhone);
        if (suppPhone) {
            doc.text(`Phone: ${suppPhone}`, RX, y + 27);
        }
        const suppEmail = cleanDisplay(item.supplierEmail);
        if (suppEmail) {
            doc.text(`Email: ${suppEmail}`, RX, y + 31);
        }

        y += HEADER_H;
        drawHRule(doc, y, M, W);

        // ══════════════════════════════════════════════════════════════
        // SECTION 2 — ORDER # + BARCODE
        // ══════════════════════════════════════════════════════════════
        const ORDER_SECTION_H = 22;

        doc.setFont("Helvetica", "bold");
        doc.setFontSize(10);
        doc.text(`ORDER #: ${cleanDisplay(item.orderId) || "N/A"}`, M + 2, y + 5.5);

        // Compact barcode: 65mm wide, 10mm tall, centered
        drawBarcode(doc, MID_X, y + 8, 65, 10);

        y += ORDER_SECTION_H;
        drawHRule(doc, y, M, W);

        // ══════════════════════════════════════════════════════════════
        // SECTION 3 — WEIGHT / PAYMENT
        // ══════════════════════════════════════════════════════════════
        const PAYMENT_SECTION_H = 20;

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(7);
        doc.text("WEIGHT: 1 | DIMENSIONS: 29×26×23 (cm)", M + 2, y + 5);

        doc.setFont("Helvetica", "bold");
        doc.setFontSize(8);
        const method = item.paymentMethod ? String(item.paymentMethod).toUpperCase() : "CASH ON DELIVERY";
        doc.text(method, M + 2, y + 10.5);

        doc.setFontSize(10);
        doc.text(`COLLECT COD - Rs. ${cleanDisplay(item.totalPrice) || "0"}`, M + 2, y + 16.5);

        y += PAYMENT_SECTION_H;
        drawHRule(doc, y, M, W);

        // ══════════════════════════════════════════════════════════════
        // SECTION 4 — COURIER / AWB + BARCODE
        // ══════════════════════════════════════════════════════════════
        const COURIER_SECTION_H = 22;

        doc.setFont("Helvetica", "bold");
        doc.setFontSize(10);
        doc.text(cleanDisplay(item.courierName) || "Courier", M + 2, y + 5.5);

        doc.setFontSize(7.5);
        doc.text(`AWB #: ${cleanDisplay(item.sku) || "N/A"}`, M + 2, y + 10);

        // Smaller AWB barcode: 65mm wide, 8mm tall, centered
        drawBarcode(doc, MID_X, y + 12, 65, 8);

        y += COURIER_SECTION_H;
        drawHRule(doc, y, M, W);

        // ══════════════════════════════════════════════════════════════
        // SECTION 5 — PRODUCT TABLE
        // ══════════════════════════════════════════════════════════════
        const ROW_H = 5;
        // Column X positions
        const C = { sku: M, item: M + 22, qty: M + 68, price: M + 79 };

        // Header row
        doc.setFillColor(240, 240, 240);
        doc.rect(M, y, W, ROW_H, "FD");
        doc.setLineWidth(0.15);
        [C.item, C.qty, C.price].forEach((cx) => doc.line(cx, y, cx, y + ROW_H));

        doc.setFont("Helvetica", "bold");
        doc.setFontSize(6.5);
        doc.text("SKU", C.sku + 1.5, y + 3.5);
        doc.text("ITEM", C.item + 1.5, y + 3.5);
        doc.text("QTY", C.qty + 1.5, y + 3.5);
        doc.text("PRICE", C.price + 1.5, y + 3.5);

        y += ROW_H;

        // Data row
        doc.rect(M, y, W, ROW_H, "S");
        [C.item, C.qty, C.price].forEach((cx) => doc.line(cx, y, cx, y + ROW_H));

        const rawQty = getRobustValue(item, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.QUANTITY) || "1";
        const qty = parseInt(rawQty) || 1;
        const rawUnitPrice = getRobustValue(item, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.UNITPRICE) || "0";
        const unitPrice = parseFloat(rawUnitPrice.replace(/[^0-9.]/g, "")) || 0;
        const calcTotal = qty * unitPrice;

        const maxSkuChars = 10;
        const maxNameChars = 28;
        const skuDisplay = cleanDisplay(item.sku).substring(0, maxSkuChars);
        const nameDisplay = item.name.length > maxNameChars ? `${item.name.substring(0, maxNameChars - 2)}…` : item.name;

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(6.5);
        doc.text(skuDisplay, C.sku + 1.5, y + 3.5);
        doc.text(nameDisplay, C.item + 1.5, y + 3.5);
        doc.text(String(qty), C.qty + 1.5, y + 3.5);
        doc.text(`Rs. ${unitPrice.toFixed(2)}`, C.price + 1.5, y + 3.5);

        y += ROW_H;

        // Total row
        doc.rect(M, y, W, ROW_H, "S");
        [C.qty, C.price].forEach((cx) => doc.line(cx, y, cx, y + ROW_H));

        doc.setFont("Helvetica", "bold");
        doc.setFontSize(6.5);
        doc.text("TOTAL:", C.sku + 1.5, y + 3.5);
        doc.text(`Rs. ${calcTotal.toFixed(2)}`, C.price + 1.5, y + 3.5);

        y += ROW_H + 3;

        // ══════════════════════════════════════════════════════════════
        // SECTION 6 — INVOICE METADATA
        // ══════════════════════════════════════════════════════════════
        const now = new Date();
        const formattedDate = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        const formattedTime = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(6);
        doc.text(`Invoice No.: ${cleanDisplay(item.orderId) || "N/A"} | Invoice Date: ${formattedDate} at ${formattedTime}`, M + 1, y);

        y += 4;

        // ══════════════════════════════════════════════════════════════
        // SECTION 7 — TERMS & CONDITIONS
        // ══════════════════════════════════════════════════════════════
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(6.5);
        doc.text("TERMS AND CONDITIONS:", M + 1, y);

        y += 3.5;

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(5.8);
        const terms = [
            "1. Visit official website of DTDC Surface 2kg to view the Conditions of Carriage.",
            "2. Shipping charges are inclusive of service tax and all figures are in INR.",
            "3. All disputes will be resolved under Delhi jurisdiction.",
            "4. Sold goods are eligible for return or exchange according to the store's policy.",
        ];
        terms.forEach((term) => {
            doc.text(term, M + 1, y);
            y += 3;
        });

        // ══════════════════════════════════════════════════════════════
        // FOOTER — anchored to bottom of page
        // ══════════════════════════════════════════════════════════════
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(5.5);
        doc.text("THIS IS AN AUTO-GENERATED LABEL AND DOES NOT NEED SIGNATURE.", M + 1, PH - M - 2);
    });

    return doc.output("blob");
};;