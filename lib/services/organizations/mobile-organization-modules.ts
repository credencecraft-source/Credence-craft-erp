import {
  getErpBusinessTypeDisplayName,
  getErpModuleForBusinessTypeName,
  type SubModuleOption,
} from "@/components/erp/erp-config-registry";

export type MobileBusinessType = {
  id: string;
  name: string;
};

export type MobileNavigationModule = {
  key: string;
  label: string;
  pathSegment?: string;
  href?: string;
  children?: MobileNavigationModule[];
};

export type MobileBusinessModule = {
  businessType: string;
  key: string;
  moduleKey: string;
  label: string;
  pathSegment: string;
  children: MobileNavigationModule[];
};

function mapNavigationModule(option: SubModuleOption): MobileNavigationModule {
  return {
    key: option.key,
    label: option.label,
    ...(option.pathSegment ? { pathSegment: option.pathSegment } : {}),
    ...(option.href ? { href: option.href } : {}),
    ...(option.children
      ? { children: option.children.map(mapNavigationModule) }
      : {}),
  };
}

export function getMobileOrganizationModules(
  businessTypes: MobileBusinessType[],
): MobileBusinessModule[] {
  return businessTypes.flatMap((businessType) => {
    const erpModule = getErpModuleForBusinessTypeName(businessType.name);
    if (!erpModule) return [];

    return [{
      businessType: businessType.name,
      key: businessType.id,
      moduleKey: erpModule.key,
      label: getErpBusinessTypeDisplayName(businessType.name),
      pathSegment: erpModule.pathSegment,
      children: erpModule.children.map(mapNavigationModule),
    }];
  });
}
