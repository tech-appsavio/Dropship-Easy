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
                                id
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
        // Return cached data if already fetched for this product
        if (suppliersMap[productId]) return;

        // Fetching all records because Monday API filtering on connection columns is inconsistent
        const query = `query {
            boards(ids: ${SUPPLIER_PRODUCT_BOARD_ID}) {
                items_page(limit: 500) {
                    items {
                        column_values {
                            id
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

            // Map and filter locally by the selected productId
            const filteredSuppliers = allSupplierProductItems
                .map((item: any) => {
                    const productCol = item.column_values.find((c: any) => c.id === SUPPLIER_PRODUCT_COLUMN_IDS_MAP.PRODUCT);
                    const supplierCol = item.column_values.find((c: any) => c.id === SUPPLIER_PRODUCT_COLUMN_IDS_MAP.SUPPLIER);

                    return {
                        linkedProductId: productCol?.linked_item_ids?.[0],
                        label: supplierCol?.display_value,
                        value: supplierCol?.linked_item_ids?.[0],
                    };
                })
                .filter((item: any) => item.linkedProductId === productId) // Local filter
                .map((item: any) => ({ label: item.label, value: item.value }));

            // Update the map to store suppliers for this specific product
            setSuppliersMap((prev) => ({ ...prev, [productId]: filteredSuppliers }));
        } catch (e) {
            console.error("Error fetching suppliers locally:", e);
        }
    };
    return { lineItems, allProducts, suppliersMap, fetchSuppliersForProduct, loading };
};