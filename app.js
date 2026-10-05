import { CONFIG } from "./config.js?v=20260725-phone-login";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { getDatabase, ref, get, set, push, update, onValue, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";
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
let employeeNotifications = [];
let notificationTab="unread";
let visibleUnreadIds=new Set();
let fingerprintPlaces = [];
let employeeLeaves = [];
let stopNotificationListener = null;
let notificationListenerReady = false;
let tomorrowPopupShown = false;
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
  "إجازة اليوم": "Today's leave",
  "إجازة أسبوعية": "Weekly leave",
  "إجازة سنوية": "Annual leave",
  "إجازة مرضية": "Sick leave",
  "إجازة": "Leave",
  "نصف يوم": "Half day",
  "لديك إجازة اليوم": "You are on leave today",
  "جارٍ تحليل الباركود...": "Analyzing QR code...",
  "تم تسجيل بصمة الدخول بنجاح": "Check-in recorded successfully",
  "تم تسجيل بصمة الخروج بنجاح": "Check-out recorded successfully",
  "اضغط لتسجيل البصمة": "Tap to record attendance",
  "اختر الدخول أو الخروج ثم وجّه الكاميرا للباركود": "Choose check-in or check-out, then point the camera at the QR code",
  "خدمات": "Services",
  "البصمة": "Attendance",
  "إشعارات": "Notifications",
  "لا توجد إشعارات": "No notifications",
  "ستظهر هنا إشعارات الدوام والملاحظات الجديدة.": "New schedule and note notifications will appear here.",
  "دوامك غداً": "Your shift tomorrow",
  "إجازتك غداً": "Your leave tomorrow",
  "إجازتك ودوامك غداً": "Your leave and shift tomorrow",
  "تفاصيل دوامك": "Your shift details",
  "تم تسجيل إجازتك في الجدول": "Your leave was added to the schedule",
  "ملاحظات": "Notes",
  "تم نشر جدول جديد": "A new schedule was published",
  "تفعيل إشعارات الجهاز": "Enable device notifications",
  "الإشعارات مفعّلة": "Device notifications are enabled",
  "فعّل الإشعارات لتصلك تنبيهات الجدول على جهازك.": "Enable notifications to receive schedule alerts on your device.",
  "تعذر تفعيل الإشعارات من إعدادات المتصفح.": "Notifications could not be enabled. Check your browser settings.",
  "جديد": "New",
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
  "هذا الباركود لا يخص فرع دوامك الحالي.": "This QR code does not belong to your current work branch.",
  "تعذر تسجيل البصمة عبر الباركود.": "Could not record attendance from the QR code.",
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
const employeeName = () => language === "en"
  ? String(employee?.fullNameEn || "").trim()
  : String(employee?.fullNameAr || employee?.fullName || "").trim();
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
    else if (currentView === "services") renderServices();
    else if (currentView === "notifications") renderNotifications();
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
  const savedId = localStorage.getItem("rakaezEmployeeSession") || sessionStorage.getItem("rakaezEmployeeSession");
  if (!savedId) { showLogin(); return; }
  try {
    const snap = await get(ref(db, `${ROOT}/employees/${savedId}`));
    if (!snap.exists()) throw new Error(t("انتهت الجلسة."));
    employee = { id: snap.key, ...snap.val() };
    localStorage.setItem("rakaezEmployeeSession", employee.id);
    sessionStorage.removeItem("rakaezEmployeeSession");
    await loadPortalData();
    renderInitialPortal();
  } catch { localStorage.removeItem("rakaezEmployeeSession"); sessionStorage.removeItem("rakaezEmployeeSession"); showLogin(); }
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
    localStorage.setItem("rakaezEmployeeSession", employee.id);
    await loadPortalData();
    renderInitialPortal();
  } catch (error) { employee = null; message.textContent = error.message || t("تعذر تسجيل الدخول."); }
  finally { button.disabled = false; }
}

