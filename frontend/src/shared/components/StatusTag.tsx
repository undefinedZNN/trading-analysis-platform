import { Tag } from 'antd';

type StatusTagProps = {
  value?: string | null;
  colorMap: Record<string, string>;
  labelMap?: Record<string, string>;
  defaultLabel?: string;
};

export function StatusTag({ value, colorMap, labelMap, defaultLabel = '-' }: StatusTagProps) {
  if (!value) {
    return <Tag>{defaultLabel}</Tag>;
  }

  const color = colorMap[value] ?? 'default';
  const label = labelMap?.[value] ?? value;

  return <Tag color={color}>{label}</Tag>;
}

export default StatusTag;
