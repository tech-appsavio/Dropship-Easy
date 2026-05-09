//utils/pdfGenerator.ts
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export const generateManifestPDF = async (manifestData: any) => {
    console.log("generateManifestPDF method "); // debug
    const doc = new jsPDF();
    const { supplierName, courierName, lineItem, shopDetails, manifestName } = manifestData;

    const pageWidth = doc.internal.pageSize.getWidth(); // 210mm for A4
    console.log("generateManifestPDF method li = ", lineItem); // debug

    console.log("generateManifestPDF methodshop det = ", shopDetails); // debug
    // Logo — centered, above heading
    let headingY = 20; // default Y for "Manifest" if no logo

    if (shopDetails.logo) {
        console.log("shopDetails.logo URL:", shopDetails.logo); // debug
        const logoBase64 = await fetchLogoAsBase64(shopDetails.logo);
        if (logoBase64) {
            const logoW = 40;
            const logoH = 20;
            const logoX = (pageWidth - logoW) / 2; // centered horizontally
            const logoY = 10;
            try {
                doc.addImage(logoBase64, "PNG", logoX, logoY, logoW, logoH);
                headingY = logoY + logoH + 8; // push heading below logo
                console.log("Logo added to PDF at:", logoX, logoY);
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

    autoTable(doc, {
        startY: contentStartY + 20,
        head: [["S.no", "Order no", "Awb no", "Contents"]],
        body: [["1", lineItem.linkedOrderId || "N/A", lineItem.courierId || "N/A", `${lineItem.name}, ${lineItem.id}`]],
    });

    const finalY = (doc as any).lastAutoTable.finalY + 20;
    doc.text("Shipment From:", 10, finalY);
    doc.text(shopDetails.address, 10, finalY + 5);
    doc.text(`Primary Contact: ${shopDetails.contactName}`, 10, finalY + 10);

    return doc.output("blob");
};

const fetchLogoAsBase64 = (url: string): Promise<string | null> => {
    return new Promise((resolve) => {
        console.log("Fetch logo as base 64 Attempting to load logo from:", url); // debug

        const img = new Image();
        img.crossOrigin = "anonymous";

        const canvas = document.createElement("canvas");

        img.onload = () => {
            console.log("Logo loaded successfully, dimensions:", img.naturalWidth, img.naturalHeight);
            canvas.width = img.naturalWidth || 200;
            canvas.height = img.naturalHeight || 200;
            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(img, 0, 0);
            const base64 = canvas.toDataURL("image/png");
            console.log("Base64 generated, length:", base64.length);
            resolve(base64);
        };

        img.onerror = (e) => {
            console.warn("Logo image load failed:", e, "URL:", url);
            resolve(null);
        };

        img.src = url;
    });
};
