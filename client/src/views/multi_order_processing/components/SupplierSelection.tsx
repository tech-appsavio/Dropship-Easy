import React, { useState, useMemo } from "react";
import { Dropdown, Button, Loader, Toast } from "@vibe/core";
import { useSupplierSelectionData } from "../hooks/useSupplierSelectionData";
import { ORDER_ALL_COLUMN_IDS_MAP, ORDERLINEITEMS_ALL_COLUMN_IDS_MAP, SUPPLIER_PRODUCT_COLUMN_IDS_MAP, CUSTOMER_ALL_COLUMN_IDS_MAP, PRODUCT_ALL_COLUMN_IDS_MAP, SUPPLIER_ALL_COLUMN_IDS_MAP } from "../columns";
import { ORDER_ITEM_BOARD_ID, ORDER_BOARD_ID, SUPPLIER_PRODUCT_BOARD_ID } from "../boardIds";
import { logError } from "../utils/logError";
import { aiRank, applyAiRanking } from "../utils/aiRank";
import ShipRocketService from "../../../services/shiprocketCourier";
import mondaySdk from "monday-sdk-js";
import { IndeterminateCheckbox } from "./IndeterminateCheckbox";
import { useToast } from "../hooks/useToast";
import { btn, TH, TD, sectionTitle, paginationBtn, COLOR, badge } from "../styles";
import { Btn } from "./Btn";

const monday = mondaySdk();

const TAG_STYLES: Record<string, React.CSSProperties> = {
    Best:    { background: "var(--ds-success-light)", color: "var(--ds-success)", border: "1px solid var(--ds-success-bd)" },
    Good:    { background: "var(--ds-primary-light)", color: "var(--ds-primary)", border: "1px solid var(--ds-info-bd)" },
    Average: { background: "var(--ds-warning-light)", color: "var(--ds-warning)", border: "1px solid var(--ds-warning-bd)" },
    Poor:    { background: "var(--ds-danger-light)",  color: "var(--ds-danger)",  border: "1px solid var(--ds-danger-bd)" },
};

const SupplierOption = ({ label, tag, availableQty, aiReason }: { label: string; tag?: string; availableQty?: number; aiReason?: string }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "2px 0", width: "100%" }} title={aiReason ? `AI: ${aiReason}` : undefined}>
        <span style={{ fontSize: 13, color: COLOR.text, flexShrink: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            {availableQty !== undefined && (
                <span style={{ fontSize: 11, color: COLOR.textMuted }}>Qty: {availableQty}</span>
            )}
            {aiReason && <span title={`AI: ${aiReason}`} style={{ fontSize: 11 }}>✨</span>}
            {tag && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 8, ...TAG_STYLES[tag] }}>
                    {tag}
                </span>
            )}
        </div>
    </div>
);



