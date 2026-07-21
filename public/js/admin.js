// STATE E LÓGICA DO PAINEL ADMIN (EM PORTUGUÊS)
let adminToken = localStorage.getItem('nyaman_admin_token') || null;

window.initAdminDashboard = function() {
  if (adminToken === 'TOKEN_BALICASA_123') {
    showDashboardContent();
    loadMetrics();
    loadAdminCalendarConfig();
  } else {
    showLoginModal();
  }
};

function showLoginModal() {
  const modal = document.getElementById('loginModalOverlay');
  const dash = document.getElementById('adminDashboardContent');
  if (modal) modal.style.display = 'flex';
  if (dash) dash.style.display = 'none';
}

function showDashboardContent() {
  const modal = document.getElementById('loginModalOverlay');
  const dash = document.getElementById('adminDashboardContent');
  if (modal) modal.style.display = 'none';
  if (dash) dash.style.display = 'block';
}

// 1. HANDLER DE LOGIN
window.handleAdminLogin = async function(e) {
  if (e) e.preventDefault();
  const userInput = document.getElementById('adminUser').value;
  const passInput = document.getElementById('adminPass').value;
  const errorMsg = document.getElementById('loginErrorMsg');

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: userInput, password: passInput })
    });

    const data = await res.json();
    if (data.success) {
      adminToken = data.token;
      localStorage.setItem('nyaman_admin_token', adminToken);
      if (errorMsg) errorMsg.style.display = 'none';
      showDashboardContent();
      loadMetrics();
      loadAdminCalendarConfig();
    } else {
      if (errorMsg) {
        errorMsg.innerText = data.message || 'Usuário ou senha incorretos.';
        errorMsg.style.display = 'block';
      }
    }
  } catch (err) {
    if (errorMsg) {
      errorMsg.innerText = 'Erro ao conectar ao servidor.';
      errorMsg.style.display = 'block';
    }
  }
};

window.handleAdminLogout = function() {
  adminToken = null;
  localStorage.removeItem('nyaman_admin_token');
  showLoginModal();
};

