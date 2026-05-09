import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export const generateManifestPDF = async (manifestData: any) => {
    const doc = new jsPDF();
    const { supplierName, courierName, lineItem, shopDetails, manifestName } = manifestData;

    // 1. Header: Logo and Basic Info
    if (shopDetails.logo) {
        doc.addImage(shopDetails.logo, 'PNG', 10, 10, 30, 30);
    }
    doc.setFontSize(20);
    doc.text("Manifest", 105, 20, { align: "center" });

    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 10, 45);
    doc.text(`Seller: ${supplierName}`, 10, 50);
    doc.text(`Courier: ${courierName}`, 10, 55);

    // 2. Table: Line Item Information
    autoTable(doc, {
        startY: 65,
        head: [['S.no', 'Order no', 'Awb no', 'Contents']],
        body: [[
            '1',
            lineItem.linkedOrderId || "N/A",
            lineItem.courierId || "N/A",
            `${lineItem.name}, ${lineItem.id}`
        ]],
    });

    // 3. Footer: Address and Primary Contact
    const finalY = (doc as any).lastAutoTable.finalY + 20;
    doc.text("Shipment From:", 10, finalY);
    doc.text(shopDetails.address, 10, finalY + 5);
    doc.text(`Primary Contact: ${shopDetails.contactName}`, 10, finalY + 10);

    return doc.output("blob");
};