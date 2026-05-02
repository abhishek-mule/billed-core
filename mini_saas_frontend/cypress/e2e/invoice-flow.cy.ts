describe('Invoice Creation Flow', () => {
  beforeEach(() => {
    cy.visit('/login')
    // Mock Auth
    cy.get('input[type="tel"]').type('9999999999')
    cy.get('button').contains('Send OTP').click()
    cy.get('input[placeholder="Enter OTP"]').type('123456')
    cy.get('button').contains('Verify').click()
    cy.url().should('include', '/dashboard')
  })

  it('should create an invoice in under 10 seconds', () => {
    cy.visit('/invoices/new')
    cy.get('input[placeholder="Customer Name (Auto-creates new)"]').type('Test Customer')
    cy.get('input[placeholder="Item Name (Suggests products)"]').first().type('Test Item')
    cy.get('input[type="number"]').first().clear().type('1')
    cy.get('input[type="number"]').eq(1).clear().type('500')
    cy.get('button').contains('Confirm & Save').click()
    cy.url().should('include', '/invoices')
  })
})
