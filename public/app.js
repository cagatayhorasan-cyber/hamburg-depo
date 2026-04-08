const currency = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

const numberFormat = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const today = new Date().toISOString().split("T")[0];

const state = {
  user: null,
  summary: null,
  activeTab: "quotes",
  items: [],
  archivedItems: [],
  movements: [],
  expenses: [],
  cashbook: [],
  users: [],
  filters: {
    search: "",
    brand: "all",
    category: "all",
  },
  quoteDraft: [],
  quoteFilters: {
    search: "",
    brand: "all",
    category: "all",
  },
  assistantLanguage: "tr",
  assistantMessages: [],
};

const refs = {
  loginScreen: document.getElementById("loginScreen"),
  appScreen: document.getElementById("appScreen"),
  loginForm: document.getElementById("loginForm"),
  loginError: document.getElementById("loginError"),
  welcomeText: document.getElementById("welcomeText"),
  statsGrid: document.getElementById("statsGrid"),
  itemForm: document.getElementById("itemForm"),
  movementForm: document.getElementById("movementForm"),
  expenseForm: document.getElementById("expenseForm"),
  cashForm: document.getElementById("cashForm"),
  userForm: document.getElementById("userForm"),
  bulkPricingForm: document.getElementById("bulkPricingForm"),
  itemsTableBody: document.getElementById("itemsTableBody"),
  itemsSummary: document.getElementById("itemsSummary"),
  stockedItemsSummary: document.getElementById("stockedItemsSummary"),
  stockedItemsList: document.getElementById("stockedItemsList"),
  archiveTableBody: document.getElementById("archiveTableBody"),
  archiveSummary: document.getElementById("archiveSummary"),
  movementsTableBody: document.getElementById("movementsTableBody"),
  expensesTableBody: document.getElementById("expensesTableBody"),
  cashbookTableBody: document.getElementById("cashbookTableBody"),
  usersTableBody: document.getElementById("usersTableBody"),
  barcodeItemSelect: document.getElementById("barcodeItemSelect"),
  barcodeImage: document.getElementById("barcodeImage"),
  logoutButton: document.getElementById("logoutButton"),
  downloadXlsx: document.getElementById("downloadXlsx"),
  downloadPdf: document.getElementById("downloadPdf"),
  itemSearch: document.getElementById("itemSearch"),
  itemSearchSuggestions: document.getElementById("itemSearchSuggestions"),
  itemSearchDropdown: document.getElementById("itemSearchDropdown"),
  brandFilter: document.getElementById("brandFilter"),
  categoryFilter: document.getElementById("categoryFilter"),
  bulkBrandFilter: document.getElementById("bulkBrandFilter"),
  bulkCategoryFilter: document.getElementById("bulkCategoryFilter"),
  itemSubmitButton: document.getElementById("itemSubmitButton"),
  itemCancelEdit: document.getElementById("itemCancelEdit"),
  quoteForm: document.getElementById("quoteForm"),
  posCatalogGrid: document.getElementById("posCatalogGrid"),
  quoteDraftBody: document.getElementById("quoteDraftBody"),
  quoteDraftSummary: document.getElementById("quoteDraftSummary"),
  saveQuoteButton: document.getElementById("saveQuoteButton"),
  checkoutSaleButton: document.getElementById("checkoutSaleButton"),
  quotesList: document.getElementById("quotesList"),
  quoteItemSearch: document.getElementById("quoteItemSearch"),
  quoteBrandFilter: document.getElementById("quoteBrandFilter"),
  quoteCategoryFilter: document.getElementById("quoteCategoryFilter"),
  assistantWidget: document.getElementById("assistantWidget"),
  assistantToggle: document.getElementById("assistantToggle"),
  assistantPanel: document.getElementById("assistantPanel"),
  assistantClose: document.getElementById("assistantClose"),
  assistantLanguage: document.getElementById("assistantLanguage"),
  assistantMessages: document.getElementById("assistantMessages"),
  assistantForm: document.getElementById("assistantForm"),
  assistantInput: document.getElementById("assistantInput"),
};

bindEvents();
initialize();

