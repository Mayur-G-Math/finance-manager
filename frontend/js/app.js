import { requireSession, logout } from '/js/auth.js';
import { getCurrencyCode, getSupabaseClient } from '/js/supabaseClient.js';
import { createNavbar } from '/components/navbar.js';
import { initTransactionUI, refreshTransactions } from '/js/transactions.js';
import { bindBudgetForm, loadAnalytics, buildBudgetAlerts } from '/js/analytics.js';

let budgetBanner = null;

function showToast(message, isError = false) {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.className = 'glass-card';
    Object.assign(toast.style, {
      position: 'fixed',
      top: '1.5rem',
      right: '1.5rem',
      padding: '1rem 1.5rem',
      borderRadius: '16px',
      zIndex: '50',
      border: '1px solid var(--line)',
      transition: 'transform 0.25s ease, opacity 0.25s ease',
      fontSize: '0.9rem',
      maxWidth: '320px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
    });
    document.body.append(toast);
  }

  toast.textContent = message;
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';
  toast.style.color = isError ? 'var(--danger)' : 'var(--text)';
  toast.style.borderColor = isError
    ? 'rgba(255,71,87,0.4)'
    : 'rgba(0,210,255,0.3)';
  toast.style.background = isError
    ? 'rgba(20,10,16,0.95)'
    : 'rgba(10,11,30,0.95)';

  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
  }, 4000);
}

function createCurrencyFormatter(currency) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2
  });
}

function showBudgetBanner(alerts, currencyFormatter) {
  if (!budgetBanner) {
    budgetBanner = document.createElement('div');
    budgetBanner.id = 'budget-banner';
    Object.assign(budgetBanner.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      right: '0',
      padding: '0.85rem 1.5rem',
      zIndex: '45',
      fontSize: '0.9rem',
      fontWeight: '600',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.5rem',
      transition: 'transform 0.3s ease, opacity 0.3s ease'
    });
    document.body.prepend(budgetBanner);
  }

  if (!alerts || alerts.length === 0) {
    budgetBanner.style.transform = 'translateY(-120%)';
    budgetBanner.style.opacity = '0';
    return;
  }

  const top = alerts[0];
  const isExceeded = top.level === 'exceeded';
  budgetBanner.style.background = isExceeded
    ? 'rgba(255,71,87,0.92)'
    : 'rgba(249,115,22,0.92)';
  budgetBanner.style.color = '#fff';
  budgetBanner.innerHTML = isExceeded
    ? `&#9888; ${top.title} &mdash; Over by ${currencyFormatter.format(top.amount)}`
    : `&#9888; ${top.title} &mdash; Spent: ${currencyFormatter.format(top.amount)}`;

  budgetBanner.style.transform = 'translateY(0)';
  budgetBanner.style.opacity = '1';

  setTimeout(() => {
    if (budgetBanner) {
      budgetBanner.style.transform = 'translateY(-120%)';
      budgetBanner.style.opacity = '0';
    }
  }, 8000);
}

function updateSummary(summary, currencyFormatter) {
  if (!summary) return;

  const incomeEl = document.querySelector('[data-counter="income"]');
  const expenseEl = document.querySelector('[data-counter="expense"]');
  const balanceEl = document.querySelector('[data-counter="balance"]');
  const budgetEl = document.querySelector('[data-counter="budget"]');

  if (incomeEl) incomeEl.textContent = currencyFormatter.format(summary.totalIncome || 0);
  if (expenseEl) expenseEl.textContent = currencyFormatter.format(summary.totalExpenses || 0);
  if (balanceEl) balanceEl.textContent = currencyFormatter.format(summary.currentBalance || 0);
  if (budgetEl) budgetEl.textContent = currencyFormatter.format(summary.monthlyBudget || 0);
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  localStorage.setItem('finora-theme', theme);
}

function initThemeToggle() {
  const currentTheme = localStorage.getItem('finora-theme') || 'default';
  applyTheme(currentTheme);

  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    applyTheme(document.body.dataset.theme === 'contrast' ? 'default' : 'contrast');
  });
}

function initRippleEffects() {
  document.addEventListener('click', (event) => {
    const button = event.target.closest('button, a');
    if (!button) return;

    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    const rect = button.getBoundingClientRect();
    ripple.style.width = ripple.style.height = `${Math.max(rect.width, rect.height)}px`;
    ripple.style.left = `${event.clientX - rect.left - rect.width / 2}px`;
    ripple.style.top = `${event.clientY - rect.top - rect.height / 2}px`;
    button.append(ripple);
    window.setTimeout(() => ripple.remove(), 600);
  });
}

