function createLink(text, href, className = 'nav-link') {
  const link = document.createElement('a');
  link.className = className;
  link.href = href;
  link.textContent = text;
  return link;
}

export function createNavbar(email) {
  const sidebarContent = document.createElement('div');
  const header = document.createElement('div');
  header.className = 'sidebar-header';

  const titleBlock = document.createElement('div');
  const eyebrow = document.createElement('p');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = 'Finora';
  const title = document.createElement('strong');
  title.textContent = 'Personal finance';
  titleBlock.append(eyebrow, title);
  header.append(titleBlock);

  const nav = document.createElement('nav');
  nav.className = 'nav-stack';
  nav.append(
    createLink('Dashboard', '#burndown-card', 'nav-link active'),
    createLink('Transactions', '#transactions-list'),
    createLink('Budgets', '#budget-rings'),
    createLink('Insights', '#risk-chart-shell')
  );

  sidebarContent.append(header, nav);

  const footer = document.createElement('div');
  footer.className = 'sidebar-footer';
  const pill = document.createElement('div');
  pill.className = 'profile-pill';
  const emailText = document.createElement('span');
  emailText.textContent = email;
  pill.append(emailText);
  const logoutButton = document.createElement('button');
  logoutButton.id = 'logout-button';
  logoutButton.className = 'ghost-button';
  logoutButton.type = 'button';
  logoutButton.textContent = 'Logout';
  footer.append(pill, logoutButton);

  const bottomNav = document.createElement('nav');
  bottomNav.className = 'bottom-nav';
  bottomNav.append(
    createLink('Home', '#burndown-card', ''),
    createLink('Ledger', '#transactions-list', ''),
    createLink('Budget', '#budget-rings', ''),
    createLink('Insight', '#risk-chart-shell', '')
  );

  return { sidebarContent, footer, bottomNav };
}
