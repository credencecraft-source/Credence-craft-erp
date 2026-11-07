"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Select from "@/components/ui/Select";
import Section from "@/components/ui/Section";

type CouponType = "GENERAL" | "PURCHASE_REWARD";
type DiscountType = "FLAT_AMOUNT" | "PERCENTAGE";

export default function PosCouponCreatePage({
  workspaceId,
  organizationId,
}: {
  workspaceId: string;
  organizationId: string;
}) {
  const router = useRouter();
  const reportPath = `/dashboard/${workspaceId}/organizations/${organizationId}/pos/cupencode`;
  const [couponType, setCouponType] = useState<CouponType>("GENERAL");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");
  const [discountType, setDiscountType] = useState<DiscountType>("FLAT_AMOUNT");
  const [couponCode, setCouponCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [discountValue, setDiscountValue] = useState("");
  const [minimumPurchase, setMinimumPurchase] = useState("0");
  const [startsAt, setStartsAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [endsAt, setEndsAt] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [validityDays, setValidityDays] = useState("30");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/pos/coupons`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            couponCode: couponType === "GENERAL" ? couponCode : null,
            name,
            description: description || null,
            couponType,
            status,
            discountType,
            discountValue,
            minimumPurchase,
            startsAt,
            endsAt: endsAt || null,
            maxRedemptions: maxRedemptions ? Number(maxRedemptions) : null,
            validityDays: couponType === "PURCHASE_REWARD" ? Number(validityDays) : null,
          }),
        },
      );
      const data = await response.json() as { coupon?: { id?: string }; error?: string };
      if (!response.ok || !data.coupon?.id) {
        throw new Error(data.error || "Unable to create the coupon.");
      }
      router.push(`${reportPath}?created=1`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to create the coupon.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page as="div">
      <Section className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--erp-text)]">Add Coupon</h1>
          <p className="mt-2 text-sm text-[var(--erp-text-muted)]">
            Create a redeemable code or a customer reward issued after a qualifying sale.
          </p>
        </div>
        {error ? <p role="alert" className="text-sm text-[var(--erp-danger)]">{error}</p> : null}
        <form onSubmit={submit}>
          <Card className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-[var(--erp-text)]">
                Coupon type
                <Select
                  value={couponType}
                  onChange={(event) => setCouponType(event.target.value as CouponType)}
                  className="mt-1"
                >
                  <option value="GENERAL">General coupon code</option>
                  <option value="PURCHASE_REWARD">Automatic purchase reward</option>
                </Select>
              </label>
              <label className="text-sm font-medium text-[var(--erp-text)]">
                Status
                <Select value={status} onChange={(event) => setStatus(event.target.value as "ACTIVE" | "INACTIVE")} className="mt-1">
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </Select>
              </label>
              {couponType === "GENERAL" ? (
                <label className="text-sm font-medium text-[var(--erp-text)]">
                  Coupon code
                  <Input
                    value={couponCode}
                    onChange={(event) => setCouponCode(event.target.value)}
                    textCase="preserve"
                    className="mt-1"
                    placeholder="E.g. SAVE10"
                    maxLength={60}
                    required
                  />
                </label>
              ) : null}
              <label className="text-sm font-medium text-[var(--erp-text)]">
                {couponType === "GENERAL" ? "Coupon name" : "Reward campaign name"}
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-1"
                  maxLength={150}
                  required
                />
              </label>
              <label className="text-sm font-medium text-[var(--erp-text)]">
                Discount type
                <Select value={discountType} onChange={(event) => setDiscountType(event.target.value as DiscountType)} className="mt-1">
                  <option value="FLAT_AMOUNT">Flat amount</option>
                  <option value="PERCENTAGE">Percentage</option>
                </Select>
              </label>
              <label className="text-sm font-medium text-[var(--erp-text)]">
                Discount {discountType === "PERCENTAGE" ? "(%)" : "(currency)"}
                <Input
                  type="number"
                  min="0.01"
                  max={discountType === "PERCENTAGE" ? "100" : undefined}
                  step="0.01"
                  value={discountValue}
                  onChange={(event) => setDiscountValue(event.target.value)}
                  className="mt-1"
                  required
                />
              </label>
              <label className="text-sm font-medium text-[var(--erp-text)]">
                {couponType === "GENERAL" ? "Minimum sale to redeem" : "Minimum sale to issue reward"}
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={minimumPurchase}
                  onChange={(event) => setMinimumPurchase(event.target.value)}
                  className="mt-1"
                  required
                />
              </label>
              {couponType === "PURCHASE_REWARD" ? (
                <label className="text-sm font-medium text-[var(--erp-text)]">
                  Reward validity (days)
                  <Input
                    type="number"
                    min="1"
                    max="3650"
                    step="1"
                    value={validityDays}
                    onChange={(event) => setValidityDays(event.target.value)}
                    className="mt-1"
                    required
                  />
                </label>
              ) : null}
              <label className="text-sm font-medium text-[var(--erp-text)]">
                Starts on
                <Input type="date" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="mt-1" required />
              </label>
              <label className="text-sm font-medium text-[var(--erp-text)]">
                Ends on (optional)
                <Input type="date" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className="mt-1" />
              </label>
              <label className="text-sm font-medium text-[var(--erp-text)]">
                Maximum redemptions (optional)
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={maxRedemptions}
                  onChange={(event) => setMaxRedemptions(event.target.value)}
                  className="mt-1"
                />
              </label>
            </div>
            <label className="block text-sm font-medium text-[var(--erp-text)]">
              Description (optional)
              <Input value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1" maxLength={500} />
            </label>
            {couponType === "PURCHASE_REWARD" ? (
              <p className="text-sm text-[var(--erp-text-muted)]">
                Eligible customers must be selected on the sale. The generated code is tied to that customer and can be redeemed once before expiry.
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => router.push(reportPath)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Create Coupon"}</Button>
            </div>
          </Card>
        </form>
      </Section>
    </Page>
  );
}
