import axios from 'axios';
import ical from 'node-ical';
import { readDb, writeDb } from './dataStore.js';

// Função para formatar objeto Date em YYYY-MM-DD
function formatDate(dateObj) {
  if (!dateObj) return '';
  const d = new Date(dateObj);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Parser manual de fallback para iCal (.ics) caso o node-ical encontre variações
function parseIcsText(icsText, source) {
  const events = [];
  const vevents = icsText.split('BEGIN:VEVENT');
  
  for (let i = 1; i < vevents.length; i++) {
    const block = vevents[i].split('END:VEVENT')[0];
    let summary = 'Reserva ' + (source === 'airbnb' ? 'Airbnb' : 'Booking.com');
    let dtstart = '';
    let dtend = '';

    const lines = block.split(/\r?\n/);
    for (const line of lines) {
      if (line.startsWith('SUMMARY:')) {
        summary = line.replace('SUMMARY:', '').trim();
      } else if (line.startsWith('DTSTART')) {
        const parts = line.split(':');
        if (parts.length > 1) dtstart = parts[1].trim();
      } else if (line.startsWith('DTEND')) {
        const parts = line.split(':');
        if (parts.length > 1) dtend = parts[1].trim();
      }
    }

    if (dtstart && dtend) {
      // Converte YYYYMMDD para YYYY-MM-DD
      const parseIcalDate = (str) => {
        if (str.length >= 8) {
          return `${str.substring(0, 4)}-${str.substring(4, 6)}-${str.substring(6, 8)}`;
        }
        return str;
      };

      events.push({
        id: `${source}-${i}-${Date.now()}`,
        title: summary || `Reserva ${source}`,
        startDate: parseIcalDate(dtstart),
        endDate: parseIcalDate(dtend),
        source: source,
        updatedAt: new Date().toISOString()
      });
    }
  }

  return events;
}

export async function fetchAndParseIcal(url, sourceName) {
  if (!url || !url.trim().startsWith('http')) {
    return [];
  }
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) NyamanLimaVillasCalendarSync/1.0'
      }
    });

    const icsContent = response.data;
    if (typeof icsContent !== 'string') return [];

    try {
      const parsedData = ical.parseICS(icsContent);
      const events = [];
      for (const key in parsedData) {
        if (parsedData.hasOwnProperty(key)) {
          const ev = parsedData[key];
          if (ev.type === 'VEVENT') {
            events.push({
              id: `${sourceName}-${ev.uid || key}`,
              title: ev.summary || `Reserva ${sourceName === 'airbnb' ? 'Airbnb' : 'Booking.com'}`,
              startDate: formatDate(ev.start),
              endDate: formatDate(ev.end),
              source: sourceName,
              updatedAt: new Date().toISOString()
            });
          }
        }
      }
      if (events.length > 0) return events;
    } catch (err) {
      console.warn(`node-ical falhou para ${sourceName}, tentando fallback regex parser:`, err.message);
    }

    return parseIcsText(icsContent, sourceName);
  } catch (error) {
    console.error(`Erro ao buscar iCal de ${sourceName}:`, error.message);
    throw new Error(`Não foi possível baixar o iCal do ${sourceName}: ${error.message}`);
  }
}

export async function syncAllCalendars() {
  const db = readDb();
  const { airbnbIcalUrl, bookingIcalUrl } = db.config;

  db.config.syncStatus = 'syncing';
  writeDb(db);

  let newEvents = [];
  let errors = [];

  if (airbnbIcalUrl) {
    try {
      const airbnbEvents = await fetchAndParseIcal(airbnbIcalUrl, 'airbnb');
      newEvents = newEvents.concat(airbnbEvents);
    } catch (e) {
      errors.push(`Airbnb: ${e.message}`);
    }
  }

  if (bookingIcalUrl) {
    try {
      const bookingEvents = await fetchAndParseIcal(bookingIcalUrl, 'booking');
      newEvents = newEvents.concat(bookingEvents);
    } catch (e) {
      errors.push(`Booking.com: ${e.message}`);
    }
  }

  // Atualiza banco de dados
  const updatedDb = readDb();
  updatedDb.cachedEvents = newEvents;
  updatedDb.config.lastSyncTimestamp = new Date().toISOString();
  updatedDb.config.syncStatus = errors.length > 0 ? 'warning' : 'success';
  updatedDb.config.lastSyncError = errors.length > 0 ? errors.join('; ') : null;

  writeDb(updatedDb);
  return {
    eventsCount: newEvents.length,
    errors,
    lastSync: updatedDb.config.lastSyncTimestamp
  };
}

export function generateMasterIcs() {
  const db = readDb();
  const allEvents = [];

  // Adiciona reservas iCal
  (db.cachedEvents || []).forEach(ev => allEvents.push(ev));
  
  // Adiciona bloqueios manuais
  (db.manualBlocks || []).forEach(mb => {
    allEvents.push({
      id: mb.id,
      title: `Bloqueio: ${mb.note || 'Indisponível'}`,
      startDate: mb.startDate,
      endDate: mb.endDate,
      source: 'manual'
    });
  });

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nyaman Lima Villas Bali//Channel Manager Master iCal//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Nyaman Lima Villas Bali - Calendário Mestre'
  ];

  allEvents.forEach(ev => {
    const startClean = (ev.startDate || '').replace(/-/g, '');
    const endClean = (ev.endDate || '').replace(/-/g, '');
    if (startClean && endClean) {
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${ev.id}@nyamanlimavillas.com`);
      lines.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`);
      lines.push(`DTSTART;VALUE=DATE:${startClean}`);
      lines.push(`DTEND;VALUE=DATE:${endClean}`);
      lines.push(`SUMMARY:${ev.title || 'Data Bloqueada - Nyaman Lima Villas'}`);
      lines.push('DESCRIPTION:Calendário unificado sincronizado por Nyaman Lima Villas Channel Manager');
      lines.push('STATUS:CONFIRMED');
      lines.push('END:VEVENT');
    }
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
