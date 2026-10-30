export function readUploadBytes(value: unknown): number | undefined {
  const bytes =
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return typeof bytes === 'number' && Number.isSafeInteger(bytes) && bytes >= 0
    ? bytes
    : undefined;
}
