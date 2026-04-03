// =============================================================
// api/admin-login.js — Vercel Serverless Function
// =============================================================
// Este arquivo deve ficar na pasta /api na raiz do projeto.
// A Vercel detecta automaticamente e expõe como:
//   POST https://morspetrealeza.vercel.app/api/admin-login
//
// IMPORTANTE: Atualize o fetch no index.html de:
//   fetch('/admin-login', ...)
// para:
//   fetch('/api/admin-login', ...)
// =============================================================

export default function handler(req, res) {
  // Apenas POST é aceito
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { user, pass } = req.body || {};

  // Valida campos obrigatórios
  if (!user || !pass) {
    return res.status(400).json({ success: false });
  }

  // Credenciais lidas SOMENTE das variáveis de ambiente do servidor
  // Nunca expostas no frontend, nunca hardcoded aqui
  if (
    user === process.env.ADMIN_USER &&
    pass === process.env.ADMIN_PASS
  ) {
    return res.status(200).json({ success: true });
  }

  // 401 sem revelar qual campo está errado
  return res.status(401).json({ success: false });
}
