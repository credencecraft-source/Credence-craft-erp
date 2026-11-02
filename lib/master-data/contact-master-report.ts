type ContactWithRoles = {
  roles: Array<{ role_code: string }>;
};

export function filterContactRecordsByRole<T extends ContactWithRoles>(
  contacts: T[],
  roleCode: string,
) {
  if (!roleCode) return contacts;
  if (roleCode === "__UNCATEGORIZED__") {
    return contacts.filter((contact) => contact.roles.length === 0);
  }
  return contacts.filter((contact) =>
    contact.roles.some((role) => role.role_code === roleCode),
  );
}
