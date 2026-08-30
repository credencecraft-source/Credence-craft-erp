"use client";

import { useMemo, useState } from "react";
import type { MasterFieldDefinition } from "@/lib/master-definitions";

type MasterRecord = {
  id: string;
  value_id: string;
  label: string;
  code: string | null;
  description: string | null;
  is_active: boolean;
  metadata?: unknown;
};

type MasterRecordsTableProps = {
  records: MasterRecord[];
  moduleLabel: string;
  workspaceId: string;
  organizationId: string;
  moduleKey: string;
  createAction: (formData: FormData) => Promise<void>;
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
  fields: MasterFieldDefinition[];
  lookupOptions: Record<string, Array<{ id: string; label: string }>>;
};

export function MasterRecordsTable({
  records,
  moduleLabel,
  workspaceId,
  organizationId,
  moduleKey,
  createAction,
  updateAction,
  deleteAction,
  fields,
  lookupOptions,
}: MasterRecordsTableProps) {
  const [editingRecord, setEditingRecord] = useState<MasterRecord | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createFields, setCreateFields] = useState<Record<string, unknown>>({});
  const [editFields, setEditFields] = useState<Record<string, unknown>>({});
  const [searchTerm, setSearchTerm] = useState("");

  const visibleRecords = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return records;
    return records.filter((record) =>
      [record.label, record.code, record.description].some((value) =>
        value?.toLowerCase().includes(query)
      )
    );
  }, [records, searchTerm]);

  const openEditor = (record: MasterRecord) => {
    setEditingRecord(record);
    const metadata =
      record.metadata && typeof record.metadata === "object"
        ? (record.metadata as { fields?: Record<string, unknown> })
        : {};
    setEditFields(metadata.fields ?? {});
  };

  const closeEditor = () => {
    setEditingRecord(null);
    setEditFields({});
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setCreateFields({});
  };

  const renderField = (
    field: MasterFieldDefinition,
    values: Record<string, unknown>,
    setValues: (values: Record<string, unknown>) => void
  ) => {
    const value = values[field.key];
    if (field.type === "checkbox")
      return (
        <label key={field.key} >
          <input
            type="checkbox"
            checked={value === true}
            onChange={(event) => setValues({ ...values, [field.key]: event.target.checked })}
            name={`field_${field.key}`}
            
          />
          {field.label}
        </label>
      );
    if (field.type === "picklist")
      return (
        <label key={field.key} >
          <span >{field.label}</span>
          <select
            name={`field_${field.key}`}
            value={String(value ?? "")}
            onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
            
          >
            <option value="">Select {field.label}</option>
            {field.options?.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      );
    if (field.type === "lookup")
      return (
        <label key={field.key} >
          <span >
            {field.label}
            {field.required ? " *" : ""}
          </span>
          <select
            required={field.required}
            name={`field_${field.key}`}
            value={String(value ?? "")}
            onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
            
          >
            <option value="">Select {field.label}</option>
            {(lookupOptions[field.lookupModuleKey ?? ""] ?? []).map((option) => (
              <option key={option.id} value={option.label}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      );
    return (
      <label key={field.key} >
        <span >
          {field.label}
          {field.required ? " *" : ""}
        </span>
        <input
          required={field.required}
          type={field.type === "percentage" || field.type === "number" ? "number" : "text"}
          step={field.type === "percentage" ? "0.01" : undefined}
          name={`field_${field.key}`}
          value={String(value ?? "")}
          onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
          
        />
      </label>
    );
  };

  return (
    <div >
      {/* HEADER CONTROLS */}
      <div >
        <div >
          <div >
            <h3 >Report View</h3>
            <span >
              {visibleRecords.length} records
            </span>
          </div>

          <div >
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search records..."
              
            />
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              
            >
              + Add Record
            </button>
          </div>
        </div>
      </div>

      {/* TABLE DATA */}
      {visibleRecords.length === 0 ? (
        <div >
          No records found.
        </div>
      ) : (
        <div >
          <table >
            <thead >
              <tr>
                {fields.map((field) => (
                  <th key={field.key} >
                    {field.label}
                  </th>
                ))}
                <th >Code</th>
                <th >Description</th>
                <th >Status</th>
                <th >Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRecords.map((item, index) => {
                const metadata =
                  item.metadata && typeof item.metadata === "object"
                    ? (item.metadata as { fields?: Record<string, unknown> })
                    : {};
                return (
                  <tr
                    key={item.id}
                    className={`border-b border-slate-200 ${
                      index % 2 === 0 ? "bg-white" : "bg-slate-50/50"
                    } hover:bg-slate-100/80`}
                  >
                    {fields.map((field) => (
                      <td key={field.key} >
                        {String(metadata.fields?.[field.key] ?? (field === fields[0] ? item.label : "—"))}
                      </td>
                    ))}
                    <td >
                      {item.code || "—"}
                    </td>
                    <td >
                      {item.description || "—"}
                    </td>
                    <td >
                      <span
                        className={`inline-block rounded px-1.5 py-0.2 text-[9px] font-bold uppercase ${
                          item.is_active
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {item.is_active ? "Active" : "Pending"}
                      </span>
                    </td>
                    <td >
                      <div >
                        <button
                          type="button"
                          onClick={() => openEditor(item)}
                          
                        >
                          Edit
                        </button>
                        <form action={deleteAction} >
                          <input type="hidden" name="workspaceId" value={workspaceId} />
                          <input type="hidden" name="organizationId" value={organizationId} />
                          <input type="hidden" name="moduleKey" value={moduleKey} />
                          <input type="hidden" name="valueId" value={item.value_id} />
                          <button
                            type="submit"
                            
                          >
                            Delete
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* CREATE MODAL */}
      {showCreateModal && (
        <div >
          <div >
            <div >
              <h3 >Add New {moduleLabel}</h3>
              <button
                type="button"
                onClick={closeCreateModal}
                
              >
                ✕
              </button>
            </div>
            <form action={createAction} >
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="moduleKey" value={moduleKey} />

              <div >
                {fields.map((field) => renderField(field, createFields, setCreateFields))}
              </div>

              <div >
                <button
                  type="button"
                  onClick={closeCreateModal}
                  
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  
                >
                  Save Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editingRecord && (
        <div >
          <div >
            <div >
              <h3 >Edit: {editingRecord.label}</h3>
              <button
                type="button"
                onClick={closeEditor}
                
              >
                ✕
              </button>
            </div>
            <form action={updateAction} >
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="moduleKey" value={moduleKey} />
              <input type="hidden" name="valueId" value={editingRecord.value_id} />

              <div >
                {fields.map((field) => renderField(field, editFields, setEditFields))}
              </div>

              <div >
                <button
                  type="button"
                  onClick={closeEditor}
                  
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}