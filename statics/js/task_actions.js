
document.addEventListener("change", async (event) => {

    const checkbox = event.target instanceof Element
        ? event.target.closest(".task-checkbox")
        : null;

    if (!checkbox) return;

    const taskId = checkbox.dataset.taskId;
    const wasChecked = !checkbox.checked;
    checkbox.disabled = true;

    try {
        const response = await fetch(
            `/tasks/${taskId}/complete`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": document.querySelector(
                        'meta[name="csrf"]'
                    ).content
                },
                body: JSON.stringify({
                    completed: checkbox.checked
                })
            }
        );

        const result = await response.json();

        if (!response.ok || !result.ok) {
            throw new Error("Could not update task.");
        }

        location.reload();

    } catch (error) {
        console.error(error);
        alert("Unable to update task. Please try again.");
        checkbox.checked = wasChecked;
        checkbox.disabled = false;
    }

});

(() => {
    const tabs = [...document.querySelectorAll(".task-tabs [data-filter]")];
    const tasks = [...document.querySelectorAll("#taskContainer .task")];
    const emptyState = document.getElementById("taskFilterEmpty");
    const emptyTitle = document.getElementById("taskFilterEmptyTitle");
    const emptyMessage = document.getElementById("taskFilterEmptyMessage");
    const footerCount = document.getElementById("taskFooterCount");
    const categoryFilter = document.getElementById("categoryFilter");
    const statusStorageKey = "task-list-filter";
    const categoryStorageKey = "task-category-filter";

    if (!tabs.length || !emptyState || !emptyTitle || !emptyMessage) return;

    function showTasks(status) {
        const isCompleted = status === "completed";
        const selectedCategory = categoryFilter?.value || "all";
        const visibleTasks = tasks.filter(task => {
            const matchesStatus = task.dataset.completed === String(isCompleted);
            const matchesCategory = selectedCategory === "all"
                || task.dataset.category === selectedCategory;
            const matches = matchesStatus && matchesCategory;
            task.hidden = !matches;
            return matches;
        });

        tabs.forEach(tab => {
            const isActive = tab.dataset.filter === status;
            tab.classList.toggle("active", isActive);
            tab.setAttribute("aria-selected", String(isActive));
        });

        emptyState.hidden = tasks.length === 0 || visibleTasks.length > 0;
        const categoryName = categoryFilter?.selectedOptions[0]?.textContent.trim();
        emptyTitle.textContent = selectedCategory !== "all"
            ? `No ${isCompleted ? "completed" : "pending"} tasks in ${categoryName}`
            : isCompleted ? "No completed tasks" : "No pending tasks";
        emptyMessage.textContent = visibleTasks.length === 0 && tasks.length > 0
            ? "Try a different category or task tab."
            : isCompleted
                ? "Tasks you complete will appear here."
                : "You're all caught up.";

        if (footerCount) {
            const count = visibleTasks.length;
            const label = isCompleted ? "completed" : "pending";
            footerCount.textContent = `${count} ${label} task${count === 1 ? "" : "s"}`;
        }

        sessionStorage.setItem(statusStorageKey, status);
        if (categoryFilter) {
            sessionStorage.setItem(categoryStorageKey, selectedCategory);
        }
    }

    tabs.forEach(tab => {
        tab.addEventListener("click", () => showTasks(tab.dataset.filter));
    });

    const savedFilter = sessionStorage.getItem(statusStorageKey);
    const savedCategory = sessionStorage.getItem(categoryStorageKey);
    if (categoryFilter && [...categoryFilter.options].some(option => option.value === savedCategory)) {
        categoryFilter.value = savedCategory;
    }

    categoryFilter?.addEventListener("change", () => {
        const activeTab = tabs.find(tab => tab.classList.contains("active"));
        showTasks(activeTab?.dataset.filter || "pending");
    });

    showTasks(tabs.some(tab => tab.dataset.filter === savedFilter)
        ? savedFilter
        : "pending");
})();
