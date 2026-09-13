/// <reference types="cypress" />

const CDP = 'remote:debugger:protocol'

function setNetworkEmulation(offline: boolean) {
  cy.automation(CDP, { command: 'Network.enable' })
  cy.automation(CDP, {
    command: 'Network.emulateNetworkConditions',
    params: {
      offline,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
      connectionType: 'none',
    },
  })
}

// Real-browser proof of the PWA offline navigation fallback:
//   online navigation  -> the normal requested page
//   first-time offline -> /offline is served from PAGE_CACHE instead of a browser error
describe('PWA offline navigation fallback', () => {
  afterEach(() => {
    setNetworkEmulation(false)
  })

  it('online navigation serves the normal requested page', () => {
    cy.visit('/auth')
    cy.contains('Welcome back').should('be.visible')
    cy.get('button[role="tab"]').should('be.visible')
  })

  it('first-time offline navigation serves /offline instead of a network error', () => {
    // Load once online so the service worker installs and prewarms /offline
    // into PAGE_CACHE before we go offline.
    cy.visit('/')
    cy.window()
      .then((win) => win.navigator.serviceWorker.ready)
      .then((reg) => {
        expect(reg.active).to.not.be.null
      })

    setNetworkEmulation(true)

    // A route that was NEVER visited online, so PAGE_CACHE has nothing for it.
    cy.visit('/reports')

    // The served document is the /offline page — not a browser network error and
    // not the original /reports page.
    cy.location('pathname').should('eq', '/reports')
    cy.get('h1').invoke('text').should('match', /offline|back online/i)
    cy.contains('button', /Try again|Go to Dashboard/i).should('be.visible')
  })
})