const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const DRAFT_KEY = "figsOlivesStoreAdminDraftV2";
const DB_NAME = "figsOlivesStoreAssets";
const DB_STORE = "assets";

let categories = [];
let products = [];
let siteCategories = [];
let siteProducts = [];
let editingImages = [];
let openCategories = new Set();
let dragState = null;
let toastTimer;
const assetUrls = new Map();

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("show"), 2200);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clean(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[character]));
}

function normalizeData() {
  categories = categories
    .map((category, index) => ({
      id: clean(category.id) || `category-${Date.now()}-${index}`,
      nameAr: clean(category.nameAr || category.name) || "قسم جديد",
      nameEn: clean(category.nameEn || category.id) || "New category",
      order: index + 1
    }))
    .sort((a, b) => Number(a.order) - Number(b.order))
    .map((category, index) => ({ ...category, order: index + 1 }));

  products = products.map((product, index) => {
    const images = (Array.isArray(product.images) ? product.images : [product.image]).filter(Boolean);
    return {
      ...product,
      id: String(product.id || `P${Date.now()}${index}`),
      name: clean(product.name),
      nameEn: clean(product.nameEn),
      description: clean(product.description),
      descriptionEn: clean(product.descriptionEn),
      category: clean(product.category),
      price: Number(product.price) || 0,
      images,
      image: images[0] || "",
      order: Number(product.order) || index + 1
    };
  });
  categories.forEach((category) => normalizeProductOrder(category.id));
}

function normalizeProductOrder(categoryId) {
  products
    .filter((product) => product.category === categoryId)
    .sort((a, b) => Number(a.order) - Number(b.order))
    .forEach((product, index) => {
      product.order = index + 1;
    });
}

async function fetchFirst(paths) {
  for (const path of paths) {
    try {
      const response = await fetch(path, { cache: "no-store" });
      if (response.ok) return await response.json();
    } catch {
      // Try the next path. This supports both the workspace and GitHub layouts.
    }
  }
  throw new Error("تعذر تحميل ملف البيانات");
}

function openAssetDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putAsset(path, blob) {
  const database = await openAssetDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(DB_STORE, "readwrite");
    transaction.objectStore(DB_STORE).put(blob, path);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function getAsset(path) {
  const database = await openAssetDatabase();
  const result = await new Promise((resolve, reject) => {
    const request = database.transaction(DB_STORE).objectStore(DB_STORE).get(path);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return result;
}

async function clearAssets() {
  const database = await openAssetDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(DB_STORE, "readwrite");
    transaction.objectStore(DB_STORE).clear();
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function resolveAsset(path) {
  if (!path?.startsWith("product-images/")) return path || "";
  if (assetUrls.has(path)) return assetUrls.get(path);
  const blob = await getAsset(path).catch(() => null);
  if (!blob) return path;
  const url = URL.createObjectURL(blob);
  assetUrls.set(path, url);
  return url;
}

async function loadData() {
  [siteProducts, siteCategories] = await Promise.all([
    fetchFirst(["../products.json", "../منصة الطلبات/products.json", "products.json"]),
    fetchFirst(["../categories.json", "../منصة الطلبات/categories.json", "categories.json"])
  ]);
  const draft = localStorage.getItem(DRAFT_KEY);
  if (draft) {
    try {
      const saved = JSON.parse(draft);
      products = saved.products;
      categories = saved.categories;
      $("#saveState").textContent = "تم تحميل آخر مسودة محفوظة";
    } catch {
      products = clone(siteProducts);
      categories = clone(siteCategories);
    }
  } else {
    products = clone(siteProducts);
    categories = clone(siteCategories);
  }
  normalizeData();
  render();
}

function categoryProducts(categoryId) {
  return products
    .filter((product) => product.category === categoryId)
    .sort((a, b) => Number(a.order) - Number(b.order));
}

function imageSource(product) {
  const source = product.images?.[0] || product.image || "";
  return assetUrls.get(source) || source;
}

function render() {
  normalizeData();
  $("#categoryCount").textContent = categories.length;
  $("#productCount").textContent = products.length;
  $("#categoryList").innerHTML = categories.map((category) => {
    const list = categoryProducts(category.id);
    return `
      <article class="category-card ${openCategories.has(category.id) ? "open" : ""}" data-category-id="${escapeHtml(category.id)}">
        <div class="category-head">
          <span class="drag-handle" draggable="true" data-drag-kind="category" data-drag-id="${escapeHtml(category.id)}" title="اسحب لتغيير الترتيب">⠿</span>
          <div class="category-copy">
            <strong>${escapeHtml(category.nameAr)}</strong>
            <small>${escapeHtml(category.nameEn)}</small>
          </div>
          <span class="count-badge">${list.length} منتج</span>
          <div class="category-actions">
            <button data-add-product="${escapeHtml(category.id)}">إضافة منتج</button>
            <button data-edit-category="${escapeHtml(category.id)}">تعديل</button>
            <button class="delete" data-delete-category="${escapeHtml(category.id)}">حذف</button>
          </div>
          <span class="chevron">⌄</span>
        </div>
        <div class="products">
          ${list.length ? list.map((product) => `
            <div class="product-row" data-product-id="${escapeHtml(product.id)}" data-category-id="${escapeHtml(category.id)}">
              <span class="drag-handle" draggable="true" data-drag-kind="product" data-drag-id="${escapeHtml(product.id)}" data-drag-category="${escapeHtml(category.id)}" title="اسحب لتغيير الترتيب">⠿</span>
              <div class="product-main">
                <img src="${escapeHtml(imageSource(product))}" alt="" loading="lazy">
                <div class="product-copy">
                  <strong>${escapeHtml(product.name || "منتج بلا اسم")}</strong>
                  <small>${escapeHtml(product.nameEn || "No English name")}</small>
                </div>
              </div>
              <span class="price">${Number(product.price).toFixed(3)} د.ك</span>
              <div class="product-actions">
                <button data-edit-product="${escapeHtml(product.id)}">تعديل</button>
                <button class="delete" data-delete-product="${escapeHtml(product.id)}">حذف</button>
              </div>
            </div>
          `).join("") : `<div class="empty">لا توجد منتجات في هذا القسم</div>`}
        </div>
      </article>
    `;
  }).join("");

  hydrateRenderedImages();
}

async function hydrateRenderedImages() {
  for (const image of $$(".product-main img")) {
    const source = image.getAttribute("src");
    if (!source?.startsWith("product-images/")) continue;
    image.src = await resolveAsset(source);
  }
}

function markDirty(message = "توجد تعديلات غير مصدرة") {
  $("#saveState").textContent = message;
}

function saveDraft() {
  normalizeData();
  localStorage.setItem(DRAFT_KEY, JSON.stringify({ categories, products, savedAt: new Date().toISOString() }));
  $("#saveState").textContent = "تم حفظ المسودة في هذا المتصفح";
  toast("تم حفظ المسودة");
}

function resetDraft() {
  if (!confirm("هل تريد حذف المسودة والعودة إلى آخر بيانات موجودة في الموقع؟")) return;
  localStorage.removeItem(DRAFT_KEY);
  clearAssets().catch(() => undefined);
  assetUrls.forEach((url) => URL.revokeObjectURL(url));
  assetUrls.clear();
  categories = clone(siteCategories);
  products = clone(siteProducts);
  openCategories.clear();
  normalizeData();
  render();
  $("#saveState").textContent = "تمت العودة إلى بيانات الموقع";
  toast("تم إلغاء المسودة");
}

function openCategoryDialog(category = null) {
  $("#categoryDialogTitle").textContent = category ? "تعديل القسم" : "إضافة قسم جديد";
  $("#categoryId").value = category?.id || "";
  $("#categoryNameAr").value = category?.nameAr || "";
  $("#categoryNameEn").value = category?.nameEn || "";
  $("#categoryDialog").showModal();
  setTimeout(() => $("#categoryNameAr").focus(), 30);
}

function saveCategory(event) {
  event.preventDefault();
  const existingId = $("#categoryId").value;
  const nameAr = clean($("#categoryNameAr").value);
  const nameEn = clean($("#categoryNameEn").value);
  if (!nameAr || !nameEn) return toast("اكتب اسم القسم باللغتين");
  if (existingId) {
    const category = categories.find((item) => item.id === existingId);
    if (category) Object.assign(category, { nameAr, nameEn });
  } else {
    const id = `category-${Date.now().toString(36)}`;
    categories.push({ id, nameAr, nameEn, order: categories.length + 1 });
    openCategories.add(id);
  }
  $("#categoryDialog").close();
  markDirty();
  render();
  toast(existingId ? "تم تعديل القسم" : "تمت إضافة القسم");
}

function deleteCategory(categoryId) {
  const category = categories.find((item) => item.id === categoryId);
  const count = categoryProducts(categoryId).length;
  const warning = count
    ? `القسم يحتوي على ${count} منتج. حذف القسم سيحذف منتجاته أيضاً. هل أنت متأكد؟`
    : "هل تريد حذف هذا القسم؟";
  if (!confirm(warning)) return;
  categories = categories.filter((item) => item.id !== categoryId);
  products = products.filter((product) => product.category !== categoryId);
  openCategories.delete(categoryId);
  markDirty();
  render();
  toast("تم حذف القسم");
}

function fillCategorySelect(selectedId = "") {
  $("#productCategory").innerHTML = categories.map((category) =>
    `<option value="${escapeHtml(category.id)}" ${category.id === selectedId ? "selected" : ""}>${escapeHtml(category.nameAr)} — ${escapeHtml(category.nameEn)}</option>`
  ).join("");
}

async function openProductDialog(product = null, categoryId = "") {
  if (!categories.length) {
    toast("أضف قسماً أولاً");
    return;
  }
  $("#productDialogTitle").textContent = product ? "تعديل المنتج" : "إضافة منتج جديد";
  $("#productId").value = product?.id || "";
  fillCategorySelect(product?.category || categoryId || categories[0].id);
  $("#productPrice").value = product ? Number(product.price).toFixed(3) : "0.000";
  $("#productNameAr").value = product?.name || "";
  $("#productNameEn").value = product?.nameEn || "";
  $("#productDescriptionAr").value = product?.description || "";
  $("#productDescriptionEn").value = product?.descriptionEn || "";
  editingImages = [...(product?.images || [product?.image].filter(Boolean))];
  $("#imageUrl").value = "";
  await renderImageEditor();
  $("#productDialog").showModal();
  setTimeout(() => $("#productNameAr").focus(), 30);
}

async function renderImageEditor() {
  const container = $("#imageList");
  if (!editingImages.length) {
    container.innerHTML = `<div class="empty">لم تتم إضافة صور بعد</div>`;
    return;
  }
  const cards = [];
  for (const [index, source] of editingImages.entries()) {
    cards.push(`
      <article class="image-item ${index === 0 ? "primary-image" : ""}" data-image-index="${index}">
        ${index === 0 ? `<span class="primary-label">الرئيسية</span>` : ""}
        <img src="${escapeHtml(await resolveAsset(source))}" alt="">
        <small>${escapeHtml(source)}</small>
        <div>
          ${index ? `<button type="button" data-primary-image="${index}">اجعلها رئيسية</button>` : ""}
          <button type="button" class="delete" data-remove-image="${index}">حذف</button>
        </div>
      </article>
    `);
  }
  container.innerHTML = cards.join("");
}

async function optimizeImage(file, productId) {
  const bitmap = await createImageBitmap(file);
  const maxSide = 1400;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", .82));
  if (!blob) throw new Error("تعذر تجهيز الصورة");
  const safeId = String(productId || "new").replace(/[^a-zA-Z0-9_-]/g, "-");
  const filename = `${safeId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.webp`;
  const path = `product-images/${filename}`;
  await putAsset(path, blob);
  assetUrls.set(path, URL.createObjectURL(blob));
  return path;
}

async function addImageFiles(files) {
  if (!files.length) return;
  const productId = $("#productId").value || "new-product";
  $("#saveState").textContent = "جارٍ ضغط الصور…";
  try {
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      editingImages.push(await optimizeImage(file, productId));
    }
    await renderImageEditor();
    markDirty("تم ضغط الصور وحفظها في المسودة");
    toast("تمت إضافة الصور بصيغة WebP");
  } catch (error) {
    toast(error.message);
  }
}

function addImageUrl() {
  const value = clean($("#imageUrl").value);
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    editingImages.push(url.href);
    $("#imageUrl").value = "";
    renderImageEditor();
  } catch {
    toast("اكتب رابط صورة صحيحاً");
  }
}

function saveProduct(event) {
  event.preventDefault();
  const existingId = $("#productId").value;
  const categoryId = $("#productCategory").value;
  const name = clean($("#productNameAr").value);
  const nameEn = clean($("#productNameEn").value);
  const price = Number($("#productPrice").value);
  if (!categoryId || !name || !nameEn || !Number.isFinite(price) || price < 0) {
    return toast("أكمل القسم والاسمين والسعر");
  }
  const payload = {
    category: categoryId,
    name,
    nameEn,
    price: Number(price.toFixed(3)),
    description: clean($("#productDescriptionAr").value),
    descriptionEn: clean($("#productDescriptionEn").value),
    images: [...editingImages],
    image: editingImages[0] || ""
  };
  if (existingId) {
    const product = products.find((item) => item.id === existingId);
    if (product) Object.assign(product, payload);
  } else {
    const id = `P${Date.now()}`;
    products.push({ id, ...payload, order: categoryProducts(categoryId).length + 1 });
    openCategories.add(categoryId);
  }
  categories.forEach((category) => normalizeProductOrder(category.id));
  $("#productDialog").close();
  markDirty();
  render();
  toast(existingId ? "تم تعديل المنتج" : "تمت إضافة المنتج");
}

function deleteProduct(productId) {
  const product = products.find((item) => item.id === productId);
  if (!product || !confirm(`هل تريد حذف المنتج «${product.name}»؟`)) return;
  products = products.filter((item) => item.id !== productId);
  normalizeProductOrder(product.category);
  markDirty();
  render();
  toast("تم حذف المنتج");
}

function clearDropLines() {
  $$(".drop-before,.drop-after").forEach((element) => element.classList.remove("drop-before", "drop-after"));
}

function dropPosition(event, element) {
  const rectangle = element.getBoundingClientRect();
  return event.clientY < rectangle.top + rectangle.height / 2 ? "before" : "after";
}

function reorderCategory(sourceId, targetId, position) {
  const sourceIndex = categories.findIndex((category) => category.id === sourceId);
  let targetIndex = categories.findIndex((category) => category.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceId === targetId) return;
  const [source] = categories.splice(sourceIndex, 1);
  targetIndex = categories.findIndex((category) => category.id === targetId);
  categories.splice(position === "after" ? targetIndex + 1 : targetIndex, 0, source);
  categories.forEach((category, index) => category.order = index + 1);
}

function reorderProduct(sourceId, targetId, categoryId, position) {
  const ordered = categoryProducts(categoryId);
  const sourceIndex = ordered.findIndex((product) => product.id === sourceId);
  let targetIndex = ordered.findIndex((product) => product.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceId === targetId) return;
  const [source] = ordered.splice(sourceIndex, 1);
  targetIndex = ordered.findIndex((product) => product.id === targetId);
  ordered.splice(position === "after" ? targetIndex + 1 : targetIndex, 0, source);
  ordered.forEach((product, index) => product.order = index + 1);
}

async function importJson(files) {
  if (!files.length) return;
  try {
    for (const file of files) {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data)) throw new Error(`${file.name} ليس قائمة JSON`);
      if (!data.length) continue;
      if ("price" in data[0] || "category" in data[0]) products = data;
      else if ("nameAr" in data[0] || "nameEn" in data[0]) categories = data;
    }
    normalizeData();
    openCategories.clear();
    render();
    markDirty("تم الاستيراد — راجع البيانات ثم صدّرها");
    toast("تم استيراد الملفات");
  } catch (error) {
    toast(`فشل الاستيراد: ${error.message}`);
  } finally {
    $("#importData").value = "";
  }
}

