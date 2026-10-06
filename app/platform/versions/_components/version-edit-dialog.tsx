"use client";

import { useState } from "react";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import type { PlatformVersionType } from "@prisma/client";
import { PLATFORM_VERSION_TYPE_OPTIONS } from "@/lib/constants/platform-version-types";

export default function VersionEditDialog({
  versionName,
  versionType,
  description,
  action,
}: {
  versionName: string;
  versionType: PlatformVersionType;
  description: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        Edit version
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        ariaLabel="Edit version"
        size="md"
      >
        <div className="space-y-5 p-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Edit version</h2>
            <p className="mt-1 text-sm text-slate-500">
              Change the version name, type, and description.
            </p>
          </div>
          <form action={action} className="space-y-4">
            <Input
              label="Version name"
              name="versionName"
              required
              maxLength={100}
              defaultValue={versionName}
            />
            <Select
              label="Version type"
              name="versionType"
              required
              defaultValue={versionType}
              options={PLATFORM_VERSION_TYPE_OPTIONS}
            />
            <Input
              label="Description"
              name="description"
              maxLength={500}
              defaultValue={description}
              placeholder="Optional version description"
            />
            <div className="flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Save changes</Button>
            </div>
          </form>
        </div>
      </Modal>
    </>
  );
}
