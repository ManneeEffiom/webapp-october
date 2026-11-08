
// Helpers shared by every dialog.
const JDI = {
    open: id => {
        const dialog = document.getElementById(id);
        if (dialog) dialog.showModal();
    },

    async post(url, data = {}) {
        const csrf = document.querySelector('meta[name=csrf]');

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrf ? csrf.content : ''
            },
            body: JSON.stringify(data)
        });

        return res.json();
    },

    showErrors(container, errors) {
        container.querySelectorAll('.error').forEach(e => {
            e.textContent = '';
        });

        for (const [key, msg] of Object.entries(errors)) {
            const el = key === 'form'
                ? container.querySelector('.form-error')
                : container.querySelector(`[name="${key}"]`)
                    ?.closest('.field')
                    ?.querySelector('.error');

            if (el) el.textContent = msg;
        }
    },

    refresh() {
        // Reload so counts and sidebar come from the server.
        // Keep Manage Categories open if it was open.
        const manage = document.getElementById(
            'manage-categories-dialog'
        )?.open;

        location.href = '/dashboard' + (manage ? '?manage=1' : '');
    },

    plural: (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
};


// Open and close dialogs.
document.addEventListener('click', e => {
    const opener = e.target.closest('[data-open]');

    if (opener) {
        JDI.open(opener.dataset.open);
    }

    const closer = e.target.closest('[data-close]');

    if (closer) {
        closer.closest('dialog')?.close();
    }
});


// DELETE TASK
(() => {
    const dialog = document.getElementById('delete-task-dialog');
    const confirmButton = document.getElementById('confirm-delete-task');
    const titleElement = document.getElementById('delete-task-title');

    if (!dialog || !confirmButton || !titleElement) return;

    let selectedTaskId = null;

    // Open the confirmation dialog.
    document.addEventListener('click', e => {
        const deleteButton = e.target.closest('[data-delete-task]');

        if (!deleteButton) return;

        selectedTaskId = deleteButton.dataset.deleteTask;

        titleElement.textContent =
            deleteButton.dataset.taskTitle || 'this task';

        dialog.querySelector('.form-error').textContent = '';

        dialog.showModal();
    });

    // Confirm deletion.
    confirmButton.addEventListener('click', async () => {
        if (!selectedTaskId) return;

        confirmButton.disabled = true;
        confirmButton.textContent = 'Deleting...';

        try {
            const result = await JDI.post(
                `/tasks/${selectedTaskId}/delete`
            );

            if (result.ok) {
                JDI.refresh();
                return;
            }

            dialog.querySelector('.form-error').textContent =
                result.error || 'Could not delete this task.';

        } catch (error) {
            console.error('Delete task error:', error);

            dialog.querySelector('.form-error').textContent =
                'Something went wrong. Please try again.';
        } finally {
            confirmButton.disabled = false;
            confirmButton.textContent = 'Delete task';
        }
    });

    dialog.addEventListener('close', () => {
        selectedTaskId = null;
    });
})();
