const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

let currentCategory = 'all'; 
let currentFolderId = 'root'; 

// 💡 Professional UI States
let sortBy = localStorage.getItem('cloudSortBy') || 'date'; 
let sortOrder = localStorage.getItem('cloudSortOrder') || 'desc'; 
let isListView = localStorage.getItem('cloudViewMode') === 'list';

let cloudTotalCounts = {};
const BACKEND_URL = "https://telegramcloudbackend.onrender.com"; 

let phoneHash = "", userPhone = "", pollingInterval, allFilesData = [];
let tgUser = tg.initDataUnsafe?.user;

let userName = tgUser && tgUser.id ? tgUser.id.toString() : (localStorage.getItem("temp_uid") || "Web_Cloud_User_" + Math.floor(Math.random() * 1000000));
let botUsername = "";

let isSelectionMode = false;
let selectedFiles = [];
let pressTimer;
let justSelected = false;

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
        
        if(result.bot_username) botUsername = result.bot_username;
        
        if(result.exists) { 
            // PIN ရှိလျှင် PIN စာမျက်နှာကို ပြမည်
            if(result.has_pin) {
                switchStep("step-pin");
            } else {
                switchStep("step-success"); 
                fetchCloudData(); 
            }
        } 
        else { switchStep("step-phone"); }
    } catch(e) { switchStep("step-phone"); }
};

window.addEventListener('DOMContentLoaded', () => {
    let toggleBtn = document.getElementById("btn-view-toggle");
    if(toggleBtn) {
        let icon = toggleBtn.querySelector("i");
        if(icon) icon.className = isListView ? "fa-solid fa-border-all" : "fa-solid fa-list";
    }
    updateSortUI();
});

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
            
            renderBreadcrumb();
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
        console.error("Fetch Error:", e);
        if (!isLoadMore) statusText.innerText = "Connection error."; 
        else showToast("Connection error.", "error");
    }

    if (isLoadMore && loadMoreBtn) {
        loadMoreBtn.innerHTML = "<i class='fa-solid fa-cloud-arrow-down mr-2'></i> Load More"; loadMoreBtn.disabled = false;
    }
}

function loadMoreFiles() { fetchCloudData(true); }

// =========================================================
// 💡 SELECTION UX
// =========================================================
function handleTouchStart(e, id) {
    pressTimer = setTimeout(() => {
        enterSelectionMode(id);
        if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred("heavy"); 
    }, 500); 
}

function handleTouchEnd() { clearTimeout(pressTimer); }
function handleTouchMove() { clearTimeout(pressTimer); } 
function handleRightClick(e, id) { e.preventDefault(); enterSelectionMode(id); }

function enterSelectionMode(id) {
    if (!isSelectionMode) {
        isSelectionMode = true;
        justSelected = true;
        document.body.classList.add("selection-active"); 
        toggleFileSelect(id);
        setTimeout(() => justSelected = false, 300); 
    }
}

function handleFileClick(id) {
    if (justSelected) return; 
    let fileObj = allFilesData.find(f => f.id.toString() === id.toString());
    
    if (isSelectionMode) {
        toggleFileSelect(id); 
    } else {
        if (fileObj && fileObj.type === 'folder') openFolder(id);
        else openFile(id); 
    }
}

function toggleFileSelect(id) {
    id = id.toString();
    if(selectedFiles.includes(id)) {
        selectedFiles = selectedFiles.filter(fid => fid !== id);
    } else {
        selectedFiles.push(id);
    }
    
    let bar = document.getElementById("selection-bar");
    
    if(selectedFiles.length > 0) {
        if (bar) bar.classList.remove("hidden");
        let countText = document.getElementById("selection-count");
        if (countText) countText.innerText = `${selectedFiles.length} Selected`;
    } else {
        cancelSelection(); 
    }
    renderFilesGrid(currentCategory === 'all' ? allFilesData : allFilesData.filter(f => f.type === currentCategory));
}

function openMoreMenu() {
    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
    let overlay = document.getElementById("more-menu-overlay");
    let title = document.getElementById("bottom-sheet-title");
    let renameBtn = document.getElementById("action-rename");
    
    if (title) title.innerText = `${selectedFiles.length} item${selectedFiles.length > 1 ? 's' : ''} selected`;
    if (renameBtn) renameBtn.style.display = selectedFiles.length === 1 ? "flex" : "none";
    
    if(overlay) {
        overlay.classList.remove("hidden");
        setTimeout(() => { overlay.classList.add("show"); }, 10);
    }
}

function closeMoreMenu() {
    let overlay = document.getElementById("more-menu-overlay");
    if(overlay) {
        overlay.classList.remove("show");
        setTimeout(() => { overlay.classList.add("hidden"); }, 300);
    }
}

// 💡 ဤနေရာတွင် အမှားဖြစ်စေသော (မရှိတော့သည့်) element အဟောင်းများကို ဖယ်ရှားထားပါသည်
function cancelSelection() {
    selectedFiles = [];
    isSelectionMode = false;
    document.body.classList.remove("selection-active"); 
    
    let bar = document.getElementById("selection-bar");
    if (bar) bar.classList.add("hidden");
    
    renderFilesGrid(currentCategory === 'all' ? allFilesData : allFilesData.filter(f => f.type === currentCategory));
}

