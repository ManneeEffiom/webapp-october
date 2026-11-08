/* ==================================================================
   script.js  ·  JustDoIt dashboard functionality
   ------------------------------------------------------------------
   Works with the existing markup in dashboard.html:
     - renders tasks / categories / stats / progress from the Flask API
     - pending & completed task views with date grouping
     - add / edit / delete task dialogs
     - add / edit / delete category + manage categories dialogs
     - task completion, category filter, view switching and search

   The dialog markup is created on the fly and styled by dialogs.css.
   ================================================================== */

"use strict";

/* ==================================
   1. CONSTANTS & STATE
================================== */

// The six palette colors offered when creating/editing a category.
const CATEGORY_COLORS = ["#43826A", "#8A79AE", "#4268D7", "#B2864D", "#BD798C", "#778898"];
const UNCATEGORIZED_COLOR = "#778898";
const UNCATEGORIZED = { id: null, name: "Uncategorized", color: UNCATEGORIZED_COLOR };

const state = {
    tasks: [],
    categories: [],
    view: "all",            // 'all' | 'today' | 'upcoming' | 'category:<id>' | 'uncategorized'
    statusFilter: "pending", // 'pending' | 'completed'
    categoryFilter: "all",  // 'all' | '<id>' | 'uncategorized'
    search: "",
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ==================================
   2. API LAYER
================================== */

async function api(path, options = {}) {
    const res = await fetch(path, {
        headers: { "Content-Type": "application/json" },
        ...options,
    });
    let body = null;
    try {
        body = await res.json();
    } catch (e) {
        /* non-JSON response */
    }
    if (!res.ok) {
        const message = (body && body.error) || `Request failed (${res.status})`;
        const err = new Error(message);
        err.status = res.status;
        throw err;
    }
    return body;
}

async function refresh() {
    const [tasksRes, categoriesRes] = await Promise.all([
        api("/api/tasks"),
        api("/api/categories"),
    ]);
    state.tasks = tasksRes.tasks;
    state.categories = categoriesRes.categories;
}

/* ==================================
   3. DATE & TEXT HELPERS
================================== */

function parseISODate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
}

function todayISO() {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

function startOfToday() {
    return parseISODate(todayISO());
}

function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();
}

function timeOf(date) {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// "Oct 26, 2026"
function fmtLong(iso) {
    return parseISODate(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// "Today" | "Tomorrow" | "Yesterday" | "Oct 26" | "Oct 26, 2027"
function fmtShort(iso) {
    if (!iso) return "No date";
    const d = parseISODate(iso);
    const t = startOfToday();
    if (sameDay(d, t)) return "Today";
    if (sameDay(d, new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1))) return "Tomorrow";
    if (sameDay(d, new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1))) return "Yesterday";
    const short = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return d.getFullYear() === t.getFullYear() ? short : `${short}, ${d.getFullYear()}`;
}

// "Completed today at 9:15 AM" | "Completed yesterday at 6:20 PM" | "Completed on Oct 20 at 3:04 PM"
function fmtCompletedAt(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    const t = startOfToday();
    if (sameDay(d, t)) return `Completed today at ${timeOf(d)}`;
    if (sameDay(d, new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1))) {
        return `Completed yesterday at ${timeOf(d)}`;
    }
    const opts = { month: "short", day: "numeric" };
    if (d.getFullYear() !== t.getFullYear()) opts.year = "numeric";
    return `Completed on ${d.toLocaleDateString("en-US", opts)} at ${timeOf(d)}`;
}

function plural(n, word) {
    const pluralWord = word.endsWith("y") ? word.slice(0, -1) + "ies" : word + "s";
    return `${n} ${n === 1 ? word : pluralWord}`;
}

function esc(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/* ==================================
   4. DERIVED DATA (filters & counts)
================================== */

function matchesView(task) {
    const today = todayISO();
    if (state.view === "all") return true;
    if (state.view === "today") return Boolean(task.due_date) && task.due_date <= today;
    if (state.view === "upcoming") return Boolean(task.due_date) && task.due_date > today;
    if (state.view === "uncategorized") return !task.category;
    if (state.view.startsWith("category:")) {
        return task.category && task.category.id === Number(state.view.split(":")[1]);
    }
    return true;
}

function matchesCategoryFilter(task) {
    if (state.categoryFilter === "all") return true;
    if (state.categoryFilter === "uncategorized") return !task.category;
    return task.category && task.category.id === Number(state.categoryFilter);
}

function matchesSearch(task) {
    if (!state.search) return true;
    const q = state.search.toLowerCase();
    return (task.title + " " + (task.notes || "")).toLowerCase().includes(q);
}

// tasks in the current view, after category filter + search (both statuses)
function viewTasks() {
    return state.tasks.filter(t => matchesView(t) && matchesCategoryFilter(t) && matchesSearch(t));
}

function tasksForStatus(status) {
    return viewTasks().filter(t => (status === "completed" ? t.completed : !t.completed));
}

function pendingCountToday() {
    const today = todayISO();
    return state.tasks.filter(t => !t.completed && t.due_date && t.due_date <= today).length;
}

function pendingCountUpcoming() {
    const today = todayISO();
    return state.tasks.filter(t => !t.completed && t.due_date && t.due_date > today).length;
}

function categoryTaskCount(categoryId) {
    return state.tasks.filter(t => t.category && t.category.id === categoryId).length;
}

function uncategorizedCount() {
    return state.tasks.filter(t => !t.category).length;
}

function viewLabel() {
    if (state.view === "all") return "All tasks";
    if (state.view === "today") return "Today";
    if (state.view === "upcoming") return "Upcoming";
    if (state.view === "uncategorized") return "Uncategorized";
    const cat = state.categories.find(c => c.id === Number(state.view.split(":")[1]));
    return cat ? cat.name : "All tasks";
}

// Groups pending tasks by due date bucket.
function pendingGroups() {
    const today = todayISO();
    const buckets = [
        { key: "overdue", heading: "Overdue", tasks: [] },
        { key: "today", heading: "Today", tasks: [] },
        { key: "upcoming", heading: "Upcoming", tasks: [] },
        { key: "none", heading: "No date", tasks: [] },
    ];
    for (const t of tasksForStatus("pending")) {
        if (!t.due_date) buckets[3].tasks.push(t);
        else if (t.due_date < today) buckets[0].tasks.push(t);
        else if (t.due_date === today) buckets[1].tasks.push(t);
        else buckets[2].tasks.push(t);
    }
    for (const b of buckets) {
        b.tasks.sort((a, x) =>
            (a.due_date || "9999").localeCompare(x.due_date || "9999") ||
            (a.created_at || "").localeCompare(x.created_at || ""));
    }
    return buckets.filter(b => b.tasks.length > 0);
}

function completedTasks() {
    return tasksForStatus("completed")
        .sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || ""));
}

