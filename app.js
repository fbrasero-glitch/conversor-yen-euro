// State Management
let state = {
  activeCurrency: 'EUR', // Currency currently being edited
  rates: {
    EUR: 1.0,
    JPY: 168.45 // Hardcoded fallback baseline rate
  },
  rateTimestamp: null,
  isOffline: false,
  inputs: {
    EUR: '0',
    JPY: '0'
  }
};

const MAX_DIGITS = 9;

// DOM Elements (Initialized in init)
let elements = {};

// Start the application safely
function init() {
  elements = {
    rowEUR: document.getElementById('row-EUR'),
    rowJPY: document.getElementById('row-JPY'),
    valEUR: document.getElementById('val-EUR'),
    valJPY: document.getElementById('val-JPY'),
    cursorEUR: document.getElementById('cursor-EUR'),
    cursorJPY: document.getElementById('cursor-JPY'),
    ratePreview: document.getElementById('rate-preview'),
    statusPill: document.getElementById('status-pill'),
    statusText: document.getElementById('status-text'),
    refreshBtn: document.getElementById('refresh-btn'),
    keypad: document.querySelector('.keypad-container')
  };

  initNetworkStatus();
  loadCachedRates();
  setupEventListeners();
  fetchRates();
  registerServiceWorker();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Register PWA Service Worker
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('Service Worker registrado con éxito:', reg.scope))
      .catch(err => console.error('Error al registrar Service Worker:', err));
  }
}

// Check network status & bind listeners
function initNetworkStatus() {
  state.isOffline = !navigator.onLine;
  updateNetworkUI();

  window.addEventListener('online', () => {
    state.isOffline = false;
    updateNetworkUI();
    fetchRates(); // Automatically update rates when reconnected
  });

  window.addEventListener('offline', () => {
    state.isOffline = true;
    updateNetworkUI();
  });
}

function updateNetworkUI() {
  if (state.isOffline) {
    elements.statusPill.classList.add('offline');
    let timeStr = '';
    if (state.rateTimestamp) {
      const date = new Date(state.rateTimestamp);
      timeStr = ` (${date.getDate()}/${date.getMonth()+1} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')})`;
    }
    elements.statusText.textContent = `Sin conexión${timeStr}`;
  } else {
    elements.statusPill.classList.remove('offline');
    elements.statusText.textContent = 'Actualizado';
  }
}

// Load cached rates from LocalStorage
function loadCachedRates() {
  const cachedRate = localStorage.getItem('eur_jpy_rate');
  const cachedTimestamp = localStorage.getItem('eur_jpy_timestamp');

  if (cachedRate) {
    state.rates.JPY = parseFloat(cachedRate);
  }
  if (cachedTimestamp) {
    state.rateTimestamp = parseInt(cachedTimestamp, 10);
  }
  updateRatesUI();
  recalculateConversion();
}

// Save rates to LocalStorage
function cacheRates(rate) {
  state.rates.JPY = rate;
  state.rateTimestamp = Date.now();
  localStorage.setItem('eur_jpy_rate', rate.toString());
  localStorage.setItem('eur_jpy_timestamp', state.rateTimestamp.toString());
  updateRatesUI();
  updateNetworkUI();
}

// Fetch exchange rates from public API
async function fetchRates() {
  if (state.isOffline) return;

  elements.refreshBtn.classList.add('spinning');
  elements.statusText.textContent = 'Actualizando...';

  // Attempt Primary API (Frankfurter)
  try {
    const response = await fetch('https://api.frankfurter.app/latest?from=EUR&to=JPY');
    if (!response.ok) throw new Error('Frankfurter API failed');
    const data = await response.json();
    if (data && data.rates && data.rates.JPY) {
      cacheRates(data.rates.JPY);
      recalculateConversion();
      finishFetchAnimation();
      return;
    }
  } catch (err) {
    console.warn('Fallo Frankfurter API, intentando API de respaldo...', err);
  }

  // Attempt Fallback API (ExchangeRate-API)
  try {
    const response = await fetch('https://open.er-api.com/v6/latest/EUR');
    if (!response.ok) throw new Error('ExchangeRate-API failed');
    const data = await response.json();
    if (data && data.rates && data.rates.JPY) {
      cacheRates(data.rates.JPY);
      recalculateConversion();
      finishFetchAnimation();
      return;
    }
  } catch (err) {
    console.error('Ambas APIs fallaron:', err);
    elements.statusText.textContent = 'Error al actualizar';
  }

  finishFetchAnimation();
}

