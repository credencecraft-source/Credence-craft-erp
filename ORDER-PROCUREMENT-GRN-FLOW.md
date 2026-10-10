# Order to Procurement, GRN, and Allocation

This diagram follows the implemented organization-scoped workflow from merchandising order creation through raw-material receipt and order allocation.

## Business Flow

```mermaid
flowchart TD
    A[Create merchandising order] --> B[Save order, finished-goods rows, and BOM]
    B --> C[Procurement: select open BOM quantities]
    C --> D{Supply source?}

    D -->|Vendor| E[Create Grouped Purchase Order<br/>GP: same material, category, subcategory, stock UOM, and entity]
    E --> F[Enter vendor price for every line]
    F --> G{Price approval}
    G -->|Rejected| H[Grouped PO rejected]
    G -->|Approved| I[Create Master Group<br/>MGP: approved groups with matching entity, vendor, material, category, subcategory, price, GST, and HSN]
    I --> J[Generate vendor Purchase Order<br/>PO from one or more compatible Master Groups]
    J --> K[PO approval / share with vendor]
    K --> L{PO approved or shared?}
    L -->|No| K
    L -->|Yes| M[Receive against PO at an active location for the same entity]
    M --> N[Create GRN header and PO subform]
    N --> O[Store verification<br/>Record verified, approved, rejected, and excess quantities]
    O --> P[Post approved excess to General Inventory<br/>Record rejected quantity separately]
    O --> Q[Allocate matched approved quantity to source Grouped PO buckets]
    Q --> R[Allocate each bucket to its Grouped PO order lines]

    D -->|Existing stock| S[Create STOCK Grouped PO and reserve stock]
    S --> T[Verify store issue / stock grouping]
    T --> Q
```

## Application Architecture

```mermaid
flowchart LR
    subgraph UI[Organization workspace UI]
        U1[Merchandising order and BOM]
        U2[Procurement: Grouped PO and Master Group]
        U3[Purchase Order]
        U4[Inventory: GRN verification and allocation]
    end

    subgraph API[Authenticated API boundary]
        A1[Order and procurement routes]
        A2[Inventory receipt and GRN routes]
        A3[Session authentication + organization membership check]
    end

    subgraph SVC[Domain services]
        S1[Order service]
        S2[Grouped PO service]
        S3[Master PO and Purchase Order services]
        S4[GRN verification service]
        S5[GRN order-allocation service]
    end

    subgraph DATA[Organization-scoped persistence]
        D1[(Merchandising orders and BOM items)]
        D2[(Grouped POs, Master Groups, and POs)]
        D3[(Inventory receipts, GRN verification, allocations, and stock)]
        D4[(Audit events and document counters)]
    end

    U1 --> A1
    U2 --> A1
    U3 --> A1
    U4 --> A2
    A1 --> A3
    A2 --> A3
    A3 --> S1
    A3 --> S2
    A3 --> S3
    A3 --> S4
    A3 --> S5
    S1 --> D1
    S2 --> D1
    S2 --> D2
    S3 --> D2
    S4 --> D2
    S4 --> D3
    S5 --> D3
    S1 --> D4
    S2 --> D4
    S3 --> D4
    S4 --> D4
    S5 --> D4
```

## Key Controls

- Order, BOM, purchasing, receipt, and allocation queries are scoped to the authorized organization; workspace and organization route IDs are not authorization credentials.
- A Grouped PO combines BOM lines only when their material/category/subcategory/UOM and entity match. Vendor pricing is approved separately, and the submitter cannot approve their own group.
- A Master Group cannot mix vendor and stock sources. Its source groups must match the same entity, vendor, material/category/subcategory, price, GST, and HSN.
- Vendor POs are generated from Master Groups for the same active entity and vendor. Stock-sourced Master Groups follow the internal stock-verification path, not vendor PO generation.
- GRNs require an approved or shared PO and an active entity-matched location. Verified receipts may exceed the PO/grouped requirement; approved excess and rejected quantities are excluded from the quantity available for order allocation.
- Verification sets the GRN received, accepted, and rejected quantities. Approved quantity above the remaining grouped requirement is posted to General Inventory; rejected quantity is recorded there as a separate non-available amount.
- GRN verification allocation cannot exceed the matched approved quantity or a source Grouped PO's remaining balance. Order-line allocation cannot exceed that verification allocation or the line's remaining grouped quantity.
- Receipt posting, verification, stock creation, document numbering, and audit writes use database transactions where implemented. Deleting a GRN with order allocations or consumed/reserved excess stock is blocked.

## Implementation Map

- Order and BOM creation: [order-service.ts](lib/services/orders/order-service.ts)
- Grouped PO and price approval: [grouped-purchase-order-service.ts](lib/services/orders/grouped-purchase-order-service.ts)
- Master Group creation: [master-purchase-order-service.ts](lib/services/orders/master-purchase-order-service.ts)
- Vendor PO generation: [purchase-order-service.ts](lib/services/orders/purchase-order-service.ts)
- GRN receipt and posting: [route.ts](app/api/inventory/receipts/route.ts)
- GRN verification and grouping allocation: [rm-grn-verification-service.ts](lib/services/inventory/rm-grn-verification-service.ts)
- Grouping-to-order-line allocation: [rm-grn-order-allocation-service.ts](lib/services/inventory/rm-grn-order-allocation-service.ts)