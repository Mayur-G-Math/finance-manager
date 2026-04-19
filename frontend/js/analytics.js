import { getAccessToken } from '/js/auth.js';
import { populateCategoryFilter } from '/js/transactions.js';

const charts = {};

async function fetchCsrfToken() {
  const response = await fetch('/api/csrf-token', { credentials: 'same-origin' });
  const payload = await response.json();
  return payload.csrfToken;
}

async function request(path, options = {}) {
  const token = await getAccessToken();
  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    },
    credentials: 'same-origin'
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Unable to fetch analytics.');
  }

  return response.json();
}

function setLoaded(id) {
  const element = document.getElementById(id);
  element?.classList.remove('skeleton');
  element?.classList.add('loading-complete');
}

function destroyChart(name) {
  charts[name]?.destroy();
  delete charts[name];
}

function createGradient(ctx, colorStops) {
  const gradient = ctx.createLinearGradient(0, 0, 0, 260);
  colorStops.forEach(([stop, color]) => {
    gradient.addColorStop(stop, color);
  });
  return gradient;
}

function normalize(data, min = 0, max = 100) {
  const minVal = Math.min(...data);
  const maxVal = Math.max(...data);
  const range = maxVal - minVal || 1;
  return data.map((v) => min + ((v - minVal) / range) * (max - min));
}

function renderMonthlyTrendChart(monthlyTrend = [], currencyFormatter, totalBudget = 0) {
  setLoaded('burndown-chart-shell');
  destroyChart('burndown');
  const canvas = document.getElementById('burndownChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const labels = monthlyTrend.length
    ? monthlyTrend.map((m) => m.label)
    : ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const incomeData = monthlyTrend.length ? monthlyTrend.map((m) => m.income) : [];
  const expenseData = monthlyTrend.length ? monthlyTrend.map((m) => m.expense) : [];

  charts.burndown = new window.Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Income',
          data: incomeData,
          tension: 0.4,
          borderColor: '#00d2ff',
          backgroundColor: createGradient(ctx, [[0, 'rgba(0,210,255,0.35)'], [1, 'rgba(0,210,255,0.01)']]),
          fill: true,
          pointRadius: 4,
          pointBackgroundColor: '#00d2ff'
        },
        {
          label: 'Expenses',
          data: expenseData,
          tension: 0.4,
          borderColor: '#e94057',
          backgroundColor: createGradient(ctx, [[0, 'rgba(233,64,87,0.3)'], [1, 'rgba(233,64,87,0.01)']]),
          fill: true,
          pointRadius: 4,
          pointBackgroundColor: '#e94057'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          labels: { color: '#a2abc2', boxWidth: 12, padding: 16 }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${currencyFormatter.format(ctx.raw)}`
          }
        }
      },
      scales: {
        x: { ticks: { color: '#a2abc2' }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: {
          ticks: {
            color: '#a2abc2',
            callback: (v) => currencyFormatter.format(v)
          },
          grid: { color: 'rgba(255,255,255,0.04)' },
          suggestedMax: totalBudget > 0 ? totalBudget : undefined
        }
      }
    }
  });
}

function renderIncomeVsExpenseChart(incomeExpenseSeries = [], currencyFormatter) {
  setLoaded('risk-chart-shell');
  destroyChart('risk');
  const canvas = document.getElementById('riskChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const labels = incomeExpenseSeries.length
    ? incomeExpenseSeries.map((m) => m.label)
    : ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN'];

  charts.risk = new window.Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Income',
          data: incomeExpenseSeries.map((m) => m.income),
          backgroundColor: '#00d2ff',
          borderRadius: 8,
          borderSkipped: false
        },
        {
          label: 'Expenses',
          data: incomeExpenseSeries.map((m) => m.expense),
          backgroundColor: '#e94057',
          borderRadius: 8,
          borderSkipped: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: { color: '#a2abc2', boxWidth: 12, padding: 16 }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${currencyFormatter.format(ctx.raw)}`
          }
        }
      },
      scales: {
        x: { ticks: { color: '#a2abc2' }, grid: { display: false } },
        y: {
          ticks: {
            color: '#a2abc2',
            callback: (v) => currencyFormatter.format(v)
          },
          grid: { color: 'rgba(255,255,255,0.04)' }
        }
      }
    }
  });
}

