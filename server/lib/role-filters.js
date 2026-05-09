"use strict";

/**
 * Role-bazlı veri filtreleme.
 *
 * Bootstrap state, summary ve hareket cevaplarında müşteri/personel
 * rolüne göre hassas alanları (alış fiyatı, kritik stok, kasa bakiyesi)
 * sıfırlayan/maskeleyen saf fonksiyonlar.
 *
 * Public API:
 *   sanitizeSummaryForRole(summary, role)
 *   sanitizeItemsForRole(items, user)
 *   sanitizeMovementsForRole(movements, role)
 */

const { normalizeRole } = require("./util");

function sanitizeSummaryForRole(summary, role) {
  if (normalizeRole(role) === "admin") {
    return summary;
  }
  if (normalizeRole(role) === "staff") {
    return {
      ...summary,
      stockValue: 0,
      stockCostValue: 0,
      expenseTotal: 0,
    };
  }
  return {
    ...summary,
    stockValue: 0,
    stockCostValue: 0,
    expenseTotal: 0,
    cashBalance: 0,
  };
}

function sanitizeItemsForRole(items, user) {
  const role = normalizeRole(user?.role);
  if (role === "admin") {
    return items;
  }

  // Customer: alış fiyatlarını, kritik stok eşiğini ve gerçek stok miktarını gizle.
  // Sadece "stokta var/yok" bilgisi ve satış/liste fiyatı görünür.
  if (role === "customer") {
    return items.map((item) => ({
      ...item,
      defaultPrice: 0,
      lastPurchasePrice: 0,
      averagePurchasePrice: 0,
      minStock: 0,
      currentStock: Number(item.currentStock) > 0 ? 1 : 0, // stokta var/yok sinyali
      inStock: Number(item.currentStock) > 0,
    }));
  }

  // Staff/operator: alış fiyatlarını gizle, stok miktarını koru (operasyonel).
  return items.map((item) => ({
    ...item,
    defaultPrice: 0,
    lastPurchasePrice: 0,
    averagePurchasePrice: 0,
  }));
}

function sanitizeMovementsForRole(movements, role) {
  if (normalizeRole(role) === "admin") {
    return movements;
  }
  return movements.map((movement) => ({
    ...movement,
    unitPrice: 0,
  }));
}

module.exports = {
  sanitizeSummaryForRole,
  sanitizeItemsForRole,
  sanitizeMovementsForRole,
};
