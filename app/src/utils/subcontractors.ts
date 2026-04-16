export function normalizeSubcontractorName(value: string | null | undefined) {
  return value?.trim() || '';
}

export function buildSubcontractorOptions(
  managedNames: string[],
  referencedNames: Array<string | null | undefined> = []
) {
  const names = new Set<string>();

  managedNames.forEach((name) => {
    const normalized = normalizeSubcontractorName(name);
    if (normalized) names.add(normalized);
  });

  referencedNames.forEach((name) => {
    const normalized = normalizeSubcontractorName(name);
    if (normalized) names.add(normalized);
  });

  return Array.from(names).sort((left, right) => left.localeCompare(right));
}
