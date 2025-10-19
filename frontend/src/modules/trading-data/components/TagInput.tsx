import { useMemo } from 'react';
import { Select } from 'antd';

export type TagInputProps = {
  value?: string[];
  onChange?: (value: string[]) => void;
  suggestions?: string[];
  maxTagLength?: number;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
};

const normalizeTag = (tag: string, maxLength: number): string => {
  const trimmed = `${tag ?? ''}`.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.slice(0, maxLength);
};

export default function TagInput({
  value,
  onChange,
  suggestions = [],
  maxTagLength = 25,
  placeholder,
  disabled,
  allowClear,
}: TagInputProps) {
  const normalizedValue = useMemo(() => {
    if (!Array.isArray(value)) {
      return [];
    }
    const sanitized = value
      .map((item) => normalizeTag(item, maxTagLength))
      .filter((item) => item.length > 0);
    return Array.from(new Set(sanitized));
  }, [value, maxTagLength]);

  const options = useMemo(
    () =>
      suggestions.map((tag) => ({
        value: tag,
        label: tag,
      })),
    [suggestions],
  );

  const handleChange = (next: string[]) => {
    const sanitized = next
      .map((item) => normalizeTag(item, maxTagLength))
      .filter((item) => item.length > 0);
    const unique = Array.from(new Set(sanitized));
    onChange?.(unique);
  };

  return (
    <Select
      mode="tags"
      value={normalizedValue}
      onChange={handleChange}
      placeholder={placeholder}
      disabled={disabled}
      allowClear={allowClear}
      tokenSeparators={[',', ' ']}
      options={options}
    />
  );
}