/* ==================================
   5. RENDERERS
================================== */

function renderAll() {
    renderSidebar();
    renderBreadcrumb();
    renderWelcome();
    renderStats();
    renderTaskPanel();
    renderProgress();
    renderCategorySummary();
    renderCategoryFilter();
}

/* ---------- sidebar ---------- */

function renderSidebar() {
    $("#sidebarTotal").textContent = state.tasks.length;
    $("#sidebarToday").textContent = pendingCountToday();
    $("#sidebarUpcoming").textContent = pendingCountUpcoming();

    const list = $("#categoryList");
    if (!state.categories.length && uncategorizedCount() === 0) {
        list.innerHTML = `<p class="empty-category">No categories yet</p>`;
    } else {
        let html = state.categories.map(c => `
            <a href="#" class="category-item${state.view === "category:" + c.id ? " active" : ""}"
               data-view="category:${c.id}" style="--category-color:${esc(c.color)}">
                <span class="dot"></span>
                <span>${esc(c.name)}</span>
                <small>${categoryTaskCount(c.id)}</small>
            </a>`).join("");
        if (uncategorizedCount() > 0) {
            html += `
            <a href="#" class="category-item${state.view === "uncategorized" ? " active" : ""}"
               data-view="uncategorized" style="--category-color:${UNCATEGORIZED_COLOR}">
                <span class="dot"></span>
                <span>Uncategorized</span>
                <small>${uncategorizedCount()}</small>
            </a>`;
        }
        list.innerHTML = html;
    }

    $$(".nav-item").forEach(el => el.classList.toggle("active", el.dataset.view === state.view));
}

/* ---------- header & welcome ---------- */

function renderBreadcrumb() {
    $("#breadcrumbTitle").textContent = viewLabel();
    $(".panel-header h3").textContent = viewLabel();
}

function renderWelcome() {
    $("#currentDate").textContent = new Date()
        .toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
        .toUpperCase();

    const focus = pendingCountToday();
    const el = $(".welcome-text");
    if (focus === 0) {
        el.textContent = "Welcome back, Alex. Nothing due today — enjoy the breather.";
    } else {
        el.textContent = `Welcome back, Alex. You have ${plural(focus, "task")} to focus on today.`;
    }
}

/* ---------- statistics ---------- */

function renderStats() {
    const total = state.tasks.length;
    const pending = state.tasks.filter(t => !t.completed).length;
    const completed = total - pending;

    $("#totalTasks").textContent = total;
    $("#pendingTasks").textContent = pending;
    $("#completedTasks").textContent = completed;

    const usedCategories = new Set(
        state.tasks.filter(t => t.category).map(t => t.category.id)
    ).size;
    $("#totalSub").textContent = usedCategories
        ? `Across ${plural(usedCategories, "category")}` : "No categories yet";

    const today = todayISO();
    const overdue = state.tasks.filter(t => !t.completed && t.due_date && t.due_date < today).length;
    const dueToday = state.tasks.filter(t => !t.completed && t.due_date === today).length;
    $("#pendingSub").textContent = overdue > 0
        ? `${overdue} overdue · ${dueToday} due today`
        : (dueToday > 0 ? `${dueToday} due today` : "Nothing due today");

    $("#completedSub").textContent =
        completed === 0 ? "Nothing checked off yet"
            : (total > 0 && completed === total) ? "All done — nice work"
                : "Making steady progress";
}

/* ---------- task panel ---------- */

