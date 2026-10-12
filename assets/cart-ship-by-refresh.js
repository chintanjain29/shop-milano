(() => {
  if (typeof window.theme !== 'object') window.theme = window.theme || {};

  const STOCK_SHIP_PROPERTY = 'Stock Ship Message';
  const STOCK_SHIP_LEAD_DAYS = '__Stock Ship Lead Days';
  const MADE_FOR_YOU = { prefix: 'Made for you | Ships by', leadDays: 21 };

  const THROTTLE_MS = 3000;
  const EVENT_GATE_MS = 60 * 1000;
  const IDLE_INTERVAL_MS = 15 * 60 * 1000;

  let chain = Promise.resolve();
  let lastRunAt = 0;
  let lastEventRefreshAt = 0;
  let checkoutNavigating = false;
  let allowCheckoutSubmit = false;
  let intervalHandle = null;

  const safeParseJson = (str) => {
    if (!str) return null;
    try { return JSON.parse(str); } catch (e) { return null; }
  };

  const normalizeToIsoDate = (value) => {
    if (!value) return null;
    if (typeof value === 'string') {
      const s = value.trim();
      const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
      const usSlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (usSlash) return `${usSlash[3]}-${String(usSlash[1]).padStart(2, '0')}-${String(usSlash[2]).padStart(2, '0')}`;
      const dash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
      if (dash) {
        const a = parseInt(dash[1], 10);
        const b = parseInt(dash[2], 10);
        const y = dash[3];
        const month = a <= 12 ? a : b;
        const day = a <= 12 ? b : a;
        return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
    return null;
  };

  const normalizeProductionType = (raw) => (
    (raw || '').trim().toLowerCase().replace(/-/g, ' ').replace(/\+/g, ' ').replace(/\s+/g, ' ')
  );

  const getInventoryQuantity = (variant) => {
    if (!variant) return 0;
    if (variant.inventory_quantity != null && variant.inventory_quantity !== '') {
      const parsed = Number(variant.inventory_quantity);
      if (Number.isFinite(parsed)) return parsed;
    }
    if (variant.available === true) return 1;
    return 0;
  };

  const resolveShippingContext = (productionType, inventoryQty) => {
    if (inventoryQty > 0) {
      return { prefix: 'In stock | Ships by', leadDays: 3 };
    }
    const pt = normalizeProductionType(productionType);
    if (pt === 'in stock') return { prefix: 'In stock | Ships by', leadDays: 3 };
    if (pt === 'semi mount rts') return { prefix: 'Crafted for you | Ships by', leadDays: 7 };
    if (pt === 'semi mount sourced') return { prefix: 'Crafted for you | Ships by', leadDays: 14 };
    if (pt === 'made to order') return { prefix: 'Made for you | Ships by', leadDays: 21 };
    return MADE_FOR_YOU;
  };

  const getNyNowParts = () => {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const parts = dtf.formatToParts(new Date());
    const map = {};
    parts.forEach((p) => { if (p.type !== 'literal') map[p.type] = p.value; });
    return {
      year: parseInt(map.year, 10),
      month: parseInt(map.month, 10),
      day: parseInt(map.day, 10),
      hour: parseInt(map.hour, 10)
    };
  };

  const dateFromYmdUtc = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
  const isoFromDateUtc = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  const isNonWorkingUtc = (d, holidaySet) => d.getUTCDay() === 0 || holidaySet.has(isoFromDateUtc(d));

  const nextWorkingDayUtc = (d, holidaySet) => {
    const out = new Date(d.getTime());
    while (isNonWorkingUtc(out, holidaySet)) out.setUTCDate(out.getUTCDate() + 1);
    return out;
  };

  const addWorkingDaysUtc = (startUtcDate, workingDaysToAdd, holidaySet) => {
    let d = new Date(startUtcDate.getTime());
    let added = 0;
    while (added < workingDaysToAdd) {
      d.setUTCDate(d.getUTCDate() + 1);
      if (!isNonWorkingUtc(d, holidaySet)) added += 1;
    }
    return d;
  };

  const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thur', 'Fri', 'Sat'];
  const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const ordinalSuffix = (n) => {
    const j = n % 10;
    const k = n % 100;
    if (k >= 11 && k <= 13) return 'th';
    if (j === 1) return 'st';
    if (j === 2) return 'nd';
    if (j === 3) return 'rd';
    return 'th';
  };

  const formatShipByDate = (prefix, leadDays, holidaySet) => {
    const { year, month, day, hour } = getNyNowParts();
    const beforeCutoff = hour < 12;

    let day0 = dateFromYmdUtc(year, month, day);
    if (!beforeCutoff) day0.setUTCDate(day0.getUTCDate() + 1);
    day0 = nextWorkingDayUtc(day0, holidaySet);

    const shipBy = addWorkingDaysUtc(day0, leadDays, holidaySet);
    const dayNum = shipBy.getUTCDate();
    const weekdayShort = WEEKDAY_SHORT[shipBy.getUTCDay()];
    const monthShort = MONTH_SHORT[shipBy.getUTCMonth()];
    return `${prefix} ${weekdayShort}, ${monthShort} ${dayNum}${ordinalSuffix(dayNum)}.`;
  };

  const formatShipByMessage = (variant, productionType, holidaySet) => {
    const { prefix, leadDays } = resolveShippingContext(productionType, getInventoryQuantity(variant));
    return formatShipByDate(prefix, leadDays, holidaySet);
  };

  const normalizeLeadDays = (value) => {
    if (value == null || value === '') return null;
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return null;
    return Math.min(parsed, 365);
  };

  const parseStoredPrefix = (message) => {
    if (!message) return null;
    const match = message.match(/^(In stock \| Ships by|Crafted for you \| Ships by|Made for you \| Ships by)\s+.*$/);
    return match ? match[1] : null;
  };

  const prefixFromLeadDays = (leadDays) => {
    if (leadDays <= 3) return 'In stock | Ships by';
    if (leadDays === 7 || leadDays === 14) return 'Crafted for you | Ships by';
    return 'Made for you | Ships by';
  };

  const resolveProductionLeadDays = (raw) => {
    const pt = normalizeProductionType(raw);
    if (pt === 'in stock') return 3;
    if (pt === 'semi mount rts') return 7;
    if (pt === 'semi mount sourced') return 14;
    if (pt === 'made to order') return 21;
    return 21;
  };

  // const getTargetMessage = (item, data, holidaySet) => {
  //   const props = item.properties || {};
  //   const current = props[STOCK_SHIP_PROPERTY];
  //   const storedLeadDays = normalizeLeadDays(props[STOCK_SHIP_LEAD_DAYS]);

  //   if (storedLeadDays) {
  //     const prefix = parseStoredPrefix(current) || prefixFromLeadDays(storedLeadDays);
  //     return formatShipByDate(prefix, storedLeadDays, holidaySet);
  //   }

  //   const parsedPrefix = parseStoredPrefix(current);
  //   if (parsedPrefix) {
  //     return formatShipByDate(parsedPrefix, resolveProductionLeadDays(
  //       data.productionTypes ? data.productionTypes[item.product_id] : undefined
  //     ), holidaySet);
  //   }

  //   return formatShipByMessage(item.variant, data.productionTypes ? data.productionTypes[item.product_id] : undefined, holidaySet);
  // };

  // const computeChanges = (cart, data, holidaySet) => {
  //   const changes = [];
  //   if (!cart.items || cart.items.length === 0) return changes;
  //   cart.items.forEach((item) => {
  //     const current = item.properties ? item.properties[STOCK_SHIP_PROPERTY] : undefined;
  //     const target = getTargetMessage(item, data, holidaySet);
  //     if (current !== target) {
  //       changes.push({ id: item.key, properties: { ...item.properties, [STOCK_SHIP_PROPERTY]: target } });
  //     }
  //   });
  //   return changes;
  // };

  const getCurrentInventory = (item, data) => {
    if (data.variantInventory && data.variantInventory[item.variant_id] != null) {
      const n = Number(data.variantInventory[item.variant_id]);
      if (Number.isFinite(n)) return n;
    }
    if (item.variant) return getInventoryQuantity(item.variant);
    return null;
  };

  const getTarget = (item, data, holidaySet) => {
    const props = item.properties || {};
    const productionType = data.productionTypes
      ? data.productionTypes[item.product_id]
      : undefined;
    const inventoryQty = getCurrentInventory(item, data);

    if (inventoryQty !== null) {
      const { prefix, leadDays } = resolveShippingContext(productionType, inventoryQty);
      return { message: formatShipByDate(prefix, leadDays, holidaySet), leadDays };
    }

    const storedLeadDays = normalizeLeadDays(props[STOCK_SHIP_LEAD_DAYS]);
    if (storedLeadDays) {
      const prefix = parseStoredPrefix(props[STOCK_SHIP_PROPERTY]) || prefixFromLeadDays(storedLeadDays);
      return { message: formatShipByDate(prefix, storedLeadDays, holidaySet), leadDays: storedLeadDays };
    }

    const { prefix, leadDays } = resolveShippingContext(productionType, 0);
    return { message: formatShipByDate(prefix, leadDays, holidaySet), leadDays };
  };

  const computeChanges = (cart, data, holidaySet) => {
    const changes = [];
    if (!cart.items || cart.items.length === 0) return changes;

    cart.items.forEach((item) => {
      const props = item.properties || {};
      const { message, leadDays } = getTarget(item, data, holidaySet);

      const messageChanged = props[STOCK_SHIP_PROPERTY] !== message;
      const leadChanged = String(props[STOCK_SHIP_LEAD_DAYS] || '') !== String(leadDays);

      if (messageChanged || leadChanged) {
        changes.push({
          id: item.key,
          properties: {
            ...props,
            [STOCK_SHIP_PROPERTY]: message,
            [STOCK_SHIP_LEAD_DAYS]: String(leadDays)
          }
        });
      }
    });
    return changes;
  };

  const getDataScript = () => document.querySelector('script.cart-ship-by-data');

  const fetchJson = (url, options) => fetch(url, options).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });

  // const runRefreshOnce = () =>
  //   fetchJson('/cart.js')
  //     .then((cart) => {
  //       if (!cart.items || cart.items.length === 0) return null;

  //       const script = getDataScript();
  //       const data = script ? safeParseJson(script.textContent) : null;
  //       if (!data || !Array.isArray(data.holidays)) return null;

  //       const holidaySet = new Set(
  //         data.holidays.map(normalizeToIsoDate).filter(Boolean)
  //       );

  //       const changes = computeChanges(cart, data, holidaySet);
  //       if (changes.length === 0) return null;

  //       return changes.reduce(
  //         (promise, change) => promise.then(() => fetchJson('/cart/change.js', {
  //           method: 'POST',
  //           headers: { 'Content-Type': 'application/json' },
  //           body: JSON.stringify(change)
  //         })),
  //         Promise.resolve()
  //       ).then(() => {
  //         window.setTimeout(() => {
  //           document.dispatchEvent(
  //             new CustomEvent('on:cart:change', { bubbles: true, cancelable: false })
  //           );
  //         }, 250);
  //       });
  //     })
  //     .catch(() => null);

  const fetchShipByData = () =>
  fetch('/cart?view=ship-by-data', { credentials: 'same-origin' })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    })
    .then((text) => {
      const parsed = safeParseJson(text);
      if (!parsed) throw new Error('bad json');
      return parsed;
    })
    .catch(() => {
      const script = getDataScript();
      return script ? safeParseJson(script.textContent) : null;
    });

