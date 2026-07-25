import { CONFIG } from "./config.js?v=20260725-phone-login";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { getDatabase, ref, get, set, push, update } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js";

const firebaseApp = initializeApp(CONFIG.firebase);
const auth = getAuth(firebaseApp);
const db = getDatabase(firebaseApp);
const storage = getStorage(firebaseApp);
const $ = selector => document.querySelector(selector);
const ROOT = "organizations/default";
const countries = [["الكويت", "Kuwait", "+965", "🇰🇼"], ["الهند", "India", "+91", "🇮🇳"], ["مصر", "Egypt", "+20", "🇪🇬"], ["الفلبين", "Philippines", "+63", "🇵🇭"], ["بنغلاديش", "Bangladesh", "+880", "🇧🇩"], ["سوريا", "Syria", "+963", "🇸🇾"], ["الأردن", "Jordan", "+962", "🇯🇴"], ["فلسطين", "Palestine", "+970", "🇵🇸"], ["لبنان", "Lebanon", "+961", "🇱🇧"]];
const branchAliases = { hawalli: ["hawalli", "surra"], surra: ["hawalli", "surra"], abu_al_hasaniya: ["abu_al_hasaniya", "abulhasania"], abulhasania: ["abu_al_hasaniya", "abulhasania"], yarmouk: ["yarmouk"] };
const defaultFingerprintPlaces = [
  { id: "barcode-hawally", mode: "barcode", title: "باركود حولي", branchKey: "surra", branchName: "حولي", barcodeToken: "bq-1780311331449-wtnbcl1f", barcodeValue: "HRMS-BASMA:bq-1780311331449-wtnbcl1f", location: { lat: 29.342263, lng: 48.018131 }, radiusMeters: 30 },
  { id: "barcode-abu-al-hasaniya", mode: "barcode", title: "باركود أبو الحصانية", branchKey: "abulhasania", branchName: "أبو الحصانية", barcodeToken: "bq-1782039493830-opsvylqd", barcodeValue: "HRMS-BASMA:bq-1782039493830-opsvylqd", location: { lat: 29.342263, lng: 48.018131 }, radiusMeters: 30 },
  { id: "barcode-yarmouk", mode: "barcode", title: "باركود اليرموك", branchKey: "yarmouk", branchName: "اليرموك", barcodeToken: "bq-1782039427444-t1gcyrka", barcodeValue: "HRMS-BASMA:bq-1782039427444-t1gcyrka", location: { lat: 29.342263, lng: 48.018131 }, radiusMeters: 30 }
];
let employee = null;
let publishedSchedules = [];
let fingerprintPlaces = [];
let pendingPunchType = null;
let scanStream = null;
let scanFrame = null;
let scanBusy = false;
let currentView = "login";
let language = localStorage.getItem("rakaezEmployeeLanguage") === "en" ? "en" : "ar";

