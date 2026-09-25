/* ============================================================
   Expense & Budget Visualizer — app.js
   Features:
     MVP  : Add/delete transactions, total balance, pie chart,
            input validation, localStorage persistence
     Extra: Sort by amount/category/date, dark/light mode toggle,
            highlight spending over a set limit,
            allow custom categories
   ============================================================ */

// ──────────────────────────────────────────────
// 1. STATE
// ──────────────────────────────────────────────
let transactions = [];        // Array of { id, name, amount, category, date }
let customCategories = [];    // User-added category names
let spendingLimit = null;     // Numeric limit or null
let chartInstance = null;     // Chart.js instance

// Category colours for Chart.js (extended for custom cats)
const CATEGORY_COLORS = {
  Food: '#22c55e',
  Transport: '#3b82f6',
  Fun: '#f97316',
};
const EXTRA_COLORS = [
  '#a855f7', '#ec4899', '#14b8a6', '#eab308',
  '#6366f1', '#f43f5e', '#0ea5e9', '#84cc16',
];

// ──────────────────────────────────────────────
// 2. DOM REFERENCES
// ──────────────────────────────────────────────
const form           = document.getElementById('transactionForm');
const itemNameInput  = document.getElementById('itemName');
const amountInput    = document.getElementById('amount');
const categorySelect = document.getElementById('category');
const limitInput     = document.getElementById('spendingLimit');
const customCatGroup = document.getElementById('customCategoryGroup');
const customCatInput = document.getElementById('customCategory');

const totalBalanceEl = document.getElementById('totalBalance');
const transactionList = document.getElementById('transactionList');
const emptyState     = document.getElementById('emptyState');
const sortSelect     = document.getElementById('sortSelect');
const spendingAlert  = document.getElementById('spendingAlert');
const limitDisplay   = document.getElementById('limitDisplay');
const themeToggle    = document.getElementById('themeToggle');
const chartEmpty     = document.getElementById('chartEmpty');

// Field error spans
const itemNameError  = document.getElementById('itemNameError');
const amountError    = document.getElementById('amountError');
const categoryError  = document.getElementById('categoryError');

// ──────────────────────────────────────────────
// 3. PERSISTENCE (localStorage)
// ──────────────────────────────────────────────
function saveData() {
  localStorage.setItem('ebv_transactions',    JSON.stringify(transactions));
  localStorage.setItem('ebv_customCategories', JSON.stringify(customCategories));
  if (spendingLimit !== null) {
    localStorage.setItem('ebv_spendingLimit', spendingLimit.toString());
  } else {
    localStorage.removeItem('ebv_spendingLimit');
  }
}

function loadData() {
  const tx   = localStorage.getItem('ebv_transactions');
  const cats = localStorage.getItem('ebv_customCategories');
  const lim  = localStorage.getItem('ebv_spendingLimit');

  transactions      = tx   ? JSON.parse(tx)   : [];
  customCategories  = cats ? JSON.parse(cats) : [];
  spendingLimit     = lim  ? parseFloat(lim)  : null;

  // Restore limit input
  if (spendingLimit !== null) limitInput.value = spendingLimit;
}

// ──────────────────────────────────────────────
// 4. THEME (dark / light)
// ──────────────────────────────────────────────
function applyTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
  themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
}

function loadTheme() {
  const saved = localStorage.getItem('ebv_theme') || 'light';
  applyTheme(saved);
}

themeToggle.addEventListener('click', () => {
  const isDark = document.body.classList.contains('dark');
  const next   = isDark ? 'light' : 'dark';
  localStorage.setItem('ebv_theme', next);
  applyTheme(next);
  // Re-render chart so its colours adapt
  renderChart();
});

// ──────────────────────────────────────────────
// 5. CUSTOM CATEGORIES
// ──────────────────────────────────────────────
function rebuildCategoryOptions() {
  // Keep the default placeholder + 3 built-ins + custom ones
  const builtIns = ['Food', 'Transport', 'Fun'];

  // Remove all options except the first placeholder
  while (categorySelect.options.length > 1) {
    categorySelect.remove(1);
  }

  // Add built-ins
  builtIns.forEach(cat => {
    const opt = new Option(cat, cat);
    categorySelect.add(opt);
  });

  // Add custom categories
  customCategories.forEach(cat => {
    const opt = new Option(cat, cat);
    categorySelect.add(opt);
  });

  // Always add the "Add custom…" option at the end
  const addOpt = new Option('+ Add custom category…', '__custom__');
  categorySelect.add(addOpt);
}