// =========================================================
// 💡 GOOGLE DRIVE STYLE FAB & SORT LOGIC
// =========================================================
let isFabOpen = false;
function toggleFabMenu() {
    if(tg.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
    isFabOpen = !isFabOpen;
    let menu = document.getElementById("fab-menu");
    let overlay = document.getElementById("fab-overlay");
    let mainIcon = document.querySelector("#fab-main-btn i");

    if (!menu || !overlay || !mainIcon) return;

    if(isFabOpen) {
        menu.classList.remove("hidden"); overlay.classList.remove("hidden");
        setTimeout(() => { menu.classList.add("show"); overlay.classList.add("show"); }, 10);
        mainIcon.classList.replace("fa-plus", "fa-xmark");
    } else {
        menu.classList.remove("show"); overlay.classList.remove("show");
        setTimeout(() => { menu.classList.add("hidden"); overlay.classList.add("hidden"); }, 200);
        mainIcon.classList.replace("fa-xmark", "fa-plus");
    }
}

function updateSortUI() {
    let labels = { 'name': 'Name', 'date': 'Date', 'size': 'Size' };
    let labelEl = document.getElementById("current-sort-label");
    let iconEl = document.getElementById("current-sort-icon");
    
    if (labelEl) labelEl.innerText = labels[sortBy];
    if (iconEl) iconEl.className = sortOrder === 'asc' ? "fa-solid fa-arrow-up" : "fa-solid fa-arrow-down";

    document.querySelectorAll('.clean-action-list li').forEach(el => {
        el.classList.remove('active');
        let i = el.querySelector(".sort-dir-icon");
        if(i) i.style.opacity = "0";
    });
    
    let activeEl = document.getElementById("sort-" + sortBy);
    if (activeEl) {
        activeEl.classList.add("active");
        let i = activeEl.querySelector(".sort-dir-icon");
        if (i) {
            i.style.opacity = "1";
            i.className = sortOrder === 'asc' ? "fa-solid fa-arrow-up sort-dir-icon" : "fa-solid fa-arrow-down sort-dir-icon";
        }
    }
}

function openSortMenu() {
    if(tg.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
    updateSortUI();
    let overlay = document.getElementById("sort-menu-overlay");
    if(overlay) {
        overlay.classList.remove("hidden");
        setTimeout(() => { overlay.classList.add("show"); }, 10);
    }
}

function closeSortMenu() {
    let overlay = document.getElementById("sort-menu-overlay");
    if(overlay) {
        overlay.classList.remove("show");
        setTimeout(() => { overlay.classList.add("hidden"); }, 300);
    }
}

function applySort(type) {
    if(tg.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
    if (sortBy === type) {
        sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        sortBy = type;
        sortOrder = type === 'name' ? 'asc' : 'desc';
    }
    localStorage.setItem('cloudSortBy', sortBy);
    localStorage.setItem('cloudSortOrder', sortOrder);
    
    updateSortUI();
    renderFilesGrid(currentCategory === 'all' ? allFilesData : allFilesData.filter(f => f.type === currentCategory));
    closeSortMenu();
}

function toggleView() {
    if(tg.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
    isListView = !isListView;
    localStorage.setItem('cloudViewMode', isListView ? 'list' : 'grid');
    
    let icon = document.getElementById("btn-view-toggle").querySelector("i");
    if (icon) icon.className = isListView ? "fa-solid fa-border-all" : "fa-solid fa-list";
    renderFilesGrid(currentCategory === 'all' ? allFilesData : allFilesData.filter(f => f.type === currentCategory));
}

function parseSizeToBytes(sizeStr) {
    if (!sizeStr) return 0;
    let val = parseFloat(sizeStr.replace(/[^\d.-]/g, ''));
    if (isNaN(val)) return 0;
    if (sizeStr.includes("GB")) return val * 1024 * 1024 * 1024;
    if (sizeStr.includes("MB")) return val * 1024 * 1024;
    if (sizeStr.includes("KB")) return val * 1024;
    return val;
}

function sortFilesArray(filesArray) {
    return filesArray.sort((a, b) => {
        if (a.type === 'folder' && b.type !== 'folder') return -1;
        if (a.type !== 'folder' && b.type === 'folder') return 1;

        let result = 0;
        if (sortBy === 'date') {
            result = (a.timestamp || 0) - (b.timestamp || 0);
        } else if (sortBy === 'name') {
            let nameA = (a.title || "").toLowerCase();
            let nameB = (b.title || "").toLowerCase();
            result = nameA.localeCompare(nameB);
        } else if (sortBy === 'size') {
            let sizeA = parseSizeToBytes(a.size);
            let sizeB = parseSizeToBytes(b.size);
            result = sizeA - sizeB;
        }
        return sortOrder === 'asc' ? result : -result;
    });
}

// =========================================================
// 💡 MAIN RENDER (GRID & LIST)
// =========================================================
function renderFilesGrid(files) {
    let html = "";
    
    let displayFiles = files;
    if (currentCategory === 'all') {
        displayFiles = files.filter(f => (f.parent_id || 'root') === currentFolderId);
    }

    displayFiles = sortFilesArray(displayFiles);

    let gridContainer = document.getElementById("cloud-files-grid");
    if (!gridContainer) return;
    
    if (isListView) gridContainer.classList.add("list-view");
    else gridContainer.classList.remove("list-view");

    if(displayFiles.length === 0 && currentFolderId === 'root') {
        html = "<div class='flex-center' style='grid-column: 1 / -1; color: var(--text-muted);'><i class='fa-brands fa-telegram mb-2' style='font-size:40px;'></i><p>Your drive is empty.</p></div>";
    } else {
        displayFiles.forEach(f => {
            try {
                let iconClass = "fa-file-lines doc"; 
                let fileName = (f.file_name || f.title || "").toLowerCase();

                if (f.type === "folder") iconClass = "fa-folder folder";
                else if (f.type === "photo") iconClass = "fa-image photo";
                else if (f.type === "video") iconClass = "fa-film video";
                else if (f.type === "link") iconClass = "fa-link link";
                else if (f.type === "text") iconClass = "fa-note-sticky text";
                else if (fileName.endsWith(".pdf")) iconClass = "fa-file-pdf pdf";
                else if (fileName.match(/\.(zip|rar|7z)\$/)) iconClass = "fa-file-zipper zip";
                else if (fileName.endsWith(".apk")) iconClass = "fa-brands fa-android apk";
                else if (fileName.match(/\.(mp3|wav|ogg|m4a)\$/)) iconClass = "fa-file-audio audio";
                else if (fileName.match(/\.(xls|xlsx|csv)\$/)) iconClass = "fa-file-excel excel";
                else if (fileName.match(/\.(doc|docx)\$/)) iconClass = "fa-file-word word";
                
                let thumbHtml = "";
                if (f.thumb_file_id) {
                    let imgTag = `<img src="${BACKEND_URL}/api/thumb/${f.thumb_file_id}" class="fc-thumb" loading="lazy" onerror="this.outerHTML='<i class=\\'fa-solid ${iconClass} fc-icon\\'></i>'">`;
                    if (f.type === "video") thumbHtml = `<div class="thumb-wrapper">${imgTag}<div class="video-overlay"><i class="fa-solid fa-play"></i></div></div>`;
                    else thumbHtml = imgTag; 
                } else {
                    thumbHtml = `<i class="fa-solid ${iconClass} fc-icon"></i>`;
                }

                let displayTitle = f.title ? f.title : "Unknown File";
                
                let dateStr = "";
                if (f.timestamp) {
                    let d = new Date(f.timestamp * 1000);
                    let months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                    dateStr = `${d.getDate()} ${months[d.getMonth()]}`;
                }

                let isSelected = selectedFiles.includes(f.id.toString());
                let selectedClass = isSelected ? "selected" : "";
                
                html += `
                <div class="file-card ${selectedClass}" 
                     onclick="handleFileClick('${f.id}')"
                     oncontextmenu="handleRightClick(event, '${f.id}')"
                     ontouchstart="handleTouchStart(event, '${f.id}')"
                     ontouchend="handleTouchEnd()"
                     ontouchmove="handleTouchMove()">
                    <div class="select-indicator"><i class="fa-solid fa-check"></i></div>
                    ${thumbHtml}
                    <div class="fc-title">${displayTitle}</div>
                    <div class="fc-meta">${f.size || dateStr}</div>
                </div>`;
            } catch (err) {}
        });
    }
    gridContainer.innerHTML = html;
}

// =========================================================
// 💡 FOLDER FUNCTIONS
// =========================================================
function renderBreadcrumb() {
    let container = document.getElementById('breadcrumb-container');
    if (!container) return;
    
    let titles = { 'all': 'My Drive', 'photo': 'Photos', 'video': 'Videos', 'doc': 'Documents', 'link': 'Links' };
    let baseTitle = titles[currentCategory] || 'My Drive';

    if (currentCategory !== 'all' || currentFolderId === 'root') {
        container.innerHTML = `<span class="breadcrumb-current">${baseTitle}</span>`;
        return;
    }

    let path = [];
    let currId = currentFolderId;
    while (currId !== 'root') {
        let folderObj = allFilesData.find(f => f.id.toString() === currId.toString() && f.type === 'folder');
        if (folderObj) {
            path.unshift(folderObj); 
            currId = folderObj.parent_id || 'root';
        } else { break; }
    }

    let breadcrumbsHtml = `<span class="breadcrumb-item" onclick="navigateToFolder('root')">${baseTitle}</span>`;
    path.forEach((folder, index) => {
        breadcrumbsHtml += `<i class="fa-solid fa-angle-right breadcrumb-separator"></i>`;
        if (index === path.length - 1) breadcrumbsHtml += `<span class="breadcrumb-current">${folder.title}</span>`;
        else breadcrumbsHtml += `<span class="breadcrumb-item" onclick="navigateToFolder('${folder.id}')">${folder.title}</span>`;
    });
    container.innerHTML = breadcrumbsHtml;
}

function navigateToFolder(folderId) {
    if(tg.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
    currentFolderId = folderId;
    renderBreadcrumb();
    renderFilesGrid(currentCategory === 'all' ? allFilesData : allFilesData.filter(f => f.type === currentCategory));
}

function openFolder(folderId) {
    if(tg.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
    currentFolderId = folderId;
    renderBreadcrumb();
    renderFilesGrid(currentCategory === 'all' ? allFilesData : allFilesData.filter(f => f.type === currentCategory));
}

function openCreateFolderModal() {
    document.getElementById("folder-input").value = "";
    let overlay = document.getElementById("folder-alert-overlay");
    if(overlay) {
        overlay.classList.remove("hidden");
        setTimeout(() => { overlay.classList.add("show"); document.getElementById("folder-input").focus(); }, 10);
    }
}

function closeFolderModal() {
    let overlay = document.getElementById("folder-alert-overlay");
    if(overlay) {
        overlay.classList.remove("show");
        setTimeout(() => overlay.classList.add("hidden"), 300);
    }
}

async function executeCreateFolder() {
    let name = document.getElementById("folder-input").value.trim();
    if (!name) return showToast("ဖိုင်တွဲအမည် ရိုက်ထည့်ပါ။", "error");
    
    // 💡 Error မဖြစ်စေရန် ပြုပြင်ထားပါသည်
    let btn = window.event ? window.event.target.closest('button') : null;
    let oldHtml = "";
    if (btn) { oldHtml = btn.innerHTML; btn.innerHTML = "<i class='fa-solid fa-spinner fa-spin'></i>"; btn.disabled = true; }

    try {
        let res = await fetch(`${BACKEND_URL}/api/create_folder`, {
            method: "POST", headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ name: userName, folder_name: name, parent_id: currentFolderId })
        });
        let result = await res.json();
        if(result.success) {
            allFilesData.unshift(result.folder);
            localStorage.setItem(`cloudData_${userName}`, JSON.stringify(allFilesData));
            closeFolderModal();
            renderFilesGrid(currentCategory === 'all' ? allFilesData : allFilesData.filter(f => f.type === currentCategory));
            showToast("<i class='fa-solid fa-check mr-2'></i> Folder ဆောက်ပြီးပါပြီ", "success");
        }
    } catch(e) { console.error(e); showToast("Connection Error", "error"); }
    
    if (btn) { btn.innerHTML = oldHtml; btn.disabled = false; }
}

function openMoveModal() {
    if(selectedFiles.length === 0) return;
    let select = document.getElementById("move-folder-select");
    if(select) {
        select.innerHTML = '<option value="root">My Drive (Root)</option>';
        allFilesData.forEach(f => {
            if(f.type === 'folder' && !selectedFiles.includes(f.id.toString())) {
                select.innerHTML += `<option value="${f.id}">📁 ${f.title}</option>`;
            }
        });
    }
    let overlay = document.getElementById("move-alert-overlay");
    if(overlay) {
        overlay.classList.remove("hidden");
        setTimeout(() => { overlay.classList.add("show"); }, 10);
    }
}

function closeMoveModal() {
    let overlay = document.getElementById("move-alert-overlay");
    if(overlay) {
        overlay.classList.remove("show");
        setTimeout(() => overlay.classList.add("hidden"), 300);
    }
}

async function executeMoveFiles() {
    let selectEl = document.getElementById("move-folder-select");
    let targetId = selectEl ? selectEl.value : 'root';
    
    let btn = window.event ? window.event.target.closest('button') : null;
    let oldHtml = "";
    if (btn) { oldHtml = btn.innerHTML; btn.innerHTML = "<i class='fa-solid fa-spinner fa-spin'></i>"; btn.disabled = true; }

    try {
        let res = await fetch(`${BACKEND_URL}/api/move_files`, {
            method: "POST", headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ name: userName, msg_ids: selectedFiles, target_id: targetId })
        });
        let result = await res.json();
        if(result.success) {
            allFilesData.forEach(f => {
                let fId = f.id ? f.id.toString() : "";
                if (selectedFiles.includes(fId)) f.parent_id = targetId;
            });
            localStorage.setItem(`cloudData_${userName}`, JSON.stringify(allFilesData));
            closeMoveModal();
            cancelSelection();
            showToast("<i class='fa-solid fa-check mr-2'></i> ဖိုင်များကို ရွှေ့လိုက်ပါပြီ", "success");
        }
    } catch(e) { console.error(e); showToast("Connection Error", "error"); }
    
    if (btn) { btn.innerHTML = oldHtml; btn.disabled = false; }
}

// =========================================================
// 💡 ACTIONS (DELETE, SHARE, RENAME)
// =========================================================
async function deleteSelectedFiles() {
    if(selectedFiles.length === 0) return;
    showConfirmAlert(`ရွေးချယ်ထားသော ဖိုင်များကို ဖျက်ပစ်ရန် သေချာပါသလား?\n\n(Folder ကိုဖျက်ပါက အတွင်းရှိဖိုင်များပါ အပြီးတိုင် ပျက်သွားပါမည်)`, async () => {
        showToast("<i class='fa-solid fa-spinner fa-spin mr-2'></i> Deleting...", "normal");
        try {
            let res = await fetch(`${BACKEND_URL}/api/delete_files`, {
                method: "POST", headers: {"Content-Type": "application/json"},
                body: JSON.stringify({ name: userName, msg_ids: selectedFiles })
            });
            let result = await res.json();
            if(result.success) {
                if(tg.HapticFeedback && tg.HapticFeedback.notificationOccurred) tg.HapticFeedback.notificationOccurred("success");
                showToast(`<i class='fa-solid fa-check mr-2'></i> ဖျက်ပစ်လိုက်ပါပြီ။`, "success");
                
                // 💡 Error မဖြစ်စေရန် ပြုပြင်ထားပါသည်
                allFilesData = allFilesData.filter(f => {
                    let fId = f.id ? f.id.toString() : "";
                    let pId = f.parent_id ? f.parent_id.toString() : "";
                    return !selectedFiles.includes(fId) && !selectedFiles.includes(pId);
                });
                
                localStorage.setItem(`cloudData_${userName}`, JSON.stringify(allFilesData));
                cancelSelection(); 
                fetchCloudData(); 
            } else { showToast("<i class='fa-solid fa-xmark mr-2'></i> Failed to delete.", "error"); }
        } catch(e) { 
            console.error("Delete Error:", e);
            showToast("Connection error.", "error");
            cancelSelection(); 
            fetchCloudData();
        }
    });
}

let currentBaseShareLink = "", isRestrictMode = false;

async function shareSelectedFiles() {
    if(selectedFiles.length === 0) return;
    let btn = window.event ? window.event.target.closest('button') : null;
    let originalHtml = "";
    if(btn) { originalHtml = btn.innerHTML; btn.innerHTML = "<i class='fa-solid fa-spinner fa-spin'></i>"; btn.disabled = true; }
    
    try {
        let res = await fetch(`${BACKEND_URL}/api/share_files`, {
            method: "POST", headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ name: userName, msg_ids: selectedFiles, is_restricted: isRestrictMode }) 
        });
        let result = await res.json();
        if(result.success) {
            if(tg.HapticFeedback && tg.HapticFeedback.notificationOccurred) tg.HapticFeedback.notificationOccurred("success");
            currentBaseShareLink = result.link; 
            let shareInput = document.getElementById("share-link-input");
            if(shareInput) shareInput.value = currentBaseShareLink;
            let overlay = document.getElementById("share-alert-overlay");
            if(overlay) {
                overlay.classList.remove("hidden");
                setTimeout(() => overlay.classList.add("show"), 10);
            }
        } else { showToast("<i class='fa-solid fa-xmark mr-2'></i> Failed to share.", "error"); }
    } catch(e) { console.error(e); showToast("Connection error.", "error"); }
    
    if(btn) { btn.innerHTML = originalHtml; btn.disabled = false; }
}

