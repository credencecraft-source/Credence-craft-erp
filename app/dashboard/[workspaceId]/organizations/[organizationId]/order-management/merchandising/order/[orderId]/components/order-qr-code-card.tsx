"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { QrCode, X } from "lucide-react";

import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";

type QrState = {
  orderNo: string;
  dataUrl?: string;
  error?: string;
};

export default function OrderQrCodeCard({
  orderNo,
  styleName,
  colors,
}: {
  orderNo: string;
  styleName?: string | null;
  colors?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [qrState, setQrState] = useState<QrState>({ orderNo: "" });
  const [retryCount, setRetryCount] = useState(0);
  const qrDataUrl = qrState.orderNo === orderNo ? qrState.dataUrl : undefined;
  const qrError = qrState.orderNo === orderNo ? qrState.error : undefined;

  useEffect(() => {
    if (!open) return;
    let isCurrent = true;
    void QRCode.toDataURL(orderNo, {
      errorCorrectionLevel: "H",
      margin: 2,
      width: 256,
    })
      .then((dataUrl) => {
        if (isCurrent) setQrState({ orderNo, dataUrl });
      })
      .catch((error: unknown) => {
        console.error("Unable to generate the merchandising order QR code.", {
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
        if (isCurrent) setQrState({ orderNo, error: "QR code could not be generated." });
      });

    return () => {
      isCurrent = false;
    };
  }, [open, orderNo, retryCount]);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        aria-label={`Show QR code and details for order ${orderNo}`}
        title="Show order QR code"
        className="min-h-8 px-2"
        onClick={() => setOpen(true)}
      >
        <QrCode className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Order QR</span>
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        ariaLabelledBy="order-qr-dialog-title"
        size="rectangle"
      >
        <div className="space-y-5 p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="order-qr-dialog-title" className="text-lg font-semibold text-slate-900">
                Order QR details
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Scan the code to identify this order.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              aria-label="Close order QR details"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          <div className="grid min-w-0 gap-6 sm:grid-cols-[minmax(16rem,1fr)_minmax(0,1fr)] sm:items-center">
            <div className="flex min-h-72 min-w-0 items-center justify-center rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-4">
              {qrDataUrl ? (
                <Image
                  src={qrDataUrl}
                  alt={`QR code for order ${orderNo}`}
                  width={256}
                  height={256}
                  unoptimized
                  className="h-auto w-full max-w-64"
                />
              ) : qrError ? (
                <div className="space-y-3 text-center">
                  <p className="text-sm text-[var(--erp-danger)]" role="alert">{qrError}</p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setRetryCount((count) => count + 1)}
                  >
                    Retry
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-[var(--erp-text-muted)]" role="status">
                  Preparing QR code...
                </p>
              )}
            </div>
            <dl className="grid min-w-0 gap-4">
              <div className="min-w-0">
                <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--erp-text-muted)]">
                  Order No
                </dt>
                <dd className="mt-1 break-words text-base font-bold text-[var(--erp-text)]">{orderNo}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--erp-text-muted)]">
                  Style
                </dt>
                <dd className="mt-1 break-words text-sm font-medium text-[var(--erp-text)]">
                  {styleName?.trim() || "—"}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--erp-text-muted)]">
                  Color
                </dt>
                <dd className="mt-1 break-words text-sm font-medium text-[var(--erp-text)]">
                  {colors?.trim() || "—"}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </Modal>
    </>
  );
}
