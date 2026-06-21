describe('Payment Flow', () => {
  it('should redirect unauthenticated users to login', () => {
    cy.visit('/dashboard')
    cy.url().should('include', '/auth')
  })

  it('should redirect unauthenticated users from POS', () => {
    cy.visit('/pos')
    cy.url().should('include', '/auth')
  })

  it('should redirect unauthenticated users from invoices', () => {
    cy.visit('/invoices')
    cy.url().should('include', '/auth')
  })

  it('should redirect unauthenticated users from scan', () => {
    cy.visit('/scan')
    cy.url().should('include', '/auth')
  })
})
