import React from 'react';
import { Order } from '../types';

interface OrderTableProps {
  orders: Order[];
  selectedIds: Set<string>;
  onToggleSelection: (id: string) => void;
}



export const OrderTable: React.FC<OrderTableProps> = ({ orders, selectedIds, onToggleSelection }) => {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '12px' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid #c3c7d4', textAlign: 'left' }}>
          <th style={{ padding: '8px' }}>Select</th>
          <th style={{ padding: '8px' }}>Order ID / Name</th>
          <th style={{ padding: '8px' }}>Status</th>
          <th style={{ padding: '8px' }}>Quantity</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((order) => (
          <tr key={order.id} style={{ borderBottom: '1px solid #dcdcdc' }}>
            <td style={{ padding: '8px' }}>
              <input
                type="checkbox"
                checked={selectedIds.has(order.id)}
                onChange={() => onToggleSelection(order.id)}
              />
            </td>
            <td style={{ padding: '8px' }}>{order.name}</td>
            <td style={{ padding: '8px' }}>
              <span
                style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  backgroundColor:
                    order.status === 'Done'
                      ? '#e6f4ea'
                      : order.status === 'Stuck'
                      ? '#fce8e6'
                      : '#f1f3f5',
                  color:
                    order.status === 'Done'
                      ? '#137333'
                      : order.status === 'Stuck'
                      ? '#c5221f'
                      : '#3c4043',
                  fontSize: '12px',
                  fontWeight: 500,
                }}
              >
                {order.status}
              </span>
            </td>
            <td style={{ padding: '8px' }}>{order.quantity}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};