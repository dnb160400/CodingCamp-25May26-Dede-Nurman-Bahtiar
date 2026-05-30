/**
 * ============================================================
 * Expense & Budget Visualizer
 * Vanilla JS | LocalStorage | Chart.js
 * ============================================================
 */

// ============================================================
// CONSTANTS & STATE
// ============================================================

const STORAGE_KEY_TRANSACTIONS = 'ebv_transactions';
const STORAGE_KEY_CATEGORIES   = 'ebv_custom_categories';
const STORAGE_KEY_THEME        = 'ebv_theme';
const STORAGE_KEY_SORT         = 'ebv_sort';

/** Default built-in categories */
const DEFAULT_CATEGORIES = ['Food', 'Transport', 'Fun'];

/** Chart.js color palette — cycles for custom categories */
const CHART_COLORS = [
  '#4361ee', '#f72585', '#4cc9f0', '#7209b7',
  '#3a0ca3', '#4895ef', '#560bad', '#f3722c',
  '#f8961e', '#90be6d', '#43aa8b', '#577590'
];

/** Application state */
let transactions    = [];   // Array of transaction objects
let customCategories = [];  // Array of custom category strings
let chartInstance   = null; // Chart.js instance reference

// ============================================================
// DOM REFERENCES
// ============================================================

const form            = document.getElementById('transactionForm');
const itemNameInput   = document.getElementById('itemName');
const amountInput     = document.getElementById('amount');
const categorySelect  = document.getElementById('category');
const totalBalanceEl  = document.getElementById('totalBalance');
const transactionList = document.getElementById('transactionList');
const listEmpty       = document.getElementById('listEmpty');
const chartCanvas     = document.getElementById('spendingChart');
const chartEmpty      = document.getElementById('chartEmpty');
const themeToggle     = document.getElementById('themeToggle');
const sortSelect      = document.getElementById('sortBy');

// Custom category elements
const toggleCustomCat = document.getElementById('toggleCustomCat');
const customCatForm   = document.getElementById('customCatForm');
const customCatInput  = document.getElementById('customCatInput');
const saveCustomCat   = document.getElementById('saveCustomCat');
const customCatError  = document.getElementById('customCatError');

// ============================================================
// LOCAL STORAGE HELPERS
// ============================================================

/** Load all persisted data from LocalStorage */
function loadFromStorage() {
  const storedTx   = localStorage.getItem(STORAGE_KEY_TRANSACTIONS);
  const storedCats = localStorage.getItem(STORAGE_KEY_CATEGORIES);
  const storedTheme = localStorage.getItem(STORAGE_KEY_THEME);
  const storedSort  = localStorage.getItem(STORAGE_KEY_SORT);

  transactions     = storedTx   ? JSON.parse(storedTx)   : [];
  customCategories = storedCats ? JSON.parse(storedCats) : [];

  // Restore theme
  if (storedTheme) {
    document.documentElement.setAttribute('data-theme', storedTheme);
    themeToggle.textContent = storedTheme === 'dark' ? '☀️' : '🌙';
  }

  // Restore sort preference
  if (storedSort) sortSelect.value = storedSort;
}

/** Persist transactions to LocalStorage */
function saveTransactions() {
  localStorage.setItem(STORAGE_KEY_TRANSACTIONS, JSON.stringify(transactions));
}

/** Persist custom categories to LocalStorage */
function saveCustomCategories() {
  localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(customCategories));
}

// ============================================================
// CATEGORY MANAGEMENT
// ============================================================

/** Rebuild the category <select> with built-in + custom categories */
function renderCategoryOptions() {
  const allCategories = [...DEFAULT_CATEGORIES, ...customCategories];

  // Keep the placeholder option, replace the rest
  categorySelect.innerHTML = '<option value="">-- Select Category --</option>';

  allCategories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    categorySelect.appendChild(opt);
  });
}

/** Add a new custom category */
function addCustomCategory(name) {
  const trimmed = name.trim();

  // Validate: not empty
  if (!trimmed) {
    showCustomCatError('Please enter a category name.');
    return false;
  }

  // Validate: not duplicate (case-insensitive)
  const allCats = [...DEFAULT_CATEGORIES, ...customCategories];
  if (allCats.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
    showCustomCatError('This category already exists.');
    return false;
  }

  customCategories.push(trimmed);
  saveCustomCategories();
  renderCategoryOptions();
  return true;
}

function showCustomCatError(msg) {
  customCatError.textContent = msg;
  setTimeout(() => { customCatError.textContent = ''; }, 3000);
}

// ============================================================
// FORM VALIDATION
// ============================================================

/**
 * Validate the transaction form.
 * Returns true if valid, false otherwise.
 */
function validateForm() {
  let valid = true;

  // Clear previous errors
  clearErrors();

  const name   = itemNameInput.value.trim();
  const amount = amountInput.value.trim();
  const cat    = categorySelect.value;

  if (!name) {
    showError('itemNameError', 'itemName', 'Item name is required.');
    valid = false;
  } else if (name.length > 60) {
    showError('itemNameError', 'itemName', 'Item name must be 60 characters or less.');
    valid = false;
  }

  if (!amount) {
    showError('amountError', 'amount', 'Amount is required.');
    valid = false;
  } else if (isNaN(amount) || Number(amount) <= 0) {
    showError('amountError', 'amount', 'Please enter a valid positive amount.');
    valid = false;
  }

  if (!cat) {
    showError('categoryError', 'category', 'Please select a category.');
    valid = false;
  }

  return valid;
}

