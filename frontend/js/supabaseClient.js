const SUPABASE_BROWSER_MODULE = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

let clientPromise;
let configPromise;
let modulePromise;

async function getConfig() {
  if (!configPromise) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 8000);

    configPromise = fetch('/api/config', {
      credentials: 'same-origin',
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Unable to load app configuration.');
        }

        const config = await response.json();

        if (!config?.supabaseUrl || !config?.supabaseAnonKey) {
          throw new Error('Supabase configuration is missing. Check your environment variables.');
        }

        return config;
      })
      .catch((error) => {
        configPromise = undefined;

        if (error.name === 'AbortError') {
          throw new Error('Loading app configuration timed out.');
        }

        throw error;
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
      });
  }

  return configPromise;
}

async function loadSupabaseModule() {
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    return window.supabase;
  }

  if (!modulePromise) {
    modulePromise = import(SUPABASE_BROWSER_MODULE)
      .then((module) => {
        const supabase = module.createClient ? module : (module.default || window.supabase);
        
        if (!supabase || typeof supabase.createClient !== 'function') {
          throw new Error('Supabase SDK did not expose createClient.');
        }

        return supabase;
      })
      .catch((error) => {
        modulePromise = undefined;
        throw new Error(error.message || 'Unable to load the Supabase browser SDK.');
      });
  }

  return modulePromise;
}

export async function getSupabaseClient() {
  if (!clientPromise) {
    clientPromise = Promise.all([getConfig(), loadSupabaseModule()])
      .then(([config, supabaseModule]) =>
        supabaseModule.createClient(config.supabaseUrl, config.supabaseAnonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        })
      )
      .catch((error) => {
        clientPromise = undefined;
        throw error;
      });
  }

  return clientPromise;
}

export async function getCurrencyCode() {
  const config = await getConfig();
  return config.currency || 'INR';
}