function downloadableProducts() {
  return products
    .slice()
    .sort((a, b) => {
      const categoryDifference = categories.findIndex((category) => category.id === a.category)
        - categories.findIndex((category) => category.id === b.category);
      return categoryDifference || Number(a.order) - Number(b.order);
    })
    .map((product) => ({
      ...product,
      price: Number(Number(product.price).toFixed(3)),
      images: (product.images || []).filter(Boolean),
      image: product.images?.[0] || product.image || ""
    }));
}

function downloadBlob(blob, filename) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function exportData() {
  normalizeData();
  saveDraft();
  const exportProducts = downloadableProducts();
  const exportCategories = categories.map((category, index) => ({ ...category, order: index + 1 }));
  $("#saveState").textContent = "جارٍ تجهيز ملف التحديث…";
  try {
    if (!window.JSZip) throw new Error("تعذر تحميل أداة ZIP");
    const zip = new JSZip();
    zip.file("products.json", JSON.stringify(exportProducts, null, 2) + "\n");
    zip.file("categories.json", JSON.stringify(exportCategories, null, 2) + "\n");
    const referencedAssets = [...new Set(exportProducts.flatMap((product) => product.images || []))]
      .filter((path) => path.startsWith("product-images/"));
    for (const path of referencedAssets) {
      const blob = await getAsset(path);
      if (blob) zip.file(path, blob);
    }
    zip.file("تعليمات.txt", [
      "انسخ products.json و categories.json إلى مجلد منصة الطلبات واستبدل الملفين القديمين.",
      "إذا وجد مجلد product-images فانسخه أيضاً بجانب index.html.",
      "لا تغيّر أسماء الملفات أو مسارات الصور."
    ].join("\n"));
    downloadBlob(await zip.generateAsync({ type: "blob", compression: "DEFLATE" }), "تحديث-منصة-البيع.zip");
    $("#saveState").textContent = "تم تنزيل ملف التحديث";
    toast("تم تجهيز تحديث الموقع");
  } catch (error) {
    downloadBlob(new Blob([JSON.stringify(exportProducts, null, 2)], { type: "application/json" }), "products.json");
    downloadBlob(new Blob([JSON.stringify(exportCategories, null, 2)], { type: "application/json" }), "categories.json");
    $("#saveState").textContent = "تم تنزيل ملفات JSON بدون ZIP";
    toast(error.message);
  }
}