function toggleRestrictMode() {
    isRestrictMode = !isRestrictMode;
    let icon = document.getElementById("restrict-icon");
    let wrapper = document.querySelector(".restrict-toggle-wrapper");
    if(isRestrictMode) {
        if(icon) icon.className = "fa-solid fa-lock"; 
        if(wrapper) wrapper.classList.add("active");
        if(tg.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
    } else {
        if(icon) icon.className = "fa-solid fa-lock-open"; 
        if(wrapper) wrapper.classList.remove("active");
        if(tg.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
    }
    updateShareLinkQuietly();
}

async function updateShareLinkQuietly() {
    let input = document.getElementById("share-link-input");
    if(input) input.value = "Updating link...";
    try {
        let res = await fetch(`${BACKEND_URL}/api/share_files`, {
            method: "POST", headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ name: userName, msg_ids: selectedFiles, is_restricted: isRestrictMode }) 
        });
        let result = await res.json();
        if(result.success && input) { currentBaseShareLink = result.link; input.value = currentBaseShareLink; }
    } catch(e) { if(input) input.value = "Error updating link"; }
}

function closeShareAlert() {
    let overlay = document.getElementById("share-alert-overlay");
    if(overlay) {
        overlay.classList.remove("show");
        setTimeout(() => { overlay.classList.add("hidden"); cancelSelection(); }, 300);
    }
}

