// src/views/multi_order_processing/components/SpinnerComponent.tsx
import React from 'react';
import { Loader } from '@vibe/core';

export const SpinnerComponent: React.FC = () => {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "32px" }}>
      <Loader size={40} />
    </div>
  );
};