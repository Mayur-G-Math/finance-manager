import { z } from 'zod';
import { adminClient } from '../config/supabase.js';

const budgetSchema = z.object({
  category: z.string().trim().min(1).max(40),
  limitAmount: z.number().positive(),
  month: z.string().regex(/^\d{4}-\d{2}$/)
});

function sanitize(value) {
  return String(value).replace(/[<>]/g, '').trim();
}

function getMonthKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getMonthLabel(monthKey) {
  return new Date(`${monthKey}-01T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    year: '2-digit'
  });
}

function groupByMonth(transactions, targetMonthKey, monthsBack = 6) {
  const targetDate = new Date(`${targetMonthKey}-01T00:00:00`);
  const buckets = [];

  for (let index = monthsBack - 1; index >= 0; index -= 1) {
    const date = new Date(targetDate.getFullYear(), targetDate.getMonth() - index, 1);
    const key = getMonthKey(date);
    buckets.push({
      key,
      label: getMonthLabel(key),
      income: 0,
      expense: 0
    });
  }

  transactions.forEach((transaction) => {
    const monthKey = transaction.date.slice(0, 7);
    const bucket = buckets.find((entry) => entry.key === monthKey);
    if (!bucket) {
      return;
    }

    bucket[transaction.type] += Number(transaction.amount);
  });

  return buckets;
}

function buildHeatmap(expenseTransactions, targetMonthKey) {
  // We want the last 35 days from the end of targetMonthKey
  // Or just 35 days from the 1st of next month of targetMonthKey
  const nextTargetDate = new Date(`${targetMonthKey}-01T00:00:00`);
  nextTargetDate.setMonth(nextTargetDate.getMonth() + 1);
  nextTargetDate.setDate(0); // Last day of targetMonthKey
  const today = nextTargetDate;
  const points = [];
  let maxAmount = 0;

  for (let index = 34; index >= 0; index -= 1) {
    const day = new Date(today);
    day.setDate(today.getDate() - index);
    const key = day.toISOString().slice(0, 10);
    const amount = expenseTransactions
      .filter((transaction) => transaction.date === key)
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

    maxAmount = Math.max(maxAmount, amount);
    points.push({
      label: day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      amount,
      intensity: 0
    });
  }

  return points.map((point) => ({
    ...point,
    intensity: point.amount === 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((point.amount / maxAmount) * 4)))
  }));
}

function buildActivityPoints(transactions) {
  return transactions.slice(0, 10).reverse().map((transaction) => ({
    label: transaction.category,
    amount: Number(transaction.amount)
  }));
}

function calculateBudgetUsage(budgets, transactions, monthKey) {
  const monthTransactions = transactions.filter((transaction) => transaction.date.startsWith(monthKey));

  return budgets.map((budget) => {
    const spent = monthTransactions
      .filter((transaction) => transaction.type === 'expense')
      .filter((transaction) =>
        budget.category === 'overall' ? true : transaction.category === budget.category
      )
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

    return {
      category: budget.category,
      limit: Number(budget.limit_amount),
      spent,
      percent: Number(((spent / Number(budget.limit_amount)) * 100 || 0).toFixed(1))
    };
  });
}

function calculateHealthScore(summary, budgetUsage) {
  const savingsRate = summary.totalIncome
    ? Math.max(0, ((summary.totalIncome - summary.totalExpenses) / summary.totalIncome) * 100)
    : 0;
  const budgetDiscipline =
    budgetUsage.length > 0
      ? 100 -
        Math.min(
          100,
          budgetUsage.reduce((sum, item) => sum + Math.min(item.percent, 120), 0) / budgetUsage.length
        )
      : 70;

  return Math.max(0, Math.min(100, Math.round(savingsRate * 0.6 + budgetDiscipline * 0.4)));
}

function buildAlerts(budgetUsage) {
  return budgetUsage
    .filter((item) => item.spent > item.limit)
    .map((item) => ({
      title: `${item.category} budget exceeded`,
      message: 'Overspend detected:',
      amount: item.spent - item.limit
    }));
}

async function loadUserData(userId, queryMonth = null) {
  const now = new Date();
  const currentMonth = queryMonth || getMonthKey(now);
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().slice(0, 10);

  const [transactionsResult, budgetsResult] = await Promise.all([
    adminClient
      .from('transactions')
      .select('id, amount, type, category, description, date, created_at')
      .eq('user_id', userId)
      .gte('date', twelveMonthsAgo)
      .order('date', { ascending: false }),
    adminClient
      .from('budgets')
      .select('id, category, limit_amount, month')
      .eq('user_id', userId)
      .eq('month', `${currentMonth}-01`)
      .order('category', { ascending: true })
  ]);

  if (transactionsResult.error) {
    throw new Error(transactionsResult.error.message);
  }

  if (budgetsResult.error) {
    throw new Error(budgetsResult.error.message);
  }

  return {
    transactions: transactionsResult.data || [],
    budgets: budgetsResult.data || [],
    currentMonth
  };
}

export async function getDashboardSummary(req, res) {
  try {
    const { transactions, budgets, currentMonth } = await loadUserData(req.user.id, sanitize(req.query.month || ''));
    const currentMonthTransactions = transactions.filter((transaction) => transaction.date.startsWith(currentMonth));
    const totalIncome = currentMonthTransactions
      .filter((transaction) => transaction.type === 'income')
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
    const totalExpenses = currentMonthTransactions
      .filter((transaction) => transaction.type === 'expense')
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
    const overallBudget = budgets.find((budget) => budget.category === 'overall');
    const budgetUsage = calculateBudgetUsage(budgets, transactions, currentMonth);

    return res.json({
      summary: {
        totalIncome,
        totalExpenses,
        currentBalance: totalIncome - totalExpenses,
        monthlyBudget: Number(overallBudget?.limit_amount || 0)
      },
      recentTransactions: transactions.slice(0, 8),
      alerts: buildAlerts(budgetUsage)
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

export async function getAnalyticsOverview(req, res) {
  try {
    const { transactions, budgets, currentMonth } = await loadUserData(req.user.id, sanitize(req.query.month || ''));
    const currentMonthTransactions = transactions.filter((transaction) => transaction.date.startsWith(currentMonth));
    const currentExpenses = currentMonthTransactions.filter((transaction) => transaction.type === 'expense');
    const monthlyTrend = groupByMonth(transactions, currentMonth, 6);
    const categoryBreakdownMap = currentExpenses.reduce((map, transaction) => {
      map.set(transaction.category, (map.get(transaction.category) || 0) + Number(transaction.amount));
      return map;
    }, new Map());
    const categoryBreakdown = [...categoryBreakdownMap.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((left, right) => right.amount - left.amount);
    const budgetUsage = calculateBudgetUsage(budgets, transactions, currentMonth);
    const categories = [...new Set(transactions.map((transaction) => transaction.category))].sort();
    const summary = {
      totalIncome: currentMonthTransactions
        .filter((transaction) => transaction.type === 'income')
        .reduce((sum, transaction) => sum + Number(transaction.amount), 0),
      totalExpenses: currentExpenses.reduce((sum, transaction) => sum + Number(transaction.amount), 0)
    };

    return res.json({
      categories,
      categoryBreakdown,
      incomeExpenseSeries: monthlyTrend,
      monthlyTrend,
      budgetUsage,
      financialHealthScore: calculateHealthScore(summary, budgetUsage),
      weeklyHeatmap: buildHeatmap(currentExpenses, currentMonth),
      activityPoints: buildActivityPoints(transactions)
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

export async function upsertBudget(req, res) {
  const parsed = budgetSchema.safeParse({
    category: sanitize(req.body.category || 'overall').toLowerCase() || 'overall',
    limitAmount: Number(req.body.limitAmount),
    month: sanitize(req.body.month)
  });

  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid budget payload.' });
  }

  const { data, error } = await adminClient
    .from('budgets')
    .upsert(
      {
        user_id: req.user.id,
        category: parsed.data.category || 'overall',
        limit_amount: parsed.data.limitAmount,
        month: `${parsed.data.month}-01`
      },
      { onConflict: 'user_id,category,month' }
    )
    .select('id, category, limit_amount, month')
    .single();

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(201).json({ budget: data });
}
