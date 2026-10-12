/**
 * Dependencies:
 * - Custom select component
 *
 * Required translation strings:
 * - addToCart
 * - noStock
 * - noVariant
 * - onlyXLeft
 */

if (!customElements.get('variant-picker')) {
  class VariantPicker extends HTMLElement {
    constructor() {
      
      super();
      this.section = this.closest('.js-product');
      this.productForm = this.section.querySelector('.js-product-form');
      this.optionSelectors = this.querySelectorAll('.option-selector:not(.option-selector--custom)');
      this.nativeSelector = document.getElementById(`variants-${this.section.dataset.section}`);
      this.data = this.getVariantData();
      this.selectedOptions = this.getSelectedOptions();
      this.variant = this.getSelectedVariant();
      console.log('variant', this.variant);
      this.applyAvailabilityFromServerOrLocal();
      this.updateAddToCartButton();
      if (window.theme && typeof window.theme.updateStockShipMessage === 'function') {
        window.theme.updateStockShipMessage(this.section, { variant: this.variant });
      }
      this.boundHandleVariantChange = this.handleVariantChange.bind(this);
      this.addEventListener('change', this.boundHandleVariantChange, true);
      this.setAttribute('loaded', '');
      this.maybeFetchVariantOnLoad();
      
    }

    /**
     * Handles 'change' events on the variant picker element.
     * @param {object} evt - Event object.
     */
    handleVariantChange(evt) {
      this.selectedOptions = this.getSelectedOptions();
      this.variant = this.getSelectedVariant();

      // High-variant support: if selection not in first 250, fetch via Section Rendering API
      const optionValueIds = this.getSelectedOptionValueIds();
      const sectionId = this.dataset.sectionId;
      const canFetch = sectionId && optionValueIds.length === this.optionSelectors.length && optionValueIds.every(Boolean);
      if (!this.variant && canFetch) {
        this.fetchVariantByOptionValues(optionValueIds, evt);
        return;
      }
      console.log('variant', this.variant);
      this.preSelection = !this.variant && this.selectedOptions.find((o) => o === null) === null;
      this.updateUrl(evt);
      this.updateVariantInput();
      this.updateAddToCartButton();
      this.updateAvailability();
      this.updatePrice();
      this.updateBackorderText();
      this.updatePickupAvailability();
      this.updateSku();
      this.updateBarcode();
      VariantPicker.updateLabelText(evt);
      if (window.theme && typeof window.theme.updateStockShipMessage === 'function') {
        window.theme.updateStockShipMessage(this.section, { variant: this.variant });
      }
      this.dispatchEvent(new CustomEvent('on:variant:change', {
        bubbles: true,
        detail: {
          form: this.productForm,
          variant: this.variant,
          allVariants: this.data.variants,
          selectedOptions: this.selectedOptions
        }
      }));
    }

    /**
     * Fetches section with option_values to resolve variant when selection is outside first 250.
     * @param {string[]} optionValueIds - Selected option value IDs.
     * @param {object} evt - Original change event.
     */
    fetchVariantByOptionValues(optionValueIds, evt) {
      const productUrl = this.dataset.url;
      const sectionId = this.dataset.sectionId;
      if (!productUrl || !sectionId) return;
      const baseUrl = `${window.location.origin}${productUrl}`;
      const separator = baseUrl.indexOf('?') >= 0 ? '&' : '?';
      const url = `${baseUrl}${separator}section_id=${sectionId}&option_values=${optionValueIds.join(',')}`;
      fetch(url)
        .then((response) => response.text())
        .then((html) => {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const scriptEl = doc.querySelector('script.current-variant-json');
          if (!scriptEl) return;
          let payload;
          try {
            payload = JSON.parse(scriptEl.textContent);
          } catch (e) {
            return;
          }
          const { variant, formatted } = payload;
          this.variant = variant || null;
          if (variant && formatted && formatted[variant.id]) {
            if (!variant.options && (variant.option1 != null || variant.option2 != null)) {
              variant.options = [variant.option1, variant.option2, variant.option3].filter((o) => o != null);
            }
            if (!this.data.variants.some((v) => v.id === variant.id)) {
              this.data.variants.push(variant);
            }
            this.data.formatted[variant.id] = formatted[variant.id];
            if (window.variantData && !window.variantData.some((v) => v.id === variant.id)) {
              window.variantData.push(variant);
            }
          }
          this.preSelection = false;
          this.selectedOptions = this.getSelectedOptions();
          if (payload.option_availability && payload.option_availability.length > 0) {
            this.applyOptionAvailability(payload.option_availability);
          } else {
            this.updateAvailability();
          }
          this.updateUrl(evt);
          this.updateVariantInput();
          this.updateAddToCartButton();
          this.updatePrice();
          this.updateBackorderText();
          this.updatePickupAvailability();
          this.updateSku();
          this.updateBarcode();
          VariantPicker.updateLabelText(evt);
          if (window.theme && typeof window.theme.updateStockShipMessage === 'function') {
            window.theme.updateStockShipMessage(this.section, { variant: this.variant });
          }
          this.dispatchEvent(new CustomEvent('on:variant:change', {
            bubbles: true,
            detail: {
              form: this.productForm,
              variant: this.variant,
              allVariants: this.data.variants,
              selectedOptions: this.selectedOptions
            }
          }));
        })
        .catch(() => {
          this.updateAddToCartButton();
        });
    }

    /**
     * Get selected option value IDs (for Section Rendering API with option_values).
     * @returns {string[]} Array of option value IDs, one per selector; empty if not available.
     */
    
    getSelectedOptionValueIds() {
      const ids = [];
      this.optionSelectors.forEach((selector) => {
        if (selector.dataset.selectorType === 'dropdown') {
          const selected = selector.querySelector('.custom-select__option[aria-selected="true"]');
          const id = selected && selected.dataset.optionValueId;
          ids.push(id || '');
        } else {
          const selected = selector.querySelector('input:checked');
          ids.push(selected && selected.dataset.optionValueId ? selected.dataset.optionValueId : '');
        }
      });
      return ids;
    }
    // custom variant getQuanity
      variantQuanity() {
      const variantScript = this.querySelector(`script[data-variant="${this.variant.id}"]`);
      if (!variantScript) {
          console.error(`Variant script for variant ID ${this.variant.id} not found.`);
          return null;
      }
      const quantity = parseInt(variantScript.getAttribute('data-quantity'));
      return quantity;
    }
    getInventory(variantId) {
      if (variantId in this.data.formatted) {
        return this.data.formatted[variantId].inventory;
        }else {
        return null;
      }
    }

    /**
     * Updates the "Add to Cart" button label and status.
     */
    updateAddToCartButton() {
      if (typeof this.variant === 'undefined' || this.variant === null) {
        this.addBtn = this.addBtn || this.productForm.querySelector('[name="add"]');
        this.addBtn.textContent = 'Unavailable';
        this.addBtn.disabled = true;
        return;
      }
      const variant_ID = this.variant.id;
      let variant = window.variantData && window.variantData.find((v) => v.id == variant_ID);
      if (!variant) variant = this.variant;
      if (!variant.options && (variant.option1 != null || variant.option2 != null)) {
        variant.options = [variant.option1, variant.option2, variant.option3].filter((o) => o != null);
      }

      const varinatInventory = this.getInventory(this.variant.id);
      if (!this.productForm) return;
      if (this.selectedOptions.indexOf(null) > -1 && !this.variant) return;

      this.addBtn = this.addBtn || this.productForm.querySelector('[name="add"]');
      if (!this.addBtn) return;
      const variantAvailable = this.variant && this.variant.available;
  
        const unavailableStr = this.variant.available ? 'Add to Cart' : 'Sold Out';


        // "Ships by" messaging: inventory first, then production type (see `stock-ship-message.js`).
        if (window.theme && typeof window.theme.updateStockShipMessage === 'function') {
          window.theme.updateStockShipMessage(this.section, { variant: this.variant });
        }

        // let shippingDateElement = document.querySelector('.product-info-block .ship-date strong');
        // let shippingInfoElement = document.querySelector('.product-info-block .ship-info');
        // let quantity = this.variantQuanity();
        // if(varinatInventory<1){
        //   let shippingDateInfo = window.theme.shippingDate(14);
        //   shippingDateElement.innerHTML = shippingDateInfo;
        //   shippingInfoElement.innerText = "Made-to-Order | Free Shipping | Free Returns";
        // }else{
        //   let shippingDateInfo = window.theme.shippingDate(4);
        //   shippingDateElement.innerHTML = shippingDateInfo;
        //   shippingInfoElement.innerText = "Free Shipping | Free Returns";
        // }
        this.addBtn.disabled = !variantAvailable;
         
        this.addBtn.textContent = variantAvailable
          ? this.addBtn.dataset.addToCartText
          : unavailableStr;
  
         if (unavailableStr === 'Sold Out') {
              this.addBtn.disabled = true;
          } else {
              this.addBtn.disabled = false;
          }
    }

    /**
     * Reads availability from server (current-variant-json script with option_availability) or falls back to local variant data.
     */
    applyAvailabilityFromServerOrLocal() {
      const scriptEl = this.parentElement && this.parentElement.querySelector('script.current-variant-json');
      if (scriptEl) {
        try {
          const payload = JSON.parse(scriptEl.textContent);
          if (payload.option_availability && payload.option_availability.length > 0) {
            this.applyOptionAvailability(payload.option_availability);
            if (payload.variant && !this.variant) {
              this.variant = payload.variant;
              if (!this.variant.options && (this.variant.option1 != null || this.variant.option2 != null)) {
                this.variant.options = [this.variant.option1, this.variant.option2, this.variant.option3].filter((o) => o != null);
              }
              if (!this.data.variants.some((v) => v.id === this.variant.id)) {
                this.data.variants.push(this.variant);
              }
              if (payload.formatted && payload.formatted[this.variant.id]) {
                this.data.formatted[this.variant.id] = payload.formatted[this.variant.id];
              }
              if (window.variantData && !window.variantData.some((v) => v.id === this.variant.id)) {
                window.variantData.push(this.variant);
              }
            }
            return;
          }
        } catch (e) { /* fall through to local */ }
      }
      this.updateAvailability();
    }

    /**
     * On load: if variant is not in first 250 but we have option value IDs, fetch to get variant + server availability.
     */
    maybeFetchVariantOnLoad() {
      const optionValueIds = this.getSelectedOptionValueIds();
      const sectionId = this.dataset.sectionId;
      const canFetch = sectionId && optionValueIds.length === this.optionSelectors.length && optionValueIds.every(Boolean);
      if (!this.variant && canFetch) {
        this.fetchVariantByOptionValues(optionValueIds, null);
      }
    }

    /**
     * Applies option availability from server/fetch (option_availability array).
     * Each item: { position, values: [ { value, id, available } ] }.
     * Use this when we have server data so availability is correct for 250+ variant products.
     */
    applyOptionAvailability(optionAvailability) {
      if (!Array.isArray(optionAvailability) || optionAvailability.length === 0) return;
      this.optionSelectors.forEach((selector, selectorIndex) => {
        const optionData = optionAvailability[selectorIndex] || optionAvailability.find((o) => o.position === selectorIndex + 1);
        if (!optionData || !Array.isArray(optionData.values)) return;
        const options = selector.querySelectorAll('.js-option:not([data-value=""])');
        options.forEach((optionEl) => {
          const val = selector.dataset.selectorType === 'dropdown' ? optionEl.dataset.value : optionEl.value;
          const entry = optionData.values.find((v) => String(v.value) === String(val));
          const exists = !!entry;
          const available = exists && !!entry.available;
          VariantPicker.updateOptionAvailability(optionEl, exists, available);
        });
      });
    }

    /**
     * Updates the availability status of an option.
     * @param {Element} optionEl - Option element.
     * @param {boolean} exists - Does this option lead to a variant that exists?
     * @param {boolean} available - Does this option lead to a variant that is available to buy?
     */
    static updateOptionAvailability(optionEl, exists, available) {
      const el = optionEl;
      // Fallback to server-rendered Liquid availability when provided on option elements.
      if (el.dataset && el.dataset.available === 'true') {
        exists = true;
        available = true;
      }

      const unavailableText = exists ? (theme.strings && theme.strings.noStock) : (theme.strings && theme.strings.noVariant);
      el.classList.toggle('is-unavailable', !available);
      el.classList.toggle('is-nonexistent', !exists);

      if (optionEl.classList.contains('custom-select__option')) {
        const em = el.querySelector('em');
        if (em) {
          em.hidden = available;
          if (!available && unavailableText) em.textContent = unavailableText;
        } else if (!available && unavailableText) {
          el.setAttribute('title', unavailableText);
        }
        if (available) {
          el.removeAttribute('title');
        }
      } else {
        const label = el.nextElementSibling;
        if (label) {
          if (!available && unavailableText) label.title = unavailableText;
          else label.removeAttribute('title');
        }
      }
    }

    /**
     * Updates the availability status in option selectors.
     */
    updateAvailability() {
      if (this.dataset.showAvailability === 'false') return;
      const { availabilityMode } = this.dataset; // 'down' or 'selection'
      let currVariant = this.variant;

      if (!this.variant) {
        currVariant = { options: this.selectedOptions };
      }

      const getVariantOptions = (v) => v.options || [v.option1, v.option2, v.option3].filter((o) => o != null);
      const currOptions = currVariant.options || getVariantOptions(currVariant);

      if (availabilityMode === 'selection') {
        // Start with all options unavailable, then enable only those that match a variant in our data
        this.querySelectorAll('.js-option').forEach((optionEl) => {
          VariantPicker.updateOptionAvailability(optionEl, false, false);
        });

        this.optionSelectors.forEach((selector, selectorIndex) => {
          this.data.variants.forEach((variant) => {
            const vOptions = getVariantOptions(variant);
            let matchCount = 0;

            vOptions.forEach((option, optionIndex) => {
              if (option === currOptions[optionIndex] && optionIndex !== selectorIndex) {
                matchCount += 1;
              }
            });

            if (matchCount === currOptions.length - 1) {
              const options = selector.querySelectorAll('.js-option');
              const optionEl = Array.from(options).find((opt) => {
                if (selector.dataset.selectorType === 'dropdown') {
                  return opt.dataset.value === vOptions[selectorIndex];
                }
                return opt.value === vOptions[selectorIndex];
              });

              if (optionEl) {
                VariantPicker.updateOptionAvailability(optionEl, true, variant.available);
              }
            }
          });
        });
      } else {
        // For each option: only enable if there is at least one variant with that option (and previous selections)
        this.optionSelectors.forEach((selector, selectorIndex) => {
          const options = selector.querySelectorAll('.js-option:not([data-value=""])');
          options.forEach((option) => {
            const optionValue = selector.dataset.selectorType === 'dropdown' ? option.dataset.value : option.value;
            let variantsExist = false;
            let variantsAvailable = false;
            this.data.variants.forEach((v) => {
              const vOpts = getVariantOptions(v);
              let matches = 0;
              for (let i = 0; i < selectorIndex; i += 1) {
                if (vOpts[i] === this.selectedOptions[i] || this.selectedOptions[i] === null) {
                  matches += 1;
                }
              }
              if (vOpts[selectorIndex] === optionValue && matches === selectorIndex) {
                variantsExist = true;
                if (v.available) {
                  variantsAvailable = true;
                }
              }
            });
            VariantPicker.updateOptionAvailability(option, variantsExist, variantsAvailable);
          });
        });
      }

      // When we have the current variant (e.g. from fetch), ensure selected option(s) show its real availability
      if (this.variant) {
        const getOpts = (v) => v.options || [v.option1, v.option2, v.option3].filter((o) => o != null);
        const selectedOpts = getOpts(this.variant);
        this.optionSelectors.forEach((selector, idx) => {
          const optionValue = selectedOpts[idx];
          if (optionValue == null) return;
          const options = selector.querySelectorAll('.js-option:not([data-value=""])');
          const optionEl = Array.from(options).find((opt) => {
            const val = selector.dataset.selectorType === 'dropdown' ? opt.dataset.value : opt.value;
            return val === optionValue;
          });
          if (optionEl) {
            VariantPicker.updateOptionAvailability(optionEl, true, this.variant.available);
          }
        });
      }
    }

    /**
     * Updates the backorder text and visibility.
     */
    updateBackorderText() {
      this.backorder = this.backorder || this.section.querySelector('.backorder');
      if (!this.backorder) return;

      let hideBackorder = true;

      if (this.variant && this.variant.available) {
        const { inventory } = this.data.formatted[this.variant.id];

        if (this.variant.inventory_management && inventory === 'none') {
          const backorderProdEl = this.backorder.querySelector('.backorder__product');
          const prodTitleEl = this.section.querySelector('.product-title');
          const variantTitle = this.variant.title.includes('Default') ? '' : ` - ${this.variant.title}`;

          backorderProdEl.textContent = `${prodTitleEl.textContent}${variantTitle}`;
          hideBackorder = false;
        }
      }

      this.backorder.hidden = hideBackorder;
    }

    /**
     * Updates the colour option label text.
     * @param {object} evt - Event object
     */
    static updateLabelText(evt) {
      const selector = evt.target.closest('.option-selector');
      if (selector.dataset.selectorType === 'dropdown') return;

      const colorText = selector.querySelector('.js-color-text');
      if (!colorText) return;

      colorText.textContent = evt.target.nextElementSibling.querySelector('.js-value').textContent;
    }

    /**
     * Updates the pick up availability.
     */
    updatePickupAvailability() {
      this.pickUpAvailability = this.pickUpAvailability || this.section.querySelector('pickup-availability');
      if (!this.pickUpAvailability) return;

      if (this.variant && this.variant.available) {
        this.pickUpAvailability.getAvailability(this.variant.id);
      } else {
        this.pickUpAvailability.removeAttribute('available');
        this.pickUpAvailability.innerHTML = '';
      }
    }

    /**
     * Updates the price.
     */
    updatePrice() {
      this.price = this.price || this.section.querySelector('.product-price .price');
      if (!this.price) return;

      let { variant } = this;
      if (this.preSelection) {
        variant = this.data.variants[0];
        for (let i = 1; i < this.data.variants.length; i += 1) {
          if (this.data.variants[i].price < variant.price) variant = this.data.variants[i];
        }
      }

      if (variant) {
        const priceCurrentEl = this.price.querySelector('.price__current');
        const priceWasEl = this.price.querySelector('.price__was');
        const unitPriceEl = this.price.querySelector('.unit-price');

        // Update current price and original price if on sale.
        priceCurrentEl.innerHTML = this.data.formatted[variant.id].price;
        if (priceWasEl) priceWasEl.innerHTML = this.data.formatted[variant.id].compareAtPrice || '';

        // Update unit price, if specified.
        if (variant.unit_price_measurement) {
          const valueEl = this.price.querySelector('.unit-price__price');
          const unitEl = this.price.querySelector('.unit-price__unit');
          const value = variant.unit_price_measurement.reference_value;
          const unit = variant.unit_price_measurement.reference_unit;

          valueEl.innerHTML = this.data.formatted[variant.id].unitPrice;
          unitEl.textContent = value === 1 ? unit : `${value} ${unit}`;
          unitPriceEl.hidden = false;
        } else if (unitPriceEl) {
          unitPriceEl.hidden = true;
        }

        this.price.classList.toggle('price--on-sale', variant.compare_at_price > variant.price);
        this.price.classList.toggle('price--sold-out', !variant.available && !this.preSelection);
      }

      this.price.querySelector('.price__default').hidden = !this.variant && !this.preSelection;
      this.price.querySelector('.price__no-variant').hidden = this.variant || this.preSelection;
      const from = this.price.querySelector('.price__from');
      if (from) {
        from.hidden = !this.preSelection;
      }
    }

    /**
     * Updates the SKU.
     */
    updateSku() {
      this.sku = this.sku || this.section.querySelector('.product-sku__value');
      if (!this.sku) return;

      const skuAvailable = this.variant && this.variant.sku;
      this.sku.textContent = skuAvailable ? this.variant.sku : '';
      this.sku.parentNode.hidden = !skuAvailable;
    }

    /**
     * Updates the Barcode.
     */
    updateBarcode() {
      this.barcode = this.barcode || this.section.querySelector('.product-barcode__value');
      if (!this.barcode) return;

      const barcodeAvailable = this.variant && this.variant.barcode;
      this.barcode.textContent = barcodeAvailable ? this.variant.barcode : '';
      this.barcode.parentNode.hidden = !barcodeAvailable;
    }

    /**
     * Updates the url with the selected variant id.
     * @param {object} evt - Event object.
     */
    updateUrl(evt) {
      if (!evt || evt.type !== 'change' || this.dataset.updateUrl === 'false') return;
      const url = this.variant ? `${this.dataset.url}?variant=${this.variant.id}` : this.dataset.url;
      window.history.replaceState({ }, '', url);
    }

    /**
     * Updates the value of the hidden [name="id"] form inputs.
     */
    updateVariantInput() {
      this.forms = this.forms || this.section.querySelectorAll('.js-product-form, .js-instalments-form');

      this.forms.forEach((form) => {
        const input = form.querySelector('[name="id"]');
        input.value = this.variant ? this.variant.id : '';
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }

    /**
     * Gets the variant data for a product.
     * @returns {?object}
     */
    getVariantData() {
      const dataEl = this.querySelector('[type="application/json"]');
      return JSON.parse(dataEl.textContent);
    }

    /**
     * Get the selected values from a list of variant options.
     * @returns {Array} Array of selected option values, value is null if not selected.
     */
    getSelectedOptions() {
      const selectedOptions = [];

      this.optionSelectors.forEach((selector) => {
        if (selector.dataset.selectorType === 'dropdown') {
          const selected = selector.querySelector('.custom-select__option[aria-selected="true"]');
          selectedOptions.push(selected && selected.dataset.value !== '' ? selected.dataset.value : null);
        } else {
          const selected = selector.querySelector('input:checked');
          selectedOptions.push(selected ? selected.value : null);
        }
      });
      return selectedOptions;
    }

    /**
     * Get selected variant data.
     * @returns {?object} Variant object, or null if one is not selected.
     */
    getSelectedVariant() {
      const getOpts = (v) => v.options || [v.option1, v.option2, v.option3].filter((o) => o != null);
      return this.data.variants.find((v) => {
        const opts = getOpts(v);
        return opts.length === this.selectedOptions.length && opts.every((val, index) => val === this.selectedOptions[index]);
      });
    }
  }

  customElements.define('variant-picker', VariantPicker);
}
