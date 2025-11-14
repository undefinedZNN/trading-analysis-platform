const parseGranularityList = (
  value: string | undefined,
  fallback: string[],
): string[] => {
  if (!value) {
    return [...fallback];
  }

  const parsed = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return parsed.length ? parsed : [...fallback];
};

const AUTO_AGGREGATION_ENV = process.env.AUTO_AGGREGATION_ENABLED;

export const aggregationConfig = {
  autoAggregateOnImport:
    AUTO_AGGREGATION_ENV === undefined ||
    AUTO_AGGREGATION_ENV.toLowerCase() === 'true' ||
    AUTO_AGGREGATION_ENV === '1',
  defaultGranularities: parseGranularityList(
    process.env.AGGREGATION_DEFAULT_GRANULARITIES,
    ['5m', '1h'],
  ),
  optionalGranularities: parseGranularityList(
    process.env.AGGREGATION_OPTIONAL_GRANULARITIES,
    ['15m', '30m', '1d', '1M'],
  ),
};

export function shouldAutoAggregateOnImport(): boolean {
  return aggregationConfig.autoAggregateOnImport;
}

export function getDefaultAggregationGranularities(): string[] {
  return aggregationConfig.defaultGranularities;
}