function copyShareLink() {
    let inputEl = document.getElementById("share-link-input");
    if(!inputEl) return;
    let keyText = inputEl.value;
    
    if (keyText) {
        const showSuccess = () => {
            showToast("<i class='fa-solid fa-check mr-2'></i> Link Copied!", "success");
            if(tg.HapticFeedback && tg.HapticFeedback.notificationOccurred) tg.HapticFeedback.notificationOccurred("success");
            closeShareAlert(); 
        };
        const fallbackCopy = () => {
            let textArea = document.createElement("textarea");
            textArea.value = keyText; textArea.setAttribute('readonly', '');
            textArea.style.position = "fixed"; textArea.style.left = "-99999px"; textArea.style.top = "-99999px";
            document.body.appendChild(textArea); textArea.focus(); textArea.select();
            try { if (document.execCommand('copy')) showSuccess(); else showToast("Failed to copy link.", "error"); } 
            catch (err) { showToast("Failed to copy link.", "error"); }
            document.body.removeChild(textArea);
        };
        if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(keyText).then(showSuccess).catch(err => fallbackCopy()); } 
        else fallbackCopy();
    }
}

function openRenameModal() {
    if (selectedFiles.length !== 1) return;
    let fileId = selectedFiles[0];
    let fileObj = allFilesData.find(f => (f.id ? f.id.toString() : "") === fileId);
    if (fileObj) {
        let renameInput = document.getElementById("rename-input");
        if(renameInput) renameInput.value = fileObj.full_text || fileObj.title || "";
        
        let overlay = document.getElementById("rename-alert-overlay");
        if(overlay) {
            overlay.classList.remove("hidden");
            setTimeout(() => { overlay.classList.add("show"); if(renameInput) renameInput.focus(); }, 10);
        }
    }
}

