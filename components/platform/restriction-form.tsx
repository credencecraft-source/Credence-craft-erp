// @/components/platform/restriction-form.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { ERP_MODULES } from "@/components/erp/erp-config-registry";

export function RestrictionForm({ 
  planId, 
  saveAction 
}: { 
  planId: string; 
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
        <label className="block text-xs font-semibold mb-1 text-slate-700">Master Module</label>
        <select
          name="masterModule"
          required
          value={selectedMasterKey}
          onChange={(e) => {
            setSelectedMasterKey(e.target.value);
            setSelectedMainKey("");
            setSelectedSubKey("");
          }}
          className="w-full border p-2 text-xs rounded-lg bg-white"
        >
          <option value="">Select Master Module...</option>
          {ERP_MODULES.map((mod) => (
            <option key={mod.key} value={mod.key}>
              {mod.label}
            </option>
          ))}
        </select>
      </div>

      {/* Main Module Selection */}
      <div>
        <label className="block text-xs font-semibold mb-1 text-slate-700">Main Module</label>
        <select
          name="mainModule"
          required
          value={selectedMainKey}
          onChange={(e) => {
            setSelectedMainKey(e.target.value);
            setSelectedSubKey("");
          }}
          disabled={!selectedMasterKey || mainModules.length === 0}
          className="w-full border p-2 text-xs rounded-lg bg-white disabled:bg-slate-100"
        >
          <option value="">{mainModules.length === 0 ? "No Main Modules (Root Only)" : "Select Main Module..."}</option>
          {mainModules.map((main: any) => (
            <option key={main.key} value={main.key}>
              {main.label}
            </option>
          ))}
        </select>
      </div>

      {/* Sub Module Selection */}
      <div>
        <label className="block text-xs font-semibold mb-1 text-slate-700">Sub Module</label>
        <select
          name="subModule"
          required
          value={selectedSubKey}
          onChange={(e) => setSelectedSubKey(e.target.value)}
          disabled={!selectedMainKey || subModules.length === 0}
          className="w-full border p-2 text-xs rounded-lg bg-white disabled:bg-slate-100"
        >
          <option value="">{subModules.length === 0 ? "Use * (All Sub Modules)" : "Select Sub Module..."}</option>
          {subModules.map((sub: any) => (
            <option key={sub.key} value={sub.key}>
              {sub.label}
            </option>
          ))}
        </select>
      </div>

      {/* Restriction Action Type */}
      <div>
        <label className="block text-xs font-semibold mb-1 text-slate-700">Restriction Action</label>
        <select name="restrictionType" className="w-full border p-2 text-xs rounded-lg bg-white">
          <option value="block">Block Access (Redirect & Show Alert)</option>
          <option value="hide">Hide Element (Remove from Sidebar)</option>
        </select>
      </div>

      {/* Custom Alert Message Input */}
      <Input
        label="Custom Alert Message"
        name="customMessage"
        placeholder="e.g. This feature is locked. Please upgrade your plan."
      />

      <div className="flex items-center justify-end gap-3 pt-2">
        <Link
          href={`/platform/plans/${planId}/restrictions`}
          className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
        >
          Cancel
        </Link>
        <Button type="submit">Save Rule</Button>
      </div>
    </form>
  );
}