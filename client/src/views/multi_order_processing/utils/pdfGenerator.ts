//utils/pdfGenerator.ts
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export const generateManifestPDF = async (manifestData: any) => {
    const doc = new jsPDF();
    const { supplierName, courierName, lineItems, shopDetails } = manifestData;

    const pageWidth = doc.internal.pageSize.getWidth(); // 210mm for A4

    // Logo — centered, above heading
    let headingY = 20; // default Y for "Manifest" if no logo

    if (shopDetails.logo) {
        const logoBase64 = await fetchLogoAsBase64(shopDetails.logo);
        if (logoBase64) {
            const logoW = 40;
            const logoH = 20;
            const logoX = (pageWidth - logoW) / 2; // centered horizontally
            const logoY = 10;
            try {
                doc.addImage(logoBase64, "PNG", logoX, logoY, logoW, logoH);
                headingY = logoY + logoH + 8; // push heading below logo
            } catch (e) {
                console.warn("addImage failed:", e);
            }
        } else {
            console.warn("fetchLogoAsBase64 returned null");
        }
    } else {
        console.warn("shopDetails.logo is empty — check fetchShopDetails");
    }

    doc.setFontSize(20);
    doc.text("Manifest", pageWidth / 2, headingY, { align: "center" });

    doc.setFontSize(10);
    const contentStartY = headingY + 15;
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 10, contentStartY);
    doc.text(`Seller: ${supplierName}`, 10, contentStartY + 5);
    doc.text(`Courier: ${courierName}`, 10, contentStartY + 10);

    // Updated table
    autoTable(doc, {
        startY: contentStartY + 20,
        head: [["", "S.no", "Order no", "AWB no", "Contents"]],
        body: lineItems.map((item: any, index: number) => [
            "", // checkbox — drawn below
            String(index + 1), // S.no
            item.orderId || "Null", // custom OrderId column
            item.sku || "Null", // SKU column as AWB
            `${item.name}, ${item.id}`, // Contents — unchanged
        ]),
        columnStyles: {
            0: { cellWidth: 10, halign: "center" }, // checkbox col
            1: { cellWidth: 12, halign: "center" }, // S.no
        },
        didDrawCell: (data) => {
            // Draw printable checkbox box in first column, body rows only
            if (data.column.index === 0 && data.section === "body") {
                const { x, y, width, height } = data.cell;
                const boxSize = 4;
                doc.setDrawColor(0);
                doc.setLineWidth(0.3);
                doc.rect(x + (width - boxSize) / 2, y + (height - boxSize) / 2, boxSize, boxSize);
            }
        },
    });

    // --- Section below table ---
    const finalY = (doc as any).lastAutoTable.finalY + 8;

    // Dotted line helper
    const drawDottedLine = (y: number) => {
        doc.setLineDashPattern([1, 2], 0);
        doc.setLineWidth(0.3);
        doc.setDrawColor(100);
        doc.line(10, y, pageWidth - 10, y);
        doc.setLineDashPattern([], 0); // reset to solid
    };

    // Underline field helper — label + blank line
    const drawField = (label: string, x: number, y: number, lineWidth: number = 50) => {
        doc.setFont("helvetica", "normal");
        doc.text(label, x, y);
        const labelWidth = doc.getTextWidth(label);
        doc.setDrawColor(0);
        doc.setLineWidth(0.3);
        doc.line(x + labelWidth + 2, y, x + labelWidth + 2 + lineWidth, y);
    };

    // 1. Dotted line + heading + dotted line
    drawDottedLine(finalY);

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    const headingText = `To Be Filled By ${courierName || "Courier"} Executive`;
    doc.text(headingText, pageWidth / 2, finalY + 8, { align: "center" });

    drawDottedLine(finalY + 12);

    // 2. Fields — two columns
    doc.setFontSize(10);
    const col1X = 10;
    const col2X = pageWidth / 2 + 10;
    let rowY = finalY + 24;
    const rowGap = 16;

    drawField("Pick up time :", col1X, rowY, 50);
    drawField("Total items picked:", col2X, rowY, 45);

    rowY += rowGap;
    drawField("FE Name:", col1X, rowY, 50);

    // Seller Name — populated, no underline
    doc.setFont("helvetica", "normal");
    doc.text(`Seller Name: ${supplierName || ""}`, col2X, rowY);

    rowY += rowGap;
    drawField("FE Signature:", col1X, rowY, 50);
    drawField("Seller Signature:", col2X, rowY, 45);

    rowY += rowGap;
    drawField("FE Phone:", col1X, rowY, 50);

    // 3. Shipment From (footer)
    // 3. Footer
    rowY += rowGap + 8;

    // Line 1: Full address concatenated, skip blanks
    const addressParts = [shopDetails.street, shopDetails.city, shopDetails.state, shopDetails.country, shopDetails.postalCode].filter(Boolean);
    const fullAddress = addressParts.join(", ");

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    // splitTextToSize handles long addresses wrapping
    const addressLines = doc.splitTextToSize(fullAddress, pageWidth - 20);
    doc.text(addressLines, pageWidth / 2, rowY, { align: "center" });
    rowY += addressLines.length * 5;

    // Line 2: Contact | Email | Phone | Website — bold labels, normal values
    // Write each label+value segment inline, tracking X position
    doc.setFontSize(9);
    const contactSegments = [
        { label: "Contact: ", value: shopDetails.contactName },
        { label: "Email: ", value: shopDetails.email },
        { label: "Phone: ", value: shopDetails.phone },
        { label: "Website: ", value: shopDetails.website },
    ].filter((s) => !!s.value);
    if (contactSegments.length > 0) {
        rowY += 2;

        // Calculate total line width to center it
        let totalW = 0;
        contactSegments.forEach((seg, i) => {
            doc.setFont("helvetica", "bold");
            totalW += doc.getTextWidth(seg.label);
            doc.setFont("helvetica", "normal");
            totalW += doc.getTextWidth(seg.value);
            if (i < contactSegments.length - 1) totalW += 6; // gap between segments
        });

        let cx = (pageWidth - totalW) / 2; // start X for centered line

        contactSegments.forEach((seg, i) => {
            doc.setFont("helvetica", "bold");
            doc.text(seg.label, cx, rowY);
            cx += doc.getTextWidth(seg.label);
            doc.setFont("helvetica", "normal");
            doc.text(seg.value, cx, rowY);
            cx += doc.getTextWidth(seg.value) + (i < contactSegments.length - 1 ? 6 : 0);
        });
    }

    // System generated note
    rowY += 10;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text("This is a system generated document", pageWidth / 2, rowY, { align: "center" });
    doc.setTextColor(0);
    /*
    const writeSegment = (label: string, value: string, x: number, y: number): number => {
        if (!value) return x; // skip entirely if blank
        doc.setFont("helvetica", "bold");
        doc.text(label, x, y);
        const labelW = doc.getTextWidth(label);
        doc.setFont("helvetica", "normal");
        doc.text(value, x + labelW, y);
        return x + labelW + doc.getTextWidth(value) + 4; // next X with spacing
    };

    let cx = 10;
    rowY += 2;
    cx = writeSegment("Contact: ", shopDetails.contactName, cx, rowY);
    cx = writeSegment("Email: ", shopDetails.email, cx, rowY);
    cx = writeSegment("Phone: ", shopDetails.phone, cx, rowY);
    cx = writeSegment("Website: ", shopDetails.website, cx, rowY);

    // Line 3: System generated note — centered
    rowY += 10;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text("This is a system generated document", pageWidth / 2, rowY, { align: "center" });
    doc.setTextColor(0); // reset
    */
    return doc.output("blob");
};

const fetchLogoAsBase64 = async (url: string): Promise<string | null> => {
    try {

        const response = await fetch(url, {
            credentials: "include", // sends Monday session cookies for protected URLs
        });

        if (!response.ok) {
            console.warn(`Logo fetch failed: HTTP ${response.status}`);
            return null;
        }

        const blob = await response.blob();

        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
                resolve(reader.result as string);
            };
            reader.onerror = () => {
                resolve(null);
            };
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        return null;
    }
};