function closeRenameModal() {
    let overlay = document.getElementById("rename-alert-overlay");
    if(overlay) {
        overlay.classList.remove("show");
        setTimeout(() => overlay.classList.add("hidden"), 300);
    }
}

async function executeRename() {
    let inputEl = document.getElementById("rename-input");
    if(!inputEl) return;
    let newName = inputEl.value.trim();
    if (!newName) return showToast("နာမည်အသစ် ရိုက်ထည့်ပါ။", "error");
    
    let fileId = selectedFiles[0];
    let btn = window.event ? window.event.target.closest('button') : null;
    let originalHtml = "";
    if (btn) { originalHtml = btn.innerHTML; btn.innerHTML = "<i class='fa-solid fa-spinner fa-spin'></i>"; btn.disabled = true; }

    try {
        let res = await fetch(`${BACKEND_URL}/api/rename_file`, {
            method: "POST", headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ name: userName, msg_id: fileId, new_title: newName })
        });
        let result = await res.json();
        if (result.success) {
            if(tg.HapticFeedback && tg.HapticFeedback.notificationOccurred) tg.HapticFeedback.notificationOccurred("success");
            showToast("<i class='fa-solid fa-check mr-2'></i> ပြောင်းလဲပြီးပါပြီ", "success");
            let fileIndex = allFilesData.findIndex(f => (f.id ? f.id.toString() : "") === fileId);
            if (fileIndex !== -1) { allFilesData[fileIndex].title = newName; allFilesData[fileIndex].full_text = newName; }
            closeRenameModal(); cancelSelection(); 
        } else showToast("Failed to rename.", "error");
    } catch(e) { console.error(e); showToast("Connection error.", "error"); }
    
    if (btn) { btn.innerHTML = originalHtml; btn.disabled = false; }
}

