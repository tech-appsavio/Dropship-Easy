import { useState, useCallback } from "react";

type ToastType = "positive" | "negative" | "warning" | "normal" | "dark";

export const useToast = () => {
    const [toast, setToast] = useState<{ open: boolean; message: string; type: ToastType }>({
        open: false,
        message: "",
        type: "positive",
    });

    const showToast = useCallback((message: string, type: ToastType) => {
        setToast({ open: true, message, type });
    }, []);

    const hideToast = useCallback(() => {
        setToast((prev) => ({ ...prev, open: false }));
    }, []);

    return { toast, showToast, hideToast };
};