function renderCategoryRadar(categoryBreakdown = [], currencyFormatter) {
  setLoaded('radar-chart-shell');
  destroyChart('radar');
  const canvas = document.getElementById('costRadarChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (!categoryBreakdown.length) {
    const container = canvas.parentElement;
    container.replaceChildren();
    const msg = document.createElement('div');
    msg.className = 'empty-state';
    msg.textContent = 'Add transactions to see category breakdown.';
    container.append(msg);
    return;
  }

  const labels = categoryBreakdown.map((c) => c.category);
  const amounts = categoryBreakdown.map((c) => c.amount);
  const normalized = normalize(amounts);
  const colors = ['#00d2ff', '#3a7bd5', '#8a2387', '#e94057', '#b197fc', '#5eead4', '#f97316', '#84cc16'];

  charts.radar = new window.Chart(ctx, {
    type: 'radar',
    data: {
      labels,
      datasets: [{
        label: 'Spending',
        data: normalized,
        backgroundColor: 'rgba(0, 210, 255, 0.18)',
        borderColor: '#00d2ff',
        pointBackgroundColor: colors.slice(0, amounts.length),
        pointRadius: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: { color: '#a2abc2', boxWidth: 10, padding: 10, font: { size: 10 } }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const original = amounts[ctx.dataIndex];
              return ` ${labels[ctx.dataIndex]}: ${currencyFormatter.format(original)}`;
            }
          }
        }
      },
      scales: {
        r: {
          ticks: { display: false, stepSize: 25 },
          grid: { color: 'rgba(255,255,255,0.08)' },
          pointLabels: { color: '#a2abc2', font: { size: 11 } },
          suggestedMin: 0,
          suggestedMax: 100
        }
      }
    }
  });
}