// =========================================================
// 💡 OTHER UTILS
// =========================================================
function filterFiles(type, element) {
    currentCategory = type;
    document.querySelectorAll('.nav-links li, .nav-item').forEach(el => el.classList.remove('active'));
    if(element) element.classList.add('active');
    renderBreadcrumb(); updateCategoryStatus();
    renderFilesGrid(type === 'all' ? allFilesData : allFilesData.filter(f => f.type === currentCategory));
}

function updateCategoryStatus() {
    let statusText = document.getElementById("cloud-status");
    let filtered = currentCategory === 'all' ? allFilesData : allFilesData.filter(f => f.type === currentCategory);
    let currentLoaded = filtered.length;
    let total = cloudTotalCounts[currentCategory] !== undefined ? cloudTotalCounts[currentCategory] : currentLoaded;
    if (statusText) {
        if (total === 0 && currentLoaded === 0) statusText.innerText = "0 items";
        else statusText.innerText = `${currentLoaded} items synced | total ${total} items`;
    }
}

function searchFiles(query) {
    let lowerQ = query.toLowerCase();
    renderFilesGrid(allFilesData.filter(f => (f.title || "").toLowerCase().includes(lowerQ)));
}

function goToBotForUpload() {
    if(tg.HapticFeedback) tg.HapticFeedback.impactOccurred("medium");
    let botLink = botUsername ? `https://t.me/${botUsername}` : "https://t.me/";
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) tg.openTelegramLink(botLink);
    else window.open(botLink, "_blank");
}

function showToast(message, type = "normal") {
    let existing = document.querySelector(".toast");
    if(existing) existing.remove(); 
    let toast = document.createElement("div");
    toast.className = `toast ${type}`; toast.innerHTML = message;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.animation = "fadeOut 0.3s forwards"; setTimeout(() => toast.remove(), 300); }, 3000);
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
            if(tg.HapticFeedback && tg.HapticFeedback.notificationOccurred) tg.HapticFeedback.notificationOccurred("success");
            showToast("<i class='fa-solid fa-check mr-2'></i> Ready! Swipe down to view.", "success");
        } else {
            if (result.message && result.message.includes("Session Terminated")) showAlert(result.message, "Logged Out", () => window.location.reload());
            else showToast("<i class='fa-solid fa-xmark mr-2'></i> " + (result.message || "Failed to send."), "error");
        }
    } catch(e) { console.error(e); showToast("Connection error.", "error"); }
}

