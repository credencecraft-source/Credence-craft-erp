import { redirect } from "next/navigation";

export default function UserBasedPricingRedirect() {
  redirect("/platform/plan/dashboard/user%20pricing");
}
