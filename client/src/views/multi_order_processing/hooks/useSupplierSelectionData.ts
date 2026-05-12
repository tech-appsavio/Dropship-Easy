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

    useEffect(() => {
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

        const query = `query {
            boards(ids: ${SUPPLIER_PRODUCT_BOARD_ID}) {
                items_page(limit: 500) {
                    items {
                        column_values {
                            id
                            text
                            ... on BoardRelationValue {
                                linked_item_ids
                                display_value
                            }
                        }
                    }
                }
            }
        }`;

        try {
            const res: any = await monday.api(query);
            if (!res.data || !res.data.boards || res.data.boards.length === 0) {
                throw new Error("No data returned for supplier products board.");
            }

            const allSupplierProductItems = res.data.boards[0].items_page.items;

            // Step 1: map and filter
            const filteredSuppliers = allSupplierProductItems
                .map((item: any) => {
                    const productCol = item.column_values.find((c: any) => c.id === SUPPLIER_PRODUCT_COLUMN_IDS_MAP.PRODUCT);
                    const supplierCol = item.column_values.find((c: any) => c.id === SUPPLIER_PRODUCT_COLUMN_IDS_MAP.SUPPLIER);

                    const rating = parseFloat(item.column_values.find((c: any) => c.id === SUPPLIER_ALL_COLUMN_IDS_MAP.RATING)?.text || "0");
                    const price = parseFloat(item.column_values.find((c: any) => c.id === SUPPLIER_PRODUCT_COLUMN_IDS_MAP.PRODUCT_WEIGHTAGE)?.text || "0");
                    const isSelf = item.column_values.find((c: any) => c.id === SUPPLIER_ALL_COLUMN_IDS_MAP.SELFOWNED)?.text === "true"; // ← add this

                    return {
                        linkedProductId: productCol?.linked_item_ids?.[0],
                        label: supplierCol?.display_value,
                        value: supplierCol?.linked_item_ids?.[0],
                        price,
                        rating,
                        isSelf,
                    };
                })
                .filter((item: any) => item.linkedProductId === productId);
            console.log("Filterd suppliers ", filteredSuppliers);
            // Step 2: sort, then strip sorting fields before storing
            const sortedSuppliers = sortSuppliersByWeightedScore(filteredSuppliers)
                .sort((a, b) => (b.isSelf ? 1 : 0) - (a.isSelf ? 1 : 0)) // ← self-owned float to top
                .map((item: any) => ({ label: item.label, value: item.value }));
            console.log("Sorted suppliers ", sortedSuppliers);
            setSuppliersMap((prev) => ({ ...prev, [productId]: sortedSuppliers }));
        } catch (e) {
            console.error("Error fetching suppliers locally:", e);
        }
    };
    return { lineItems, allProducts, suppliersMap, fetchSuppliersForProduct, loading };
};