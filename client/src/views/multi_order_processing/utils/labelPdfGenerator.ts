// src/views/multi_order_processing/utils/labelPdfGenerator.ts
import { jsPDF } from "jspdf";

export const generateLabelPDF = async (items: any[]): Promise<Blob> => {
    // Initialize jsPDF with dimensions matching standard 4x6 inch label size (101.6mm x 152.4mm)
    const doc = new jsPDF("p", "mm", [101.6, 152.4]);

    const cleanDisplay = (val: any) => {
        if (!val || val === "N/A" || val === "-" || val === "Null" || val === "[Address]") return "";
        return String(val);
    };

    // Helper to draw a crisp vector barcode structure page-by-page
    const drawCrispBarcode = (pdf: jsPDF, startX: number, startY: number, totalWidth: number, height: number) => {
        pdf.setLineWidth(0.4);
        pdf.setDrawColor(0, 0, 0);
        let currentX = startX;
        let index = 0;

        while (currentX < startX + totalWidth) {
            const barWidth = index % 3 === 0 ? 1.2 : index % 5 === 0 ? 0.4 : 0.8;
            pdf.setLineWidth(barWidth);
            pdf.line(currentX, startY, currentX, startY + height);

            const gap = index % 4 === 0 ? 1.5 : 0.8;
            currentX += barWidth + gap;
            index++;
        }
    };

    items.forEach((item, index) => {
        if (index > 0) doc.addPage();

        const pageWidth = 101.6;
        const pageHeight = 152.4;
        const margin = 4;

        // 1. Draw Thick Black Outer Boundary Box
        doc.setLineWidth(1.0);
        doc.setDrawColor(0, 0, 0);
        doc.rect(margin, margin, pageWidth - (margin * 2), pageHeight - (margin * 2));

        // 2. Section 1 & 3 Separator Layout (Top Row split horizontally)
        const middleY = 46;
        doc.setLineWidth(0.8);
        doc.line(margin, middleY, pageWidth - margin, middleY); // Horizontal splitter line

        const splitX = 58;
        doc.line(splitX, margin, splitX, middleY); // Vertical header line splitter

        // --- SECTION 1: DELIVER TO ---
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(10);
        doc.text("DELIVER To:", margin + 3, margin + 5);

        doc.setFontSize(11);
        doc.text(cleanDisplay(item.customerName), margin + 3, margin + 11);

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(9);
        const addressLines = doc.splitTextToSize(cleanDisplay(item.billingAddress), splitX - margin - 5);
        doc.text(addressLines, margin + 3, margin + 16);

        const customerPhone = cleanDisplay(item.customerPhone);
        if (customerPhone) {
            doc.setFont("Helvetica", "bold");
            doc.setFontSize(9);
            doc.text(`MOBILE NO.: ${customerPhone}`, margin + 3, middleY - 6);
        }

        const customerEmail = cleanDisplay(item.customerEmail);
        if (customerEmail) {
            doc.setFont("Helvetica", "normal");
            doc.setFontSize(8);
            doc.text(`Email: ${customerEmail}`, margin + 3, middleY - 2);
        }

        // --- SECTION 3: SHIPPED BY ---
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(8);
        // Clean multi-line wrapping for small return context headers
        const returnLabelLines = doc.splitTextToSize("Shipped By (If undelivered, return to):", pageWidth - splitX - 6);
        doc.text(returnLabelLines, splitX + 3, margin + 4);

        doc.setFontSize(10);
        doc.text(cleanDisplay(item.supplierName), splitX + 3, margin + 12);

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(8.5);
        const supplierAddressLines = doc.splitTextToSize(cleanDisplay(item.supplierAddress), pageWidth - splitX - 7);
        doc.text(supplierAddressLines, splitX + 3, margin + 17);

        const supplierPhone = cleanDisplay(item.supplierPhone);
        if (supplierPhone) {
            doc.text(`Phone: ${supplierPhone}`, splitX + 3, middleY - 6);
        }
        const supplierEmail = cleanDisplay(item.supplierEmail);
        if (supplierEmail) {
            doc.text(`Email: ${supplierEmail}`, splitX + 3, middleY - 2);
        }

        // --- SECTION 2: ORDER INFO BLOCK ---
        const section2BottomY = 82;
        doc.setLineWidth(0.8);
        doc.line(margin, section2BottomY, pageWidth - margin, section2BottomY);

        doc.setFont("Helvetica", "bold");
        doc.setFontSize(13);
        doc.text(`ORDER #: ${cleanDisplay(item.orderId)}`, margin + 3, middleY + 7);

        // Render crisp transactional barcode vector strip
        drawCrispBarcode(doc, margin + 4, middleY + 12, pageWidth - (margin * 2) - 8, 18);

        // --- SECTION 4: DIMENSIONS & PRICING ---
        const section4BottomY = 114;
        doc.line(margin, section4BottomY, pageWidth - margin, section4BottomY);

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(10);
        doc.text("WEIGHT: 1 | DIMENSIONS: 29×26×23 (cm)", margin + 3, section2BottomY + 6);

        doc.setFont("Helvetica", "bold");
        doc.setFontSize(11);
        const method = item.paymentMethod ? String(item.paymentMethod).toUpperCase() : "CASH ON DELIVERY";
        doc.text(method, margin + 3, section2BottomY + 13);

        doc.setFontSize(14);
        doc.text(`COLLECT COD - Rs. ${cleanDisplay(item.totalPrice)}`, margin + 3, section2BottomY + 23);

        // --- SECTION 5: COURIER ROUTING ---
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(14);
        doc.text(cleanDisplay(item.courierName), margin + 3, section4BottomY + 7);

        doc.setFontSize(10);
        doc.text(`AWB #: ${cleanDisplay(item.sku)}`, margin + 3, section4BottomY + 13);

        // Secondary vector identifier barcode
        drawCrispBarcode(doc, margin + 4, section4BottomY + 18, pageWidth - (margin * 2) - 8, 14);
    });

    return doc.output("blob");
};