function renderTaskPanel() {
    $("#pendingCount").textContent = tasksForStatus("pending").length;
    $("#completedCount").textContent = tasksForStatus("completed").length;

    $$(".tab").forEach(tab =>
        tab.classList.toggle("active", tab.dataset.filter === state.statusFilter));

    const container = $("#taskContainer");
    const rows = state.statusFilter === "pending"
        ? pendingGroups().map(group => `
            <div class="task-group">
                <div class="group-heading">
                    <span>${esc(group.heading.toUpperCase())} · ${plural(group.tasks.length, "TASK").toUpperCase()}</span>
                    <span>Due date ↑</span>
                </div>
                ${group.tasks.map(taskRowHtml).join("")}
            </div>`).join("")
        : completedTasks().length
            ? `
            <div class="task-group">
                <div class="group-heading">
                    <span>RECENTLY COMPLETED</span>
                    <span>Newest first</span>
                </div>
                ${completedTasks().map(taskRowHtml).join("")}
            </div>`
            : "";

    container.innerHTML = rows || emptyStateHtml();

    const visible = tasksForStatus(state.statusFilter).length;
    $("#taskFooterCount").textContent =
        `${visible} ${state.statusFilter} task${visible === 1 ? "" : "s"}`;
    $(".task-footer span:last-of-type").textContent = state.statusFilter === "pending"
        ? "Check a task to mark it complete"
        : "Uncheck a task to move it back to pending";
}

function taskRowHtml(task) {
    const cat = task.category || UNCATEGORIZED;
    const done = task.completed;
    const secondLine = done ? fmtCompletedAt(task.completed_at) : (task.notes || "");
    return `
    <div class="task-row" data-id="${task.id}">
        <input type="checkbox" ${done ? "checked" : ""} aria-label="Mark '${esc(task.title)}' complete">
        <div class="task-details">
            <h4 class="${done ? "completed-task" : ""}">${esc(task.title)}</h4>
            ${secondLine ? `<p>${esc(secondLine)}</p>` : ""}
        </div>
        <div class="task-category">
            <span class="dot" style="background:${esc(cat.color)}"></span>
            <span>${esc(cat.name)}</span>
            <small>${esc(fmtShort(task.due_date))}</small>
        </div>
        <div class="task-actions">
            <button class="edit-btn" type="button" title="Edit task"><i class="fa-solid fa-pen"></i></button>
            <button class="delete-btn" type="button" title="Delete task"><i class="fa-solid fa-trash"></i></button>
        </div>
    </div>`;
}

function emptyStateHtml() {
    if (state.tasks.length === 0) {
        return `<div class="empty-state">
            <i class="fa-regular fa-clipboard"></i>
            <h3>No tasks yet</h3>
            <p>Your tasks will appear here once you add them.</p>
        </div>`;
    }
    const filtered = state.search || state.categoryFilter !== "all" || state.view !== "all";
    if (filtered && tasksForStatus("pending").length === 0 && tasksForStatus("completed").length === 0) {
        return `<div class="empty-state">
            <i class="fa-solid fa-magnifying-glass"></i>
            <h3>No matching tasks</h3>
            <p>Try a different search term or filter.</p>
        </div>`;
    }
    if (state.statusFilter === "pending") {
        return `<div class="empty-state">
            <i class="fa-regular fa-circle-check"></i>
            <h3>Nothing pending</h3>
            <p>All caught up. Every task is checked off.</p>
        </div>`;
    }
    return `<div class="empty-state">
        <i class="fa-regular fa-circle"></i>
        <h3>Nothing completed yet</h3>
        <p>Check a task off to see it here.</p>
    </div>`;
}

/* ---------- right sidebar ---------- */

function renderProgress() {
    const total = state.tasks.length;
    const completed = state.tasks.filter(t => t.completed).length;
    const pct = total ? Math.round((completed / total) * 100) : 0;

    $("#progressPercentage").textContent = `${pct}%`;
    $("#progressText").textContent = `${completed} of ${total} tasks completed`;
    $("#progressFill").style.width = `${pct}%`;
}

function renderCategorySummary() {
    const box = $("#categorySummary");
    const rows = [];

    for (const c of state.categories) {
        const pending = state.tasks.filter(t => t.category && t.category.id === c.id && !t.completed).length;
        rows.push(`
            <div class="category-progress">
                <div>
                    <span class="dot" style="background:${esc(c.color)}"></span>
                    ${esc(c.name)}
                </div>
                <span>${pending} pending</span>
            </div>`);
    }
    const uncat = uncategorizedCount();
    if (uncat > 0) {
        const pending = state.tasks.filter(t => !t.category && !t.completed).length;
        rows.push(`
            <div class="category-progress">
                <div>
                    <span class="dot" style="background:${UNCATEGORIZED_COLOR}"></span>
                    Uncategorized
                </div>
                <span>${pending} pending</span>
            </div>`);
    }

    box.innerHTML = rows.length
        ? rows.join("")
        : `<p class="empty-category">Your categories will appear here.</p>`;
}

/* ---------- category filter dropdown ---------- */

function renderCategoryFilter() {
    const select = $("#categoryFilter");
    const current = state.categoryFilter;
    let html = `<option value="all">All categories</option>`;
    html += state.categories.map(c =>
        `<option value="${c.id}">${esc(c.name)}</option>`).join("");
    if (uncategorizedCount() > 0) {
        html += `<option value="uncategorized">Uncategorized</option>`;
    }
    select.innerHTML = html;

    const values = ["all", "uncategorized", ...state.categories.map(c => String(c.id))];
    select.value = values.includes(current) ? current : "all";
    state.categoryFilter = select.value;
}

/* ==================================
   6. DIALOG FRAMEWORK
   (markup is injected, styled by dialogs.css)
================================== */

let activeOverlay = null;

