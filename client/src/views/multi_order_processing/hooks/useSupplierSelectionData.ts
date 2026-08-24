// src/views/multi_order_processing/hooks/useSupplierSelectionData.ts
import { useState, useEffect, useMemo } from "react";
import mondaySdk from "monday-sdk-js";

import {
    ORDERLINEITEMS_ALL_COLUMN_IDS_MAP,
    SUPPLIER_PRODUCT_COLUMN_IDS_MAP,
    SUPPLIER_ALL_COLUMN_IDS_MAP,
    PRODUCT_ALL_COLUMN_IDS_MAP,
} from "../columns";
import {
    ORDER_ITEM_BOARD_ID,
    SUPPLIER_PRODUCT_BOARD_ID,
} from "../boardIds";
import { fetchAllBoardItems } from "../utils/fetchAllItems";



const monday = mondaySdk();

export const useSupplierSelectionData = (selectedOrderIds: string[]) => {
    const [lineItems, setLineItems] = useState<any[]>([]);
    const [suppliersMap, setSuppliersMap] = useState<Record<string, any[]>>({}); // ProductID -> SupplierList
    const [loading, setLoading] = useState(true);

    const fetchLineItems = async () => {
        setLoading(true);
        try {
            // Paginated (cursor) fetch  supports line-item boards with >500 items.
            const allItems = await fetchAllBoardItems(ORDER_ITEM_BOARD_ID, `
                id
                name
                column_values {
                    column { title type id }
                    id type text value
                    ... on MirrorValue { display_value }
                    ... on BoardRelationValue { linked_item_ids display_value }
                    ... on FormulaValue { display_value }
                }
            `);

            const filteredItems = allItems
                .map((item: any) => {
                    const orderCol = item.column_values.find((c: any) => c.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.ORDER);
                    const productCol = item.column_values.find((c: any) => c.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.PRODUCT);
                    const skuCol = item.column_values.find((c: any) => c.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SKU);
                    return {
                        id: item.id,
                        name: item.name,
                        linkedOrderId: orderCol?.linked_item_ids?.[0],
                        orderName: orderCol?.display_value || "",
                        productId: productCol?.linked_item_ids?.[0],
                        productName: productCol?.display_value,
                        sku: skuCol?.text?.trim() || "",
                        category: "",
                        column_values: item.column_values,
                    };
                })
                .filter((item: any) => selectedOrderIds.includes(item.linkedOrderId));


            const uniqueProductIds = [...new Set(filteredItems.map((i: any) => i.productId).filter(Boolean))];

            const categoryMap: Record<string, string> = {};
            if (uniqueProductIds.length > 0) {
                const prodRes: any = await monday.api(`query {
                    items(ids: [${uniqueProductIds.join(",")}]) {
                        id
                        column_values(ids: ["${PRODUCT_ALL_COLUMN_IDS_MAP.CATEGORY}"]) {
                            id text
                            ... on StatusValue { label }
                        }
                    }
                }`);
                (prodRes.data?.items || []).forEach((p: any) => {
                    const catCol = p.column_values.find((cv: any) => cv.id === PRODUCT_ALL_COLUMN_IDS_MAP.CATEGORY);
                    categoryMap[p.id] = catCol?.label?.trim() || catCol?.text?.trim() || "";
                });
            }

            const itemsWithCategory = filteredItems
                .map((item: any) => ({ ...item, category: categoryMap[item.productId] || "" }))
                .sort((a: any, b: any) => {
                    const orderCmp = (a.orderName || "").localeCompare(b.orderName || "");
                    return orderCmp !== 0 ? orderCmp : (a.name || "").localeCompare(b.name || "");
                });

            setLineItems(itemsWithCategory);
            uniqueProductIds.forEach((pid: any) => fetchSuppliersForProduct(pid));
        } catch (e) {
            console.error("[useSupplierSelectionData] Error fetching line items:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (selectedOrderIds.length > 0) fetchLineItems();
        // Re-fetch only when the selected orders change, not when fetchLineItems' identity does.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedOrderIds]);

    // Unique products derived from the locally filtered line items
    const allProducts = useMemo(() => {
        const map = new Map();
        lineItems.forEach((li) => {
            if (li.productId && li.productName) {
                map.set(li.productId, li.productName);
            }
        });
        return Array.from(map.entries()).map(([id, name]) => ({ label: name, value: id }));
    }, [lineItems]);

    /**
     * Port of the Python weighted sorting algorithm
     * Normalizes Price (lower is better) and Rating (higher is better)
     */
    const sortSuppliersByWeightedScore = (suppliers: any[]) => {
        if (!suppliers || suppliers.length <= 1) return suppliers;

        // 1. Extract values to find min/max for normalization
        const prices = suppliers.map((s) => s.price || 0);
        const ratings = suppliers.map((s) => s.rating || 0);

        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const minRating = Math.min(...ratings);
        const maxRating = Math.max(...ratings);

        // Default weights from Python: Price = 55%, Rating = 45%
        const weights = { price: 0.55, rating: 0.45 };

        return suppliers
            .map((supplier) => {
                // Normalize Price: 1 if all same, else (max - current) / (max - min)
                const normPrice = maxPrice === minPrice ? 1 : (maxPrice - (supplier.price || 0)) / (maxPrice - minPrice);

                // Normalize Rating: 1 if all same, else (current - min) / (max - min)
                const normRating = maxRating === minRating ? 1 : ((supplier.rating || 0) - minRating) / (maxRating - minRating);

                const score = weights.price * normPrice + weights.rating * normRating;
                return { ...supplier, finalScore: score };
            })
            .sort((a, b) => b.finalScore - a.finalScore); // Sort best to worst
    };

    const fetchSuppliersForProduct = async (productId: string, forceRefresh = false) => {
        if (suppliersMap[productId] && !forceRefresh) {
            return;
        }

        try {
            // Paginated (cursor) fetch  supports supplier-product boards with >500 rows.
            const allSupplierProductItems = await fetchAllBoardItems(SUPPLIER_PRODUCT_BOARD_ID, `
                id
                column_values {
                    id text
                    ... on BoardRelationValue { linked_item_ids display_value }
                    ... on MirrorValue { display_value }
                }
            `);

            const productRelations = allSupplierProductItems
                .map((item: any) => {
                    const productCol = item.column_values.find((c: any) => c.id === SUPPLIER_PRODUCT_COLUMN_IDS_MAP.PRODUCT);
                    const supplierCol = item.column_values.find((c: any) => c.id === SUPPLIER_PRODUCT_COLUMN_IDS_MAP.SUPPLIER);
                    const weightageCol = item.column_values.find((c: any) => c.id === SUPPLIER_PRODUCT_COLUMN_IDS_MAP.PRODUCT_WEIGHTAGE);
                    const price = parseFloat(weightageCol?.text || weightageCol?.display_value || "0");
                    const availableQty = parseFloat(item.column_values.find((c: any) => c.id === SUPPLIER_PRODUCT_COLUMN_IDS_MAP.AVAILABLEQUANTITY)?.text || "0");
                    return {
                        supplierProductItemId: item.id,
                        linkedProductId: productCol?.linked_item_ids?.[0],
                        label: supplierCol?.display_value || "Unknown Supplier",
                        supplierId: supplierCol?.linked_item_ids?.[0],
                        price,
                        availableQty,
                    };
                })
                .filter((item: any) => item.linkedProductId === productId && item.supplierId);


            if (productRelations.length === 0) {
                console.warn("[useSupplierSelectionData] No suppliers found for product:", productId);
                setSuppliersMap((prev) => ({ ...prev, [productId]: [] }));
                return;
            }

            const supplierIdsToQuery = Array.from(new Set(productRelations.map((r) => r.supplierId)));

            const supplierBoardQuery = `query {
                items(ids: [${supplierIdsToQuery.join(",")}]) {
                    id
                    column_values(ids: ["${SUPPLIER_ALL_COLUMN_IDS_MAP.RATING}", "${SUPPLIER_ALL_COLUMN_IDS_MAP.SELFOWNED}"]) {
                        id text value
                    }
                }
            }`;

            const suppRes: any = await monday.api(supplierBoardQuery);
            const sourceSupplierItems = suppRes.data?.items || [];

            const sourceSuppliersMap: Record<string, any> = {};
            sourceSupplierItems.forEach((sItem: any) => {
                const ratingCol = sItem.column_values.find((c: any) => c.id === SUPPLIER_ALL_COLUMN_IDS_MAP.RATING);
                const selfOwnedCol = sItem.column_values.find((c: any) => c.id === SUPPLIER_ALL_COLUMN_IDS_MAP.SELFOWNED);
                const rating = parseFloat(ratingCol?.text || "0");
                const selfValueRaw = selfOwnedCol?.value ? JSON.parse(selfOwnedCol.value) : null;
                const isSelf =
                    selfOwnedCol?.text?.toLowerCase() === "yes" ||
                    selfOwnedCol?.text?.toLowerCase() === "true" ||
                    selfValueRaw === true ||
                    (selfValueRaw && (selfValueRaw.checked === true || String(selfValueRaw.checked) === "true"));
                sourceSuppliersMap[String(sItem.id)] = { rating, isSelf };
            });

            const combinedSuppliers = productRelations.map((relation) => {
                const sourceData = sourceSuppliersMap[String(relation.supplierId)] || { rating: 0, isSelf: false };
                return {
                    label: relation.label,
                    value: relation.supplierId,
                    price: relation.price,
                    rating: sourceData.rating,
                    isSelf: sourceData.isSelf,
                    availableQty: relation.availableQty,
                    supplierProductItemId: relation.supplierProductItemId,
                };
            });

            const sorted = sortSuppliersByWeightedScore(combinedSuppliers)
                .sort((a, b) => (b.isSelf ? 1 : 0) - (a.isSelf ? 1 : 0));

            const total = sorted.length;
            const sortedSuppliers = sorted.map((item: any, idx: number) => {
                let tag = "";
                if (total === 1) {
                    tag = "Best";
                } else {
                    const pct = idx / (total - 1);
                    if (pct <= 0.25) tag = "Best";
                    else if (pct <= 0.5) tag = "Good";
                    else if (pct <= 0.75) tag = "Average";
                    else tag = "Poor";
                }
                if (item.isSelf) tag = "Best";
                return {
                    label: item.label,
                    value: item.value,
                    availableQty: item.availableQty,
                    supplierProductItemId: item.supplierProductItemId,
                    price: item.price,
                    rating: item.rating,
                    isSelf: item.isSelf,
                    finalScore: item.finalScore,
                    tag,
                };
            });


            setSuppliersMap((prev) => ({ ...prev, [productId]: sortedSuppliers }));
        } catch (e: any) {
            console.error("[useSupplierSelectionData] Error fetching suppliers for product", productId, ":", e.message);
            monday.execute("confirm", {
                message: "Error fetching suppliers by direct batch lookup: " + e.message,
                description: e,
                type: "error",
                confirmButtonText: "OK",
                excludeCancelButton: true,
            });
        }
    };
    return { lineItems, allProducts, suppliersMap, fetchSuppliersForProduct, loading, refetch: fetchLineItems };
};