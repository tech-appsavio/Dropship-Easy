import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export const generateManifestPDF = async (manifestData: any) => {
    const doc = new jsPDF();
    const { supplierName, courierName, lineItem, shopDetails, manifestName } = manifestData;

    // Logo — skip entirely if blank or any step fails
    if (shopDetails.logo) {
        const logoBase64 = await fetchLogoAsBase64(shopDetails.logo);
        if (logoBase64) {
            try {
                doc.addImage(logoBase64, "PNG", 10, 10, 30, 30);
            } catch (e) {
                console.warn("addImage failed — skipping logo:", e);
            }
        }
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
        head: [["S.no", "Order no", "Awb no", "Contents"]],
        body: [["1", lineItem.linkedOrderId || "N/A", lineItem.courierId || "N/A", `${lineItem.name}, ${lineItem.id}`]],
    });

    // 3. Footer: Address and Primary Contact
    const finalY = (doc as any).lastAutoTable.finalY + 20;
    doc.text("Shipment From:", 10, finalY);
    doc.text(shopDetails.address, 10, finalY + 5);
    doc.text(`Primary Contact: ${shopDetails.contactName}`, 10, finalY + 10);

    return doc.output("blob");
};

const fetchLogoAsBase64 = async (url: string): Promise<string | null> => {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch logo: ${response.status}`);

        const blob = await response.blob();
        const isSvg = blob.type.includes("svg") || url.toLowerCase().endsWith(".svg");

        if (isSvg) {
            const svgText = await blob.text();
            const canvas = document.createElement("canvas");
            canvas.width = 200;
            canvas.height = 200;
            const ctx = canvas.getContext("2d")!;
            const svgBlob = new Blob([svgText], { type: "image/svg+xml" });
            const objectUrl = URL.createObjectURL(svgBlob);

            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    ctx.drawImage(img, 0, 0, 200, 200);
                    URL.revokeObjectURL(objectUrl);
                    resolve(canvas.toDataURL("image/png"));
                };
                img.onerror = () => {
                    URL.revokeObjectURL(objectUrl);
                    console.warn("SVG render failed — skipping logo");
                    resolve(null); // skip gracefully
                };
                img.src = objectUrl;
            });
        } else {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = () => {
                    console.warn("FileReader failed — skipping logo");
                    resolve(null);
                };
                reader.readAsDataURL(blob);
            });
        }
    } catch (e) {
        console.warn("Logo fetch error — skipping logo:", e);
        return null; // always skip gracefully, never throw
    }
};