async function openSettings() {
    tg.HapticFeedback.impactOccurred("light");
    let modal = document.getElementById("settings-modal");
    if(modal) modal.classList.remove("hidden");
    try {
        let res = await fetch(`${BACKEND_URL}/api/get_recovery_key`, { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ name: userName }) });
        let result = await res.json();
        let recKeyDisplay = document.getElementById("recovery_key_display");
        if(result.success && recKeyDisplay) recKeyDisplay.innerText = result.key;
    } catch(e) { 
        let recKeyDisplay = document.getElementById("recovery_key_display");
        if(recKeyDisplay) recKeyDisplay.innerText = "Error loading key"; 
    }
}

function closeSettings() { 
    let modal = document.getElementById("settings-modal");
    if(modal) modal.classList.add("hidden"); 
}

async function restoreCloud() {
    let keyInput = document.getElementById("restore_key_input");
    if(!keyInput) return;
    let keyVal = keyInput.value.trim();
    if(!keyVal) return showAlert("Please enter a Recovery Key.", "Notice");
    
    let btn = window.event ? window.event.target.closest('button') : null;
    if(btn) { btn.innerHTML = "<i class='fa-solid fa-spinner fa-spin mr-2'></i> Restoring Data..."; btn.disabled = true; }
    
    try {
        let res = await fetch(`${BACKEND_URL}/api/restore_cloud`, { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ name: userName, key: keyVal }) });
        let result = await res.json();
        if(result.success) {
            closeSettings(); showToast(`<i class='fa-solid fa-check mr-2'></i> Successfully restored ${result.count} files!`, "success"); fetchCloudData(); 
        } else showAlert(result.message || "Invalid Key.", "Error");
    } catch(e) { console.error(e); showAlert("Restore Failed.", "Error"); }
    
    if(btn) { btn.innerHTML = "<i class='fa-solid fa-rotate-left mr-2'></i> Restore Now"; btn.disabled = false; }
}

let alertCloseCallback = null, confirmAlertCallback = null;
function showAlert(message, title = "Notice", callback = null) {
    alertCloseCallback = callback;
    let titleEl = document.getElementById("custom-alert-title");
    let msgEl = document.getElementById("custom-alert-message");
    if(titleEl) titleEl.innerText = title; 
    if(msgEl) msgEl.innerText = message;
    
    let overlay = document.getElementById("custom-alert-overlay");
    if(overlay) {
        overlay.classList.remove("hidden"); setTimeout(() => { overlay.classList.add("show"); }, 10);
    }
    if(tg.HapticFeedback) tg.HapticFeedback.notificationOccurred("warning");
}

function closeCustomAlert() {
    let overlay = document.getElementById("custom-alert-overlay"); 
    if(overlay) {
        overlay.classList.remove("show");
        setTimeout(() => { overlay.classList.add("hidden"); if (alertCloseCallback) { let cb = alertCloseCallback; alertCloseCallback = null; cb(); } }, 300);
    }
}

function showConfirmAlert(message, callback) {
    confirmAlertCallback = callback; 
    let msgEl = document.getElementById("confirm-alert-message");
    if(msgEl) msgEl.innerText = message;
    
    let overlay = document.getElementById("confirm-alert-overlay"); 
    if(overlay) {
        overlay.classList.remove("hidden");
        setTimeout(() => overlay.classList.add("show"), 10); 
    }
    if(tg.HapticFeedback) tg.HapticFeedback.notificationOccurred("warning");
}

function closeConfirmAlert() {
    let overlay = document.getElementById("confirm-alert-overlay"); 
    if(overlay) {
        overlay.classList.remove("show");
        setTimeout(() => overlay.classList.add("hidden"), 300);
    }
}

function executeConfirmAction() { closeConfirmAlert(); if (confirmAlertCallback) { confirmAlertCallback(); confirmAlertCallback = null; } }

async function loginWithKey() {
    let keyInput = document.getElementById("access_key_input");
    if(!keyInput) return;
    let keyVal = keyInput.value.trim();
    if(!keyVal) return showAlert("Please enter your Access Key.", "Notice");
    
    setLoadingText("Verifying Key..."); switchStep("step-loading");
    try {
        let res = await fetch(`${BACKEND_URL}/api/login_with_key`, { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ key: keyVal }) });
        let result = await res.json();
        if(result.success) {
            userName = result.name; localStorage.setItem("temp_uid", userName); setDisplayUsername(); 
            switchStep("step-success"); if(tg.HapticFeedback && tg.HapticFeedback.notificationOccurred) tg.HapticFeedback.notificationOccurred("success"); fetchCloudData(); 
        } else { showAlert(result.message, "Login Failed"); switchStep("step-key-login"); }
    } catch(e) { console.error(e); showAlert("Connection Failed. Please check your internet.", "Error"); switchStep("step-key-login"); }
}