categorySelect.addEventListener('change', () => {
  if (categorySelect.value === '__custom__') {
    customCatGroup.style.display = 'block';
    customCatInput.focus();
  } else {
    customCatGroup.style.display = 'none';
  }
});

// ──────────────────────────────────────────────
// 6. VALIDATION
// ──────────────────────────────────────────────
function clearErrors() {
  [itemNameInput, amountInput, categorySelect].forEach(el => el.classList.remove('error'));
  itemNameError.textContent = '';
  amountError.textContent   = '';
  categoryError.textContent = '';
}

function validate() {
  clearErrors();
  let valid = true;

  const name = itemNameInput.value.trim();
  const amt  = parseFloat(amountInput.value);
  let   cat  = categorySelect.value;

  if (!name) {
    itemNameInput.classList.add('error');
    itemNameError.textContent = 'Item name is required.';
    valid = false;
  }

  if (!amountInput.value || isNaN(amt) || amt <= 0) {
    amountInput.classList.add('error');
    amountError.textContent = 'Enter a valid amount greater than 0.';
    valid = false;
  }

  // Handle custom category flow
  if (cat === '__custom__') {
    const newCat = customCatInput.value.trim();
    if (!newCat) {
      categorySelect.classList.add('error');
      categoryError.textContent = 'Enter a name for the new category.';
      valid = false;
    } else {
      // Register custom category if new
      if (!customCategories.includes(newCat)) {
        customCategories.push(newCat);
        rebuildCategoryOptions();
        saveData();
      }
      cat = newCat;
    }
  } else if (!cat) {
    categorySelect.classList.add('error');
    categoryError.textContent = 'Please select a category.';
    valid = false;
  }

  return valid ? { name, amount: amt, category: cat } : null;
}

// ──────────────────────────────────────────────
// 7. ADD TRANSACTION
// ──────────────────────────────────────────────
form.addEventListener('submit', (e) => {
  e.preventDefault();

  const result = validate();
  if (!result) return;

  const tx = {
    id:       Date.now(),
    name:     result.name,
    amount:   result.amount,
    category: result.category,
    date:     new Date().toISOString(),
  };

  transactions.push(tx);

  // Update spending limit from input (allow changing on every add)
  const limVal = parseFloat(limitInput.value);
  spendingLimit = (!isNaN(limVal) && limVal > 0) ? limVal : null;

  saveData();
  renderAll();

  // Reset form
  form.reset();
  customCatGroup.style.display = 'none';
  clearErrors();
});

// ──────────────────────────────────────────────
// 8. DELETE TRANSACTION
// ──────────────────────────────────────────────
function deleteTransaction(id) {
  transactions = transactions.filter(tx => tx.id !== id);
  saveData();
  renderAll();
}

// ──────────────────────────────────────────────
// 9. SORT
// ──────────────────────────────────────────────
function getSortedTransactions() {
  const mode = sortSelect.value;
  const arr  = [...transactions];

  switch (mode) {
    case 'newest':      return arr.sort((a, b) => b.id - a.id);
    case 'oldest':      return arr.sort((a, b) => a.id - b.id);
    case 'amount-desc': return arr.sort((a, b) => b.amount - a.amount);
    case 'amount-asc':  return arr.sort((a, b) => a.amount - b.amount);
    case 'category':    return arr.sort((a, b) => a.category.localeCompare(b.category));
    default:            return arr;
  }
}

sortSelect.addEventListener('change', renderAll);