const runRefreshOnce = () =>
  fetchJson('/cart.js')
    .then((cart) => {
      if (!cart.items || cart.items.length === 0) return null;

      return fetchShipByData().then((data) => {
        if (!data) return null;

        const holidaySet = new Set(
          (Array.isArray(data.holidays) ? data.holidays : [])
            .map(normalizeToIsoDate).filter(Boolean)
        );

        const changes = computeChanges(cart, data, holidaySet);
        if (changes.length === 0) return null;

        return changes.reduce(
          (promise, change) => promise.then(() => fetchJson('/cart/change.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(change)
          })),
          Promise.resolve()
        ).then(() => {
          window.setTimeout(() => {
            document.dispatchEvent(
              new CustomEvent('on:cart:change', { bubbles: true, cancelable: false })
            );
          }, 250);
        });
      });
    })
    .catch(() => null);

  const refreshNow = () => {
    chain = chain.then(() => {
      const now = Date.now();
      if (now - lastRunAt < THROTTLE_MS) return null;
      lastRunAt = now;
      return runRefreshOnce();
    });
    return chain;
  };

  const eventRefresh = () => {
    const now = Date.now();
    if (now - lastEventRefreshAt < EVENT_GATE_MS) return;
    lastEventRefreshAt = now;
    refreshNow();
  };

  const startIdleInterval = () => {
    if (intervalHandle) return;
    intervalHandle = window.setInterval(() => {
      refreshNow();
    }, IDLE_INTERVAL_MS);
  };

  const onReady = () => {
    startIdleInterval();
    refreshNow();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady, { once: true });
  } else {
    onReady();
  }

  window.addEventListener('pageshow', eventRefresh);
  window.addEventListener('focus', eventRefresh);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') eventRefresh();
  });

  document.addEventListener('dispatch:cart-drawer:open', eventRefresh);
  document.addEventListener('on:cart:change', eventRefresh, { passive: true });

  const stopPropagationOfClick = (e) => {
    if (e.defaultPrevented) return;
    e.preventDefault();
  };

  document.addEventListener('click', (e) => {
    const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
    const link = path.find((node) => node && node.nodeType === 1 && node.tagName === 'A' && node.matches('a[href*="/checkout"]'));
    if (!link) return;
    const inCheckoutButtons = link.closest('[data-merge-attributes="checkout-buttons"]');
    if (!inCheckoutButtons) return;

    stopPropagationOfClick(e);

    if (checkoutNavigating) return;

    checkoutNavigating = true;
    const originalHTML = link.innerHTML;
    const originalPointer = link.style.pointerEvents;
    link.innerHTML = 'Updating…';
    link.style.pointerEvents = 'none';

    const navigate = () => {
      window.location.href = link.href;
    };

    refreshNow().then(navigate, navigate);
  }, true);

  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (!form || form.id !== 'cartform') return;
    const submitter = e.submitter;
    if (!submitter || submitter.name !== 'checkout') return;

    if (allowCheckoutSubmit) {
      allowCheckoutSubmit = false;
      return;
    }

    e.preventDefault();

    if (checkoutNavigating) return;

    checkoutNavigating = true;
    const originalText = submitter.textContent;
    submitter.textContent = 'Updating…';

    const proceed = () => {
      checkoutNavigating = false;
      allowCheckoutSubmit = true;
      submitter.textContent = originalText;
      form.requestSubmit(submitter);
    };

    refreshNow().then(proceed, proceed);
  }, true);

  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (!form || !form.classList.contains('js-product-form')) return;
    const productEl = form.closest('.js-product');
    if (!productEl) return;
    if (typeof window.theme.updateStockShipMessage === 'function') {
      window.theme.updateStockShipMessage(productEl);
    }
  }, true);

  window.theme.refreshCartShipBy = refreshNow;
})();