// src/views/multi_order_processing/utils/labelPdfGenerator.ts
import { jsPDF } from "jspdf";
import { ORDERLINEITEMS_ALL_COLUMN_IDS_MAP } from "../constants";

export const generateLabelPDF = async (items: any[]): Promise<Blob> => {
    // Standard 4×6 inch shipping label  (101.6 mm × 152.4 mm)
    const doc = new jsPDF("p", "mm", [101.6, 152.4]);

    const cleanDisplay = (val: any): string => {
        if (!val || val === "N/A" || val === "-" || val === "Null" || val === "[Address]") return "";
        return String(val);
    };

    const getRobustValue = (item: any, colId: string): string => {
        const cv = item.column_values?.find((c: any) => c.id === colId);
        if (!cv) return "";
        return cv.display_value || cv.text || "";
    };

    // Compact representational barcode (Code-128 style)
    const drawBarcode = (pdf: jsPDF, centerX: number, startY: number, width: number, height: number) => {
        const startX = centerX - width / 2;
        pdf.setDrawColor(0);
        let x = startX;
        let i = 0;
        while (x < startX + width) {
            const bw = i % 7 === 0 ? 0.65 : i % 3 === 0 ? 0.4 : 0.22;
            pdf.setLineWidth(bw);
            pdf.line(x, startY, x, startY + height);
            x += bw + (i % 5 === 0 ? 0.7 : 0.35);
            i++;
        }
    };

    const hRule = (y: number, lx: number, rx: number) => {
        doc.setLineWidth(0.25);
        doc.setDrawColor(0);
        doc.line(lx, y, rx, y);
    };

    items.forEach((item, pageIndex) => {
        if (pageIndex > 0) doc.addPage();

        // ── Page geometry ─────────────────────────────────────────────
        const PW = 101.6;
        const PH = 152.4;
        const M = 4; // outer margin
        const W = PW - M * 2; // ≈ 93.6 mm usable width
        const LX = M;
        const RX = M + W;
        const MID = M + W / 2;
        const PAD = 2.5; // inner horizontal text padding

        // ── Section heights (must total ≤ PH - 2*M - footer gap) ─────
        //   Budget: 152.4 - 8 - 6(footer zone) = 138.4 mm
        //   Total below: 34+19+15+17 + 3×5 + 3.5+14.5 = 118 mm  → ~20 mm whitespace
        const HEADER_H = 34; // deliver-to / shipped-by
        const ORDER_H = 19; // order # + barcode
        const PAYMENT_H = 15; // weight / COD
        const COURIER_H = 17; // courier + AWB barcode
        const ROW_H = 5; // each table row (3 rows = 15 mm)

        // Outer border
        doc.setLineWidth(0.5);
        doc.setDrawColor(0);
        doc.rect(M, M, W, PH - M * 2);

        let y = M; // incremental y-cursor

        // ═════════════════════════════════════════════════════════════
        // SECTION 1 — HEADER: DELIVER TO (left) | SHIPPED BY (right)
        // ═════════════════════════════════════════════════════════════
        const SPLIT = MID;
        const colW = W / 2 - PAD - 2;

        doc.setLineWidth(0.25);
        doc.line(SPLIT, y, SPLIT, y + HEADER_H); // vertical divider

        // ── Left: Deliver To ────────────────────────────────────────
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(6);
        doc.text("DELIVER TO:", LX + PAD, y + 4.5);

        doc.setFontSize(8.5);
        doc.text(cleanDisplay(item.customerName) || "—", LX + PAD, y + 9);

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(6);
        const addrText = cleanDisplay(item.billingAddress);
        if (addrText) {
            const lines = doc.splitTextToSize(addrText, colW);
            doc.text(lines.slice(0, 4), LX + PAD, y + 13.5);
        }

        const custPhone = cleanDisplay(item.customerPhone);
        if (custPhone) {
            doc.setFont("Helvetica", "bold");
            doc.setFontSize(6);
            doc.text(`MOBILE NO.: ${custPhone}`, LX + PAD, y + 27);
        }
        const custEmail = cleanDisplay(item.customerEmail);
        if (custEmail) {
            doc.setFont("Helvetica", "normal");
            doc.setFontSize(5.5);
            doc.text(`Email: ${custEmail}`, LX + PAD, y + 31);
        }

        // ── Right: Shipped By ────────────────────────────────────────
        const RCol = SPLIT + PAD;

        doc.setFont("Helvetica", "bold");
        doc.setFontSize(5.5);
        const retLabel = doc.splitTextToSize("Shipped By (If undelivered, return to):", colW);
        doc.text(retLabel, RCol, y + 4.5);

        doc.setFontSize(8);
        doc.text(cleanDisplay(item.supplierName) || "—", RCol, y + 11);

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(5.8);
        const suppAddr = cleanDisplay(item.supplierAddress);
        if (suppAddr) {
            const lines = doc.splitTextToSize(suppAddr, colW);
            doc.text(lines.slice(0, 3), RCol, y + 15.5);
        }

        const suppPhone = cleanDisplay(item.supplierPhone);
        if (suppPhone) {
            doc.text(`Phone: ${suppPhone}`, RCol, y + 27);
        }
        const suppEmail = cleanDisplay(item.supplierEmail);
        if (suppEmail) {
            doc.text(`Email: ${suppEmail}`, RCol, y + 31);
        }

        y += HEADER_H;
        hRule(y, LX, RX);

        // ═════════════════════════════════════════════════════════════
        // SECTION 2 — ORDER # + BARCODE
        // ═════════════════════════════════════════════════════════════
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(10);
        doc.text(`ORDER #: ${cleanDisplay(item.orderId) || "N/A"}`, LX + PAD, y + 5.5);

        // 70 mm wide × 10 mm tall, centred
        drawBarcode(doc, MID, y + 7.5, 70, 10);

        y += ORDER_H;
        hRule(y, LX, RX);

        // ═════════════════════════════════════════════════════════════
        // SECTION 3 — WEIGHT / PAYMENT METHOD / COD AMOUNT
        // ═════════════════════════════════════════════════════════════
        doc.setFont("Helvetica", "normal");
        doc.setFontSize(6.5);
        doc.text("WEIGHT: 1 | DIMENSIONS: 29×26×23 (cm)", LX + PAD, y + 4.5);

        doc.setFont("Helvetica", "bold");
        doc.setFontSize(7.5);
        const method = item.paymentMethod ? String(item.paymentMethod).toUpperCase() : "CASH ON DELIVERY";
        doc.text(method, LX + PAD, y + 9.5);

        doc.setFontSize(9.5);
        doc.text(`COLLECT COD - Rs. ${cleanDisplay(item.totalPrice) || "0.00"}`, LX + PAD, y + 14);

        y += PAYMENT_H;
        hRule(y, LX, RX);

        // ═════════════════════════════════════════════════════════════
        // SECTION 4 — COURIER NAME + AWB BARCODE
        // ═════════════════════════════════════════════════════════════
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(9.5);
        doc.text(cleanDisplay(item.courierName) || "Courier", LX + PAD, y + 5);

        doc.setFontSize(7);
        doc.text(`AWB #: ${cleanDisplay(item.sku) || "N/A"}`, LX + PAD, y + 9.5);

        // 68 mm wide × 7 mm tall, centred
        drawBarcode(doc, MID, y + 11, 68, 7);

        y += COURIER_H;
        hRule(y, LX, RX);

        // ═════════════════════════════════════════════════════════════
        // SECTION 5 — PRODUCT TABLE
        // ═════════════════════════════════════════════════════════════
        const C = { sku: LX, item: LX + 20, qty: LX + 66, price: LX + 77 };
        const vCols = [C.item, C.qty, C.price];
        const drawVLines = (top: number, h: number) => vCols.forEach((cx) => doc.line(cx, top, cx, top + h));

        // Header row
        doc.setFillColor(242, 242, 242);
        doc.rect(LX, y, W, ROW_H, "FD");
        doc.setLineWidth(0.12);
        drawVLines(y, ROW_H);

        doc.setFont("Helvetica", "bold");
        doc.setFontSize(6.5);
        doc.text("SKU", C.sku + 1.5, y + ROW_H - 1.3);
        doc.text("ITEM", C.item + 1.5, y + ROW_H - 1.3);
        doc.text("QTY", C.qty + 1.5, y + ROW_H - 1.3);
        doc.text("PRICE", C.price + 1.5, y + ROW_H - 1.3);

        y += ROW_H;

        // Data row
        doc.rect(LX, y, W, ROW_H, "S");
        drawVLines(y, ROW_H);

        const rawQty = getRobustValue(item, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.QUANTITY) || "1";
        const qty = parseInt(rawQty) || 1;
        const rawUnit = getRobustValue(item, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.UNITPRICE) || "0";
        const unitPrice = parseFloat(rawUnit.replace(/[^0-9.]/g, "")) || 0;
        const calcTotal = qty * unitPrice;

        const skuDisplay = cleanDisplay(item.sku).substring(0, 11);
        const maxName = 28;
        const nameDisplay = item.name.length > maxName ? `${item.name.substring(0, maxName - 1)}…` : item.name;

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(6.5);
        doc.text(skuDisplay, C.sku + 1.5, y + ROW_H - 1.3);
        doc.text(nameDisplay, C.item + 1.5, y + ROW_H - 1.3);
        doc.text(String(qty), C.qty + 1.5, y + ROW_H - 1.3);
        doc.text(`Rs. ${unitPrice.toFixed(2)}`, C.price + 1.5, y + ROW_H - 1.3);

        y += ROW_H;

        // Total row
        doc.rect(LX, y, W, ROW_H, "S");
        [C.qty, C.price].forEach((cx) => doc.line(cx, y, cx, y + ROW_H));

        doc.setFont("Helvetica", "bold");
        doc.setFontSize(6.5);
        doc.text("TOTAL:", C.sku + 1.5, y + ROW_H - 1.3);
        doc.text(`Rs. ${calcTotal.toFixed(2)}`, C.price + 1.5, y + ROW_H - 1.3);

        y += ROW_H + 3;

        // ═════════════════════════════════════════════════════════════
        // SECTION 6 — INVOICE METADATA
        // ═════════════════════════════════════════════════════════════
        const now = new Date();
        const dStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        const tStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(5.8);
        doc.text(`Invoice No.: ${cleanDisplay(item.orderId) || "N/A"} | Invoice Date: ${dStr} at ${tStr}`, LX + 1, y);

        y += 4;

        // ═════════════════════════════════════════════════════════════
        // SECTION 7 — TERMS & CONDITIONS
        // ═════════════════════════════════════════════════════════════
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(6);
        doc.text("TERMS AND CONDITIONS:", LX + 1, y);

        y += 3.5;

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(5.5);
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

        // ═════════════════════════════════════════════════════════════
        // FOOTER — anchored to bottom of border
        // ═════════════════════════════════════════════════════════════
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(5);
        doc.text("THIS IS AN AUTO-GENERATED LABEL AND DOES NOT NEED SIGNATURE.", LX + 1, PH - M - 2);
    });

    return doc.output("blob");
};