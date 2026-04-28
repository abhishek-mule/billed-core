'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, Zap, TrendingUp, Package, Loader2 } from 'lucide-react'
import { useDebounce } from '@/hooks/useDebounce'

interface ProductSuggestion {
  id: string
  item_name: string
  item_code: string
  rate: number
  matchScore: number
  matchType: string
}

interface SmartSearchProps {
  onSelect: (product: any) => void
  placeholder?: string
}

export function SmartSearch({ onSelect, placeholder = 'Search products...' }: SmartSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([])
  const [recommendations, setRecommendations] = useState<ProductSuggestion[]>([])
  const debouncedQuery = useDebounce(query, 300)

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setSuggestions([])
      return
    }

    const searchProducts = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/merchant/products/search?q=${encodeURIComponent(debouncedQuery)}&limit=5`)
        const data = await res.json()
        if (data.success) {
          setSuggestions(data.matches || [])
        }
      } catch (err) {
        console.error('Search failed:', err)
      }
      setLoading(false)
    }

    searchProducts()
  }, [debouncedQuery])

  useEffect(() => {
    if (query.length > 0) return

    const loadRecommendations = async () => {
      try {
        const res = await fetch('/api/merchant/products/recommendations?limit=5')
        const data = await res.json()
        if (data.success) {
          setRecommendations(
            data.recommendations.map((r: any) => ({
              id: r.product_id,
              item_name: r.item_name,
              item_code: r.item_code,
              rate: r.rate,
              matchScore: r.score,
              matchType: r.reason,
            }))
          )
        }
      } catch (err) {
        console.error('Recommendations failed:', err)
      }
    }

    loadRecommendations()
  }, [query])

  const handleSelect = useCallback((product: ProductSuggestion) => {
    onSelect({
      id: product.id,
      name: product.item_name,
      price: product.rate,
      stock: 999,
      unit: 'pc',
      hsn: '',
      gst: 18,
    })
    setQuery('')
    setSuggestions([])
    inputRef.current?.blur()
  }, [onSelect])

  const getMatchBadge = (type: string, score: number) => {
    const badges: Record<string, { color: string; label: string }> = {
      barcode: { color: 'bg-emerald-500/20 text-emerald-400', label: 'Barcode' },
      alias: { color: 'bg-amber-500/20 text-amber-400', label: 'Alias' },
      code: { color: 'bg-blue-500/20 text-blue-400', label: 'Code' },
      name: { color: 'bg-purple-500/20 text-purple-400', label: 'Name' },
    }
    const badge = badges[type] || badges.name
    return (
      <span className={`text-[10px] px-1.5 py-0.5 rounded ${badge.color}`}>
        {badge.label} {score > 0 && `${Math.round(score)}%`}
      </span>
    )
  }

  const displayProducts = query.length > 0 ? suggestions : recommendations

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="h-14 w-full rounded-xl border-2 border-input bg-card pl-11 pr-20 text-base font-medium transition-base focus:border-primary focus:outline-none"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : query.length === 0 ? (
            <Zap className="h-4 w-4 text-amber-500" />
          ) : null}
        </div>
      </div>

      {displayProducts.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-card shadow-lg overflow-hidden">
          {query.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-secondary/30 text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3" />
              <span>Recommended for you</span>
            </div>
          )}
          <div className="max-h-64 overflow-y-auto">
            {displayProducts.map((product) => (
              <button
                key={product.id}
                onClick={() => handleSelect(product)}
                className="w-full flex items-center justify-between p-3 text-left hover:bg-secondary transition"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium truncate">{product.item_name}</span>
                  </div>
                  <div className="text-xs text-muted-foreground ml-6">
                    {product.item_code}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-sm font-bold">₹{product.rate}</span>
                  {getMatchBadge(product.matchType, product.matchScore)}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}