function finishFetchAnimation() {
  setTimeout(() => {
    elements.refreshBtn.classList.remove('spinning');
    updateNetworkUI();
  }, 600);
}

// Update currency exchange labels
function updateRatesUI() {
  const rate = state.rates.JPY;
  elements.ratePreview.textContent = `1 EUR = ${rate.toFixed(2)} JPY`;
}

// Setup tactile & pointer events
function setupEventListeners() {
  // Currency Row Clicks (Swap focus)
  elements.rowEUR.addEventListener('click', () => setActiveCurrency('EUR'));
  elements.rowJPY.addEventListener('click', () => setActiveCurrency('JPY'));

  // Keyboard button click handling
  elements.keypad.addEventListener('click', (e) => {
    const button = e.target.closest('.key');
    if (!button) return;

    // Trigger visual click ripple effect if supported (managed by css active state)
    // Read actions
    const val = button.dataset.value;
    const id = button.id;

    if (val !== undefined) {
      handleNumericInput(val);
    } else if (id === 'key-AC') {
      handleClear();
    } else if (id === 'key-backspace') {
      handleBackspace();
    } else if (id === 'key-swap') {
      toggleCurrencyDirection();
    }
  });

  // Manual update rate
  elements.refreshBtn.addEventListener('click', () => {
    if (!elements.refreshBtn.classList.contains('spinning')) {
      fetchRates();
    }
  });

  // Keyboard support for desktop testing
  document.addEventListener('keydown', (e) => {
    if (e.key >= '0' && e.key <= '9') {
      handleNumericInput(e.key);
    } else if (e.key === '.' || e.key === ',') {
      handleNumericInput('.');
    } else if (e.key === 'Backspace') {
      handleBackspace();
    } else if (e.key === 'Escape' || e.key === 'c' || e.key === 'C') {
      handleClear();
    } else if (e.key === 's' || e.key === 'S') {
      toggleCurrencyDirection();
    }
  });
}

// Change active currency focus
function setActiveCurrency(currency) {
  if (state.activeCurrency === currency) return;
  
  state.activeCurrency = currency;
  
  if (currency === 'EUR') {
    elements.rowEUR.classList.add('active');
    elements.rowJPY.classList.remove('active');
    elements.cursorEUR.style.display = 'inline-block';
    elements.cursorJPY.style.display = 'none';
  } else {
    elements.rowJPY.classList.add('active');
    elements.rowEUR.classList.remove('active');
    elements.cursorJPY.style.display = 'inline-block';
    elements.cursorEUR.style.display = 'none';
  }
}

// Swap currency active row
function toggleCurrencyDirection() {
  setActiveCurrency(state.activeCurrency === 'EUR' ? 'JPY' : 'EUR');
}

// Handle numeric input and character limitations
function handleNumericInput(value) {
  let currentVal = state.inputs[state.activeCurrency];

  // Block decimals completely for JPY
  if (state.activeCurrency === 'JPY' && value === '.') return;

  // Block more than 2 decimal places for EUR
  if (state.activeCurrency === 'EUR' && value !== '.') {
    if (currentVal.includes('.')) {
      const decimals = currentVal.split('.')[1];
      if (decimals && decimals.length >= 2) return;
    }
  }

  // Count current digits to prevent layout breakage
  const digitCount = currentVal.replace(/[^0-9]/g, '').length;
  if (digitCount >= MAX_DIGITS && value !== '.') return;

  if (value === '.') {
    if (currentVal.includes('.')) return; // Only one decimal point allowed
    currentVal = currentVal + '.';
  } else {
    // Normal numeric digit
    if (currentVal === '0') {
      currentVal = value; // Replace leading zero
    } else {
      currentVal = currentVal + value;
    }
  }

  state.inputs[state.activeCurrency] = currentVal;
  updateDisplayUI();
  recalculateConversion();
}