function showError(errorId, inputId, message) {
  document.getElementById(errorId).textContent = message;
  document.getElementById(inputId).classList.add('input--error');
}

function clearErrors() {
  ['itemNameError', 'amountError', 'categoryError'].forEach(id => {
    document.getElementById(id).textContent = '';
  });
  [itemNameInput, amountInput, categorySelect].forEach(el => {
    el.classList.remove('input--error');
  });
}

// ============================================================
// TRANSACTION CRUD
// ============================================================

/**
 * Create a new transaction object.
 * @param {string} name
 * @param {number} amount
 * @param {string} category
 * @returns {Object} transaction
 */
function createTransaction(name, amount, category) {
  return {
    id:        Date.now().toString(),   // unique ID
    name:      name.trim(),
    amount:    Number(amount),
    category,
    createdAt: Date.now()
  };
}

/** Add a transaction to state and persist */
function addTransaction(name, amount, category) {
  const tx = createTransaction(name, amount, category);
  transactions.push(tx);
  saveTransactions();
  refreshUI();
}

/** Delete a transaction by ID */
function deleteTransaction(id) {
  transactions = transactions.filter(tx => tx.id !== id);
  saveTransactions();
  refreshUI();
}

// ============================================================
// SORTING
// ============================================================

/**
 * Return a sorted copy of transactions based on current sort selection.
 * Does NOT mutate the original array.
 */
function getSortedTransactions() {
  const sortVal = sortSelect.value;
  const copy    = [...transactions];

  switch (sortVal) {
    case 'date-asc':
      return copy.sort((a, b) => a.createdAt - b.createdAt);
    case 'date-desc':
      return copy.sort((a, b) => b.createdAt - a.createdAt);
    case 'amount-asc':
      return copy.sort((a, b) => a.amount - b.amount);
    case 'amount-desc':
      return copy.sort((a, b) => b.amount - a.amount);
    case 'category-asc':
      return copy.sort((a, b) => a.category.localeCompare(b.category));
    case 'category-desc':
      return copy.sort((a, b) => b.category.localeCompare(a.category));
    default:
      return copy;
  }
}

// ============================================================
// CURRENCY FORMATTER
// ============================================================

/**
 * Format a number as Indonesian Rupiah.
 * @param {number} amount
 * @returns {string} e.g. "Rp 25.000"
 */
function formatRupiah(amount) {
  return 'Rp ' + amount.toLocaleString('id-ID');
}

// ============================================================
// CATEGORY BADGE HELPER
// ============================================================

/**
 * Return the CSS class for a category badge.
 * @param {string} category
 * @returns {string}
 */
function getBadgeClass(category) {
  switch (category.toLowerCase()) {
    case 'food':      return 'badge--food';
    case 'transport': return 'badge--transport';
    case 'fun':       return 'badge--fun';
    default:          return 'badge--custom';
  }
}

// ============================================================
// RENDER — TRANSACTION LIST
// ============================================================

/** Render the transaction list to the DOM */
function renderTransactionList() {
  const sorted = getSortedTransactions();

  transactionList.innerHTML = '';

  if (sorted.length === 0) {
    listEmpty.classList.remove('hidden');
    return;
  }

  listEmpty.classList.add('hidden');

  sorted.forEach(tx => {
    const li = document.createElement('li');
    li.className = 'transaction-item';
    li.dataset.id = tx.id;

    li.innerHTML = `
      <div class="transaction-info">
        <p class="transaction-name">${escapeHTML(tx.name)}</p>
        <div class="transaction-meta">
          <span class="transaction-amount">${formatRupiah(tx.amount)}</span>
          <span class="category-badge ${getBadgeClass(tx.category)}">${escapeHTML(tx.category)}</span>
        </div>
      </div>
      <button class="btn btn--danger delete-btn" aria-label="Delete ${escapeHTML(tx.name)}">
        🗑 Delete
      </button>
    `;

    transactionList.appendChild(li);
  });
}

// ============================================================
// RENDER — TOTAL BALANCE
// ============================================================

/** Calculate and display total spending */
function render
// ============================================================
// RENDER — TOTAL BALANCE
// ============================================================

/** Calculate and display total spending */
function renderTotalBalance() {
  const total = transactions.reduce((sum, tx) => sum + tx.amount, 0);
  totalBalanceEl.textContent = formatRupiah(total);
}

// ============================================================
// RENDER — PIE CHART
// ============================================================

/**
 * Aggregate spending totals per category.
 * @returns {{ labels: string[], data: number[], colors: string[] }}
 */
