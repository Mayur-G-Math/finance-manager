import { createTransactionCard } from '/components/transactionCard.js';
import { getAccessToken } from '/js/auth.js';

const state = {
  filters: {
    search: '',
    category: '',
    startDate: '',
    endDate: '',
    sort: 'date_desc'
  },
  onChange: null,
  onSuccess: null,
  onError: null,
  currencyFormatter: new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  })
};

function debounce(callback, wait = 250) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => callback(...args), wait);
  };
}

async function fetchCsrfToken() {
  const response = await fetch('/api/csrf-token', { credentials: 'same-origin' });
  const payload = await response.json();
  return payload.csrfToken;
}

async function request(path, options = {}) {
  const token = await getAccessToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(options.headers || {})
  };

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: 'same-origin'
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Request failed');
  }

  return response.json();
}

export async function fetchTransactions() {
  const params = new URLSearchParams();
  Object.entries(state.filters).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  const data = await request(`/api/transactions?${params.toString()}`);
  return data.transactions;
}

function getFiltersFromDom() {
  return {
    search: document.getElementById('search-input')?.value.trim() || '',
    category: document.getElementById('category-filter')?.value || '',
    startDate: document.getElementById('start-date')?.value || '',
    endDate: document.getElementById('end-date')?.value || '',
    sort: document.getElementById('sort-filter')?.value || 'date_desc'
  };
}

export function populateCategoryFilter(categories) {
  const select = document.getElementById('category-filter');
  if (!select) return;

  const currentValue = select.value;
  select.replaceChildren();
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'All categories';
  select.append(defaultOption);

  categories.forEach((category) => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    select.append(option);
  });

  select.value = currentValue;
}

export function renderTransactions(transactions) {
  const container = document.getElementById('transactions-list');
  if (!container) return;

  container.classList.remove('skeleton');
  container.classList.add('loading-complete');
  container.replaceChildren();

  if (!transactions.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No transactions yet. Click the + button to add your first one.';
    container.append(empty);
    return;
  }

  transactions.forEach((transaction) => {
    container.append(
      createTransactionCard(transaction, state.currencyFormatter, async (transactionId) => {
        try {
          const csrfToken = await fetchCsrfToken();
          await request(`/api/transactions/${transactionId}`, {
            method: 'DELETE',
            headers: { 'x-csrf-token': csrfToken }
          });
          await refreshTransactions();
          state.onSuccess?.('Transaction deleted.');
        } catch (err) {
          state.onError?.(err.message || 'Failed to delete transaction.');
        }
      })
    );
  });
}

export async function refreshTransactions() {
  state.filters = getFiltersFromDom();
  const transactions = await fetchTransactions();
  renderTransactions(transactions);
  state.onChange?.(transactions);
}

export function initTransactionUI({ currencyFormatter, onChange, onSuccess, onError }) {
  state.currencyFormatter = currencyFormatter;
  state.onChange = onChange;
  state.onSuccess = onSuccess;
  state.onError = onError;

  const debouncedRefresh = debounce(() => {
    refreshTransactions().catch((error) => {
      state.onError?.(error.message);
    });
  });

  ['search-input', 'category-filter', 'start-date', 'end-date', 'sort-filter'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', debouncedRefresh);
    document.getElementById(id)?.addEventListener('change', debouncedRefresh);
  });

  document.getElementById('transaction-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalLabel = submitBtn.textContent;

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving…';

      const formData = new FormData(form);
      const csrfToken = await fetchCsrfToken();

      await request('/api/transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken
        },
        body: JSON.stringify({
          amount: Number(formData.get('amount')),
          type: String(formData.get('type') || ''),
          category: String(formData.get('category') || '').toLowerCase(),
          description: String(formData.get('description') || ''),
          date: String(formData.get('date') || '')
        })
      });

      form.reset();
      document.getElementById('transaction-modal')?.classList.remove('open');
      await refreshTransactions();
      state.onSuccess?.('Transaction added successfully!');
    } catch (err) {
      state.onError?.(err.message || 'Failed to add transaction.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  });
}
