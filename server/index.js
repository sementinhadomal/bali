import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

import { readDb, writeDb } from './dataStore.js';
import { syncAllCalendars, generateMasterIcs } from './icalEngine.js';
import { recordPageView, recordBookingClick, getMetricsSummary } from './analyticsStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(cookieParser());

// Servir arquivos estáticos da pasta public/
app.use(express.static(path.join(__dirname, '../public')));

// Middleware de Autenticação Admin Simples
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = req.cookies.admin_token || (authHeader && authHeader.replace('Bearer ', ''));

  if (token === 'TOKEN_BALICASA_123') {
    return next();
  }
  return res.status(401).json({ success: false, message: 'Não autorizado. Faça login primeiro.' });
}

// ----------------------------------------------------
// ROTAS DE ANALYTICS & RASTREAMENTO
// ----------------------------------------------------
app.post('/api/analytics/pageview', (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || '';
    
    // Identificação simples de dispositivo
    let device = 'Desktop';
    if (/mobile/i.test(userAgent)) device = 'Mobile';
    if (/ipad|tablet/i.test(userAgent)) device = 'Tablet';

    const recorded = recordPageView({
      ip: String(ip).split(',')[0],
      country: req.body.country || 'Internacional',
      countryCode: req.body.countryCode || 'INT',
      device,
      referrer: req.body.referrer || 'Direto',
      language: req.body.language || 'en'
    });

    res.json({ success: true, recorded });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/analytics/click', (req, res) => {
  try {
    const userAgent = req.headers['user-agent'] || '';
    let device = 'Desktop';
    if (/mobile/i.test(userAgent)) device = 'Mobile';

    const recorded = recordBookingClick({
      source: req.body.source || 'Botão Booking',
      language: req.body.language || 'en',
      device
    });

    res.json({ success: true, recorded });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// ROTAS DO PAINEL ADMIN & AUTHENTICAÇÃO
// ----------------------------------------------------
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === 'Balicasa123' && password === 'Balicasa123') {
    res.cookie('admin_token', 'TOKEN_BALICASA_123', {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 dias
    });

    return res.json({
      success: true,
      token: 'TOKEN_BALICASA_123',
      message: 'Login realizado com sucesso!'
    });
  }

  return res.status(401).json({
    success: false,
    message: 'Usuário ou senha incorretos. Verifique suas credenciais.'
  });
});

app.get('/api/admin/metrics', authMiddleware, (req, res) => {
  const metrics = getMetricsSummary();
  res.json({ success: true, metrics });
});

// ----------------------------------------------------
// ROTAS DE CALENDÁRIO & CHANNEL MANAGER
// ----------------------------------------------------
app.get('/api/calendar/events', (req, res) => {
  const db = readDb();
  const events = [];

  // Reservas de iCal
  (db.cachedEvents || []).forEach(ev => events.push(ev));

  // Bloqueios Manuais
  (db.manualBlocks || []).forEach(mb => {
    events.push({
      id: mb.id,
      title: `Bloqueio Manual (${mb.note || 'Uso próprio / Manutenção'})`,
      startDate: mb.startDate,
      endDate: mb.endDate,
      source: 'manual',
      note: mb.note
    });
  });

  res.json({
    success: true,
    events,
    config: {
      lastSyncTimestamp: db.config.lastSyncTimestamp,
      syncStatus: db.config.syncStatus
    }
  });
});

app.get('/api/calendar/config', authMiddleware, (req, res) => {
  const db = readDb();
  res.json({ success: true, config: db.config, manualBlocks: db.manualBlocks });
});

app.post('/api/calendar/config', authMiddleware, async (req, res) => {
  try {
    const db = readDb();
    const { airbnbIcalUrl, bookingIcalUrl } = req.body;

    db.config.airbnbIcalUrl = airbnbIcalUrl !== undefined ? airbnbIcalUrl.trim() : db.config.airbnbIcalUrl;
    db.config.bookingIcalUrl = bookingIcalUrl !== undefined ? bookingIcalUrl.trim() : db.config.bookingIcalUrl;
    
    writeDb(db);

    // Dispara sincronização em segundo plano após salvar
    syncAllCalendars().catch(err => console.error('Erro na sincronização pós-salvar:', err));

    res.json({ success: true, message: 'Configurações de iCal salvas com sucesso!', config: db.config });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/calendar/sync', authMiddleware, async (req, res) => {
  try {
    const result = await syncAllCalendars();
    res.json({
      success: true,
      message: `Sincronização concluída! ${result.eventsCount} eventos encontrados.`,
      result
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/calendar/block', authMiddleware, (req, res) => {
  try {
    const { startDate, endDate, note } = req.body;
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Data inicial e final são obrigatórias.' });
    }

    const db = readDb();
    const newBlock = {
      id: `block-${Date.now()}`,
      startDate,
      endDate,
      note: note || 'Bloqueio do Anfitrião',
      createdAt: new Date().toISOString()
    };

    db.manualBlocks.push(newBlock);
    writeDb(db);

    res.json({ success: true, message: 'Bloqueio manual adicionado com sucesso!', block: newBlock });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/calendar/block/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const db = readDb();

    db.manualBlocks = db.manualBlocks.filter(b => b.id !== id);
    writeDb(db);

    res.json({ success: true, message: 'Bloqueio removido com sucesso!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Exportação do iCal Mestre unificado (.ics)
app.get('/api/calendar/export.ics', (req, res) => {
  const icsData = generateMasterIcs();
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="nyaman_lima_master.ics"');
  res.send(icsData);
});

// Redirecionamento SPA para admin e landing page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Inicia o servidor local se não estiver rodando no Vercel como Serverless Function
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`  NYAMAN LIMA VILLAS BALI - SERVIDOR RODANDO`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`  Dashboard Admin: http://localhost:${PORT}/admin`);
    console.log(`====================================================`);
  });
}

export default app;