function openDialog(cardHtml, opts = {}) {
    closeDialog(true); // silently replace any open dialog
    const overlay = document.createElement("div");
    overlay.className = "dialog-overlay";
    overlay.innerHTML = `
        <div class="dialog-card" role="dialog" aria-modal="true">
            ${cardHtml}
        </div>
        <p class="dialog-note">Esc to cancel · Changes apply only after confirmation</p>`;
    document.body.appendChild(overlay);
    activeOverlay = { element: overlay, onClose: opts.onClose || null };

    // close when clicking the backdrop (not the card itself)
    overlay.addEventListener("mousedown", (e) => {
        if (e.target === overlay) closeDialog();
    });
    // close buttons
    $$("[data-close]", overlay).forEach(btn => btn.addEventListener("click", () => closeDialog()));

    // move focus into the dialog
    const firstInput = $(".field input, .select-trigger, .dialog-close", overlay);
    if (firstInput) firstInput.focus();

    if (typeof opts.onOpen === "function") opts.onOpen(overlay);
}

function closeDialog(silent = false) {
    if (!activeOverlay) return;
    const { element, onClose } = activeOverlay;
    activeOverlay = null;
    element.remove();
    if (!silent && onClose) onClose();
}

function dialogHeader(title, subtitle) {
    return `
    <div class="dialog-header">
        <div>
            <h2>${esc(title)}</h2>
            <p>${esc(subtitle)}</p>
        </div>
        <button type="button" class="dialog-close" data-close aria-label="Close dialog">
            <i class="fa-solid fa-xmark"></i>
        </button>
    </div>`;
}

/* ---------- custom category dropdown ---------- */

function categorySelectHtml(selectedId) {
    const cat = selectedId != null
        ? (state.categories.find(c => c.id === selectedId) || UNCATEGORIZED)
        : UNCATEGORIZED;
    const value = cat.id == null ? "" : cat.id;
    return `
    <div class="field select-field">
        <label>Category</label>
        <button type="button" class="select-trigger" data-value="${value}">
            <span class="dot" style="background:${esc(cat.color)}"></span>
            <span class="select-label">${esc(cat.name)}</span>
            <i class="fa-solid fa-chevron-down chevron"></i>
        </button>
        <div class="select-menu" hidden></div>
    </div>`;
}

function wireCategorySelect(field, onChange) {
    const trigger = $(".select-trigger", field);
    const menu = $(".select-menu", field);
    const label = $(".select-label", field);
    const dot = $(".dot", trigger);

    function renderMenu() {
        const current = trigger.dataset.value;
        const options = [
            ...state.categories.map(c => ({ id: String(c.id), name: c.name, color: c.color })),
            { id: "", name: "Uncategorized", color: UNCATEGORIZED_COLOR },
        ];
        menu.innerHTML = options.map(o => `
            <button type="button" class="select-option${String(current) === o.id ? " selected" : ""}" data-value="${o.id}">
                <span class="dot" style="background:${esc(o.color)}"></span>
                <span>${esc(o.name)}</span>
                <i class="fa-solid fa-check check"></i>
            </button>`).join("");
    }

    function select(id, name, color) {
        trigger.dataset.value = id;
        label.textContent = name;
        dot.style.background = color;
        field.classList.remove("open");
        menu.hidden = true;
        if (onChange) onChange({ id: id === "" ? null : Number(id), name, color });
    }

    trigger.addEventListener("click", () => {
        renderMenu();
        const willOpen = menu.hidden;
        closeAllSelectMenus();
        if (willOpen) {
            menu.hidden = false;
            field.classList.add("open");
        }
    });

    menu.addEventListener("click", (e) => {
        const option = e.target.closest(".select-option");
        if (!option) return;
        const id = option.dataset.value;
        const cat = id === ""
            ? { name: "Uncategorized", color: UNCATEGORIZED_COLOR }
            : state.categories.find(c => String(c.id) === id);
        select(id, cat.name, cat.color);
    });

    return {
        get value() {
            const v = trigger.dataset.value;
            return v === "" || v === "null" ? null : Number(v);
        },
        focus: () => trigger.focus(),
    };
}

function closeAllSelectMenus() {
    $$(".select-field.open").forEach(f => {
        f.classList.remove("open");
        $(".select-menu", f).hidden = true;
    });
}

/* ---------- color swatches ---------- */

function swatchesHtml(selectedColor) {
    return `
    <div class="field">
        <label>Category color</label>
        <div class="swatches">
            ${CATEGORY_COLORS.map(color => `
                <button type="button" class="swatch${color === selectedColor ? " selected" : ""}"
                        data-color="${color}" style="background:${color}" aria-label="Choose color ${color}">
                    <i class="fa-solid fa-check"></i>
                </button>`).join("")}
        </div>
    </div>`;
}

function wireSwatches(root, onChange) {
    root.addEventListener("click", (e) => {
        const swatch = e.target.closest(".swatch");
        if (!swatch) return;
        $$(".swatch", root).forEach(s => s.classList.remove("selected"));
        swatch.classList.add("selected");
        if (onChange) onChange(swatch.dataset.color);
    });
}

/* ==================================
   7. TASK DIALOGS
================================== */

/* ---- Add task ---- */

