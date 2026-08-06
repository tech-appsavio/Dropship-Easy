# Multi-Order Processing — Setup Guide

Welcome! After you install the app and connect it to your monday account, it **automatically creates all the boards it needs** and most of their columns.

A few column types **cannot** be created automatically by monday's API:

- **Connect Boards** (link between two boards)
- **Mirror** (show a value from a connected board)
- **Dependency** / **Formula**

You'll add those by hand, one time, using this guide. It takes ~10–15 minutes. **Use the exact column titles shown here** — the app finds these columns by their title, so spelling and capitalization must match.

---

## Before you start

1. Confirm the app created these **8 boards** in your account:
   **Customers · Products · Suppliers · Orders · Order Line Items · Supplier Products · Supplier Manifests · Shipments**
2. Add the columns **in this order**: first every **Connect** column, then every **Mirror** column. (A mirror can only pull data through a connect column that already exists.)

### How to add a **Connect** column
1. On the board, click **+** (Add Column) → **Connect boards**.
2. Choose the **target board** shown in the "Connect to" column below.
3. When asked, allow it to **also create a column on the connected board** (two-way link) — recommended.
4. **Rename the column** to the exact **Title** shown below.

### How to add a **Mirror** column
1. Click **+** (Add Column) → **Mirror**.
2. Choose the **Connect column** to mirror **through** (the "Through connect" value below).
3. Choose the **source column to display** (the "Shows" value below).
4. **Rename the column** to the exact **Title** shown below.

---

## Customers, Products, Suppliers
✅ **Nothing to do** — these boards are fully created automatically.

---

## Orders

### Connect columns
| Title | Connect to |
|---|---|
| `Parent Orders` | Orders |
| `Customers` | Customers |

### Mirror columns
| Title | Through connect | Shows (source column) |
|---|---|---|
| `Customer Phone` | Customers | Customers → `Phone` |
| `Customer Postal Code` | Customers | Customers → `Postal Code` |

---

## Order Line Items

### Connect columns
| Title | Connect to |
|---|---|
| `Orders` | Orders |
| `Split Orders` | Orders |
| `Suppliers` | Suppliers |
| `Supplier Manifests` | Supplier Manifests |
| `Products` | Products |

### Mirror columns
| Title | Through connect | Shows (source column) |
|---|---|---|
| `Shopify Order ID` | Orders | Orders → `Shopify Order ID` |
| `Customers` | Orders | Orders → `Customers` |
| `Supplier Postal Code` | Suppliers | Suppliers → `Postal Code` |
| `Supplier Address` | Suppliers | Suppliers → `Address` |
| `Supplier Phone` | Suppliers | Suppliers → `Phone` |
| `Product Weight` | Products | Products → `Weight` |

---

## Supplier Products

### Connect columns
| Title | Connect to |
|---|---|
| `Products` | Products |
| `Suppliers` | Suppliers |

### Mirror columns
| Title | Through connect | Shows (source column) |
|---|---|---|
| `Product Weight` | Products | Products → `Weight` |
| `Product Selling Price` | Products | Products → `Selling Price(Per Unit)` |
| `Supplier Postal Code` | Suppliers | Suppliers → `Postal Code` |
| `Supplier Market Rating` | Suppliers | Suppliers → `Market Rating` |
| `Supplier Address` | Suppliers | Suppliers → `Address` |
| `Supplier Phone` | Suppliers | Suppliers → `Phone` |
| `Self Owned` | Suppliers | Suppliers → `Self Owned` |

---

## Supplier Manifests

### Connect columns
| Title | Connect to |
|---|---|
| `Orders` | Orders |
| `Split Orders` | Orders |
| `Order Line Items` | Order Line Items |
| `Suppliers` | Suppliers |

*(No mirror columns on this board.)*

---

## Shipments

### Connect columns
| Title | Connect to |
|---|---|
| `Orders` | Orders |

### Mirror columns
| Title | Through connect | Shows (source column) |
|---|---|---|
| `Shiprocket AWB ID` | Orders | Orders → `Shiprocket AWB ID` |

---

## Status column labels

Status columns are created **with their labels already filled in**. If any label is missing, add it via the column's **⚙️ (Settings) → Edit Labels**. For reference:

- **Orders → Status:** New · Order Placed · Confirmed · Courier Selected · Ready for Supplier Selection · Ready for Manifest Generation · Manifest Generated · Cancelled · Shipped
- **Orders → Order Type:** Header · Order
- **Order Line Items → Status:** Ready for Supplier Selection · Supplier Selected · Courier Selected · Ready for Manifest Generation · Manifest Generated
- **Order Line Items → Shipped:** Yes · No
- **Products → Status:** Available for Sale · Onboarding In Progress · Discarded · In-Active for Sale
- **Suppliers → Status:** New · Active · Onboarding In-Progress · In-Active · Defaulter
- **Supplier Manifests → Send Email To Supplier:** Ready To Send · Send · Resend
- **Shipments → Cancel Shipment:** Active · Cancel

---

## Final checklist

- [ ] All 8 boards exist
- [ ] Every **Connect** column added (with the exact title) — done before mirrors
- [ ] Every **Mirror** column added (through the right connect, showing the right source column)
- [ ] Status labels look correct

Once these are in place, the app is fully wired: Shopify orders flow into **Orders / Order Line Items / Customers / Products**, WhatsApp confirmations update the order **Status**, and the Multi-Order Processing views work across **Suppliers / Supplier Products / Supplier Manifests / Shipments**.

Need help? Contact support and mention which board/column step you're on.
