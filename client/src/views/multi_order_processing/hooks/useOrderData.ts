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
      console.log("[useOrderData] ── Fetching orders from board:", ORDER_BOARD_ID);
      try {
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

          if (!res) {
              throw new Error("No response received from Monday API.");
          }
          if (res.errors) {
              console.error("[useOrderData] GraphQL errors:", res.errors);
              throw new Error(res.errors[0].message);
          }
          if (!res.data || !res.data.boards || res.data.boards.length === 0) {
              throw new Error("No board data found. Verify the ORDER_BOARD_ID is correct.");
          }

          const items = res.data.boards[0].items_page.items;
          console.log("[useOrderData] Total items fetched:", items.length);

          const mappedOrders = items.map((item: any) => {
              const orderObj: Order = { id: item.id, name: item.name };
              Object.entries(ORDER_ALL_COLUMN_IDS_MAP).forEach(([friendlyKey, columnId]) => {
                  const colValue = item.column_values.find((cv: any) => cv.id === columnId);
                  orderObj[friendlyKey] = colValue?.display_value || colValue?.text || "";
              });
              return orderObj;
          });

          const confirmed = mappedOrders.filter((o: Order) => String(o.STATUS) === "Confirmed");
          console.log("[useOrderData] Confirmed orders:", confirmed.length, "of", mappedOrders.length);
          setOrders(mappedOrders);
          console.log("[useOrderData] ── Done");
      } catch (err: any) {
          console.error("[useOrderData] Fetch failed:", err.message);
          setError("Failed to fetch orders: " + err.message + err);
      } finally {
          setLoading(false);
      }
    };

    fetchData();
  }, []);

  return { orders, loading, error };
};