/**
 * Inventory Prediction Engine
 * Forecasts stock depletion based on sales velocity.
 */

interface SalesHistory {
  productId: string
  date: string
  quantity: number
}

interface StockStatus {
  productId: string
  currentStock: number
  unit: string
}

export function predictStockout(
  status: StockStatus,
  history: SalesHistory[]
): { daysRemaining: number; predictedDate: Date; confidence: number } {
  // 1. Calculate Average Daily Sales (ADS) over the last 30 days
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const relevantSales = history.filter(sale => new Date(sale.date) >= thirtyDaysAgo)
  const totalQtySold = relevantSales.reduce((sum, sale) => sum + sale.quantity, 0)
  
  const ads = totalQtySold / 30

  // 2. Predict Days Remaining
  if (ads === 0) {
    return { daysRemaining: 999, predictedDate: new Date(Date.now() + 999 * 86400000), confidence: 0 }
  }

  const daysRemaining = Math.floor(status.currentStock / ads)
  const predictedDate = new Date()
  predictedDate.setDate(predictedDate.getDate() + daysRemaining)

  // 3. Confidence Factor (more data = more confidence)
  const confidence = Math.min(relevantSales.length / 10, 1)

  return {
    daysRemaining,
    predictedDate,
    confidence
  }
}

/**
 * Generates an alert message for predicted stockouts.
 */
export function getPredictionAlert(days: number, itemName: string): string | null {
  if (days <= 3) return `CRITICAL: ${itemName} will run out in ~3 days. Order now!`
  if (days <= 7) return `WARNING: ${itemName} stock low. Predicted stockout in ${days} days.`
  return null
}