function copyRecoveryKey() {
    let recKeyDisplay = document.getElementById("recovery_key_display");
    if(!recKeyDisplay) return;
    let keyText = recKeyDisplay.innerText;
    
    if (keyText && keyText !== "Loading..." && keyText !== "Error loading key") {
        const showSuccess = () => { showToast("<i class='fa-solid fa-check mr-2'></i> Key Copied to Clipboard!", "success"); if(tg.HapticFeedback && tg.HapticFeedback.notificationOccurred) tg.HapticFeedback.notificationOccurred("success"); };
        const fallbackCopy = () => {
            let textArea = document.createElement("textarea"); textArea.value = keyText; textArea.setAttribute('readonly', ''); textArea.style.position = "fixed"; textArea.style.left = "-99999px"; textArea.style.top = "-99999px";
            document.body.appendChild(textArea); textArea.focus(); textArea.select();
            try { if (document.execCommand('copy')) showSuccess(); else showAlert("Failed to copy.", "Error"); } catch (err) { showAlert("Failed to copy.", "Error"); } document.body.removeChild(textArea);
        };
        if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(keyText).then(showSuccess).catch(err => fallbackCopy()); } else fallbackCopy();
    }
}

function updateStorageUI() {
    let totalMB = 0;
    if (allFilesData && allFilesData.length > 0) {
        allFilesData.forEach(f => {
            if(f.size && typeof f.size === "string") { let num = parseFloat(f.size.replace(/[^\d.-]/g, '')); if(!isNaN(num)) totalMB += (f.size.includes("GB") ? (num * 1024) : num); }
        });
    }
    let displaySize = "0.0 MB"; if (totalMB > 0) displaySize = (totalMB >= 1024) ? ((totalMB / 1024).toFixed(2) + " GB") : (totalMB.toFixed(1) + " MB");
    let storageString = `${displaySize} of Unlimited used`;
    
    let sidebarText = document.getElementById("sidebar-storage-text"); if (sidebarText) sidebarText.innerText = storageString;
    let settingsText = document.getElementById("settings-storage-text"); if (settingsText) settingsText.innerText = storageString;
    let visualPercent = Math.max(3, Math.min((totalMB / 1048576) * 100, 85)); 
    document.querySelectorAll('.progress-fill').forEach(el => el.style.width = visualPercent + '%');
}


// =========================================================
// 💡 SECURITY PIN LOGIC
// =========================================================
async function verifyAppPin() {
    let pin = document.getElementById("app_pin_input").value;
    if(!pin) return showAlert("PIN ရိုက်ထည့်ပါ။", "Notice");
    
    setLoadingText("Unlocking...");
    switchStep("step-loading");
    
    try {
        let res = await fetch(`${BACKEND_URL}/api/verify_pin`, {
            method: "POST", headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ name: userName, pin: pin })
        });
        let result = await res.json();
        
        if(result.success) {
            if(tg.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
            switchStep("step-success"); 
            fetchCloudData();
        } else {
            showAlert(result.message, "Error");
            switchStep("step-pin");
            document.getElementById("app_pin_input").value = "";
        }
    } catch(e) {
        showAlert("Connection Error", "Error");
        switchStep("step-pin");
    }
}

async function setAppPin() {
    let pin = document.getElementById("new_pin_input").value.trim();
    let btn = window.event ? window.event.target.closest('button') : null;
    let oldHtml = "";
    if (btn) { oldHtml = btn.innerHTML; btn.innerHTML = "<i class='fa-solid fa-spinner fa-spin'></i>"; btn.disabled = true; }

    try {
        let res = await fetch(`${BACKEND_URL}/api/set_pin`, {
            method: "POST", headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ name: userName, pin: pin })
        });
        let result = await res.json();
        if(result.success) {
            if(tg.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
            if(pin === "") showToast("<i class='fa-solid fa-lock-open mr-2'></i> App Lock ကို ပိတ်လိုက်ပါပြီ", "success");
            else showToast("<i class='fa-solid fa-lock mr-2'></i> PIN အသစ် သတ်မှတ်ပြီးပါပြီ", "success");
            document.getElementById("new_pin_input").value = "";
        } else {
            showToast(result.message || "Failed to set PIN", "error");
        }
    } catch(e) { 
        showToast("Connection Error", "error"); 
    }
    
    if (btn) { btn.innerHTML = oldHtml; btn.disabled = false; }
}

setInterval(async () => {
    let successStep = document.getElementById("step-success");
    if (successStep && !successStep.classList.contains("hidden")) {
        try {
            let res = await fetch(`${BACKEND_URL}/api/check_session`, { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ name: userName }) });
            let result = await res.json();
            if (result && !result.exists) {
                localStorage.removeItem(`cloudData_${userName}`); localStorage.removeItem(`cloudCounts_${userName}`); localStorage.removeItem("temp_uid");
                if(tg.HapticFeedback && tg.HapticFeedback.notificationOccurred) tg.HapticFeedback.notificationOccurred("error"); 
                showAlert("လုံခြုံရေးအရ အကောင့်ပိတ်သွားပါသည်။ ပြန်လည် Login ဝင်ပေးပါ။", "Session Terminated", () => { window.location.reload(); });
            }
        } catch(e) {}
    }
}, 30000);
