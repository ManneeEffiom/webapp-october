(() => {
  const dialog = document.getElementById('add-task-dialog');
  const form = document.getElementById('add-task-form');
  const titleInput = form.querySelector('[name="title"]');
  const rules = {
    title: value => !value.trim() ? 'Task name is required.'
      : value.trim().length > 200 ? 'Task name must be 200 characters or fewer.' : '',
    notes: value => value.length > 1000 ? 'Notes must be 1000 characters or fewer.' : ''
  };

  liveValidate(form, rules);
  dialog.addEventListener('close', () => {
    form.reset();
    JDI.showErrors(form, {});
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!validateForm(form, rules)) return;
    JDI.showErrors(form, {});

    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;
    try {
      const response = await JDI.post('/tasks', {
        title: titleInput.value,
        notes: form.elements.notes.value,
        category_id: form.elements.category_id.value || null,
        due_date: form.elements.due_date.value || null
      });
      if (response.ok) {
        JDI.refresh();
      } else {
        JDI.showErrors(form, response.errors || { form: 'Could not add the task.' });
      }
    } catch (error) {
      console.error('Could not add task:', error);
      JDI.showErrors(form, { form: 'Could not add the task. Please try again.' });
    } finally {
      submitButton.disabled = false;
    }
  });
})();
