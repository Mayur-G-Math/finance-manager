import { getSupabaseClient } from '/js/supabaseClient.js';

function setFeedback(message, isError = false) {
  const feedback = document.getElementById('auth-feedback');
  if (!feedback) {
    return;
  }

  feedback.textContent = message;
  feedback.style.color = isError ? 'var(--danger)' : 'var(--muted)';
}

function setButtonState(form, isLoading, label) {
  const button = form?.querySelector('button[type="submit"]');
  if (!button) {
    return;
  }

  if (!button.dataset.defaultLabel) {
    button.dataset.defaultLabel = button.textContent;
  }

  button.disabled = isLoading;
  button.textContent = isLoading ? label : button.dataset.defaultLabel;
}

async function safelyGetSupabaseClient() {
  try {
    return await getSupabaseClient();
  } catch (error) {
    setFeedback(error.message || 'Unable to initialize Supabase.', true);
    return null;
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const supabase = await safelyGetSupabaseClient();
  if (!supabase) {
    return;
  }

  const formData = new FormData(event.currentTarget);
  const payload = {
    email: String(formData.get('email') || '').trim(),
    password: String(formData.get('password') || '')
  };

  setButtonState(form, true, 'Signing in...');
  setFeedback('Signing you in...');

  const { error } = await supabase.auth.signInWithPassword(payload);
  setButtonState(form, false, '');

  if (error) {
    setFeedback(error.message, true);
    return;
  }

  window.location.href = '/dashboard';
}

async function handleSignup(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const supabase = await safelyGetSupabaseClient();
  if (!supabase) {
    return;
  }

  const formData = new FormData(event.currentTarget);
  const payload = {
    email: String(formData.get('email') || '').trim(),
    password: String(formData.get('password') || '')
  };

  setButtonState(form, true, 'Creating account...');
  setFeedback('Creating your account...');

  const { error } = await supabase.auth.signUp({
    ...payload,
    options: {
      emailRedirectTo: `${window.location.origin}/dashboard`
    }
  });
  setButtonState(form, false, '');

  if (error) {
    setFeedback(error.message, true);
    return;
  }

  setFeedback('Account created. Check your email if confirmation is enabled.');
  setTimeout(() => {
    window.location.href = '/login';
  }, 1200);
}

export async function requireSession() {
  const supabase = await safelyGetSupabaseClient();
  if (!supabase) {
    return null;
  }

  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = '/login';
    return null;
  }

  return session;
}

export async function getAccessToken() {
  const session = await requireSession();
  return session?.access_token || '';
}

export async function logout() {
  const supabase = await safelyGetSupabaseClient();
  if (!supabase) {
    return;
  }

  await supabase.auth.signOut();
  window.location.href = '/login';
}

function enhanceStaticPages() {
  document.querySelectorAll('.reveal').forEach((element, index) => {
    element.style.animationDelay = `${index * 80}ms`;
  });
}

function initAmbientPointer() {
  const body = document.body;
  const pointer = { x: window.innerWidth * 0.7, y: window.innerHeight * 0.2 };
  let frame = null;

  const paint = () => {
    body.style.setProperty('--pointer-x', `${pointer.x}px`);
    body.style.setProperty('--pointer-y', `${pointer.y}px`);
    frame = null;
  };

  window.addEventListener('pointermove', (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;

    if (!frame) {
      frame = window.requestAnimationFrame(paint);
    }
  });

  paint();
}

async function redirectAuthenticatedUsers() {
  const pathname = window.location.pathname;
  if (pathname === '/login' || pathname === '/signup') {
    const supabase = await safelyGetSupabaseClient();
    if (!supabase) {
      return;
    }

    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (session) {
      window.location.href = '/dashboard';
    }
  }
}

document.getElementById('login-form')?.addEventListener('submit', handleLogin);
document.getElementById('signup-form')?.addEventListener('submit', handleSignup);

enhanceStaticPages();
initAmbientPointer();
void redirectAuthenticatedUsers();