function openAddTaskDialog() {
    const firstCategory = state.categories.length ? state.categories[0] : null;
    const defaultCat = firstCategory || UNCATEGORIZED;

    openDialog(`
        ${dialogHeader("Add a task", "Get it out of your head and onto your list.")}
        <div class="field">
            <label>Task name</label>
            <input type="text" class="task-title-input" placeholder="Schedule dentist appointment" maxlength="200">
        </div>
        <div class="field">
            <label>Notes (optional)</label>
            <textarea class="task-notes-input" placeholder="Call the clinic to book a checkup." maxlength="1000"></textarea>
        </div>
        <div class="field-row">
            ${categorySelectHtml(defaultCat.id)}
            <div class="field">
                <label>Due date</label>
                <input type="date" class="task-due-input">
            </div>
        </div>
        <div class="checkbox-row">
            <input type="checkbox" id="markComplete">
            <label for="markComplete">Mark as completed</label>
        </div>
        <p class="info-note"><i class="fa-regular fa-circle-info"></i><span class="note-text"></span></p>
        <div class="dialog-footer">
            <button type="button" class="btn-secondary" data-close>Cancel</button>
            <button type="button" class="btn-primary btn-submit">Add task</button>
        </div>`,
        {
            onOpen(overlay) {
                const select = wireCategorySelect($(".select-field", overlay), () => updateNote());
                const checkbox = $("#markComplete", overlay);
                const noteEl = $(".note-text", overlay);

                function currentCategory() {
                    const id = select.value;
                    return state.categories.find(c => c.id === id) || UNCATEGORIZED;
                }
                function updateNote() {
                    noteEl.textContent = checkbox.checked
                        ? `This task will appear in ${currentCategory().name} and your completed list.`
                        : `This task will appear in ${currentCategory().name} and your pending list.`;
                }
                checkbox.addEventListener("change", updateNote);
                updateNote();

                $(".task-title-input", overlay).addEventListener("input", (e) => e.target.classList.remove("invalid"));
                $(".btn-submit", overlay).addEventListener("click", () => submitAddTask(overlay));
                overlay.addEventListener("keydown", (e) => {
                    if (e.key === "Enter" && e.target.matches("input:not(textarea), .select-trigger")) {
                        e.preventDefault();
                        submitAddTask(overlay);
                    }
                });
            },
        });
}

// The task dialogs store the chosen category on the trigger's data-value
// attribute ("" means Uncategorized).
function selectedCategoryId(overlay) {
    const raw = $(".select-trigger", overlay).dataset.value;
    return raw === "" || raw === "null" ? null : Number(raw);
}

async function submitAddTask(overlay) {
    const titleInput = $(".task-title-input", overlay);
    const title = titleInput.value.trim();
    if (!title) {
        titleInput.classList.add("invalid");
        titleInput.focus();
        return;
    }
    const payload = {
        title,
        notes: $(".task-notes-input", overlay).value.trim(),
        category_id: selectedCategoryId(overlay),
        due_date: $(".task-due-input", overlay).value || null,
        completed: $("#markComplete", overlay).checked,
    };
    try {
        const res = await api("/api/tasks", { method: "POST", body: JSON.stringify(payload) });
        await refresh();
        ensureVisible(res.task);
        renderAll();
        closeDialog();
    } catch (err) {
        showErrorInDialog(overlay, err.message);
    }
}

// After creating a task, make sure the dashboard actually shows it.
function ensureVisible(task) {
    if (task.completed && state.statusFilter !== "completed") state.statusFilter = "completed";
    if (!task.completed && state.statusFilter !== "pending") state.statusFilter = "pending";

    const today = todayISO();
    if (state.view === "today" && (!task.due_date || task.due_date > today)) state.view = "all";
    if (state.view === "upcoming" && (!task.due_date || task.due_date <= today)) state.view = "all";
    if (state.view === "uncategorized" && task.category) state.view = "all";
    if (state.view.startsWith("category:") &&
        (!task.category || task.category.id !== Number(state.view.split(":")[1]))) {
        state.view = "all";
    }
    if (state.categoryFilter !== "all") {
        const f = state.categoryFilter;
        const matches = f === "uncategorized" ? !task.category
            : task.category && task.category.id === Number(f);
        if (!matches) state.categoryFilter = "all";
    }
}

/* ---- Edit task ---- */

function openEditTaskDialog(task) {
    openDialog(`
        ${dialogHeader("Edit task", "Make a little room for a change of plan.")}
        <div class="field">
            <label>Task name</label>
            <input type="text" class="task-title-input" value="${esc(task.title)}" maxlength="200">
        </div>
        <div class="field">
            <label>Notes (optional)</label>
            <textarea class="task-notes-input" maxlength="1000">${esc(task.notes || "")}</textarea>
        </div>
        <div class="field-row">
            ${categorySelectHtml(task.category ? task.category.id : null)}
            <div class="field">
                <label>Due date</label>
                <input type="date" class="task-due-input" value="${task.due_date ? esc(task.due_date) : ""}">
            </div>
        </div>
        <div class="checkbox-row">
            <input type="checkbox" id="markComplete" ${task.completed ? "checked" : ""}>
            <label for="markComplete">Mark as completed</label>
        </div>
        <p class="info-note"><i class="fa-regular fa-circle-info"></i><span class="note-text"></span></p>
        <div class="dialog-footer">
            <button type="button" class="btn-secondary" data-close>Cancel</button>
            <button type="button" class="btn-primary btn-submit">Save changes</button>
        </div>`,
        {
            onOpen(overlay) {
                const checkbox = $("#markComplete", overlay);
                const noteEl = $(".note-text", overlay);
                wireCategorySelect($(".select-field", overlay), () => { });

                function updateNote() {
                    noteEl.textContent = checkbox.checked
                        ? "Checked tasks appear in your completed list."
                        : "Unchecked tasks appear in your pending list.";
                }
                checkbox.addEventListener("change", updateNote);
                updateNote();

                $(".task-title-input", overlay).addEventListener("input", (e) => e.target.classList.remove("invalid"));
                $(".btn-submit", overlay).addEventListener("click", () => submitEditTask(overlay, task));
                overlay.addEventListener("keydown", (e) => {
                    if (e.key === "Enter" && e.target.matches("input:not(textarea), .select-trigger")) {
                        e.preventDefault();
                        submitEditTask(overlay, task);
                    }
                });
            },
        });
}

