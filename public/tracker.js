/**
 * DRC Kullanıcı Aktivite Tracker
 *
 * - Hash/route değişikliği → page_view
 * - Search input → search (500ms debounce)
 * - Ürün kart/sayfa tıklaması → product_view
 * - Sepete ekle/çıkar → cart_add / cart_remove
 * - Sipariş tamamlanması → order_placed
 * - Bot mesajı → bot_message
 *
 * Backend: POST /api/activity/track (silent fail, UX'i bozmaz)
 * Toplama: 8 olay/saniye throttle, son 5 olay 2 sn buffer'da batch'lenir.
 */
(function () {
  "use strict";

  if (window.drcTracker) return;

  var BATCH_DELAY_MS = 1500;
  var BATCH_MAX_SIZE = 6;
  var DEBOUNCE_SEARCH_MS = 600;

  var sessionId = sessionStorage.getItem("drc_session_id") || (function () {
    var id = "s_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    sessionStorage.setItem("drc_session_id", id);
    return id;
  })();

  var queue = [];
  var flushTimer = null;
  var lastSearchTimer = null;
  var lastPath = location.pathname + location.hash;

  function send(events) {
    if (!events || events.length === 0) return;
    for (var i = 0; i < events.length; i++) {
      // Tek tek gönderiyoruz (server tek satır kabul ediyor)
      try {
        fetch("/api/activity/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(events[i]),
          keepalive: true,
        }).catch(function () {});
      } catch (_e) {}
    }
  }

  function flush() {
    if (queue.length === 0) return;
    var batch = queue.splice(0);
    send(batch);
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(function () {
      flushTimer = null;
      flush();
    }, BATCH_DELAY_MS);
  }

  function track(eventType, opts) {
    opts = opts || {};
    var ev = {
      eventType:   eventType,
      eventLabel:  opts.label || opts.eventLabel || "",
      targetType:  opts.targetType || "",
      targetId:    opts.targetId || null,
      pagePath:    opts.pagePath || (location.pathname + location.hash),
      sessionId:   sessionId,
      metadata:    opts.metadata || {},
    };
    queue.push(ev);
    if (queue.length >= BATCH_MAX_SIZE) {
      clearTimeout(flushTimer);
      flushTimer = null;
      flush();
    } else {
      scheduleFlush();
    }
  }

  // === Tab kapatılırken pending event'leri gönder ===
  window.addEventListener("beforeunload", function () {
    if (queue.length > 0) {
      try {
        // Tek pakette gönder (sendBeacon UX'i bozmaz)
        for (var i = 0; i < queue.length; i++) {
          var blob = new Blob([JSON.stringify(queue[i])], { type: "application/json" });
          navigator.sendBeacon && navigator.sendBeacon("/api/activity/track", blob);
        }
      } catch (_e) {}
    }
  });

  // === Sayfa açılışı: page_view ===
  function trackPageView() {
    track("page_view", {
      label: document.title,
      pagePath: location.pathname + location.hash,
    });
  }
  trackPageView();

  // Hash/route değişikliği (SPA)
  window.addEventListener("hashchange", function () {
    var currentPath = location.pathname + location.hash;
    if (currentPath !== lastPath) {
      lastPath = currentPath;
      trackPageView();
    }
  });
  // history.pushState wrapper
  var origPush = history.pushState;
  history.pushState = function () {
    var ret = origPush.apply(this, arguments);
    var currentPath = location.pathname + location.hash;
    if (currentPath !== lastPath) {
      lastPath = currentPath;
      trackPageView();
    }
    return ret;
  };

  // === Search input (debounce 600ms) ===
  function bindSearchInput(input) {
    if (!input || input.__drcTracked) return;
    input.__drcTracked = true;
    input.addEventListener("input", function () {
      clearTimeout(lastSearchTimer);
      var val = input.value.trim();
      if (val.length < 2) return;
      lastSearchTimer = setTimeout(function () {
        track("search", { label: val, targetType: "search_query", metadata: { length: val.length } });
      }, DEBOUNCE_SEARCH_MS);
    });
  }
  document.querySelectorAll('input[type="search"], #customerCatalogSearch, #posCatalogSearch, #itemSearch').forEach(bindSearchInput);

  // === Ürün kart/satır tıklama (event delegation) ===
  document.addEventListener("click", function (e) {
    var card = e.target.closest("[data-item-id], [data-product-id], .product-card, .pos-card, .customer-catalog-card");
    if (card) {
      var id = card.getAttribute("data-item-id") || card.getAttribute("data-product-id") || null;
      var name = card.getAttribute("data-item-name") || card.querySelector("h3, .pos-card-name, .customer-catalog-card-name")?.textContent?.trim() || "";
      if (id || name) {
        track("product_view", { label: name, targetType: "item", targetId: id });
      }
    }

    // Sepete ekle butonu
    var addBtn = e.target.closest("[data-add-cart], .pos-card-add, .customer-add-to-cart, .product-card-cta");
    if (addBtn) {
      var addId = addBtn.getAttribute("data-item-id") || addBtn.closest("[data-item-id]")?.getAttribute("data-item-id") || null;
      var addName = addBtn.getAttribute("data-item-name") || addBtn.closest("[data-item-name]")?.getAttribute("data-item-name") || "";
      track("cart_add", { label: addName || "Sepete eklendi", targetType: "item", targetId: addId });
    }

    // Sepetten çıkar
    if (e.target.closest("[data-remove-cart], .cart-remove")) {
      track("cart_remove", { label: "Sepetten çıkarıldı" });
    }

    // Sepeti temizle
    if (e.target.closest("[data-clear-cart], #customerCartClear, #posCartClear")) {
      track("cart_clear", { label: "Sepet temizlendi" });
    }

    // Kategori chip
    var catChip = e.target.closest(".customer-catalog-cat-chip, .category-card, [data-category]");
    if (catChip) {
      var catName = catChip.getAttribute("data-category") || catChip.textContent?.trim() || "";
      if (catName) track("category_view", { label: catName, targetType: "category" });
    }

    // Marka filter
    var brandChip = e.target.closest("[data-brand], .brand-chip");
    if (brandChip) {
      var brandName = brandChip.getAttribute("data-brand") || brandChip.textContent?.trim() || "";
      if (brandName) track("brand_view", { label: brandName, targetType: "brand" });
    }
  }, true);

  // === Sipariş tamamlama (window.dispatchEvent("drc:order_placed", {...}) ile) ===
  window.addEventListener("drc:order_placed", function (e) {
    var d = e.detail || {};
    track("order_placed", { label: d.label || "Sipariş oluşturuldu", targetType: "order", targetId: d.orderId, metadata: { total: d.total, itemCount: d.itemCount } });
  });

  // === Bot mesajı (window.dispatchEvent("drc:bot_message", {...})) ===
  window.addEventListener("drc:bot_message", function (e) {
    var d = e.detail || {};
    track("bot_message", { label: (d.message || "").slice(0, 200), targetType: "drc_man", metadata: { mode: d.mode } });
  });

  // === Filter / sort değişimi (window.dispatchEvent("drc:filter_apply", {...})) ===
  window.addEventListener("drc:filter_apply", function (e) {
    var d = e.detail || {};
    track("filter_apply", { label: d.label || "Filtre uygulandı", metadata: d.filters || {} });
  });

  // === Login / logout (custom event'lerle yakalanır) ===
  window.addEventListener("drc:login", function () { track("login", { label: "Giriş yapıldı" }); });
  window.addEventListener("drc:logout", function () { track("logout", { label: "Çıkış yapıldı" }); });

  // === Public API ===
  window.drcTracker = {
    track: track,
    flush: flush,
    sessionId: sessionId,
    queueLength: function () { return queue.length; },
    bindSearchInput: bindSearchInput,
  };

  console.log("[DRC Tracker] hazır (session=" + sessionId + ")");
})();
