/// <reference types="cypress" />

Cypress.Commands.add('loginByEmail', (email: string) => {
  cy.visit('/auth')
  cy.contains('button', 'Magic Link').click()
  cy.get('input[type="email"]').type(email)
  cy.get('button[type="submit"]').click()
  cy.contains('Check your inbox').should('be.visible')
})

Cypress.Commands.add('loginByPassword', (email: string, password: string) => {
  cy.visit('/auth')
  cy.contains('button', 'Password').click()
  cy.get('#pw-email').type(email)
  cy.get('#pw-password').type(password)
  cy.get('button[type="submit"]').click()
})

Cypress.Commands.add('isAuthenticated', () => {
  cy.getCookie('bz_access').should('exist')
})

export {}