async function submitEditTask(overlay, task) {
    const titleInput = $(".task-title-input", overlay);
    const title = titleInput.value.trim();
    if (!title) {
        titleInput.classList.add("invalid");
        titleInput.focus();
        return;
    }
    const payload = {
        title,
        notes: $(".task-notes-input", overlay).value.trim(),
        category_id: selectedCategoryId(overlay),
        due_date: $(".task-due-input", overlay).value || null,
        completed: $("#markComplete", overlay).checked,
    };
    try {
        await api(`/api/tasks/${task.id}`, { method: "PUT", body: JSON.stringify(payload) });
        await refresh();
        renderAll();
        closeDialog();
    } catch (err) {
        showErrorInDialog(overlay, err.message);
    }
}

/* ---- Delete task ---- */

function openDeleteTaskDialog(task) {
    const cat = task.category || UNCATEGORIZED;
    const dueText = task.due_date ? `Due ${fmtLong(task.due_date)}` : "No due date";
    openDialog(`
        ${dialogHeader("Delete task?", "This task will be permanently removed from your list.")}
        <div class="preview-card">
            <div class="preview-icon"><i class="fa-solid fa-clipboard-list"></i></div>
            <div class="preview-info">
                <h4>${esc(task.title)}</h4>
                <div class="preview-meta">
                    <span class="dot" style="background:${esc(cat.color)}"></span>
                    <span>${esc(cat.name)}</span>
                    <span>· ${esc(dueText)}</span>
                </div>
            </div>
        </div>
        <div class="alert alert-danger">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <span>This action can't be undone. Your other tasks and categories won't be affected.</span>
        </div>
        <div class="dialog-footer">
            <button type="button" class="btn-secondary" data-close>Cancel</button>
            <button type="button" class="btn-danger btn-submit">Delete task</button>
        </div>`,
        {
            onOpen(overlay) {
                $(".btn-submit", overlay).addEventListener("click", async () => {
                    try {
                        await api(`/api/tasks/${task.id}`, { method: "DELETE" });
                        await refresh();
                        renderAll();
                        closeDialog();
                    } catch (err) {
                        showErrorInDialog(overlay, err.message);
                    }
                });
            },
        });
}

/* ==================================
   8. CATEGORY DIALOGS
================================== */

/* ---- Add category ---- */

function openAddCategoryDialog(fromManage = false) {
    // default to the first palette color not used by an existing category
    const used = new Set(state.categories.map(c => c.color));
    const defaultColor = CATEGORY_COLORS.find(c => !used.has(c)) || CATEGORY_COLORS[0];

    openDialog(`
        ${dialogHeader("Add a category", "Give your tasks a place to call home.")}
        <div class="field">
            <label>Category name</label>
            <input type="text" class="cat-name-input" placeholder="e.g. Fitness" maxlength="60">
            <p class="field-help">Choose a short, unique name. You can change it anytime.</p>
        </div>
        ${swatchesHtml(defaultColor)}
        <div class="sidebar-preview">
            <div class="sidebar-preview-label">SIDEBAR PREVIEW</div>
            <div class="sidebar-preview-row">
                <span class="dot preview-dot" style="background:${defaultColor}"></span>
                <span class="preview-name">New category</span>
                <small>0</small>
            </div>
        </div>
        <div class="dialog-footer">
            <button type="button" class="btn-secondary" data-close>Cancel</button>
            <button type="button" class="btn-primary btn-submit">Create category</button>
        </div>`,
        {
            onClose() {
                if (fromManage) reopenManage();
            },
            onOpen(overlay) {
                const nameInput = $(".cat-name-input", overlay);
                const nameEl = $(".preview-name", overlay);
                const dotEl = $(".preview-dot", overlay);

                nameInput.addEventListener("input", () => {
                    nameInput.classList.remove("invalid");
                    $(".field-help", overlay).classList.remove("error");
                    $(".field-help", overlay).textContent =
                        "Choose a short, unique name. You can change it anytime.";
                    nameEl.textContent = nameInput.value.trim() || "New category";
                });
                wireSwatches($(".swatches", overlay), (color) => {
                    dotEl.style.background = color;
                });

                $(".btn-submit", overlay).addEventListener("click", () => submitAddCategory(overlay));
                overlay.addEventListener("keydown", (e) => {
                    if (e.key === "Enter" && e.target.matches("input")) {
                        e.preventDefault();
                        submitAddCategory(overlay);
                    }
                });
            },
        });
}

async function submitAddCategory(overlay) {
    const nameInput = $(".cat-name-input", overlay);
    const name = nameInput.value.trim();
    const help = $(".field-help", overlay);
    if (!name) {
        nameInput.classList.add("invalid");
        nameInput.focus();
        help.textContent = "Give your category a name.";
        help.classList.add("error");
        return;
    }
    const color = $(".swatch.selected", overlay).dataset.color;
    try {
        await api("/api/categories", { method: "POST", body: JSON.stringify({ name, color }) });
        await refresh();
        renderAll();
        closeDialog();
    } catch (err) {
        nameInput.classList.add("invalid");
        help.textContent = err.message;
        help.classList.add("error");
        nameInput.focus();
    }
}

/* ---- Edit category ---- */

