import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api-client'

interface CreditProfile {
  pending: number
  creditLimit: number
  daysOverdue: number
  riskScore: number
  canExtendCredit: boolean
  lastPaymentDate?: string
  totalInvoices: number
  paidInvoices: number
}

interface Customer {
  id: string
  name: string
  phone: string
}

interface CreditStatusResponse {
  success: boolean
  customer: Customer
  creditProfile: CreditProfile
}

export function useCustomerContextInPOS() {
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null)

  // Load customer credit profile as soon as they're selected
  const { data: creditStatus, isLoading: isLoadingCredit, refetch } = useQuery<CreditStatusResponse>({
    queryKey: ['customer-credit', selectedCustomer],
    queryFn: () => apiGet<CreditStatusResponse>(`/api/merchant/customer/${selectedCustomer}/credit-status`),
    enabled: !!selectedCustomer && selectedCustomer !== 'walk-in',
    retry: 1,
    staleTime: 30000, // 30 seconds
  })

  const creditProfile = creditStatus?.creditProfile

  // Real-time risk assessment
  const canExtendCredit = useMemo(() => {
    if (!creditProfile) return true
    return creditProfile.canExtendCredit
  }, [creditProfile])

  // Credit utilization percentage
  const creditUtilization = useMemo(() => {
    if (!creditProfile) return 0
    return (creditProfile.pending / creditProfile.creditLimit) * 100
  }, [creditProfile])

  // Risk level classification
  const riskLevel = useMemo(() => {
    if (!creditProfile) return 'low'
    if (creditProfile.riskScore >= 0.7) return 'high'
    if (creditProfile.riskScore >= 0.4) return 'medium'
    return 'low'
  }, [creditProfile])

  // Payment reliability score
  const paymentReliability = useMemo(() => {
    if (!creditProfile || creditProfile.totalInvoices === 0) return 100
    return Math.round((creditProfile.paidInvoices / creditProfile.totalInvoices) * 100)
  }, [creditProfile])

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount)
  }

  return {
    selectedCustomer,
    setSelectedCustomer,
    creditProfile,
    canExtendCredit,
    creditUtilization,
    riskLevel,
    paymentReliability,
    isLoadingCredit,
    refetchCredit: refetch,
    formatCurrency
  }
}