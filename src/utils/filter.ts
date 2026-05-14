export function fuzzyFilter<T>(items: T[], query: string, getText: (item: T) => string): T[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return items;
  }

  return items.filter((item) => getText(item).toLowerCase().includes(normalized));
}
