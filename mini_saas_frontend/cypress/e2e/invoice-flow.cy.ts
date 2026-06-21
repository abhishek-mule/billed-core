describe('Invoice Creation Flow', () => {
  beforeEach(() => {
    cy.loginByPhone('9999999999')
    cy.url({ timeout: 10000 }).should('include', '/auth')
  })

  it('should display the auth page with email and phone options', () => {
    cy.contains('Welcome to BillZo').should('be.visible')
    cy.contains('button', 'Email').should('be.visible')
    cy.contains('button', 'Phone').should('be.visible')
  })

  it('should switch between email and phone tabs', () => {
    cy.contains('button', 'Phone').click()
    cy.get('input[type="tel"]').should('be.visible')
    cy.contains('button', 'Email').click()
    cy.get('input[type="email"]').should('be.visible')
  })

  it('should show error for empty email submission', () => {
    cy.contains('button', 'Continue with Email').click()
    cy.contains('Please enter a valid email address').should('be.visible')
  })

  it('should show error for invalid phone number', () => {
    cy.contains('button', 'Phone').click()
    cy.contains('button', 'Send OTP').click()
    cy.contains('Please enter a valid 10-digit mobile number').should('be.visible')
  })
})