const en = {
  "نجهّز بوابة الموظف...": "Preparing the employee portal...",
  "ركائز للموظفين": "Rakaez Employees",
  "دخول البصمة": "Attendance login",
  "أدخل رقم هاتفك الشخصي للدخول مباشرة": "Enter your personal phone number to sign in directly",
  "مفتاح الدولة": "Country code",
  "رقم الهاتف": "Phone number",
  "دخول": "Sign in",
  "تعذر تشغيل بوابة البصمة. فعّل تسجيل الدخول المجهول في Firebase أولاً.": "The attendance portal could not start. Enable Anonymous Authentication in Firebase first.",
  "انتهت الجلسة.": "Your session has expired.",
  "أدخل رقم الهاتف الشخصي بصورة صحيحة.": "Enter a valid personal phone number.",
  "جاري التحقق من الرقم...": "Checking your phone number...",
  "رقم الهاتف غير مرتبط بملف موظف.": "This phone number is not linked to an employee profile.",
  "تعذر تسجيل الدخول.": "Could not sign in.",
  "يرجى الانتظار": "Please wait",
  "يتم حفظ بياناتك...": "Saving your information...",
  "موظف": "Employee",
  "الدوام": "Shift",
  "الأول": "First",
  "الثاني": "Second",
  "الوقت": "Time",
  "الفرع": "Branch",
  "المهام": "Tasks",
  "الإعدادات": "Settings",
  "مرحباً بك": "Welcome",
  "جدول دوام": "Work schedule",
  "لا يوجد جدول منشور": "No published schedule",
  "جدول الدوام": "Work schedule",
  "بانتظار نشر الجدول": "Waiting for the schedule",
  "لا توجد فترات دوام منشورة لك حاليًا.": "You currently have no published shifts.",
  "اضغط لتسجيل البصمة": "Tap to record attendance",
  "اختر الدخول أو الخروج ثم وجّه الكاميرا للباركود": "Choose check-in or check-out, then point the camera at the QR code",
  "خدمات": "Services",
  "البصمة": "Attendance",
  "إشعارات": "Notifications",
  "بوابة الموظف": "Employee portal",
  "قيد التطوير": "Coming soon",
  "إغلاق": "Close",
  "تسجيل البصمة": "Record attendance",
  "اختر نوع العملية": "Choose an action",
  "بعد الاختيار ستفتح الكاميرا لمسح باركود الفرع.": "The camera will open to scan the branch QR code.",
  "خروج": "Check out",
  "تسجيل دخول": "Check-in",
  "تسجيل خروج": "Check-out",
  "وجّه الكاميرا إلى باركود الفرع": "Point the camera at the branch QR code",
  "جاري فتح الكاميرا...": "Opening the camera...",
  "تعذر تحميل قارئ الباركود. تحقق من الاتصال بالإنترنت ثم أعد المحاولة.": "The QR reader could not load. Check your internet connection and try again.",
  "لا توجد أماكن بصمة مرتبطة بجدولك اليوم.": "No attendance locations are linked to your schedule today.",
  "اسمح للمتصفح باستخدام الكاميرا لمسح الباركود.": "Allow the browser to use the camera to scan the QR code.",
  "الموقع الجغرافي غير متاح على هذا الجهاز.": "Location services are unavailable on this device.",
  "اسمح بالوصول إلى موقعك الجغرافي.": "Allow access to your location.",
  "هذا الباركود لا يخص فرع دوامك الحالي.": "This QR code does not belong to your current work branch.",
  "تمت قراءة الباركود، جاري التحقق من الموقع...": "QR code scanned. Verifying your location...",
  "لم يتم ضبط موقع هذا المكان بعد.": "This location has not been configured yet.",
  "تم التحقق من الباركود والموقع. جاري تسجيل البصمة...": "QR code and location verified. Recording attendance...",
  "تعذر التحقق من مكان البصمة.": "Could not verify the attendance location.",
  "تم تسجيل الدخول بنجاح": "Check-in recorded successfully",
  "تم تسجيل الخروج بنجاح": "Check-out recorded successfully",
  "نوع القرابة": "Relationship",
  "الملف الشخصي": "Profile",
  "إعدادات بياناتي": "My profile settings",
  "تسجيل الخروج": "Sign out",
  "الصورة والبيانات الأساسية": "Photo and basic information",
  "تغيير الصورة": "Change photo",
  "الاسم الكامل": "Full name",
  "الرقم المدني": "Civil ID",
  "الجنسية": "Nationality",
  "اختر الجنسية": "Select nationality",
  "المسمى الوظيفي": "Job title",
  "جهة العمل": "Work entity",
  "أرقام الهاتف": "Phone numbers",
  "رقم احتياطي": "Alternate number",
  "رقم الهاتف الشخصي": "Personal phone number",
  "أقرب الأشخاص": "Emergency contacts",
  "إضافة شخص": "Add contact",
  "حفظ بياناتي": "Save my information",
  "تم حفظ بياناتك بنجاح": "Your information was saved successfully",
  "تعذر حفظ البيانات.": "Could not save your information.",
  "حولي": "Hawalli",
  "أبو الحصانية": "Abu Al Hasaniya",
  "اليرموك": "Yarmouk",
  "الأحد": "Sunday", "الاثنين": "Monday", "الثلاثاء": "Tuesday", "الأربعاء": "Wednesday",
  "الخميس": "Thursday", "الجمعة": "Friday", "السبت": "Saturday"
};
const t = text => language === "en" ? (en[text] || text) : text;
const localizeStored = value => language === "en" ? (en[String(value)] || value) : value;

