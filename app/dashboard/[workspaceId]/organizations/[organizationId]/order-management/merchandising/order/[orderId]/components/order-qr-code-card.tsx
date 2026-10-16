"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

import Card from "@/components/ui/Card";

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
  const [qrState, setQrState] = useState<QrState>({ orderNo: "" });
  const qrDataUrl = qrState.orderNo === orderNo ? qrState.dataUrl : undefined;
  const qrError = qrState.orderNo === orderNo ? qrState.error : undefined;

  useEffect(() => {
    let isCurrent = true;
    void QRCode.toDataURL(orderNo, {
      errorCorrectionLevel: "H",
      margin: 2,
      width: 192,
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
  }, [orderNo]);

  return (
    <Card className="flex flex-wrap items-center gap-4 p-4">
      <div className="flex h-48 w-48 items-center justify-center rounded-lg border border-[var(--erp-border)] bg-[var(--erp-surface)]">
        {qrDataUrl ? (
          <Image
            src={qrDataUrl}
            alt={`QR code for order ${orderNo}`}
            width={192}
            height={192}
            unoptimized
            className="h-48 w-48"
          />
        ) : (
          <p className="px-3 text-center text-xs text-[var(--erp-text-muted)]" role={qrError ? "alert" : "status"}>
            {qrError ?? "Preparing QR code..."}
          </p>
        )}
      </div>
      <div className="min-w-40 space-y-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--erp-text-muted)]">Order No</p>
          <p className="break-words text-sm font-bold text-[var(--erp-text)]">{orderNo}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--erp-text-muted)]">Style</p>
          <p className="break-words text-sm font-medium text-[var(--erp-text)]">{styleName?.trim() || "—"}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--erp-text-muted)]">Color</p>
          <p className="break-words text-sm font-medium text-[var(--erp-text)]">{colors?.trim() || "—"}</p>
        </div>
      </div>
    </Card>
  );
}
