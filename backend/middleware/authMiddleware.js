import { authClient } from '../config/supabase.js';

export async function authenticateRequest(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token.' });
  }

  const {
    data: { user },
    error
  } = await authClient.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }

  req.user = user;
  return next();
}
