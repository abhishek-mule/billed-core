/**
 * Intelligent Expense Tagger
 * Auto-categorizes business expenses for tax compliance and P&L tracking.
 */

const CATEGORY_MAP: Record<string, string[]> = {
  'Inventory / Goods': ['wholesale', 'stock', 'goods', 'raw material', 'vendor', 'supplier'],
  'Utilities': ['electricity', 'water', 'internet', 'wi-fi', 'broadband', 'phone', 'recharge', 'bescom', 'bsnl'],
  'Rent & Infrastructure': ['rent', 'maintenance', 'security', 'lease', 'office', 'shop'],
  'Staff & Salaries': ['salary', 'wages', 'bonus', 'advance', 'staff', 'employee'],
  'Marketing': ['ads', 'facebook', 'google', 'pamphlet', 'board', 'banner', 'promotion'],
  'Logistics / Travel': ['fuel', 'petrol', 'diesel', 'conveyance', 'courier', 'delivery', 'tempo', 'auto'],
  'Taxes & Govt': ['gst', 'income tax', 'license', 'renewal', 'professional tax'],
}

export function autoTagExpense(description: string): string {
  const normalized = description.toLowerCase()
  
  for (const [category, keywords] of Object.entries(CATEGORY_MAP)) {
    if (keywords.some(keyword => normalized.includes(keyword))) {
      return category
    }
  }

  return 'General Business'
}

/**
 * Suggests if an expense is likely to have Input Tax Credit (ITC)
 */
export function suggestITCEligibility(category: string): boolean {
  const itcEligible = [
    'Inventory / Goods',
    'Utilities',
    'Marketing',
    'Logistics / Travel'
  ]
  
  return itcEligible.includes(category)
}
