import { readDb, writeDb } from './dataStore.js';

export function recordPageView(reqData) {
  const db = readDb();
  if (!db.analytics) {
    db.analytics = { pageViews: [], bookingClicks: [] };
  }

  const newView = {
    id: `pv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    ip: reqData.ip || 'Anônimo',
    country: reqData.country || 'Internacional',
    countryCode: reqData.countryCode || 'INT',
    city: reqData.city || 'Desconhecido',
    device: reqData.device || 'Desktop',
    referrer: reqData.referrer || 'Direto',
    language: reqData.language || 'en'
  };

  db.analytics.pageViews.unshift(newView);
  // Mantém no máximo 1000 registros para economizar espaço
  if (db.analytics.pageViews.length > 1000) {
    db.analytics.pageViews = db.analytics.pageViews.slice(0, 1000);
  }

  writeDb(db);
  return newView;
}

export function recordBookingClick(clickData) {
  const db = readDb();
  if (!db.analytics) {
    db.analytics = { pageViews: [], bookingClicks: [] };
  }

  const newClick = {
    id: `bc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    source: clickData.source || 'Botão Reserva',
    language: clickData.language || 'en',
    device: clickData.device || 'Desktop'
  };

  db.analytics.bookingClicks.unshift(newClick);
  if (db.analytics.bookingClicks.length > 1000) {
    db.analytics.bookingClicks = db.analytics.bookingClicks.slice(0, 1000);
  }

  writeDb(db);
  return newClick;
}

export function getMetricsSummary() {
  const db = readDb();
  const pageViews = (db.analytics && db.analytics.pageViews) || [];
  const bookingClicks = (db.analytics && db.analytics.bookingClicks) || [];

  const totalViews = pageViews.length;
  const totalClicks = bookingClicks.length;
  const conversionRate = totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(1) : 0;

  // Agrupamento por países
  const countryCounts = {};
  pageViews.forEach(pv => {
    const c = pv.country || 'Internacional';
    countryCounts[c] = (countryCounts[c] || 0) + 1;
  });

  const topCountries = Object.keys(countryCounts)
    .map(name => ({ name, count: countryCounts[name] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Agrupamento por dispositivo
  const devices = { Mobile: 0, Desktop: 0, Tablet: 0 };
  pageViews.forEach(pv => {
    const d = pv.device || 'Desktop';
    devices[d] = (devices[d] || 0) + 1;
  });

  // Agrupamento por idioma selecionado
  const languages = {};
  pageViews.forEach(pv => {
    const l = pv.language || 'en';
    languages[l] = (languages[l] || 0) + 1;
  });

  // Agrupamento por data (últimos 7 dias)
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    
    const viewsCount = pageViews.filter(pv => pv.timestamp.startsWith(dateStr)).length;
    const clicksCount = bookingClicks.filter(bc => bc.timestamp.startsWith(dateStr)).length;

    last7Days.push({
      date: dateStr,
      displayDate: `${d.getDate()}/${d.getMonth() + 1}`,
      views: viewsCount,
      clicks: clicksCount
    });
  }

  return {
    totalViews,
    totalClicks,
    conversionRate: `${conversionRate}%`,
    topCountries,
    devices,
    languages,
    last7Days,
    recentViews: pageViews.slice(0, 10),
    recentClicks: bookingClicks.slice(0, 10)
  };
}