function bindEvents() {
  refs.loginForm.addEventListener("submit", handleLogin);
  refs.itemForm.addEventListener("submit", handleItemSubmit);
  refs.movementForm.addEventListener("submit", (event) => handleSubmit(event, "/api/movements"));
  refs.expenseForm.addEventListener("submit", (event) => handleSubmit(event, "/api/expenses"));
  refs.cashForm.addEventListener("submit", (event) => handleSubmit(event, "/api/cashbook"));
  refs.bulkPricingForm.addEventListener("submit", handleBulkPricingSubmit);
  refs.itemCancelEdit.addEventListener("click", resetItemForm);
  refs.saveQuoteButton.addEventListener("click", handleQuoteSave);
  refs.checkoutSaleButton.addEventListener("click", handleDirectSale);

  if (refs.userForm) {
    refs.userForm.addEventListener("submit", (event) => handleSubmit(event, "/api/users"));
  }

  refs.logoutButton.addEventListener("click", logout);
  refs.downloadXlsx.addEventListener("click", () => {
    window.location.href = "/api/reports/xlsx";
  });
  refs.downloadPdf.addEventListener("click", () => {
    window.location.href = "/api/reports/pdf";
  });
  refs.barcodeItemSelect.addEventListener("change", updateBarcodePreview);
  refs.movementForm.elements.itemId.addEventListener("change", syncMovementPrice);
  refs.quoteItemSearch.addEventListener("input", handleQuoteFilterChange);
  refs.quoteBrandFilter.addEventListener("change", handleQuoteFilterChange);
  refs.quoteCategoryFilter.addEventListener("change", handleQuoteFilterChange);
  refs.quoteForm.elements.discount.addEventListener("input", renderQuotes);
  refs.quoteForm.elements.isExport.addEventListener("change", renderQuotes);
  refs.quoteForm.elements.collectedAmount.addEventListener("input", renderQuotes);
  refs.itemSearch.addEventListener("input", handleFilterChange);
  refs.itemSearch.addEventListener("focus", renderSearchDropdown);
  refs.itemSearch.addEventListener("blur", () => {
    window.setTimeout(() => refs.itemSearchDropdown?.classList.add("hidden"), 120);
  });
  refs.brandFilter.addEventListener("change", handleFilterChange);
  refs.categoryFilter.addEventListener("change", handleFilterChange);
  refs.assistantToggle.addEventListener("click", toggleAssistantPanel);
  refs.assistantClose.addEventListener("click", closeAssistantPanel);
  refs.assistantLanguage.addEventListener("change", handleAssistantLanguageChange);
  refs.assistantForm.addEventListener("submit", handleAssistantSubmit);

  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.tab));
  });

  [refs.movementForm, refs.expenseForm, refs.cashForm].forEach((form) => {
    form.elements.date.value = today;
  });
  refs.quoteForm.elements.date.value = today;
  refs.quoteForm.elements.language.value = "de";
  refs.quoteForm.elements.isExport.value = "true";
}

async function initialize() {
  const me = await request("/api/me");
  if (!me.user) {
    showLogin();
    return;
  }

  state.user = me.user;
  await refreshData();
}

async function handleLogin(event) {
  event.preventDefault();
  refs.loginError.textContent = "";

  const payload = formToObject(refs.loginForm);
  const result = await request("/api/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (result.error) {
    refs.loginError.textContent = result.error;
    return;
  }

  state.user = result.user;
  refs.loginForm.reset();
  await refreshData();
}

async function handleSubmit(event, url) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = formToObject(form);
  const result = await request(url, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (result.error) {
    window.alert(result.error);
    return;
  }

  form.reset();
  if (form.elements.date) {
    form.elements.date.value = today;
  }
  await refreshData();
}

async function handleItemSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = formToObject(form);
  const itemId = payload.id;
  delete payload.id;
  const url = itemId ? `/api/items/${itemId}` : "/api/items";
  const method = itemId ? "PUT" : "POST";
  const result = await request(url, {
    method,
    body: JSON.stringify(payload),
  });

  if (result.error) {
    window.alert(result.error);
    return;
  }

  resetItemForm();
  await refreshData();
}

