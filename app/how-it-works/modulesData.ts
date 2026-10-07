import {
  ERP_MODULES,
  getErpModuleForBusinessTypeName,
  type ErpModule,
} from "@/components/erp/erp-config-registry";
import {
  MASTER_DEFINITIONS,
  MASTER_MODULE_HIERARCHY,
} from "@/lib/master-data/master-data-registry";

export type HowItWorksStep = {
  title: string;
  detail: string;
};

export type HowItWorksWorkflow = {
  key: string;
  label: string;
  title: string;
  description: string;
  steps: readonly HowItWorksStep[];
};

export type TaggedBusinessType = {
  name: string;
  tags: readonly string[];
};

export type TaggedHowItWorksGroup = {
  tag: string;
  businessTypes: {
    key: string;
    label: string;
    modules: (typeof HOW_IT_WORKS_MODULES)[number][];
  }[];
};

export type ModuleCuriosityTeaser = {
  question: string;
  hint: string;
  factoryContext: string;
};

type ModuleContent = {
  purpose: string;
  hook: string;
  factoryExample: string;
  result: string;
  toolkitLabel: string;
  toolkitSummary: string;
  toolkit: readonly string[];
  workflows: readonly HowItWorksWorkflow[];
};

const moduleContent: Record<string, ModuleContent> = {
  online: {
    purpose: "Connect wholesale and direct-to-customer demand to stock and production.",
    hook: "Sell confirmed styles without guessing production demand.",
    factoryExample: "A Tiruppur knitwear unit groups buyer pre-orders before confirming its next production run.",
    result: "Save fabric and cash by planning against confirmed demand.",
    toolkitLabel: "CHANNEL TOOLKIT",
    toolkitSummary: "One view for pre-orders and ready-to-ship garments.",
    toolkit: ["B2B and B2C demand", "Pre-order dashboards", "Ready-stock selling", "Stock-aware fulfilment"],
    workflows: [
      {
        key: "pre-order",
        label: "Pre-order",
        title: "Turn buyer demand into a production signal",
        description: "Keep B2B and B2C pre-orders visible before the unit commits fabric and capacity.",
        steps: [
          { title: "Capture demand", detail: "Record style, channel, quantity, and the buyer's delivery expectation." },
          { title: "Review the order book", detail: "Compare pre-orders by style before confirming production quantities." },
          { title: "Plan the run", detail: "Hand confirmed demand to the team planning fabric and factory capacity." },
        ],
      },
      {
        key: "ready-stock",
        label: "Ready stock",
        title: "Sell available garments without overselling",
        description: "Use stock visibility to guide a B2B or B2C sale.",
        steps: [
          { title: "Check availability", detail: "Review the style and size stock before promising a quantity." },
          { title: "Record the sale", detail: "Keep the channel, garment, and quantity tied to the transaction." },
          { title: "Fulfil from stock", detail: "Dispatch the available pieces instead of raising an unnecessary make." },
        ],
      },
    ],
  },
  pos: {
    purpose: "Keep garment counter sales, purchase bills, and stock movements together.",
    hook: "Invoice garments without losing track of shelf stock.",
    factoryExample: "A tailoring shop in Coimbatore bills a walk-in customer and sees the sold pieces leave stock.",
    result: "Save counter time; each posted invoice updates the stock record.",
    toolkitLabel: "COUNTER TOOLKIT",
    toolkitSummary: "Fast billing for garment shops and tailoring counters.",
    toolkit: ["Quick invoice", "Purchase bill entry", "Customer and vendor records", "Stock lookup", "Invoice history"],
    workflows: [
      {
        key: "sales",
        label: "Counter sale",
        title: "From garment selection to a stock-aware invoice",
        description: "Create a clear bill without re-entering the same sale in a separate stock book.",
        steps: [
          { title: "Select the garment", detail: "Find the item and confirm its available quantity." },
          { title: "Prepare the invoice", detail: "Enter the sale details and applicable tax information." },
          { title: "Post the sale", detail: "Keep the invoice and sold quantity connected to the stock record." },
        ],
      },
      {
        key: "purchase",
        label: "Purchase bill",
        title: "Record the supplier bill against goods received",
        description: "Keep purchase paperwork, supplier details, and stock entry in one trail.",
        steps: [
          { title: "Choose the supplier", detail: "Select the vendor already used by the business." },
          { title: "Enter the bill", detail: "Record the billed items, quantities, and tax details." },
          { title: "Check the record", detail: "Review the bill and its effect on the relevant stock." },
        ],
      },
    ],
  },
  "order-management": {
    purpose: "Turn a buyer order into a clear production and purchasing plan.",
    hook: "Stop buyer changes from getting lost between teams.",
    factoryExample: "A Tiruppur export house carries the buyer's style, colour, size ratio, and ship date into its make plan.",
    result: "Save re-entry; one buyer order drives the BOM and purchase handoff.",
    toolkitLabel: "FAST-FASHION TOOLKIT",
    toolkitSummary: "Less quantity. More styles. Faster decisions.",
    toolkit: [
      "Quick order entry",
      "Low-quantity, multi-style planning",
      "BOM and costing control",
      "Tech pack and measurements",
      "Size-wise finished goods",
      "Approval to production handoff",
    ],
    workflows: [
      {
        key: "merchandising",
        label: "Merchandising",
        title: "From buyer request to production-ready order",
        description: "Capture the style, quantity, sizes, materials, cost, and delivery promise together.",
        steps: [
          { title: "Create the order", detail: "Select buyer, brand, article, season, colours, size group, quantity, and delivery date." },
          { title: "Plan the make", detail: "Set the size mix, BOM, costing, tech pack, measurements, and production process." },
          { title: "Release with control", detail: "Move the order through approval and work-order stages using one shared record." },
        ],
      },
      {
        key: "procurement",
        label: "Procurement",
        title: "From material need to approved purchase order",
        description: "Buy the right material, quantity, and price from the right supplier.",
        steps: [
          { title: "Allocate the vendor", detail: "Group BOM requirements and assign the supplier." },
          { title: "Check the price", detail: "Review GST, HSN, unit, minimum order, and other charges." },
          { title: "Create the PO", detail: "Convert the approved requirement into a traceable purchase order." },
        ],
      },
    ],
  },
  "design-development": {
    purpose: "Carry approved design details from sampling into the production-ready tech pack.",
    hook: "Keep approved samples and production specs identical.",
    factoryExample: "A Tiruppur sample room records the approved collar, stitch, and measurement before bulk cutting.",
    result: "Avoid repeat sample work caused by missing or changed specifications.",
    toolkitLabel: "SAMPLE-ROOM TOOLKIT",
    toolkitSummary: "Keep approved product details close to the style.",
    toolkit: ["Tech pack", "Measurement chart", "Gold-seal checkpoint", "Approved article details"],
    workflows: [
      {
        key: "tech-pack",
        label: "Tech pack",
        title: "Move the approved sample details into the make pack",
        description: "Give merchandising and production the same approved construction reference.",
        steps: [
          { title: "Capture specifications", detail: "Record construction, measurements, trims, and style details." },
          { title: "Review the sample", detail: "Compare the sample against the defined product requirements." },
          { title: "Lock the approval", detail: "Mark the accepted gold-seal details for production reference." },
        ],
      },
    ],
  },
  "factory-management": {
    purpose: "Connect work orders, shop-floor progress, work-in-progress, and packing.",
    hook: "See where today's order is stuck on the floor.",
    factoryExample: "A garment unit follows a shirt order from fabric issue through sewing lines to scan-and-pack.",
    result: "Save line time by spotting stalled work before the next handoff.",
    toolkitLabel: "FACTORY FLOOR TOOLKIT",
    toolkitSummary: "Follow an order from work order to packed garment.",
    toolkit: ["Pre-production work order", "Shop-floor output", "WIP tracking", "Production dashboard", "Scan and pack"],
    workflows: [
      {
        key: "pre-production",
        label: "Pre-production",
        title: "Prepare the order before it reaches the line",
        description: "Translate the approved order into the work instructions and material plan.",
        steps: [
          { title: "Open the work order", detail: "Select the released order and confirm its planned quantity." },
          { title: "Check the BOM", detail: "Review the materials and process requirements before issue." },
          { title: "Release to the floor", detail: "Make the approved work order available to production." },
        ],
      },
      {
        key: "production",
        label: "Production floor",
        title: "Record output and work-in-progress by process",
        description: "Show supervisors what is completed and what still needs attention.",
        steps: [
          { title: "Start the process", detail: "Record work against the relevant order and operation." },
          { title: "Capture output", detail: "Enter completed, rejected, and pending quantities at the floor." },
          { title: "Review WIP", detail: "See which process owns the remaining pieces before moving them on." },
        ],
      },
      {
        key: "post-production",
        label: "Post-production",
        title: "Verify packed quantity before dispatch",
        description: "Scan finished garments into a clear order, colour, and size trail.",
        steps: [
          { title: "Select the order", detail: "Open the completed order and its pack requirement." },
          { title: "Scan the garments", detail: "Capture the pieces packed against the correct style and size." },
          { title: "Confirm the pack", detail: "Review the scanned quantities before dispatch preparation." },
        ],
      },
    ],
  },
  "quality-management-system": {
    purpose: "Check incoming fabric and finished garments against quality requirements.",
    hook: "Catch fabric and stitching defects before dispatch.",
    factoryExample: "A Tiruppur export unit holds a faulty fabric lot or stitching batch before it reaches packing.",
    result: "Save rework cost by holding defects before they reach the buyer.",
    toolkitLabel: "QUALITY TOOLKIT",
    toolkitSummary: "Find issues at the material and finished-goods checkpoints.",
    toolkit: ["Raw-material inspection", "Finished-goods inspection", "Quality status", "Inspection records"],
    workflows: [
      {
        key: "raw-material",
        label: "Incoming material",
        title: "Check the lot before it enters usable stock",
        description: "Give the fabric store a clear accept, hold, or reject decision.",
        steps: [
          { title: "Identify the receipt", detail: "Select the received lot and its source document." },
          { title: "Inspect the material", detail: "Record the quality checks and any observed defects." },
          { title: "Set the disposition", detail: "Keep accepted and held material distinct for the store team." },
        ],
      },
      {
        key: "finished-goods",
        label: "Finished garments",
        title: "Find garment defects before the carton is closed",
        description: "Record inspection results while the pieces are still available to correct.",
        steps: [
          { title: "Select finished goods", detail: "Choose the order and quantity ready for inspection." },
          { title: "Check workmanship", detail: "Record the required checks and any failed pieces." },
          { title: "Release accepted pieces", detail: "Keep rejected or rework pieces out of dispatch-ready stock." },
        ],
      },
    ],
  },
  "finance-management": {
    purpose: "Connect operational orders to invoices, bills, notes, and delivery documents.",
    hook: "See order margin and bills due before cash runs short.",
    factoryExample: "An export house checks its supplier bill against the PO and received trims before payment.",
    result: "Save follow-up time with bill and invoice status in one record trail.",
    toolkitLabel: "FINANCE TOOLKIT",
    toolkitSummary: "Keep commercial documents tied to the work they support.",
    toolkit: ["Sales invoice", "Purchase invoice", "Debit and credit notes", "Delivery challan", "Purchase bill"],
    workflows: [
      {
        key: "purchase",
        label: "Supplier bill",
        title: "Check what the unit owes against what it ordered",
        description: "Keep supplier billing connected to procurement and receipt records.",
        steps: [
          { title: "Find the purchase", detail: "Select the related supplier and purchase document." },
          { title: "Record the bill", detail: "Enter invoice values, tax details, and due information." },
          { title: "Review the balance", detail: "Compare the billed amount with the linked order and receipt." },
        ],
      },
      {
        key: "sales",
        label: "Customer invoice",
        title: "Prepare customer billing from the completed work",
        description: "Keep sales billing and dispatch paperwork connected to the order.",
        steps: [
          { title: "Select the customer order", detail: "Open the customer and the goods ready to bill." },
          { title: "Create the invoice", detail: "Record invoice quantities and applicable tax details." },
          { title: "Link delivery", detail: "Keep the delivery challan and invoice in the same trail." },
        ],
      },
    ],
  },
  "inventory-management": {
    purpose: "Track fabric, trims, inward receipts, issues, and finished-garment stock.",
    hook: "Find the right fabric before cutting stops.",
    factoryExample: "A fabric-store keeper in Tiruppur checks received rolls before issuing the order's cutting requirement.",
    result: "Avoid duplicate fabric buying by checking recorded stock before raising a PO.",
    toolkitLabel: "FABRIC STORE TOOLKIT",
    toolkitSummary: "Know what came in, what is on hand, and what left the store.",
    toolkit: ["Goods receipt", "Raw-material stock", "Material issue", "Finished-goods stock", "Returnable movement"],
    workflows: [
      {
        key: "inward",
        label: "Inward",
        title: "Receive fabric and trims against their source",
        description: "Keep the supplier delivery and accepted store quantity connected.",
        steps: [
          { title: "Select the source", detail: "Open the PO, packing list, or returnable document." },
          { title: "Count the delivery", detail: "Record the received and checked quantities by material." },
          { title: "Post the receipt", detail: "Make accepted material traceable in the store record." },
        ],
      },
      {
        key: "stock",
        label: "Store stock",
        title: "Check material before a new purchase or cutting issue",
        description: "Use the stock record to see what the fabric store can supply.",
        steps: [
          { title: "Find the material", detail: "Look up the fabric or trim required for the order." },
          { title: "Review its balance", detail: "Check recorded stock before promising it to a new job." },
          { title: "Plan the next move", detail: "Identify whether the material needs issue, transfer, or replenishment." },
        ],
      },
      {
        key: "outward",
        label: "Outward",
        title: "Issue the right material to the right order",
        description: "Keep store withdrawals and returnable material movements accountable.",
        steps: [
          { title: "Select the order", detail: "Choose the production order receiving the material." },
          { title: "Record the movement", detail: "Enter the issued quantity and movement reference." },
          { title: "Keep the trail", detail: "Retain the order and material link for later checking." },
        ],
      },
    ],
  },
  distribution: {
    purpose: "Keep dispatches, delivery promises, and customer orders moving as one flow.",
    hook: "Know where every dispatch stands before the next delivery window.",
    factoryExample: "A distribution desk tracks the packed garments, route, and promised delivery date for each order.",
    result: "Reduce late dispatches by keeping route, stock, and delivery status together.",
    toolkitLabel: "DISTRIBUTION TOOLKIT",
    toolkitSummary: "One view for dispatch readiness and delivery follow-up.",
    toolkit: ["Dispatch planning", "Delivery tracking", "Sales-order visibility", "Route and warehouse coordination"],
    workflows: [
      {
        key: "dispatch",
        label: "Dispatch",
        title: "Move ready goods to the next customer handoff",
        description: "Keep the order, warehouse, and dispatch window aligned before release.",
        steps: [
          { title: "Check readiness", detail: "Verify the packed quantity, warehouse, and customer destination." },
          { title: "Plan the dispatch", detail: "Assign the route, vehicle or partner, and required dispatch notes." },
          { title: "Release the load", detail: "Record the dispatch and leave a traceable handoff for the delivery team." },
        ],
      },
      {
        key: "delivery",
        label: "Delivery",
        title: "Track the customer handoff to the final mile",
        description: "Carry delivery progress and any exceptions without losing the original order trail.",
        steps: [
          { title: "Confirm the route", detail: "Open the delivery plan tied to the customer and dispatch record." },
          { title: "Monitor status", detail: "Update the current stage and note any delay or approval needed." },
          { title: "Close the delivery", detail: "Capture the completion evidence and keep the order customer-ready." },
        ],
      },
    ],
  },
  "security-management": {
    purpose: "Record what enters and leaves the premises and who handled the movement.",
    hook: "Know what entered, left, and who signed.",
    factoryExample: "A Tiruppur security desk records a fabric lorry's arrival and its linked supplier papers.",
    result: "Save gate-desk follow-up with one dated movement record.",
    toolkitLabel: "GATE DESK TOOLKIT",
    toolkitSummary: "Keep visitor and goods movement visible at the entrance.",
    toolkit: ["Gate entry", "Goods movement details", "Movement reports", "Entry reference"],
    workflows: [
      {
        key: "gate-entry",
        label: "Gate entry",
        title: "Record goods at the factory entrance",
        description: "Give the store team a clear arrival trail before inward processing.",
        steps: [
          { title: "Register the arrival", detail: "Capture the party, vehicle, date, and movement reference." },
          { title: "Describe the goods", detail: "Record the material or garments and the accompanying papers." },
          { title: "Hand over for checking", detail: "Pass the movement details to the responsible receiving team." },
        ],
      },
      {
        key: "gate-reports",
        label: "Movement report",
        title: "Find the movement record when a paper trail is needed",
        description: "Review the gate activity by its date, party, and movement details.",
        steps: [
          { title: "Choose the period", detail: "Filter the report to the relevant operating dates." },
          { title: "Find the movement", detail: "Search the party, vehicle, or reference details." },
          { title: "Verify the trail", detail: "Review the entry details against the source paperwork." },
        ],
      },
    ],
  },
  approvals: {
    purpose: "Route purchase decisions through visible review before supplier commitment.",
    hook: "Stop unapproved purchase prices reaching suppliers.",
    factoryExample: "An export-house purchase order waits for an authorised review before the buyer commits to a fabric rate.",
    result: "Avoid wrong-price buying by checking approval before the PO is released.",
    toolkitLabel: "CONTROL TOOLKIT",
    toolkitSummary: "Separate preparation from approval for controlled decisions.",
    toolkit: ["Purchase-order review", "Approval status", "Decision trail"],
    workflows: [
      {
        key: "purchase-order",
        label: "Purchase order",
        title: "Review a PO before the supplier commitment",
        description: "Check the purchase details at the approval point.",
        steps: [
          { title: "Open the submitted PO", detail: "Review the supplier, material, quantity, and price." },
          { title: "Check supporting details", detail: "Compare the PO with its order need and applicable tax details." },
          { title: "Record the decision", detail: "Approve or return the PO before it moves forward." },
        ],
      },
    ],
  },
};

