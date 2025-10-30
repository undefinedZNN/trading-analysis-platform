export type DiffSegmentType = 'equal' | 'added' | 'removed';

export interface DiffSegment {
  type: DiffSegmentType;
  value: string;
}

export function diffLines(a: string, b: string): DiffSegment[] {
  if (a === b) {
    return a.length
      ? [
          {
            type: 'equal',
            value: a,
          },
        ]
      : [];
  }

  const aLines = a.split(/\r?\n/);
  const bLines = b.split(/\r?\n/);
  const m = aLines.length;
  const n = bLines.length;

  const lcs: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );

  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      if (aLines[i] === bLines[j]) {
        lcs[i][j] = lcs[i + 1][j + 1] + 1;
      } else {
        lcs[i][j] = Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
  }

  const segments: DiffSegment[] = [];
  let i = 0;
  let j = 0;

  const pushSegment = (type: DiffSegmentType, line: string) => {
    const last = segments.at(-1);
    if (last && last.type === type) {
      last.value += `\n${line}`;
    } else {
      segments.push({ type, value: line });
    }
  };

  while (i < m && j < n) {
    if (aLines[i] === bLines[j]) {
      pushSegment('equal', aLines[i]);
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      pushSegment('removed', aLines[i]);
      i += 1;
    } else {
      pushSegment('added', bLines[j]);
      j += 1;
    }
  }

  while (i < m) {
    pushSegment('removed', aLines[i]);
    i += 1;
  }

  while (j < n) {
    pushSegment('added', bLines[j]);
    j += 1;
  }

  return segments;
}

export interface FieldDiff<T extends { key: string }> {
  added: T[];
  removed: T[];
  changed: Array<{ before: T; after: T }>;
  unchanged: T[];
}

export function diffFieldArray<T extends { key: string }>(
  before: T[] = [],
  after: T[] = [],
): FieldDiff<T> {
  const beforeMap = new Map(before.map((item) => [item.key, item]));
  const afterMap = new Map(after.map((item) => [item.key, item]));

  const added: T[] = [];
  const removed: T[] = [];
  const changed: Array<{ before: T; after: T }> = [];
  const unchanged: T[] = [];

  for (const [key, value] of afterMap) {
    if (!beforeMap.has(key)) {
      added.push(value);
    } else {
      const prev = beforeMap.get(key)!;
      if (JSON.stringify(prev) === JSON.stringify(value)) {
        unchanged.push(value);
      } else {
        changed.push({ before: prev, after: value });
      }
    }
  }

  for (const [key, value] of beforeMap) {
    if (!afterMap.has(key)) {
      removed.push(value);
    }
  }

  return { added, removed, changed, unchanged };
}
