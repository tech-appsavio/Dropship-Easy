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
     * Draws a representational barcode centered at centerX.
     * Narrow/medium/wide bars simulate a Code-128 look.
     */
    const drawBarcode = (pdf: jsPDF, centerX: number, startY: number, width: number, height: number) => {
        const startX = centerX - width / 2;
        pdf.setDrawColor(0, 0, 0);
        let x = startX;
        let i = 0;
        while (x < startX + width) {
            const bw = i % 7 === 0 ? 0.7 : i % 3 === 0 ? 0.45 : 0.25;
            pdf.setLineWidth(bw);
            pdf.line(x, startY, x, startY + height);
            const gap = i % 5 === 0 ? 0.75 : 0.38;
            x += bw + gap;
            i++;
        }
    };

    const hRule = (pdf: jsPDF, y: number, lx: number, rx: number) => {
        pdf.setLineWidth(0.3);
        pdf.setDrawColor(0);
        pdf.line(lx, y, rx, y);
    };

    items.forEach((item, pageIndex) => {
        if (pageIndex > 0) doc.addPage();

        // ── Page constants ────────────────────────────────────────────
        const PW = 101.6; // page width  mm
        const PH = 152.4; // page height mm
        const M = 3.5; // outer margin mm
        const W = PW - M * 2; // usable width ≈ 94.6 mm
        const LX = M; // left content edge
        const RX = M + W; // right content edge
        const MID = M + W / 2; // horizontal centre
        const PAD = 2; // inner horizontal text pad

        // Section heights — tuned so content ends ~141 mm from top,
        // leaving ≈6 mm natural whitespace before the footer at ~147 mm.
        const HEADER_H = 40; // DELIVER TO | SHIPPED BY
        const ORDER_H = 23; // ORDER # + barcode
        const PAYMENT_H = 18; // weight / COD
        const COURIER_H = 20; // courier + AWB barcode
        const ROW_H = 5.5; // each table row

        // Outer border
        doc.setLineWidth(0.5);
        doc.setDrawColor(0);
        doc.rect(M, M, W, PH - M * 2);

        let y = M; // ← incremental y-cursor

        // ══════════════════════════════════════════════════════════════
        // SECTION 1 — HEADER: DELIVER TO (left) | SHIPPED BY (right)
        // ══════════════════════════════════════════════════════════════
        const SPLIT = MID;
        const colW = W / 2 - PAD - 2; // max text width per column

        // Vertical divider
        doc.setLineWidth(0.3);
        doc.line(SPLIT, y, SPLIT, y + HEADER_H);

        // ── Left: Deliver To ─────────────────────────────────────────
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(7);
        doc.text("DELIVER TO:", LX + PAD, y + 5);

        doc.setFontSize(10);
        doc.text(cleanDisplay(item.customerName) || "—", LX + PAD, y + 10);

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(7);
        const addrText = cleanDisplay(item.billingAddress);
        if (addrText) {
            const addrLines = doc.splitTextToSize(addrText, colW);
            doc.text(addrLines.slice(0, 4), LX + PAD, y + 15);
        }

        const custPhone = cleanDisplay(item.customerPhone);
        if (custPhone) {
            doc.setFont("Helvetica", "bold");
            doc.setFontSize(7);
            doc.text(`MOBILE NO.: ${custPhone}`, LX + PAD, y + 30);
        }
        const custEmail = cleanDisplay(item.customerEmail);
        if (custEmail) {
            doc.setFont("Helvetica", "normal");
            doc.setFontSize(6.5);
            doc.text(`Email: ${custEmail}`, LX + PAD, y + 35);
        }

        // ── Right: Shipped By ────────────────────────────────────────
        const RCol = SPLIT + PAD;

        doc.setFont("Helvetica", "bold");
        doc.setFontSize(6.5);
        const retLabel = doc.splitTextToSize("Shipped By (If undelivered, return to):", colW);
        doc.text(retLabel, RCol, y + 5);

        doc.setFontSize(9);
        doc.text(cleanDisplay(item.supplierName) || "—", RCol, y + 12);

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(6.5);
        const suppAddr = cleanDisplay(item.supplierAddress);
        if (suppAddr) {
            const suppLines = doc.splitTextToSize(suppAddr, colW);
            doc.text(suppLines.slice(0, 3), RCol, y + 17);
        }

        const suppPhone = cleanDisplay(item.supplierPhone);
        if (suppPhone) {
            doc.text(`Phone: ${suppPhone}`, RCol, y + 30);
        }
        const suppEmail = cleanDisplay(item.supplierEmail);
        if (suppEmail) {
            doc.text(`Email: ${suppEmail}`, RCol, y + 35);
        }

        y += HEADER_H;
        hRule(doc, y, LX, RX);

        // ══════════════════════════════════════════════════════════════
        // SECTION 2 — ORDER # + BARCODE
        // ══════════════════════════════════════════════════════════════
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(12);
        doc.text(`ORDER #: ${cleanDisplay(item.orderId) || "N/A"}`, LX + PAD, y + 6);

        // 75 mm wide × 12 mm tall, centred on page
        drawBarcode(doc, MID, y + 9, 75, 12);

        y += ORDER_H;
        hRule(doc, y, LX, RX);

        // ══════════════════════════════════════════════════════════════
        // SECTION 3 — WEIGHT / PAYMENT METHOD / COD AMOUNT
        // ══════════════════════════════════════════════════════════════
        doc.setFont("Helvetica", "normal");
        doc.setFontSize(7.5);
        doc.text("WEIGHT: 1 | DIMENSIONS: 29×26×23 (cm)", LX + PAD, y + 5);

        doc.setFont("Helvetica", "bold");
        doc.setFontSize(9);
        const method = item.paymentMethod ? String(item.paymentMethod).toUpperCase() : "CASH ON DELIVERY";
        doc.text(method, LX + PAD, y + 10.5);

        doc.setFontSize(11);
        doc.text(`COLLECT COD - Rs. ${cleanDisplay(item.totalPrice) || "0"}`, LX + PAD, y + 16);

        y += PAYMENT_H;
        hRule(doc, y, LX, RX);

        // ══════════════════════════════════════════════════════════════
        // SECTION 4 — COURIER NAME + AWB BARCODE
        // ══════════════════════════════════════════════════════════════
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(11);
        doc.text(cleanDisplay(item.courierName) || "Courier", LX + PAD, y + 5.5);

        doc.setFontSize(8);
        doc.text(`AWB #: ${cleanDisplay(item.sku) || "N/A"}`, LX + PAD, y + 10.5);

        // 72 mm wide × 8 mm tall, centred on page
        drawBarcode(doc, MID, y + 12, 72, 8);

        y += COURIER_H;
        hRule(doc, y, LX, RX);

        // ══════════════════════════════════════════════════════════════
        // SECTION 5 — PRODUCT TABLE
        // ══════════════════════════════════════════════════════════════
        const C = {
            sku: LX,
            item: LX + 22,
            qty: LX + 68,
            price: LX + 79,
        };
        const vLines = [C.item, C.qty, C.price];
        const drawVLines = (top: number, h: number) => vLines.forEach((cx) => doc.line(cx, top, cx, top + h));

        // Header row (shaded)
        doc.setFillColor(240, 240, 240);
        doc.rect(LX, y, W, ROW_H, "FD");
        doc.setLineWidth(0.15);
        drawVLines(y, ROW_H);

        doc.setFont("Helvetica", "bold");
        doc.setFontSize(7);
        doc.text("SKU", C.sku + 1.5, y + ROW_H - 1.5);
        doc.text("ITEM", C.item + 1.5, y + ROW_H - 1.5);
        doc.text("QTY", C.qty + 1.5, y + ROW_H - 1.5);
        doc.text("PRICE", C.price + 1.5, y + ROW_H - 1.5);

        y += ROW_H;

        // Data row
        doc.rect(LX, y, W, ROW_H, "S");
        drawVLines(y, ROW_H);

        const rawQty = getRobustValue(item, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.QUANTITY) || "1";
        const qty = parseInt(rawQty) || 1;
        const rawUnit = getRobustValue(item, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.UNITPRICE) || "0";
        const unitPrice = parseFloat(rawUnit.replace(/[^0-9.]/g, "")) || 0;
        const calcTotal = qty * unitPrice;

        const skuDisplay = cleanDisplay(item.sku).substring(0, 12);
        const maxName = 30;
        const nameDisplay = item.name.length > maxName ? `${item.name.substring(0, maxName - 1)}…` : item.name;

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(7);
        doc.text(skuDisplay, C.sku + 1.5, y + ROW_H - 1.5);
        doc.text(nameDisplay, C.item + 1.5, y + ROW_H - 1.5);
        doc.text(String(qty), C.qty + 1.5, y + ROW_H - 1.5);
        doc.text(`Rs. ${unitPrice.toFixed(2)}`, C.price + 1.5, y + ROW_H - 1.5);

        y += ROW_H;

        // Total row
        doc.rect(LX, y, W, ROW_H, "S");
        [C.qty, C.price].forEach((cx) => doc.line(cx, y, cx, y + ROW_H));

        doc.setFont("Helvetica", "bold");
        doc.setFontSize(7);
        doc.text("TOTAL:", C.sku + 1.5, y + ROW_H - 1.5);
        doc.text(`Rs. ${calcTotal.toFixed(2)}`, C.price + 1.5, y + ROW_H - 1.5);

        y += ROW_H + 3;

        // ══════════════════════════════════════════════════════════════
        // SECTION 6 — INVOICE METADATA
        // ══════════════════════════════════════════════════════════════
        const now = new Date();
        const dStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        const tStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(6.5);
        doc.text(`Invoice No.: ${cleanDisplay(item.orderId) || "N/A"} | Invoice Date: ${dStr} at ${tStr}`, LX + 1, y);

        y += 4;

        // ══════════════════════════════════════════════════════════════
        // SECTION 7 — TERMS & CONDITIONS
        // ══════════════════════════════════════════════════════════════
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(7);
        doc.text("TERMS AND CONDITIONS:", LX + 1, y);

        y += 3.5;

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(6.2);
        const terms = [
            "1. Visit official website of DTDC Surface 2kg to view the Conditions of Carriage.",
            "2. Shipping charges are inclusive of service tax and all figures are in INR.",
            "3. All disputes will be resolved under Delhi jurisdiction.",
            "4. Sold goods are eligible for return or exchange according to the store's policy.",
        ];
        terms.forEach((term) => {
            doc.text(term, LX + 1, y);
            y += 3;
        });

        // ══════════════════════════════════════════════════════════════
        // FOOTER — fixed to bottom inside the border
        // ══════════════════════════════════════════════════════════════
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(5.5);
        doc.text("THIS IS AN AUTO-GENERATED LABEL AND DOES NOT NEED SIGNATURE.", LX + 1, PH - M - 2);
    });

    return doc.output("blob");
};