import React from 'react';
import { Order } from '../types';

interface OrderReviewProps {
  selectedOrders: Order[];
}

export const OrderReview: React.FC<OrderReviewProps> = ({ selectedOrders }) => {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '12px' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid #c3c7d4', textAlign: 'left' }}>
          <th style={{ padding: '8px' }}>Order ID / Name</th>
          <th style={{ padding: '8px' }}>Status</th>
          <th style={{ padding: '8px' }}>Quantity</th>
        </tr>
      </thead>
      <tbody>
        {selectedOrders.map((order) => (
          <tr key={order.id} style={{ borderBottom: '1px solid #dcdcdc' }}>
            <td style={{ padding: '8px' }}>{order.name}</td>
            <td style={{ padding: '8px' }}>
              <span
                style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  backgroundColor: '#e6f4ea',
                  color: '#137333',
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