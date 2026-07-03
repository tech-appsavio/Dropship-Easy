// src/views/multi_order_processing/components/IndeterminateCheckbox.tsx
import React from "react";

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
            style={{ width: 14, height: 14, cursor: "pointer", display: "block", margin: "0 auto", accentColor: "#0073ea" }}
        />
    );
};
