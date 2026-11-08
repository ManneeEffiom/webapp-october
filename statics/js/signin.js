const signinForm = document.getElementById('signin-form');
const signinRules = { email: Rules.email, password: Rules.signinPassword };
liveValidate(signinForm, signinRules);
signinForm.addEventListener('submit', e => {
  if (!validateForm(signinForm, signinRules)) e.preventDefault();
});
