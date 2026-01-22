// content.js
console.log("Sahibinden Döviz Takipçisi v1.17 (Real-Time Sync) active.");

// --- UTILS ---
function parsePrice(priceStr) {
    if (!priceStr) return 0;
    const cleanStr = priceStr.replace(/\D/g, '');
    return parseInt(cleanStr, 10) || 0;
}

function formatCurrency(amount, currency) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency, maximumFractionDigits: 0 }).format(amount);
}

function parseTurkishDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.trim().split(/\s+/);
    if (parts.length < 3) return null;

    const day = parts[0].replace('.', '').padStart(2, '0');
    const monthName = parts[1].toLowerCase();
    const year = parts[2];

    const months = {
        'ocak': '01', 'subat': '02', 'şubat': '02', 'mart': '03', 'nisan': '04', 'mayis': '05', 'mayıs': '05',
        'haziran': '06', 'temmuz': '07', 'agustos': '08', 'ağustos': '08', 'eylul': '09', 'eylül': '09',
        'ekim': '10', 'kasim': '11', 'kasım': '11', 'aralik': '12', 'aralık': '12'
    };

    const month = months[monthName];
    if (!month) return null;

    return `${year}-${month}-${day}`;
}

// --- TOAST UI ---
function showToast(message, color = 'green') {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed; bottom: 20px; right: 20px; 
        background-color: ${color === 'green' ? '#22c55e' : '#ef4444'}; 
        color: white; padding: 10px 20px; border-radius: 8px; 
        z-index: 99999; font-family: sans-serif; font-weight: bold;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        animation: fadein 0.5s, fadeout 0.5s 4.5s;
    `;
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
}

// --- BADGE RENDERER (Reusable) ---
function updateBadgeForRow(item, record) {
    if (!item || !record) return;

    // Check if we need to clean up old badge
    const existingBadge = item.querySelector('.sahibinden-doviz-badge');
    if (existingBadge) existingBadge.remove();

    const priceEl = item.querySelector('.col-price div.va-price') ||
        item.querySelector('.favorite-feature-col-price .va-price') ||
        item.querySelector('.searchResultsPriceValue') ||
        item.querySelector('.classified-price-container');

    if (!priceEl) return;

    // Inactive Check (Visual only)
    const isPassive = item.classList.contains('passive-classified') ||
        item.querySelector('.classified-expired-text') ||
        (item.textContent && item.textContent.includes('Yayında değil')) ||
        record.active === false;

    const badge = document.createElement('div');
    badge.className = 'sahibinden-doviz-badge';
    const badgeBg = isPassive ? '#f3f4f6' : '#f0fdf4';
    const badgeBorder = isPassive ? '#d1d5db' : '#bbf7d0';
    const badgeText = isPassive ? '#374151' : '#166534';

    badge.style.cssText = `background-color: ${badgeBg}; border: 1px solid ${badgeBorder}; border-radius: 4px; padding: 2px 5px; font-size: 10px; color: ${badgeText}; margin-top: 4px; line-height: 1.2; width: fit-content; z-index: 999; position: relative; clear: both; float: right;`;

    let badgeHtml = '';
    if (isPassive) badgeHtml += '<div style="color:red; font-weight:bold; font-size:9px; margin-bottom:2px;">⚠️ YAYINDA DEĞİL</div>';

    if (record.priceHistory && record.priceHistory.length > 0) {
        const history = [...record.priceHistory].reverse().slice(0, 3);
        history.forEach((entry, index) => {
            const usd = entry.priceTL / (entry.dolarKuru || 1);
            const eur = entry.priceTL / (entry.euroKuru || 1);
            const isLatest = index === 0;
            badgeHtml += `
                <div style="${isLatest ? 'font-weight:bold; border-bottom:1px solid ' + badgeBorder + '; padding-bottom:2px; margin-bottom:2px;' : 'opacity:0.8; margin-top:2px; font-size:9px;'}">
                    <div style="color:#666; font-size:8px;">${entry.tarih}</div>
                    <div style="color:#000;">${entry.priceTL.toLocaleString()} TL</div>
                    <div>${formatCurrency(usd, 'USD')} | ${formatCurrency(eur, 'EUR')}</div>
                </div>
                `;
        });
    } else {
        const usdPrice = record.orjinalFiyatTL / (record.dolarKuru || 1);
        const eurPrice = record.orjinalFiyatTL / (record.euroKuru || 1);
        badgeHtml += `
            <div style="font-weight:600; font-size:9px; color:#999; margin-bottom:1px;">${record.tarih}</div>
            <div>${formatCurrency(usdPrice, 'USD')}</div>
            <div>${formatCurrency(eurPrice, 'EUR')}</div>
        `;
    }
    badge.innerHTML = badgeHtml;
    priceEl.appendChild(badge);
    item.setAttribute('data-doviz-badge-injected', 'true');
}

// --- HISTORY SCRAPER ---
function checkPriceHistoryPage(attempt = 0) {
    if (!window.location.href.includes('favori-ilan-fiyat-tarihcesi')) return;

    const xpath = "//*[contains(text(), 'Favoriye Eklendiğindeki Fiyat')]";
    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    const labelNode = result.singleNodeValue;

    if (!labelNode) {
        if (attempt < 10) {
            console.log(`EXT: Waiting for history data... (${attempt})`);
            setTimeout(() => checkPriceHistoryPage(attempt + 1), 500);
        } else {
            console.warn("EXT: Timeout - Could not find 'Favoriye Eklendiğindeki Fiyat' label.");
        }
        return;
    }

    if (document.body.getAttribute('data-ext-history-processed') === 'true') return;

    try {
        let container = labelNode.closest('tr') || labelNode.closest('.history-row') || labelNode.parentElement;
        if (container) {
            const allKids = Array.from(container.querySelectorAll('*'));
            const priceEl = container.querySelector('.price') ||
                allKids.find(el => el.innerText.includes('TL') && /\d/.test(el.innerText));
            const dateEl = container.querySelector('.inner-date') ||
                container.querySelector('.date') ||
                labelNode;

            if (priceEl && dateEl) {
                const rawPrice = priceEl.innerText.trim();
                const priceTL = parsePrice(rawPrice);
                let rawDateText = dateEl.innerText.replace('Favoriye Eklendiğindeki Fiyat', '').trim();
                const isoDate = parseTurkishDate(rawDateText);

                const urlParams = new URLSearchParams(window.location.search);
                const ilanID = urlParams.get('classifiedId');

                if (ilanID && priceTL && isoDate) {
                    saveHistorical(ilanID, priceTL, rawDateText, isoDate);
                    document.body.setAttribute('data-ext-history-processed', 'true');
                    showToast(`✅ Tarihçe Güncellendi!\n${rawDateText}: ${priceTL.toLocaleString()} TL`);
                }
            }
        }
    } catch (e) { console.error("EXT: Error scraping history", e); }
}

function saveHistorical(ilanID, priceTL, dateStr, isoDate) {
    if (!ilanID || !priceTL) return;
    chrome.runtime.sendMessage({
        type: "SAVE_HISTORICAL_FAVORITE",
        payload: { ilanID, priceTL, dateStr, isoDate }
    });
}

// --- MAIN LIST LOGIC ---
function injectBadges() {
    if (!window.location.href.includes('sahibinden.com')) return;
    if (!chrome.runtime?.id) return;

    try {
        chrome.storage.local.get(null, (data) => {
            if (chrome.runtime.lastError || !data) return;

            const items = document.querySelectorAll('.favorite-classified-row, tr.searchResultsItem, .classifiedDetailContent');

            items.forEach(item => {
                let id = item.getAttribute('data-id') || item.getAttribute('data-classified-id');
                if (!id) {
                    const link = item.querySelector('a[href*="/detay"]');
                    if (link) {
                        const match = link.href.match(/-(\d+)\/detay/);
                        if (match) id = match[1];
                    }
                }
                if (!id) return;

                const record = data[id];
                const priceEl = item.querySelector('.col-price div.va-price') ||
                    item.querySelector('.favorite-feature-col-price .va-price') ||
                    item.querySelector('.searchResultsPriceValue') ||
                    item.querySelector('.classified-price-container');
                let currentPriceTL = 0;
                if (priceEl) currentPriceTL = parsePrice(priceEl.textContent.trim());

                // Inactive Check
                const isPassive = item.classList.contains('passive-classified') ||
                    item.querySelector('.classified-expired-text') ||
                    (item.textContent && item.textContent.includes('Yayında değil'));

                if (isPassive && record && record.active !== false) {
                    chrome.runtime.sendMessage({ type: "MARK_INACTIVE", payload: { ilanID: id } });
                }

                if (record) {
                    // Price Drop Check
                    if (currentPriceTL > 0) {
                        const lastHist = record.priceHistory ? record.priceHistory[record.priceHistory.length - 1] : null;
                        const lastKnownPrice = lastHist ? lastHist.priceTL : record.orjinalFiyatTL;
                        if (currentPriceTL < lastKnownPrice) {
                            chrome.runtime.sendMessage({
                                type: "UPDATE_PRICE",
                                payload: { ilanID: id, priceTL: currentPriceTL }
                            });
                        }
                    }

                    // Render (if not already injected)
                    if (item.getAttribute('data-doviz-badge-injected') !== 'true') {
                        updateBadgeForRow(item, record);
                    }
                } else if (!record && currentPriceTL > 0) {
                    // Auto Sync
                    if (item.classList.contains('favorite-classified-row') || window.location.href.includes('/favori-ilanlar')) {
                        if (item.getAttribute('data-doviz-sync-sent') !== 'true') {
                            chrome.runtime.sendMessage({
                                type: "SAVE_FAVORITE",
                                payload: { ilanID: id, priceTL: currentPriceTL }
                            });
                            item.setAttribute('data-doviz-sync-sent', 'true');

                            // Visualize "Syncing"
                            const savedBadge = document.createElement('div');
                            savedBadge.className = 'sahibinden-doviz-badge'; // Marked for eventual replacement
                            savedBadge.style.cssText = "font-size:9px; color:gray; float:right; margin-top:2px;";
                            savedBadge.innerText = "✓ Senkronize...";
                            if (priceEl) priceEl.appendChild(savedBadge);
                        }
                    }
                }
            });
        });
    } catch (e) { }
}

// --- LIVE UPDATE LISTENER ---
// This listens for ANY storage change (e.g. History Sync or Auto Sync finishing)
// and updates the UI instantly without reload.
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
        for (let [key, { newValue }] of Object.entries(changes)) {
            // key is ilanID
            if (newValue && typeof newValue === 'object') {
                const selector = `[data-id="${key}"], [data-classified-id="${key}"]`;
                const items = document.querySelectorAll(selector);
                items.forEach(item => {
                    updateBadgeForRow(item, newValue);
                    // Flash effect
                    const badge = item.querySelector('.sahibinden-doviz-badge');
                    if (badge) {
                        badge.style.transition = 'background-color 0.5s';
                        badge.style.backgroundColor = '#bbf7d0';
                        setTimeout(() => badge.style.backgroundColor = '#f0fdf4', 500);
                    }
                });
            }
        }
    }
});

const observer = new MutationObserver((mutations) => {
    injectBadges();
    checkPriceHistoryPage();
});
observer.observe(document.body, { childList: true, subtree: true });

// Initial checks
checkPriceHistoryPage();

// Event listeners for clicks...
document.addEventListener('click', (e) => {
    try {
        const target = e.target.nodeType === 3 ? e.target.parentElement : e.target;
        const row = target.closest('tr') || target.closest('.favorite-classified-row') || target.closest('.searchResultsItem');

        if (row) {
            let id = row.getAttribute('data-id') || row.getAttribute('data-classified-id');
            if (id) chrome.storage.local.set({ lastClickedIdData: { id: id, timestamp: Date.now() } });
        }
        // ... (Keep existing interaction monitoring logic)
        const detailBtn = target.closest('.classifiedAddFavorite, .add-to-favorites, #addToFavorites, a[title="Favorilerime Ekle"]');
        if (detailBtn) {
            const classifiedId = document.getElementById('classifiedIdValue')?.value || document.body.getAttribute('data-classified-id');
            const priceEl = document.querySelector('.classifiedInfo h3') || document.querySelector('.classified-price-container');
            if (classifiedId && priceEl) {
                const priceTL = parsePrice(priceEl.textContent.trim());
                if (priceTL) chrome.runtime.sendMessage({ type: "SAVE_FAVORITE", payload: { ilanID: classifiedId, priceTL } });
            }
        }
    } catch (err) { }
}, true);
