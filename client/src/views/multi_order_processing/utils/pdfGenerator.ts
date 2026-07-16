//utils/pdfGenerator.ts
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const PURPLE = [91, 107, 138] as [number, number, number];
const HEADER_BG = [232, 228, 245] as [number, number, number];
const FOOTER_COLOR = [80, 100, 160] as [number, number, number];
const BLACK: [number, number, number] = [0, 0, 0];

let manifestCounter = 10;

export const generateManifestPDF = async (manifestData: any) => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const { supplierName, courierName, lineItems, supplierAddress, supplierPhone } = manifestData;

    const pageW = doc.internal.pageSize.getWidth();  // 297mm
    const pageH = doc.internal.pageSize.getHeight(); // 210mm
    const margin = 10;          // distance from page edge to outer border
    const innerW = pageW - margin * 2; // 277mm usable width
    const pad = 6;              // text padding from border

    // Table uses a 1mm inset from the border edges so cell lines never overlap the rect
    const tblLeft = margin + 1;
    const tblRight = margin + 1;
    const tblW = innerW - 2; // 275mm

    // ── TOP HEADER ────────────────────────────────────────────────────────────
    let y = margin + pad + 6;

    // Left: brand text
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...PURPLE);
    doc.text("Shiprocket", margin + pad, y);

    // Center: title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...BLACK);
    doc.text("Shiprocket Manifest", pageW / 2, y, { align: "center" });

    // Right: Manifest ID + total shipments
    const manifestId = `MANIFEST-${String(manifestCounter++).padStart(4, "0")}`;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...BLACK);
    doc.text(`Manifest ID : ${manifestId}`, pageW - margin - pad, y - 3, { align: "right" });
    doc.text(`Total shipments to dispatch : ${lineItems.length}`, pageW - margin - pad, y + 4, { align: "right" });

    // Center subtitle
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...BLACK);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, pageW / 2, y, { align: "center" });

    // Seller / Courier
    y += 6;
    doc.setFontSize(10);
    doc.setTextColor(...BLACK);
    doc.setFont("helvetica", "normal");
    doc.text("Seller:", margin + pad, y);
    doc.setFont("helvetica", "bold");
    doc.text(supplierName || "-", margin + pad + doc.getTextWidth("Seller:") + 1, y);

    y += 6;
    doc.setFont("helvetica", "normal");
    doc.text("Courier:", margin + pad, y);
    doc.setFont("helvetica", "bold");
    doc.text(courierName || "-", margin + pad + doc.getTextWidth("Courier:") + 1, y);

    // Thin separator
    y += 5;
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.line(margin + 1, y, pageW - margin - 1, y);
    y += 2;

    // ── TABLE ─────────────────────────────────────────────────────────────────
    const COL_SNO = 13;
    const COL_ORDER = 70;
    const COL_CHECK = 12;
    const COL_AWB = 40;
    const COL_CONTENTS = tblW - COL_SNO - COL_ORDER - COL_CHECK - COL_AWB;

    autoTable(doc, {
        startY: y,
        margin: { left: tblLeft, right: tblRight },
        tableWidth: tblW,
        head: [["S.no", "Order no", "", "Awb no", "Contents"]],
        body: lineItems.map((item: any, index: number) => [
            String(index + 1),
            item.orderId || item.orderName || "-",
            "",
            item.awbCode || item.shiprocketOrderId || "-",
            item.sku ? `${item.name} (SKU-${item.sku})` : item.name || "-",
        ]),
        headStyles: {
            fillColor: HEADER_BG,
            textColor: PURPLE,
            fontStyle: "normal",
            fontSize: 10,
            halign: "center",
            lineWidth: 0.3,
            lineColor: [200, 195, 220],
        },
        bodyStyles: {
            fontSize: 9,
            textColor: BLACK,
            halign: "center",
            lineWidth: 0.2,
            lineColor: [200, 200, 200],
        },
        columnStyles: {
            0: { cellWidth: COL_SNO, halign: "center" },
            1: { cellWidth: COL_ORDER, halign: "center" },
            2: { cellWidth: COL_CHECK, halign: "center" },
            3: { cellWidth: COL_AWB, halign: "center" },
            4: { cellWidth: COL_CONTENTS, halign: "center" },
        },
        alternateRowStyles: { fillColor: [250, 249, 255] },
        didDrawCell: (data) => {
            if (data.column.index === 2 && data.section === "body") {
                const { x, y: cy, width, height } = data.cell;
                const boxSize = 4;
                doc.setDrawColor(0);
                doc.setLineWidth(0.4);
                doc.rect(x + (width - boxSize) / 2, cy + (height - boxSize) / 2, boxSize, boxSize);
            }
        },
    });

    // ── BOTTOM SECTION ────────────────────────────────────────────────────────
    let finalY = (doc as any).lastAutoTable.finalY + 6;

    const drawDash = (dy: number) => {
        doc.setLineDashPattern([1.5, 2], 0);
        doc.setLineWidth(0.4);
        doc.setDrawColor(120);
        doc.line(margin + 1, dy, pageW - margin - 1, dy);
        doc.setLineDashPattern([], 0);
    };

    drawDash(finalY);
    finalY += 7;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...BLACK);
    doc.text(`To Be Filled By ${courierName || "Courier"} Logistics Executive`, pageW / 2, finalY, { align: "center" });
    finalY += 5;

    drawDash(finalY);
    finalY += 10;

    const drawField = (label: string, x: number, fy: number, lineLen = 55) => {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(...BLACK);
        doc.text(label, x, fy);
        const lw = doc.getTextWidth(label);
        doc.setDrawColor(0);
        doc.setLineWidth(0.3);
        doc.line(x + lw + 2, fy, x + lw + 2 + lineLen, fy);
    };

    const drawFieldWithValue = (label: string, value: string, x: number, fy: number, lineLen = 55) => {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(...BLACK);
        doc.text(label, x, fy);
        const lw = doc.getTextWidth(label);
        doc.text(value, x + lw + 2, fy);
        const vw = doc.getTextWidth(value);
        doc.setDrawColor(0);
        doc.setLineWidth(0.3);
        // underline under the value
        doc.line(x + lw + 2, fy + 0.5, x + lw + 2 + vw + 2, fy + 0.5);
        // rest of the line
        if (x + lw + 2 + vw + 6 < x + lw + 2 + lineLen) {
            doc.line(x + lw + 2 + vw + 6, fy + 0.5, x + lw + 2 + lineLen, fy + 0.5);
        }
    };

    const col1X = margin + pad;
    const col2X = pageW / 2 + 10;
    const rowGap = 14;

    drawField("Pick up time :", col1X, finalY, 55);
    drawField("Total items picked:", col2X, finalY, 45);
    finalY += rowGap;

    drawField("FE Name:", col1X, finalY, 55);
    drawFieldWithValue("Seller Name:", supplierName || "", col2X, finalY, 55);
    finalY += rowGap;

    drawField("FE Signature:", col1X, finalY, 55);
    drawField("Seller Signature:", col2X, finalY, 45);
    finalY += rowGap;

    drawField("FE Phone:", col1X, finalY, 55);

    // ── FOOTER ────────────────────────────────────────────────────────────────
    finalY += rowGap + 4;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...FOOTER_COLOR);

    if (supplierAddress) {
        const addrLines = doc.splitTextToSize(supplierAddress, innerW - pad * 2);
        doc.text(addrLines, pageW / 2, finalY, { align: "center" });
        finalY += addrLines.length * 5;
    }

    if (supplierPhone) {
        const label = "Contact : ";
        doc.setFont("helvetica", "bold");
        const lw = doc.getTextWidth(label);
        doc.setFont("helvetica", "normal");
        const vw = doc.getTextWidth(supplierPhone);
        const cx = (pageW - lw - vw) / 2;
        doc.setFont("helvetica", "bold");
        doc.text(label, cx, finalY);
        doc.setFont("helvetica", "normal");
        doc.text(supplierPhone, cx + lw, finalY);
        finalY += 6;
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...BLACK);
    doc.text("This is a system generated document", pageW / 2, finalY, { align: "center" });

    // ── OUTER BORDER drawn LAST so it renders on top of any table overflow ────
    doc.setDrawColor(...BLACK);
    doc.setLineWidth(0.6);
    doc.rect(margin, margin, innerW, pageH - margin * 2);

    return doc.output("blob");
};

const fetchLogoAsBase64 = async (url: string): Promise<string | null> => {
    try {
        const response = await fetch(url, { credentials: "include" });
        if (!response.ok) return null;
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
};
