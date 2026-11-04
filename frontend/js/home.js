/**
 * RentEase Homepage — home.js
 * Handles: hero slideshow, search, listings, filters, modal, how-it-works tabs, contact form
 */

const HOME_API = 'https://rentease-m4ev.onrender.com/api';

// ═══════════════════════════════════════════════════════════
// Hero Slideshow
// ═══════════════════════════════════════════════════════════
(function initSlideshow() {
  const slides = document.querySelectorAll('.hero-slide');
  if (!slides.length) return;
  let current = 0;
  setInterval(() => {
    slides[current].classList.remove('active');
    current = (current + 1) % slides.length;
    slides[current].classList.add('active');
  }, 5000);
})();

// ═══════════════════════════════════════════════════════════
// Header scroll effect
// ═══════════════════════════════════════════════════════════
window.addEventListener('scroll', () => {
  const header = document.getElementById('siteHeader');
  if (header) header.classList.toggle('scrolled', window.scrollY > 20);
}, { passive: true });

// ═══════════════════════════════════════════════════════════
// Mobile hamburger
// ═══════════════════════════════════════════════════════════
document.getElementById('hamburgerBtn')?.addEventListener('click', () => {
  const nav = document.getElementById('mobileNav');
  nav?.classList.toggle('open');
});

// Close mobile nav when a link is clicked
document.querySelectorAll('.mobile-nav-link').forEach(link => {
  link.addEventListener('click', () => {
    document.getElementById('mobileNav')?.classList.remove('open');
  });
});

// ═══════════════════════════════════════════════════════════
// Search tabs
// ═══════════════════════════════════════════════════════════
document.querySelectorAll('.search-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.search-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.search-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.tab === 'search' ? 'tabSearch' : 'tabFilter';
    document.getElementById(target)?.classList.add('active');
  });
});

// ═══════════════════════════════════════════════════════════
// How It Works tabs
// ═══════════════════════════════════════════════════════════
document.querySelectorAll('.toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.how-steps').forEach(s => s.classList.add('hidden'));
    btn.classList.add('active');
    const target = btn.dataset.target;
    document.getElementById(target)?.classList.remove('hidden');
  });
});

// ═══════════════════════════════════════════════════════════
// Listings State
// ═══════════════════════════════════════════════════════════
let currentSearch = '';
let currentFilters = {};
let currentSort = 'newest';
let allListings = [];

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