const digits = (value = "") => String(value).replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
const onlyDigits = value => digits(value).replace(/\D/g, "");
const esc = (value = "") => String(value).replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
const firstName = name => String(name || t("موظف")).trim().split(/\s+/)[0];
const initials = name => String(name || "").trim().split(/\s+/).slice(0, 2).map(part => part[0] || "").join("");
const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const formatTime = value => {
  const [hour = 0, minute = 0] = String(value || "00:00").split(":").map(Number);
  return `\u200E${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${language === "en" ? (hour >= 12 ? "PM" : "AM") : (hour >= 12 ? "م" : "ص")}\u200E`;
};
const dialOptions = selected => countries.map(([arabicName, englishName, dial, flag]) => `<option value="${dial}" ${dial === selected ? "selected" : ""}>${flag} ${dial} · ${language === "en" ? englishName : arabicName}</option>`).join("");
const normalPhone = phone => onlyDigits(phone).replace(/^00/, "");

function applyLanguage() {
  const isArabic = language === "ar";
  document.documentElement.lang = language;
  document.documentElement.dir = isArabic ? "rtl" : "ltr";
  document.title = isArabic ? "ركائز | بصمة الموظف" : "Rakaez | Employee Attendance";
  document.querySelectorAll("[data-language]").forEach(button => {
    button.classList.toggle("active", button.dataset.language === language);
    button.setAttribute("aria-pressed", String(button.dataset.language === language));
  });
  $(".language-switch").setAttribute("aria-label", isArabic ? "اختيار اللغة" : "Choose language");
  $("#boot-text").textContent = t("نجهّز بوابة الموظف...");
  $("#portal-brand").textContent = t("ركائز للموظفين");
  $("#login-title").textContent = t("دخول البصمة");
  $("#login-help").textContent = t("أدخل رقم هاتفك الشخصي للدخول مباشرة");
  $("#employee-dial").setAttribute("aria-label", t("مفتاح الدولة"));
  $("#employee-phone").placeholder = t("رقم الهاتف");
  $("#phone-login-button").textContent = t("دخول");
  $("#employee-dial").innerHTML = dialOptions($("#employee-dial").value || "+965");
  $("#portal-loading h3").textContent = t("يرجى الانتظار");
  $("#portal-loading p").textContent = t("يتم حفظ بياناتك...");
  $("#portal-modal").innerHTML = "";
  if (employee) {
    if (currentView === "settings") renderSettings();
    else if (currentView === "services" || currentView === "notifications") renderUnderDevelopment(currentView);
    else renderHome();
  }
}

document.querySelectorAll("[data-language]").forEach(button => button.onclick = () => {
  language = button.dataset.language;
  localStorage.setItem("rakaezEmployeeLanguage", language);
  applyLanguage();
});

