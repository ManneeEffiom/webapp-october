(() => {
  const dlg = document.getElementById('edit-category-dialog');
  const form = document.getElementById('edit-category-form');
  const nameInput = form.querySelector('[name="name"]');
  const rules = { name: Rules.categoryName };
  let total = 0;
  liveValidate(form, rules);

  const preview = () => {
    form.querySelector('[data-preview-name]').textContent = nameInput.value.trim();
    form.querySelector('[data-preview-count]').textContent = total;
    form.querySelector('.preview .dot').style.background = form.querySelector('[name="color"]:checked').value;
  };
  form.addEventListener('input', preview);

  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-edit]');
    if (!btn) return;
    total = Number(btn.dataset.total);
    form.querySelector('[name="id"]').value = btn.dataset.id;
    nameInput.value = btn.dataset.name;
    form.querySelector(`[name="color"][value="${btn.dataset.color}"]`).checked = true;
    form.querySelector('[data-current]').textContent =
      `Currently named ${btn.dataset.name}. All ${JDI.plural(total, 'task')} will stay in this category.`;
    JDI.showErrors(form, {});
    preview();
    JDI.open('edit-category-dialog');
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!validateForm(form, rules)) return;
    const id = form.querySelector('[name="id"]').value;
    const res = await JDI.post(`/categories/${id}/update`, {
      name: nameInput.value, color: form.querySelector('[name="color"]:checked').value });
    res.ok ? JDI.refresh() : JDI.showErrors(form, res.errors);
  });
})();
