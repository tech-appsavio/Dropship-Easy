// src/views/multi_order_processing/hooks/useOrderData.ts
import { useState, useEffect } from 'react';
import mondaySdk from "monday-sdk-js";
import { Order } from '../types';
import { ORDER_ALL_COLUMN_IDS_MAP } from '../columns';
import { ORDER_BOARD_ID } from '../boardIds';

const monday = mondaySdk();

export const useOrderData = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
          // Paginate through the whole board — a single items_page(limit: 100) call
          // silently truncated to the first 100 orders, so any confirmed order beyond
          // that page never reached the UI at all (this was the actual root cause of
          // "confirmed order not shown": the board has grown past 100 items).
          const items: any[] = [];
          let cursor: string | null = null;
          let firstPage = true;

          while (firstPage || cursor) {
              firstPage = false;
              const res: any = await monday.api(`query ($cursor: String) {
              boards(ids: ${ORDER_BOARD_ID}) {
                items_page(limit: 100, cursor: $cursor) {
                  cursor
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
            }`, { variables: { cursor } });

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

              const page = res.data.boards[0].items_page;
              items.push(...page.items);
              cursor = page.cursor || null;
          }


          const mappedOrders = items.map((item: any) => {
              const orderObj: Order = { id: item.id, name: item.name };
              Object.entries(ORDER_ALL_COLUMN_IDS_MAP).forEach(([friendlyKey, columnId]) => {
                  const colValue = item.column_values.find((cv: any) => cv.id === columnId);
                  orderObj[friendlyKey] = colValue?.display_value || colValue?.text || "";
              });
              return orderObj;
          });

          setOrders(mappedOrders);
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