function initSidebar() {
  const app = document.body;
  document.getElementById('menu-toggle')?.addEventListener('click', () => {
    app.classList.toggle('sidebar-open');
  });
  document.getElementById('sidebar-overlay')?.addEventListener('click', () => {
    app.classList.remove('sidebar-open');
  });
}

function openModal(id) {
  document.getElementById(id)?.classList.add('open');
}

function initModals() {
  document.getElementById('quick-add-button')?.addEventListener('click', () => openModal('transaction-modal'));
  document.getElementById('open-budget-modal')?.addEventListener('click', () => openModal('budget-modal'));
  document.querySelectorAll('[data-close-modal]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.getAttribute('data-close-modal');
      document.getElementById(target)?.classList.remove('open');
    });
  });
  document.querySelectorAll('.modal-shell').forEach((modal) => {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        modal.classList.remove('open');
      }
    });
  });
}

function initFilterPanel() {
  document.getElementById('toggle-filters')?.addEventListener('click', () => {
    document.getElementById('filters-panel')?.classList.toggle('collapsed');
  });
}

function initRevealStagger() {
  document.querySelectorAll('.reveal').forEach((element, index) => {
    element.style.animationDelay = `${index * 70}ms`;
  });
}

function setDefaultDates() {
  const today = new Date();
  const isoDate = today.toISOString().slice(0, 10);
  const isoMonth = isoDate.slice(0, 7);
  const transactionDate = document.querySelector('#transaction-form input[name="date"]');
  const budgetMonth = document.querySelector('#budget-form input[name="month"]');
  if (transactionDate) transactionDate.value = isoDate;
  if (budgetMonth) budgetMonth.value = isoMonth;
}

async function initDashboard() {
  const session = await requireSession();
  if (!session) return;

  const emailName = session.user.email.split('@')[0];
  const titleText = emailName.charAt(0).toUpperCase() + emailName.slice(1) + ' Dashboard';
  const titleEl = document.getElementById('dashboard-title');
  if (titleEl) titleEl.textContent = titleText;

  const currencyFormatter = createCurrencyFormatter(await getCurrencyCode());
  const sidebar = document.getElementById('sidebar');
  const { sidebarContent, footer, bottomNav } = createNavbar(session.user.email);
  sidebar.replaceChildren(sidebarContent, footer);
  document.body.append(bottomNav);
  document.getElementById('logout-button')?.addEventListener('click', logout);

  initThemeToggle();
  initRippleEffects();
  initSidebar();
  initModals();
  initFilterPanel();
  initRevealStagger();
  setDefaultDates();

  const refreshDashboard = async (skipTransactionRefresh = false) => {
    const monthSelector = document.getElementById('dashboard-month-selector');
    const month = monthSelector ? monthSelector.value : '';
    const { dashboard, overview } = await loadAnalytics(currencyFormatter, month);
    updateSummary(dashboard.summary, currencyFormatter);
    
    if (!skipTransactionRefresh) {
      await refreshTransactions();
    }

    const alerts = buildBudgetAlerts(overview.budgetUsage || []);
    const allAlerts = [...(dashboard.alerts || []), ...alerts];
    showBudgetBanner(allAlerts, currencyFormatter);
  };

  const monthSelector = document.getElementById('dashboard-month-selector');
  if (monthSelector) {
    const today = new Date();
    monthSelector.value = today.toISOString().slice(0, 7);
    monthSelector.addEventListener('change', () => refreshDashboard(false));
  }

  initTransactionUI({
    currencyFormatter,
    onChange: () => {
      // onChange from UI transaction add or local filter changes
      refreshDashboard(true).catch((error) => showToast(error.message, true));
    },
    onSuccess: (msg) => showToast(msg, false),
    onError: (msg) => showToast(msg, true)
  });

  bindBudgetForm(
    () => {
      showToast('Budget saved successfully!', false);
      refreshDashboard();
    },
    (msg) => showToast(msg, true)
  );

  window.addEventListener('app:error', (event) => {
    showToast(event.detail, true);
  });

  await refreshDashboard();

  try {
    const supabase = await getSupabaseClient();
    supabase
      .channel('app-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        refreshDashboard().catch(() => {});
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budgets' }, () => {
        refreshDashboard().catch(() => {});
      })
      .subscribe();
  } catch (err) {
    console.warn('Realtime sync unavailable:', err);
  }

  showToast('Dashboard loaded', false);
}

if (window.location.pathname === '/dashboard') {
  initDashboard().catch((error) => showToast(error.message, true));
}
