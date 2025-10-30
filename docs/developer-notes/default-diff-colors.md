```
const renderDiffSegment = (segment: VersionCodeDiffSegment, index: number) => {
  let color = 'inherit';
  if (segment.type === 'added') color = '#389e0d';
  if (segment.type === 'removed') color = '#cf1322';
```