function openEditCategoryDialog(category, fromManage = false) {
    const taskCount = categoryTaskCount(category.id);

    openDialog(`
        ${dialogHeader("Edit category", "Update the name or color of your category.")}
        <div class="field">
            <label>Category name</label>
            <input type="text" class="cat-name-input" value="${esc(category.name)}" maxlength="60">
            <p class="field-help">${taskCount
            ? `Currently named ${esc(category.name)}. All ${plural(taskCount, "task")} will stay in this category.`
            : `Currently named ${esc(category.name)}. No tasks use this category yet.`}</p>
        </div>
        ${swatchesHtml(category.color)}
        <div class="sidebar-preview">
            <div class="sidebar-preview-label">SIDEBAR PREVIEW</div>
            <div class="sidebar-preview-row">
                <span class="dot preview-dot" style="background:${esc(category.color)}"></span>
                <span class="preview-name">${esc(category.name)}</span>
                <small>${taskCount}</small>
            </div>
        </div>
        <p class="status-note"><i class="fa-solid fa-circle-check"></i>
            Your task names, dates, and status won't change.</p>
        <div class="dialog-footer">
            <button type="button" class="btn-secondary" data-close>Cancel</button>
            <button type="button" class="btn-primary btn-submit">Save changes</button>
        </div>`,
        {
            onClose() {
                if (fromManage) reopenManage();
            },
            onOpen(overlay) {
                const nameInput = $(".cat-name-input", overlay);
                const nameEl = $(".preview-name", overlay);
                const dotEl = $(".preview-dot", overlay);

                nameInput.addEventListener("input", () => {
                    nameInput.classList.remove("invalid");
                    $(".field-help", overlay).classList.remove("error");
                    nameEl.textContent = nameInput.value.trim() || category.name;
                });
                wireSwatches($(".swatches", overlay), (color) => {
                    dotEl.style.background = color;
                });

                $(".btn-submit", overlay).addEventListener("click", () =>
                    submitEditCategory(overlay, category));
                overlay.addEventListener("keydown", (e) => {
                    if (e.key === "Enter" && e.target.matches("input")) {
                        e.preventDefault();
                        submitEditCategory(overlay, category);
                    }
                });
            },
        });
}

async function submitEditCategory(overlay, category) {
    const nameInput = $(".cat-name-input", overlay);
    const name = nameInput.value.trim();
    const help = $(".field-help", overlay);
    if (!name) {
        nameInput.classList.add("invalid");
        nameInput.focus();
        help.textContent = "Give your category a name.";
        help.classList.add("error");
        return;
    }
    const color = $(".swatch.selected", overlay).dataset.color;
    try {
        await api(`/api/categories/${category.id}`, {
            method: "PUT",
            body: JSON.stringify({ name, color }),
        });
        await refresh();
        renderAll();
        closeDialog();
    } catch (err) {
        nameInput.classList.add("invalid");
        help.textContent = err.message;
        help.classList.add("error");
        nameInput.focus();
    }
}

/* ---- Delete category ---- */

function openDeleteCategoryDialog(category, fromManage = false) {
    const total = categoryTaskCount(category.id);
    const pending = state.tasks.filter(t => t.category && t.category.id === category.id && !t.completed).length;
    const completed = total - pending;

    openDialog(`
        ${dialogHeader(`Delete ${category.name}?`, "Remove this category without losing your tasks.")}
        <div class="preview-card">
            <div class="preview-info">
                <div class="preview-meta" style="margin-bottom:6px">
                    <span class="dot" style="background:${esc(category.color)}"></span>
                    <strong style="font-size:13px;color:var(--text)">${esc(category.name)}</strong>
                </div>
                <div class="preview-meta">${plural(total, "task")} · ${pending} pending, ${completed} completed</div>
            </div>
            <div class="preview-icon right"><i class="fa-regular fa-folder"></i></div>
        </div>
        <div class="alert alert-info">
            <i class="fa-regular fa-circle-info"></i>
            <span>${total === 0
            ? "No tasks will move to Uncategorized — this category is empty."
            : `${total === 1 ? "This task will move" : `All ${total} tasks will move`} to Uncategorized. Their due dates and completion status will stay the same.`}</span>
        </div>
        <p class="dialog-footnote">Deleting a category can't be undone. You can assign its tasks to another category later.</p>
        <div class="dialog-footer">
            <button type="button" class="btn-secondary" data-close>Cancel</button>
            <button type="button" class="btn-danger btn-submit">Delete category</button>
        </div>`,
        {
            onClose() {
                if (fromManage) reopenManage();
            },
            onOpen(overlay) {
                $(".btn-submit", overlay).addEventListener("click", async () => {
                    try {
                        await api(`/api/categories/${category.id}`, { method: "DELETE" });
                        await refresh();
                        if (state.view === `category:${category.id}`) state.view = "all";
                        if (state.categoryFilter === String(category.id)) state.categoryFilter = "all";
                        renderAll();
                        closeDialog();
                    } catch (err) {
                        showErrorInDialog(overlay, err.message);
                    }
                });
            },
        });
}

/* ---- Manage categories ---- */

function reopenManage() {
    if (!activeOverlay) openManageCategoriesDialog();
}

