import { z } from 'zod';
import { adminClient } from '../config/supabase.js';

const transactionSchema = z.object({
  amount: z.number().positive(),
  type: z.enum(['income', 'expense']),
  category: z.string().trim().min(2).max(40),
  description: z.string().trim().min(2).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

function sanitize(value) {
  return String(value).replace(/[<>]/g, '').trim();
}

function normalizeSort(sort) {
  const sortMap = {
    date_desc: { column: 'date', ascending: false },
    date_asc: { column: 'date', ascending: true },
    amount_desc: { column: 'amount', ascending: false },
    amount_asc: { column: 'amount', ascending: true }
  };

  return sortMap[sort] || sortMap.date_desc;
}

export async function listTransactions(req, res) {
  const { search = '', category = '', startDate = '', endDate = '', sort = 'date_desc' } = req.query;
  const sorting = normalizeSort(String(sort));

  let query = adminClient
    .from('transactions')
    .select('id, amount, type, category, description, date, created_at')
    .eq('user_id', req.user.id)
    .order(sorting.column, { ascending: sorting.ascending });

  if (category) {
    query = query.eq('category', sanitize(category));
  }

  if (startDate) {
    query = query.gte('date', sanitize(startDate));
  }

  if (endDate) {
    query = query.lte('date', sanitize(endDate));
  }

  if (search) {
    const safeSearch = sanitize(search).replace(/[%(),]/g, '');
    query = query.or(`description.ilike.%${safeSearch}%,category.ilike.%${safeSearch}%`);
  }

  const { data, error } = await query;

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.json({ transactions: data || [] });
}

export async function createTransaction(req, res) {
  const parsed = transactionSchema.safeParse({
    amount: Number(req.body.amount),
    type: req.body.type,
    category: sanitize(req.body.category),
    description: sanitize(req.body.description),
    date: sanitize(req.body.date)
  });

  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid transaction payload.' });
  }

  if (parsed.data.type === 'expense') {
    const monthKey = parsed.data.date.slice(0, 7);
    const monthStart = `${monthKey}-01`;
    // calculate next month explicitly
    const nextDT = new Date(`${monthStart}T00:00:00`);
    nextDT.setMonth(nextDT.getMonth() + 1);
    const nextMonth = nextDT.toISOString().slice(0, 10);
    
    const { data: budgets } = await adminClient
      .from('budgets')
      .select('category, limit_amount')
      .eq('user_id', req.user.id)
      .eq('month', monthStart)
      .in('category', ['overall', parsed.data.category]);

    if (budgets && budgets.length > 0) {
      const { data: monthTx } = await adminClient
        .from('transactions')
        .select('amount, category')
        .eq('user_id', req.user.id)
        .eq('type', 'expense')
        .gte('date', monthStart)
        .lt('date', nextMonth);
        
      const expenses = monthTx || [];
      const overallSpent = expenses.reduce((sum, tx) => sum + Number(tx.amount), 0);
      const categorySpent = expenses
        .filter((tx) => tx.category === parsed.data.category)
        .reduce((sum, tx) => sum + Number(tx.amount), 0);

      const overallBudget = budgets.find((b) => b.category === 'overall');
      const categoryBudget = budgets.find((b) => b.category === parsed.data.category.toLowerCase());

      if (overallBudget && (overallSpent + parsed.data.amount > Number(overallBudget.limit_amount))) {
        return res.status(400).json({ error: `Blocked: Exceeds overall monthly budget limit.` });
      }

      if (categoryBudget && (categorySpent + parsed.data.amount > Number(categoryBudget.limit_amount))) {
        return res.status(400).json({ error: `Blocked: Exceeds '${parsed.data.category}' budget limit.` });
      }
    }
  }

  const { data, error } = await adminClient
    .from('transactions')
    .insert({
      ...parsed.data,
      user_id: req.user.id
    })
    .select('id, amount, type, category, description, date, created_at')
    .single();

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(201).json({ transaction: data });
}

export async function deleteTransaction(req, res) {
  const transactionId = sanitize(req.params.id);

  const { error } = await adminClient
    .from('transactions')
    .delete()
    .eq('id', transactionId)
    .eq('user_id', req.user.id);

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.json({ success: true });
}
