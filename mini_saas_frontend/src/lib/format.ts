export function formatCurrency(paise: number) {
  return `₹${(paise / 100).toFixed(0)}`;
}
