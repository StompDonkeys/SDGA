export function formatPlusMinus(value) {
  const num = parseInt(value, 10) || 0;
  return num >= 0 ? `(+${num})` : `(${num})`;
}
