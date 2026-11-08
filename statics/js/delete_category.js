(() => {
  const dlg = document.getElementById('delete-category-dialog');
  let id = null;

  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-delete]');
    if (!btn) return;
    id = btn.dataset.id;
    const total = Number(btn.dataset.total), pending = Number(btn.dataset.pending);
    dlg.querySelectorAll('[data-name]').forEach(el => el.textContent = btn.dataset.name);
    dlg.querySelector('.preview .dot').style.background = btn.dataset.color;
    dlg.querySelector('[data-counts]').textContent =
      `${JDI.plural(total, 'task')} \u00b7 ${pending} pending, ${total - pending} completed`;
    const who = total === 1 ? 'This task will' : total === 2 ? 'Both tasks will' : `All ${total} tasks will`;
    dlg.querySelector('[data-note]').textContent = total
      ? `${who} move to Uncategorized. Their due dates and completion status will stay the same.`
      : 'No tasks use this category.';
    JDI.showErrors(dlg, {});
    JDI.open('delete-category-dialog');
  });

  document.getElementById('confirm-delete').addEventListener('click', async () => {
    const res = await JDI.post(`/categories/${id}/delete`);
    res.ok ? JDI.refresh() : JDI.showErrors(dlg, res.errors);
  });
})();
