import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export type DevUser = {
  id: string;
  workspace_id: string;
  profile_name: string;
  full_name: string;
  email: string;
  email_verified: boolean;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
};

export type DevOrganization = {
  id: string;
  organization_id: string;
  workspace_user_id: string;
  organization_name: string;
  gst_number: string;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  pin_code: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

export type DevERPSoftware = {
  id: string;
  software_id: string;
  organization_id: string;
  software_name: string;
  status: string;
  created_at: Date;
  updated_at: Date;
};

export type DevERPModule = {
  id: string;
  module_id: string;
  software_id: string;
  module_key: string;
  module_name: string;
  status: string;
  settings: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

export type DevERPModuleData = {
  id: string;
  record_id: string;
  module_id: string;
  record_key: string;
  payload: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

export type DevMasterModule = {
  id: string;
  module_id: string;
  organization_id: string;
  module_key: string;
  module_name: string;
  description: string | null;
  status: string;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
};

export type DevMasterModuleValue = {
  id: string;
  value_id: string;
  organization_id: string;
  module_key: string;
  label: string;
  code: string | null;
  description: string | null;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
  parent_id: string | null;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
};

export type DevApprovalRequest = {
  id: string;
  request_id: string;
  organization_id: string;
  module_key: string;
  module_name: string;
  entity_type: string;
  entity_key: string;
  entity_label: string;
  entity_ref_id: string | null;
  requested_by: string | null;
  status: "pending" | "approved" | "rejected";
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  reviewed_by: string | null;
  reviewed_at: Date | null;
};

const DEV_USERS_FILE = path.join(process.cwd(), ".dev-users.json");
const DEV_ORGANIZATIONS_FILE = path.join(process.cwd(), ".dev-organizations.json");
const DEV_ERP_FILE = path.join(process.cwd(), ".dev-erp.json");
const DEV_MASTERS_FILE = path.join(process.cwd(), ".dev-masters.json");
const DEV_APPROVALS_FILE = path.join(process.cwd(), ".dev-approvals.json");

function normalizeKey(value: string) {
  return value.toLowerCase().trim();
}

function hydrateUser(rawUser: Partial<DevUser> | undefined): DevUser | null {
  if (!rawUser || !rawUser.id || !rawUser.email) {
    return null;
  }

  return {
    id: String(rawUser.id),
    workspace_id: String(rawUser.workspace_id ?? ""),
    profile_name: String(rawUser.profile_name ?? ""),
    full_name: String(rawUser.full_name ?? ""),
    email: String(rawUser.email),
    email_verified: Boolean(rawUser.email_verified),
    created_at: rawUser.created_at ? new Date(rawUser.created_at) : new Date(),
    updated_at: rawUser.updated_at ? new Date(rawUser.updated_at) : new Date(),
    last_login_at: rawUser.last_login_at ? new Date(rawUser.last_login_at) : null,
  };
}

function readDevUsers() {
  try {
    if (!existsSync(DEV_USERS_FILE)) {
      writeFileSync(DEV_USERS_FILE, JSON.stringify({}, null, 2));
      return {} as Record<string, DevUser>;
    }

    const raw = readFileSync(DEV_USERS_FILE, "utf8");
    const parsed = raw ? JSON.parse(raw) : {};

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {} as Record<string, DevUser>;
    }

    return Object.fromEntries(
      Object.entries(parsed).flatMap(([key, value]) => {
        const hydrated = hydrateUser(value as Partial<DevUser>);
        return hydrated ? [[key, hydrated]] : [];
      })
    );
  } catch {
    return {} as Record<string, DevUser>;
  }
}

function writeDevUsers(store: Record<string, DevUser>) {
  mkdirSync(path.dirname(DEV_USERS_FILE), { recursive: true });
  const serialized = Object.fromEntries(
    Object.entries(store).map(([key, value]) => [
      key,
      {
        ...value,
        created_at: value.created_at.toISOString(),
        updated_at: value.updated_at.toISOString(),
        last_login_at: value.last_login_at ? value.last_login_at.toISOString() : null,
      },
    ])
  );

  writeFileSync(DEV_USERS_FILE, JSON.stringify(serialized, null, 2));
}

export function hasDevUser(email: string) {
  return Boolean(getDevUser(email));
}

export function getDevUser(email: string) {
  const store = readDevUsers();
  return store[normalizeKey(email)] ?? null;
}

export function getDevUserById(userId: string) {
  const store = readDevUsers();
  return Object.values(store).find((user) => user.id === userId) ?? null;
}

export function setDevUser(user: DevUser) {
  const store = readDevUsers();
  const key = normalizeKey(user.email);
  store[key] = user;
  writeDevUsers(store);
  return user;
}

export function hasDevProfileName(profileName: string) {
  const key = profileName.trim().toLowerCase();
  const store = readDevUsers();

  return Object.values(store).some(
    (user) => user.profile_name.toLowerCase() === key
  );
}

function readDevOrganizations() {
  try {
    if (!existsSync(DEV_ORGANIZATIONS_FILE)) {
      writeFileSync(DEV_ORGANIZATIONS_FILE, JSON.stringify([], null, 2));
      return [] as DevOrganization[];
    }

    const raw = readFileSync(DEV_ORGANIZATIONS_FILE, "utf8");
    const parsed = raw ? JSON.parse(raw) : [];

    if (!Array.isArray(parsed)) {
      return [] as DevOrganization[];
    }

    return parsed.map((item) => ({
      ...item,
      id: String(item.id),
      organization_id: String(item.organization_id),
      workspace_user_id: String(item.workspace_user_id),
      organization_name: String(item.organization_name),
      gst_number: String(item.gst_number),
      address_line_1: item.address_line_1 ?? null,
      address_line_2: item.address_line_2 ?? null,
      city: item.city ?? null,
      state: item.state ?? null,
      country: item.country ?? null,
      pin_code: item.pin_code ?? null,
      is_active: Boolean(item.is_active),
      created_at: item.created_at ? new Date(item.created_at) : new Date(),
      updated_at: item.updated_at ? new Date(item.updated_at) : new Date(),
    } satisfies DevOrganization));
  } catch {
    return [] as DevOrganization[];
  }
}

function writeDevOrganizations(store: DevOrganization[]) {
  mkdirSync(path.dirname(DEV_ORGANIZATIONS_FILE), { recursive: true });

  writeFileSync(
    DEV_ORGANIZATIONS_FILE,
    JSON.stringify(
      store.map((organization) => ({
        ...organization,
        created_at: organization.created_at.toISOString(),
        updated_at: organization.updated_at.toISOString(),
      })),
      null,
      2
    )
  );
}

export function getDevOrganizationsForUser(workspaceUserId: string) {
  return readDevOrganizations().filter(
    (organization) => organization.workspace_user_id === workspaceUserId && organization.is_active
  );
}

export function hasDevGstNumber(gstNumber: string) {
  return readDevOrganizations().some(
    (organization) => organization.gst_number.toUpperCase() === gstNumber.toUpperCase()
  );
}

export function createDevOrganization(input: Omit<DevOrganization, "id" | "created_at" | "updated_at"> & { id?: string; created_at?: Date; updated_at?: Date }) {
  const organizations = readDevOrganizations();
  const createdAt = input.created_at ?? new Date();
  const updatedAt = input.updated_at ?? new Date();
  const organization: DevOrganization = {
    id: input.id ?? `dev-org-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    organization_id: input.organization_id,
    workspace_user_id: input.workspace_user_id,
    organization_name: input.organization_name,
    gst_number: input.gst_number,
    address_line_1: input.address_line_1 ?? null,
    address_line_2: input.address_line_2 ?? null,
    city: input.city ?? null,
    state: input.state ?? null,
    country: input.country ?? null,
    pin_code: input.pin_code ?? null,
    is_active: input.is_active,
    created_at: createdAt,
    updated_at: updatedAt,
  };

  organizations.push(organization);
  writeDevOrganizations(organizations);

  return organization;
}

function readDevERPData() {
  try {
    if (!existsSync(DEV_ERP_FILE)) {
      writeFileSync(DEV_ERP_FILE, JSON.stringify({ software: [], modules: [], moduleData: [] }, null, 2));
      return { software: [] as DevERPSoftware[], modules: [] as DevERPModule[], moduleData: [] as DevERPModuleData[] };
    }

    const raw = readFileSync(DEV_ERP_FILE, "utf8");
    const parsed = raw ? JSON.parse(raw) : { software: [], modules: [], moduleData: [] };

    if (!parsed || typeof parsed !== "object") {
      return { software: [] as DevERPSoftware[], modules: [] as DevERPModule[], moduleData: [] as DevERPModuleData[] };
    }

    const softwareEntries: Array<Record<string, unknown>> = Array.isArray(parsed.software) ? parsed.software as Array<Record<string, unknown>> : [];
    const moduleEntries: Array<Record<string, unknown>> = Array.isArray(parsed.modules) ? parsed.modules as Array<Record<string, unknown>> : [];
    const moduleDataEntries: Array<Record<string, unknown>> = Array.isArray(parsed.moduleData) ? parsed.moduleData as Array<Record<string, unknown>> : [];

    return {
      software: softwareEntries.map((item) => ({
        ...item,
        id: String(item.id ?? ""),
        software_id: String(item.software_id ?? ""),
        organization_id: String(item.organization_id ?? ""),
        software_name: String(item.software_name ?? "ERP Software"),
        status: String(item.status ?? "active"),
        created_at: item.created_at ? new Date(item.created_at as string | Date) : new Date(),
        updated_at: item.updated_at ? new Date(item.updated_at as string | Date) : new Date(),
      } satisfies DevERPSoftware)),
      modules: moduleEntries.map((item) => ({
        ...item,
        id: String(item.id ?? ""),
        module_id: String(item.module_id ?? ""),
        software_id: String(item.software_id ?? ""),
        module_key: String(item.module_key ?? ""),
        module_name: String(item.module_name ?? ""),
        status: String(item.status ?? "enabled"),
        settings: (item.settings as Record<string, unknown> | null) ?? null,
        created_at: item.created_at ? new Date(item.created_at as string | Date) : new Date(),
        updated_at: item.updated_at ? new Date(item.updated_at as string | Date) : new Date(),
      } satisfies DevERPModule)),
      moduleData: moduleDataEntries.map((item) => ({
        ...item,
        id: String(item.id ?? ""),
        record_id: String(item.record_id ?? ""),
        module_id: String(item.module_id ?? ""),
        record_key: String(item.record_key ?? ""),
        payload: (item.payload as Record<string, unknown> | null) ?? null,
        created_at: item.created_at ? new Date(item.created_at as string | Date) : new Date(),
        updated_at: item.updated_at ? new Date(item.updated_at as string | Date) : new Date(),
      } satisfies DevERPModuleData)),
    };
  } catch {
    return { software: [] as DevERPSoftware[], modules: [] as DevERPModule[], moduleData: [] as DevERPModuleData[] };
  }
}

function writeDevERPData(data: { software: DevERPSoftware[]; modules: DevERPModule[]; moduleData: DevERPModuleData[] }) {
  mkdirSync(path.dirname(DEV_ERP_FILE), { recursive: true });
  writeFileSync(DEV_ERP_FILE, JSON.stringify({
    software: data.software.map((item) => ({ ...item, created_at: item.created_at.toISOString(), updated_at: item.updated_at.toISOString() })),
    modules: data.modules.map((item) => ({ ...item, created_at: item.created_at.toISOString(), updated_at: item.updated_at.toISOString() })),
    moduleData: data.moduleData.map((item) => ({ ...item, created_at: item.created_at.toISOString(), updated_at: item.updated_at.toISOString() })),
  }, null, 2));
}

export function getDevERPSoftwareForOrganization(organizationId: string) {
  const { software } = readDevERPData();
  return software.filter((entry: DevERPSoftware) => entry.organization_id === organizationId);
}

export function getDevModulesForSoftware(softwareId: string) {
  const { modules } = readDevERPData();
  return modules.filter((entry: DevERPModule) => entry.software_id === softwareId);
}

export function createDevERPSoftwareForOrganization(organizationId: string) {
  const state = readDevERPData();

  const existingSoftware = state.software.find((item: DevERPSoftware) => item.organization_id === organizationId);
  if (existingSoftware) {
    return {
      software: existingSoftware,
      modules: state.modules.filter((item: DevERPModule) => item.software_id === existingSoftware.software_id),
    };
  }

  const software: DevERPSoftware = {
    id: `dev-software-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    software_id: `soft-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    organization_id: organizationId,
    software_name: "ERP Software",
    status: "active",
    created_at: new Date(),
    updated_at: new Date(),
  };

  const defaultModules: Array<{
    software_id: string;
    module_key: string;
    module_name: string;
    status: string;
    settings: Record<string, unknown> | null;
  }> = [
    { software_id: software.software_id, module_key: "sales", module_name: "Sales", status: "enabled", settings: { group: "core" } },
    { software_id: software.software_id, module_key: "inventory", module_name: "Inventory", status: "enabled", settings: { group: "core" } },
    { software_id: software.software_id, module_key: "finance", module_name: "Finance", status: "enabled", settings: { group: "core" } },
    { software_id: software.software_id, module_key: "hr", module_name: "Human Resources", status: "enabled", settings: { group: "core" } },
  ];

  const modules: DevERPModule[] = defaultModules.map((module) => ({
    id: `dev-module-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    module_id: `mod-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    software_id: module.software_id,
    module_key: module.module_key,
    module_name: module.module_name,
    status: module.status,
    settings: module.settings ?? null,
    created_at: new Date(),
    updated_at: new Date(),
  }));

  const nextState: { software: DevERPSoftware[]; modules: DevERPModule[]; moduleData: DevERPModuleData[] } = {
    software: [...state.software, software],
    modules: [...state.modules, ...modules],
    moduleData: state.moduleData,
  };

  writeDevERPData(nextState);

  return { software, modules };
}

export function deleteDevOrganizationCascade(organizationId: string) {
  const state = readDevERPData();
  const softwareIds = state.software.filter((entry) => entry.organization_id === organizationId).map((entry) => entry.software_id);
  const moduleIds = state.modules.filter((entry) => softwareIds.includes(entry.software_id)).map((entry) => entry.module_id);

  const nextState: { software: DevERPSoftware[]; modules: DevERPModule[]; moduleData: DevERPModuleData[] } = {
    software: state.software.filter((entry: DevERPSoftware) => entry.organization_id !== organizationId),
    modules: state.modules.filter((entry: DevERPModule) => !softwareIds.includes(entry.software_id)),
    moduleData: state.moduleData.filter((entry: DevERPModuleData) => !moduleIds.includes(entry.module_id)),
  };

  writeDevERPData(nextState);

  const organizations = readDevOrganizations().filter((entry) => entry.organization_id !== organizationId);
  writeDevOrganizations(organizations);

  const masterState = readDevMasterData();
  writeDevMasterData({
    modules: masterState.modules.filter((entry) => entry.organization_id !== organizationId),
    values: masterState.values.filter((entry) => entry.organization_id !== organizationId),
  });

  return true;
}

function readDevMasterData() {
  try {
    if (!existsSync(DEV_MASTERS_FILE)) {
      writeFileSync(DEV_MASTERS_FILE, JSON.stringify({ modules: [], values: [] }, null, 2));
      return { modules: [] as DevMasterModule[], values: [] as DevMasterModuleValue[] };
    }

    const raw = readFileSync(DEV_MASTERS_FILE, "utf8");
    const parsed = raw ? JSON.parse(raw) : { modules: [], values: [] };

    if (!parsed || typeof parsed !== "object") {
      return { modules: [] as DevMasterModule[], values: [] as DevMasterModuleValue[] };
    }

    const moduleEntries: Array<Record<string, unknown>> = Array.isArray(parsed.modules) ? parsed.modules as Array<Record<string, unknown>> : [];
    const valueEntries: Array<Record<string, unknown>> = Array.isArray(parsed.values) ? parsed.values as Array<Record<string, unknown>> : [];

    return {
      modules: moduleEntries.map((item) => ({
        ...item,
        id: String(item.id ?? ""),
        module_id: String(item.module_id ?? ""),
        organization_id: String(item.organization_id ?? ""),
        module_key: String(item.module_key ?? ""),
        module_name: String(item.module_name ?? ""),
        description: typeof item.description === "string" ? item.description : null,
        status: String(item.status ?? "active"),
        sort_order: Number(item.sort_order ?? 0),
        created_at: item.created_at ? new Date(item.created_at as string | Date) : new Date(),
        updated_at: item.updated_at ? new Date(item.updated_at as string | Date) : new Date(),
      } satisfies DevMasterModule)),
      values: valueEntries.map((item) => ({
        ...item,
        id: String(item.id ?? ""),
        value_id: String(item.value_id ?? ""),
        organization_id: String(item.organization_id ?? ""),
        module_key: String(item.module_key ?? ""),
        label: String(item.label ?? ""),
        code: typeof item.code === "string" ? item.code : null,
        description: typeof item.description === "string" ? item.description : null,
        is_active: Boolean(item.is_active ?? true),
        metadata: (item.metadata as Record<string, unknown> | null) ?? null,
        parent_id: typeof item.parent_id === "string" ? item.parent_id : null,
        sort_order: Number(item.sort_order ?? 0),
        created_at: item.created_at ? new Date(item.created_at as string | Date) : new Date(),
        updated_at: item.updated_at ? new Date(item.updated_at as string | Date) : new Date(),
      } satisfies DevMasterModuleValue)),
    };
  } catch {
    return { modules: [] as DevMasterModule[], values: [] as DevMasterModuleValue[] };
  }
}

function writeDevMasterData(data: { modules: DevMasterModule[]; values: DevMasterModuleValue[] }) {
  mkdirSync(path.dirname(DEV_MASTERS_FILE), { recursive: true });
  writeFileSync(DEV_MASTERS_FILE, JSON.stringify({
    modules: data.modules.map((item) => ({ ...item, created_at: item.created_at.toISOString(), updated_at: item.updated_at.toISOString() })),
    values: data.values.map((item) => ({ ...item, created_at: item.created_at.toISOString(), updated_at: item.updated_at.toISOString() })),
  }, null, 2));
}

export function ensureDevMasterModule(organizationId: string, moduleKey: string, moduleName: string, description?: string) {
  const state = readDevMasterData();
  const existing = state.modules.find((entry) => entry.organization_id === organizationId && entry.module_key === moduleKey);

  if (existing) {
    return existing;
  }

  const created: DevMasterModule = {
    id: `dev-master-module-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    module_id: `master-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    organization_id: organizationId,
    module_key: moduleKey,
    module_name: moduleName,
    description: description ?? null,
    status: "active",
    sort_order: state.modules.filter((entry) => entry.organization_id === organizationId).length,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const nextState = {
    modules: [...state.modules, created],
    values: state.values,
  };

  writeDevMasterData(nextState);
  return created;
}

export function listDevMasterValues(organizationId: string, moduleKey: string, includeInactive: boolean = false) {
  const state = readDevMasterData();
  return state.values
    .filter((entry) => entry.organization_id === organizationId && entry.module_key === moduleKey && (includeInactive || entry.is_active))
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
}

export function updateDevMasterValueStatus(organizationId: string, valueId: string, isActive: boolean) {
  const state = readDevMasterData();
  const values = state.values.map((entry) => (
    entry.organization_id === organizationId && (entry.id === valueId || entry.value_id === valueId)
      ? { ...entry, is_active: isActive, updated_at: new Date() }
      : entry
  ));

  writeDevMasterData({ modules: state.modules, values });
  return values.find((entry) => entry.organization_id === organizationId && (entry.id === valueId || entry.value_id === valueId)) ?? null;
}

export function updateDevMasterValue(organizationId: string, valueId: string, input: {
  label?: string;
  code?: string | null;
  description?: string | null;
  is_active?: boolean;
}) {
  const state = readDevMasterData();
  const values = state.values.map((entry) => (
    entry.organization_id === organizationId && (entry.id === valueId || entry.value_id === valueId)
      ? {
          ...entry,
          label: input.label?.trim() ? input.label.trim() : entry.label,
          code: input.code !== undefined ? input.code?.trim() ?? null : entry.code,
          description: input.description !== undefined ? input.description?.trim() ?? null : entry.description,
          is_active: input.is_active ?? entry.is_active,
          updated_at: new Date(),
        }
      : entry
  ));

  writeDevMasterData({ modules: state.modules, values });
  return values.find((entry) => entry.organization_id === organizationId && (entry.id === valueId || entry.value_id === valueId)) ?? null;
}

export function deleteDevMasterValue(organizationId: string, valueId: string) {
  const state = readDevMasterData();
  const nextValues = state.values.filter(
    (entry) => !(entry.organization_id === organizationId && (entry.id === valueId || entry.value_id === valueId)),
  );
  const nextApprovals = readDevApprovalRequests().filter(
    (entry) => !(entry.organization_id === organizationId && entry.entity_ref_id === valueId),
  );

  writeDevMasterData({ modules: state.modules, values: nextValues });
  writeDevApprovalRequests(nextApprovals);
  return nextValues;
}

export function createDevMasterValue(
  organizationId: string,
  moduleKey: string,
  input: {
    label: string;
    code?: string | null;
    description?: string | null;
    parent_id?: string | null;
    metadata?: Record<string, unknown> | null;
    is_active?: boolean;
  },
) {
  const state = readDevMasterData();
  ensureDevMasterModule(organizationId, moduleKey, moduleKey.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()), "Created from ERP master module");

  const created: DevMasterModuleValue = {
    id: `dev-master-value-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    value_id: `mv-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    organization_id: organizationId,
    module_key: moduleKey,
    label: input.label.trim(),
    code: input.code?.trim() ?? null,
    description: input.description?.trim() ?? null,
    is_active: input.is_active ?? true,
    metadata: input.metadata ?? null,
    parent_id: input.parent_id ?? null,
    sort_order: state.values.filter((entry) => entry.organization_id === organizationId && entry.module_key === moduleKey).length,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const nextState = {
    modules: state.modules,
    values: [...state.values, created],
  };

  writeDevMasterData(nextState);
  return created;
}

function readDevApprovalRequests() {
  try {
    if (!existsSync(DEV_APPROVALS_FILE)) {
      writeFileSync(DEV_APPROVALS_FILE, JSON.stringify([], null, 2));
      return [] as DevApprovalRequest[];
    }

    const raw = readFileSync(DEV_APPROVALS_FILE, "utf8");
    const parsed = raw ? JSON.parse(raw) : [];

    if (!Array.isArray(parsed)) {
      return [] as DevApprovalRequest[];
    }

    return parsed.map((item) => ({
      ...item,
      id: String(item.id ?? ""),
      request_id: String(item.request_id ?? ""),
      organization_id: String(item.organization_id ?? ""),
      module_key: String(item.module_key ?? ""),
      module_name: String(item.module_name ?? ""),
      entity_type: String(item.entity_type ?? "master"),
      entity_key: String(item.entity_key ?? ""),
      entity_label: String(item.entity_label ?? ""),
      entity_ref_id: typeof item.entity_ref_id === "string" ? item.entity_ref_id : null,
      requested_by: typeof item.requested_by === "string" ? item.requested_by : null,
      status: item.status === "approved" || item.status === "rejected" ? item.status : "pending",
      notes: typeof item.notes === "string" ? item.notes : null,
      created_at: item.created_at ? new Date(item.created_at as string | Date) : new Date(),
      updated_at: item.updated_at ? new Date(item.updated_at as string | Date) : new Date(),
      reviewed_by: typeof item.reviewed_by === "string" ? item.reviewed_by : null,
      reviewed_at: item.reviewed_at ? new Date(item.reviewed_at as string | Date) : null,
    } satisfies DevApprovalRequest));
  } catch {
    return [] as DevApprovalRequest[];
  }
}

function writeDevApprovalRequests(data: DevApprovalRequest[]) {
  mkdirSync(path.dirname(DEV_APPROVALS_FILE), { recursive: true });
  writeFileSync(
    DEV_APPROVALS_FILE,
    JSON.stringify(
      data.map((item) => ({
        ...item,
        created_at: item.created_at.toISOString(),
        updated_at: item.updated_at.toISOString(),
        reviewed_at: item.reviewed_at ? item.reviewed_at.toISOString() : null,
      })),
      null,
      2
    )
  );
}

export function listDevApprovalRequestsForOrganization(organizationId: string) {
  return readDevApprovalRequests()
    .filter((entry) => entry.organization_id === organizationId)
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
}

export function createDevApprovalRequest(organizationId: string, input: {
  module_key: string;
  module_name: string;
  entity_type: string;
  entity_key: string;
  entity_label: string;
  entity_ref_id?: string | null;
  requested_by?: string | null;
  notes?: string | null;
}) {
  const requests = readDevApprovalRequests();
  const created: DevApprovalRequest = {
    id: `approval-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    request_id: `AR-${Date.now()}-${Math.random().toString(16).slice(2).toUpperCase()}`,
    organization_id: organizationId,
    module_key: input.module_key,
    module_name: input.module_name,
    entity_type: input.entity_type,
    entity_key: input.entity_key,
    entity_label: input.entity_label,
    entity_ref_id: input.entity_ref_id ?? null,
    requested_by: input.requested_by ?? null,
    status: "pending",
    notes: input.notes ?? null,
    created_at: new Date(),
    updated_at: new Date(),
    reviewed_by: null,
    reviewed_at: null,
  };

  writeDevApprovalRequests([...requests, created]);
  return created;
}

export function updateDevApprovalRequestStatus(
  organizationId: string,
  requestId: string,
  status: "approved" | "rejected",
  reviewer?: string | null,
) {
  const requests = readDevApprovalRequests();
  const nextRequests = requests.map((entry) => (
    entry.organization_id === organizationId && (entry.request_id === requestId || entry.id === requestId)
      ? {
          ...entry,
          status,
          updated_at: new Date(),
          reviewed_by: reviewer ?? entry.reviewed_by,
          reviewed_at: new Date(),
        }
      : entry
  ));

  writeDevApprovalRequests(nextRequests);
  return nextRequests.find(
    (entry) => entry.organization_id === organizationId && (entry.request_id === requestId || entry.id === requestId),
  ) ?? null;
}
