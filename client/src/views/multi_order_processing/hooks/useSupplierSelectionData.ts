// src/views/multi_order_processing/hooks/useSupplierSelectionData.ts
import { useState, useEffect, useMemo } from "react";
import mondaySdk from "monday-sdk-js";

import {
    ORDER_ITEM_BOARD_ID,
    ORDERLINEITEMS_ALL_COLUMN_IDS_MAP,
    SUPPLIER_PRODUCT_BOARD_ID,
    SUPPLIER_PRODUCT_COLUMN_IDS_MAP,
    SUPPLIER_ALL_COLUMN_IDS_MAP,
} from "../constants";



const monday = mondaySdk();

export const useSupplierSelectionData = (selectedOrderIds: string[]) => {
    const [lineItems, setLineItems] = useState<any[]>([]);
    const [suppliersMap, setSuppliersMap] = useState<Record<string, any[]>>({}); // ProductID -> SupplierList
    const [loading, setLoading] = useState(true);

    const fetchLineItems = async () => {
        setLoading(true);
        // Query all line items from the board
        const query = `query {
            boards(ids: ${ORDER_ITEM_BOARD_ID}) {
                items_page(limit: 500) {
                    items {
                        id
                        name
                        column_values {
                            column {
                                title
                                type
                                id
                            }
                            id
                            type
                            text
                            value
                            # For mirror columns
                            ... on MirrorValue {
                                display_value
                                id
                                text
                                value
                            }
                            # For connect board columns
                            ... on BoardRelationValue {
                                linked_item_ids
                                display_value
                            }
                            # Formula
                            ... on FormulaValue {
                                value
                                display_value
                            }
                        }
                    }
                }
            }
        }`;

        try {
            const res: any = await monday.api(query);
            const allItems = res.data.boards[0].items_page.items;

            const filteredItems = allItems
                .map((item: any) => {
                    const orderCol = item.column_values.find((c: any) => c.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.ORDER);
                    const productCol = item.column_values.find((c: any) => c.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.PRODUCT);

                    return {
                        id: item.id,
                        name: item.name,
                        linkedOrderId: orderCol?.linked_item_ids?.[0], // Get the Order ID this item belongs to
                        productId: productCol?.linked_item_ids?.[0],
                        productName: productCol?.display_value,
                        column_values: item.column_values,
                    };
                })
                .filter((item: any) => selectedOrderIds.includes(item.linkedOrderId)); // LOCAL FILTERING

            setLineItems(filteredItems);
        } catch (e) {
            console.error("Error fetching line items:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (selectedOrderIds.length > 0) fetchLineItems();
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

    const fetchSuppliersForProduct = async (productId: string) => {
        if (suppliersMap[productId]) return;

        // 1. Query the cross-reference SupplierProduct board to extract suppliers matching this product
        const relationQuery = `query {
            boards(ids: ${SUPPLIER_PRODUCT_BOARD_ID}) {
                items_page(limit: 500) {
                    items {
                        column_values {
                            id
                            ... on BoardRelationValue {
                                linked_item_ids
                                display_value
                            }
                            ... on MirrorValue {
                                display_value
                            }
                        }
                    }
                }
            }
        }`;

        try {
            const relRes: any = await monday.api(relationQuery);
            if (!relRes.data || !relRes.data.boards || relRes.data.boards.length === 0) {
                throw new Error("No data returned for supplier products board.");
            }

            const allSupplierProductItems = relRes.data.boards[0].items_page.items;

            // Map and filter relations that match the currently selected productId
            const productRelations = allSupplierProductItems
                .map((item: any) => {
                    const productCol = item.column_values.find((c: any) => c.id === SUPPLIER_PRODUCT_COLUMN_IDS_MAP.PRODUCT);
                    const supplierCol = item.column_values.find((c: any) => c.id === SUPPLIER_PRODUCT_COLUMN_IDS_MAP.SUPPLIER);
                    const weightageCol = item.column_values.find((c: any) => c.id === SUPPLIER_PRODUCT_COLUMN_IDS_MAP.PRODUCT_WEIGHTAGE);

                    const price = parseFloat(weightageCol?.text || weightageCol?.display_value || "0");

                    return {
                        linkedProductId: productCol?.linked_item_ids?.[0],
                        label: supplierCol?.display_value || "Unknown Supplier",
                        supplierId: supplierCol?.linked_item_ids?.[0],
                        price,
                    };
                })
                .filter((item: any) => item.linkedProductId === productId && item.supplierId);

            if (productRelations.length === 0) {
                setSuppliersMap((prev) => ({ ...prev, [productId]: [] }));
                return;
            }

            // Extract unique Supplier IDs to build an isolated batch query
            const supplierIdsToQuery = Array.from(new Set(productRelations.map((r) => r.supplierId)));

            // 2. Query the source Supplier board records directly to safely extract structural configurations
            const supplierBoardQuery = `query {
                items(ids: [${supplierIdsToQuery.join(",")}]) {
                    id
                    column_values(ids: ["${SUPPLIER_ALL_COLUMN_IDS_MAP.RATING}", "${SUPPLIER_ALL_COLUMN_IDS_MAP.SELFOWNED}"]) {
                        id
                        text
                        value
                    }
                }
            }`;

            const suppRes: any = await monday.api(supplierBoardQuery);
            const sourceSupplierItems = suppRes.data?.items || [];

            // 3. Build a map of verified source columns by Supplier ID
            const sourceSuppliersMap: Record<string, any> = {};
            sourceSupplierItems.forEach((sItem: any) => {
                const ratingCol = sItem.column_values.find((c: any) => c.id === SUPPLIER_ALL_COLUMN_IDS_MAP.RATING);
                const selfOwnedCol = sItem.column_values.find((c: any) => c.id === SUPPLIER_ALL_COLUMN_IDS_MAP.SELFOWNED);

                const rating = parseFloat(ratingCol?.text || "0");

                // Safely handle both Boolean primitives or text statuses ("checked", "true", or raw state)
                const selfValueRaw = selfOwnedCol?.value ? JSON.parse(selfOwnedCol.value) : null;
                const isSelf =
                    selfOwnedCol?.text?.toLowerCase() === "yes" ||
                    selfOwnedCol?.text?.toLowerCase() === "true" ||
                    selfValueRaw === true ||
                    (selfValueRaw && (selfValueRaw.checked === true || String(selfValueRaw.checked) === "true"));

                sourceSuppliersMap[String(sItem.id)] = { rating, isSelf };
            });

            // 4. Combine the relational pricing definitions with the deep supplier source properties
            const combinedSuppliers = productRelations.map((relation) => {
                const sourceData = sourceSuppliersMap[String(relation.supplierId)] || { rating: 0, isSelf: false };
                return {
                    label: relation.label,
                    value: relation.supplierId,
                    price: relation.price,
                    rating: sourceData.rating,
                    isSelf: sourceData.isSelf,
                };
            });


            // 5. Apply the baseline sorting, floating self-owned items to the top index positions
            const sortedSuppliers = sortSuppliersByWeightedScore(combinedSuppliers)
                .sort((a, b) => (b.isSelf ? 1 : 0) - (a.isSelf ? 1 : 0))
                .map((item: any) => ({ label: item.label, value: item.value }));


            setSuppliersMap((prev) => ({ ...prev, [productId]: sortedSuppliers }));
        } catch (e) {
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