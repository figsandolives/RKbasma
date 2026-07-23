import { CONFIG } from "./config.js?v=20260723-otp";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { getDatabase, ref, get, set, push, update, remove, runTransaction } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js";

const firebaseApp = initializeApp(CONFIG.firebase);
const auth = getAuth(firebaseApp);
const db = getDatabase(firebaseApp);
const storage = getStorage(firebaseApp);
const $ = selector => document.querySelector(selector);
const ROOT = "organizations/default";
const countries = [["الكويت", "+965", "🇰🇼"], ["الهند", "+91", "🇮🇳"], ["مصر", "+20", "🇪🇬"], ["الفلبين", "+63", "🇵🇭"], ["بنغلاديش", "+880", "🇧🇩"], ["سوريا", "+963", "🇸🇾"], ["الأردن", "+962", "🇯🇴"], ["فلسطين", "+970", "🇵🇸"], ["لبنان", "+961", "🇱🇧"]];
const branchAliases = { hawalli: ["hawalli", "surra"], surra: ["hawalli", "surra"], abu_al_hasaniya: ["abu_al_hasaniya", "abulhasania"], abulhasania: ["abu_al_hasaniya", "abulhasania"], yarmouk: ["yarmouk"] };
let employee = null;
let currentPin = "";
let publishedSchedules = [];
let fingerprintPlaces = [];
let otpEmployee = null;
let pendingPunchType = null;
let scanStream = null;
let scanFrame = null;
let scanBusy = false;