function showLogin(message = "") {
  currentView = "login";
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
function loading(show, title = t("يرجى الانتظار"), text = t("يتم حفظ بياناتك...")) {
  const modal = $("#portal-loading");
  modal.classList.toggle("hidden", !show);
  modal.querySelector("h3").textContent = title;
  modal.querySelector("p").textContent = text;
}
function bindNumeric(root = document) {
  root.querySelectorAll('input[inputmode="numeric"]').forEach(input => input.oninput = () => input.value = onlyDigits(input.value));
}
function contactPhones(record = {}) {
  const values = [
    record.primaryPhone,
    ...(Array.isArray(record.alternatePhones) ? record.alternatePhones : []),
    record.kuwaitPhone,
    record.personalPhone,
    record.phone,
    record.phoneNumber
  ];
  const seen = new Set();
  return values.map(value => ({
    phone: normalPhone(value?.phone || value?.number || value),
    dialCode: normalPhone(value?.dialCode || value?.countryCode || "")
  })).filter(value => value.phone && !seen.has(`${value.dialCode}:${value.phone}`) && seen.add(`${value.dialCode}:${value.phone}`));
}
function phoneValues(record) {
  return contactPhones(record).flatMap(value => {
    const combined = `${value.dialCode}${value.phone}`;
    return [value.phone, combined];
  });
}
function findEmployeeByPhone(rawPhone, employees) {
  const entered = normalPhone(rawPhone);
  const short = entered.slice(-8);
  const matches = employees.filter(item => phoneValues(item).some(phone => phone === entered || phone.slice(-8) === short));
  return matches.length === 1 ? matches[0] : null;
}
async function start() {
  try { await signInAnonymously(auth); }
  catch { showLogin(t("تعذر تشغيل بوابة البصمة. فعّل تسجيل الدخول المجهول في Firebase أولاً.")); }
}
onAuthStateChanged(auth, async user => {
  if (!user) return;
  const savedId = sessionStorage.getItem("rakaezEmployeeSession");
  if (!savedId) { showLogin(); return; }
  try {
    const snap = await get(ref(db, `${ROOT}/employees/${savedId}`));
    if (!snap.exists()) throw new Error(t("انتهت الجلسة."));
    employee = { id: snap.key, ...snap.val() };
    await loadPortalData();
    renderHome();
  } catch { sessionStorage.removeItem("rakaezEmployeeSession"); showLogin(); }
});

$("#phone-form").onsubmit = loginWithPhone;
$("#employee-dial").innerHTML = dialOptions("+965");
bindNumeric($("#phone-form"));

async function loginWithPhone(event) {
  event.preventDefault();
  const button = event.submitter;
  const message = $("#pin-message");
  const phone = onlyDigits($("#employee-phone").value);
  if (phone.length < 6) { message.textContent = t("أدخل رقم الهاتف الشخصي بصورة صحيحة."); return; }
  button.disabled = true;
  message.textContent = t("جاري التحقق من الرقم...");
  try {
    const snap = await get(ref(db, `${ROOT}/employees`));
    const list = Object.entries(snap.val() || {}).map(([id, value]) => ({ id, ...value }));
    const selectedDial = normalPhone($("#employee-dial").value);
    employee = findEmployeeByPhone(`${selectedDial}${phone}`, list) || findEmployeeByPhone(phone, list);
    if (!employee) throw new Error(t("رقم الهاتف غير مرتبط بملف موظف."));
    sessionStorage.setItem("rakaezEmployeeSession", employee.id);
    await loadPortalData();
    renderHome();
  } catch (error) { employee = null; message.textContent = error.message || t("تعذر تسجيل الدخول."); }
  finally { button.disabled = false; }
}

async function loadPortalData() {
  const [schedules, places] = await Promise.all([get(ref(db, `${ROOT}/schedules`)), get(ref(db, `${ROOT}/fingerprintPlaces`))]);
  publishedSchedules = Object.values(schedules.val() || {}).filter(item => item.published).sort((a, b) => String(a.dateKey).localeCompare(String(b.dateKey)));
  const configuredPlaces = Object.entries(places.val() || {}).map(([id, value]) => ({ id, ...value }));
  fingerprintPlaces = configuredPlaces.length ? configuredPlaces : defaultFingerprintPlaces;
}
function employeeAssignments() {
  const today = dateKey(new Date());
  const schedule = publishedSchedules.find(item => item.dateKey === today) || publishedSchedules.find(item => item.dateKey >= today) || null;
  return { schedule, items: Object.values(schedule?.assignments || {}).filter(item => item.employeeId === employee?.id).sort((a, b) => String(a.from).localeCompare(String(b.from))) };
}
function branchName(id) { return t(({ hawalli: "حولي", surra: "حولي", abu_al_hasaniya: "أبو الحصانية", abulhasania: "أبو الحصانية", yarmouk: "اليرموك" })[id] || id || ""); }
function shiftCard(item, index) {
  const number = index === 0 ? t("الأول") : index === 1 ? t("الثاني") : index + 1;
  return `<article class="shift-card"><b>${t("الدوام")} ${number}</b><div><span><i class="fa-regular fa-clock"></i><small>${t("الوقت")}</small><strong>${formatTime(item.from)} — ${formatTime(item.to)}</strong></span><span><i class="fa-solid fa-location-dot"></i><small>${t("الفرع")}</small><strong>${branchName(item.branchId)}</strong></span><span><i class="fa-regular fa-clipboard"></i><small>${t("المهام")}</small><strong>${(item.tasks || []).map(task => esc(localizeStored(task))).join(" + ")}</strong></span></div></article>`;
}
function renderHome() {
  currentView = "home";
  const { schedule, items } = employeeAssignments();
  $("#pin-page").classList.add("hidden");
  $("#boot").classList.add("hidden");
  const app = $("#employee-app");
  app.classList.remove("hidden");
  app.innerHTML = `<button id="open-settings" class="settings-button" aria-label="${t("الإعدادات")}"><i class="fa-solid fa-gear"></i></button><section class="employee-hero"><div class="profile-image">${employee.photoUrl || employee.photoDataUrl ? `<img src="${esc(employee.photoUrl || employee.photoDataUrl)}" alt="">` : `<span>${initials(employee.fullName)}</span>`}</div><div><small>${t("مرحباً بك")}</small><h1>${esc(employee.fullName)}</h1><p><i class="fa-regular fa-calendar-days"></i> ${schedule ? `${t("جدول دوام")} ${esc(localizeStored(schedule.dayName))}` : t("لا يوجد جدول منشور")}</p></div></section><section class="today-card"><header><div><span>${t("جدول الدوام")}</span><h2>${schedule ? `${esc(localizeStored(schedule.dayName))} · ${schedule.dateKey}` : t("بانتظار نشر الجدول")}</h2></div><i class="fa-regular fa-calendar-check"></i></header><div class="shifts">${items.length ? items.map(shiftCard).join("") : `<div class="no-shifts"><i class="fa-regular fa-calendar-xmark"></i><p>${t("لا توجد فترات دوام منشورة لك حاليًا.")}</p></div>`}</div></section><section class="fingerprint-area"><button id="fingerprint-button"><i class="fa-solid fa-fingerprint"></i></button><h2>${t("اضغط لتسجيل البصمة")}</h2><p id="fingerprint-status">${t("اختر الدخول أو الخروج ثم وجّه الكاميرا للباركود")}</p></section><nav class="bottom-nav"><button data-view="services"><i class="fa-solid fa-grip"></i><span>${t("خدمات")}</span></button><button class="active"><i class="fa-solid fa-fingerprint"></i><span>${t("البصمة")}</span></button><button data-view="notifications"><i class="fa-regular fa-bell"></i><span>${t("إشعارات")}</span></button></nav>`;
  $("#open-settings").onclick = renderSettings;
  $("#fingerprint-button").onclick = openPunchChooser;
  document.querySelectorAll("[data-view]").forEach(button => button.onclick = () => renderUnderDevelopment(button.dataset.view));
}
function renderUnderDevelopment(view) {
  currentView = view;
  const title = view === "services" ? t("خدمات") : t("إشعارات");
  $("#employee-app").innerHTML = `<div class="inner-page under-development"><header><button id="back-home">${language === "ar" ? "→" : "←"}</button><div><small>${t("بوابة الموظف")}</small><h1>${title}</h1></div></header><section><i class="fa-solid fa-wand-magic-sparkles"></i><h2>${t("قيد التطوير")}</h2></section></div>`;
  $("#back-home").onclick = renderHome;
}

function openPunchChooser() {
  $("#portal-modal").innerHTML = `<div class="portal-modal-backdrop"><section class="portal-modal"><button class="modal-x" aria-label="${t("إغلاق")}">×</button><span>${t("تسجيل البصمة")}</span><h2>${t("اختر نوع العملية")}</h2><p>${t("بعد الاختيار ستفتح الكاميرا لمسح باركود الفرع.")}</p><div class="punch-choice"><button data-punch="checkIn"><i class="fa-solid fa-right-to-bracket"></i><b>${language === "en" ? "Check in" : "دخول"}</b></button><button data-punch="checkOut"><i class="fa-solid fa-right-from-bracket"></i><b>${t("خروج")}</b></button></div></section></div>`;
  const close = () => $("#portal-modal").innerHTML = "";
  $(".modal-x").onclick = close;
  $(".portal-modal-backdrop").onclick = event => { if (event.target.classList.contains("portal-modal-backdrop")) close(); };
  document.querySelectorAll("[data-punch]").forEach(button => button.onclick = () => { pendingPunchType = button.dataset.punch; openScanner(); });
}
function placesForCurrentDuty() {
  const { items } = employeeAssignments();
  const ids = new Set(items.flatMap(item => branchAliases[item.branchId] || [item.branchId]));
  const matchingPlaces = fingerprintPlaces.filter(place => {
    const placeKeys = branchAliases[place.branchKey] || [place.branchKey];
    return placeKeys.some(key => ids.has(key));
  });
  if (!ids.size) return fingerprintPlaces;
  return matchingPlaces.length ? matchingPlaces : fingerprintPlaces;
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
  $("#portal-modal").innerHTML = `<div class="portal-modal-backdrop scanner-backdrop"><section class="portal-modal scanner-modal"><button class="modal-x" aria-label="${t("إغلاق")}">×</button><span>${pendingPunchType === "checkIn" ? t("تسجيل دخول") : t("تسجيل خروج")}</span><h2>${t("وجّه الكاميرا إلى باركود الفرع")}</h2><div class="camera-frame"><video id="qr-video" playsinline muted></video><i></i></div><canvas id="qr-canvas" class="hidden"></canvas><p id="scan-message">${t("جاري فتح الكاميرا...")}</p></section></div>`;
  $(".modal-x").onclick = closeScanner;
  startScanner();
}
async function startScanner() {
  const message = $("#scan-message");
  if (!window.jsQR) { message.textContent = t("تعذر تحميل قارئ الباركود. تحقق من الاتصال بالإنترنت ثم أعد المحاولة."); return; }
  if (!placesForCurrentDuty().length) { message.textContent = t("لا توجد أماكن بصمة مرتبطة بجدولك اليوم."); return; }
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    const video = $("#qr-video");
    video.srcObject = scanStream;
    await video.play();
    scanBarcodeFrame();
  } catch (error) { message.textContent = error.message || t("اسمح للمتصفح باستخدام الكاميرا لمسح الباركود."); }
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
    if (!navigator.geolocation) { reject(new Error(t("الموقع الجغرافي غير متاح على هذا الجهاز."))); return; }
    navigator.geolocation.getCurrentPosition(position => resolve({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy, capturedAt: Date.now() }), error => reject(new Error(error.message || t("اسمح بالوصول إلى موقعك الجغرافي."))), { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  });
}
async function verifyScannedBarcode(value) {
  const message = $("#scan-message");
  const place = matchingPlace(value);
  if (!place) { message.textContent = t("هذا الباركود لا يخص فرع دوامك الحالي."); scanFrame = requestAnimationFrame(scanBarcodeFrame); return; }
  scanBusy = true;
  message.textContent = t("تمت قراءة الباركود، جاري التحقق من الموقع...");
  try {
    const center = place.location || {};
    const radius = Number(place.radiusMeters || 0);
    if (!Number.isFinite(Number(center.lat)) || !Number.isFinite(Number(center.lng)) || radius <= 0) throw new Error(t("لم يتم ضبط موقع هذا المكان بعد."));
    const location = await currentLocation();
    const distance = distanceMeters(location, { lat: Number(center.lat), lng: Number(center.lng) });
    if (distance > radius) throw new Error(language === "en" ? `You are outside the attendance location (${Math.round(distance)} m).` : `أنت خارج نطاق مكان البصمة (${Math.round(distance)} م).`);
    message.textContent = t("تم التحقق من الباركود والموقع. جاري تسجيل البصمة...");
    await recordAttendance(place, { ...location, distance: Math.round(distance), radiusMeters: radius });
    closeScanner();
  } catch (error) { scanBusy = false; message.textContent = error.message || t("تعذر التحقق من مكان البصمة."); scanFrame = requestAnimationFrame(scanBarcodeFrame); }
}
async function recordAttendance(place, location) {
  const today = dateKey(new Date());
  const entry = push(ref(db, `${ROOT}/attendance/${today}/${employee.id}`));
  await set(entry, { id: entry.key, employeeId: employee.id, type: pendingPunchType, timestamp: Date.now(), source: "employee-portal", verificationMode: "barcode-location", fingerprintPlaceId: place.id, barcodeToken: place.barcodeToken || "", barcodeValue: place.barcodeValue || "", barcodeTitle: place.title || place.branchName || "", branchKey: place.branchKey || "", branchName: place.branchName || "", location });
  const message = pendingPunchType === "checkIn" ? t("تم تسجيل الدخول بنجاح") : t("تم تسجيل الخروج بنجاح");
  $("#fingerprint-status") && ($("#fingerprint-status").textContent = message);
  showToast(message);
}