async function handleBulkPricingSubmit(event) {
  event.preventDefault();
  const payload = formToObject(event.currentTarget);
  const result = await request("/api/pricing/bulk", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (result.error) {
    window.alert(result.error);
    return;
  }
  window.alert(`${result.updated} kaydin satis fiyati guncellendi.`);
  await refreshData();
}

function resetItemForm() {
  refs.itemForm.reset();
  refs.itemForm.elements.id.value = "";
  refs.itemSubmitButton.textContent = "Malzeme Ekle";
  refs.itemCancelEdit.classList.add("hidden");
}

async function logout() {
  await request("/api/logout", { method: "POST" });
  state.user = null;
  showLogin();
}

async function refreshData() {
  const data = await request("/api/bootstrap");
  if (data.error) {
    showLogin();
    return;
  }

  Object.assign(state, data);
  showApp();
  renderAll();
}

function showLogin() {
  refs.loginScreen.classList.remove("hidden");
  refs.appScreen.classList.add("hidden");
  refs.assistantWidget.classList.add("hidden");
  closeAssistantPanel();
}

function showApp() {
  refs.loginScreen.classList.add("hidden");
  refs.appScreen.classList.remove("hidden");
  refs.assistantWidget.classList.remove("hidden");
  refs.welcomeText.textContent = `${state.user.name} olarak giris yaptiniz. Rol: ${state.user.role}`;
  document.querySelectorAll(".admin-only").forEach((node) => {
    node.classList.toggle("hidden", state.user.role !== "admin");
  });

  if (state.assistantMessages.length === 0) {
    seedAssistantMessages();
  }
}

function renderAll() {
  activateTab(state.activeTab || "quotes");
  renderStats();
  renderFilters();
  renderItems();
  renderArchive();
  renderMovements();
  renderExpenses();
  renderCashbook();
  renderQuotes();
  renderUsers();
  renderItemSelects();
  updateBarcodePreview();
  renderAssistantMessages();
}

function renderFilters() {
  populateSelect(refs.brandFilter, uniqueValues("brand"), "Tum Markalar", state.filters.brand);
  populateSelect(refs.categoryFilter, uniqueValues("category"), "Tum Kategoriler", state.filters.category);
  populateSelect(refs.bulkBrandFilter, uniqueValues("brand"), "Tum Markalar", refs.bulkBrandFilter.value || "all");
  populateSelect(refs.bulkCategoryFilter, uniqueValues("category"), "Tum Kategoriler", refs.bulkCategoryFilter.value || "all");
  populateSelect(refs.quoteBrandFilter, uniqueValues("brand"), "Tum Markalar", state.quoteFilters.brand);
  populateSelect(refs.quoteCategoryFilter, uniqueValues("category"), "Tum Kategoriler", state.quoteFilters.category);
  renderItemSearchSuggestions();
}

function renderStats() {
  refs.statsGrid.innerHTML = "";
  const cards = [
    ["Malzeme Cesidi", state.summary.totalItems, "Kayitli aktif kart"],
    ["Stok Degeri", currency.format(state.summary.stockValue), "Toplam maliyet etkisi"],
    ["Kritik Urun", state.summary.criticalCount, "Esik altinda kalanlar"],
    ["Toplam Masraf", currency.format(state.summary.expenseTotal), "Tum giderler"],
    ["Kasa Bakiyesi", currency.format(state.summary.cashBalance), "Net nakit durum"],
  ];

  cards.forEach(([label, value, subtitle]) => {
    const card = document.createElement("article");
    card.className = "stat-card";
    card.innerHTML = `<p class="eyebrow">${label}</p><strong>${value}</strong><span class="muted">${subtitle}</span>`;
    refs.statsGrid.append(card);
  });
}

function renderItems() {
  refs.itemsTableBody.innerHTML = "";
  const filteredItems = getFilteredItems();
  refs.itemsSummary.textContent = `${filteredItems.length} / ${state.items.length} malzeme goruntuleniyor`;
  renderStockedItems(filteredItems);
  filteredItems.forEach((item) => {
    const tr = document.createElement("tr");
    const critical = Number(item.currentStock) <= Number(item.minStock);
    const purchasePrice = item.lastPurchasePrice || item.defaultPrice || 0;
    tr.innerHTML = `
      <td>${item.name}</td>
      <td>${item.brand || "-"}</td>
      <td>${item.category}</td>
      <td>${numberFormat.format(item.currentStock)} ${item.unit}</td>
      <td>${purchasePrice ? currency.format(purchasePrice) : "-"}</td>
      <td>${item.salePrice ? currency.format(item.salePrice) : "-"}</td>
      <td><span class="status-pill ${critical ? "status-critical" : "status-ok"}">${numberFormat.format(item.minStock)} ${item.unit}</span></td>
      <td>${item.barcode}</td>
      <td>
        <div class="action-row">
          <button class="mini-button secondary-button" type="button" data-action="edit-item" data-id="${item.id}">Duzenle</button>
          <button class="mini-button secondary-button" type="button" data-action="archive-item" data-id="${item.id}">Arsivle</button>
          <button class="mini-button danger-button" type="button" data-action="delete-item" data-id="${item.id}">Sil</button>
        </div>
      </td>
    `;
    refs.itemsTableBody.append(tr);
  });

  refs.itemsTableBody.querySelectorAll("[data-action='edit-item']").forEach((button) => {
    button.addEventListener("click", () => startItemEdit(Number(button.dataset.id)));
  });
  refs.itemsTableBody.querySelectorAll("[data-action='delete-item']").forEach((button) => {
    button.addEventListener("click", () => deleteItem(Number(button.dataset.id)));
  });
  refs.itemsTableBody.querySelectorAll("[data-action='archive-item']").forEach((button) => {
    button.addEventListener("click", () => archiveItem(Number(button.dataset.id)));
  });
}

function renderStockedItems(filteredItems) {
  if (!refs.stockedItemsList || !refs.stockedItemsSummary) {
    return;
  }

  const stockedItems = filteredItems.filter((item) => Number(item.currentStock) > 0);
  refs.stockedItemsSummary.textContent = `${stockedItems.length} urun stokta var. Stok 0 olanlar bu bolume dahil edilmez.`;
  refs.stockedItemsList.innerHTML = "";

  if (stockedItems.length === 0) {
    refs.stockedItemsList.innerHTML = `<div class="empty-state">Stokta urun bulunamadi.</div>`;
    return;
  }

  stockedItems.slice(0, 80).forEach((item) => {
    const price = item.salePrice || item.lastPurchasePrice || item.defaultPrice || 0;
    const card = document.createElement("article");
    card.className = "stocked-card";
    card.innerHTML = `
      <strong>${item.name}</strong>
      <span>${item.brand || "-"} | ${item.category}</span>
      <span>Stok: ${numberFormat.format(item.currentStock)} ${item.unit}</span>
      <span>${item.barcode || "-"}</span>
      <b>${price ? currency.format(price) : "-"}</b>
    `;
    refs.stockedItemsList.append(card);
  });
}

function renderArchive() {
  if (!refs.archiveTableBody || !refs.archiveSummary) {
    return;
  }

  refs.archiveTableBody.innerHTML = "";
  refs.archiveSummary.textContent = `${state.archivedItems.length} pasif urun arsivde tutuluyor`;

  if (state.archivedItems.length === 0) {
    refs.archiveTableBody.innerHTML = `<tr><td colspan="7"><div class="empty-state">Pasif urun yok.</div></td></tr>`;
    return;
  }

  state.archivedItems.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.name}</td>
      <td>${item.brand || "-"}</td>
      <td>${item.category}</td>
      <td>${item.defaultPrice ? currency.format(item.defaultPrice) : "-"}</td>
      <td>${item.salePrice ? currency.format(item.salePrice) : "-"}</td>
      <td>${item.barcode}</td>
      <td><button class="mini-button secondary-button" type="button" data-action="restore-item" data-id="${item.id}">Geri Al</button></td>
    `;
    refs.archiveTableBody.append(tr);
  });

  refs.archiveTableBody.querySelectorAll("[data-action='restore-item']").forEach((button) => {
    button.addEventListener("click", () => restoreItem(Number(button.dataset.id)));
  });
}

function renderMovements() {
  refs.movementsTableBody.innerHTML = "";
  state.movements.slice(0, 20).forEach((movement) => {
    const tr = document.createElement("tr");
    const movementTypeLabel = movement.type === "entry" ? "Giris" : "Cikis";
    let actionMarkup = `<button class="mini-button secondary-button" type="button" data-reverse-movement="${movement.id}">Iptal Et</button>`;

    if (movement.reversalOf) {
      actionMarkup = `<span class="muted">Iptal kaydi</span>`;
    } else if (movement.reversedById) {
      actionMarkup = `<span class="muted">Iptal edildi</span>`;
    }

    tr.innerHTML = `
      <td>${movement.date}</td>
      <td>${movement.itemName}</td>
      <td>${movementTypeLabel}</td>
      <td>${numberFormat.format(movement.quantity)} / ${currency.format(movement.unitPrice)}</td>
      <td>${movement.userName || "-"}</td>
      <td>${actionMarkup}</td>
    `;
    refs.movementsTableBody.append(tr);
  });

  refs.movementsTableBody.querySelectorAll("[data-reverse-movement]").forEach((button) => {
    button.addEventListener("click", () => reverseMovement(Number(button.dataset.reverseMovement)));
  });
}

function renderExpenses() {
  refs.expensesTableBody.innerHTML = "";
  state.expenses.slice(0, 20).forEach((expense) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${expense.date}</td>
      <td>${expense.title}</td>
      <td>${expense.category}</td>
      <td>${currency.format(expense.amount)}</td>
      <td>${expense.userName || "-"}</td>
      <td><button class="mini-button danger-button" type="button" data-delete-expense="${expense.id}">Sil</button></td>
    `;
    refs.expensesTableBody.append(tr);
  });

  refs.expensesTableBody.querySelectorAll("[data-delete-expense]").forEach((button) => {
    button.addEventListener("click", () => deleteExpense(Number(button.dataset.deleteExpense)));
  });
}