const digits = (value = "") => String(value).replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
const onlyDigits = value => digits(value).replace(/\D/g, "");
const esc = (value = "") => String(value).replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
const firstName = name => String(name || "موظف").trim().split(/\s+/)[0];
const initials = name => String(name || "").trim().split(/\s+/).slice(0, 2).map(part => part[0] || "").join("");
const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const formatTime = value => {
  const [hour = 0, minute = 0] = String(value || "00:00").split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "م" : "ص"}`;
};
const dialOptions = selected => countries.map(([name, dial, flag]) => `<option value="${dial}" ${dial === selected ? "selected" : ""}>${flag} ${dial} · ${name}</option>`).join("");
const normalPhone = phone => onlyDigits(phone).replace(/^00/, "");

function showLogin(message = "") {
  $("#boot").classList.add("hidden");
  $("#employee-app").classList.add("hidden");
  $("#pin-page").classList.remove("hidden");
  $("#pin-message").textContent = message;
}
function showToast(message) {
  const toast = $("#portal-toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  window.setTimeout(() => toast.classList.add("hidden"), 3600);
}
function loading(show, title = "يرجى الانتظار", text = "يتم حفظ بياناتك...") {
  const modal = $("#portal-loading");
  modal.classList.toggle("hidden", !show);
  modal.querySelector("h3").textContent = title;
  modal.querySelector("p").textContent = text;
}
function bindNumeric(root = document) {
  root.querySelectorAll('input[inputmode="numeric"]').forEach(input => input.oninput = () => input.value = onlyDigits(input.value));
}
function phoneValues(record) {
  return [record.primaryPhone, ...(record.alternatePhones || [])].map(phone => normalPhone(phone?.phone || phone)).filter(Boolean);
}
function findEmployeeByPhone(rawPhone, employees) {
  const entered = normalPhone(rawPhone);
  const short = entered.slice(-8);
  return employees.find(item => phoneValues(item).some(phone => phone === entered || phone.slice(-8) === short));
}

async function start() {
  try { await signInAnonymously(auth); }
  catch { showLogin("تعذر تشغيل بوابة البصمة. فعّل تسجيل الدخول المجهول في Firebase أولاً."); }
}
onAuthStateChanged(auth, async user => {
  if (!user) return;
  const savedId = sessionStorage.getItem("rakaezEmployeeSession");
  if (!savedId) { showLogin(); return; }
  try {
    const snap = await get(ref(db, `${ROOT}/employees/${savedId}`));
    if (!snap.exists()) throw new Error("انتهت الجلسة.");
    employee = { id: snap.key, ...snap.val() };
    currentPin = String(employee.attendancePin || "");
    await loadPortalData();
    renderHome();
  } catch { sessionStorage.removeItem("rakaezEmployeeSession"); showLogin(); }
});

$("#phone-form").onsubmit = requestOtp;
$("#otp-form").onsubmit = verifyOtp;
$("#back-to-phone").onclick = () => { $("#otp-stage").classList.add("hidden"); $("#phone-stage").classList.remove("hidden"); $("#pin-message").textContent = ""; };
bindNumeric($("#phone-form"));
bindNumeric($("#otp-form"));

async function requestOtp(event) {
  event.preventDefault();
  const button = event.submitter;
  const message = $("#pin-message");
  const phone = onlyDigits($("#employee-phone").value);
  if (phone.length < 6) { message.textContent = "أدخل رقم الهاتف الشخصي بصورة صحيحة."; return; }
  button.disabled = true;
  message.textContent = "جاري التحقق من الرقم...";
  try {
    const snap = await get(ref(db, `${ROOT}/employees`));
    const list = Object.entries(snap.val() || {}).map(([id, value]) => ({ id, ...value }));
    otpEmployee = findEmployeeByPhone(phone, list);
    if (!otpEmployee) throw new Error("رقم الهاتف غير مرتبط بملف موظف.");
    const url = CONFIG.n8n?.employeeLoginOtpUrl || CONFIG.n8n?.loginOtpUrl;
    if (!url) throw new Error("لم يتم إعداد خدمة إرسال رمز واتساب.");
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone, purpose: "employee_attendance_login", employeeId: otpEmployee.id }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.message || "تعذر إرسال رمز واتساب.");
    $("#otp-phone").textContent = `أرسلنا رمز التحقق إلى رقم ${phone.slice(-4).padStart(phone.length, "•")}`;
    $("#phone-stage").classList.add("hidden");
    $("#otp-stage").classList.remove("hidden");
    $("#otp-code").focus();
    message.textContent = "";
  } catch (error) { message.textContent = error.message || "تعذر إرسال الرمز."; }
  finally { button.disabled = false; }
}

async function verifyOtp(event) {
  event.preventDefault();
  const button = event.submitter;
  const message = $("#pin-message");
  const phone = onlyDigits($("#employee-phone").value);
  const code = onlyDigits($("#otp-code").value);
  if (code.length < 4 || !otpEmployee) { message.textContent = "أدخل رمز التحقق الصحيح."; return; }
  button.disabled = true;
  message.textContent = "جاري التحقق...";
  try {
    const url = CONFIG.n8n?.employeeVerifyOtpUrl || CONFIG.n8n?.verifyOtpUrl;
    if (!url) throw new Error("لم يتم إعداد خدمة التحقق من واتساب.");
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone, code, purpose: "employee_attendance_login", employeeId: otpEmployee.id }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.message || "رمز التحقق غير صحيح.");
    employee = otpEmployee;
    currentPin = String(employee.attendancePin || "");
    sessionStorage.setItem("rakaezEmployeeSession", employee.id);
    await loadPortalData();
    renderHome();
  } catch (error) { message.textContent = error.message || "تعذر التحقق من الرمز."; button.disabled = false; }
}

async function loadPortalData() {
  const [schedules, places] = await Promise.all([get(ref(db, `${ROOT}/schedules`)), get(ref(db, `${ROOT}/fingerprintPlaces`))]);
  publishedSchedules = Object.values(schedules.val() || {}).filter(item => item.published).sort((a, b) => String(a.dateKey).localeCompare(String(b.dateKey)));
  fingerprintPlaces = Object.entries(places.val() || {}).map(([id, value]) => ({ id, ...value }));
}
function employeeAssignments() {
  const today = dateKey(new Date());
  const schedule = publishedSchedules.find(item => item.dateKey === today) || publishedSchedules.find(item => item.dateKey >= today) || null;
  return { schedule, items: Object.values(schedule?.assignments || {}).filter(item => item.employeeId === employee?.id).sort((a, b) => String(a.from).localeCompare(String(b.from))) };
}
function branchName(id) { return ({ hawalli: "حولي", surra: "حولي", abu_al_hasaniya: "أبو الحصانية", abulhasania: "أبو الحصانية", yarmouk: "اليرموك" })[id] || id || ""; }
function shiftCard(item, index) {
  return `<article class="shift-card"><b>الدوام ${index === 0 ? "الأول" : index === 1 ? "الثاني" : index + 1}</b><div><span><i class="fa-regular fa-clock"></i><small>الوقت</small><strong>${formatTime(item.from)} — ${formatTime(item.to)}</strong></span><span><i class="fa-solid fa-location-dot"></i><small>الفرع</small><strong>${branchName(item.branchId)}</strong></span><span><i class="fa-regular fa-clipboard"></i><small>المهام</small><strong>${(item.tasks || []).map(esc).join(" + ")}</strong></span></div></article>`;
}
function renderHome() {
  const { schedule, items } = employeeAssignments();
  $("#pin-page").classList.add("hidden");
  $("#boot").classList.add("hidden");
  const app = $("#employee-app");
  app.classList.remove("hidden");
  app.innerHTML = `<button id="open-settings" class="settings-button" aria-label="الإعدادات"><i class="fa-solid fa-gear"></i></button><section class="employee-hero"><div class="profile-image">${employee.photoUrl || employee.photoDataUrl ? `<img src="${esc(employee.photoUrl || employee.photoDataUrl)}" alt="">` : `<span>${initials(employee.fullName)}</span>`}</div><div><small>مرحباً بك</small><h1>${esc(employee.fullName)}</h1><p><i class="fa-regular fa-calendar-days"></i> ${schedule ? `جدول دوام ${schedule.dayName}` : "لا يوجد جدول منشور"}</p></div></section><section class="today-card"><header><div><span>جدول الدوام</span><h2>${schedule ? `${schedule.dayName} · ${schedule.dateKey}` : "بانتظار نشر الجدول"}</h2></div><i class="fa-regular fa-calendar-check"></i></header><div class="shifts">${items.length ? items.map(shiftCard).join("") : `<div class="no-shifts"><i class="fa-regular fa-calendar-xmark"></i><p>لا توجد فترات دوام منشورة لك حاليًا.</p></div>`}</div></section><section class="fingerprint-area"><button id="fingerprint-button"><i class="fa-solid fa-fingerprint"></i></button><h2>اضغط لتسجيل البصمة</h2><p id="fingerprint-status">اختر الدخول أو الخروج ثم وجّه الكاميرا للباركود</p></section><nav class="bottom-nav"><button data-view="services"><i class="fa-solid fa-grip"></i><span>خدمات</span></button><button class="active"><i class="fa-solid fa-fingerprint"></i><span>البصمة</span></button><button data-view="notifications"><i class="fa-regular fa-bell"></i><span>إشعارات</span></button></nav>`;
  $("#open-settings").onclick = renderSettings;
  $("#fingerprint-button").onclick = openPunchChooser;
  document.querySelectorAll("[data-view]").forEach(button => button.onclick = () => renderUnderDevelopment(button.dataset.view === "services" ? "الخدمات" : "الإشعارات"));
}
function renderUnderDevelopment(title) {
  $("#employee-app").innerHTML = `<div class="inner-page under-development"><header><button id="back-home">→</button><div><small>بوابة الموظف</small><h1>${title}</h1></div></header><section><i class="fa-solid fa-wand-magic-sparkles"></i><h2>قيد التطوير</h2></section></div>`;
  $("#back-home").onclick = renderHome;
}

function openPunchChooser() {
  $("#portal-modal").innerHTML = `<div class="portal-modal-backdrop"><section class="portal-modal"><button class="modal-x" aria-label="إغلاق">×</button><span>تسجيل البصمة</span><h2>اختر نوع العملية</h2><p>بعد الاختيار ستفتح الكاميرا لمسح باركود الفرع.</p><div class="punch-choice"><button data-punch="checkIn"><i class="fa-solid fa-right-to-bracket"></i><b>دخول</b></button><button data-punch="checkOut"><i class="fa-solid fa-right-from-bracket"></i><b>خروج</b></button></div></section></div>`;
  const close = () => $("#portal-modal").innerHTML = "";
  $(".modal-x").onclick = close;
  $(".portal-modal-backdrop").onclick = event => { if (event.target.classList.contains("portal-modal-backdrop")) close(); };
  document.querySelectorAll("[data-punch]").forEach(button => button.onclick = () => { pendingPunchType = button.dataset.punch; openScanner(); });
}
function placesForCurrentDuty() {
  const { items } = employeeAssignments();
  const ids = new Set(items.flatMap(item => branchAliases[item.branchId] || [item.branchId]));
  return ids.size ? fingerprintPlaces.filter(place => ids.has(place.branchKey)) : fingerprintPlaces;
}
function parseBarcode(value) {
  const raw = String(value || "").trim();
  const token = raw.startsWith("HRMS-BASMA:") ? raw.slice("HRMS-BASMA:".length) : raw;
  return { raw, token };
}
function matchingPlace(value) {
  const { raw, token } = parseBarcode(value);
  return placesForCurrentDuty().find(place => place.barcodeValue === raw || place.barcodeToken === token || place.id === token);
}
function openScanner() {
  $("#portal-modal").innerHTML = `<div class="portal-modal-backdrop scanner-backdrop"><section class="portal-modal scanner-modal"><button class="modal-x" aria-label="إغلاق">×</button><span>${pendingPunchType === "checkIn" ? "تسجيل دخول" : "تسجيل خروج"}</span><h2>وجّه الكاميرا إلى باركود الفرع</h2><div class="camera-frame"><video id="qr-video" playsinline muted></video><i></i></div><canvas id="qr-canvas" class="hidden"></canvas><p id="scan-message">جاري فتح الكاميرا...</p></section></div>`;
  $(".modal-x").onclick = closeScanner;
  startScanner();
}
async function startScanner() {
  const message = $("#scan-message");
  if (!window.jsQR) { message.textContent = "تعذر تحميل قارئ الباركود. تحقق من الاتصال بالإنترنت ثم أعد المحاولة."; return; }
  if (!placesForCurrentDuty().length) { message.textContent = "لا توجد أماكن بصمة مرتبطة بجدولك اليوم."; return; }
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    const video = $("#qr-video");
    video.srcObject = scanStream;
    await video.play();
    scanBarcodeFrame();
  } catch (error) { message.textContent = error.message || "اسمح للمتصفح باستخدام الكاميرا لمسح الباركود."; }
}
function closeScanner() {
  if (scanFrame) cancelAnimationFrame(scanFrame);
  scanFrame = null;
  if (scanStream) scanStream.getTracks().forEach(track => track.stop());
  scanStream = null;
  scanBusy = false;
  $("#portal-modal").innerHTML = "";
}
function scanBarcodeFrame() {
  const video = $("#qr-video");
  const canvas = $("#qr-canvas");
  if (!video || !canvas || !scanStream || scanBusy) return;
  if (video.readyState >= video.HAVE_ENOUGH_DATA) {
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const code = window.jsQR(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: "dontInvert" });
    if (code?.data) { verifyScannedBarcode(code.data); return; }
  }
  scanFrame = requestAnimationFrame(scanBarcodeFrame);
}
function distanceMeters(a, b) {
  const rad = value => value * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
function currentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error("الموقع الجغرافي غير متاح على هذا الجهاز.")); return; }
    navigator.geolocation.getCurrentPosition(position => resolve({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy, capturedAt: Date.now() }), error => reject(new Error(error.message || "اسمح بالوصول إلى موقعك الجغرافي.")), { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  });
}
async function verifyScannedBarcode(value) {
  const message = $("#scan-message");
  const place = matchingPlace(value);
  if (!place) { message.textContent = "هذا الباركود لا يخص فرع دوامك الحالي."; scanFrame = requestAnimationFrame(scanBarcodeFrame); return; }
  scanBusy = true;
  message.textContent = "تمت قراءة الباركود، جاري التحقق من الموقع...";
  try {
    const center = place.location || {};
    const radius = Number(place.radiusMeters || 0);
    if (!Number.isFinite(Number(center.lat)) || !Number.isFinite(Number(center.lng)) || radius <= 0) throw new Error("لم يتم ضبط موقع هذا المكان بعد.");
    const location = await currentLocation();
    const distance = distanceMeters(location, { lat: Number(center.lat), lng: Number(center.lng) });
    if (distance > radius) throw new Error(`أنت خارج نطاق مكان البصمة (${Math.round(distance)} م).`);
    message.textContent = "تم التحقق من الباركود والموقع. جاري تسجيل البصمة...";
    await recordAttendance(place, { ...location, distance: Math.round(distance), radiusMeters: radius });
    closeScanner();
  } catch (error) { scanBusy = false; message.textContent = error.message || "تعذر التحقق من مكان البصمة."; scanFrame = requestAnimationFrame(scanBarcodeFrame); }
}
async function recordAttendance(place, location) {
  const today = dateKey(new Date());
  const entry = push(ref(db, `${ROOT}/attendance/${today}/${employee.id}`));
  await set(entry, { id: entry.key, employeeId: employee.id, type: pendingPunchType, timestamp: Date.now(), source: "employee-portal", verificationMode: "barcode-location", fingerprintPlaceId: place.id, barcodeToken: place.barcodeToken || "", barcodeValue: place.barcodeValue || "", barcodeTitle: place.title || place.branchName || "", branchKey: place.branchKey || "", branchName: place.branchName || "", location });
  const message = pendingPunchType === "checkIn" ? "تم تسجيل الدخول بنجاح" : "تم تسجيل الخروج بنجاح";
  $("#fingerprint-status") && ($("#fingerprint-status").textContent = message);
  showToast(message);
}

function phoneField(number, dial, index, type) {
  return `<div class="settings-phone-row"><select name="${type}Dial">${dialOptions(dial || "+965")}</select><input name="${type}Phone" value="${esc(number || "")}" inputmode="numeric" maxlength="15" placeholder="رقم الهاتف">${type === "alternate" ? `<button type="button" data-remove-phone="${index}">×</button>` : "<span></span>"}</div>`;
}
function relativeRow(person = {}, index) {
  return `<div class="relative-settings-row">${phoneField(person.phone, person.dialCode, index, "relative")}<input name="relation" value="${esc(person.relation || "")}" placeholder="نوع القرابة"><button type="button" data-remove-relative="${index}">×</button></div>`;
}
function renderSettings() {
  const alternates = employee.alternatePhones || [];
  const relatives = employee.relatives || [];
  $("#employee-app").innerHTML = `<div class="inner-page settings-page"><header><button id="back-home">→</button><div><small>الملف الشخصي</small><h1>إعدادات بياناتي</h1></div><button id="portal-logout" class="portal-logout">تسجيل الخروج</button></header><form id="settings-form"><section><h2>الصورة والبيانات الأساسية</h2><label class="settings-photo"><input id="settings-photo" type="file" accept="image/*"><span>${employee.photoUrl || employee.photoDataUrl ? `<img src="${esc(employee.photoUrl || employee.photoDataUrl)}" alt="">` : `<i class="fa-solid fa-camera"></i>`}</span><b>تغيير الصورة</b></label><div class="settings-grid"><label>الاسم الكامل<input name="fullName" value="${esc(employee.fullName || "")}" required></label><label>الرقم المدني<input name="civilId" value="${esc(employee.civilId || "")}" inputmode="numeric" maxlength="12" required></label><label>الجنسية<select name="nationality"><option value="">اختر الجنسية</option>${countries.map(([name, , flag]) => `<option ${employee.nationality === name ? "selected" : ""}>${flag} ${name}</option>`).join("")}</select></label><label>المسمى الوظيفي<input name="jobTitle" value="${esc(employee.jobTitle || "")}" required></label><label class="wide">جهة العمل<input name="workEntity" value="${esc(employee.workEntity || "")}" readonly></label></div></section><section><div class="settings-section-head"><h2>أرقام الهاتف</h2><button type="button" id="add-alt-phone">＋ رقم احتياطي</button></div><label>رقم الهاتف الشخصي${phoneField(employee.primaryPhone?.phone || employee.kuwaitPhone, employee.primaryPhone?.dialCode || "+965", 0, "primary")}</label><div id="settings-alternates">${alternates.map((phone, index) => phoneField(phone.phone, phone.dialCode, index, "alternate")).join("")}</div></section><section><div class="settings-section-head"><h2>أقرب الأشخاص</h2><button type="button" id="add-relative">＋ إضافة شخص</button></div><div id="settings-relatives">${relatives.map(relativeRow).join("")}</div></section><section class="pin-settings"><h2>رمز دخول البصمة</h2><label>الرمز الجديد<input name="attendancePin" value="${esc(currentPin)}" inputmode="numeric" minlength="4" maxlength="8" required></label></section><p id="settings-message"></p><button class="save-settings">حفظ بياناتي</button></form></div>`;
  bindSettingsEvents();
}
function bindSettingsEvents() {
  bindNumeric($("#settings-form"));
  $("#back-home").onclick = renderHome;
  $("#portal-logout").onclick = () => { sessionStorage.removeItem("rakaezEmployeeSession"); employee = null; showLogin(); };
  $("#settings-photo").onchange = event => { const file = event.target.files[0]; if (file) $(".settings-photo span").innerHTML = `<img src="${URL.createObjectURL(file)}" alt="">`; };
  $("#add-alt-phone").onclick = () => { $("#settings-alternates").insertAdjacentHTML("beforeend", phoneField("", "+965", $("#settings-alternates").children.length, "alternate")); bindSettingRows(); };
  $("#add-relative").onclick = () => { $("#settings-relatives").insertAdjacentHTML("beforeend", relativeRow({}, $("#settings-relatives").children.length)); bindSettingRows(); };
  bindSettingRows();
  $("#settings-form").onsubmit = saveSettings;
}
function bindSettingRows() {
  bindNumeric($("#settings-form"));
  document.querySelectorAll("[data-remove-phone]").forEach(button => button.onclick = () => button.parentElement.remove());
  document.querySelectorAll("[data-remove-relative]").forEach(button => button.onclick = () => button.parentElement.remove());
}
async function saveSettings(event) {
  event.preventDefault();
  const form = event.target, data = Object.fromEntries(new FormData(form));
  const newPin = onlyDigits(data.attendancePin);
  const message = $("#settings-message");
  if (newPin.length < 4 || newPin.length > 8) { message.textContent = "رمز البصمة يجب أن يكون من 4 إلى 8 أرقام."; return; }
  loading(true);
  let reserved = false;
  try {
    if (newPin !== currentPin) {
      const transaction = await runTransaction(ref(db, `${ROOT}/attendancePins/${newPin}`), current => current === null || current === employee.id ? employee.id : undefined, { applyLocally: false });
      if (!transaction.committed) throw new Error("رمز دخول البصمة مأخوذ، اختر رمزًا آخر.");
      reserved = true;
    }
    let photoUrl = employee.photoUrl || "";
    const file = $("#settings-photo").files[0];
    if (file) { const target = storageRef(storage, `employee-photos/${employee.id}/${Date.now()}-${file.name}`); await uploadBytes(target, file); photoUrl = await getDownloadURL(target); }
    const primary = $("[name='primaryPhone']").closest(".settings-phone-row");
    const alternatePhones = [...document.querySelectorAll("#settings-alternates .settings-phone-row")].map(row => ({ dialCode: row.querySelector("select").value, phone: onlyDigits(row.querySelector("input").value) })).filter(item => item.phone);
    const relatives = [...document.querySelectorAll("#settings-relatives .relative-settings-row")].map(row => ({ dialCode: row.querySelector("select").value, phone: onlyDigits(row.querySelector(".settings-phone-row input").value), relation: row.querySelector("[name='relation']").value.trim() })).filter(item => item.phone);
    const changes = { fullName: data.fullName.trim(), civilId: onlyDigits(data.civilId), nationality: data.nationality || "", jobTitle: data.jobTitle.trim(), primaryPhone: { dialCode: primary.querySelector("select").value, phone: onlyDigits(primary.querySelector("input").value) }, alternatePhones, relatives, attendancePin: newPin, photoUrl, profileCompleted: true, profileUpdatedAt: Date.now() };
    await update(ref(db, `${ROOT}/employees/${employee.id}`), changes);
    if (newPin !== currentPin && currentPin) await remove(ref(db, `${ROOT}/attendancePins/${currentPin}`));
    currentPin = newPin; employee = { ...employee, ...changes };
    showToast("تم حفظ بياناتك بنجاح"); renderHome();
  } catch (error) { if (reserved) await remove(ref(db, `${ROOT}/attendancePins/${newPin}`)).catch(() => {}); message.textContent = error.message || "تعذر حفظ البيانات."; }
  finally { loading(false); }
}

start();
