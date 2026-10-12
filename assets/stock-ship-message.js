(() => {
  window.theme = window.theme || {};

  const MADE_FOR_YOU_CONTEXT = { prefix: 'Made for you | Ships by', leadDays: 21 };

  if (typeof window.theme.updateStockShipMessage !== 'function') {
    window.theme.updateStockShipMessage = function (root, opts) {
      const options = opts || {};
      const scope = root && root.querySelector ? root : document;
      const productEl = scope.classList && scope.classList.contains('js-product')
        ? scope
        : scope.querySelector('.js-product');
      if (!productEl) return;

      const holidaysRaw = productEl.dataset.holidays;

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
        if (typeof value === 'object') {
          if (value.value) return normalizeToIsoDate(value.value);
          if (value.date) return normalizeToIsoDate(value.date);
        }
        return null;
      };

      const getVariantPickerData = () => {
        const picker = productEl.querySelector('variant-picker');
        if (!picker) return null;
        const dataEl = picker.querySelector('[type="application/json"]');
        if (!dataEl) return null;
        try {
          return JSON.parse(dataEl.textContent);
        } catch (e) {
          return null;
        }
      };

      const parseInventoryQty = (value) => {
        if (value == null || value === '') return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      };

      const normalizeProductionType = (raw) => (
        (raw || '').trim().toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ')
      );

      const findVariantById = (variants, variantId) => {
        if (!Array.isArray(variants) || variantId == null) return null;
        return variants.find((v) => v.id == variantId) || null;
      };

      const resolveVariant = () => {
        if (Object.prototype.hasOwnProperty.call(options, 'variant')) {
          return options.variant;
        }

        const form = productEl.querySelector('form.js-product-form');
        const idInput = form && form.querySelector('[name="id"]');
        const variantId = idInput && idInput.value ? parseInt(idInput.value, 10) : null;

        if (variantId) {
          if (window.variantData && Array.isArray(window.variantData)) {
            const fromGlobal = findVariantById(window.variantData, variantId);
            if (fromGlobal) return fromGlobal;
          }

          const pickerData = getVariantPickerData();
          if (pickerData && Array.isArray(pickerData.variants)) {
            const fromPicker = findVariantById(pickerData.variants, variantId);
            if (fromPicker) return fromPicker;
          }
        }

        // Default-variant products: no picker UI, use the only available variant.
        if (window.variantData && Array.isArray(window.variantData) && window.variantData.length === 1) {
          return window.variantData[0];
        }

        return null;
      };

      const getInventoryQuantity = (variant) => {
        if (!variant) return 0;

        const directQty = parseInventoryQty(variant.inventory_quantity);
        if (directQty != null) return directQty;

        const pickerData = getVariantPickerData();
        const formattedEntry = pickerData
          && pickerData.formatted
          && (pickerData.formatted[variant.id] || pickerData.formatted[String(variant.id)]);
        const formattedQty = parseInventoryQty(formattedEntry && formattedEntry.inventory);
        if (formattedQty != null) return formattedQty;

        // Default-variant products hide the picker, so inventory_quantity is often
        // missing from JSON. Fall back to availability for shipping messaging.
        if (variant.available === true) return 1;
        return 0;
      };

      const resolveShippingContext = (variant) => {
        if (!variant) {
          return MADE_FOR_YOU_CONTEXT;
        }

        const inventoryQty = getInventoryQuantity(variant);
        if (inventoryQty > 0) {
          return { prefix: 'In stock | Ships by', leadDays: 3 };
        }

        const productionType = normalizeProductionType(productEl.dataset.productionType);
        if (productionType === 'in stock') {
          return { prefix: 'In stock | Ships by', leadDays: 3 };
        }
        if (productionType === 'semi mount rts') {
          return { prefix: 'Crafted for you | Ships by', leadDays: 7 };
        }
        if (productionType === 'semi mount sourced') {
          return { prefix: 'Crafted for you | Ships by', leadDays: 14 };
        }
        if (productionType === 'made to order') {
          return { prefix: 'Made for you | Ships by', leadDays: 21 };
        }

        return MADE_FOR_YOU_CONTEXT;
      };

      const holidaysArr = safeParseJson(holidaysRaw);
      const holidaySet = new Set(
        Array.isArray(holidaysArr)
          ? holidaysArr.map(normalizeToIsoDate).filter(Boolean)
          : []
      );

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
      const isSundayUtc = (d) => d.getUTCDay() === 0;
      const isHolidayUtc = (d) => holidaySet.has(isoFromDateUtc(d));
      const isNonWorkingUtc = (d) => isSundayUtc(d) || isHolidayUtc(d);

      const nextWorkingDayUtc = (d) => {
        const out = new Date(d.getTime());
        while (isNonWorkingUtc(out)) out.setUTCDate(out.getUTCDate() + 1);
        return out;
      };

      const addWorkingDaysUtc = (startUtcDate, workingDaysToAdd) => {
        let d = new Date(startUtcDate.getTime());
        let added = 0;
        while (added < workingDaysToAdd) {
          d.setUTCDate(d.getUTCDate() + 1);
          if (!isNonWorkingUtc(d)) added += 1;
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

      const formatShipByLongDate = (dUtc) => {
        const dayNum = dUtc.getUTCDate();
        const weekdayShort = WEEKDAY_SHORT[dUtc.getUTCDay()];
        const monthShort = MONTH_SHORT[dUtc.getUTCMonth()];
        return `${weekdayShort}, ${monthShort} ${dayNum}${ordinalSuffix(dayNum)}`;
      };

      const variant = resolveVariant();
      const shippingContext = resolveShippingContext(variant);
      const { prefix, leadDays } = shippingContext;

      const { year, month, day, hour } = getNyNowParts();
      const beforeCutoff = hour < 12;

      let day0 = dateFromYmdUtc(year, month, day);
      if (!beforeCutoff) day0.setUTCDate(day0.getUTCDate() + 1);
      day0 = nextWorkingDayUtc(day0);

      const shipBy = addWorkingDaysUtc(day0, leadDays);
      const shipByStr = formatShipByLongDate(shipBy);
      const messageText = `${prefix} ${shipByStr}.`;

      const estimatedWrap = productEl.querySelector('.tp-estimated-date');
      if (estimatedWrap) {
        estimatedWrap.style.display = '';

        const existingInStock = estimatedWrap.querySelector('.tp-in-stock');
        const existingMadeToOrder = estimatedWrap.querySelector('.tp-made-to-order');
        if (existingInStock) existingInStock.style.display = 'none';
        if (existingMadeToOrder) existingMadeToOrder.style.display = 'none';

        let msgEl = estimatedWrap.querySelector('.tp-stock-ship-message');
        if (!msgEl) {
          msgEl = document.createElement('span');
          msgEl.className = 'tp-stock-ship-message';
          estimatedWrap.appendChild(msgEl);
        }
        msgEl.innerHTML = `${prefix} <span>${shipByStr}</span>.`;
        msgEl.style.display = 'inline';
      }

      const propInput = productEl.querySelector('form.js-product-form .js-stock-ship-message-property');
      if (propInput) propInput.value = messageText;

      const leadDaysInput = productEl.querySelector('form.js-product-form .js-stock-ship-lead-days-property');
      if (leadDaysInput) leadDaysInput.value = String(leadDays);
    };
  }

  const run = () => {
    if (!window.theme || typeof window.theme.updateStockShipMessage !== 'function') return;

    const products = document.querySelectorAll('.js-product');
    if (products.length === 0) {
      window.theme.updateStockShipMessage(document);
      return;
    }

    products.forEach((productEl) => {
      window.theme.updateStockShipMessage(productEl);
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();

  document.addEventListener('on:variant:change', (e) => {
    const section = e && e.detail && e.detail.form ? e.detail.form.closest('.js-product') : null;
    const variant = e && e.detail ? e.detail.variant : undefined;
    if (window.theme && typeof window.theme.updateStockShipMessage === 'function') {
      window.theme.updateStockShipMessage(section || document, { variant });
    }
  });
})();
