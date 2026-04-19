import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const requiredEnv = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY'
];

requiredEnv.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
});

export const env = {
  port: Number(process.env.PORT || 3000),
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  currency: process.env.DEFAULT_CURRENCY || 'INR'
};

export const authClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export const adminClient = createClient(env.supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});
