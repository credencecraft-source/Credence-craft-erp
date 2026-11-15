"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Table from "@/components/ui/Table";

type VendorBill = {
  id: string;
  documentNumber: string;
  vendorInvoiceNumber: string;
  billDate: string;
  status: string;
  vendorName: string;
  entityName: string;
  purchaseOrderId: string;
  subtotal: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  totalAmount: string;
  lineCount: number;
};

function currency(value: string) {
  const [whole, fraction = "00"] = value.split(".");
  const grouped = new Intl.NumberFormat("en-IN").format(BigInt(whole));
  return `₹${grouped}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}

export default function FinanceProcurementVendorBillsPage({
  workspaceId,
  organizationId,
}: {
  workspaceId: string;
  organizationId: string;
}) {
  const [bills, setBills] = useState<VendorBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyBillId, setBusyBillId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<VendorBill | null>(null);
  const api = `/api/organizations/${encodeURIComponent(organizationId)}/finance/procurement-bills`;
  const financeHome = `/dashboard/${workspaceId}/organizations/${organizationId}/finance-management`;

  const load = useCallback(async () => {
    try {
      const response = await fetch(api, { cache: "no-store" });
      const result = await response.json() as { bills?: VendorBill[]; error?: string };
      if (!response.ok || !Array.isArray(result.bills)) {
        throw new Error(result.error ?? "Unable to load procurement vendor bills.");
      }
      setBills(result.bills);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load procurement vendor bills.");
      setBills([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(api, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as { bills?: VendorBill[]; error?: string };
        if (!response.ok || !Array.isArray(result.bills)) {
          throw new Error(result.error ?? "Unable to load procurement vendor bills.");
        }
        setBills(result.bills);
        setError(null);
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Unable to load procurement vendor bills.");
        setBills([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api]);

  async function transition(bill: VendorBill, action: "SUBMIT" | "APPROVE" | "POST" | "CANCEL") {
    setBusyBillId(bill.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${api}/${encodeURIComponent(bill.id)}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to update procurement vendor bill.");
      const completedAction = action === "SUBMIT"
        ? "submitted"
        : action === "APPROVE"
          ? "approved"
          : action === "POST"
            ? "posted"
            : "cancelled";
      setNotice(`${bill.documentNumber} was ${completedAction}.`);
      setCancelTarget(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update procurement vendor bill.");
    } finally {
      setBusyBillId(null);
    }
  }

  return (
    <Page as="div">
      <Section className="space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[var(--erp-brand)]">Finance Management</p>
            <h1 className="mt-1 text-2xl font-semibold">Procurement vendor bills</h1>
            <p className="mt-2 text-sm text-[var(--erp-text-muted)]">Bills match approved Purchase Orders to accepted, posted GRN quantities.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={`${financeHome}/procurement-bills/new`}><Button>New Vendor Bill</Button></Link>
            <Link href={financeHome}><Button variant="outline">Back to Finance</Button></Link>
          </div>
        </header>

        {error && <p role="alert" className="text-sm font-medium text-[var(--erp-danger)]">{error}</p>}
        {notice && <p role="status" className="text-sm font-medium text-[var(--erp-success)]">{notice}</p>}

        <Card>
          {loading ? (
            <p role="status" className="text-sm text-[var(--erp-text-muted)]">Loading vendor bills…</p>
          ) : bills.length === 0 ? (
            <p className="text-sm text-[var(--erp-text-muted)]">No procurement vendor bills have been recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <thead>
                  <tr>
                    <th scope="col">Bill</th>
                    <th scope="col">Vendor invoice</th>
                    <th scope="col">Vendor</th>
                    <th scope="col">Entity</th>
                    <th scope="col">Date</th>
                    <th scope="col">Lines</th>
                    <th scope="col">Taxable</th>
                    <th scope="col">CGST</th>
                    <th scope="col">SGST</th>
                    <th scope="col">IGST</th>
                    <th scope="col">Total</th>
                    <th scope="col">Status / action</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((bill) => (
                    <tr key={bill.id}>
                      <td className="font-medium">{bill.documentNumber}</td>
                      <td>{bill.vendorInvoiceNumber}</td>
                      <td>{bill.vendorName}</td>
                      <td>{bill.entityName}</td>
                      <td>{bill.billDate}</td>
                      <td>{bill.lineCount}</td>
                      <td>{currency(bill.subtotal)}</td>
                      <td>{currency(bill.cgstAmount)}</td>
                      <td>{currency(bill.sgstAmount)}</td>
                      <td>{currency(bill.igstAmount)}</td>
                      <td className="font-semibold">{currency(bill.totalAmount)}</td>
                      <td>
                        <div className="flex min-w-36 flex-col items-start gap-2">
                          <Badge>{bill.status}</Badge>
                          {bill.status === "DRAFT" && (
                            <Button size="sm" variant="outline" disabled={busyBillId === bill.id} onClick={() => void transition(bill, "SUBMIT")}>Submit</Button>
                          )}
                          {bill.status === "SUBMITTED" && (
                            <Button size="sm" variant="outline" disabled={busyBillId === bill.id} onClick={() => void transition(bill, "APPROVE")}>Approve</Button>
                          )}
                          {bill.status === "APPROVED" && (
                            <Button size="sm" disabled={busyBillId === bill.id} onClick={() => void transition(bill, "POST")}>Post to Finance</Button>
                          )}
                          {["DRAFT", "SUBMITTED", "APPROVED"].includes(bill.status) && (
                            <Button size="sm" variant="destructive" disabled={busyBillId === bill.id} onClick={() => setCancelTarget(bill)}>Cancel bill</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </Card>
        <Modal
          open={Boolean(cancelTarget)}
          onClose={() => setCancelTarget(null)}
          ariaLabel="Confirm procurement vendor bill cancellation"
          size="square"
          variant="danger"
          className="space-y-4 p-6"
        >
          <h2 className="text-lg font-semibold">Cancel vendor bill?</h2>
          <p className="text-sm text-[var(--erp-text-muted)]">
            {cancelTarget?.documentNumber} will be marked cancelled and its unposted quantity reservation released. Posted financial records cannot be cancelled this way.
          </p>
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="outline" onClick={() => setCancelTarget(null)}>Keep bill</Button>
            <Button
              variant="destructive"
              disabled={Boolean(cancelTarget && busyBillId === cancelTarget.id)}
              onClick={() => cancelTarget && void transition(cancelTarget, "CANCEL")}
            >
              Confirm cancellation
            </Button>
          </div>
        </Modal>
      </Section>
    </Page>
  );
}