// 2. CARREGAR MÉTRICAS DE TRÁFEGO
async function loadMetrics() {
  try {
    const res = await fetch('/api/admin/metrics', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const data = await res.json();

    if (data.success && data.metrics) {
      const m = data.metrics;
      document.getElementById('metricTotalViews').innerText = m.totalViews || 0;
      document.getElementById('metricBookingClicks').innerText = m.totalClicks || 0;
      document.getElementById('metricConversionRate').innerText = m.conversionRate || '0%';

      // Países
      const countryContainer = document.getElementById('topCountriesList');
      if (countryContainer) {
        countryContainer.innerHTML = (m.topCountries || []).map(c => `
          <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 13px;">
            <span>📍 ${c.name}</span>
            <span style="font-weight: 700; color: var(--gold-light);">${c.count} acessos</span>
          </div>
        `).join('') || '<p style="color: var(--text-muted); font-size: 13px;">Nenhum acesso registrado ainda.</p>';
      }

      // Renderiza Gráfico Simples de 7 dias
      renderTrafficChart(m.last7Days || []);
    }
  } catch (err) {
    console.warn('Erro ao carregar métricas:', err);
  }
}

function renderTrafficChart(daysData) {
  const chartContainer = document.getElementById('trafficChartContainer');
  if (!chartContainer) return;

  const maxVal = Math.max(...daysData.map(d => d.views), 5);

  chartContainer.innerHTML = `
    <div style="display: flex; align-items: flex-end; gap: 14px; height: 160px; padding-top: 20px; border-bottom: 1px solid var(--border-gold);">
      ${daysData.map(d => {
        const heightPct = Math.max((d.views / maxVal) * 100, 8);
        return `
          <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px;">
            <span style="font-size: 11px; color: var(--gold-light);">${d.views}</span>
            <div style="width: 100%; max-width: 30px; height: ${heightPct}%; background: var(--gold-gradient); border-radius: 4px 4px 0 0;"></div>
            <span style="font-size: 11px; color: var(--text-muted);">${d.displayDate}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// 3. CARREGAR CALENDÁRIO & CONFIGURAÇÕES ICAL
async function loadAdminCalendarConfig() {
  try {
    const res = await fetch('/api/calendar/config', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const data = await res.json();

    if (data.success && data.config) {
      document.getElementById('airbnbUrlInput').value = data.config.airbnbIcalUrl || '';
      document.getElementById('bookingUrlInput').value = data.config.bookingIcalUrl || '';
      
      const lastSyncText = document.getElementById('lastSyncStatusText');
      if (lastSyncText) {
        if (data.config.lastSyncTimestamp) {
          const dateObj = new Date(data.config.lastSyncTimestamp);
          lastSyncText.innerText = `Última Sincronização: ${dateObj.toLocaleDateString('pt-BR')} às ${dateObj.toLocaleTimeString('pt-BR')}`;
        } else {
          lastSyncText.innerText = 'Nenhuma sincronização realizada ainda.';
        }
      }
    }

    renderManualBlocksList(data.manualBlocks || []);
    loadAdminEventsList();
  } catch (err) {
    console.warn('Erro ao carregar configurações de iCal:', err);
  }
}

async function loadAdminEventsList() {
  try {
    const res = await fetch('/api/calendar/events');
    const data = await res.json();
    const container = document.getElementById('adminEventsList');

    if (container && data.success && Array.isArray(data.events)) {
      if (data.events.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted); font-size: 13px;">Nenhuma reserva ou bloqueio registrado.</p>';
        return;
      }

      container.innerHTML = data.events.map(ev => {
        let badgeColor = '#FF7B88'; // Airbnb
        let sourceName = 'Airbnb';

        if (ev.source === 'booking') {
          badgeColor = '#4DA6FF'; // Booking
          sourceName = 'Booking.com';
        } else if (ev.source === 'manual') {
          badgeColor = '#FFC107'; // Manual
          sourceName = 'Bloqueio Manual';
        }

        return `
          <div style="background: rgba(255,255,255,0.03); border-left: 4px solid ${badgeColor}; padding: 12px 16px; border-radius: 6px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong style="color: #FFF; font-size: 14px;">${ev.title}</strong>
              <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
                📅 ${ev.startDate} até ${ev.endDate} • <span style="color: ${badgeColor}; font-weight: 600;">${sourceName}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    console.warn('Erro ao carregar lista de reservas admin:', err);
  }
}

function renderManualBlocksList(blocks) {
  const container = document.getElementById('manualBlocksList');
  if (!container) return;

  if (blocks.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); font-size: 13px;">Nenhum bloqueio manual ativo.</p>';
    return;
  }

  container.innerHTML = blocks.map(b => `
    <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(212,175,55,0.08); border: 1px solid var(--border-gold); padding: 10px 14px; border-radius: 8px; margin-bottom: 8px;">
      <div>
        <strong style="color: var(--gold-light); font-size: 13px;">${b.note}</strong>
        <div style="font-size: 12px; color: var(--text-cream);">${b.startDate} até ${b.endDate}</div>
      </div>
      <button onclick="deleteManualBlock('${b.id}')" style="background: rgba(220,53,69,0.2); border: 1px solid #DC3545; color: #FF7B88; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;">Remover</button>
    </div>
  `).join('');
}

// 4. SALVAR CONFIGURAÇÃO ICAL & SINCRONIZAR
window.saveIcalConfig = async function() {
  const airbnbIcalUrl = document.getElementById('airbnbUrlInput').value;
  const bookingIcalUrl = document.getElementById('bookingUrlInput').value;
  const msgEl = document.getElementById('icalSaveStatusMsg');

  try {
    const res = await fetch('/api/calendar/config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ airbnbIcalUrl, bookingIcalUrl })
    });
    const data = await res.json();
    if (msgEl) {
      msgEl.innerText = data.message;
      msgEl.style.color = '#6CF08A';
      msgEl.style.display = 'block';
    }
  } catch (err) {
    if (msgEl) {
      msgEl.innerText = 'Erro ao salvar URLs de iCal.';
      msgEl.style.color = '#FF7B88';
      msgEl.style.display = 'block';
    }
  }
};

window.triggerManualSync = async function() {
  const btn = document.getElementById('btnSyncNow');
  const msgEl = document.getElementById('icalSaveStatusMsg');

  if (btn) btn.innerText = '⏳ Sincronizando...';

  try {
    const res = await fetch('/api/calendar/sync', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const data = await res.json();

    if (msgEl) {
      msgEl.innerText = data.message;
      msgEl.style.color = data.success ? '#6CF08A' : '#FF7B88';
      msgEl.style.display = 'block';
    }
    loadAdminCalendarConfig();
  } catch (err) {
    if (msgEl) {
      msgEl.innerText = 'Falha na sincronização.';
      msgEl.style.color = '#FF7B88';
      msgEl.style.display = 'block';
    }
  } finally {
    if (btn) btn.innerText = '🔄 Sincronizar Agora';
  }
};

// 5. ADICIONAR E REMOVER BLOQUEIO MANUAL
window.addManualBlock = async function(e) {
  if (e) e.preventDefault();
  const startDate = document.getElementById('blockStartDate').value;
  const endDate = document.getElementById('blockEndDate').value;
  const note = document.getElementById('blockNote').value;

  try {
    const res = await fetch('/api/calendar/block', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ startDate, endDate, note })
    });
    const data = await res.json();
    if (data.success) {
      loadAdminCalendarConfig();
      document.getElementById('blockNote').value = '';
    }
  } catch (err) {
    alert('Erro ao criar bloqueio manual.');
  }
};

window.deleteManualBlock = async function(id) {
  if (!confirm('Deseja realmente remover este bloqueio manual?')) return;

  try {
    const res = await fetch(`/api/calendar/block/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const data = await res.json();
    if (data.success) {
      loadAdminCalendarConfig();
    }
  } catch (err) {
    alert('Erro ao remover bloqueio.');
  }
};

window.copyMasterIcalUrl = function() {
  const masterUrl = `${window.location.origin}/api/calendar/export.ics`;
  navigator.clipboard.writeText(masterUrl).then(() => {
    alert(`Link Mestre iCal copiado:\n${masterUrl}`);
  }).catch(() => {
    prompt('Copie o seu link Mestre iCal:', masterUrl);
  });
};