// ──────────────────────────────────────────────
// 10. RENDER: BALANCE
// ──────────────────────────────────────────────
function renderBalance() {
  const total = transactions.reduce((sum, tx) => sum + tx.amount, 0);
  totalBalanceEl.textContent = formatCurrency(total);

  // Spending limit alert
  if (spendingLimit !== null && total > spendingLimit) {
    limitDisplay.textContent = formatCurrency(spendingLimit);
    spendingAlert.classList.remove('alert-hidden');
  } else {
    spendingAlert.classList.add('alert-hidden');
  }
}

// ──────────────────────────────────────────────
// 11. RENDER: TRANSACTION LIST
// ──────────────────────────────────────────────
function renderList() {
  const sorted = getSortedTransactions();

  if (sorted.length === 0) {
    transactionList.innerHTML = '<li class="empty-state" id="emptyState">No transactions yet. Add one above!</li>';
    return;
  }

  const total = transactions.reduce((sum, tx) => sum + tx.amount, 0);

  transactionList.innerHTML = sorted.map(tx => {
    const isOverLimit = spendingLimit !== null && total > spendingLimit;
    const overClass   = isOverLimit ? ' over-limit' : '';

    // Determine badge class
    const builtIns = ['Food', 'Transport', 'Fun'];
    const badgeClass = builtIns.includes(tx.category)
      ? `badge-${tx.category}`
      : 'badge-custom';

    return `
      <li class="transaction-item${overClass}" data-id="${tx.id}">
        <div class="tx-info">
          <div class="tx-name">${escapeHtml(tx.name)}</div>
          <div class="tx-amount">${formatCurrency(tx.amount)}</div>
          <span class="tx-badge ${badgeClass}">${escapeHtml(tx.category)}</span>
        </div>
        <button class="btn btn-danger" onclick="deleteTransaction(${tx.id})" aria-label="Delete ${escapeHtml(tx.name)}">
          Delete
        </button>
      </li>
    `;
  }).join('');
}

// ──────────────────────────────────────────────
// 12. RENDER: PIE CHART
// ──────────────────────────────────────────────
function renderChart() {
  const ctx = document.getElementById('spendingChart').getContext('2d');

  if (transactions.length === 0) {
    chartEmpty.style.display = 'block';
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    return;
  }

  chartEmpty.style.display = 'none';

  // Aggregate by category
  const totals = {};
  transactions.forEach(tx => {
    totals[tx.category] = (totals[tx.category] || 0) + tx.amount;
  });

  const labels = Object.keys(totals);
  const data   = Object.values(totals);
  const colors = labels.map((label, i) => {
    if (CATEGORY_COLORS[label]) return CATEGORY_COLORS[label];
    return EXTRA_COLORS[i % EXTRA_COLORS.length];
  });

  // Determine text colour for legend based on theme
  const isDark    = document.body.classList.contains('dark');
  const textColor = isDark ? '#94a3b8' : '#5a6070';

  if (chartInstance) {
    // Update existing chart
    chartInstance.data.labels           = labels;
    chartInstance.data.datasets[0].data = data;
    chartInstance.data.datasets[0].backgroundColor = colors;
    chartInstance.options.plugins.legend.labels.color = textColor;
    chartInstance.update();
  } else {
    // Create new chart
    chartInstance = new Chart(ctx, {
      type: 'pie',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: isDark ? '#1a1d27' : '#ffffff',
          hoverOffset: 8,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color:    textColor,
              padding:  12,
              font:     { size: 12 },
              usePointStyle: true,
            },
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const value = context.parsed;
                const sum   = context.dataset.data.reduce((a, b) => a + b, 0);
                const pct   = sum > 0 ? ((value / sum) * 100).toFixed(1) : 0;
                return ` ${context.label}: ${formatCurrency(value)} (${pct}%)`;
              },
            },
          },
        },
      },
    });
  }
}

// ──────────────────────────────────────────────
// 13. RENDER ALL
// ──────────────────────────────────────────────
function renderAll() {
  renderBalance();
  renderList();
  renderChart();
}

// ──────────────────────────────────────────────
// 14. UTILITIES
// ──────────────────────────────────────────────
function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ──────────────────────────────────────────────
// 15. INIT
// ──────────────────────────────────────────────
function init() {
  loadData();
  loadTheme();
  rebuildCategoryOptions();
  renderAll();
}

init();
