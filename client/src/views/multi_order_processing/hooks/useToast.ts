import { useState, useCallback } from "react";

type ToastType = "positive" | "negative" | "warning" | "normal" | "dark";

export const useToast = () => {
    const [toast, setToast] = useState<{ open: boolean; message: string; type: ToastType; center: boolean }>({
        open: false,
        message: "",
        type: "positive",
        center: false,
    });

    // `center` (optional) shows the toast in the middle of the screen instead of
    // the default top placement. Defaults to false so existing callers are unaffected.
    const showToast = useCallback((message: string, type: ToastType, center = false) => {
        setToast({ open: true, message, type, center });
    }, []);

    const hideToast = useCallback(() => {
        setToast((prev) => ({ ...prev, open: false }));
    }, []);

    return { toast, showToast, hideToast };
};
