const signupForm = document.getElementById('signup-form');
const signupRules = { full_name: Rules.fullName, email: Rules.email, password: Rules.password, agree: Rules.agree };
liveValidate(signupForm, signupRules);
signupForm.addEventListener('submit', e => {
  if (!validateForm(signupForm, signupRules)) e.preventDefault();
});