// Reset calculations
function handleClear() {
  state.inputs.EUR = '0';
  state.inputs.JPY = '0';
  updateDisplayUI();
}

// Truncate last typed character
function handleBackspace() {
  let currentVal = state.inputs[state.activeCurrency];
  
  if (currentVal.length <= 1) {
    currentVal = '0';
  } else {
    currentVal = currentVal.slice(0, -1);
  }

  state.inputs[state.activeCurrency] = currentVal;
  updateDisplayUI();
  recalculateConversion();
}

// Core business logic: recalculate conversion rates
function recalculateConversion() {
  const active = state.activeCurrency;
  const passive = active === 'EUR' ? 'JPY' : 'EUR';
  const activeValStr = state.inputs[active];
  
  const activeValFloat = parseFloat(activeValStr);

  if (isNaN(activeValFloat) || activeValFloat === 0) {
    state.inputs[passive] = '0';
    updatePassiveUI('0');
    return;
  }

  const rate = state.rates.JPY;
  let passiveValFloat;

  if (active === 'EUR') {
    // EUR to JPY: Round to whole Yen
    passiveValFloat = Math.round(activeValFloat * rate);
    state.inputs[passive] = passiveValFloat.toString();
  } else {
    // JPY to EUR: Round to exactly 2 decimal places
    passiveValFloat = Math.round((activeValFloat / rate) * 100) / 100;
    state.inputs[passive] = passiveValFloat.toFixed(2);
  }

  updatePassiveUI(formatConvertedValue(passiveValFloat, passive));
}

// Limit precision to avoid layout breaking when converting long numbers
function limitPrecision(val) {
  if (val === 0) return '0';
  let str = val.toString();
  if (str.length <= MAX_DIGITS) return str;

  if (str.includes('.')) {
    const intPart = str.split('.')[0];
    if (intPart.length >= MAX_DIGITS) {
      return Math.round(val).toString();
    }
    const allowedDecimals = MAX_DIGITS - intPart.length - 1;
    if (allowedDecimals > 0) {
      let fixed = val.toFixed(allowedDecimals);
      return parseFloat(fixed).toString();
    } else {
      return Math.round(val).toString();
    }
  }
  return str.slice(0, MAX_DIGITS);
}

// Format the converted value elegantly based on currency type
function formatConvertedValue(val, currency) {
  if (isNaN(val) || val === 0) return '0';
  
  if (currency === 'JPY') {
    // JPY always formatted as an integer (0 decimals)
    return Math.round(val).toLocaleString('ja-JP', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  } else {
    // EUR always formatted with exactly 2 decimals
    return val.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}

// Format raw keyboard input string with thousand separators
function formatActiveInput(inputStr) {
  if (inputStr === '') return '0';
  if (inputStr === '.') return '0.';
  if (inputStr === '-') return '-';

  const parts = inputStr.split('.');
  const integerPart = parts[0];
  const hasDecimal = inputStr.includes('.');
  const decimalPart = parts[1] || '';

  let formattedInteger = '0';
  if (integerPart !== '' && integerPart !== '-') {
    // Format integer using locale without fractions
    formattedInteger = parseFloat(integerPart).toLocaleString(undefined, { maximumFractionDigits: 0 });
  } else if (integerPart === '-') {
    formattedInteger = '-';
  }

  return formattedInteger + (hasDecimal ? '.' + decimalPart : '');
}

// Update the active currency field with raw typed formatting
function updateDisplayUI() {
  const active = state.activeCurrency;
  const activeEl = active === 'EUR' ? elements.valEUR : elements.valJPY;
  
  activeEl.textContent = formatActiveInput(state.inputs[active]);
}

// Update the converted/passive currency field with clean results
function updatePassiveUI(formattedValue) {
  const passive = state.activeCurrency === 'EUR' ? 'JPY' : 'EUR';
  const passiveEl = passive === 'EUR' ? elements.valEUR : elements.valJPY;
  
  passiveEl.textContent = formattedValue;
}
