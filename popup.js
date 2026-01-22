// popup.js
function loadData() {
    const list = document.getElementById('list');
    list.innerHTML = '<div class="empty">Yükleniyor...</div>';

    try {
        chrome.storage.local.get(null, (data) => {
            if (chrome.runtime.lastError) {
                list.innerHTML = `<div class="error" style="color:red;">Hata: ${chrome.runtime.lastError.message}</div>`;
                return;
            }

            // Clear loading
            list.innerHTML = '';

            if (!data) {
                list.innerHTML = '<div class="empty">Veri okunamadı.</div>';
                return;
            }

            const keys = Object.keys(data);

            if (keys.length === 0) {
                list.innerHTML = '<div class="empty">Henüz kaydedilen ilan yok.</div>';
                return;
            }

            // Sort by date/ID? (Iterating keys is random order usually, but let's stick to default)
            keys.forEach(key => {
                try {
                    const item = data[key];
                    // Defensive check: sometimes weird keys appear
                    if (!item || typeof item !== 'object') return;
                    if (key === 'lastClickedIdData' || key === 'tempHistoryId') return; // Skip internal system keys

                    const el = document.createElement('div');
                    el.className = 'item';

                    let contentHtml = `<strong>İlan No: ${key}</strong>`;

                    if (item.priceHistory && Array.isArray(item.priceHistory) && item.priceHistory.length > 0) {
                        // Copy and reverse to show latest first
                        const history = [...item.priceHistory].reverse();

                        history.forEach((entry, index) => {
                            const rateUsd = entry.dolarKuru || 1;
                            const rateEur = entry.euroKuru || 1;

                            const usd = Math.round((entry.priceTL || 0) / rateUsd).toLocaleString();
                            const eur = Math.round((entry.priceTL || 0) / rateEur).toLocaleString();

                            const containerStyle = index === 0
                                ? 'margin-top: 5px; padding-bottom: 5px; border-bottom: 1px dashed #ccc;'
                                : 'margin-top: 5px; color: #666; font-size: 0.9em; padding-bottom: 2px; border-bottom: 1px solid #eee;';

                            contentHtml += `
                                <div style="${containerStyle}">
                                    <div style="font-size: 0.85em; color: #999;">${entry.tarih || '?'}</div>
                                    <div>${(entry.priceTL || 0).toLocaleString()} TL</div>
                                    <div><span style="color:green">$${usd}</span> | <span style="color:blue">€${eur}</span></div>
                                </div>
                            `;
                        });
                    } else {
                        // Legacy / Simple View
                        const rateUsd = item.dolarKuru || 1;
                        const rateEur = item.euroKuru || 1;
                        const usd = Math.round((item.orjinalFiyatTL || 0) / rateUsd).toLocaleString();
                        const eur = Math.round((item.orjinalFiyatTL || 0) / rateEur).toLocaleString();

                        contentHtml += `
                            <div style="margin-top: 5px;">
                                <div>${item.tarih || '?'}</div>
                                <div>${(item.orjinalFiyatTL || 0).toLocaleString()} TL</div>
                                <div><span style="color:green">$${usd}</span> | <span style="color:blue">€${eur}</span></div>
                            </div>
                        `;
                    }

                    el.innerHTML = contentHtml;
                    list.appendChild(el);
                } catch (err) {
                    console.error("Error rendering item", key, err);
                    const el = document.createElement('div');
                    el.className = 'item error';
                    el.style.color = 'red';
                    el.innerText = `Hata (İlan ${key}): ${err.message}`;
                    list.appendChild(el);
                }
            });
        });
    } catch (e) {
        list.innerHTML = `<div class="error" style="color:red;">Genel Hata: ${e.message}</div>`;
    }
}

document.getElementById('refreshBtn').addEventListener('click', loadData);
document.addEventListener('DOMContentLoaded', loadData);