$("#addCategory").addEventListener("click", () => openCategoryDialog());
$("#addProduct").addEventListener("click", () => openProductDialog());
$("#categoryForm").addEventListener("submit", saveCategory);
$("#productForm").addEventListener("submit", saveProduct);
document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => {
    const dialog = document.getElementById(button.dataset.closeDialog);
    if (dialog?.open) dialog.close();
  });
});
$("#saveDraft").addEventListener("click", saveDraft);
$("#resetData").addEventListener("click", resetDraft);
$("#exportData").addEventListener("click", exportData);
$("#importData").addEventListener("change", (event) => importJson([...event.target.files]));
$("#productImages").addEventListener("change", (event) => {
  addImageFiles([...event.target.files]);
  event.target.value = "";
});
$("#addImageUrl").addEventListener("click", addImageUrl);

$("#imageList").addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-image]");
  const primaryButton = event.target.closest("[data-primary-image]");
  if (removeButton) {
    editingImages.splice(Number(removeButton.dataset.removeImage), 1);
    renderImageEditor();
  }
  if (primaryButton) {
    const [selected] = editingImages.splice(Number(primaryButton.dataset.primaryImage), 1);
    editingImages.unshift(selected);
    renderImageEditor();
  }
});

$("#categoryList").addEventListener("click", (event) => {
  const addProductButton = event.target.closest("[data-add-product]");
  const editCategoryButton = event.target.closest("[data-edit-category]");
  const deleteCategoryButton = event.target.closest("[data-delete-category]");
  const editProductButton = event.target.closest("[data-edit-product]");
  const deleteProductButton = event.target.closest("[data-delete-product]");
  if (addProductButton) return openProductDialog(null, addProductButton.dataset.addProduct);
  if (editCategoryButton) return openCategoryDialog(categories.find((category) => category.id === editCategoryButton.dataset.editCategory));
  if (deleteCategoryButton) return deleteCategory(deleteCategoryButton.dataset.deleteCategory);
  if (editProductButton) return openProductDialog(products.find((product) => product.id === editProductButton.dataset.editProduct));
  if (deleteProductButton) return deleteProduct(deleteProductButton.dataset.deleteProduct);
  if (event.target.closest("button,.drag-handle")) return;
  const header = event.target.closest(".category-head");
  if (!header) return;
  const id = header.closest(".category-card").dataset.categoryId;
  openCategories.has(id) ? openCategories.delete(id) : openCategories.add(id);
  header.closest(".category-card").classList.toggle("open", openCategories.has(id));
});

