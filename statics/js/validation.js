// Browser-side rules. They mirror backend/validators.py; the server always re-checks.
const Rules = {
  email: v => !v.trim() ? 'Email address is required.'
    : /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim()) ? '' : 'Enter a valid email address.',
  signinPassword: v => v ? '' : 'Password is required.',
  password: v => v.length >= 8 && /\d/.test(v) ? '' : 'Use at least 8 characters, including a number.',
  fullName: v => v.trim().length >= 2 && v.trim().length <= 60 ? '' : 'Full name must be 2-60 characters.',
  agree: v => v ? '' : 'You need to agree to continue.',
  categoryName: v => !v.trim() ? 'Category name is required.'
    : v.trim().length > 30 ? 'Keep it to 30 characters or fewer.' : ''
};

function fieldValue(el) { return el.type === 'checkbox' ? el.checked : el.value; }

function setError(input, msg) {
  input.closest('.field').querySelector('.error').textContent = msg;
  input.classList.toggle('invalid', !!msg);
  return !msg;
}

function validateForm(form, rules) {
  let ok = true;
  for (const [name, rule] of Object.entries(rules)) {
    const el = form.querySelector(`[name="${name}"]`);
    if (!setError(el, rule(fieldValue(el)))) ok = false;
  }
  return ok;
}

function liveValidate(form, rules) {
  for (const [name, rule] of Object.entries(rules)) {
    const el = form.querySelector(`[name="${name}"]`);
    el.addEventListener('blur', () => setError(el, rule(fieldValue(el))));
  }
}