// ═══════════════════════════════════════════════════════════
// Load Listings from backend
// ═══════════════════════════════════════════════════════════
async function loadListings(params = {}) {
  const grid = document.getElementById('listingsGrid');
  const emptyState = document.getElementById('listingsEmpty');
  const footer = document.getElementById('listingsFooter');

  if (!grid) return;

  // Show skeleton
  grid.innerHTML = `
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
  `;
  emptyState?.classList.add('hidden');
  footer?.classList.add('hidden');

  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.city) query.set('city', params.city);
  if (params.minRent) query.set('minRent', params.minRent);
  if (params.maxRent) query.set('maxRent', params.maxRent);
  if (params.bedrooms) query.set('bedrooms', params.bedrooms);
  if (params.type) query.set('type', params.type);
  if (params.sortBy) query.set('sortBy', params.sortBy);
  if (params.order) query.set('order', params.order);

  try {
    const res = await fetch(`${HOME_API}/apartments/public?${query.toString()}`);
    const data = await res.json();

    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to load');

    allListings = data.data || [];
    renderListings(allListings);

    // Update stats
    const statTotal = document.getElementById('statTotal');
    const statAvailable = document.getElementById('statAvailable');
    if (statTotal) statTotal.textContent = allListings.length;
    if (statAvailable) statAvailable.textContent = allListings.filter(a => a.status === 'Empty').length;

  } catch (err) {
    console.error('[Listings] Load error:', err);
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:#6B7280">
      <i class="fa-solid fa-triangle-exclamation" style="font-size:32px;margin-bottom:12px;display:block;color:#E8D5C4"></i>
      <p>Could not load properties. Please check your connection.</p>
    </div>`;
  }
}

function renderListings(listings) {
  const grid = document.getElementById('listingsGrid');
  const emptyState = document.getElementById('listingsEmpty');
  if (!grid) return;

  if (!listings.length) {
    grid.innerHTML = '';
    emptyState?.classList.remove('hidden');
    return;
  }
  emptyState?.classList.add('hidden');

  grid.innerHTML = listings.map(apt => buildPropertyCard(apt)).join('');

  // Attach click handlers
  grid.querySelectorAll('.property-card').forEach((card, i) => {
    card.addEventListener('click', () => openApartmentModal(listings[i]));
    card.querySelector('.card-location')?.addEventListener('click', (event) => {
      event.stopPropagation();
      openApartmentModal(listings[i]);
    });
    card.querySelector('.card-view-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openApartmentModal(listings[i]);
    });
  });
}

function buildPropertyCard(apt) {
  const img = apt.images && apt.images.length
    ? `<img src="${apt.images[0]}" alt="${apt.buildingDetails}" loading="lazy" />`
    : `<div class="card-image-placeholder"><i class="fa-solid fa-building"></i></div>`;

  const badgeLabel = apt.isFeatured ? 'Featured' : apt.status === 'Empty' ? 'Available' : apt.status;
  const badgeClass = apt.isFeatured ? 'featured' : apt.status === 'Empty' ? 'available' : apt.status === 'Vacating Soon' ? 'vacating' : '';

  const specs = [
    apt.bedrooms ? `<div class="card-spec"><i class="fa-solid fa-bed"></i>${apt.bedrooms} Bed</div>` : '',
    apt.bathrooms ? `<div class="card-spec"><i class="fa-solid fa-shower"></i>${apt.bathrooms} Bath</div>` : '',
    apt.areaSqFt ? `<div class="card-spec"><i class="fa-solid fa-vector-square"></i>${apt.areaSqFt} sqft</div>` : '',
  ].filter(Boolean).join('');

  const amenityTags = (apt.amenities || []).slice(0, 3).map(a => `<span class="amenity-tag">${a}</span>`).join('');
  const location = [apt.locality, apt.city].filter(Boolean).join(', ') || apt.buildingDetails;
  const safeLocation = escapeHtml(location);

  return `
    <div class="property-card">
      <div class="card-image">
        ${img}
        <span class="card-badge ${badgeClass}">${badgeLabel}</span>
      </div>
      <div class="card-body">
        <div class="card-rent">₹${Number(apt.monthlyRent).toLocaleString('en-IN')}<span>/month</span></div>
        <div class="card-name">${apt.buildingDetails}${apt.apartmentNumber ? ` — ${apt.apartmentNumber}` : ''}</div>
        <button type="button" class="card-location" aria-label="Show map for ${safeLocation}"><i class="fa-solid fa-location-dot"></i>${safeLocation}</button>
        ${specs ? `<div class="card-specs">${specs}</div>` : ''}
        ${amenityTags ? `<div class="card-amenities">${amenityTags}</div>` : ''}
        <div class="card-footer">
          <span class="card-type">${apt.apartmentType}</span>
          <button class="card-view-btn">View Details</button>
        </div>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════
// Apartment Detail Modal
// ═══════════════════════════════════════════════════════════
function openApartmentModal(apt) {
  const modal = document.getElementById('apartmentModal');
  const content = document.getElementById('apartmentModalContent');
  if (!modal || !content) return;

  const img = apt.images && apt.images.length
    ? `<img class="modal-image" src="${apt.images[0]}" alt="${apt.buildingDetails}" />`
    : `<div style="height:200px;background:#F5EDE4;display:flex;align-items:center;justify-content:center;font-size:64px;border-radius:16px 16px 0 0">🏠</div>`;

  const location = [apt.address, apt.locality, apt.city, apt.state, apt.pincode].filter(Boolean).join(', ');
  const latitude = Number(apt.latitude);
  const longitude = Number(apt.longitude);
  const hasCoordinates = apt.latitude !== '' && apt.latitude !== null && apt.latitude !== undefined
    && apt.longitude !== '' && apt.longitude !== null && apt.longitude !== undefined
    && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
  const mapQuery = hasCoordinates
    ? `${latitude},${longitude}`
    : [location, apt.buildingDetails, apt.apartmentNumber].filter(Boolean).join(', ');
  const mapsUrl = new URL('https://www.google.com/maps/search/');
  mapsUrl.searchParams.set('api', '1');
  mapsUrl.searchParams.set('query', mapQuery);
  const embedUrl = new URL('https://maps.google.com/maps');
  embedUrl.searchParams.set('q', mapQuery);
  embedUrl.searchParams.set('output', 'embed');
  const displayLocation = location || apt.buildingDetails;
  const safeDisplayLocation = escapeHtml(displayLocation);
  const safeMapsUrl = escapeHtml(mapsUrl.href);
  const safeEmbedUrl = escapeHtml(embedUrl.href);

  const amenities = (apt.amenities || []).map(a => `<span class="amenity-tag">${a}</span>`).join('');

  content.innerHTML = `
    ${img}
    <div class="modal-body">
      <div class="modal-rent">₹${Number(apt.monthlyRent).toLocaleString('en-IN')}<small>/month</small></div>
      <div class="modal-title">${apt.buildingDetails}${apt.apartmentNumber ? ` — Unit ${apt.apartmentNumber}` : ''}</div>
      <a class="modal-location" href="${safeMapsUrl}" target="_blank" rel="noopener noreferrer">
        <i class="fa-solid fa-location-dot"></i><span>${safeDisplayLocation}</span>
        <span class="modal-location-action">Open in Google Maps</span>
      </a>
      <div class="modal-map-wrap">
        <iframe
          class="modal-map"
          src="${safeEmbedUrl}"
          title="Map showing ${safeDisplayLocation}"
          loading="lazy"
          referrerpolicy="no-referrer-when-downgrade"
          allowfullscreen>
        </iframe>
        ${location ? '' : '<p class="modal-map-note">Showing an approximate search from the building name. Add the full address or map coordinates in apartment details for a precise location.</p>'}
      </div>

      <div class="modal-specs">
        <div class="modal-spec"><i class="fa-solid fa-tag"></i>${apt.apartmentType}</div>
        ${apt.bedrooms ? `<div class="modal-spec"><i class="fa-solid fa-bed"></i>${apt.bedrooms} Bedroom${apt.bedrooms !== 1 ? 's' : ''}</div>` : ''}
        ${apt.bathrooms ? `<div class="modal-spec"><i class="fa-solid fa-shower"></i>${apt.bathrooms} Bathroom${apt.bathrooms !== 1 ? 's' : ''}</div>` : ''}
        ${apt.areaSqFt ? `<div class="modal-spec"><i class="fa-solid fa-vector-square"></i>${apt.areaSqFt} sqft</div>` : ''}
        ${apt.floorDetails ? `<div class="modal-spec"><i class="fa-solid fa-stairs"></i>${apt.floorDetails}</div>` : ''}
      </div>

      ${apt.description ? `
        <div class="modal-section-title">About this Property</div>
        <div class="modal-description">${apt.description}</div>
      ` : ''}

      ${amenities ? `
        <div class="modal-section-title">Amenities</div>
        <div class="modal-amenities">${amenities}</div>
      ` : ''}

      ${apt.securityDeposit ? `
        <div class="modal-section-title">Financial Details</div>
        <div class="modal-specs">
          <div class="modal-spec"><i class="fa-solid fa-money-bill-wave"></i>Deposit: ₹${Number(apt.securityDeposit).toLocaleString('en-IN')}</div>
        </div>
      ` : ''}

      ${apt.rentalPolicies ? `
        <div class="modal-section-title">Rental Policies</div>
        <div class="modal-description">${apt.rentalPolicies}</div>
      ` : ''}

      <div class="modal-cta">
        <a href="tenant-register.html" class="btn-primary"><i class="fa-solid fa-user-plus"></i> Register Interest</a>
        <a href="tenant-login.html" class="btn-outline"><i class="fa-solid fa-sign-in-alt"></i> Tenant Login</a>
        <a href="${mapsUrl}" class="map-link" target="_blank" rel="noopener"><i class="fa-solid fa-map-location-dot"></i> View on Map</a>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

document.getElementById('modalCloseBtn')?.addEventListener('click', closeModal);
document.getElementById('apartmentModal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('apartmentModal')) closeModal();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

function closeModal() {
  document.getElementById('apartmentModal')?.classList.add('hidden');
  document.body.style.overflow = '';
}

// ═══════════════════════════════════════════════════════════
// Search Controls
// ═══════════════════════════════════════════════════════════
function getSearchParams() {
  const sortVal = document.getElementById('sortSelect')?.value || 'newest';
  const sortMap = {
    'newest': { sortBy: 'newest', order: 'desc' },
    'rent-asc': { sortBy: 'rent', order: 'asc' },
    'rent-desc': { sortBy: 'rent', order: 'desc' },
  };
  const { sortBy, order } = sortMap[sortVal] || sortMap['newest'];

  return {
    search: currentSearch || undefined,
    minRent: currentFilters.minRent || undefined,
    maxRent: currentFilters.maxRent || undefined,
    bedrooms: currentFilters.bedrooms || undefined,
    type: currentFilters.type || undefined,
    sortBy,
    order,
  };
}

document.getElementById('heroSearchBtn')?.addEventListener('click', () => {
  currentSearch = document.getElementById('heroSearch')?.value.trim() || '';
  currentFilters = {};
  updateTitles();
  loadListings(getSearchParams());
  document.getElementById('search-section')?.scrollIntoView({ behavior: 'smooth' });
});

document.getElementById('heroSearch')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('heroSearchBtn')?.click();
});

document.querySelectorAll('.qf-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.qf-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    currentSearch = chip.dataset.city || '';
    document.getElementById('heroSearch').value = currentSearch;
    updateTitles();
    loadListings(getSearchParams());
    document.getElementById('search-section')?.scrollIntoView({ behavior: 'smooth' });
  });
});

document.getElementById('applyFiltersBtn')?.addEventListener('click', () => {
  currentFilters = {
    minRent: document.getElementById('filterMinRent')?.value || '',
    maxRent: document.getElementById('filterMaxRent')?.value || '',
    bedrooms: document.getElementById('filterBedrooms')?.value || '',
    type: document.getElementById('filterType')?.value || '',
  };
  currentSearch = document.getElementById('heroSearch')?.value.trim() || '';
  updateTitles();
  loadListings(getSearchParams());
  document.getElementById('search-section')?.scrollIntoView({ behavior: 'smooth' });
});

document.getElementById('clearFiltersBtn')?.addEventListener('click', () => {
  currentFilters = {};
  currentSearch = '';
  document.getElementById('heroSearch').value = '';
  document.getElementById('filterMinRent').value = '';
  document.getElementById('filterMaxRent').value = '';
  document.getElementById('filterBedrooms').value = '';
  document.getElementById('filterType').value = '';
  document.querySelectorAll('.qf-chip').forEach(c => c.classList.remove('active'));
  updateTitles();
  loadListings({});
});

document.getElementById('sortSelect')?.addEventListener('change', () => {
  renderListings(allListings); // Client-side re-sort for speed
  const sortVal = document.getElementById('sortSelect').value;
  if (sortVal === 'rent-asc') allListings.sort((a, b) => a.monthlyRent - b.monthlyRent);
  else if (sortVal === 'rent-desc') allListings.sort((a, b) => b.monthlyRent - a.monthlyRent);
  else allListings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  renderListings(allListings);
});

function updateTitles() {
  const titleEl = document.getElementById('searchResultsTitle');
  const subEl = document.getElementById('searchResultsSub');
  if (currentSearch && titleEl) {
    titleEl.textContent = `Results for "${currentSearch}"`;
    if (subEl) subEl.textContent = 'Showing matching properties';
  } else if (titleEl) {
    titleEl.textContent = 'Featured Properties';
    if (subEl) subEl.textContent = 'Handpicked apartments available right now';
  }
}

// ═══════════════════════════════════════════════════════════
// Contact Form
// ═══════════════════════════════════════════════════════════
document.getElementById('contactForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('contactError');
  const successEl = document.getElementById('contactSuccess');
  const btn = document.getElementById('contactSubmitBtn');
  if (errorEl) errorEl.classList.add('hidden');
  if (successEl) successEl.classList.add('hidden');

  const name = document.getElementById('cName')?.value.trim();
  const email = document.getElementById('cEmail')?.value.trim();
  const message = document.getElementById('cMessage')?.value.trim();

  if (!name || !email || !message) {
    if (errorEl) { errorEl.textContent = 'Please fill in all required fields.'; errorEl.classList.remove('hidden'); }
    return;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    if (errorEl) { errorEl.textContent = 'Please enter a valid email address.'; errorEl.classList.remove('hidden'); }
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending…';

  // Simulate submission (no backend endpoint for general contact — show success)
  await new Promise(r => setTimeout(r, 800));
  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Message';
  if (successEl) successEl.classList.remove('hidden');
  e.target.reset();
});

// ═══════════════════════════════════════════════════════════
// Footer year
// ═══════════════════════════════════════════════════════════
const fyEl = document.getElementById('footerYear');
if (fyEl) fyEl.textContent = new Date().getFullYear();

// ═══════════════════════════════════════════════════════════
// Smooth-scroll nav links
// ═══════════════════════════════════════════════════════════
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', (e) => {
    const target = document.querySelector(link.getAttribute('href'));
    if (target) {
      e.preventDefault();
      const offset = document.getElementById('siteHeader')?.offsetHeight || 72;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  });
});

// ═══════════════════════════════════════════════════════════
// Init
// ═══════════════════════════════════════════════════════════
loadListings({});
