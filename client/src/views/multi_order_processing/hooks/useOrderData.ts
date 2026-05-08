// src/views/multi_order_processing/hooks/useOrderData.ts
import { useState, useEffect } from 'react';
import mondaySdk from "monday-sdk-js";
import { Order } from '../types';
import { ORDER_BOARD_ID, ORDER_ALL_COLUMN_IDS_MAP } from '../constants';

const monday = mondaySdk();

export const useOrderData = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {

        console.log("Fetching orders for Board ID:", ORDER_BOARD_ID);
        const res: any = await monday.api(`query {
          boards(ids: ${ORDER_BOARD_ID}) {
            items_page(limit: 100) {
              items {
                id
                name
                column_values {
                  id
                  text
                  ... on BoardRelationValue { display_value linked_item_ids }
                  ... on MirrorValue { display_value }
                  ... on FormulaValue { display_value }
                }
              }
            }
          }
        }`);

        console.log("GraphQL raw response:", res);

        // Safety check for undefined response or internal GraphQL errors
        if (!res) {
          throw new Error("No response received from Monday API.");
        }

        if (res.errors) {
          console.error("GraphQL Errors detected:", res.errors);
          throw new Error(res.errors[0].message);
        }

        if (!res.data || !res.data.boards || res.data.boards.length === 0) {
          throw new Error("No board data found. Verify the ORDER_BOARD_ID is correct.");
        }

        const items = res.data.boards[0].items_page.items;
        console.log("Items found:", items.length);

        // Map the API response to friendly keys
        const mappedOrders = items.map((item: any) => {
          const orderObj: Order = { id: item.id, name: item.name };

          Object.entries(ORDER_ALL_COLUMN_IDS_MAP).forEach(([friendlyKey, columnId]) => {
            const colValue = item.column_values.find((cv: any) => cv.id === columnId);
            // Use display_value for complex types, otherwise fall back to text
            orderObj[friendlyKey] = colValue?.display_value || colValue?.text || "";
          });

          return orderObj;
        });

        console.log("Mapped Orders successfully:", mappedOrders);
        setOrders(mappedOrders);
      } catch (err: any) {
        console.error("Error in useOrderData hook:", err);
        setError(err.message || "Failed to fetch orders");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return { orders, loading, error };
};