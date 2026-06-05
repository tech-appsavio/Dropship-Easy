// src/views/multi_order_processing/components/IndeterminateCheckbox.tsx
import React from "react";

// Add the 'export' keyword here
export const IndeterminateCheckbox = ({ checked, indeterminate, onChange }: any) => {
    const ref = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        if (ref.current) {
            ref.current.indeterminate = indeterminate;
        }
    }, [indeterminate]);

    return (
        <input
            type="checkbox"
            ref={ref}
            checked={checked}
            onChange={onChange}
            style={{ cursor: "pointer", width: 16, height: 16, display: "block", margin: "0 auto" }}
        />
    );
};