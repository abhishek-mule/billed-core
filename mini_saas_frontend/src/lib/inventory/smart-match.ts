import { query } from '../db/client'
import { getSession } from '../session'

interface ProductMatch {
  id: string
  name: string
  confidence: number
  price?: number
}

/**
 * Fuzzy matches an extracted item name against the merchant's existing product database.
 * Uses PostgreSQL's similarity function (pg_trgm extension required).
 */
export async function findSmartMatch(itemName: string): Promise<ProductMatch | null> {
  const session = await getSession()
  if (!session?.tenantId) return null

  // We use word_similarity or similarity to find the closest product name
  // Note: pg_trgm extension must be enabled in the DB: CREATE EXTENSION IF NOT EXISTS pg_trgm;
  try {
    const results = await query<any>(
      `SELECT id, item_name as name, sale_price as price, 
              similarity(item_name, $1) as score
       FROM products 
       WHERE tenant_id = $2 AND is_active = true
       ORDER BY score DESC
       LIMIT 1`,
      [itemName, session.tenantId]
    )

    if (results.length > 0 && results[0].score > 0.4) {
      return {
        id: results[0].id,
        name: results[0].name,
        confidence: results[0].score,
        price: results[0].price
      }
    }
  } catch (error) {
    console.error('[SMART_MATCH_ERROR]', error)
  }

  return null
}

/**
 * Auto-categorizes an item if no match is found.
 */
export function suggestCategory(itemName: string): string {
  const lowerName = itemName.toLowerCase()
  if (lowerName.includes('cable') || lowerName.includes('adapter')) return 'Electronics'
  if (lowerName.includes('milk') || lowerName.includes('bread')) return 'Groceries'
  if (lowerName.includes('service') || lowerName.includes('labor')) return 'Services'
  return 'General'
}