function createFallbackContent(module: ErpModule): ModuleContent {
  const childNames = module.children.map((child) => child.label);
  return {
    purpose: `Follow ${module.label.toLowerCase()} work and its connected factory records.`,
    hook: `Keep ${module.label.toLowerCase()} work visible between teams.`,
    factoryExample: `A garment unit uses ${module.label.toLowerCase()} to keep its order and factory handoffs together.`,
    result: "Reduce repeat entry by keeping related work in one traceable flow.",
    toolkitLabel: `${module.label.toUpperCase()} TOOLKIT`,
    toolkitSummary: "Follow the records teams use to complete this work.",
    toolkit: childNames.length ? childNames : ["Shared records", "Work status", "Operational handoff"],
    workflows: [
      {
        key: module.key,
        label: module.label,
        title: `Move ${module.label.toLowerCase()} work through a clear handoff`,
        description: "Keep the source details, responsible team, and next action visible.",
        steps: [
          { title: "Open the source record", detail: `Start with the relevant ${module.label.toLowerCase()} request or document.` },
          { title: "Check the details", detail: "Confirm the item, quantity, and responsible team before proceeding." },
          { title: "Record the handoff", detail: "Leave the next team a clear status and source reference." },
        ],
      },
    ],
  };
}

function getMasterGroups(moduleKey: string) {
  const definitions = MASTER_DEFINITIONS.filter((definition) => definition.moduleGroup === moduleKey);
  const groups = new Map<string, string[]>();

  for (const definition of definitions) {
    const subgroup = definition.moduleSubGroup ?? "general";
    const entries = groups.get(subgroup) ?? [];
    entries.push(definition.label);
    groups.set(subgroup, entries);
  }

  return [...groups.entries()]
    .map(([key, labels]) => ({
      key,
      label: MASTER_MODULE_HIERARCHY[moduleKey]?.children[key] ?? key.split("-").join(" "),
      masters: definitions
        .filter((definition) => (definition.moduleSubGroup ?? "general") === key)
        .map((definition) => ({
          key: definition.key,
          label: definition.label,
        })),
      labels,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

const childWorkflowKeys: Record<string, Record<string, string>> = {
  pos: {
    "quick-invoice": "sales",
    "purchase-bill": "purchase",
    invoice: "sales",
  },
  "security-management": {
    "gate-entry-reports": "gate-reports",
  },
  approvals: {
    "purchase-order-approval": "purchase-order",
  },
};

const excludedModuleKeys = new Set(["admin", "settings"]);
const excludedChildModuleKeys: Record<string, ReadonlySet<string>> = {
  approvals: new Set(["approval-settings"]),
};

const childTabLabels: Record<string, Record<string, string>> = {
  "factory-management": {
    production: "Production Floor",
  },
  "inventory-management": {
    stock: "Inventory / Store",
  },
};

const childContentOverrides: Record<string, Partial<ModuleContent>> = {
  "order-management-merchandising": {
    purpose: "Keep buyer, style, quantity, size mix, and delivery details together.",
    hook: "Keep every buyer style detail attached to its order.",
    result: "Save re-entry; the order carries its details into production planning.",
    toolkitLabel: "MERCHANDISING TOOLKIT",
    toolkitSummary: "One order record from buyer request to factory handoff.",
    toolkit: ["Buyer and style details", "Size and colour mix", "BOM and costing", "Delivery commitment"],
  },
  "order-management-procurement": {
    purpose: "Turn approved material requirements into supplier purchase orders.",
    hook: "Buy the right fabric quantity at the approved price.",
    result: "Avoid excess buying by linking the PO to the order BOM.",
    toolkitLabel: "PROCUREMENT TOOLKIT",
    toolkitSummary: "Connect material needs, vendor rates, and purchase approval.",
    toolkit: ["BOM-based requirement", "Vendor allocation", "GST and HSN checks", "Purchase-order approval"],
  },
  "design-development-tech-pack": {
    purpose: "Carry approved sample construction and measurements into production.",
    hook: "Keep the approved sample details on the factory pack.",
    result: "Reduce repeat samples caused by missing specifications.",
    toolkitLabel: "TECH-PACK TOOLKIT",
    toolkitSummary: "Keep approved style instructions close to the order.",
    toolkit: ["Style construction", "Measurements", "Gold-seal approval", "Production reference"],
  },
  "factory-management-pre-production": {
    purpose: "Prepare the order, materials, and process before the line starts.",
    hook: "Stop the line waiting for an incomplete work order.",
    result: "Save line-start time by checking order and material readiness first.",
    toolkitLabel: "PRE-PRODUCTION TOOLKIT",
    toolkitSummary: "Release a checked work order to the production team.",
    toolkit: ["Work order", "BOM check", "Process plan", "Material readiness"],
  },
  "factory-management-production": {
    purpose: "Record production output and pending pieces at each factory process.",
    hook: "Find today's stuck operation before output falls behind.",
    result: "Reduce idle handoffs by seeing WIP at each process.",
    toolkitLabel: "PRODUCTION FLOOR TOOLKIT",
    toolkitSummary: "Track output and work-in-progress through the line.",
    toolkit: ["Shop-floor output", "Process-wise progress", "Rejected pieces", "WIP visibility"],
  },
  "factory-management-post-production": {
    purpose: "Scan and verify finished garments as they move into packed goods.",
    hook: "Catch missing sizes before cartons leave the unit.",
    result: "Save dispatch rechecks with a size-wise scan-and-pack record.",
    toolkitLabel: "PACKING TOOLKIT",
    toolkitSummary: "Match packed garments to the order before dispatch.",
    toolkit: ["Finished-goods scan", "Size-wise packing", "Order quantity check", "Dispatch readiness"],
  },
  "inventory-management-inward": {
    purpose: "Receive fabric and trims against their purchase and delivery papers.",
    hook: "Count incoming fabric before it enters usable stock.",
    result: "Reduce receipt disputes with a recorded checked quantity.",
    toolkitLabel: "STORE INWARD TOOLKIT",
    toolkitSummary: "Connect supplier delivery papers to accepted material.",
    toolkit: ["Purchase-order receipt", "Fabric and trim count", "Quality handoff", "Goods receipt"],
  },
  "inventory-management-stock": {
    purpose: "Check raw-material and finished-garment balances before the next move.",
    hook: "Find available fabric before raising another purchase.",
    result: "Avoid duplicate buying by checking recorded store stock.",
    toolkitLabel: "STORE STOCK TOOLKIT",
    toolkitSummary: "See what material and garments are recorded on hand.",
    toolkit: ["Raw-material stock", "Finished-goods stock", "Unit conversions", "Stock lookup"],
  },
  "inventory-management-outward": {
    purpose: "Record material issued from the store to its order or destination.",
    hook: "Know which order received each roll and trim.",
    result: "Reduce store follow-up with order-linked material movement.",
    toolkitLabel: "STORE ISSUE TOOLKIT",
    toolkitSummary: "Keep outward material movements tied to production.",
    toolkit: ["Order-linked issue", "Material quantity", "Returnable movement", "Movement reference"],
  },
  "security-management-gate-entry": {
    purpose: "Record goods movements at the factory gate before inward processing.",
    hook: "Know what entered, left, and who signed.",
    result: "Save gate-desk follow-up with one dated movement record.",
    toolkitLabel: "GATE DESK TOOLKIT",
    toolkitSummary: "Keep visitor and goods movement visible at the entrance.",
    toolkit: ["Gate entry", "Goods movement details", "Movement reports", "Entry reference"],
  },
  "security-management-gate-entry-reports": {
    purpose: "Find a goods or vehicle movement from its gate-entry record.",
    hook: "Find the gate slip when a delivery is disputed.",
    result: "Save desk-search time with a dated, searchable movement trail.",
    toolkitLabel: "GATE REPORT TOOLKIT",
    toolkitSummary: "Review gate activity by date, party, and movement.",
    toolkit: ["Movement date", "Party and vehicle", "Entry reference", "Source-paper check"],
  },
  "approvals-purchase-order-approval": {
    purpose: "Review the supplier, material, quantity, and price before commitment.",
    hook: "Stop an unchecked purchase price reaching the supplier.",
    result: "Avoid wrong-price buying by reviewing the PO before release.",
    toolkitLabel: "PURCHASE APPROVAL TOOLKIT",
    toolkitSummary: "Check the purchase against its material need before approval.",
    toolkit: ["Supplier and material", "Quantity and rate", "Tax details", "Approval decision"],
  },
};

export const HOW_IT_WORKS_MODULES = ERP_MODULES
  .filter((module) => !excludedModuleKeys.has(module.key))
  .flatMap((module) => {
  const content = moduleContent[module.key] ?? createFallbackContent(module);
  const masterGroups = getMasterGroups(module.key);
  const rootModule = { ...module, ...content, masterGroups };
  const childModules = module.children
    .filter((child) => !excludedChildModuleKeys[module.key]?.has(child.key))
    .map((child) => {
    const workflowKey = childWorkflowKeys[module.key]?.[child.key] ?? child.key;
    const workflows = content.workflows.filter((workflow) => workflow.key === workflowKey);

    return {
      ...rootModule,
      ...childContentOverrides[`${module.key}-${child.key}`],
      key: `${module.key}-${child.key}`,
      parentKey: module.key,
      label: childTabLabels[module.key]?.[child.key] ?? child.label,
      masterGroups: masterGroups.filter((group) => group.key === child.key),
      workflows: workflows.length > 0 ? workflows : content.workflows,
    };
    });

  return [rootModule, ...childModules];
});

const moduleTeasers: Record<string, ModuleCuriosityTeaser> = {
  online: {
    question: "How much cash is tied up in styles nobody has ordered yet?",
    hint: "The demand signal is often there before the next production decision.",
    factoryContext: "For Tiruppur wholesalers balancing pre-orders against ready stock.",
  },
  pos: {
    question: "Could a busy counter be quietly losing sales and stock?",
    hint: "Small gaps between what sold and what remains can add up.",
    factoryContext: "For garment shops and tailoring counters serving walk-in customers.",
  },
  "order-management": {
    question: "How much margin disappears after one missed buyer change?",
    hint: "The costly detail is often the one everyone assumes someone else saw.",
    factoryContext: "For Tiruppur export houses juggling styles, size ratios, and ship dates.",
  },
  "order-management-merchandising": {
    question: "Which buyer detail could turn into tomorrow's costly rework?",
    hint: "A small change can travel further than anyone expects.",
    factoryContext: "For merchandisers balancing multiple buyer styles and delivery promises.",
  },
  "order-management-procurement": {
    question: "Where does a little extra fabric become a big margin leak?",
    hint: "The warning can appear before the purchase reaches the supplier.",
    factoryContext: "For Tiruppur buyers sourcing fabric and trims across many orders.",
  },
  "design-development": {
    question: "What if the approved sample is not what reaches the line?",
    hint: "Tiny differences become expensive only after bulk work begins.",
    factoryContext: "For sample rooms moving a style from approval towards bulk production.",
  },
  "design-development-tech-pack": {
    question: "Which sample detail is easiest to forget under deadline pressure?",
    hint: "One quiet mismatch can follow a style all the way to finishing.",
    factoryContext: "For Tiruppur sample teams preparing export styles for bulk.",
  },
  "factory-management": {
    question: "How long can a stalled line stay invisible to the owner?",
    hint: "The delay often starts between two ordinary handoffs.",
    factoryContext: "For garment owners balancing output across busy sewing lines.",
  },
  "factory-management-pre-production": {
    question: "What is the real cost of a line waiting for one missing detail?",
    hint: "The first lost minutes rarely look like a production problem.",
    factoryContext: "For production teams preparing today's work before the line starts.",
  },
  "factory-management-production": {
    question: "Which operation is slowing today's order—and who knows?",
    hint: "A growing pile can hide a bottleneck until the shift is nearly over.",
    factoryContext: "For supervisors keeping multiple stitching operations moving.",
  },
  "factory-management-post-production": {
    question: "Could one missing size hold up an entire export carton?",
    hint: "The last check can reveal a problem before dispatch pressure peaks.",
    factoryContext: "For packing teams preparing size-wise cartons for export.",
  },
  "quality-management-system": {
    question: "How many defects travel further because nobody spots them early?",
    hint: "The cheapest moment to catch a problem is rarely the final inspection.",
    factoryContext: "For units checking incoming fabric and finished garments.",
  },
  "quality-management-system-raw-material": {
    question: "Could a fabric defect reach the cutting table unnoticed?",
    hint: "A small doubt at the store can become a large loss on the floor.",
    factoryContext: "For fabric stores receiving rolls for export orders.",
  },
  "quality-management-system-finished-goods": {
    question: "What might a buyer notice that the packing team missed?",
    hint: "A quiet second look can protect a much bigger shipment.",
    factoryContext: "For finishing teams preparing garments for final dispatch.",
  },
  "finance-management": {
    question: "Which order looks profitable only because a cost is still unseen?",
    hint: "The clearest margin picture is often hiding across separate papers.",
    factoryContext: "For export houses tracking buyer invoices and supplier commitments.",
  },
  "inventory-management": {
    question: "How much cash is sleeping in fabric nobody can find?",
    hint: "A store blind spot can trigger both rush buying and idle stock.",
    factoryContext: "For Tiruppur fabric stores balancing rolls, trims, and finished pieces.",
  },
  "inventory-management-inward": {
    question: "Did the fabric delivery match what the paperwork promised?",
    hint: "A count discrepancy is easier to settle while the lorry is still remembered.",
    factoryContext: "For stores receiving fabric and trims from local suppliers.",
  },
  "inventory-management-stock": {
    question: "Is the fabric truly short—or simply hiding in the wrong place?",
    hint: "The answer can change the next purchase decision.",
    factoryContext: "For storekeepers checking material before cutting begins.",
  },
  "inventory-management-outward": {
    question: "Where did that roll go after it left the store?",
    hint: "One unanswered movement can leave a whole order waiting.",
    factoryContext: "For units issuing fabric and trims to production teams.",
  },
  "security-management": {
    question: "What crossed the factory gate while everyone was busy?",
    hint: "The details that matter are easiest to lose during a rush.",
    factoryContext: "For gate teams receiving supplier vehicles and garment dispatches.",
  },
  "security-management-gate-entry": {
    question: "Would you know which delivery arrived before the store called?",
    hint: "The first clue starts at the gate, not the inward desk.",
    factoryContext: "For security teams receiving fabric lorries at a Tiruppur unit.",
  },
  "security-management-gate-entry-reports": {
    question: "Could you find last week's gate slip before the caller hangs up?",
    hint: "A dated trail turns a memory test into a quick answer.",
    factoryContext: "For factory offices checking a disputed supplier or vehicle visit.",
  },
  approvals: {
    question: "What if the wrong rate gets approved while everyone is rushing?",
    hint: "The most expensive errors often look like routine paperwork.",
    factoryContext: "For export-house managers reviewing a supplier commitment.",
  },
  "approvals-purchase-order-approval": {
    question: "Would anyone catch a costly PO mistake before it leaves the office?",
    hint: "A brief pause at the right moment can protect the buying margin.",
    factoryContext: "For managers approving fabric and trim purchases.",
  },
};

export function getModuleCuriosityTeaser(key: string, label: string): ModuleCuriosityTeaser {
  return moduleTeasers[key] ?? {
    question: `What is quietly costing your team time in ${label.toLowerCase()}?`,
    hint: "The first warning is often smaller than the loss that follows.",
    factoryContext: "For Indian garment businesses balancing daily work and delivery promises.",
  };
}

export function groupHowItWorksModulesByTag(
  businessTypes: readonly TaggedBusinessType[],
): TaggedHowItWorksGroup[] {
  const businessTypeOrder = [
    "design-development",
    "order-management",
    "inventory-management",
    "factory-management",
    "finance-management",
  ];
  const tags = new Map<string, Map<string, TaggedHowItWorksGroup["businessTypes"][number]>>();

  for (const businessType of businessTypes) {
    const erpModule = getErpModuleForBusinessTypeName(businessType.name);
    if (!erpModule || excludedModuleKeys.has(erpModule.key)) continue;

    const modules = HOW_IT_WORKS_MODULES.filter((item) =>
      item.key === erpModule.key || ("parentKey" in item && item.parentKey === erpModule.key),
    );
    const entry = {
      key: erpModule.key,
      label: businessType.name,
      modules,
    };
    const labels = businessType.tags;

    for (const tag of labels) {
      const groupedTypes = tags.get(tag) ?? new Map();
      groupedTypes.set(entry.key, entry);
      tags.set(tag, groupedTypes);
    }
  }

  return [...tags.entries()]
    .map(([tag, types]) => ({
      tag,
      businessTypes: [...types.values()].sort((left, right) => {
        const leftOrder = businessTypeOrder.indexOf(left.key);
        const rightOrder = businessTypeOrder.indexOf(right.key);
        const leftRank = leftOrder < 0 ? Number.MAX_SAFE_INTEGER : leftOrder;
        const rightRank = rightOrder < 0 ? Number.MAX_SAFE_INTEGER : rightOrder;

        return leftRank - rightRank || left.label.localeCompare(right.label);
      }),
    }))
    .sort((left, right) => left.tag.localeCompare(right.tag));
}
