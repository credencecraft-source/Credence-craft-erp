require("dotenv/config");

const { createHash } = require("node:crypto");
const { FinanceDocumentStatus, FinanceDocumentType, FinanceExternalProvider, FinanceSourceModule, FinanceSourceType, FinanceSyncStatus, Prisma, PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 500;
const ZERO = new Prisma.Decimal(0);

function money(value, label) {
  let amount;
  try {
    amount = new Prisma.Decimal(value ?? 0);
  } catch {
    throw new Error(`${label} is not a valid decimal amount.`);
  }
  if (!amount.isFinite() || amount.isNegative()) throw new Error(`${label} must be finite and non-negative.`);
  return amount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function measure(value, label) {
  let amount;
  try {
    amount = new Prisma.Decimal(value ?? 0);
  } catch {
    throw new Error(`${label} is not a valid decimal value.`);
  }
  if (!amount.isFinite() || amount.isNegative()) throw new Error(`${label} must be finite and non-negative.`);
  return amount.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
}

function snapshot(value, limit) {
  return typeof value === "string" && value.trim()
    ? value.trim().toUpperCase().slice(0, limit)
    : null;
}

function validGstinState(value) {
  if (!value) return null;
  const gstin = String(value).trim().toUpperCase();
  if (!/^\d{2}[A-Z0-9]{13}$/.test(gstin)) throw new Error("source GSTIN snapshot is invalid");
  return gstin.slice(0, 2);
}

function rate(value, label) {
  const parsed = measure(value, label);
  if (parsed.gt(100)) throw new Error(`${label} cannot exceed 100 percent`);
  return parsed;
}

function assertTaxJurisdiction(mode, entityGstin, partyGstin, lines) {
  if (mode !== "LOCAL" && mode !== "INTERSTATE") throw new Error("source tax mode is invalid");
  const entityState = validGstinState(entityGstin);
  const partyState = validGstinState(partyGstin);
  if (entityState && partyState && mode !== (entityState === partyState ? "LOCAL" : "INTERSTATE")) {
    throw new Error("source tax mode conflicts with entity and party GSTIN states");
  }
  for (const line of lines) {
    if (mode === "LOCAL" && !line.igst.eq(0)) throw new Error("LOCAL line contains IGST");
    if (mode === "INTERSTATE" && (!line.cgst.eq(0) || !line.sgst.eq(0))) {
      throw new Error("INTERSTATE line contains CGST or SGST");
    }
  }
}

function resolvePurchaseTaxMode(bill, vendor) {
  const entityState = validGstinState(bill.entity?.gstin);
  const vendorState = validGstinState(vendor?.gst_number);
  const resolved = entityState && vendorState
    ? (entityState === vendorState ? "LOCAL" : "INTERSTATE")
    : bill.tax_mode;
  if (resolved !== "LOCAL" && resolved !== "INTERSTATE") {
    throw new Error("purchase bill has no valid tax jurisdiction evidence");
  }
  if (entityState && vendorState && bill.tax_mode !== resolved) {
    throw new Error("purchase bill tax mode conflicts with entity and vendor GSTIN states");
  }
  return resolved;
}

function taxComponents(amount, mode) {
  const tax = money(amount, "Line tax");
  if (mode === "LOCAL") {
    const cgst = tax.div(2).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    return { cgst, sgst: tax.minus(cgst), igst: ZERO };
  }
  return { cgst: ZERO, sgst: ZERO, igst: tax };
}

function sourceDefinitions(organizationId) {
  const orgFilter = organizationId ? { organization_id: organizationId } : {};
  return [
    {
      sourceType: FinanceSourceType.POS_SALES_INVOICE,
      model: "posSalesInvoice",
      where: { ...orgFilter, status: "POSTED" },
      orderBy: [{ organization_id: "asc" }, { id: "asc" }],
      include: {
        entity: { select: { id: true, entity_name: true, gstin: true } },
        customer_contact: {
          select: {
            id: true,
            tax_registrations: {
              orderBy: { created_at: "asc" },
              take: 1,
              select: { gstin: true },
            },
          },
        },
        lines: { orderBy: { id: "asc" } },
      },
    },
    {
      sourceType: FinanceSourceType.POS_PURCHASE_BILL,
      model: "posPurchaseBill",
      where: { ...orgFilter, status: "POSTED" },
      orderBy: [{ organization_id: "asc" }, { id: "asc" }],
      include: {
        entity: { select: { id: true, entity_name: true, gstin: true } },
        lines: { orderBy: { id: "asc" } },
      },
    },
    {
      sourceType: FinanceSourceType.POS_SALES_RETURN,
      model: "posSalesReturn",
      where: { ...orgFilter, status: "POSTED" },
      orderBy: [{ organization_id: "asc" }, { id: "asc" }],
      include: {
        invoice: {
          select: {
            id: true,
            invoice_no: true,
            customer: true,
            customer_contact_id: true,
            entity_id: true,
            entity_name_snapshot: true,
            tax_mode: true,
            entity: { select: { entity_name: true, gstin: true } },
            customer_contact: {
              select: {
                id: true,
                tax_registrations: {
                  orderBy: { created_at: "asc" },
                  take: 1,
                  select: { gstin: true },
                },
              },
            },
          },
        },
        lines: {
          orderBy: { id: "asc" },
          include: {
            invoiceLine: {
              select: {
                article_no: true,
                style_name: true,
                size: true,
                unit_rate: true,
                gst_rate: true,
                hsn_code: true,
              },
            },
          },
        },
      },
    },
  ];
}

function mapSalesInvoice(source) {
  if (!source.lines.length) throw new Error("sales invoice has no lines");
  assertTaxJurisdiction(
    source.tax_mode,
    source.entity?.gstin,
    source.customer_contact?.tax_registrations[0]?.gstin,
    source.lines.map((line) => ({
      cgst: money(line.cgst_amount, "Sales CGST"),
      sgst: money(line.sgst_amount, "Sales SGST"),
      igst: money(line.igst_amount, "Sales IGST"),
    })),
  );
  return {
    documentType: FinanceDocumentType.SALES_INVOICE,
    documentNumber: source.invoice_no,
    documentDate: source.invoice_date,
    sourceDocumentNumber: source.invoice_no,
    subSource: source.shipping_address ? "ONLINE_STORE_CHECKOUT" : "POS_BARCODE_COUNTER",
    entityId: source.entity_id,
    entityName: source.entity_name_snapshot ?? source.entity?.entity_name,
    entityGstin: source.entity?.gstin,
    partyId: source.customer_contact_id,
    partyName: source.customer ?? "WALK-IN CUSTOMER",
    partyGstin: source.customer_contact?.tax_registrations[0]?.gstin,
    placeOfSupplyStateCode: validGstinState(source.customer_contact?.tax_registrations[0]?.gstin)
      ?? (source.tax_mode === "LOCAL" ? validGstinState(source.entity?.gstin) : null),
    createdBy: source.created_by,
    createdAt: source.created_at,
    postedAt: source.posted_at,
    subtotal: money(source.subtotal, "Sales subtotal"),
    taxableAmount: money(source.subtotal, "Sales taxable amount"),
    cgstAmount: money(source.cgst_amount, "Sales CGST"),
    sgstAmount: money(source.sgst_amount, "Sales SGST"),
    igstAmount: money(source.igst_amount, "Sales IGST"),
    totalAmount: money(source.total_amount, "Sales total"),
    lines: source.lines.map((line) => ({
      sourceLineId: line.id,
      itemCode: line.article_no,
      description: line.size ? `${line.style_name} - ${line.size}` : line.style_name,
      quantity: measure(line.quantity, "Sales line quantity"),
      unitOfMeasure: "PCS",
      unitRate: measure(line.unit_rate, "Sales line rate"),
      discountAmount: money(new Prisma.Decimal(line.quantity).mul(line.unit_rate).minus(line.taxable_amount), "Sales line discount"),
      taxableAmount: money(line.taxable_amount, "Sales line taxable amount"),
      hsnCode: line.hsn_code,
      gstRate: rate(line.gst_rate, "Sales GST rate"),
      cgstAmount: money(line.cgst_amount, "Sales line CGST"),
      sgstAmount: money(line.sgst_amount, "Sales line SGST"),
      igstAmount: money(line.igst_amount, "Sales line IGST"),
      totalAmount: money(line.total_amount, "Sales line total"),
    })),
  };
}

function mapPurchaseBill(source, vendor) {
  if (!source.lines.length) throw new Error("purchase bill has no lines");
  const mode = resolvePurchaseTaxMode(source, vendor);
  const lines = source.lines.map((line) => {
    const tax = money(line.tax_amount, "Purchase line tax");
    const splits = taxComponents(tax, mode);
    const total = money(line.total, "Purchase line total");
    const taxable = total.minus(tax);
    if (taxable.isNegative()) throw new Error("purchase line tax exceeds its total");
    return {
      sourceLineId: line.id,
      itemCode: line.item_name,
      description: line.size ? `${line.item_name ?? "ITEM"} - ${line.size}` : line.item_name ?? "ITEM",
      quantity: measure(line.quantity, "Purchase line quantity"),
      unitOfMeasure: "PCS",
      unitRate: measure(line.purchase_price ?? 0, "Purchase line rate"),
      discountAmount: ZERO,
      taxableAmount: money(taxable, "Purchase line taxable amount"),
      hsnCode: line.hsn_code,
      gstRate: rate(line.gst_rate ?? 0, "Purchase GST rate"),
      cgstAmount: splits.cgst,
      sgstAmount: splits.sgst,
      igstAmount: splits.igst,
      totalAmount: total,
    };
  });
  const cgst = lines.reduce((sum, line) => sum.plus(line.cgstAmount), ZERO);
  const sgst = lines.reduce((sum, line) => sum.plus(line.sgstAmount), ZERO);
  const igst = lines.reduce((sum, line) => sum.plus(line.igstAmount), ZERO);
  const subtotal = money(source.subtotal, "Purchase subtotal");
  const sourceTax = money(source.tax, "Purchase tax");
  const total = money(source.total, "Purchase total");
  if (!cgst.plus(sgst).plus(igst).eq(sourceTax) || !subtotal.plus(sourceTax).eq(total)) {
    throw new Error("purchase bill header does not reconcile to source line taxes and totals");
  }
  return {
    documentType: FinanceDocumentType.PURCHASE_BILL,
    documentNumber: source.document_number,
    documentDate: source.bill_date,
    sourceDocumentNumber: source.document_number,
    subSource: "DIRECT_STOCK_PURCHASE",
    entityId: source.entity_id,
    entityName: source.entity_name_snapshot ?? source.entity?.entity_name,
    entityGstin: source.entity?.gstin,
    partyId: source.vendor_id,
    partyName: vendor?.vendor ?? "UNKNOWN VENDOR",
    partyGstin: vendor?.gst_number,
    placeOfSupplyStateCode: validGstinState(source.entity?.gstin)
      ?? validGstinState(vendor?.gst_number),
    createdBy: source.created_by,
    createdAt: source.created_at,
    postedAt: source.posted_at,
    subtotal,
    taxableAmount: subtotal,
    cgstAmount: cgst,
    sgstAmount: sgst,
    igstAmount: igst,
    totalAmount: total,
    lines,
  };
}

function mapSalesReturn(source) {
  const invoice = source.invoice;
  if (!source.lines.length) throw new Error("sales return has no lines");
  assertTaxJurisdiction(
    invoice.tax_mode,
    invoice.entity?.gstin,
    invoice.customer_contact?.tax_registrations[0]?.gstin,
    source.lines.map((line) => ({
      cgst: money(line.cgst_amount, "Return CGST"),
      sgst: money(line.sgst_amount, "Return SGST"),
      igst: money(line.igst_amount, "Return IGST"),
    })),
  );
  const lines = source.lines.map((line) => {
    const original = line.invoiceLine;
    const quantity = measure(line.quantity, "Return line quantity");
    const unitRate = measure(original.unit_rate, "Return line rate");
    return {
      sourceLineId: line.id,
      itemCode: original.article_no,
      description: original.size ? `${original.style_name} - ${original.size}` : original.style_name,
      quantity,
      unitOfMeasure: "PCS",
      unitRate,
      discountAmount: money(quantity.mul(unitRate).minus(line.taxable_amount), "Return line discount"),
      taxableAmount: money(line.taxable_amount, "Return taxable amount"),
      hsnCode: original.hsn_code,
      gstRate: rate(original.gst_rate, "Return GST rate"),
      cgstAmount: money(line.cgst_amount, "Return CGST"),
      sgstAmount: money(line.sgst_amount, "Return SGST"),
      igstAmount: money(line.igst_amount, "Return IGST"),
      totalAmount: money(line.total_amount, "Return line total"),
    };
  });
  const cgst = money(source.cgst_amount, "Return CGST");
  const sgst = money(source.sgst_amount, "Return SGST");
  const igst = money(source.igst_amount, "Return IGST");
  return {
    documentType: FinanceDocumentType.CREDIT_NOTE,
    documentNumber: source.return_no,
    documentDate: source.return_date,
    sourceDocumentNumber: source.return_no,
    subSource: "POS_SALES_RETURN",
    entityId: invoice.entity_id,
    entityName: source.entity_name_snapshot ?? invoice.entity_name_snapshot ?? invoice.entity?.entity_name,
    entityGstin: invoice.entity?.gstin,
    partyId: invoice.customer_contact_id,
    partyName: invoice.customer ?? "CUSTOMER",
    partyGstin: invoice.customer_contact?.tax_registrations[0]?.gstin,
    placeOfSupplyStateCode: validGstinState(invoice.customer_contact?.tax_registrations[0]?.gstin)
      ?? (invoice.tax_mode === "LOCAL" ? validGstinState(invoice.entity?.gstin) : null),
    createdBy: source.created_by,
    createdAt: source.created_at,
    postedAt: source.posted_at,
    subtotal: money(source.subtotal, "Return subtotal"),
    taxableAmount: money(source.subtotal, "Return taxable amount"),
    cgstAmount: cgst,
    sgstAmount: sgst,
    igstAmount: igst,
    totalAmount: money(source.total_credit_amount, "Return total"),
    lines,
  };
}

function buildRecord(definition, source, vendor) {
  if (definition.sourceType === FinanceSourceType.POS_SALES_INVOICE) return mapSalesInvoice(source);
  if (definition.sourceType === FinanceSourceType.POS_PURCHASE_BILL) return mapPurchaseBill(source, vendor);
  return mapSalesReturn(source);
}

function assertReconciled(record) {
  const sum = record.lines.reduce((totals, line) => ({
    taxable: totals.taxable.plus(line.taxableAmount),
    cgst: totals.cgst.plus(line.cgstAmount),
    sgst: totals.sgst.plus(line.sgstAmount),
    igst: totals.igst.plus(line.igstAmount),
    total: totals.total.plus(line.totalAmount),
  }), { taxable: ZERO, cgst: ZERO, sgst: ZERO, igst: ZERO, total: ZERO });
  const headerTax = record.cgstAmount.plus(record.sgstAmount).plus(record.igstAmount);
  if (
    !sum.taxable.eq(record.taxableAmount)
    || !sum.cgst.eq(record.cgstAmount)
    || !sum.sgst.eq(record.sgstAmount)
    || !sum.igst.eq(record.igstAmount)
    || !sum.total.eq(record.totalAmount)
    || !record.taxableAmount.plus(headerTax).eq(record.totalAmount)
  ) throw new Error("source header does not reconcile to its persisted lines");
}

function organizationKey(organizationId) {
  return createHash("sha256").update(organizationId).digest("hex").slice(0, 12);
}

async function getMembershipActor(tx, organizationId, createdBy) {
  if (!createdBy) return { userId: null, email: null };
  const value = String(createdBy).trim();
  const membership = await tx.organizationMembership.findFirst({
    where: { organization_id: organizationId, workspace_user_id: value, is_active: true },
    select: { workspace_user_id: true },
  });
  return {
    userId: membership?.workspace_user_id ?? null,
    email: value.includes("@") ? snapshot(value, 255) : null,
  };
}

async function persistRecord(definition, source, record) {
  assertReconciled(record);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.centralFinanceTransaction.findUnique({
      where: {
        organization_id_source_type_source_id: {
          organization_id: source.organization_id,
          source_type: definition.sourceType,
          source_id: source.id,
        },
      },
      select: { id: true, total_amount: true, source_document_number: true, status: true },
    });
    if (existing) {
      if (
        !existing.total_amount.eq(record.totalAmount)
        || existing.source_document_number !== record.sourceDocumentNumber
        || existing.status !== FinanceDocumentStatus.POSTED
      ) throw new Error("existing central source record conflicts with legacy source");
      return "already-present";
    }

    const duplicateNumber = await tx.centralFinanceTransaction.findFirst({
      where: {
        organization_id: source.organization_id,
        document_number: record.documentNumber,
      },
      select: { id: true },
    });
    if (duplicateNumber) throw new Error("document number is already assigned to a different central record");

    const actor = await getMembershipActor(tx, source.organization_id, record.createdBy);
    const transaction = await tx.centralFinanceTransaction.create({
      data: {
        organization_id: source.organization_id,
        document_type: record.documentType,
        document_number: record.documentNumber,
        document_date: record.documentDate,
        status: FinanceDocumentStatus.POSTED,
        source_module: FinanceSourceModule.POS,
        source_type: definition.sourceType,
        sub_source: record.subSource,
        source_id: source.id,
        source_document_number: record.sourceDocumentNumber,
        entity_id: record.entityId ?? null,
        entity_name_snapshot: snapshot(record.entityName, 255),
        entity_gstin: snapshot(record.entityGstin, 15),
        party_id: record.partyId ?? null,
        party_name: snapshot(record.partyName, 255) ?? "UNKNOWN PARTY",
        party_gstin: snapshot(record.partyGstin, 15),
        place_of_supply_state_code: record.placeOfSupplyStateCode ?? null,
        subtotal: record.subtotal,
        taxable_amount: record.taxableAmount,
        cgst_amount: record.cgstAmount,
        sgst_amount: record.sgstAmount,
        igst_amount: record.igstAmount,
        other_tax_amount: ZERO,
        total_tax_amount: record.cgstAmount.plus(record.sgstAmount).plus(record.igstAmount),
        total_amount: record.totalAmount,
        created_by_user_id: actor.userId,
        created_by_email: actor.email,
        created_at: record.createdAt,
        posted_at: record.postedAt ?? record.createdAt,
        sync_status: FinanceSyncStatus.PENDING,
        external_provider: FinanceExternalProvider.NONE,
      },
      select: { id: true },
    });
    await tx.centralFinanceTransactionLine.createMany({
      data: record.lines.map((line, index) => {
        const totalTax = line.cgstAmount.plus(line.sgstAmount).plus(line.igstAmount);
        return {
          organization_id: source.organization_id,
          transaction_id: transaction.id,
          source_line_id: line.sourceLineId ?? null,
          line_number: index + 1,
          item_code: snapshot(line.itemCode, 100),
          description: snapshot(line.description, 500) ?? "ITEM",
          quantity: line.quantity,
          unit_of_measure: snapshot(line.unitOfMeasure, 30),
          unit_rate: line.unitRate,
          discount_amount: line.discountAmount,
          taxable_amount: line.taxableAmount,
          hsn_code: snapshot(line.hsnCode, 100),
          gst_rate: line.gstRate,
          cgst_amount: line.cgstAmount,
          sgst_amount: line.sgstAmount,
          igst_amount: line.igstAmount,
          other_tax_amount: ZERO,
          total_tax_amount: totalTax,
          total_amount: line.totalAmount,
        };
      }),
    });
    await tx.financeSyncOutboxLog.create({
      data: {
        organization_id: source.organization_id,
        transaction_id: transaction.id,
        provider: FinanceExternalProvider.NONE,
        status: FinanceSyncStatus.PENDING,
        event_type: "TRANSACTION_POSTED",
        payload: {
          transactionId: transaction.id,
          sourceModule: FinanceSourceModule.POS,
          sourceType: definition.sourceType,
          sourceId: source.id,
          sourceDocumentNumber: record.sourceDocumentNumber,
          backfill: true,
        },
      },
    });
    await tx.auditEvent.create({
      data: {
        organization_id: source.organization_id,
        user_id: actor.userId,
        module: "FINANCE_MANAGEMENT",
        action: "BACKFILL_CENTRAL_FINANCE",
        entity_type: "central_finance_transaction",
        entity_id: transaction.id,
        details: {
          actor: "SYSTEM_BACKFILL",
          fromStatus: null,
          toStatus: FinanceDocumentStatus.POSTED,
          sourceType: definition.sourceType,
          sourceId: source.id,
          sourceDocumentNumber: record.sourceDocumentNumber,
        },
      },
    });
    return "created";
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function optionsFromArgs() {
  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  const confirmNonProduction = args.includes("--confirm-non-production");
  const allOrganizationsConfirmed = args.includes("--all-organizations-confirmed");
  const organizationIndex = args.indexOf("--organization-id");
  const organizationId = organizationIndex >= 0 ? args[organizationIndex + 1] : null;
  const batchIndex = args.indexOf("--batch-size");
  const batchSize = batchIndex >= 0 ? Number(args[batchIndex + 1]) : DEFAULT_BATCH_SIZE;
  if (organizationIndex >= 0 && !organizationId) throw new Error("--organization-id requires a value.");
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
    throw new Error(`--batch-size must be between 1 and ${MAX_BATCH_SIZE}.`);
  }
  if (args.some((arg) => !["--execute", "--confirm-non-production", "--all-organizations-confirmed", "--organization-id", "--batch-size"].includes(arg)
    && arg !== organizationId && arg !== String(batchSize))) {
    throw new Error("Unsupported backfill argument.");
  }
  if (execute && (!confirmNonProduction || process.env.NODE_ENV === "production")) {
    throw new Error("Execution requires --confirm-non-production and refuses NODE_ENV=production.");
  }
  if (execute && !organizationId && !allOrganizationsConfirmed) {
    throw new Error("All-organization execution requires --all-organizations-confirmed.");
  }
  return { execute, organizationId, batchSize };
}

async function sourceRows(definition, options) {
  let cursor;
  do {
    const rows = await prisma[definition.model].findMany({
      where: definition.where,
      orderBy: definition.orderBy,
      take: options.batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: definition.include,
    });
    if (!rows.length) break;
    const vendors = new Map();
    if (definition.sourceType === FinanceSourceType.POS_PURCHASE_BILL) {
      const byOrganization = new Map();
      for (const row of rows) {
        const ids = byOrganization.get(row.organization_id) ?? [];
        ids.push(row.vendor_id);
        byOrganization.set(row.organization_id, ids);
      }
      for (const [orgId, vendorIds] of byOrganization) {
        const records = await prisma.masterVendor.findMany({
          where: { organization_id: orgId, id: { in: [...new Set(vendorIds)] } },
          select: { id: true, organization_id: true, vendor: true, gst_number: true },
        });
        for (const vendor of records) vendors.set(`${vendor.organization_id}:${vendor.id}`, vendor);
      }
    }
    for (const source of rows) {
      let record;
      try {
        const vendor = vendors.get(`${source.organization_id}:${source.vendor_id}`);
        if (definition.sourceType === FinanceSourceType.POS_PURCHASE_BILL && !vendor) {
          throw new Error("vendor master is missing from the source organization");
        }
        record = buildRecord(definition, source, vendor);
        assertReconciled(record);
        if (options.execute) {
          const result = await persistRecord(definition, source, record);
          summary[definition.sourceType][result] += 1;
        } else {
          const existing = await prisma.centralFinanceTransaction.findUnique({
            where: {
              organization_id_source_type_source_id: {
                organization_id: source.organization_id,
                source_type: definition.sourceType,
                source_id: source.id,
              },
            },
            select: { total_amount: true, source_document_number: true, status: true },
          });
          if (existing) {
            if (
              !existing.total_amount.eq(record.totalAmount)
              || existing.source_document_number !== record.sourceDocumentNumber
              || existing.status !== FinanceDocumentStatus.POSTED
            ) throw new Error("existing central source record conflicts with legacy source");
            summary[definition.sourceType]["already-present"] += 1;
          } else {
            const duplicateNumber = await prisma.centralFinanceTransaction.findFirst({
              where: {
                organization_id: source.organization_id,
                document_number: record.documentNumber,
              },
              select: { id: true },
            });
            if (duplicateNumber) throw new Error("document number is already assigned to a different central record");
            summary[definition.sourceType].eligible += 1;
          }
        }
      } catch (error) {
        const reason = error instanceof Error
          ? error.message.split("\n").filter(Boolean).slice(-1)[0].slice(0, 200)
          : "unknown error";
        summary[definition.sourceType].skipped += 1;
        summary[definition.sourceType].skipReasons[reason] = (summary[definition.sourceType].skipReasons[reason] ?? 0) + 1;
      }
    }
    cursor = rows[rows.length - 1].id;
  } while (true);
}

async function totalsByOrganization(options) {
  const output = new Map();
  const sources = [
    ["posSalesInvoice", "total_amount"],
    ["posPurchaseBill", "total"],
    ["posSalesReturn", "total_credit_amount"],
  ];
  for (const [model, amountField] of sources) {
    const grouped = await prisma[model].groupBy({
      by: ["organization_id"],
      where: {
        status: "POSTED",
        ...(options.organizationId ? { organization_id: options.organizationId } : {}),
      },
      _count: { _all: true },
      _sum: { [amountField]: true },
    });
    for (const row of grouped) {
      const current = output.get(row.organization_id) ?? { count: 0, total: ZERO };
      current.count += row._count._all;
      current.total = current.total.plus(row._sum[amountField] ?? ZERO);
      output.set(row.organization_id, current);
    }
  }
  return output;
}

async function centralTotalsByOrganization(options) {
  const grouped = await prisma.centralFinanceTransaction.groupBy({
    by: ["organization_id"],
    where: {
      source_type: { in: [
        FinanceSourceType.POS_SALES_INVOICE,
        FinanceSourceType.POS_PURCHASE_BILL,
        FinanceSourceType.POS_SALES_RETURN,
      ] },
      ...(options.organizationId ? { organization_id: options.organizationId } : {}),
    },
    _count: { _all: true },
    _sum: { total_amount: true },
  });
  return new Map(grouped.map((row) => [row.organization_id, {
    count: row._count._all,
    total: row._sum.total_amount ?? ZERO,
  }]));
}

function printReconciliation(sourceTotals, targetTotals) {
  const ids = [...new Set([...sourceTotals.keys(), ...targetTotals.keys()])].sort();
  let matched = true;
  for (const id of ids) {
    const source = sourceTotals.get(id) ?? { count: 0, total: ZERO };
    const target = targetTotals.get(id) ?? { count: 0, total: ZERO };
    const rowMatches = source.count === target.count && source.total.eq(target.total);
    if (!rowMatches) matched = false;
    console.log(JSON.stringify({
      organizationKey: organizationKey(id),
      sourceCount: source.count,
      centralCount: target.count,
      sourceTotal: source.total.toFixed(2),
      centralTotal: target.total.toFixed(2),
      reconciled: rowMatches,
    }));
  }
  return matched;
}

const summary = Object.fromEntries([
  FinanceSourceType.POS_SALES_INVOICE,
  FinanceSourceType.POS_PURCHASE_BILL,
  FinanceSourceType.POS_SALES_RETURN,
].map((type) => [type, { eligible: 0, created: 0, "already-present": 0, skipped: 0, skipReasons: {} }]));

async function main() {
  const options = optionsFromArgs();
  const database = await prisma.$queryRaw`SELECT current_schema() AS schema_name`;
  console.log(JSON.stringify({
    mode: options.execute ? "execute" : "dry-run",
    target: { verifiedByOperator: options.execute, databaseIdentity: "redacted", schema: database[0]?.schema_name },
    organizationScope: options.organizationId ?? "ALL_ORGANIZATIONS",
    batchSize: options.batchSize,
  }));
  if (!options.execute) {
    const sourceTotals = await totalsByOrganization(options);
    const targetTotals = await centralTotalsByOrganization(options);
    printReconciliation(sourceTotals, targetTotals);
  }
  for (const definition of sourceDefinitions(options.organizationId)) {
    await sourceRows(definition, options);
  }
  console.log(JSON.stringify({ records: summary }, null, 2));
  if (options.execute) {
    const sourceTotals = await totalsByOrganization(options);
    const targetTotals = await centralTotalsByOrganization(options);
    const reconciled = printReconciliation(sourceTotals, targetTotals);
    if (!reconciled || Object.values(summary).some((item) => item.skipped > 0)) {
      process.exitCode = 1;
    }
    const verification = await prisma.$queryRaw`
      WITH source_rows AS (
        SELECT organization_id, 'POS_SALES_INVOICE'::text AS source_type, total_amount
        FROM pos_sales_invoices
        WHERE status = 'POSTED'
          AND (${options.organizationId ?? null}::text IS NULL OR organization_id = ${options.organizationId ?? null})
        UNION ALL
        SELECT organization_id, 'POS_PURCHASE_BILL'::text, total
        FROM pos_purchase_bills
        WHERE status = 'POSTED'
          AND (${options.organizationId ?? null}::text IS NULL OR organization_id = ${options.organizationId ?? null})
        UNION ALL
        SELECT organization_id, 'POS_SALES_RETURN'::text, total_credit_amount
        FROM pos_sales_returns
        WHERE status = 'POSTED'
          AND (${options.organizationId ?? null}::text IS NULL OR organization_id = ${options.organizationId ?? null})
      ),
      source_totals AS (
        SELECT organization_id, source_type, COUNT(*)::int AS source_count,
          SUM(total_amount)::numeric(18,2) AS source_total
        FROM source_rows GROUP BY organization_id, source_type
      ),
      central_totals AS (
        SELECT organization_id, source_type::text AS source_type, COUNT(*)::int AS central_count,
          SUM(total_amount)::numeric(18,2) AS central_total
        FROM central_finance_transactions
        WHERE source_type::text IN ('POS_SALES_INVOICE', 'POS_PURCHASE_BILL', 'POS_SALES_RETURN')
          AND (${options.organizationId ?? null}::text IS NULL OR organization_id = ${options.organizationId ?? null})
        GROUP BY organization_id, source_type
      )
      SELECT COALESCE(source_totals.organization_id, central_totals.organization_id) AS organization_id,
        COALESCE(source_totals.source_type, central_totals.source_type) AS source_type,
        COALESCE(source_count, 0)::int AS source_count,
        COALESCE(central_count, 0)::int AS central_count,
        COALESCE(source_total, 0)::numeric(18,2) AS source_total,
        COALESCE(central_total, 0)::numeric(18,2) AS central_total
      FROM source_totals
      FULL OUTER JOIN central_totals
        ON source_totals.organization_id = central_totals.organization_id
        AND source_totals.source_type = central_totals.source_type
      ORDER BY organization_id, source_type
    `;
    console.log(JSON.stringify({ readOnlyVerification: verification.map((row) => ({
      organizationKey: organizationKey(row.organization_id),
      sourceType: row.source_type,
      sourceCount: row.source_count,
      centralCount: row.central_count,
      sourceTotal: row.source_total.toString(),
      centralTotal: row.central_total.toString(),
      reconciled: row.source_count === row.central_count && new Prisma.Decimal(row.source_total).eq(row.central_total),
    })) }));
  }
}

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Central Finance backfill failed", message.replace(/(?:postgres(?:ql)?|mysql):\/\/\S+/gi, "[REDACTED_URL]"));
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
