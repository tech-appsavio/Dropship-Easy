// src/views/multi_order_processing/types.ts
export interface Order {
  id: string;
  name: string;
  [key: string]: any; // Allows dynamic keys like "STATUS", "TOTAL_PRICE", etc.
}