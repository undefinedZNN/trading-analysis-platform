export function generateVersionName(
  existingNames: string[] = [],
  referenceDate: Date = new Date(),
): string {
  const base =
    'v' +
    referenceDate
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, '');

  let index = 1;
  let candidate = `${base}.${index}`;
  const existingSet = new Set(existingNames);
  while (existingSet.has(candidate)) {
    index += 1;
    candidate = `${base}.${index}`;
  }
  return candidate;
}
