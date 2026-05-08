// src/views/multi_order_processing/hooks/useSupplierSelectionData.ts
import { useState, useEffect, useMemo } from 'react';
import mondaySdk from "monday-sdk-js";
import { ORDER_ITEM_BOARD_ID, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP, SUPPLIER_PRODUCT_BOARD_ID, SUPPLIER_PRODUCT_COLUMN_IDS_MAP } from '../constants';

const monday = mondaySdk();

export const useSupplierSelectionData = (selectedOrderIds: string[]) => {
    const [lineItems, setLineItems] = useState<any[]>([]);
    const [suppliersMap, setSuppliersMap] = useState<Record<string, any[]>>({}); // ProductID -> SupplierList
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLineItems = async () => {
            // Query line items filtered by the selected Order IDs using linked_item_ids logic
            const query = `query {
                boards(ids: ${ORDER_ITEM_BOARD_ID}) {
                    items_page(limit: 500, query_params: {
                        rules: [{
                            column_id: "${ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.ORDER}",
                            compare_value: ${JSON.stringify(selectedOrderIds)},
                            operator: any_of
                        }]
                    }) {
                        items {
                            id
                            name
                            column_values {
                                id
                                text
                                ... on BoardRelationValue { linked_item_ids display_value }
                            }
                        }
                    }
                }
            }`;

            try {
                const res: any = await monday.api(query);
                const items = res.data.boards[0].items_page.items.map((item: any) => {
                    const productCol = item.column_values.find((c: any) => c.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.PRODUCT);
                    return {
                        id: item.id,
                        name: item.name,
                        productId: productCol?.linked_item_ids?.[0],
                        productName: productCol?.display_value
                    };
                });
                setLineItems(items);
            } catch (e) { console.error(e); }
            setLoading(false);
        };

        if (selectedOrderIds.length > 0) fetchLineItems();
    }, [selectedOrderIds]);

    // Unique products from selected line items
    const allProducts = useMemo(() => {
        const map = new Map();
        lineItems.forEach(li => {
            if (li.productId) map.set(li.productId, li.productName);
        });
        return Array.from(map.entries()).map(([id, name]) => ({ label: name, value: id }));
    }, [lineItems]);

    const fetchSuppliersForProduct = async (productId: string) => {
        if (suppliersMap[productId]) return;

        const query = `query {
            boards(ids: ${SUPPLIER_PRODUCT_BOARD_ID}) {
                items_page(query_params: {
                    rules: [{
                        column_id: "${SUPPLIER_PRODUCT_COLUMN_IDS_MAP.PRODUCT}",
                        compare_value: ["${productId}"],
                        operator: any_of
                    }]
                }) {
                    items {
                        column_values {
                            id
                            ... on BoardRelationValue { linked_item_ids display_value }
                        }
                    }
                }
            }
        }`;

        const res: any = await monday.api(query);
        const suppliers = res.data.boards[0].items_page.items.map((item: any) => {
            const supplierCol = item.column_values.find((c: any) => c.id === SUPPLIER_PRODUCT_COLUMN_IDS_MAP.SUPPLIER);
            return { label: supplierCol?.display_value, value: supplierCol?.linked_item_ids?.[0] };
        });

        setSuppliersMap(prev => ({ ...prev, [productId]: suppliers }));
    };

    return { lineItems, allProducts, suppliersMap, fetchSuppliersForProduct, loading };
};