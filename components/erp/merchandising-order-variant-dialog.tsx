import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import { calculateFinishedGoodsRows } from "@/lib/services/orders/order-quantity-calculations";

type VariantDraft = {
  styleName: string;
  colors: string;
};

type VariantRow = {
  size: string;
  qty: string;
};

type MerchandisingOrderVariantDialogProps = {
  open: boolean;
  variantDraft: VariantDraft;
  variantRows: VariantRow[];
  onDraftChange: (changes: Partial<VariantDraft>) => void;
  onRowsChange: (nextRows: VariantRow[]) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export default function MerchandisingOrderVariantDialog({
  open,
  variantDraft,
  variantRows,
  onDraftChange,
  onRowsChange,
  onClose,
  onConfirm,
}: MerchandisingOrderVariantDialogProps) {
  if (!open) return null;

  const calculatedOrderQty = calculateFinishedGoodsRows(
    variantRows.map((row) => ({ size: row.size, beforeExcessQty: row.qty })),
  ).orderQty;

  return (
    <Modal open={open} onClose={onClose} ariaLabel="Create order variant" variant="success" size="lg" className="max-w-3xl">
        <div className="border-b border-slate-200 bg-gradient-to-r from-emerald-50 via-white to-slate-50 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-emerald-700">Order variant</p>
              <h3 id="order-variant-title" className="mt-0.5 text-sm font-bold text-slate-900">New finished goods order</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
              aria-label="Close order variant dialog"
            >
              ×
            </button>
          </div>
        </div>

        <div className="space-y-3 p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="flex flex-col gap-1 text-[10px] font-semibold text-slate-700">
              Style name
              <input
                type="text"
                value={variantDraft.styleName}
                onChange={(event) => onDraftChange({ styleName: event.target.value })}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                placeholder="Enter style name"
              />
            </label>

            <label className="flex flex-col gap-1 text-[10px] font-semibold text-slate-700">
              Colour
              <input
                type="text"
                value={variantDraft.colors}
                onChange={(event) => onDraftChange({ colors: event.target.value })}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                placeholder="Enter colour"
              />
            </label>

            <label className="flex flex-col gap-1 text-[10px] font-semibold text-slate-700">
              Order Qty
              <input
                type="number"
                value={calculatedOrderQty || ""}
                readOnly
                disabled
                className="rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs text-slate-600"
                aria-label="Calculated order quantity"
              />
            </label>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
              <h4 className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-600">Finished goods sizes</h4>
              <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-700">{variantRows.length} rows</span>
            </div>

            <div className="max-h-[50vh] overflow-y-auto">
              {variantRows.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-slate-500">
                  No size rows available for this order.
                </p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 border-b border-slate-200 bg-white text-[10px] font-semibold text-slate-500">
                    <tr>
                      <th scope="col" className="w-1/2 px-3 py-2">Size</th>
                      <th scope="col" className="w-1/2 px-3 py-2">Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {variantRows.map((row, index) => (
                      <tr key={`${row.size}-${index}`} className="bg-white">
                        <td className="px-3 py-1.5 text-xs font-medium text-slate-700">{row.size}</td>
                        <td className="px-3 py-1.5">
                          <Input
                            type="number"
                            min="0"
                            value={row.qty}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              onRowsChange(variantRows.map((item, itemIndex) => itemIndex === index ? { ...item, qty: nextValue } : item));
                            }}
                            className="max-w-40 rounded-md border-slate-200 px-2.5 py-1.5 text-xs"
                            placeholder="0"
                            aria-label={`Quantity for size ${row.size}`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
            <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={onConfirm}>Continue</Button>
          </div>
        </div>
    </Modal>
  );
}
