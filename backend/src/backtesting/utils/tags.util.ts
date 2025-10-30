export function sanitizeStrategyTags(input: unknown): string[] | undefined {
  if (input === undefined || input === null || input === '') {
    return undefined;
  }

  const normalize = (value: string) =>
    value
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .slice(0, 25);

  const sourceArray =
    typeof input === 'string'
      ? input.split(',')
      : Array.isArray(input)
      ? input.flatMap((item) => `${item}`.split(','))
      : [];

  const sanitized = sourceArray
    .map((value) => normalize(value))
    .filter((value) => value.length > 0);

  const deduped: string[] = [];
  for (const tag of sanitized) {
    if (!deduped.includes(tag)) {
      deduped.push(tag);
    }
    if (deduped.length >= 6) {
      break;
    }
  }
  return deduped.length > 0 ? deduped : undefined;
}
