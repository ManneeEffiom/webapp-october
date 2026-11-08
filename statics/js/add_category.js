(() => {
  const dlg = document.getElementById('add-category-dialog');
  const form = document.getElementById('add-category-form');
  const nameInput = form.querySelector('[name="name"]');
  const rules = { name: Rules.categoryName };
  liveValidate(form, rules);

  const preview = () => {
    form.querySelector('[data-preview-name]').textContent = nameInput.value.trim() || 'Category name';
    form.querySelector('.preview .dot').style.background = form.querySelector('[name="color"]:checked').value;
  };
  form.addEventListener('input', preview);
  dlg.addEventListener('close', () => { form.reset(); preview(); JDI.showErrors(form, {}); });
  preview();

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!validateForm(form, rules)) return;
    const res = await JDI.post('/categories', {
      name: nameInput.value, color: form.querySelector('[name="color"]:checked').value });
    res.ok ? JDI.refresh() : JDI.showErrors(form, res.errors);
  });
})();
