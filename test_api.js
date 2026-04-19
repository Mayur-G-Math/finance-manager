import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const authClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function test() {
  const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
    email: 'approhit15@gmail.com',
    password: '@asd123'
  });

  if (authError) {
    console.error('Login failed:', authError.message);
    return;
  }
  
  const token = authData.session.access_token;
  
  // get csrf
  const csrfRes = await fetch('http://localhost:3000/api/csrf-token');
  const csrfCookies = csrfRes.headers.get('set-cookie');
  const { csrfToken } = await csrfRes.json();
  
  console.log('CSRF:', csrfToken);

  // setup headers
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'x-csrf-token': csrfToken,
    'Cookie': csrfCookies
  };

  const month = new Date().toISOString().slice(0, 7);

  console.log('1. Setting Budget');
  let res = await fetch('http://localhost:3000/api/analytics/budgets', {
    method: 'POST',
    headers,
    body: JSON.stringify({ category: 'food', limitAmount: 500, month })
  });
  let json = await res.json();
  console.log('Budget Upsert:', res.status, json);

  console.log('2. Adding 400 Expense (Should succeed)');
  res = await fetch('http://localhost:3000/api/transactions', {
    method: 'POST',
    headers,
    body: JSON.stringify({ amount: 400, type: 'expense', category: 'food', description: 'test1', date: `${month}-15` })
  });
  json = await res.json();
  console.log('Tx 1:', res.status, json);

  console.log('3. Adding 200 Expense (Should FAIL due to budget)');
  res = await fetch('http://localhost:3000/api/transactions', {
    method: 'POST',
    headers,
    body: JSON.stringify({ amount: 200, type: 'expense', category: 'food', description: 'test2', date: `${month}-16` })
  });
  json = await res.json();
  console.log('Tx 2:', res.status, json);
  
  if (res.status === 400 && json.error.includes('Blocked')) {
    console.log('✅ BUDGET ENFORCEMENT WORKS!');
  } else {
    console.log('❌ BUDGET ENFORCEMENT FAILED!');
  }
}

test();