function getChartData() {
  const totals = {};

  transactions.forEach(tx => {
    totals[tx.category] = (totals[tx.category] || 0) + tx.amount;
  });

  const labels = Object.keys(totals);
  const data   = Object.values(totals);

  // Assign colors: built-in categories get fixed colors, custom ones cycle
  const colorMap = {
    'Food':      '#f8961e',
    'Transport': '#4361ee',
    'Fun':       '#2dc653'
  };

  const colors = labels.map((label, i) => {
    return colorMap[label] || CHART_COLORS[i % CHART_COLORS.length];
  });

  return { labels, data, colors };
}

/** Create or update the Chart.js pie chart */
function renderChart() {
  const { labels, data, colors } = getChartData();
  const hasData = data.length > 0;

  // Show/hide empty state message
  chartEmpty.classList.toggle('hidden', hasData);
  chartCanvas.classList.toggle('hidden', !hasData);

  if (!hasData) {
    // Destroy existing chart if no data
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    return;
  }

  if (chartInstance) {
    // Update existing chart data (avoids full re-render flicker)
    chartInstance.data.labels              = labels;
    chartInstance.data.datasets[0].data   = data;
    chartInstance.data.datasets[0].backgroundColor = colors;
    chartInstance.update();
  } else {
    // Create new chart instance
    chartInstance = new Chart(chartCanvas, {
      type: 'pie',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor:   colors,
          borderColor:       '#ffffff',
          borderWidth:       2,
          hoverOffset:       8
        }]
      },
      options: {
        responsive:          true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding:   16,
              font:      { size: 13 },
              color:     getComputedStyle(document.documentElement)
                           .getPropertyValue('--text-primary').trim()
            }
          },
          tooltip: {
            callbacks: {
              // Show Rupiah format in tooltip
              label: function(context) {
                const value = context.parsed;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const pct   = ((value / total) * 100).toFixed(1);
                return ` ${formatRupiah(value)} (${pct}%)`;
              }
            }
          }
        }
      }
    });
  }
}

// ============================================================
// MASTER REFRESH — call after every state change
// ============================================================

/** Re-render all UI components */
function refreshUI() {
  renderTotalBalance();
  renderTransactionList();
  renderChart();
}

// ============================================================
// SECURITY HELPER
// ============================================================

/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHTML(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// ============================================================
// EVENT LISTENERS
// ============================================================

/** Handle form submission — add transaction */
form.addEventListener('submit', function(e) {
  e.preventDefault();

  if (!validateForm()) return;

  const name     = itemNameInput.value.trim();
  const amount   = amountInput.value.trim();
  const category = categorySelect.value;

  addTransaction(name, amount, category);

  // Reset form fields after successful add
  form.reset();
  clearErrors();
});

/** Clear individual field errors on input */
itemNameInput.addEventListener('input', () => {
  document.getElementById('itemNameError').textContent = '';
  itemNameInput.classList.remove('input--error');
});

amountInput.addEventListener('input', () => {
  document.getElementById('amountError').textContent = '';
  amountInput.classList.remove('input--error');
});

categorySelect.addEventListener('change', () => {
  document.getElementById('categoryError').textContent = '';
  categorySelect.classList.remove('input--error');
});

/** Handle delete button clicks via event delegation */
transactionList.addEventListener('click', function(e) {
  const deleteBtn = e.target.closest('.delete-btn');
  if (!deleteBtn) return;

  const li = deleteBtn.closest('.transaction-item');
  if (!li) return;

  const id = li.dataset.id;

  // Animate out before removing
  li.style.transition = 'opacity .2s ease, transform .2s ease';
  li.style.opacity    = '0';
  li.style.transform  = 'translateX(20px)';

  setTimeout(() => deleteTransaction(id), 200);
});

/** Handle sort change */
sortSelect.addEventListener('change', function() {
  localStorage.setItem(STORAGE_KEY_SORT, this.value);
  renderTransactionList(); // only re-render list, no data change
});

/** Handle dark/light mode toggle */
themeToggle.addEventListener('click', function() {
  const html        = document.documentElement;
  const currentTheme = html.getAttribute('data-theme');
  const newTheme    = currentTheme === 'dark' ? 'light' : 'dark';

  html.setAttribute('data-theme', newTheme);
  this.textContent = newTheme === 'dark' ? '☀️' : '🌙';

  // Persist theme preference
  localStorage.setItem(STORAGE_KEY_THEME, newTheme);

  // Re-render chart so legend text color updates
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
  renderChart();
});

/** Toggle custom category form visibility */
toggleCustomCat.addEventListener('click', function() {
  customCatForm.classList.toggle('hidden');
  if (!customCatForm.classList.contains('hidden')) {
    customCatInput.focus();
  }
});

/** Save custom category */
saveCustomCat.addEventListener('click', function() {
  const name = customCatInput.value;
  const ok   = addCustomCategory(name);

  if (ok) {
    customCatInput.value = '';
    customCatForm.classList.add('hidden');
  }
});

/** Allow pressing Enter in custom category input */
customCatInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    saveCustomCat.click();
  }
});

// ============================================================
// INIT — run on page load
// ============================================================

(function init() {
  loadFromStorage();        // 1. Load persisted data
  renderCategoryOptions();  // 2. Build category dropdown
  refreshUI();              // 3. Render all UI sections
})();