$("#categoryList").addEventListener("dragstart", (event) => {
  const handle = event.target.closest("[data-drag-kind]");
  if (!handle) return;
  dragState = {
    kind: handle.dataset.dragKind,
    id: handle.dataset.dragId,
    categoryId: handle.dataset.dragCategory || ""
  };
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", dragState.id);
  const source = dragState.kind === "category"
    ? handle.closest(".category-card")
    : handle.closest(".product-row");
  setTimeout(() => source?.classList.add("dragging"), 0);
});

$("#categoryList").addEventListener("dragover", (event) => {
  if (!dragState) return;
  const target = dragState.kind === "category"
    ? event.target.closest(".category-card")
    : event.target.closest(`.product-row[data-category-id="${CSS.escape(dragState.categoryId)}"]`);
  if (!target) return;
  const targetId = dragState.kind === "category" ? target.dataset.categoryId : target.dataset.productId;
  if (targetId === dragState.id) return;
  event.preventDefault();
  clearDropLines();
  target.classList.add(dropPosition(event, target) === "before" ? "drop-before" : "drop-after");
});

$("#categoryList").addEventListener("drop", (event) => {
  if (!dragState) return;
  const target = dragState.kind === "category"
    ? event.target.closest(".category-card")
    : event.target.closest(`.product-row[data-category-id="${CSS.escape(dragState.categoryId)}"]`);
  if (!target) return;
  event.preventDefault();
  const position = target.classList.contains("drop-after") ? "after" : "before";
  if (dragState.kind === "category") reorderCategory(dragState.id, target.dataset.categoryId, position);
  else reorderProduct(dragState.id, target.dataset.productId, dragState.categoryId, position);
  dragState = null;
  clearDropLines();
  markDirty();
  render();
  toast("تم تحديث الترتيب");
});

$("#categoryList").addEventListener("dragend", () => {
  dragState = null;
  clearDropLines();
  $$(".dragging").forEach((element) => element.classList.remove("dragging"));
});

loadData().catch((error) => {
  $("#categoryList").innerHTML = `<div class="notice"><div>!</div><p>${escapeHtml(error.message)}. شغّل الصفحة من خادم محلي أو ارفعها بجانب ملفات المتجر.</p></div>`;
});
