"use client";

import React, { useEffect, useMemo, useState } from "react";

type ProcessTemplate = {
  id: string;
  value_id?: string;
  label: string;
  steps?: Array<{
    id: string;
    slNo: number;
    processName: string;
    operationTemplateName?: string | null;
    operationTemplateId?: string | null;
    operationTemplates?: OperationTemplate[];
    operations?: Operation[];
  }>;
};

type OperationTemplate = {
  id: string;
  valueId?: string;
  label: string;
  operations?: Operation[];
};

type Operation = {
  id: string;
  sourceOperationId?: string;
  valueId?: string;
  slNo: number;
  operation: string;
  price: number | string;
};

type ProcessRow = {
  id?: string;
  processId?: string;
  processName?: string;
  operation?: string;
  slNo?: number;
  operationTemplateId?: string | null;
  operationTemplateName?: string | null;
  operationTemplates?: OperationTemplate[];
  operations?: Operation[];
};

export default function ProcessTab({ form, setForm, organizationId, isOrderLoading = false }: { form: any; setForm: any; organizationId?: string; isOrderLoading?: boolean }) {
  const [templates, setTemplates] = useState<ProcessTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [templateError, setTemplateError] = useState("");
  const [activeProcessTab, setActiveProcessTab] = useState("");
  const selectedTemplateId = String(form?.processTemplateId ?? "");

  useEffect(() => {
    if (!organizationId) return;
    let active = true;
    void fetch(`/api/organizations/${encodeURIComponent(organizationId)}/master-data/process-template?includeInactive=false&limit=200`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Unable to load process templates.");
        return Array.isArray(data) ? data : [];
      })
      .then((data: ProcessTemplate[]) => { if (active) setTemplates(data); })
      .catch((error) => { if (active) setTemplateError(error instanceof Error ? error.message : "Unable to load process templates."); })
      .finally(() => { if (active) setIsLoadingTemplates(false); });
    return () => { active = false; };
  }, [organizationId]);

  const selectedTemplate = useMemo(() => templates.find((template) => template.id === selectedTemplateId || template.value_id === selectedTemplateId), [selectedTemplateId, templates]);
  const formProcessRows = form?.processRows;
  const processRows = useMemo(() => (Array.isArray(formProcessRows) ? formProcessRows : []) as ProcessRow[], [formProcessRows]);
  const processTabs = useMemo(() => {
    const seen = new Set<string>();
    return processRows.flatMap((row, index) => {
      const key = String(row.processId ?? row.id ?? `${row.processName ?? "process"}-${index}`);
      const label = String(row.processName ?? row.operation ?? "Process").trim() || "Process";
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ key, label, processName: label, slNo: row.slNo ?? index + 1 }];
    });
  }, [processRows]);
  const activeProcessKey = processTabs.some((tab) => tab.key === activeProcessTab)
    ? activeProcessTab
    : processTabs[0]?.key ?? "";
  const activeProcess = processTabs.find((tab) => tab.key === activeProcessKey);
  const activeProcessRow = processRows.find((row, index) => {
    const key = String(row.processId ?? row.id ?? `${row.processName ?? "process"}-${index}`);
    return key === activeProcessKey;
  });
  const selectedTemplateStep = selectedTemplate?.steps?.find((step) =>
    step.processName === activeProcess?.processName && Number(step.slNo) === Number(activeProcess?.slNo),
  );
  const operationTemplateOptions = selectedTemplateStep?.operationTemplates ?? activeProcessRow?.operationTemplates ?? [];
  const activeOperationTemplateName = activeProcessRow?.operationTemplateName || selectedTemplateStep?.operationTemplateName || "";
  const selectedOperationTemplateId = String(
    activeProcessRow?.operationTemplateId
      ?? selectedTemplateStep?.operationTemplateId
      ?? operationTemplateOptions.find((option) => option.label === activeOperationTemplateName)?.id
      ?? "",
  );
  const activeOperations = activeProcessRow?.operations ?? selectedTemplateStep?.operations ?? [];

  const updateOperationTemplate = (operationTemplateId: string) => {
    const operationTemplate = operationTemplateOptions.find((option) => option.id === operationTemplateId || option.valueId === operationTemplateId);
    setForm((current: any) => ({
      ...current,
      processRows: (Array.isArray(current.processRows) ? current.processRows : []).map((row: ProcessRow, index: number) => {
        const key = String(row.processId ?? row.id ?? `${row.processName ?? "process"}-${index}`);
        if (key !== activeProcessKey) return row;
        return {
          ...row,
          operationTemplateId: operationTemplate?.id ?? "",
          operationTemplateName: operationTemplate?.label ?? "",
          operationTemplates: operationTemplateOptions,
          operations: operationTemplate?.operations ?? [],
        };
      }),
    }));
  };

  const updateOperationPrice = (operationId: string, price: string) => {
    setForm((current: any) => ({
      ...current,
      processRows: (Array.isArray(current.processRows) ? current.processRows : []).map((row: ProcessRow, index: number) => {
        const key = String(row.processId ?? row.id ?? `${row.processName ?? "process"}-${index}`);
        if (key !== activeProcessKey) return row;
        return {
          ...row,
          operations: (row.operations ?? activeOperations).map((operation) =>
            operation.id === operationId ? { ...operation, price } : operation,
          ),
        };
      }),
    }));
  };

  const applyTemplate = (templateId: string) => {
    const template = templates.find((item) => item.id === templateId || item.value_id === templateId);
    setActiveProcessTab("");
    setForm((current: any) => ({
      ...current,
      processTemplateId: template?.id ?? "",
      processRows: (template?.steps ?? []).map((step) => ({
        id: step.id,
        processId: step.id,
        processName: step.processName,
        operation: step.processName,
        slNo: step.slNo,
        operationTemplateId: step.operationTemplateId,
        operationTemplateName: step.operationTemplateName,
        operationTemplates: step.operationTemplates ?? [],
        operations: step.operations ?? [],
      })),
    }));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <label className="flex-1 space-y-1 text-xs font-bold text-slate-700">
            <span>Process Template</span>
            <select value={selectedTemplateId} onChange={(event) => applyTemplate(event.target.value)} disabled={isLoadingTemplates || isOrderLoading} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800 focus:border-emerald-500 focus:outline-none">
              <option value="">Select an approved process template</option>
              {templates.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}
            </select>
          </label>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{selectedTemplate ? `${processRows.length} process step${processRows.length === 1 ? "" : "s"} applied` : "No process template applied"}</div>
        </div>
        {templateError && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{templateError}</p>}
        {!isLoadingTemplates && templates.length === 0 && !templateError && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Create and approve a Process Template in Master Data before saving this order.</p>}
      </div>

      {processTabs.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-4 pt-3">
            <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Process sections">
              {processTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={activeProcessKey === tab.key}
                  onClick={() => setActiveProcessTab(tab.key)}
                  className={`whitespace-nowrap rounded-t-lg border border-b-0 px-4 py-2 text-xs font-bold transition-colors ${activeProcessKey === tab.key ? "border-emerald-200 bg-white text-emerald-700" : "border-transparent text-slate-500 hover:bg-white hover:text-slate-800"}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          {activeProcess && (
            <div className="space-y-3 p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-800">{activeProcess.label}</p>
                  <p className="text-xs text-slate-500">Operation template</p>
                </div>
                <label className="flex min-w-64 flex-col gap-1 text-xs font-semibold text-slate-700">
                  <span>Operation Template</span>
                  <select
                    value={selectedOperationTemplateId}
                    onChange={(event) => updateOperationTemplate(event.target.value)}
                    disabled={isOrderLoading || operationTemplateOptions.length === 0}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-normal text-slate-800 focus:border-emerald-500 focus:outline-none disabled:bg-slate-100"
                  >
                    <option value="">{operationTemplateOptions.length > 0 ? "Select operation template" : "No operation template"}</option>
                    {operationTemplateOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </select>
                  {!selectedOperationTemplateId && activeOperationTemplateName && <span className="text-[10px] font-normal text-slate-500">Current: {activeOperationTemplateName}</span>}
                </label>
              </div>

              {activeOperations.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                    <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-bold">Sl No</th>
                        <th className="px-3 py-2 font-bold">Operation</th>
                        <th className="px-3 py-2 text-right font-bold">Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                      {activeOperations.map((operation) => (
                        <tr key={operation.id}>
                          <td className="px-3 py-2 font-semibold">{operation.slNo}</td>
                          <td className="px-3 py-2">{operation.operation}</td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={String(operation.price ?? "")}
                              onChange={(event) => updateOperationPrice(operation.id, event.target.value)}
                              disabled={isOrderLoading}
                              className="w-28 rounded-md border border-slate-300 px-2 py-1 text-right text-xs font-medium text-slate-800 focus:border-emerald-500 focus:outline-none disabled:bg-slate-100"
                              aria-label={`${operation.operation} price`}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  No operations are configured for this process section.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