function phoneField(number, dial, index, type) {
  return `<div class="settings-phone-row"><select name="${type}Dial">${dialOptions(dial || "+965")}</select><input name="${type}Phone" value="${esc(number || "")}" inputmode="numeric" maxlength="15" placeholder="${t("رقم الهاتف")}" ${type === "primary" ? "required" : ""}>${type === "alternate" ? `<button type="button" data-remove-phone="${index}" aria-label="${t("إغلاق")}">×</button>` : "<span></span>"}</div>`;
}
function relativeRow(person = {}, index) {
  return `<div class="relative-settings-row">${phoneField(person.phone, person.dialCode, index, "relative")}<input name="relation" value="${esc(person.relation || "")}" placeholder="${t("نوع القرابة")}"><button type="button" data-remove-relative="${index}" aria-label="${t("إغلاق")}">×</button></div>`;
}
function renderSettings() {
  currentView = "settings";
  const alternates = employee.alternatePhones || [];
  const relatives = employee.relatives || [];
  $("#employee-app").innerHTML = `<div class="inner-page settings-page"><header><button id="back-home">${language === "ar" ? "→" : "←"}</button><div><small>${t("الملف الشخصي")}</small><h1>${t("إعدادات بياناتي")}</h1></div><button id="portal-logout" class="portal-logout">${t("تسجيل الخروج")}</button></header><form id="settings-form"><section><h2>${t("الصورة والبيانات الأساسية")}</h2><label class="settings-photo"><input id="settings-photo" type="file" accept="image/*"><span>${employee.photoUrl || employee.photoDataUrl ? `<img src="${esc(employee.photoUrl || employee.photoDataUrl)}" alt="">` : `<i class="fa-solid fa-camera"></i>`}</span><b>${t("تغيير الصورة")}</b></label><div class="settings-grid"><label>${t("الاسم الكامل")}<input name="fullName" value="${esc(employee.fullName || "")}" required></label><label>${t("الرقم المدني")}<input name="civilId" value="${esc(employee.civilId || "")}" inputmode="numeric" maxlength="12" required></label><label>${t("الجنسية")}<select name="nationality"><option value="">${t("اختر الجنسية")}</option>${countries.map(([arabicName, englishName, , flag]) => `<option value="${arabicName}" ${employee.nationality === arabicName ? "selected" : ""}>${flag} ${language === "en" ? englishName : arabicName}</option>`).join("")}</select></label><label>${t("المسمى الوظيفي")}<input name="jobTitle" value="${esc(employee.jobTitle || "")}" required></label><label class="wide">${t("جهة العمل")}<input name="workEntity" value="${esc(localizeStored(employee.workEntity || ""))}" readonly></label></div></section><section><div class="settings-section-head"><h2>${t("أرقام الهاتف")}</h2><button type="button" id="add-alt-phone">＋ ${t("رقم احتياطي")}</button></div><label>${t("رقم الهاتف الشخصي")}${phoneField(employee.primaryPhone?.phone || employee.kuwaitPhone, employee.primaryPhone?.dialCode || "+965", 0, "primary")}</label><div id="settings-alternates">${alternates.map((phone, index) => phoneField(phone.phone, phone.dialCode, index, "alternate")).join("")}</div></section><section><div class="settings-section-head"><h2>${t("أقرب الأشخاص")}</h2><button type="button" id="add-relative">＋ ${t("إضافة شخص")}</button></div><div id="settings-relatives">${relatives.map(relativeRow).join("")}</div></section><p id="settings-message"></p><button class="save-settings">${t("حفظ بياناتي")}</button></form></div>`;
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
  const message = $("#settings-message");
  loading(true);
  try {
    let photoUrl = employee.photoUrl || "";
    const file = $("#settings-photo").files[0];
    if (file) { const target = storageRef(storage, `employee-photos/${employee.id}/${Date.now()}-${file.name}`); await uploadBytes(target, file); photoUrl = await getDownloadURL(target); }
    const primary = $("[name='primaryPhone']").closest(".settings-phone-row");
    const alternatePhones = [...document.querySelectorAll("#settings-alternates .settings-phone-row")].map(row => ({ dialCode: row.querySelector("select").value, phone: onlyDigits(row.querySelector("input").value) })).filter(item => item.phone);
    const relatives = [...document.querySelectorAll("#settings-relatives .relative-settings-row")].map(row => ({ dialCode: row.querySelector("select").value, phone: onlyDigits(row.querySelector(".settings-phone-row input").value), relation: row.querySelector("[name='relation']").value.trim() })).filter(item => item.phone);
    const changes = { fullName: data.fullName.trim(), civilId: onlyDigits(data.civilId), nationality: data.nationality || "", jobTitle: data.jobTitle.trim(), primaryPhone: { dialCode: primary.querySelector("select").value, phone: onlyDigits(primary.querySelector("input").value) }, alternatePhones, relatives, photoUrl, profileCompleted: true, profileUpdatedAt: Date.now() };
    await update(ref(db, `${ROOT}/employees/${employee.id}`), changes);
    employee = { ...employee, ...changes };
    showToast(t("تم حفظ بياناتك بنجاح")); renderHome();
  } catch (error) { message.textContent = error.message || t("تعذر حفظ البيانات."); }
  finally { loading(false); }
}

applyLanguage();
start();
