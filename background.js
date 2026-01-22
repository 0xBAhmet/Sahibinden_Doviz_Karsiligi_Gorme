// background.js

const API_URL = "https://api.exchangerate-api.com/v4/latest/USD";
const HISTORICAL_API_URL_BASE = "https://api.frankfurter.app";

// Cache rates to avoid hitting API limit
let cachedRates = null;
let lastFetchTime = 0;
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

async function getRates() {
  const now = Date.now();
  if (cachedRates && (now - lastFetchTime < CACHE_DURATION)) {
    return cachedRates;
  }

  try {
    const response = await fetch(API_URL);
    const data = await response.json();
    cachedRates = data.rates;
    lastFetchTime = now;
    return cachedRates;
  } catch (error) {
    console.error("Failed to fetch rates:", error);
    return null;
  }
}

// --- HISTORICAL RATES ---
async function fetchHistoricalRate(dateStr) {
  // dateStr expected: YYYY-MM-DD
  try {
    console.log(`EXT: Fetching historical rate for ${dateStr}...`);
    // We typically want "How many TRY was 1 USD?" => from=USD, to=TRY
    const response = await fetch(`${HISTORICAL_API_URL_BASE}/${dateStr}?from=USD&to=TRY,EUR`);
    const data = await response.json();

    if (data && data.rates) {
      return {
        USD: data.rates.TRY,
        EUR: data.rates.TRY / data.rates.EUR
      };
    }
  } catch (e) {
    console.error("Historical fetch failed", e);
  }
  return null;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "GET_RATES") {
    getRates().then(rates => {
      sendResponse({ rates: rates });
    });
    return true; // Keep channel open for async response
  }

  if (request.type === "SAVE_FAVORITE") {
    const { ilanID, priceTL } = request.payload;

    getRates().then(rates => {
      if (!rates) {
        console.error("No rates available to save.");
        return;
      }

      const currentDollarRate = rates.TRY;
      const currentEuroRate = rates.TRY / rates.EUR;

      const newEntry = {
        [ilanID]: {
          tarih: new Date().toLocaleDateString("tr-TR"),
          orjinalFiyatTL: priceTL,
          dolarKuru: currentDollarRate,
          euroKuru: currentEuroRate
        }
      };

      chrome.storage.local.get(null, (items) => {
        const allData = { ...items, ...newEntry };
        chrome.storage.local.set(allData, () => {
          console.log(`Saved data for ${ilanID}`, newEntry);
        });
      });
    });
  }
  else if (request.type === "SAVE_HISTORICAL_FAVORITE") {
    const { ilanID, priceTL, dateStr, isoDate } = request.payload;

    // ALWAY FETCH & UPDATE (Fixes "Auto-Sync" data)
    fetchHistoricalRate(isoDate).then(rates => {
      if (!rates) {
        console.warn("Could not retrieve historical rates for", isoDate);
        return;
      }

      chrome.storage.local.get(ilanID, (data) => {
        let record = data[ilanID] || {}; // Get existing or new

        // Update the "Original" baseline data
        record.tarih = dateStr;
        record.orjinalFiyatTL = priceTL;
        record.dolarKuru = rates.USD;
        record.euroKuru = rates.EUR;

        // Ensure active if not set
        if (record.active === undefined) record.active = true;

        const update = {};
        update[ilanID] = record;

        chrome.storage.local.set(update, () => {
          console.log(`Updated HISTORICAL data for ${ilanID}`, record);
        });
      });
    });
  }
  else if (request.type === "UPDATE_PRICE") {
    const { ilanID, priceTL } = request.payload;

    chrome.storage.local.get(ilanID, (data) => {
      let record = data[ilanID];
      if (!record) return; // Should exist if we are updating

      // 1. Initialize priceHistory if missing (Migration)
      if (!record.priceHistory) {
        record.priceHistory = [{
          priceTL: record.orjinalFiyatTL,
          dolarKuru: record.dolarKuru,
          euroKuru: record.euroKuru,
          tarih: record.tarih
        }];
      }

      // 2. Check if Price Changed (Lower)
      // Get the last recorded price
      const lastEntry = record.priceHistory[record.priceHistory.length - 1];

      // Only update if price is DIFFERENT (User asked for "düştüğünde" / drops, but tracking changes is standard. Let's stick to drops or changes? User said "fiyatı düştüğünde" (when price drops).
      // Let's be strict: Only if NEW < OLD.
      if (priceTL < lastEntry.priceTL) {

        getRates().then(rates => {
          const currentDollarRate = rates.TRY;
          const currentEuroRate = rates.TRY / rates.EUR;
          const today = new Date().toLocaleDateString("tr-TR");

          const newEntry = {
            priceTL: priceTL,
            dolarKuru: currentDollarRate,
            euroKuru: currentEuroRate,
            tarih: today
          };

          // Add to history
          record.priceHistory.push(newEntry);

          // 3. Limit to 3 items
          if (record.priceHistory.length > 3) {
            record.priceHistory.shift(); // Remove oldest
          }

          // Update "Current" fields for easy access/compatibility
          record.orjinalFiyatTL = priceTL; // Update main price to current
          record.dolarKuru = currentDollarRate;
          record.euroKuru = currentEuroRate;
          record.tarih = today;

          const updateData = {};
          updateData[ilanID] = record;

          chrome.storage.local.set(updateData, () => {
            console.log(`Price Drop Saved for ${ilanID}:`, newEntry);
          });
        });
      }
    }); // End storage.get
  }
  else if (request.type === "MARK_INACTIVE") {
    const { ilanID } = request.payload;
    chrome.storage.local.get(ilanID, (data) => {
      const record = data[ilanID];
      if (record) {
        record.active = false;
        const update = {};
        update[ilanID] = record;
        chrome.storage.local.set(update, () => {
          console.log(`Marked ${ilanID} as inactive.`);
        });
      }
    });
  }
});