function renderCashbook() {
  refs.cashbookTableBody.innerHTML = "";
  state.cashbook.slice(0, 20).forEach((entry) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${entry.date}</td>
      <td>${entry.type === "in" ? "Giris" : "Cikis"}</td>
      <td>${entry.title}</td>
      <td>${currency.format(entry.amount)}</td>
      <td>${entry.userName || "-"}</td>
      <td><button class="mini-button danger-button" type="button" data-delete-cash="${entry.id}">Sil</button></td>
    `;
    refs.cashbookTableBody.append(tr);
  });

  refs.cashbookTableBody.querySelectorAll("[data-delete-cash]").forEach((button) => {
    button.addEventListener("click", () => deleteCashEntry(Number(button.dataset.deleteCash)));
  });
}

function renderUsers() {
  if (!refs.usersTableBody) {
    return;
  }
  refs.usersTableBody.innerHTML = "";
  state.users.forEach((user) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${user.name}</td><td>${user.username}</td><td>${user.role}</td>`;
    refs.usersTableBody.append(tr);
  });
}

function renderQuotes() {
  renderPosCatalog();

  refs.quotesList.innerHTML = "";
  if (!state.quotes || state.quotes.length === 0) {
    refs.quotesList.innerHTML = `<div class="empty-state">Henuz teklif yok.</div>`;
  } else {
    state.quotes.forEach((quote) => {
      const div = document.createElement("div");
      div.className = "feed-item";
      div.innerHTML = `
        <strong>${quote.title} - ${quote.customerName}</strong>
        <span>${quote.quoteNo || `#${quote.id}`} | ${quote.date} | Net ${currency.format(quote.netTotal || quote.total)} | Brut ${currency.format(quote.grossTotal || quote.total)}</span>
        <span>${quote.userName || "-"} | ${quote.language === "tr" ? "TR" : "DE"} | ${quote.isExport ? "Export" : "Inland"}</span>
        <span>${quote.items.map((item) => `${item.itemName} x ${numberFormat.format(item.quantity)}`).join(", ")}</span>
        <div class="action-row">
          <button class="mini-button secondary-button" type="button" data-quote-pdf="${quote.id}" data-lang="de">PDF DE</button>
          <button class="mini-button secondary-button" type="button" data-quote-pdf="${quote.id}" data-lang="tr">PDF TR</button>
        </div>
      `;
      refs.quotesList.append(div);
    });
  }

  refs.quotesList.querySelectorAll("[data-quote-pdf]").forEach((button) => {
    button.addEventListener("click", async () => {
      const quoteId = button.dataset.quotePdf;
      const lang = button.dataset.lang;
      await downloadQuotePdf(quoteId, lang);
    });
  });

  refs.quoteDraftBody.innerHTML = "";
  if (state.quoteDraft.length === 0) {
    refs.quoteDraftBody.innerHTML = `<div class="empty-state">Sepet bos. Soldan urun secip ekleyin.</div>`;
  } else {
    state.quoteDraft.forEach((entry, index) => {
      const row = document.createElement("article");
      row.className = "cart-item";
      row.innerHTML = `
        <div class="cart-item-main">
          <strong>${entry.itemName}</strong>
          <span>${entry.unit} | ${currency.format(entry.unitPrice)} / birim</span>
        </div>
        <div class="cart-item-controls">
          <button class="mini-button secondary-button" type="button" data-quote-qty="${index}" data-delta="-1">-</button>
          <span>${numberFormat.format(entry.quantity)}</span>
          <button class="mini-button secondary-button" type="button" data-quote-qty="${index}" data-delta="1">+</button>
        </div>
        <div class="cart-item-total">
          <strong>${currency.format(entry.quantity * entry.unitPrice)}</strong>
          <button class="mini-button danger-button" type="button" data-remove-quote-line="${index}">Sil</button>
        </div>
      `;
      refs.quoteDraftBody.append(row);
    });
  }

  refs.quoteDraftBody.querySelectorAll("[data-remove-quote-line]").forEach((button) => {
    button.addEventListener("click", () => {
      state.quoteDraft.splice(Number(button.dataset.removeQuoteLine), 1);
      renderQuotes();
    });
  });
  refs.quoteDraftBody.querySelectorAll("[data-quote-qty]").forEach((button) => {
    button.addEventListener("click", () => changeQuoteQuantity(Number(button.dataset.quoteQty), Number(button.dataset.delta)));
  });

  const subtotal = state.quoteDraft.reduce((sum, entry) => sum + entry.quantity * entry.unitPrice, 0);
  const discount = Number(refs.quoteForm.elements.discount.value || 0);
  const isExport = refs.quoteForm.elements.isExport?.value !== "false";
  const netTotal = Math.max(subtotal - discount, 0);
  const vatAmount = isExport ? 0 : netTotal * 0.19;
  const grossTotal = netTotal + vatAmount;
  const collectedAmount = Math.max(Number(refs.quoteForm.elements.collectedAmount?.value || 0), 0);
  const remaining = Math.max(grossTotal - collectedAmount, 0);
  refs.quoteDraftSummary.textContent = `Ara toplam: ${currency.format(subtotal)} | Iskonto: ${currency.format(discount)} | Net: ${currency.format(netTotal)} | KDV: ${currency.format(vatAmount)} | Brut: ${currency.format(grossTotal)} | Tahsil: ${currency.format(collectedAmount)} | Kalan: ${currency.format(remaining)}`;
}

function renderPosCatalog() {
  if (!refs.posCatalogGrid) {
    return;
  }

  const items = getFilteredQuoteItems();
  refs.posCatalogGrid.innerHTML = "";

  if (items.length === 0) {
    refs.posCatalogGrid.innerHTML = `<div class="empty-state">Aramaya uygun urun bulunamadi.</div>`;
    return;
  }

  items.slice(0, 60).forEach((item) => {
    const card = document.createElement("article");
    card.className = "pos-card";
    const price = item.salePrice || item.lastPurchasePrice || item.defaultPrice || 0;
    card.innerHTML = `
      <div class="pos-card-head">
        <strong>${item.name}</strong>
        <span>${item.brand || "-"}</span>
      </div>
      <div class="pos-card-meta">
        <span>${item.category}</span>
        <span>Stok: ${numberFormat.format(item.currentStock)} ${item.unit}</span>
      </div>
      <div class="pos-card-price">${price ? currency.format(price) : "-"}</div>
      <button class="primary-button" type="button" data-add-quote-item="${item.id}">Sepete Ekle</button>
    `;
    refs.posCatalogGrid.append(card);
  });

  refs.posCatalogGrid.querySelectorAll("[data-add-quote-item]").forEach((button) => {
    button.addEventListener("click", () => addItemToQuote(Number(button.dataset.addQuoteItem)));
  });
}

function renderItemSelects() {
  const generalSelects = [refs.movementForm.elements.itemId, refs.barcodeItemSelect];
  generalSelects.forEach((select) => {
    select.innerHTML = "";
    getFilteredItems(false).forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = `${item.name}${item.brand ? ` / ${item.brand}` : ""} (${item.currentStock} ${item.unit})`;
      select.append(option);
    });
  });

  syncMovementPrice();
}

function updateBarcodePreview() {
  const itemId = refs.barcodeItemSelect.value;
  if (!itemId) {
    refs.barcodeImage.removeAttribute("src");
    return;
  }
  refs.barcodeImage.src = `/api/barcodes/${itemId}?t=${Date.now()}`;
}

function syncMovementPrice() {
  const itemId = Number(refs.movementForm.elements.itemId.value);
  const item = state.items.find((entry) => Number(entry.id) === itemId);
  if (!item) {
    return;
  }

  const price = item.lastPurchasePrice || item.defaultPrice || "";
  if (price && !refs.movementForm.elements.unitPrice.value) {
    refs.movementForm.elements.unitPrice.value = price;
  }
}

function activateTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
  document.querySelectorAll("[data-tab-content]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.tabContent === tab);
  });
}

function handleFilterChange() {
  state.filters.search = refs.itemSearch.value.trim().toLowerCase();
  state.filters.brand = refs.brandFilter.value;
  state.filters.category = refs.categoryFilter.value;
  renderItems();
  renderSearchDropdown();
}

function handleQuoteFilterChange() {
  state.quoteFilters.search = refs.quoteItemSearch.value.trim().toLowerCase();
  state.quoteFilters.brand = refs.quoteBrandFilter.value;
  state.quoteFilters.category = refs.quoteCategoryFilter.value;
  renderQuotes();
}

function toggleAssistantPanel() {
  const isHidden = refs.assistantPanel.classList.contains("hidden");
  refs.assistantPanel.classList.toggle("hidden", !isHidden);
  refs.assistantToggle.setAttribute("aria-expanded", String(isHidden));
  if (isHidden) {
    refs.assistantInput.focus();
  }
}

function closeAssistantPanel() {
  refs.assistantPanel.classList.add("hidden");
  refs.assistantToggle.setAttribute("aria-expanded", "false");
}

function seedAssistantMessages() {
  state.assistantMessages = [
    {
      role: "assistant",
      text: getAssistantWelcomeMessage(),
    },
  ];
}

function renderAssistantMessages() {
  if (!refs.assistantMessages) {
    return;
  }

  refs.assistantMessages.innerHTML = "";
  state.assistantMessages.forEach((message) => {
    const article = document.createElement("article");
    article.className = `assistant-message assistant-${message.role}`;
    article.innerHTML = `
      <strong>${message.role === "assistant" ? assistantLabel("assistant") : assistantLabel("user")}</strong>
      <p>${escapeHtml(message.text)}</p>
    `;
    refs.assistantMessages.append(article);
  });
  refs.assistantMessages.scrollTop = refs.assistantMessages.scrollHeight;
}

function handleAssistantLanguageChange() {
  state.assistantLanguage = refs.assistantLanguage.value || "tr";
  if (state.assistantMessages.length <= 1) {
    seedAssistantMessages();
  }
  renderAssistantMessages();
}

async function handleAssistantSubmit(event) {
  event.preventDefault();
  const message = refs.assistantInput.value.trim();
  if (!message) {
    return;
  }

  state.assistantMessages.push({ role: "user", text: message });
  refs.assistantInput.value = "";
  renderAssistantMessages();

  const result = await request("/api/assistant/query", {
    method: "POST",
    body: JSON.stringify({ message, language: state.assistantLanguage }),
  });

  state.assistantMessages.push({
    role: "assistant",
    text: result.error || result.answer || "Bu soru icin net bir sonuc bulamadim.",
  });
  renderAssistantMessages();
}

function assistantLabel(role) {
  if (state.assistantLanguage === "de") {
    return role === "assistant" ? "Assistent" : "Sie";
  }
  return role === "assistant" ? "Asistan" : "Siz";
}

function getAssistantWelcomeMessage() {
  if (state.assistantLanguage === "de") {
    return "Der Lagerassistent ist bereit. Sie koennen nach Bestand, Preis, Kategorie, kritischen Artikeln oder Verkaufsablauf fragen.";
  }
  return "Depo Asistani hazir. Stok, fiyat, kategori, kritik urun veya satis akisi ile ilgili soru sorabilirsiniz.";
}

function getFilteredItems(applySearch = true) {
  return state.items.filter((item) => {
    if (state.filters.brand !== "all" && item.brand !== state.filters.brand) {
      return false;
    }

    if (state.filters.category !== "all" && item.category !== state.filters.category) {
      return false;
    }

    if (!applySearch || !state.filters.search) {
      return true;
    }

    const haystack = [
      item.name,
      item.brand,
      item.category,
      item.barcode,
      item.notes,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(state.filters.search);
  });
}

function uniqueValues(field) {
  return [...new Set(state.items.map((item) => item[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr"));
}

function populateSelect(select, values, placeholder, selectedValue) {
  const previous = selectedValue || "all";
  select.innerHTML = `<option value="all">${placeholder}</option>`;
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  });
  select.value = values.includes(previous) || previous === "all" ? previous : "all";
}

function renderItemSearchSuggestions() {
  if (!refs.itemSearchSuggestions) {
    return;
  }

  const suggestions = new Set();
  state.items.forEach((item) => {
    [item.name, item.brand, item.barcode, item.category].filter(Boolean).forEach((value) => suggestions.add(value));
  });

  refs.itemSearchSuggestions.innerHTML = "";
  [...suggestions]
    .sort((a, b) => a.localeCompare(b, "tr"))
    .slice(0, 250)
    .forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      refs.itemSearchSuggestions.append(option);
    });
}

function renderSearchDropdown() {
  if (!refs.itemSearchDropdown) {
    return;
  }

  const term = refs.itemSearch.value.trim().toLowerCase();
  if (!term) {
    refs.itemSearchDropdown.classList.add("hidden");
    refs.itemSearchDropdown.innerHTML = "";
    return;
  }

  const matches = state.items
    .filter((item) => [item.name, item.brand, item.category, item.barcode, item.notes].filter(Boolean).join(" ").toLowerCase().includes(term))
    .slice(0, 10);

  if (matches.length === 0) {
    refs.itemSearchDropdown.classList.add("hidden");
    refs.itemSearchDropdown.innerHTML = "";
    return;
  }

  refs.itemSearchDropdown.innerHTML = matches.map((item) => `
    <button class="search-suggestion" type="button" data-search-value="${escapeHtml(item.name)}">
      <strong>${escapeHtml(item.name)}</strong>
      <span>${escapeHtml(item.brand || "-")} | ${escapeHtml(item.category)} | ${escapeHtml(item.barcode)}</span>
    </button>
  `).join("");
  refs.itemSearchDropdown.classList.remove("hidden");
  refs.itemSearchDropdown.querySelectorAll("[data-search-value]").forEach((button) => {
    button.addEventListener("click", () => {
      refs.itemSearch.value = button.dataset.searchValue;
      handleFilterChange();
      refs.itemSearchDropdown.classList.add("hidden");
    });
  });
}

function getFilteredQuoteItems() {
  return state.items.filter((item) => {
    if (state.quoteFilters.brand !== "all" && item.brand !== state.quoteFilters.brand) {
      return false;
    }
    if (state.quoteFilters.category !== "all" && item.category !== state.quoteFilters.category) {
      return false;
    }
    if (!state.quoteFilters.search) {
      return true;
    }
    const haystack = [item.name, item.brand, item.category, item.notes].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(state.quoteFilters.search);
  });
}

function startItemEdit(itemId) {
  const item = state.items.find((entry) => Number(entry.id) === itemId);
  if (!item) {
    return;
  }
  refs.itemForm.elements.id.value = item.id;
  refs.itemForm.elements.name.value = item.name;
  refs.itemForm.elements.brand.value = item.brand || "";
  refs.itemForm.elements.category.value = item.category;
  refs.itemForm.elements.unit.value = item.unit;
  refs.itemForm.elements.minStock.value = item.minStock;
  refs.itemForm.elements.defaultPrice.value = item.defaultPrice || item.lastPurchasePrice || "";
  refs.itemForm.elements.salePrice.value = item.salePrice || "";
  refs.itemForm.elements.barcode.value = item.barcode.startsWith("ITEM-") ? "" : item.barcode;
  refs.itemForm.elements.notes.value = item.notes || "";
  refs.itemSubmitButton.textContent = "Malzemeyi Guncelle";
  refs.itemCancelEdit.classList.remove("hidden");
  activateTab("items");
}

async function deleteItem(itemId) {
  const approved = window.confirm("Bu malzeme kartini silmek istiyor musunuz?");
  if (!approved) {
    return;
  }
  const result = await request(`/api/items/${itemId}`, { method: "DELETE" });
  if (result.error) {
    window.alert(result.error);
    return;
  }
  await refreshData();
}

async function archiveItem(itemId) {
  const approved = window.confirm("Bu malzeme aktif listeden kaldirilip arsive tasinsin mi?");
  if (!approved) {
    return;
  }
  const result = await request(`/api/items/${itemId}/archive`, { method: "POST" });
  if (result.error) {
    window.alert(result.error);
    return;
  }
  await refreshData();
}

async function restoreItem(itemId) {
  const result = await request(`/api/items/${itemId}/restore`, { method: "POST" });
  if (result.error) {
    window.alert(result.error);
    return;
  }
  await refreshData();
}

async function deleteExpense(expenseId) {
  const approved = window.confirm("Bu masraf kaydini silmek istiyor musunuz?");
  if (!approved) {
    return;
  }

  const result = await request(`/api/expenses/${expenseId}`, { method: "DELETE" });
  if (result.error) {
    window.alert(result.error);
    return;
  }
  await refreshData();
}

async function deleteCashEntry(entryId) {
  const approved = window.confirm("Bu kasa hareketini silmek istiyor musunuz?");
  if (!approved) {
    return;
  }

  const result = await request(`/api/cashbook/${entryId}`, { method: "DELETE" });
  if (result.error) {
    window.alert(result.error);
    return;
  }
  await refreshData();
}

async function reverseMovement(movementId) {
  const approved = window.confirm("Bu stok hareketi ters kayit olusturularak iptal edilsin mi?");
  if (!approved) {
    return;
  }

  const result = await request(`/api/movements/${movementId}/reverse`, { method: "POST" });
  if (result.error) {
    window.alert(result.error);
    return;
  }
  await refreshData();
}

function addItemToQuote(itemId) {
  const item = state.items.find((entry) => Number(entry.id) === Number(itemId));
  if (!item) {
    return;
  }

  const existing = state.quoteDraft.find((entry) => Number(entry.itemId) === Number(item.id));
  if (existing) {
    existing.quantity += 1;
  } else {
    state.quoteDraft.push({
      itemId: Number(item.id),
      itemName: item.name,
      quantity: 1,
      unitPrice: Number(item.salePrice || item.lastPurchasePrice || item.defaultPrice || 0),
      unit: item.unit,
    });
  }
  renderQuotes();
}

function changeQuoteQuantity(index, delta) {
  const line = state.quoteDraft[index];
  if (!line) {
    return;
  }

  line.quantity = Math.max(1, Number(line.quantity) + delta);
  renderQuotes();
}

async function handleQuoteSave() {
  if (state.quoteDraft.length === 0) {
    window.alert("Once teklif kalemi ekleyin.");
    return;
  }
  const payload = {
    ...formToObject(refs.quoteForm),
    items: state.quoteDraft,
  };
  const result = await request("/api/quotes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (result.error) {
    window.alert(result.error);
    return;
  }
  refs.quoteForm.reset();
  refs.quoteForm.elements.date.value = today;
  refs.quoteForm.elements.discount.value = 0;
  refs.quoteForm.elements.language.value = "de";
  refs.quoteForm.elements.isExport.value = "true";
  refs.quoteForm.elements.collectedAmount.value = 0;
  state.quoteDraft = [];
  await refreshData();
}

async function handleDirectSale() {
  if (state.quoteDraft.length === 0) {
    window.alert("Once sepete urun ekleyin.");
    return;
  }

  const payload = {
    ...formToObject(refs.quoteForm),
    items: state.quoteDraft,
  };
  const result = await request("/api/sales/checkout", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (result.error) {
    window.alert(result.error);
    return;
  }

  window.alert(`Direkt satis tamamlandi. Tahsil edilen: ${currency.format(result.paid || 0)} | Kalan: ${currency.format(result.remaining || 0)}`);
  refs.quoteForm.reset();
  refs.quoteForm.elements.date.value = today;
  refs.quoteForm.elements.discount.value = 0;
  refs.quoteForm.elements.language.value = "de";
  refs.quoteForm.elements.isExport.value = "true";
  refs.quoteForm.elements.collectedAmount.value = 0;
  refs.quoteForm.elements.paymentType.value = "cash";
  state.quoteDraft = [];
  await refreshData();
}

async function downloadQuotePdf(quoteId, lang) {
  const response = await fetch(`/api/quotes/${quoteId}/pdf?lang=${lang}`, {
    credentials: "include",
  });

  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || contentType.includes("application/json")) {
    let errorMessage = "PDF indirilemedi.";
    try {
      const errorPayload = await response.json();
      errorMessage = errorPayload.error || errorMessage;
    } catch {
      // no-op
    }
    window.alert(errorMessage);
    return;
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  const disposition = response.headers.get("content-disposition") || "";
  const filenameMatch = disposition.match(/filename="([^"]+)"/i);
  anchor.download = filenameMatch?.[1] || `${lang === "tr" ? "teklif" : "angebot"}-${quoteId}.pdf`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function formToObject(form) {
  const data = new FormData(form);
  return Object.fromEntries(data.entries());
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    credentials: "include",
    ...options,
  });

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return {};
  }

  return response.json();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