function openManageCategoriesDialog() {
    const totalTasks = state.tasks.length;
    const rows = state.categories.map(c => {
        const total = categoryTaskCount(c.id);
        const pending = state.tasks.filter(t => t.category && t.category.id === c.id && !t.completed).length;
        return `
        <div class="manage-row" data-id="${c.id}">
            <span class="dot" style="background:${esc(c.color)}"></span>
            <span class="manage-name">${esc(c.name)}</span>
            <span class="manage-stats">${plural(total, "task")} · ${pending} pending</span>
            <span class="manage-actions">
                <button type="button" class="edit-row-btn" title="Edit ${esc(c.name)}"><i class="fa-solid fa-pen"></i></button>
                <button type="button" class="delete-row-btn" title="Delete ${esc(c.name)}"><i class="fa-solid fa-trash"></i></button>
            </span>
        </div>`;
    }).join("");

    openDialog(`
        ${dialogHeader("Manage categories", "A little organization for every part of your day.")}
        <div class="manage-bar">
            <span class="manage-count">${plural(state.categories.length, "category")} · ${plural(totalTasks, "task")}</span>
            <button type="button" class="btn-primary small add-category-btn">
                <i class="fa-solid fa-plus"></i> Add category
            </button>
        </div>
        <div class="manage-list">
            ${rows || `<div class="manage-empty">No categories yet. Create your first one above.</div>`}
        </div>
        <p class="manage-help">Rename a category with the pencil, or remove it with the trash icon. Your tasks stay safe when you delete a category.</p>
        <div class="dialog-footer">
            <button type="button" class="btn-primary btn-submit" data-close>Done</button>
        </div>`,
        {
            onOpen(overlay) {
                $(".add-category-btn", overlay).addEventListener("click", () => openAddCategoryDialog(true));
                $(".manage-list", overlay).addEventListener("click", (e) => {
                    const row = e.target.closest(".manage-row");
                    if (!row) return;
                    const category = state.categories.find(c => c.id === Number(row.dataset.id));
                    if (!category) return;
                    if (e.target.closest(".edit-row-btn")) openEditCategoryDialog(category, true);
                    if (e.target.closest(".delete-row-btn")) openDeleteCategoryDialog(category, true);
                });
            },
        });
}

/* ---------- shared dialog error helper ---------- */

function showErrorInDialog(overlay, message) {
    let el = $(".dialog-error", overlay);
    if (!el) {
        el = document.createElement("p");
        el.className = "info-note dialog-error";
        el.style.color = "#C04B51";
        const footer = $(".dialog-footer", overlay);
        footer.parentNode.insertBefore(el, footer);
    }
    el.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color:#C04B51"></i><span>${esc(message)}</span>`;
}

/* ==================================
   9. EVENT WIRING & INIT
================================== */

function wireEvents() {
    // navigation links (All tasks / Today / Upcoming / categories)
    $(".navigation").addEventListener("click", (e) => {
        const navItem = e.target.closest(".nav-item, .category-item");
        if (!navItem) return;
        e.preventDefault();
        state.view = navItem.dataset.view;
        renderAll();
    });

    // "+" next to MY CATEGORIES
    $(".category-heading i").addEventListener("click", () => openAddCategoryDialog(false));

    // "Manage categories" links (sidebar + right panel button)
    $(".manage-categories").addEventListener("click", (e) => {
        e.preventDefault();
        openManageCategoriesDialog();
    });
    $(".manage-btn").addEventListener("click", openManageCategoriesDialog);

    // Add task button
    $("#addTaskBtn").addEventListener("click", openAddTaskDialog);

    // tabs (Pending / Completed)
    $$(".tab").forEach(tab => tab.addEventListener("click", () => {
        state.statusFilter = tab.dataset.filter;
        renderAll();
    }));

    // category filter dropdown
    $("#categoryFilter").addEventListener("change", (e) => {
        state.categoryFilter = e.target.value;
        renderAll();
    });

    // search
    $("#searchInput").addEventListener("input", (e) => {
        state.search = e.target.value.trim();
        renderAll();
    });

    // task list: checkbox toggle, edit, delete (event delegation)
    $("#taskContainer").addEventListener("change", async (e) => {
        if (e.target.tagName !== "INPUT" || e.target.type !== "checkbox") return;
        const row = e.target.closest(".task-row");
        if (!row) return;
        const task = state.tasks.find(t => t.id === Number(row.dataset.id));
        if (!task) return;
        try {
            e.target.disabled = true;
            await api(`/api/tasks/${task.id}`, {
                method: "PUT",
                body: JSON.stringify({ completed: !task.completed }),
            });
            await refresh();
            renderAll();
        } catch (err) {
            e.target.disabled = false;
            e.target.checked = task.completed;
            console.error(err);
        }
    });

    $("#taskContainer").addEventListener("click", (e) => {
        const row = e.target.closest(".task-row");
        if (!row) return;
        const task = state.tasks.find(t => t.id === Number(row.dataset.id));
        if (!task) return;
        if (e.target.closest(".edit-btn")) openEditTaskDialog(task);
        if (e.target.closest(".delete-btn")) openDeleteTaskDialog(task);
    });

    // keyboard: Esc closes dialog / dropdown, Cmd+K focuses search
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            if ($$(".select-field.open").length) {
                closeAllSelectMenus();
                return;
            }
            closeDialog();
        }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
            e.preventDefault();
            $("#searchInput").focus();
        }
    });

    // close the custom dropdown when clicking outside of it
    document.addEventListener("click", (e) => {
        if (!e.target.closest(".select-field")) closeAllSelectMenus();
    });
}

async function init() {
    wireEvents();
    try {
        await refresh();
    } catch (err) {
        console.error("Could not load data from the API:", err);
    }
    renderAll();
}

init();