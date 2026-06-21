import { cy, Cypress } from 'cypress'

declare global {
  namespace Cypress {
    interface Chainable {
      loginByPhone(phone: string): Chainable<void>
      loginByEmail(email: string): Chainable<void>
    }
  }
}
