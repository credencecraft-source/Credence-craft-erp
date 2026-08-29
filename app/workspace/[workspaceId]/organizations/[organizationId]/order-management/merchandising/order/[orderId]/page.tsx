"use client";

import { useParams } from "next/navigation";

import NewOrderPage from "../new/page";

export default function EditOrderPage() {
  useParams<{ workspaceId: string; organizationId: string; orderId: string }>();

  return <NewOrderPage />;
}
