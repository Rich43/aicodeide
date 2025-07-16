describe('Home page', () => {
  it('loads and displays basic elements', () => {
    cy.visit('/index.html');
    cy.title().should('include', 'Coding AI IDE');
    cy.get('#root').should('exist');
  });
});