async function loadPortalData() {
  const today = new Date(), tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const dateKey = value => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  const scheduleDates = [dateKey(today), dateKey(tomorrow)];
  const [schedules, places, leaves, notifications] = await Promise.all([Promise.all(scheduleDates.map(date => get(ref(db, `${ROOT}/schedules/${date}`)))), get(ref(db, `${ROOT}/fingerprintPlaces`)), get(query(ref(db, `${ROOT}/leaves`), orderByChild("employeeId"), equalTo(employee.id))), get(ref(db, `${ROOT}/employeeNotifications/${employee.id}`))]);
  publishedSchedules = schedules.map(snap => snap.val()).filter(item => item?.published).sort((a, b) => String(a.dateKey).localeCompare(String(b.dateKey)));
  employeeNotifications = Object.values(notifications.val() || {}).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  const configuredPlaces = Object.entries(places.val() || {}).map(([id, value]) => ({ id, ...value }));
  fingerprintPlaces = configuredPlaces.length ? configuredPlaces : defaultFingerprintPlaces;
  employeeLeaves = Object.entries(leaves.val() || {}).map(([id, value]) => ({ id, ...value }));
  updateAppBadge();
  bindNotificationListener();
}
function renderInitialPortal() {
  const requestedView = new URLSearchParams(location.search).get("view");
  if (requestedView === "notifications") renderNotifications();
  else renderHome();
}
function unreadNotifications() { return employeeNotifications.filter(item => !item.read); }
async function updateAppBadge() {
  const count = unreadNotifications().length;
  try {
    if (count && navigator.setAppBadge) await navigator.setAppBadge(count);
    else if (!count && navigator.clearAppBadge) await navigator.clearAppBadge();
  } catch {}
}
function notificationBadge() {
  const count = unreadNotifications().length;
  return count ? `<em class="notification-badge" aria-label="${count}">${count > 9 ? "9+" : count}</em>` : "";
}
function bindNotificationListener() {
  stopNotificationListener?.();
  notificationListenerReady = false;
  stopNotificationListener = onValue(ref(db, `${ROOT}/employeeNotifications/${employee.id}`), snap => {
    const previousIds = new Set(employeeNotifications.map(item => `${item.id}:${item.createdAt}`));
    const next = Object.values(snap.val() || {}).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    const fresh = next.find(item => !previousIds.has(`${item.id}:${item.createdAt}`));
    employeeNotifications = next;
    updateAppBadge();
    if (currentView === "notifications") renderNotifications(false);
    else refreshVisibleNotificationBadge();
    if (notificationListenerReady && fresh) {
      showDeviceNotification(fresh);
      if (isTomorrowNotification(fresh)) showTomorrowSchedulePopup(fresh);
    }
    notificationListenerReady = true;
  });
}
function refreshVisibleNotificationBadge() {
  document.querySelectorAll(".notification-badge").forEach(node => node.remove());
  const button = document.querySelector('[data-view="notifications"]');
  if (button && unreadNotifications().length) button.insertAdjacentHTML("beforeend", notificationBadge());
}
function isToday(timestamp) { return dateKey(new Date(Number(timestamp))) === dateKey(new Date()); }
function tomorrowKey() { const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); return dateKey(tomorrow); }
function isTomorrowNotification(item) { return item?.type === "schedule" && item.scheduleDate === tomorrowKey() && isToday(item.publishedAt || item.createdAt); }
function tomorrowNotification() { return employeeNotifications.find(isTomorrowNotification) || null; }
function translatedTasks(item) {
  if (language !== "en") return item.tasks || [];
  return (item.taskTranslations || []).map(value => value?.text || value).filter(Boolean);
}
function notificationShiftCard(item, index) {
  return `<article class="notification-shift"><b>${t("الدوام")} ${index + 1}</b><div><span><i class="fa-regular fa-clock"></i>${formatTime(item.from)} — ${formatTime(item.to)}</span><span><i class="fa-solid fa-location-dot"></i>${branchName(item.branchId)}</span></div>${translatedTasks(item).length ? `<p><i class="fa-regular fa-clipboard"></i>${translatedTasks(item).map(esc).join(" + ")}</p>` : ""}</article>`;
}
function notificationNotes(item) {
  const values = (item.notes || []).map(note => language === "en" ? (note.translation || note.text) : note.text).filter(Boolean);
  return values.length ? `<section class="notification-notes"><b><i class="fa-regular fa-message"></i>${t("ملاحظات")}</b>${values.map(value => `<p>${esc(value)}</p>`).join("")}</section>` : "";
}
function notificationLeaveCard(item) {
  if (!item?.leave) return "";
  const leave = item.leave;
  return `<section class="notification-leave"><i class="fa-solid fa-umbrella-beach"></i><div><b>${leaveTypeText(leave)}</b>${leave.duration === "half" ? `<small>${t("نصف يوم")}</small>` : ""}</div></section>`;
}
function notificationTitle(item) {
  if(item?.type==="deduction")return language==="en"?"Salary deduction letter":"كتاب خصم من الراتب";
  if (item?.type === "attendance_alert") return language === "en" ? "Attendance alert" : "تنبيه الحضور والانصراف";
  if (!item?.leave) return t("تفاصيل دوامك");
  return t(item.leave.duration === "half" && item.shifts?.length ? "إجازتك ودوامك غداً" : "إجازتك غداً");
}
function notificationDetails(item) {
  if(item?.type==="deduction")return `<div class="deduction-notification-details"><p><b>${language==="en"?"Amount:":"المبلغ:"}</b> ${esc(item.amount)} د.ك</p><p><b>${language==="en"?"Reason:":"سبب الخصم:"}</b> ${esc(item.reason)}</p><p><b>${language==="en"?"Deduction letter:":"كتاب الخصم:"}</b></p><div class="deduction-file-actions"><button data-deduction-download="${esc(item.id)}">${language==="en"?"Download PDF":"تحميل PDF"}</button><button data-deduction-share="${esc(item.id)}">${language==="en"?"Share":"مشاركة"}</button></div></div>`;
  if (item?.type === "attendance_alert") return `<div class="attendance-alert-message">${esc(item.message || "تنبيه الحضور والانصراف")}</div>`;
  return `<div class="notification-details">${notificationLeaveCard(item)}${(item.shifts || []).map(notificationShiftCard).join("")}${notificationNotes(item)}</div>`;
}
function showTomorrowSchedulePopup(item = tomorrowNotification()) {
  if (!item || tomorrowPopupShown) return;
  tomorrowPopupShown = true;
  $("#portal-modal").innerHTML = `<div class="portal-modal-backdrop schedule-alert-backdrop"><section class="portal-modal schedule-alert-modal ${item.leave ? "leave-alert" : ""}" role="dialog" aria-modal="true"><div class="schedule-alert-icon"><i class="fa-solid ${item.leave ? "fa-umbrella-beach" : "fa-bell"}"></i></div><span>${t(item.leave ? "تم تسجيل إجازتك في الجدول" : "تم نشر جدول جديد")}</span><h2>${notificationTitle(item)}</h2><p class="schedule-alert-date">${esc(localizeStored(item.dayName || ""))} · ${esc(item.scheduleDate || "")}</p>${notificationDetails(item)}<button type="button" class="schedule-alert-close">${t("إغلاق")}</button></section></div>`;
  const close = () => $("#portal-modal").innerHTML = "";
  $(".schedule-alert-close").onclick = close;
  $(".schedule-alert-backdrop").onclick = event => { if (event.target.classList.contains("schedule-alert-backdrop")) close(); };
}
async function showDeviceNotification(item) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (item?.type === "attendance_alert" || item?.type === "deduction") {
    try {
      const registration = await navigator.serviceWorker?.ready;
      await registration?.showNotification(notificationTitle(item), { body: item.type==="deduction"?`${item.amount} د.ك · ${item.reason}`:item.message || "تنبيه الحضور والانصراف", icon: "fingerprint-icon-192.png", badge: "fingerprint-icon-192.png", tag: item.id, data: { url: "./?view=notifications" } });
    } catch {}
    return;
  }
  const firstShift = item.shifts?.[0];
  const leaveText = item.leave ? `${leaveTypeText(item.leave)}${item.leave.duration === "half" ? ` · ${t("نصف يوم")}` : ""}` : "";
  const shiftText = firstShift ? `${formatTime(firstShift.from)} — ${formatTime(firstShift.to)} · ${branchName(firstShift.branchId)}` : "";
  const body = [leaveText, shiftText].filter(Boolean).join(" · ") || t("تفاصيل دوامك");
  try {
    const registration = await navigator.serviceWorker?.ready;
    await registration?.showNotification(notificationTitle(item), { body, icon: "fingerprint-icon-192.png", badge: "fingerprint-icon-192.png", tag: item.id, data: { url: "./?view=notifications" } });
  } catch {}
}
function employeeAssignments() {
  const today = dateKey(new Date());
  const schedule = publishedSchedules.find(item => item.dateKey === today) || publishedSchedules.find(item => item.dateKey >= today) || null;
  return { schedule, items: Object.values(schedule?.assignments || {}).filter(item => item.employeeId === employee?.id).sort((a, b) => String(a.from).localeCompare(String(b.from))) };
}
function weeklyLeaveDays(leave) {
  if (Array.isArray(leave?.weeklyDays) && leave.weeklyDays.length) return [...new Set(leave.weeklyDays.map(Number))];
  return Number.isInteger(Number(leave?.weeklyDay)) ? [Number(leave.weeklyDay)] : [];
}
function leaveForToday() {
  const today = dateKey(new Date());
  const weekday = new Date(`${today}T12:00:00`).getDay();
  return employeeLeaves.filter(leave => {
    if (leave.type === "weekly") return weeklyLeaveDays(leave).includes(weekday);
    return leave.startDate <= today && leave.endDate >= today && !(leave.skipEnabled && Number(leave.skipWeekday) === weekday);
  }).sort((a, b) => (b.duration === "full") - (a.duration === "full") || Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0))[0] || null;
}
function leaveTypeText(leave) { return leave?.type === "weekly" ? t("إجازة أسبوعية") : leave?.type === "annual" ? t("إجازة سنوية") : leave?.type === "sick" ? t("إجازة مرضية") : t("إجازة"); }
function leaveCard(leave) { return `<div class="leave-today-card"><i class="fa-solid fa-umbrella-beach"></i><div><b>${t("لديك إجازة اليوم")}</b><p>${leaveTypeText(leave)}${leave.duration === "half" ? ` · ${t("نصف يوم")}` : ""}</p></div></div>`; }
function branchName(id) { return t(({ hawalli: "حولي", surra: "حولي", abu_al_hasaniya: "أبو الحصانية", abulhasania: "أبو الحصانية", yarmouk: "اليرموك" })[id] || id || ""); }
function shiftCard(item, index) {
  const number = index === 0 ? t("الأول") : index === 1 ? t("الثاني") : index + 1;
  const tasks = language === "en"
    ? (item.taskTranslations || []).map(value => value?.text || value).filter(Boolean)
    : (item.tasks || []);
  return `<article class="shift-card"><b>${t("الدوام")} ${number}</b><div><span><i class="fa-regular fa-clock"></i><small>${t("الوقت")}</small><strong>${formatTime(item.from)} — ${formatTime(item.to)}</strong></span><span><i class="fa-solid fa-location-dot"></i><small>${t("الفرع")}</small><strong>${branchName(item.branchId)}</strong></span><span><i class="fa-regular fa-clipboard"></i><small>${t("المهام")}</small><strong>${tasks.map(task => esc(language === "en" ? task : localizeStored(task))).join(" + ")}</strong></span></div></article>`;
}
function renderHome() {
  currentView = "home";
  const { schedule, items } = employeeAssignments();
  const leave = leaveForToday();
  $("#pin-page").classList.add("hidden");
  $("#boot").classList.add("hidden");
  const app = $("#employee-app");
  app.classList.remove("hidden");
  app.innerHTML = `<button id="open-settings" class="settings-button" aria-label="${t("الإعدادات")}"><i class="fa-solid fa-gear"></i></button><section class="employee-hero"><div class="profile-image">${employee.photoUrl || employee.photoDataUrl ? `<img src="${esc(employee.photoUrl || employee.photoDataUrl)}" alt="">` : `<span>${initials(employee.fullName)}</span>`}</div><div><small>${t("مرحباً بك")}</small><h1>${esc(employee.fullName)}</h1><p><i class="fa-regular fa-calendar-days"></i> ${leave ? t("إجازة اليوم") : schedule ? `${t("جدول دوام")} ${esc(localizeStored(schedule.dayName))}` : t("لا يوجد جدول منشور")}</p></div></section><section class="today-card"><header><div><span>${leave ? t("إجازة اليوم") : t("جدول الدوام")}</span><h2>${leave ? leaveTypeText(leave) : schedule ? `${esc(localizeStored(schedule.dayName))} · ${schedule.dateKey}` : t("بانتظار نشر الجدول")}</h2></div><i class="${leave ? "fa-solid fa-umbrella-beach" : "fa-regular fa-calendar-check"}"></i></header><div class="shifts">${leave ? leaveCard(leave) : items.length ? items.map(shiftCard).join("") : `<div class="no-shifts"><i class="fa-regular fa-calendar-xmark"></i><p>${t("لا توجد فترات دوام منشورة لك حاليًا.")}</p></div>`}</div></section><section class="fingerprint-area"><button id="fingerprint-button"><i class="fa-solid fa-fingerprint"></i></button><h2>${t("اضغط لتسجيل البصمة")}</h2><p id="fingerprint-status">${t("اختر الدخول أو الخروج ثم وجّه الكاميرا للباركود")}</p></section>${bottomNavigation("home")}`;
  app.querySelector(".employee-hero h1").textContent=employeeName();
  const avatar=app.querySelector(".profile-image span");if(avatar)avatar.textContent=initials(employeeName());
  $("#open-settings").onclick = renderSettings;
  $("#fingerprint-button").onclick = openPunchChooser;
  bindBottomNavigation();
  window.setTimeout(() => showTomorrowSchedulePopup(), 0);
}
function bottomNavigation(active) {
  return `<nav class="bottom-nav"><button data-view="services" class="${active === "services" ? "active" : ""}"><i class="fa-solid fa-grip"></i><span>${t("خدمات")}</span></button><button data-view="home" class="${active === "home" ? "active" : ""}"><i class="fa-solid fa-fingerprint"></i><span>${t("البصمة")}</span></button><button data-view="notifications" class="${active === "notifications" ? "active" : ""}"><i class="fa-regular fa-bell"></i><span>${t("إشعارات")}</span>${notificationBadge()}</button></nav>`;
}
function bindBottomNavigation() {
  document.querySelectorAll("[data-view]").forEach(button => button.onclick = () => {
    if (button.dataset.view === "home") renderHome();
    else if (button.dataset.view === "services") renderServices();
    else renderNotifications();
  });
}
function renderServices() {
  currentView = "services";
  $("#employee-app").innerHTML = `<div class="inner-page under-development nav-page"><header><div><small>${t("بوابة الموظف")}</small><h1>${t("خدمات")}</h1></div></header><section><i class="fa-solid fa-wand-magic-sparkles"></i><h2>${t("قيد التطوير")}</h2></section></div>${bottomNavigation("services")}`;
  bindBottomNavigation();
}
async function markNotificationsRead() {
  const unread = unreadNotifications();
  if (!unread.length) return;
  employeeNotifications = employeeNotifications.map(item => ({ ...item, read: true }));
  updateAppBadge();
  await Promise.all(unread.map(item => update(ref(db, `${ROOT}/employeeNotifications/${employee.id}/${item.id}`), { read: true, readAt: Date.now() }).catch(() => {})));
}
function notificationPermissionCard() {
  if (!("Notification" in window)) return "";
  const enabled = Notification.permission === "granted";
  return `<section class="notification-permission ${enabled ? "enabled" : ""}"><i class="fa-solid ${enabled ? "fa-circle-check" : "fa-bell"}"></i><div><b>${enabled ? t("الإشعارات مفعّلة") : t("تفعيل إشعارات الجهاز")}</b><p>${enabled ? t("ستظهر هنا إشعارات الدوام والملاحظات الجديدة.") : t("فعّل الإشعارات لتصلك تنبيهات الجدول على جهازك.")}</p></div>${enabled ? "" : `<button id="enable-notifications">${t("تفعيل إشعارات الجهاز")}</button>`}</section>`;
}
function notificationTabItems(tab=notificationTab){
  return [...employeeNotifications].filter(item=>tab==="unread"?(!item.read||visibleUnreadIds.has(item.id)):tab==="schedules"?item.type==="schedule":item.type!=="schedule").sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0));
}
function renderNotifications(resetTab = true) {
  if(resetTab){notificationTab="unread";visibleUnreadIds=new Set();}
  if(notificationTab==="unread")employeeNotifications.filter(item=>!item.read).forEach(item=>visibleUnreadIds.add(item.id));
  const items=notificationTabItems();
  currentView = "notifications";
  $("#employee-app").innerHTML = `<div class="inner-page notifications-page nav-page"><header><div><small>${t("بوابة الموظف")}</small><h1>${t("إشعارات")}</h1></div></header><nav class="notification-tabs">${[["unread","غير مقروء","Unread"],["previous","الإشعارات السابقة","Past notifications"],["schedules","الدوامات السابقة","Past schedules"]].map(([key,ar,en])=>`<button data-notification-tab="${key}" class="${notificationTab===key?"active":""}">${language==="en"?en:ar}</button>`).join("")}</nav>${notificationPermissionCard()}<section class="notifications-list">${items.length ? items.map(item => `<article class="notification-card ${item.read ? "" : "unread"} ${item.leave ? "leave-notification" : ""} ${item.type === "attendance_alert" ? "attendance-alert-notification" : ""}"><header><div class="notification-card-icon"><i class="fa-solid ${item.type === "attendance_alert" ? "fa-triangle-exclamation" : item.leave ? "fa-umbrella-beach" : "fa-calendar-check"}"></i></div><div><span>${item.read ? "" : t("جديد")}</span><h2>${notificationTitle(item)}</h2><p>${esc(localizeStored(item.dayName || ""))} · ${esc(item.scheduleDate || "")}</p></div></header>${notificationDetails(item)}</article>`).join("") : `<div class="empty-notifications"><i class="fa-regular fa-bell-slash"></i><h2>${notificationTab==="unread"?(language==="en"?"No new notifications":"لا توجد إشعارات جديدة"):t("لا توجد إشعارات")}</h2><p>${language==="en"?"Please go to Past notifications or Past schedules to view earlier items.":"يرجى الانتقال للإشعارات السابقة أو الدوامات السابقة للاطلاع على كل ما سبق."}</p></div>`}</section></div>${bottomNavigation("notifications")}`;
  bindBottomNavigation();
  $("#enable-notifications")?.addEventListener("click", enableDeviceNotifications);
  document.querySelectorAll("[data-notification-tab]").forEach(button=>button.onclick=()=>{notificationTab=button.dataset.notificationTab;visibleUnreadIds=new Set();renderNotifications(false);});
  document.querySelectorAll("[data-deduction-download],[data-deduction-share]").forEach(button=>button.onclick=()=>openDeductionFile(button));
  const visibleUnread=items.filter(item=>!item.read);
  // Keep the visible unread cards until the next visit or tab change.
  if(visibleUnread.length){

    Promise.all(visibleUnread.map(item=>update(ref(db,`${ROOT}/employeeNotifications/${employee.id}/${item.id}`),{read:true,readAt:Date.now()}).then(()=>{item.read=true;}).catch(()=>{})));
  }
}
async function openDeductionFile(button){
  const id=button.dataset.deductionDownload||button.dataset.deductionShare,item=employeeNotifications.find(item=>item.id===id);
  if(!item)return;button.disabled=true;
  try{
    const snapshot=await get(ref(db,`${ROOT}/deductionFiles/${String(item.id).replace(/^deduction-/,"")}`));
    const dataUrl=snapshot.val()?.dataUrl;
    if(!dataUrl?.startsWith("data:application/pdf"))throw new Error("تعذر تحميل ملف الكتاب.");
    const blob=await (await fetch(dataUrl)).blob(),file=new File([blob],item.pdfFilename||"deduction.pdf",{type:"application/pdf"});
    if(button.dataset.deductionShare&&navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:notificationTitle(item)});}
    else {const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=file.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  }catch(error){if(error.name!=="AbortError")showToast(error.message||"تعذر تحميل الملف.");}finally{button.disabled=false;}
}
async function enableDeviceNotifications() {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error();
    renderNotifications(false);
  } catch { showToast(t("تعذر تفعيل الإشعارات من إعدادات المتصفح.")); }
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
function showAttendanceProcessing() {
  $("#portal-modal").innerHTML = `<div class="portal-modal-backdrop attendance-result-backdrop"><section class="attendance-result processing"><div class="attendance-spinner"><i class="fa-solid fa-qrcode"></i></div><span>${t("تسجيل البصمة")}</span><h2>${t("جارٍ تحليل الباركود...")}</h2><p>${language === "en" ? "Please wait a moment" : "يرجى الانتظار لحظة"}</p></section></div>`;
}
function showAttendanceResult(type, error = "") {
  const success = !error;
  const title = success ? (type === "checkIn" ? t("تم تسجيل بصمة الدخول بنجاح") : t("تم تسجيل بصمة الخروج بنجاح")) : (error || t("تعذر تسجيل البصمة عبر الباركود."));
  $("#portal-modal").innerHTML = `<div class="portal-modal-backdrop attendance-result-backdrop"><section class="attendance-result ${success ? "success" : "failed"}"><div class="attendance-result-icon"><i class="fa-solid ${success ? "fa-check" : "fa-xmark"}"></i></div><span>${t("تسجيل البصمة")}</span><h2>${title}</h2><p>${success ? (type === "checkIn" ? (language === "en" ? "Welcome, your attendance has been saved." : "أهلاً بك، تم حفظ حضورك بنجاح.") : (language === "en" ? "Have a good day, your checkout has been saved." : "تم حفظ انصرافك بنجاح.")) : ""}</p><button type="button" class="attendance-result-close">${t("إغلاق")}</button></section></div>`;
  $(".attendance-result-close").onclick = () => { $("#portal-modal").innerHTML = ""; };
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
    await recordVerifiedAttendance(place, { ...location, distance: Math.round(distance), radiusMeters: radius });
    closeScanner();
  } catch (error) { scanBusy = false; message.textContent = error.message || t("تعذر التحقق من مكان البصمة."); scanFrame = requestAnimationFrame(scanBarcodeFrame); }
}
async function recordVerifiedAttendance(place, location) {
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
  const nameInput=$("#settings-form [name='fullName']"),nameLabel=nameInput.closest("label");
  nameInput.name="fullNameAr";nameInput.value=employee.fullNameAr||employee.fullName||"";nameLabel.firstChild.textContent=language==="en"?"Name in Arabic":"اسم الموظف بالعربي";
  nameLabel.insertAdjacentHTML("afterend",`<label>${language==="en"?"Name in English":"اسم الموظف بالإنجليزي"}<input name="fullNameEn" dir="ltr" value="${esc(employee.fullNameEn||"")}" required></label>`);
  bindSettingsEvents();
}
function bindSettingsEvents() {
  bindNumeric($("#settings-form"));
  $("#back-home").onclick = renderHome;
  $("#portal-logout").onclick = () => { stopNotificationListener?.(); stopNotificationListener = null; localStorage.removeItem("rakaezEmployeeSession"); sessionStorage.removeItem("rakaezEmployeeSession"); employee = null; employeeNotifications = []; tomorrowPopupShown = false; updateAppBadge(); showLogin(); };
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
    const changes = { fullName: data.fullNameAr.trim(), fullNameAr: data.fullNameAr.trim(), fullNameEn: data.fullNameEn.trim(), civilId: onlyDigits(data.civilId), nationality: data.nationality || "", jobTitle: data.jobTitle.trim(), primaryPhone: { dialCode: primary.querySelector("select").value, phone: onlyDigits(primary.querySelector("input").value) }, alternatePhones, relatives, photoUrl, profileCompleted: true, profileUpdatedAt: Date.now() };
    await update(ref(db, `${ROOT}/employees/${employee.id}`), changes);
    employee = { ...employee, ...changes };
    showToast(t("تم حفظ بياناتك بنجاح")); renderHome();
  } catch (error) { message.textContent = error.message || t("تعذر حفظ البيانات."); }
  finally { loading(false); }
}

applyLanguage();
start();
