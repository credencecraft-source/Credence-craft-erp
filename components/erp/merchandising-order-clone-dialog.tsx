import Button from "@/components/ui/Button";

type CloneDraft = {
  article: string;
  styleName: string;
  colors: string;
  orderQty: string;
};

type CloneRow = {
  size: string;
  qty: string;
};

type MerchandisingOrderCloneDialogProps = {
  open: boolean;
  cloneDraft: CloneDraft;
  cloneRows: CloneRow[];
  onDraftChange: (changes: Partial<CloneDraft>) => void;
  onRowsChange: (nextRows: CloneRow[]) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export default function MerchandisingOrderCloneDialog({
  open,
  cloneDraft,
  cloneRows,
  onDraftChange,
  onRowsChange,
  onClose,
  onConfirm,
}: MerchandisingOrderCloneDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-2.5" role="dialog" aria-modal="true" aria-labelledby="clone-order-title">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.14)]">
        <div className="border-b border-slate-200 bg-gradient-to-r from-emerald-50 via-white to-slate-50 px-3 py-2.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-emerald-700">Clone order</p>
              <h3 id="clone-order-title" className="mt-0.5 text-base font-bold text-slate-900">New finished goods order</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
              aria-label="Close clone dialog"
            >
              ×
            </button>
          </div>
        </div>

        <div className="space-y-3 p-3">
          <div className="grid gap-2 md:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-[11px] font-semibold text-slate-700">
              Article name
              <input
                type="text"
                value={cloneDraft.article}
                onChange={(event) => onDraftChange({ article: event.target.value })}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                placeholder="Enter article"
              />
            </label>

            <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-700">
              Style name
              <input
                type="text"
                value={cloneDraft.styleName}
                onChange={(event) => onDraftChange({ styleName: event.target.value })}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                placeholder="Enter style name"
              />
            </label>

            <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-700 md:col-span-2">
              Color
              <input
                type="text"
                value={cloneDraft.colors}
                onChange={(event) => onDraftChange({ colors: event.target.value })}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                placeholder="Enter color"
              />
            </label>

            <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-700 md:col-span-2">
              Order Qty
              <input
                type="number"
                min="0"
                value={cloneDraft.orderQty}
                onChange={(event) => onDraftChange({ orderQty: event.target.value })}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                placeholder="Enter order qty"
              />
            </label>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-600">Finished goods size rows</h4>
              <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-700">{cloneRows.length} rows</span>
            </div>

            <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
              {cloneRows.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-4 text-center text-xs text-slate-500">
                  No size rows available for this order.
                </p>
              ) : (
                cloneRows.map((row, index) => (
                  <div key={`${row.size}-${index}`} className="grid grid-cols-[72px_72px] gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
                    <label className="flex flex-col gap-1 text-[10px] font-semibold text-slate-700">
                      Size
                      <input
                        type="text"
                        value={row.size}
                        readOnly
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700"
                      />
                    </label>

                    <label className="flex flex-col gap-1 text-[10px] font-semibold text-slate-700">
                      Qty
                      <input
                        type="number"
                        min="0"
                        value={row.qty}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          onRowsChange(cloneRows.map((item, itemIndex) => itemIndex === index ? { ...item, qty: nextValue } : item));
                        }}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                        placeholder="0"
                      />
                    </label>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
            <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={onConfirm}>Continue</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
