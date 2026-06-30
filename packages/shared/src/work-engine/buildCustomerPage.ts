import { buildCustomerView, type CustomerData } from './buildCustomerView'
import type { CustomerView, WorkContext } from './types'

export type CustomerPageView = CustomerView

export function buildCustomerPage(data: CustomerData, context: WorkContext): CustomerPageView {
  return buildCustomerView(data, context)
}