export const SupplierSelection = ({
    selectedOrderIds,
    onPrev,
    onNext,
}: {
    selectedOrderIds: string[];
    onPrev: () => void;
    onNext: () => void;
}) => {
    const { suppliersMap, fetchSuppliersForProduct, loading, lineItems, refetch } = useSupplierSelectionData(selectedOrderIds);
    const { toast, showToast, hideToast } = useToast();

    // AI ranking overlay (progressive enhancement): productId → AI-reordered suppliers. Merged
    // OVER the hook's weighted suppliersMap, so if AI is off/unavailable the weighted order shows.
    const [aiSupplierOverride, setAiSupplierOverride] = useState<Record<string, any[]>>({});
    const effSuppliersMap = useMemo(() => ({ ...suppliersMap, ...aiSupplierOverride }), [suppliersMap, aiSupplierOverride]);

    // Per-row supplier selection: lineItemId -> selected supplier option
    const [rowSupplierMap, setRowSupplierMap] = useState<Record<string, any>>({});
    const [selectedLineItemIds, setSelectedLineItemIds] = useState<Set<string>>(new Set());
    const [isUpdating, setIsUpdating] = useState(false);
    const [selectedProductFilter, setSelectedProductFilter] = useState<any>(null);
    const [selectedSkuFilter, setSelectedSkuFilter] = useState<any>(null);
    const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<any>(null);
    const [selectedOrderFilter, setSelectedOrderFilter] = useState<any>(null);
    const [selectedStatusFilter, setSelectedStatusFilter] = useState<any>(null);
    const [selectedExistingSupplierFilter, setSelectedExistingSupplierFilter] = useState<any>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [showFilters, setShowFilters] = useState(false);
    const [showSplitNotice, setShowSplitNotice] = useState(false);

    React.useEffect(() => {
        if (!showSplitNotice) return;
        const t = setTimeout(() => setShowSplitNotice(false), 8000);
        return () => clearTimeout(t);
    }, [showSplitNotice]);

    const resetAllFilters = () => {
        setSelectedOrderFilter(null); setSelectedProductFilter(null); setSelectedSkuFilter(null);
        setSelectedCategoryFilter(null); setSelectedStatusFilter(null); setSelectedExistingSupplierFilter(null);
        setSelectedLineItemIds(new Set()); setGlobalSupplier(null); resetPage();
    };

    const orderOptions = useMemo(() => {
        const map = new Map<string, string>();
        lineItems.forEach((item) => {
            if (item.linkedOrderId && item.orderName) map.set(item.linkedOrderId, item.orderName);
        });
        return Array.from(map.entries()).map(([id, name]) => ({ value: id, label: name }));
    }, [lineItems]);
    const [globalSupplier, setGlobalSupplier] = useState<any>(null);

    const getSplitOrderId = (item: any): string => {
        const col = item.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SPLIT_ORDERS);
        return col?.linked_item_ids?.[0] || "";
    };

    // Pre-fill each row's supplier dropdown: first from the supplier actually SAVED on the board,
    // otherwise auto-select the supplier when a product has exactly ONE (the only possible choice)
    //  mirroring Courier Selection, which auto-selects a single serviceable courier.
    React.useEffect(() => {
        setRowSupplierMap((prev) => {
            const next = { ...prev };
            lineItems.forEach((item) => {
                if (next[item.id]) return; // already has a selection

                const supplierCol = item.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SUPPLIER);
                const existingSupplierName = supplierCol?.display_value?.trim() || supplierCol?.text?.trim();

                if (existingSupplierName) {
                    const suppliers = effSuppliersMap[item.productId] || [];
                    const matchingSupplier = suppliers.find((s: any) => s.label === existingSupplierName);
                    if (matchingSupplier) {
                        next[item.id] = matchingSupplier;
                        return;
                    }
                }

                // Auto-select when the product has a single supplier.
                const suppliers = effSuppliersMap[item.productId];
                if (suppliers && suppliers.length === 1) {
                    next[item.id] = suppliers[0];
                }
            });
            return next;
        });
    }, [effSuppliersMap, lineItems]);

    // Show suppliers only for the currently filtered product
    const globalSupplierOptions = useMemo(() => {
        if (!selectedProductFilter) return [];
        return effSuppliersMap[selectedProductFilter.value] || [];
    }, [effSuppliersMap, selectedProductFilter]);

    const orderFilteredItems = useMemo(() => {
        if (!selectedOrderFilter) return lineItems;
        return lineItems.filter((item) => item.linkedOrderId === selectedOrderFilter.value);
    }, [lineItems, selectedOrderFilter]);

    const productFilterOptions = useMemo(() => {
        const map = new Map();
        orderFilteredItems.forEach((item) => {
            if (item.productId && item.productName) map.set(item.productId, item.productName);
        });
        return Array.from(map.entries()).map(([id, name]) => ({ value: id, label: name }));
    }, [orderFilteredItems]);

    const skuOptions = useMemo(() => {
        const skus = new Set<string>();
        orderFilteredItems.forEach((item) => { if (item.sku) skus.add(item.sku); });
        return Array.from(skus).map((s) => ({ value: s, label: s }));
    }, [orderFilteredItems]);

    const categoryOptions = useMemo(() => {
        const cats = new Set<string>();
        orderFilteredItems.forEach((item) => { if (item.category) cats.add(item.category); });
        return Array.from(cats).map((c) => ({ value: c, label: c }));
    }, [orderFilteredItems]);

    const statusOptions = useMemo(() => {
        const set = new Set<string>();
        lineItems.forEach((item) => {
            const s = item.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.STATUS)?.text?.trim();
            if (s) set.add(s);
        });
        return Array.from(set).map((s) => ({ value: s, label: s }));
    }, [lineItems]);

    const existingSupplierOptions = useMemo(() => {
        const map = new Map<string, string>();
        lineItems.forEach((item) => {
            const col = item.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SUPPLIER);
            const name = col?.display_value?.trim() || col?.text?.trim();
            if (name) map.set(name, name);
        });
        return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
    }, [lineItems]);

    const filteredLineItems = useMemo(() => {
        let items = orderFilteredItems;
        if (selectedProductFilter)          items = items.filter((item) => item.productId === selectedProductFilter.value);
        if (selectedSkuFilter)              items = items.filter((item) => item.sku === selectedSkuFilter.value);
        if (selectedCategoryFilter)         items = items.filter((item) => item.category === selectedCategoryFilter.value);
        if (selectedStatusFilter)           items = items.filter((item) => {
            const s = item.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.STATUS)?.text?.trim();
            return s === selectedStatusFilter.value;
        });
        if (selectedExistingSupplierFilter)  items = items.filter((item) => {
            const col = item.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SUPPLIER);
            const name = col?.display_value?.trim() || col?.text?.trim();
            return name === selectedExistingSupplierFilter.value;
        });
        return items;
    }, [orderFilteredItems, selectedProductFilter, selectedSkuFilter, selectedCategoryFilter, selectedStatusFilter, selectedExistingSupplierFilter]);

    const sortedFilteredLineItems = useMemo(() =>
        [...filteredLineItems].sort((a, b) => (a.orderName || "").localeCompare(b.orderName || "") || (a.name || "").localeCompare(b.name || ""))
    , [filteredLineItems]);

    const totalPages = Math.ceil(sortedFilteredLineItems.length / pageSize) || 1;
    const paginatedLineItems = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return sortedFilteredLineItems.slice(start, start + pageSize);
    }, [sortedFilteredLineItems, currentPage, pageSize]);

    const { orderSpans, sharedSpans } = useMemo(() => {
        const orderSpans: Record<string, number> = {};
        const sharedSpans: Record<string, number> = {};
        let i = 0;
        while (i < paginatedLineItems.length) {
            const orderId = paginatedLineItems[i].linkedOrderId;
            let j = i;
            while (j < paginatedLineItems.length && paginatedLineItems[j].linkedOrderId === orderId) j++;
            orderSpans[paginatedLineItems[i].id] = j - i;
            for (let k = i + 1; k < j; k++) orderSpans[paginatedLineItems[k].id] = 0;
            let m = i;
            while (m < j) {
                const splitId = getSplitOrderId(paginatedLineItems[m]);
                if (splitId) {
                    let n = m;
                    while (n < j && getSplitOrderId(paginatedLineItems[n]) === splitId) n++;
                    sharedSpans[paginatedLineItems[m].id] = n - m;
                    for (let k = m + 1; k < n; k++) sharedSpans[paginatedLineItems[k].id] = 0;
                    m = n;
                } else {
                    let n = m;
                    while (n < j && !getSplitOrderId(paginatedLineItems[n])) n++;
                    sharedSpans[paginatedLineItems[m].id] = n - m;
                    for (let k = m + 1; k < n; k++) sharedSpans[paginatedLineItems[k].id] = 0;
                    m = n;
                }
            }
            i = j;
        }
        return { orderSpans, sharedSpans };
    }, [paginatedLineItems]);

    const resetPage = () => setCurrentPage(1);

    const handleRowSupplierChange = (itemId: string, productId: string, val: any) => {
        setRowSupplierMap((prev) => ({ ...prev, [itemId]: val }));
        if (productId && !suppliersMap[productId]) fetchSuppliersForProduct(productId);
    };

    const handleRowDropdownOpen = (productId: string) => {
        if (productId) fetchSuppliersForProduct(productId);
    };

    const toggleLineItem = (id: string) => {
        const next = new Set(selectedLineItemIds);
        next.has(id) ? next.delete(id) : next.add(id);
        setSelectedLineItemIds(next);
    };

    // Effective supplier for a row: global overrides inline (keyed by item id)
    const getEffectiveSupplier = (itemId: string) => globalSupplier || rowSupplierMap[itemId] || null;

    // ── AI ranking (progressive enhancement) ─────────────
    // Re-ranks each product's supplier options via monday AI into aiSupplierOverride, which is
    // merged OVER the weighted suppliersMap. Best-effort: products the AI can't rank keep their
    // existing (weighted) order, so nothing breaks when AI is off/unavailable.
    const [aiRanking, setAiRanking] = useState(false);
    const handleAiRankAll = async () => {
        if (aiRanking) return;
        setAiRanking(true);
        try {
            // Unique products currently in the order that have >1 supplier to rank.
            const productIds = Array.from(new Set(lineItems.map((i: any) => i.productId).filter(Boolean)))
                .filter((pid) => (effSuppliersMap[pid as string] || []).length > 1) as string[];
            let applied = 0;
            await Promise.all(productIds.map(async (pid) => {
                const opts = effSuppliersMap[pid] || [];
                const items = opts.map((o: any) => ({ id: String(o.value), label: o.label, price: o.price, rating: o.rating, availableQty: o.availableQty }));
                const ranking = await aiRank("supplier", items);
                if (!ranking) return;
                applied++;
                setAiSupplierOverride((prev) => ({ ...prev, [pid]: applyAiRanking(opts, ranking) }));
            }));
            showToast(applied > 0 ? "Suppliers re-ranked by AI." : "AI ranking is unavailable (needs a monday Pro/Enterprise plan with AI).", applied > 0 ? "positive" : "negative");
        } catch {
            showToast("AI ranking failed. Showing standard ranking.", "negative");
        } finally {
            setAiRanking(false);
        }
    };

    const handleSelectBestForAll = () => {
        setRowSupplierMap((prev) => {
            const next = { ...prev };
            lineItems.forEach((item: any) => {
                const suppliers = effSuppliersMap[item.productId] || [];
                if (!suppliers.length) return;
                const best = suppliers.find((s: any) => s.tag === "Best") || suppliers[0];
                if (best) next[item.id] = best;
            });
            return next;
        });
        const selectableIds = new Set(
            lineItems
                .filter((item: any) => (effSuppliersMap[item.productId] || []).length > 0)
                .map((item: any) => item.id)
        );
        setSelectedLineItemIds(selectableIds);
    };

    const hasBestSelectableItems = useMemo(() =>
        lineItems.some((item: any) => (effSuppliersMap[item.productId] || []).length > 0)
    , [lineItems, effSuppliersMap]);

    // Validate: every selected item must have an effective supplier
    const canUpdate = useMemo(() => {
        if (selectedLineItemIds.size === 0) return false;
        return Array.from<string>(selectedLineItemIds).every((id) => !!getEffectiveSupplier(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedLineItemIds, rowSupplierMap, globalSupplier]);

    const handleUpdateSupplier = async () => {
        if (!canUpdate) return;

        const selectedItems = lineItems.filter((item) => selectedLineItemIds.has(item.id));
        const missingFromFilter = Array.from(selectedLineItemIds).filter(id => !filteredLineItems.find((i) => i.id === id));
        if (missingFromFilter.length > 0) {
            console.warn("[SR Debug] - These IDs were hidden by filter/pagination but ARE included via lineItems:", missingFromFilter);
        }

        const supplierQtyMap: Record<string, { supplier: any; requiredQty: number }> = {};
        for (const item of selectedItems) {
            const supplier = getEffectiveSupplier(item.id);
            const key = `${item.productId}__${supplier.value}`;
            const qtyCol = item.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.QUANTITY);
            const qty = parseFloat(qtyCol?.text || "1") || 1;
            if (!supplierQtyMap[key]) supplierQtyMap[key] = { supplier, requiredQty: 0 };
            supplierQtyMap[key].requiredQty += qty;
        }

        for (const { supplier, requiredQty } of Object.values(supplierQtyMap)) {
            const availableQty = supplier.availableQty ?? 0;
            if (availableQty < requiredQty) {
                console.warn(`[SupplierSelection] Insufficient inventory for ${supplier.label}`);
                showToast(`Insufficient inventory for ${supplier.label}: available ${availableQty}, required ${requiredQty}.`, "negative");
                return;
            }
        }

        setIsUpdating(true);
        try {
            await Promise.all(selectedItems.map((item) => {
                const supplier = getEffectiveSupplier(item.id);
                const columnValues = {
                    [ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SUPPLIER]: { item_ids: [supplier.value] },
                    [ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.STATUS]: { label: "Supplier Selected" },
                };
                return monday.api(`mutation {
                    change_multiple_column_values(
                        item_id: ${item.id},
                        board_id: ${ORDER_ITEM_BOARD_ID},
                        column_values: "${JSON.stringify(columnValues).replace(/"/g, '\\"')}"
                    ) { id }
                }`);
            }));

            await Promise.all(
                Object.entries(supplierQtyMap).map(async ([, { supplier, requiredQty }]) => {
                    const supplierProductItemId = supplier.supplierProductItemId;
                    if (supplierProductItemId) {
                        const newQty = (supplier.availableQty ?? 0) - requiredQty;
                        await monday.api(`mutation {
                            change_simple_column_value(
                                item_id: ${supplierProductItemId},
                                board_id: ${SUPPLIER_PRODUCT_BOARD_ID},
                                column_id: "${SUPPLIER_PRODUCT_COLUMN_IDS_MAP.AVAILABLEQUANTITY}",
                                value: "${newQty}"
                            ) { id }
                        }`);
                    }
                })
            );

            const affectedProductIds = [...new Set(selectedItems.map((i) => i.productId).filter(Boolean))] as string[];
            await Promise.all(affectedProductIds.map((pid) => fetchSuppliersForProduct(pid, true)));

            // Create Shiprocket orders
            // Fetch order + customer + product details needed for Shiprocket payload
            const uniqueOrderIds = [...new Set(selectedItems.map((i) => i.linkedOrderId).filter(Boolean))] as string[];
            const orderRes: any = await monday.api(`query {
                items(ids: [${uniqueOrderIds.join(",")}]) {
                    id name
                    column_values {
                        id text value
                        ... on BoardRelationValue { linked_item_ids }
                    }
                }
            }`);
            const orderMap: Record<string, any> = {};
            (orderRes.data?.items || []).forEach((o: any) => { orderMap[o.id] = o; });

            const getLinkedId = (col: any): string => {
                if (col?.linked_item_ids?.[0]) return String(col.linked_item_ids[0]);
                try { const p = JSON.parse(col?.value || "{}"); return String(p?.linkedPulseIds?.[0]?.linkedPulseId || ""); } catch { return ""; }
            };

            // Fetch customers
            const customerIds = [...new Set(Object.values(orderMap).map((o: any) => {
                const col = o.column_values.find((cv: any) => cv.id === ORDER_ALL_COLUMN_IDS_MAP.CUSTOMER);
                return getLinkedId(col);
            }).filter(Boolean))];
            const customerMap: Record<string, any> = {};
            if (customerIds.length > 0) {
                const custRes: any = await monday.api(`query {
                    items(ids: [${customerIds.join(",")}]) {
                        id name
                        column_values { id text value }
                    }
                }`);
                (custRes.data?.items || []).forEach((c: any) => { customerMap[c.id] = c; });
            }

            // Fetch products for selling price and weight
            const uniqueProductIds = [...new Set(selectedItems.map((i) => i.productId).filter(Boolean))] as string[];
            const productMap: Record<string, any> = {};
            if (uniqueProductIds.length > 0) {
                const prodRes: any = await monday.api(`query {
                    items(ids: [${uniqueProductIds.join(",")}]) {
                        id name
                        column_values(ids: ["${PRODUCT_ALL_COLUMN_IDS_MAP.SELLINGPRICE}", "${PRODUCT_ALL_COLUMN_IDS_MAP.PRODUCTCODE}"]) { id text }
                    }
                }`);
                (prodRes.data?.items || []).forEach((p: any) => { productMap[p.id] = p; });
            }

            // Group selected items by orderId + supplierId
            const srGroups: Record<string, { orderId: string; supplierId: string; supplierLabel: string; items: any[] }> = {};
            selectedItems.forEach((item) => {
                const supplier = getEffectiveSupplier(item.id);
                const key = `${item.linkedOrderId}__${supplier.value}`;
                if (!srGroups[key]) srGroups[key] = { orderId: item.linkedOrderId, supplierId: supplier.value, supplierLabel: supplier.label, items: [] };
                srGroups[key].items.push(item);
            });
            Object.entries(srGroups).forEach(([key, group]) => {
            });


            // Detect split orders (same parent order fulfilled by multiple suppliers)
            const groupsPerOrder: Record<string, string[]> = {};
            Object.keys(srGroups).forEach((key) => {
                const { orderId } = srGroups[key];
                if (!groupsPerOrder[orderId]) groupsPerOrder[orderId] = [];
                groupsPerOrder[orderId].push(key);
            });

            // ── Pickup location: ensure every supplier has a registered location in Shiprocket ──
            const uniqueSupplierIds = [...new Set(Object.keys(srGroups).map((k) => srGroups[k].supplierId).filter(Boolean))] as string[];
            const supplierDetailsMap: Record<string, { name: string; email: string; phone: string; address: string; city: string; state: string; country: string; pin_code: string }> = {};
            if (uniqueSupplierIds.length > 0) {
                const suppRes: any = await monday.api(`query {
                    items(ids: [${uniqueSupplierIds.join(",")}]) {
                        id name
                        column_values(ids: [
                            "${SUPPLIER_ALL_COLUMN_IDS_MAP.EMAIL}",
                            "${SUPPLIER_ALL_COLUMN_IDS_MAP.PHONE}",
                            "${SUPPLIER_ALL_COLUMN_IDS_MAP.ADDRESS}",
                            "${SUPPLIER_ALL_COLUMN_IDS_MAP.City}",
                            "${SUPPLIER_ALL_COLUMN_IDS_MAP.State}",
                            "${SUPPLIER_ALL_COLUMN_IDS_MAP.Country}",
                            "${SUPPLIER_ALL_COLUMN_IDS_MAP.POSTALCODE}"
                        ]) { id text }
                    }
                }`);
                (suppRes.data?.items || []).forEach((s: any) => {
                    const getCol = (id: string) => s.column_values.find((cv: any) => cv.id === id)?.text?.trim() || "";
                    const rawPhone = getCol(SUPPLIER_ALL_COLUMN_IDS_MAP.PHONE);
                    supplierDetailsMap[s.id] = {
                        name: s.name || "",
                        email: getCol(SUPPLIER_ALL_COLUMN_IDS_MAP.EMAIL),
                        phone: rawPhone.replace(/\D/g, "").slice(-10),
                        address: getCol(SUPPLIER_ALL_COLUMN_IDS_MAP.ADDRESS),
                        city: getCol(SUPPLIER_ALL_COLUMN_IDS_MAP.City),
                        state: getCol(SUPPLIER_ALL_COLUMN_IDS_MAP.State),
                        country: getCol(SUPPLIER_ALL_COLUMN_IDS_MAP.Country) || "India",
                        pin_code: getCol(SUPPLIER_ALL_COLUMN_IDS_MAP.POSTALCODE),
                    };
                });
            }

            // Fetch all registered Shiprocket pickup locations once
            const registeredPickups = new Set<string>();
            try {
                const pickupRes = await ShipRocketService.getPickupLocations();
                (pickupRes?.data?.shipping_address || []).forEach((loc: any) => {
                    if (loc.pickup_location) registeredPickups.add(loc.pickup_location);
                });
            } catch (e: any) {
                console.warn("[SR Create] Could not fetch pickup locations:", e.message);
            }

            // Create any missing pickup locations before order creation
            for (const key of Object.keys(srGroups)) {
                const group = srGroups[key];
                const pickupName = group.supplierLabel;
                if (registeredPickups.has(pickupName)) {
                    continue;
                }
                const sd = supplierDetailsMap[group.supplierId] || { name: pickupName, email: "", phone: "", address: "", city: "", state: "", country: "India", pin_code: "" };
                try {
                    await ShipRocketService.addPickupAddress({
                        pickup_location: pickupName,
                        name: sd.name || pickupName,
                        email: sd.email,
                        phone: sd.phone,
                        address: sd.address,
                        city: sd.city,
                        state: sd.state,
                        country: sd.country,
                        pin_code: sd.pin_code,
                    });
                    registeredPickups.add(pickupName);
                } catch (e: any) {
                    console.warn("[SR Create] Failed to create pickup location for", pickupName, ":", e.message);
                }
            }
            // ── End pickup location setup ────────────────────────────────

            // Collect split order IDs per parent order so we can update the parent after all groups run
            const createdSplitOrders: Record<string, string[]> = {};
            // Sequential counter per parent order for "-S1", "-S2" naming
            const splitOrderCounters: Record<string, number> = {};

            for (const group of Object.values(srGroups)) {
                try {
                    const order = orderMap[group.orderId];
                    if (!order) { console.warn("[SR Create] Order not found:", group.orderId); return; }
                    const getOCol = (id: string) => order.column_values.find((cv: any) => cv.id === id);

                    const customerId = getLinkedId(getOCol(ORDER_ALL_COLUMN_IDS_MAP.CUSTOMER));
                    const customer = customerMap[customerId];
                    const getCustomerCol = (id: string) => customer?.column_values?.find((cv: any) => cv.id === id);

                    const billingStreet = getCustomerCol(CUSTOMER_ALL_COLUMN_IDS_MAP.Billing_Street)?.text || getOCol(ORDER_ALL_COLUMN_IDS_MAP.BILLING_ADDRESS)?.text || "";
                    const billingCity = getCustomerCol(CUSTOMER_ALL_COLUMN_IDS_MAP.Billing_City)?.text || "";
                    const billingState = getCustomerCol(CUSTOMER_ALL_COLUMN_IDS_MAP.Billing_State)?.text || "";
                    const billingCountry = getCustomerCol(CUSTOMER_ALL_COLUMN_IDS_MAP.Billing_Country)?.text || "India";
                    const billingPincode = getCustomerCol(CUSTOMER_ALL_COLUMN_IDS_MAP.Billing_Postal_Code)?.text || getCustomerCol(CUSTOMER_ALL_COLUMN_IDS_MAP.POSTAL_CODE)?.text || "";
                    const paymentMethod = getOCol(ORDER_ALL_COLUMN_IDS_MAP.PAYMENTMETHOD)?.text || "";
                    const isCOD = paymentMethod.toLowerCase().includes("cod") || paymentMethod.toLowerCase().includes("cash");


                    if (!billingState) throw new Error(`Billing State is missing for order "${order.name}". Please fill in the customer's Billing State in monday.com.`);
                    if (!billingCity) throw new Error(`Billing City is missing for order "${order.name}". Please fill in the customer's Billing City in monday.com.`);
                    if (!billingPincode) throw new Error(`Billing Pincode is missing for order "${order.name}". Please fill in the customer's Billing Pincode in monday.com.`);

                    const orderItems = group.items.map((item) => {
                        const qtyCol = item.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.QUANTITY);
                        const qty = parseInt(qtyCol?.text || "1") || 1;
                        const prod = productMap[item.productId];
                        const sellingPrice = parseFloat(prod?.column_values?.find((cv: any) => cv.id === PRODUCT_ALL_COLUMN_IDS_MAP.SELLINGPRICE)?.text || "0") || 0;
                        const productCode = prod?.column_values?.find((cv: any) => cv.id === PRODUCT_ALL_COLUMN_IDS_MAP.PRODUCTCODE)?.text || item.sku || item.name;
                        return {
                            name: item.productName || item.name,
                            sku: item.sku || productCode,
                            units: qty,
                            selling_price: String(sellingPrice),
                            discount: "0",
                            tax: "0",
                            hsn: "",
                        };
                    });

                    const totalWeight = group.items.reduce((sum, item) => {
                        const weightRaw = item.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.PRODUCTWEIGHT);
                        return sum + (parseFloat(weightRaw?.display_value || weightRaw?.text || "0.2") || 0.2);
                    }, 0);

                    const totalValue = orderItems.reduce((sum, oi) => sum + parseFloat(oi.selling_price) * oi.units, 0);

                    const srOrderPayload = {
                        order_id: `${order.name}-${group.supplierLabel.replace(/\s+/g, "-").slice(0, 20)}-${Date.now()}`,
                        order_date: new Date().toISOString().slice(0, 19),
                        pickup_location: group.supplierLabel,
                        channel_id: "",
                        comment: `Supplier: ${group.supplierLabel}`,
                        billing_customer_name: customer?.name || order.name,
                        billing_last_name: "",
                        billing_address: billingStreet,
                        billing_address_2: "",
                        billing_city: billingCity,
                        billing_pincode: billingPincode,
                        billing_state: billingState,
                        billing_country: billingCountry,
                        billing_email: getCustomerCol(CUSTOMER_ALL_COLUMN_IDS_MAP.EMAIL)?.text || "",
                        billing_phone: getCustomerCol(CUSTOMER_ALL_COLUMN_IDS_MAP.PHONE)?.text || "",
                        shipping_is_billing: true,
                        payment_method: isCOD ? "COD" : "Prepaid",
                        sub_total: totalValue,
                        length: 10, breadth: 10, height: 10,
                        weight: totalWeight,
                        order_items: orderItems,
                    };

                    const srRes = await ShipRocketService.createOrder(srOrderPayload);

                    if (srRes?.errors || (srRes?.status_code && srRes.status_code >= 300)) {
                        const errDetail = srRes?.errors ? JSON.stringify(srRes.errors) : srRes?.message || "Unknown error";
                        throw new Error(`ShipRocket rejected order for "${order.name}": ${errDetail}`);
                    }

                    const srOrderId = String(srRes?.order_id || srRes?.payload?.order_id || "");
                    const srShipmentId = String(srRes?.shipment_id || srRes?.payload?.shipment_id || "");

                    const isSplit = groupsPerOrder[group.orderId].length > 1;

                    if (isSplit) {
                        // Create a new order in the Orders board for this supplier group
                        splitOrderCounters[group.orderId] = (splitOrderCounters[group.orderId] || 0) + 1;
                        const splitOrderName = `${order.name}-S${splitOrderCounters[group.orderId]}`;

                        // Build full address string (billing = shipping since shipping_is_billing:true)
                        const fullAddress = [billingStreet, billingCity, billingState, billingPincode, billingCountry]
                            .filter(Boolean).join(", ");

                        // Today's date for CREATEDDATE column
                        const todayStr = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

                        const parentDiscountRaw = parseFloat(getOCol(ORDER_ALL_COLUMN_IDS_MAP.DISCOUNT)?.text || "0") || 0;
                        const parentTotal = parseFloat(getOCol(ORDER_ALL_COLUMN_IDS_MAP.TOTAL_PRICE)?.text || "0") || 0;

                        // Split Total Price = the actual value of THIS split's items (qty ×
                        // each product's real Selling Price, already computed above as
                        // `totalValue`)  not a proportional cut of the parent order's total.
                        const splitTotal = totalValue;

                        // Discount distributed proportionally to this split's share of the
                        // parent order's total value (parent has no per-item discount split).
                        const splitDiscount = parentTotal > 0 && parentDiscountRaw > 0
                            ? parseFloat(((splitTotal / parentTotal) * parentDiscountRaw).toFixed(2))
                            : 0;

                        // COD mirrors the PARENT order's COD flag as-is (not recomputed per split).
                        const parentCodRaw = getOCol(ORDER_ALL_COLUMN_IDS_MAP.COD)?.text?.trim();
                        const parentCod = parentCodRaw !== undefined && parentCodRaw !== '' ? parseInt(parentCodRaw) || 0 : (isCOD ? 1 : 0);

                        const newOrderColValues: any = {
                            [ORDER_ALL_COLUMN_IDS_MAP.PARENTORDER]:     { item_ids: [String(group.orderId)] },
                            [ORDER_ALL_COLUMN_IDS_MAP.CREATEDDATE]:     { date: todayStr },
                            [ORDER_ALL_COLUMN_IDS_MAP.TOTAL_PRICE]:     String(splitTotal.toFixed(2)),
                            [ORDER_ALL_COLUMN_IDS_MAP.BILLING_ADDRESS]: fullAddress,
                            [ORDER_ALL_COLUMN_IDS_MAP.DELIVERY_CODE]:   billingPincode,
                            [ORDER_ALL_COLUMN_IDS_MAP.PAYMENTMETHOD]:   { label: isCOD ? "COD" : "Prepaid" },
                            [ORDER_ALL_COLUMN_IDS_MAP.STATUS]:          { label: "New" },
                        };
                        // Only set columns whose IDs have been configured
                        if (ORDER_ALL_COLUMN_IDS_MAP.DISCOUNT) newOrderColValues[ORDER_ALL_COLUMN_IDS_MAP.DISCOUNT] = String(splitDiscount);
                        if (ORDER_ALL_COLUMN_IDS_MAP.COD) newOrderColValues[ORDER_ALL_COLUMN_IDS_MAP.COD] = parentCod;
                        if (ORDER_ALL_COLUMN_IDS_MAP.SHIPPING_ADDRESS) newOrderColValues[ORDER_ALL_COLUMN_IDS_MAP.SHIPPING_ADDRESS] = fullAddress;
                        if (customerId) newOrderColValues[ORDER_ALL_COLUMN_IDS_MAP.CUSTOMER] = { item_ids: [customerId] };
                        if (srOrderId) newOrderColValues[ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Order_ID] = srOrderId;
                        if (srShipmentId) newOrderColValues[ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Shipment_ID] = srShipmentId;

                        const splitOrderRes: any = await monday.api(`mutation {
                            create_item(
                                board_id: ${ORDER_BOARD_ID},
                                item_name: "${splitOrderName.replace(/"/g, "'")}",
                                column_values: "${JSON.stringify(newOrderColValues).replace(/"/g, '\\"')}",
                                create_labels_if_missing: true
                            ) { id }
                        }`);
                        const splitOrderId = splitOrderRes?.data?.create_item?.id;

                        // Copy the parent order's Source onto the split order. Uses
                        // change_simple_column_value with the parent's text value, which
                        // works for both a status/color and a plain text Source column.
                        const parentSource = getOCol(ORDER_ALL_COLUMN_IDS_MAP.SOURCE)?.text?.trim();
                        if (splitOrderId && ORDER_ALL_COLUMN_IDS_MAP.SOURCE && parentSource) {
                            try {
                                await monday.api(`mutation {
                                    change_simple_column_value(
                                        item_id: ${splitOrderId},
                                        board_id: ${ORDER_BOARD_ID},
                                        column_id: "${ORDER_ALL_COLUMN_IDS_MAP.SOURCE}",
                                        value: ${JSON.stringify(parentSource)},
                                        create_labels_if_missing: true
                                    ) { id }
                                }`);
                            } catch (e: any) {
                                console.warn("[SR Create] Failed to copy Source to split order:", e?.message);
                            }
                        }

                        // Track for parent order update after all groups
                        if (splitOrderId) {
                            if (!createdSplitOrders[group.orderId]) createdSplitOrders[group.orderId] = [];
                            createdSplitOrders[group.orderId].push(String(splitOrderId));
                        }

                        // Update Split Orders column on each line item to point to the new split order
                        if (splitOrderId) {
                            await Promise.all(group.items.map((item: any) => {
                                const liCV = {
                                    [ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SPLIT_ORDERS]: { item_ids: [String(splitOrderId)] },
                                };
                                return monday.api(`mutation {
                                    change_multiple_column_values(
                                        item_id: ${item.id},
                                        board_id: ${ORDER_ITEM_BOARD_ID},
                                        column_values: "${JSON.stringify(liCV).replace(/"/g, '\\"')}"
                                    ) { id }
                                }`);
                            }));
                        }
                    } else {
                        // Single supplier: write SR IDs directly to the parent order
                        if (srOrderId) {
                            await monday.api(`mutation {
                                change_multiple_column_values(
                                    item_id: ${group.orderId},
                                    board_id: ${ORDER_BOARD_ID},
                                    column_values: "${JSON.stringify({
                                        [ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Order_ID]: srOrderId,
                                        [ORDER_ALL_COLUMN_IDS_MAP.Shiprocket_Shipment_ID]: srShipmentId,
                                    }).replace(/"/g, '\\"')}"
                                ) { id }
                            }`);
                        }

                        // Update ORDER relation on each line item to link to parent order
                        await Promise.all(group.items.map((item: any) => {
                            const liCV = {
                                [ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.ORDER]: { item_ids: [String(group.orderId)] },
                            };
                            return monday.api(`mutation {
                                change_multiple_column_values(
                                    item_id: ${item.id},
                                    board_id: ${ORDER_ITEM_BOARD_ID},
                                    column_values: "${JSON.stringify(liCV).replace(/"/g, '\\"')}"
                                ) { id }
                            }`);
                        }));
                    }
                } catch (srErr: any) {
                    console.error("[SR Create] Failed for group", group.orderId, group.supplierLabel, srErr.message);
                    showToast(`Shiprocket order creation failed for ${group.supplierLabel}: ${srErr.message}`, "negative");
                    logError({
                        stage: "Supplier Selection", severity: "Error",
                        message: `Shiprocket order creation failed for ${group.supplierLabel}: ${srErr.message}`,
                        technicalDetails: String(srErr?.stack || srErr),
                        orderId: String(group.orderId), orderItemId: String(group.orderId), supplier: group.supplierLabel,
                        suggestedSolution: "Verify the supplier's Shiprocket pickup location and product details, then update the supplier again.",
                        retry: true,
                    });
                }
            }

            // Mark each parent order as a Header. NOTE: we intentionally do NOT write the
            // split orders into the parent's "Parent Orders" column  that column means
            // "this order's parent". The child→parent link is set on each split order
            // (see PARENTORDER above); the parent must not list its children here, or the
            // parent-child direction is inverted.
            for (const parentOrderId of Object.keys(createdSplitOrders)) {
                const splitOrderIds = createdSplitOrders[parentOrderId];
                if (!splitOrderIds || splitOrderIds.length === 0) continue;
                try {
                    const parentCV = {
                        [ORDER_ALL_COLUMN_IDS_MAP.Order_Type]: { label: "Header" },
                    };
                    await monday.api(`mutation {
                        change_multiple_column_values(
                            item_id: ${parentOrderId},
                            board_id: ${ORDER_BOARD_ID},
                            column_values: "${JSON.stringify(parentCV).replace(/"/g, '\\"')}"
                        ) { id }
                    }`);
                } catch (e: any) {
                    console.warn("[SR Create] Failed to update parent order", parentOrderId, e.message);
                }
            }

            await refetch();
            if (Object.keys(createdSplitOrders).length > 0) setShowSplitNotice(true);
            showToast("Supplier updated successfully!", "positive");
            monday.execute("valueCreatedForUser"); // monday activation signal
            setSelectedLineItemIds(new Set());
            setRowSupplierMap((prev) => {
                const next = { ...prev };
                selectedItems.forEach((item) => delete next[item.id]);
                return next;
            });
        } catch (e: any) {
            console.error("[SupplierSelection] Update failed:", e.message);
            showToast("Update failed: " + e.message, "negative");
            logError({
                stage: "Supplier Selection", severity: "Error",
                message: `Supplier update failed: ${e.message}`,
                technicalDetails: String(e?.stack || e),
                suggestedSolution: "Re-check the selected line items and supplier assignment, then try updating again.",
                retry: true,
            });
        } finally {
            setIsUpdating(false);
        }
    };

    if (loading) return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, justifyContent: "center", alignItems: "center", minHeight: 400, color: COLOR.textMuted }}>
            <Loader size={38} />
            <span style={{ fontSize: 13 }}>Loading line items…</span>
        </div>
    );

    const hasActiveFilters = selectedOrderFilter || selectedProductFilter || selectedSkuFilter || selectedCategoryFilter || selectedStatusFilter || selectedExistingSupplierFilter;
    const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: COLOR.textMuted, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" };

    return (
        <div>
            <Toast open={toast.open} type={toast.type} onClose={hideToast} autoHideDuration={4000} className="mop-toast">
                <span style={{ fontSize: 14, fontWeight: 600 }}>{toast.message}</span>
            </Toast>

            {showSplitNotice && (
                <div style={{
                    position: "fixed", top: 24, right: 24, zIndex: 10000,
                    width: 380, background: "var(--ds-warning-light)",
                    border: "1px solid var(--ds-warning-bd)", borderLeft: "5px solid var(--ds-warning)",
                    borderRadius: 10, padding: "16px 18px",
                    boxShadow: "0 4px 20px rgba(245,158,11,0.18)",
                    display: "flex", alignItems: "flex-start", gap: 14,
                    animation: "slideInRight 0.3s ease",
                }}>
                    <div style={{ fontSize: 26, lineHeight: 1, flexShrink: 0, marginTop: 2 }}>⚠️</div>
                    <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--ds-warning)", letterSpacing: "0.01em" }}>
                            Split Orders Created
                        </p>
                        <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--ds-warning)", lineHeight: 1.5 }}>
                            Some orders have multiple suppliers and were split into suborders. Please verify before processing.
                        </p>
                    </div>
                    <button
                        onClick={() => setShowSplitNotice(false)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ds-warning)", fontSize: 20, padding: 0, lineHeight: 1, flexShrink: 0, opacity: 0.7 }}
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div>
                    <h3 style={sectionTitle}>Supplier Selection</h3>
                    <p style={{ margin: "3px 0 0", fontSize: 13, color: COLOR.textMuted }}>Assign suppliers to each line item</p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    <div style={{ display: "flex", gap: 8 }}>
                        <button
                            onClick={() => setShowFilters((v) => !v)}
                            style={{ ...btn(showFilters || !!hasActiveFilters ? "primary" : "secondary"), padding: "9px 16px" }}
                        >
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0 }}>
                                <path d="M1.5 2.5A.5.5 0 0 1 2 2h12a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.146.354l-4.5 4.5V13.5a.5.5 0 0 1-.724.447l-2-1A.5.5 0 0 1 7 12.5V9.354l-4.5-4.5A.5.5 0 0 1 2 4.5v-2z" />
                            </svg>
                            Filters{hasActiveFilters ? ` (${[selectedOrderFilter, selectedProductFilter, selectedSkuFilter, selectedCategoryFilter, selectedStatusFilter, selectedExistingSupplierFilter].filter(Boolean).length})` : ""}
                        </button>
                        <button
                            onClick={handleSelectBestForAll}
                            disabled={!hasBestSelectableItems || isUpdating}
                            style={{
                                ...btn("secondary"),
                                display: "flex", alignItems: "center", gap: 6,
                                borderColor: hasBestSelectableItems ? "var(--ds-warning)" : undefined,
                                color: hasBestSelectableItems ? "var(--ds-warning)" : undefined,
                                background: hasBestSelectableItems ? "var(--ds-warning-light)" : undefined,
                            }}
                        >
                            ⭐ Select Best for All
                        </button>
                        <button
                            onClick={handleAiRankAll}
                            disabled={!hasBestSelectableItems || aiRanking || isUpdating}
                            title="Re-rank suppliers using monday AI"
                            style={{
                                ...btn("secondary"),
                                display: "flex", alignItems: "center", gap: 6,
                                borderColor: hasBestSelectableItems ? "var(--ds-primary)" : undefined,
                                color: hasBestSelectableItems ? "var(--ds-primary)" : undefined,
                                background: hasBestSelectableItems ? "var(--ds-primary-light)" : undefined,
                            }}
                        >
                            ✨ {aiRanking ? "Ranking…" : "AI Rank"}
                        </button>
                        <Button disabled={!canUpdate || isUpdating} loading={isUpdating} onClick={handleUpdateSupplier}>
                            Update Supplier{selectedLineItemIds.size > 0 ? ` (${selectedLineItemIds.size})` : ""}
                        </Button>
                    </div>
                    {selectedLineItemIds.size > 0 && !canUpdate && (
                        <p style={{ margin: 0, fontSize: 12, color: COLOR.danger }}>Select a supplier for each checked item</p>
                    )}
                </div>
            </div>

            {/* Filter panel */}
            {showFilters && <div style={{ marginBottom: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 8, position: "relative", zIndex: 22 }}>
                    <div style={{ minWidth: 0 }}>
                        <label style={labelStyle}>Order</label>
                        <Dropdown placeholder="All Orders" options={orderOptions} value={selectedOrderFilter}
                            onChange={(val: any) => { setSelectedOrderFilter(val); setSelectedProductFilter(null); setSelectedSkuFilter(null); setSelectedCategoryFilter(null); setSelectedLineItemIds(new Set()); resetPage(); }} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <label style={labelStyle}>Product</label>
                        <Dropdown placeholder="All Products" options={productFilterOptions} value={selectedProductFilter}
                            onChange={(val: any) => { setSelectedProductFilter(val); setSelectedLineItemIds(new Set()); setGlobalSupplier(null); resetPage(); }} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <label style={labelStyle}>SKU</label>
                        <Dropdown placeholder="All SKUs" options={skuOptions} value={selectedSkuFilter}
                            onChange={(val: any) => { setSelectedSkuFilter(val); setSelectedLineItemIds(new Set()); resetPage(); }} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <label style={labelStyle}>Category</label>
                        <Dropdown placeholder="All Categories" options={categoryOptions} value={selectedCategoryFilter}
                            onChange={(val: any) => { setSelectedCategoryFilter(val); setSelectedLineItemIds(new Set()); resetPage(); }} />
                    </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 0, position: "relative", zIndex: 20, alignItems: "end" }}>
                    <div style={{ minWidth: 0 }}>
                        <label style={labelStyle}>Status</label>
                        <Dropdown placeholder="All Statuses" options={statusOptions} value={selectedStatusFilter}
                            onChange={(val: any) => { setSelectedStatusFilter(val); setSelectedLineItemIds(new Set()); resetPage(); }} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <label style={labelStyle}>Current Supplier</label>
                        <Dropdown placeholder="All Suppliers" options={existingSupplierOptions} value={selectedExistingSupplierFilter}
                            onChange={(val: any) => { setSelectedExistingSupplierFilter(val); setSelectedLineItemIds(new Set()); resetPage(); }} />
                    </div>
                    <div style={{ minWidth: 0 }} />
                    {hasActiveFilters && (
                        <div style={{ minWidth: 0, display: "flex", justifyContent: "flex-end" }}>
                            <button onClick={resetAllFilters} style={{ ...btn("ghost"), marginBottom: 2 }}>
                                - Clear All
                            </button>
                        </div>
                    )}
                </div>
            </div>}

            {/* Global Supplier */}
            <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 12, position: "relative", zIndex: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: COLOR.text, whiteSpace: "nowrap" }}>Apply to All:</label>
                <div style={{ width: 280 }}>
                    <Dropdown placeholder="Select supplier for all items..."
                        options={globalSupplierOptions} value={globalSupplier}
                        onChange={(val: any) => setGlobalSupplier(val)}
                        menuPosition="fixed" menuPlacement="auto"
                        optionRenderer={(opt: any) => <SupplierOption label={opt.label} tag={opt.tag} availableQty={opt.availableQty} aiReason={opt.aiReason} />} />
                </div>
                {globalSupplier && (
                    <button onClick={() => setGlobalSupplier(null)} style={btn("ghost")}>- Clear</button>
                )}
            </div>

            {/* Table */}
            <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 420, border: `1px solid ${COLOR.border}`, borderRadius: 10 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1000 }}>
                    <thead>
                        <tr>
                            <th style={{ ...TH, width: 36, minWidth: 36, padding: "9px 4px" }}>
                                <IndeterminateCheckbox
                                    checked={filteredLineItems.length > 0 && paginatedLineItems.every((i) => selectedLineItemIds.has(i.id))}
                                    indeterminate={paginatedLineItems.some((i) => selectedLineItemIds.has(i.id)) && !paginatedLineItems.every((i) => selectedLineItemIds.has(i.id))}
                                    onChange={() => {
                                        const allSel = paginatedLineItems.every((i) => selectedLineItemIds.has(i.id));
                                        const next = new Set(selectedLineItemIds);
                                        paginatedLineItems.forEach((i) => allSel ? next.delete(i.id) : next.add(i.id));
                                        setSelectedLineItemIds(next);
                                    }}
                                />
                            </th>
                            {["Order","Product Name","SKU","Category","Qty","Current Supplier","Split Order","Status"].map(h => <th key={h} style={TH}>{h}</th>)}
                            <th style={{ ...TH, minWidth: 400 }}>Select Supplier</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredLineItems.length > 0 ? paginatedLineItems.map((item) => {
                            const productSuppliers = effSuppliersMap[item.productId] || [];
                            const currentSupplierCol = item.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SUPPLIER);
                            const statusCol = item.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.STATUS);
                            const qtyCol = item.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.QUANTITY);
                            const splitId = getSplitOrderId(item);
                            const splitOrderCol = item.column_values?.find((cv: any) => cv.id === ORDERLINEITEMS_ALL_COLUMN_IDS_MAP.SPLIT_ORDERS);
                            const statusText = statusCol?.text || "-";
                            const orderSpan = orderSpans[item.id];
                            const sharedSpan = sharedSpans[item.id];
                            return (
                                <tr key={item.id}
                                    onMouseEnter={(e) => { if (!selectedLineItemIds.has(item.id)) e.currentTarget.style.backgroundColor = "var(--ds-bg-header)"; }}
                                    onMouseLeave={(e) => { if (!selectedLineItemIds.has(item.id)) e.currentTarget.style.backgroundColor = COLOR.white; }}
                                    style={{ backgroundColor: selectedLineItemIds.has(item.id) ? COLOR.primaryLight : COLOR.white, transition: "background 0.15s" }}>
                                    <td style={{ ...TD, width: 36, minWidth: 36, padding: "8px 4px", verticalAlign: "middle" }}>
                                        <input type="checkbox" checked={selectedLineItemIds.has(item.id)} onChange={() => toggleLineItem(item.id)}
                                            style={{ width: 14, height: 14, cursor: "pointer", display: "block", margin: "0 auto", accentColor: "#0073ea" }} />
                                    </td>
                                    {orderSpan !== 0 && (
                                        <td style={{ ...TD, verticalAlign: "middle", fontWeight: 600 }} rowSpan={orderSpan > 1 ? orderSpan : undefined}>
                                            {item.orderName || "-"}
                                        </td>
                                    )}
                                    <td style={TD}>{item.productName || "-"}</td>
                                    <td style={TD}>{item.sku || "-"}</td>
                                    <td style={TD}>{item.category || "-"}</td>
                                    <td style={TD}>{qtyCol?.text || "-"}</td>
                                    {sharedSpan !== 0 && (
                                        <td style={{ ...TD, verticalAlign: "middle" }} rowSpan={sharedSpan > 1 ? sharedSpan : undefined}>
                                            {currentSupplierCol?.display_value || currentSupplierCol?.text || "-"}
                                        </td>
                                    )}
                                    {sharedSpan !== 0 && (
                                        <td style={{ ...TD, verticalAlign: "middle", fontWeight: splitId ? 500 : undefined }} rowSpan={sharedSpan > 1 ? sharedSpan : undefined}>
                                            {splitOrderCol?.display_value || "-"}
                                        </td>
                                    )}
                                    <td style={TD}>
                                        <span style={badge(statusText === "Supplier Selected" ? "success" : "neutral")}>
                                            {statusText}
                                        </span>
                                    </td>
                                    <td style={{ ...TD, minWidth: 400, padding: "6px 10px" }}>
                                        <Dropdown
                                            placeholder={globalSupplier ? globalSupplier.label : "Select supplier..."}
                                            options={productSuppliers}
                                            value={globalSupplier ? globalSupplier : (rowSupplierMap[item.id] || null)}
                                            onChange={(val: any) => !globalSupplier && handleRowSupplierChange(item.id, item.productId, val)}
                                            onMenuOpen={() => !globalSupplier && handleRowDropdownOpen(item.productId)}
                                            menuPosition="fixed" menuPlacement="auto" disabled={!!globalSupplier}
                                            menuStyles={{ minWidth: 400, width: "max-content", maxWidth: 560 }}
                                            optionRenderer={(opt: any) => <SupplierOption label={opt.label} tag={opt.tag} availableQty={opt.availableQty} aiReason={opt.aiReason} />}
                                        />
                                    </td>
                                </tr>
                            );
                        }) : (
                            <tr>
                                <td colSpan={11} style={{ padding: "48px 24px", textAlign: "center", color: COLOR.textMuted }}>
                                    <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--ds-neutral-bg)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontSize: 24 }}>📋</div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: COLOR.text, marginBottom: 3 }}>No line items</div>
                                    <div style={{ fontSize: 13 }}>
                                        {hasActiveFilters ? "No line items match the selected filters  try clearing them." : "No line items found for the selected orders."}
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} style={paginationBtn(currentPage === 1)}>- Prev</button>
                    <span style={{ fontSize: 12, fontWeight: 600, padding: "5px 12px", border: `1px solid ${COLOR.border}`, borderRadius: 6, background: COLOR.bg }}>{currentPage} / {totalPages}</span>
                    <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} style={paginationBtn(currentPage === totalPages)}>Next -</button>
                    <span style={{ fontSize: 12, color: COLOR.textMuted }}>{sortedFilteredLineItems.length} record{sortedFilteredLineItems.length !== 1 ? "s" : ""}</span>
                </div>
                <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                    style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${COLOR.border}`, fontSize: 13, color: COLOR.text }}>
                    {[5, 10, 20, 50].map((n) => <option key={n} value={n}>{n} / page</option>)}
                </select>
            </div>

            {/* Bottom nav */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingTop: 14, borderTop: `1px solid ${COLOR.borderLight}` }}>
                <Btn variant="secondary" onClick={onPrev}>← Back to Orders</Btn>
                <Btn variant="primary" onClick={onNext}>Go to Courier Selection →</Btn>
            </div>
        </div>
    );
};
