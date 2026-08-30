import Link from "next/link";
import { redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth-session";
import { createOrganization } from "@/lib/organizations/service";

export default async function CreateOrganizationPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; message?: string; success?: string }>;
}) {
  const user = await requireSessionUser();
  const params = (await searchParams) ?? {};
  const errorMessage =
    params.message ||
    (params.error ? "Unable to create organization. Please verify the details and try again." : "");

  async function createOrganizationAction(formData: FormData) {
    "use server";

    const organizationName = String(formData.get("organizationName") || "").trim();
    const gstNumber = String(formData.get("gstNumber") || "").trim().toUpperCase();
    const addressLine1 = String(formData.get("addressLine1") || "").trim();
    const addressLine2 = String(formData.get("addressLine2") || "").trim();
    const city = String(formData.get("city") || "").trim();
    const state = String(formData.get("state") || "").trim();
    const country = String(formData.get("country") || "").trim();
    const pinCode = String(formData.get("pinCode") || "").trim();

    try {
      await createOrganization({
        workspaceUserId: user.id,
        organizationName,
        gstNumber,
        addressLine1,
        addressLine2,
        city,
        state,
        country,
        pinCode,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create organization.";
      redirect(`/workspace/organizations/new?error=1&message=${encodeURIComponent(message)}`);
    }

    redirect(`/workspace/${user.workspace_id}?success=organization-created`);
  }

  return (
    <main >
      <div >
        <div >
          <div>
            <p >Organization</p>
            <h1 >Create Organization</h1>
          </div>
          <Link
            href={`/workspace/${user.workspace_id}`}
            
          >
            Back to Workspace
          </Link>
        </div>

        {errorMessage && (
          <div >
            {errorMessage}
          </div>
        )}

        <form action={createOrganizationAction} >
          <div >
            <label >
              <span >Organization Name</span>
              <input
                name="organizationName"
                required
                
                placeholder="Credence Craft"
              />
            </label>

            <label >
              <span >GST Number</span>
              <input
                name="gstNumber"
                required
                
                placeholder="27ABCDE1234F1Z5"
              />
            </label>

            <label >
              <span >Address Line 1</span>
              <input
                name="addressLine1"
                
                placeholder="12 Market Road"
              />
            </label>

            <label >
              <span >Address Line 2</span>
              <input
                name="addressLine2"
                
                placeholder="Floor 4, Suite 7"
              />
            </label>

            <label >
              <span >City</span>
              <input
                name="city"
                
                placeholder="Bengaluru"
              />
            </label>

            <label >
              <span >State</span>
              <input
                name="state"
                
                placeholder="Karnataka"
              />
            </label>

            <label >
              <span >Country</span>
              <input
                name="country"
                
                placeholder="India"
              />
            </label>

            <label >
              <span >PIN Code</span>
              <input
                name="pinCode"
                
                placeholder="560001"
              />
            </label>
          </div>

          <button
            type="submit"
            
          >
            Create Organization
          </button>
        </form>
      </div>
    </main>
  );
}