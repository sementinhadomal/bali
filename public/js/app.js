// State Global do Cliente
let currentLang = 'en';
let bookedDatesSet = new Set();
let currentCalendarDate = new Date();

// Inicialização da Página
document.addEventListener('DOMContentLoaded', () => {
  initLanguage();
  recordPageView();
  setupBookingTracking();
  fetchCalendarEvents();
  setupGalleryFilters();
  setupVideoAutoplay();
  checkRoute();
});

function setupVideoAutoplay() {
  document.querySelectorAll('video').forEach(vid => {
    vid.muted = true;
    const playPromise = vid.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        const startVideo = () => { vid.play(); };
        document.addEventListener('touchstart', startVideo, { once: true });
        document.addEventListener('click', startVideo, { once: true });
      });
    }
  });
}

// 1. GERENCIAMENTO DE IDIOMAS (8 Idiomas)
function initLanguage() {
  const savedLang = localStorage.getItem('nyaman_lang') || 'en';
  setLanguage(savedLang);

  // Event listener para dropdown de idioma
  const langBtn = document.getElementById('langBtn');
  const langDropdown = document.getElementById('langDropdown');

  if (langBtn && langDropdown) {
    langBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      langDropdown.classList.toggle('show');
    });

    document.addEventListener('click', () => {
      langDropdown.classList.remove('show');
    });
  }
}

function setLanguage(langCode) {
  if (!TRANSLATIONS[langCode]) langCode = 'en';
  currentLang = langCode;
  localStorage.setItem('nyaman_lang', langCode);

  // Atualiza rótulo do botão de idioma
  const currentLangLabel = document.getElementById('currentLangLabel');
  if (currentLangLabel) {
    const langNames = {
      en: '🇺🇸 English',
      pt: '🇧🇷 Português',
      es: '🇪🇸 Español',
      it: '🇮🇹 Italiano',
      fr: '🇫🇷 Français',
      au: '🇦🇺 English (AU)',
      bali: '🇮🇩 Bahasa Bali',
      hi: '🇮🇳 हिन्दी'
    };
    currentLangLabel.innerText = langNames[langCode] || '🇺🇸 English';
  }

  // Atualiza todos os elementos com data-i18n
  const dict = TRANSLATIONS[langCode];
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) {
      el.innerText = dict[key];
    }
  });

  // Atualiza elementos do calendário
  renderPublicCalendar();
}

// Torna global para ser chamado no HTML
window.changeLanguage = function(langCode) {
  setLanguage(langCode);
  const langDropdown = document.getElementById('langDropdown');
  if (langDropdown) langDropdown.classList.remove('show');
};

// 2. REGISTRO DE ANALYTICS & MÉTRICAS
function recordPageView() {
  fetch('/api/analytics/pageview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      referrer: document.referrer || 'Direto',
      language: currentLang
    })
  }).catch(err => console.warn('PageView track error:', err));
}

function setupBookingTracking() {
  document.querySelectorAll('.btn-booking-trigger').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const source = btn.getAttribute('data-source') || 'Botão Booking';
      
      // Envia evento de clique em segundo plano
      fetch('/api/analytics/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, language: currentLang })
      }).catch(err => console.warn('Booking click track error:', err));
    });
  });
}

// 3. BUSCA DE DISPONIBILIDADE DO CALENDÁRIO
async function fetchCalendarEvents() {
  try {
    const response = await fetch('/api/calendar/events');
    const data = await response.json();
    
    if (data.success && Array.isArray(data.events)) {
      bookedDatesSet.clear();
      
      data.events.forEach(ev => {
        if (ev.startDate && ev.endDate) {
          let curr = new Date(ev.startDate + 'T00:00:00');
          const end = new Date(ev.endDate + 'T00:00:00');

          while (curr <= end) {
            const dateStr = curr.toISOString().split('T')[0];
            bookedDatesSet.add(dateStr);
            curr.setDate(curr.getDate() + 1);
          }
        }
      });
    }
  } catch (err) {
    console.warn('Erro ao carregar calendário público:', err);
  }
  renderPublicCalendar();
}

function renderPublicCalendar() {
  const container = document.getElementById('calendarDaysGrid');
  const monthTitle = document.getElementById('calendarMonthTitle');
  if (!container || !monthTitle) return;

  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();

  const monthNamesEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  monthTitle.innerText = `${monthNamesEn[month]} ${year}`;

  container.innerHTML = '';

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Preenche dias vazios no início do mês
  for (let i = 0; i < firstDay; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'day-cell empty';
    container.appendChild(emptyCell);
  }

  // Preenche os dias do mês
  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const cell = document.createElement('div');

    const isBooked = bookedDatesSet.has(dayStr);
    cell.className = `day-cell ${isBooked ? 'booked' : 'available'}`;
    cell.innerText = day;
    cell.title = isBooked ? 'Data Reservada' : 'Disponível no Booking.com';

    container.appendChild(cell);
  }
}

window.prevMonth = function() {
  currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
  renderPublicCalendar();
};

window.nextMonth = function() {
  currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
  renderPublicCalendar();
};

// 4. GALERIA DE FOTOS
function setupGalleryFilters() {
  const filterBtns = document.querySelectorAll('.tab-btn');
  const galleryItems = document.querySelectorAll('.gallery-item');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const filter = btn.getAttribute('data-filter');
      galleryItems.forEach(item => {
        if (filter === 'all' || item.classList.contains(filter)) {
          item.style.display = 'block';
        } else {
          item.style.display = 'none';
        }
      });
    });
  });
}

// 5. ROTEADOR PARA DASHBOARD ADMIN
function checkRoute() {
  if (window.location.pathname === '/admin' || window.location.hash === '#admin') {
    const adminModal = document.getElementById('adminSection');
    if (adminModal) {
      adminModal.style.display = 'block';
      if (typeof window.initAdminDashboard === 'function') {
        window.initAdminDashboard();
      }
    }
  }
}

// 6. NAVEGAÇÃO DO CARROSSEL DE FOTOS (2 FOTOS LADO A LADO)
window.scrollGallery = function(direction) {
  const container = document.getElementById('galleryGrid');
  if (container) {
    const scrollAmount = (container.clientWidth / 2) * direction * 1.5;
    container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  }
};
