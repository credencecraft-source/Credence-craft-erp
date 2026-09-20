// @/components/platform/restriction-form.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { ERP_MODULES } from "@/components/erp/erp-config-registry";

export function RestrictionForm({ 
  cancelHref,
  saveAction 
}: { 
  cancelHref: string;
  saveAction: (formData: FormData) => void | Promise<void> 
}) {
  const [selectedMasterKey, setSelectedMasterKey] = useState("");
  const [selectedMainKey, setSelectedMainKey] = useState("");
  const [selectedSubKey, setSelectedSubKey] = useState("");

  const activeMaster = ERP_MODULES.find((m) => m.key === selectedMasterKey);
  const mainModules = activeMaster?.children ?? [];

  const activeMain = mainModules.find((mm: any) => mm.key === selectedMainKey);
  const subModules = activeMain?.children ?? [];

  return (
    <form action={saveAction} className="space-y-4">
      {/* Hidden default action level */}
      <input type="hidden" name="actionLevel" value="*" />

      {/* Master Module Selection */}
      <div>
        <Select
          label="Master Module"
          name="masterModule"
          required
          value={selectedMasterKey}
          onChange={(e) => {
            setSelectedMasterKey(e.target.value);
            setSelectedMainKey("");
            setSelectedSubKey("");
          }}
          options={[{ value: "", label: "Select Master Module..." }, ...ERP_MODULES.map((mod) => ({ value: mod.key, label: mod.label }))]}
          className="rounded-lg p-2 text-xs"
        />
      </div>

      {/* Main Module Selection */}
      <div>
        <Select
          label="Main Module"
          name="mainModule"
          required
          value={selectedMainKey}
          onChange={(e) => {
            setSelectedMainKey(e.target.value);
            setSelectedSubKey("");
          }}
          disabled={!selectedMasterKey || mainModules.length === 0}
          options={[{ value: "", label: mainModules.length === 0 ? "No Main Modules (Root Only)" : "Select Main Module..." }, ...mainModules.map((main: any) => ({ value: main.key, label: main.label }))]}
          className="rounded-lg p-2 text-xs"
        />
      </div>

      {/* Sub Module Selection */}
      <div>
        <Select
          label="Sub Module"
          name="subModule"
          required
          value={selectedSubKey}
          onChange={(e) => setSelectedSubKey(e.target.value)}
          disabled={!selectedMainKey || subModules.length === 0}
          options={[{ value: "", label: subModules.length === 0 ? "No restrictable submodules" : "Select Sub Module..." }, ...subModules.map((sub: any) => ({ value: sub.key, label: sub.label }))]}
          className="rounded-lg p-2 text-xs"
        />
      </div>

      {/* Restriction Action Type */}
      <div>
        <Select
          label="Restriction Action"
          name="restrictionType"
          options={[{ value: "block", label: "Block Access (Redirect & Show Alert)" }, { value: "hide", label: "Hide Element (Remove from Sidebar)" }]}
          className="rounded-lg p-2 text-xs"
        />
      </div>

      {/* Custom Alert Message Input */}
      <Input
        label="Custom Alert Message"
        name="customMessage"
        placeholder="e.g. This feature is locked. Please upgrade your plan."
      />

      <div className="flex items-center justify-end gap-3 pt-2">
        <Link
          href={cancelHref}
          className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
        >
          Cancel
        </Link>
        <Button type="submit">Save Rule</Button>
      </div>
    </form>
  );
}