function renderBudgetVsSpendingChart(_budgetUsage = [], currentMonthTotal = 0, totalBudget = 0, currencyFormatter) {
  setLoaded('sprint-chart-shell');
  destroyChart('sprint');
  const canvas = document.getElementById('sprintDoughnutChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (!totalBudget) {
    const container = canvas.parentElement;
    container.replaceChildren();
    const msg = document.createElement('div');
    msg.className = 'empty-state';
    msg.textContent = 'Set a monthly budget to see utilization.';
    container.append(msg);
    return;
  }

  const remaining = Math.max(0, totalBudget - currentMonthTotal);

  charts.sprint = new window.Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Spent', 'Remaining'],
      datasets: [{
        data: [currentMonthTotal, remaining],
        backgroundColor: ['#e94057', 'rgba(255,255,255,0.06)'],
        borderWidth: 0,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: { color: '#a2abc2', boxWidth: 10, padding: 10, font: { size: 10 } }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${currencyFormatter.format(ctx.raw)}`
          }
        }
      }
    }
  });
}

function renderMonthlyExpensesBar(monthlyTrend = [], currencyFormatter, totalBudget = 0) {
  setLoaded('expenses-bar-chart-shell');
  destroyChart('expenses');
  const canvas = document.getElementById('monthlyExpensesChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const labels = monthlyTrend.length
    ? monthlyTrend.map((m) => m.label)
    : ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const expenseData = monthlyTrend.length ? monthlyTrend.map((m) => m.expense) : [];

  charts.expenses = new window.Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Expenses',
        data: expenseData,
        backgroundColor: expenseData.map((v) =>
          v === 0 ? 'rgba(255,255,255,0.06)' : '#e94057'
        ),
        borderRadius: 6,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` Expenses: ${currencyFormatter.format(ctx.raw)}`
          }
        }
      },
      scales: {
        x: { ticks: { color: '#a2abc2' }, grid: { display: false } },
        y: {
          ticks: {
            color: '#a2abc2',
            callback: (v) => currencyFormatter.format(v)
          },
          grid: { color: 'rgba(255,255,255,0.04)' },
          suggestedMax: totalBudget > 0 ? totalBudget : undefined
        }
      }
    }
  });
}

function renderBudgetRings(budgetUsage = [], currencyFormatter) {
  const container = document.getElementById('budget-rings');
  if (!container) return;
  container.classList.remove('skeleton');
  container.classList.add('loading-complete');
  container.replaceChildren();

  if (!Array.isArray(budgetUsage) || budgetUsage.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No budgets yet. Use "Set budget" to create one.';
    container.append(empty);
    return;
  }

  budgetUsage.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'budget-ring';

    const visual = document.createElement('div');
    visual.className = 'ring-visual';
    visual.style.setProperty('--progress', `${Math.min(item.percent, 100) * 3.6}deg`);

    const copy = document.createElement('div');
    copy.style.display = 'flex';
    copy.style.flexDirection = 'column';
    copy.style.gap = '0.3rem';
    
    const title = document.createElement('strong');
    title.textContent = item.category === 'overall' ? 'Overall' : item.category;
    const spent = document.createElement('small');
    spent.textContent = `${currencyFormatter.format(item.spent)} of ${currencyFormatter.format(item.limit)}`;
    const percent = document.createElement('small');
    const pct = item.percent || 0;
    percent.textContent = `${pct.toFixed(0)}% used`;
    percent.style.color = pct >= 100 ? 'var(--danger)' : pct >= 80 ? '#f97316' : 'var(--muted)';
    copy.append(title, spent, percent);
    card.append(visual, copy);
    container.append(card);
  });
}

function renderAlertsPanel(alerts = [], currencyFormatter) {
  const container = document.getElementById('smart-alerts');
  if (!container) return;
  container.replaceChildren();

  if (!Array.isArray(alerts) || alerts.length === 0) {
    const ok = document.createElement('div');
    ok.className = 'alert-card';
    ok.style.borderLeft = '3px solid #00d2ff';
    ok.innerHTML = '<div><strong style="color:#00d2ff">All good!</strong><p style="color:var(--muted);margin:4px 0 0">No budget alerts right now.</p></div>';
    container.append(ok);
    return;
  }

  alerts.forEach((alert) => {
    const card = document.createElement('div');
    card.className = 'alert-card';
    const color = alert.level === 'exceeded' ? 'var(--danger)' : '#f97316';
    card.style.borderLeft = `3px solid ${color}`;
    card.innerHTML = `<div><strong style="color:${color}">${alert.title}</strong><p style="color:var(--muted);margin:4px 0 0">${alert.message} ${currencyFormatter.format(alert.amount)}</p></div>`;
    container.append(card);
  });
}

export function bindBudgetForm(onSaved, onError) {
  document.getElementById('budget-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalLabel = submitBtn.textContent;

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving…';

      const formData = new FormData(form);
      const csrfToken = await fetchCsrfToken();

      await request('/api/analytics/budgets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken
        },
        body: JSON.stringify({
          category: String(formData.get('category') || 'overall').toLowerCase(),
          month: String(formData.get('month') || ''),
          limitAmount: Number(formData.get('limitAmount'))
        })
      });

      form.reset();
      document.getElementById('budget-modal')?.classList.remove('open');
      await onSaved();
    } catch (err) {
      onError(err.message || 'Failed to save budget.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  });
}

export async function loadAnalytics(currencyFormatter, month = '') {
  const query = month ? `?month=${encodeURIComponent(month)}` : '';
  const [dashboard, overview] = await Promise.all([
    request(`/api/analytics/dashboard${query}`),
    request(`/api/analytics/overview${query}`)
  ]);

  const monthlyTrend = overview.monthlyTrend || [];
  const categoryBreakdown = overview.categoryBreakdown || [];
  const budgetUsage = overview.budgetUsage || [];
  const alerts = dashboard.alerts || [];
  
  const overallBudget = budgetUsage.find((b) => b.category === 'overall');
  const totalBudget = overallBudget ? overallBudget.limit : 0;

  renderMonthlyTrendChart(monthlyTrend, currencyFormatter, totalBudget);
  renderMonthlyExpensesBar(monthlyTrend, currencyFormatter, totalBudget);
  renderBudgetRings(budgetUsage, currencyFormatter);
  renderAlertsPanel(alerts, currencyFormatter);

  populateCategoryFilter(overview.categories || []);

  return { dashboard, overview };
}

export function buildBudgetAlerts(budgetUsage = []) {
  const alerts = [];
  budgetUsage.forEach((item) => {
    const pct = item.percent || 0;
    if (pct >= 100) {
      alerts.push({
        level: 'exceeded',
        title: `${item.category === 'overall' ? 'Overall' : item.category} budget exceeded!`,
        message: 'You are over budget by:',
        amount: item.spent - item.limit
      });
    } else if (pct >= 80) {
      alerts.push({
        level: 'warning',
        title: `${item.category === 'overall' ? 'Overall' : item.category} approaching limit`,
        message: 'Budget almost reached:',
        amount: item.spent
      });
    }
  });
  return alerts;
}
