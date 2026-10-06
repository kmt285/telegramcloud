const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

let currentCategory = 'all'; 
let cloudTotalCounts = {};
const BACKEND_URL = "https://telegramcloudbackend.onrender.com";

let phoneHash = "", userPhone = "", pollingInterval, allFilesData = [];
let tgUser = tg.initDataUnsafe?.user;

let userName = tgUser && tgUser.id ? tgUser.id.toString() : (localStorage.getItem("temp_uid") || "Web_Cloud_User_" + Math.floor(Math.random() * 1000000));

// 💡 အသစ် - ရွေးချယ်ထားသော ဖိုင်များ မှတ်ရန်
let isSelectionMode = false;

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
    if (cached) { try { allFilesData = JSON.parse(cached); updateCategoryStatus(); renderFilesGrid(allFilesData); } catch(e) {} }
    
    try {
        let res = await fetch(`${BACKEND_URL}/api/check_session`, {
            method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ name: userName })
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
    } catch (e) { showAlert("Connection Failed.", "Error"); switchStep("step-phone"); }
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
            if(result.real_user_id) { userName = result.real_user_id; localStorage.setItem("temp_uid", userName); setDisplayUsername(); }
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
            if(result.real_user_id) { userName = result.real_user_id; localStorage.setItem("temp_uid", userName); setDisplayUsername(); }
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
            } else { if (loadMoreContainer) loadMoreContainer.classList.add("hidden"); }
        } else {
            if (result.session_expired) {
                tg.HapticFeedback.notificationOccurred("error");
                showAlert("လုံခြုံရေးအရ ပိတ်လိုက်ပါပြီ။ ပြန်လည် Login ဝင်ပေးပါ။", "Session Expired", () => {
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

// 💡 အသစ် - ရွေးချယ်ထားသော ဖိုင်များကို မှတ်ရန်
let selectedFiles = [];

// ဖိုင်ပေါ်က အမှန်ခြစ်လေးကို နှိပ်လျှင် အလုပ်လုပ်မည့်စနစ် (Toggle Select)
function toggleFileSelect(id) {
    id = id.toString();
    if(selectedFiles.includes(id)) {
        selectedFiles = selectedFiles.filter(fid => fid !== id);
    } else {
        selectedFiles.push(id);
    }
    
    let bar = document.getElementById("selection-bar");
    let upBar = document.getElementById("upload-bar");
    
    if(selectedFiles.length > 0) {
        bar.classList.remove("hidden");
        upBar.classList.add("hidden");
        document.getElementById("selection-count").innerText = `${selectedFiles.length} Selected`;
    } else {
        bar.classList.add("hidden");
        upBar.classList.remove("hidden");
    }
    
    // UI တွင် အမှန်ခြစ်လေး ချက်ချင်းပေါ်သွားစေရန်
    renderFilesGrid(currentCategory === 'all' ? allFilesData : allFilesData.filter(f => f.type === currentCategory));
}

// 💡 အစားထိုးရန် - Select လုပ်ထားသမျှကို ပယ်ဖျက်ပြီး မူလအခြေအနေသို့ ပြန်သွားရန်
function cancelSelection() {
    selectedFiles = [];
    isSelectionMode = false; // 💡 ဒါလေး ထည့်ပေးဖို့လိုပါတယ်
    
    let btn = document.getElementById("btn-select-mode");
    if (btn) btn.style.color = "var(--text-muted)"; // Select icon အရောင်ကို မူလအတိုင်းပြန်ထားရန်
    
    document.getElementById("selection-bar").classList.add("hidden");
    document.getElementById("upload-bar").classList.remove("hidden");
    
    // UI Refresh ပြန်လုပ်မည် (Checkbox လေးတွေ ဖျောက်ရန်)
    renderFilesGrid(currentCategory === 'all' ? allFilesData : allFilesData.filter(f => f.type === currentCategory));
}

// UI တွင် ဖိုင်များကို ပြသခြင်း (အမှန်ခြစ် Checkbox လေး ပါဝင်လာပါမည်)
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
                
                let thumbHtml = f.thumb_file_id 
                    ? `<img src="${BACKEND_URL}/api/thumb/${f.thumb_file_id}" class="fc-thumb" loading="lazy" onerror="this.outerHTML='<i class=\\'fa-solid ${iconClass} fc-icon\\'></i>'">`
                    : `<i class="fa-solid ${iconClass} fc-icon"></i>`;

                let safeTitle = f.title ? f.title.replace(/'/g, "\\'").replace(/"/g, "&quot;") : "Unknown File";
                let displayTitle = f.title ? f.title : "Unknown File";
                
                let dateStr = "";
                if (f.timestamp) {
                    let d = new Date(f.timestamp * 1000);
                    let months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                    dateStr = `${d.getDate()} ${months[d.getMonth()]}, ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
                }

                // 💡 ဖိုင်ပေါ်က Checkbox အဝိုင်းလေးကို နှိပ်လျှင် Select မှတ်မည်၊ ဖိုင်ကိုနှိပ်လျှင် ဖွင့်မည်
                let isSelected = selectedFiles.includes(f.id.toString());
                let selectedClass = isSelected ? "selected" : "";
                let selectHtml = `<div class="select-indicator" onclick="event.stopPropagation(); toggleFileSelect('${f.id}')"><i class="fa-solid fa-check"></i></div>`;

                html += `
                <div class="file-card ${selectedClass}" onclick="openFile('${f.id}')">
                    ${selectHtml}
                    ${thumbHtml}
                    <div class="fc-title">${displayTitle}</div>
                    <div class="fc-meta">${f.size || dateStr}</div>
                </div>`;
            } catch (err) {}
        });
    }
    document.getElementById("cloud-files-grid").innerHTML = html;
}

// 💡 အသစ် - DB ထဲမှပါ အပြီးတိုင် ဖျက်ပစ်မည့် လုပ်ဆောင်ချက် (Error ကင်းရှင်းသည်)
async function deleteSelectedFiles() {
    if(selectedFiles.length === 0) return;
    
    showConfirmAlert(`ရွေးချယ်ထားသော ဖိုင် ${selectedFiles.length} ခုကို ဖျက်ပစ်ရန် သေချာပါသလား?\n\n(Database ထဲမှပါ အပြီးတိုင် ပျက်သွားပါမည်)`, async () => {
        showToast("<i class='fa-solid fa-spinner fa-spin mr-2'></i> Deleting files...", "normal");
        try {
            let res = await fetch(`${BACKEND_URL}/api/delete_files`, {
                method: "POST", headers: {"Content-Type": "application/json"},
                body: JSON.stringify({ name: userName, msg_ids: selectedFiles })
            });
            let result = await res.json();
            
            if(result.success) {
                tg.HapticFeedback.notificationOccurred("success");
                // 💡 ဖျက်ပြီးကြောင်း အတည်ပြုစာသား ပြသမည်
                showToast(`<i class='fa-solid fa-check mr-2'></i> ဖိုင်များကို အောင်မြင်စွာ ဖျက်ပစ်လိုက်ပါပြီ။`, "success");
                
                // Storage ထဲမှ ချက်ချင်း ဖယ်ရှားပြီး UI ကို Refresh လုပ်မည်
                allFilesData = allFilesData.filter(f => !selectedFiles.includes(f.id.toString()));
                localStorage.setItem(`cloudData_${userName}`, JSON.stringify(allFilesData));
                
                cancelSelection(); 
                fetchCloudData(); // DB မှ Data အသစ်များကို ပြန်ဆွဲမည်
            } else { 
                showToast("<i class='fa-solid fa-xmark mr-2'></i> " + (result.message || "Failed to delete."), "error"); 
            }
        } catch(e) { 
            // 💡 အကယ်၍ Network ကြောင့် Connection လွတ်သွားခဲ့လျှင်တောင် Refresh လုပ်ခိုင်းမည်
            showToast("ဖျက်သိမ်းပြီးပါပြီ။ UI Refresh ဖြစ်ရန် ခဏစောင့်ပါ။", "normal");
            setTimeout(() => {
                cancelSelection();
                fetchCloudData();
            }, 1500);
        }
    });
}
// 💡 အသစ် - Shared Link ဖန်တီးမည့် လုပ်ဆောင်ချက်
async function shareSelectedFiles() {
    if(selectedFiles.length === 0) return;
    let btn = event.target.closest('button');
    let originalHtml = btn.innerHTML;
    btn.innerHTML = "<i class='fa-solid fa-spinner fa-spin'></i>"; btn.disabled = true;
    
    try {
        let res = await fetch(`${BACKEND_URL}/api/share_files`, {
            method: "POST", headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ name: userName, msg_ids: selectedFiles })
        });
        let result = await res.json();
        if(result.success) {
            tg.HapticFeedback.notificationOccurred("success");
            document.getElementById("share-link-input").value = result.link;
            document.getElementById("share-alert-overlay").classList.remove("hidden");
            setTimeout(() => document.getElementById("share-alert-overlay").classList.add("show"), 10);
            cancelSelection();
        } else {
            showToast("<i class='fa-solid fa-xmark mr-2'></i> " + (result.message || "Failed to share."), "error");
        }
    } catch(e) { showToast("Connection error.", "error"); }
    btn.innerHTML = originalHtml; btn.disabled = false;
}

// 💡 Share Link Overlay ပိတ်ရန်နှင့် Copy ယူရန်
function closeShareAlert() {
    let overlay = document.getElementById("share-alert-overlay");
    overlay.classList.remove("show");
    setTimeout(() => overlay.classList.add("hidden"), 300);
}

function copyShareLink() {
    let keyText = document.getElementById("share-link-input").value;
    
    if (keyText) {
        const showSuccess = () => {
            showToast("<i class='fa-solid fa-check mr-2'></i> Link Copied to Clipboard!", "success");
            if(tg.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
            closeShareAlert(); // 💡 Copy ကူးပြီးတာနဲ့ Alert Box ကို အလိုလို ပိတ်ပေးလိုက်ပါ
        };

        // 💡 Telegram Mini App အတွက် Modern Fallback
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
                else showToast("Failed to copy link.", "error");
            } catch (err) { showToast("Failed to copy link.", "error"); }
            document.body.removeChild(textArea);
        };

        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(keyText).then(showSuccess).catch(err => fallbackCopy());
        } else fallbackCopy();
    }
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
            if (result.message && result.message.includes("Session Terminated")) {
                showAlert(result.message, "Logged Out", () => window.location.reload());
            } else { showToast("<i class='fa-solid fa-xmark mr-2'></i> " + (result.message || "Failed to send."), "error"); }
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
        } else { showAlert(result.message || "Invalid Key.", "Error"); }
    } catch(e) { showAlert("Restore Failed.", "Error"); }
    btn.innerHTML = "<i class='fa-solid fa-rotate-left mr-2'></i> Restore Now"; btn.disabled = false;
}

let alertCloseCallback = null;
let confirmAlertCallback = null;

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
        if (alertCloseCallback) { let cb = alertCloseCallback; alertCloseCallback = null; cb(); }
    }, 300);
}

// 💡 အသစ် - User အား သေချာ/မသေချာ (Yes/No) မေးမည့် Confirm Dialog
function showConfirmAlert(message, callback) {
    confirmAlertCallback = callback;
    document.getElementById("confirm-alert-message").innerText = message;
    let overlay = document.getElementById("confirm-alert-overlay");
    overlay.classList.remove("hidden");
    setTimeout(() => overlay.classList.add("show"), 10);
    if(tg.HapticFeedback) tg.HapticFeedback.notificationOccurred("warning");
}

function closeConfirmAlert() {
    let overlay = document.getElementById("confirm-alert-overlay");
    overlay.classList.remove("show");
    setTimeout(() => overlay.classList.add("hidden"), 300);
}

function executeConfirmAction() {
    closeConfirmAlert();
    if (confirmAlertCallback) { confirmAlertCallback(); confirmAlertCallback = null; }
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

setInterval(async () => {
    let successStep = document.getElementById("step-success");
    if (successStep && !successStep.classList.contains("hidden")) {
        try {
            let res = await fetch(`${BACKEND_URL}/api/check_session`, {
                method: "POST", headers: {"Content-Type": "application/json"},
                body: JSON.stringify({ name: userName })
            });
            let result = await res.json();
            if (result && !result.exists) {
                localStorage.removeItem(`cloudData_${userName}`);
                localStorage.removeItem(`cloudCounts_${userName}`);
                localStorage.removeItem("temp_uid");
                tg.HapticFeedback.notificationOccurred("error");
                showAlert("လုံခြုံရေးအရ အကောင့်ပိတ်သွားပါသည်။ ပြန်လည် Login ဝင်ပေးပါ။", "Session Terminated", () => {
                    window.location.reload(); 
                });
            }
        } catch(e) {}
    }
}, 30000);
