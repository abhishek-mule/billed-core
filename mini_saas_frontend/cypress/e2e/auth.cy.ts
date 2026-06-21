/// <reference types="cypress" />

describe('Auth Flow', () => {
  beforeEach(() => {
    cy.visit('/auth')
  })

  it('renders the auth page with login form', () => {
    cy.contains('Welcome back').should('be.visible')
    cy.contains('Sign in to your BillZo dashboard').should('be.visible')
  })

  it('shows Password tab as default', () => {
    cy.contains('button[role="tab"][aria-selected="true"]', 'Password').should('exist')
  })

  it('switches to Magic Link tab', () => {
    cy.contains('button[role="tab"]', 'Magic Link').click()
    cy.contains('button[role="tab"][aria-selected="true"]', 'Magic Link').should('exist')
    cy.get('#email-input').should('exist')
  })

  it('switches to Phone tab', () => {
    cy.contains('button[role="tab"]', 'Phone').click()
    cy.contains('button[role="tab"][aria-selected="true"]', 'Phone').should('exist')
    cy.get('#phone-input').should('exist')
  })

  it('validates email format in magic link form', () => {
    cy.contains('button[role="tab"]', 'Magic Link').click()
    cy.get('#email-input').type('invalid')
    cy.get('button[type="submit"]').click()
    cy.contains('Please enter a valid email').should('be.visible')
  })

  it('validates phone number in phone form', () => {
    cy.contains('button[role="tab"]', 'Phone').click()
    cy.get('#phone-input').type('123')
    cy.contains('button', 'Send OTP').click()
    cy.contains('Please enter a valid 10-digit mobile number').should('be.visible')
  })

  it('shows password visibility toggle', () => {
    cy.get('#pw-password').should('have.attr', 'type', 'password')
    cy.get('[aria-label="Show password"]').click()
    cy.get('#pw-password').should('have.attr', 'type', 'text')
    cy.get('[aria-label="Hide password"]').click()
    cy.get('#pw-password').should('have.attr', 'type', 'password')
  })

  it('toggles remember me checkbox', () => {
    cy.get('[role="checkbox"]').should('have.attr', 'aria-checked', 'true')
    cy.get('[role="checkbox"]').click()
    cy.get('[role="checkbox"]').should('have.attr', 'aria-checked', 'false')
  })

  it('shows social login buttons', () => {
    cy.contains('OR CONTINUE WITH').should('be.visible')
    cy.contains('button', 'Google').should('be.visible')
    cy.contains('button', 'Apple').should('be.visible')
  })

  it('shows Terms and Privacy links', () => {
    cy.contains('Terms of Service').should('be.visible')
    cy.contains('Privacy Policy').should('be.visible')
  })

  it('shows Forgot password link', () => {
    cy.contains('Forgot password?').should('be.visible')
  })

  it('prevents submission with empty password fields', () => {
    cy.get('button[type="submit"]').click()
    cy.contains('Please enter a valid email').should('be.visible')
  })

  it('shows error on invalid password credentials (API)', () => {
    cy.get('#pw-email').type('nonexistent@test.com')
    cy.get('#pw-password').type('wrongpass')
    cy.get('button[type="submit"]').click()
    // The API should return an error, wait for the response
    cy.contains(/Invalid|Something went wrong/, { timeout: 10000 }).should('be.visible')
  })
})
