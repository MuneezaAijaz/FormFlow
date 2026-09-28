(() => {
  'use strict';

  const STORAGE_KEY = 'multiStepFormData';
  const TOTAL = 5;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const form = $('#msf');
  const els = {
    steps: $$('.step'), stepper: $$('#stepper li'), lineFill: $('#lineFill'),
    barFill: $('#barFill'), bar: $('#bar'), stepText: $('#stepText'), percent: $('#percentText'),
    saveStatus: $('#saveStatus'), prev: $('#prevBtn'), next: $('#nextBtn'), submit: $('#submitBtn'),
    summary: $('#summary'), formArea: $('#formArea'), success: $('#success'),
    successSummary: $('#successSummary'), restart: $('#restartBtn'), bio: $('#bio'), bioCount: $('#bioCount')
  };

  const state = { step: 1, submitted: false, submitting: false, direction: 'fwd' };
  let saveTimer;

  // ---------- Validation rules ----------
  const rules = {
    fullName: v => !v ? 'Full name is required.' : v.length < 2 || !/^[\p{L}][\p{L}\s.'-]*$/u.test(v) ? 'Please enter a valid name (letters only).' : '',
    email: v => !v ? 'Email address is required.' : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? 'Please enter a valid email address.' : '',
    phone: v => {
      if (!v) return 'Phone number is required.';
      const digits = v.replace(/\D/g, '');
      return !/^\+?[\d\s\-().]+$/.test(v) || digits.length < 7 || digits.length > 15 ? 'Please enter a valid phone number (7–15 digits).' : '';
    },
    country: v => v ? '' : 'Please select your country.',
    city: v => !v ? 'City is required.' : v.length < 2 ? 'Please enter a valid city.' : '',
    address: v => !v ? 'Street address is required.' : v.length < 5 ? 'Please enter a complete address.' : '',
    postalCode: v => !v ? 'Postal code is required.' : !/^[A-Za-z0-9][A-Za-z0-9\s-]{2,9}$/.test(v) ? 'Enter a valid postal code (3–10 letters or digits).' : '',
    occupation: v => v ? '' : 'Occupation is required.',
    company: v => v ? '' : 'Company is required.',
    experience: v => v ? '' : 'Please select your experience.',
    workType: v => v ? '' : 'Please choose a work type.',
    contactMethod: v => v ? '' : 'Please choose a contact method.',
    interests: v => v.length ? '' : 'Select at least one interest.'
  };

  const stepFields = {
    1: ['fullName', 'email', 'phone'],
    2: ['country', 'city', 'address', 'postalCode'],
    3: ['occupation', 'company', 'experience', 'workType'],
    4: ['contactMethod', 'interests'],
    5: []
  };

  // ---------- Data helpers ----------
  function getValue(name) {
    if (name === 'interests') return $$('input[name="interests"]:checked').map(i => i.value);
    const radios = $$(`input[type=radio][name="${name}"]`);
    if (radios.length) return (radios.find(r => r.checked) || {}).value || '';
    return form.elements[name].value.trim();
  }

  function collectData() {
    const data = {};
    Object.values(stepFields).flat().forEach(n => (data[n] = getValue(n)));
    data.bio = form.elements.bio.value.trim();
    return data;
  }

  // ---------- Validation ----------
  function validateField(name) {
    const msg = rules[name](getValue(name));
    const errEl = $(`#err-${name}`);
    errEl.textContent = msg;
    errEl.classList.toggle('show', !!msg);
    const group = $(`[data-group="${name}"]`);
    if (group) group.classList.toggle('has-error', !!msg);
    else {
      const input = form.elements[name];
      input.classList.toggle('invalid', !!msg);
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
      if (msg) input.setAttribute('aria-describedby', `err-${name}`);
    }
    return !msg;
  }

  function validateStep(step = state.step, focusFirst = true) {
    let firstBad = null;
    stepFields[step].forEach(n => { if (!validateField(n) && !firstBad) firstBad = n; });
    if (firstBad && focusFirst) {
      const target = $(`[name="${firstBad}"]`, form);
      target && target.focus();
    }
    return !firstBad;
  }

  // ---------- Rendering ----------
  function showStep(n, direction = 'fwd') {
    state.step = n;
    els.steps.forEach(s => {
      const active = +s.dataset.step === n;
      s.hidden = !active;
      s.classList.toggle('back', direction === 'back');
      if (active) { s.style.animation = 'none'; void s.offsetWidth; s.style.animation = ''; }
    });
    if (n === TOTAL) updateSummary();
    els.prev.classList.toggle('invisible', n === 1);
    els.prev.disabled = n === 1;
    els.next.hidden = n === TOTAL;
    els.submit.hidden = n !== TOTAL;
    updateProgress();
    saveFormData(true);
  }

  function updateProgress() {
    const pct = Math.round((state.step / TOTAL) * 100);
    els.stepText.textContent = `Step ${state.step} of ${TOTAL}`;
    els.percent.textContent = `${pct}%`;
    els.barFill.style.width = `${pct}%`;
    els.bar.setAttribute('aria-valuenow', pct);
    els.lineFill.style.width = `${((state.step - 1) / (TOTAL - 1)) * 100}%`;
    els.stepper.forEach(li => {
      const i = +li.dataset.step;
      li.classList.toggle('active', i === state.step);
      li.classList.toggle('done', i < state.step);
      i === state.step ? li.setAttribute('aria-current', 'step') : li.removeAttribute('aria-current');
    });
  }

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function summaryHTML(editable) {
    const d = collectData();
    const sections = [
      [1, 'Personal information', [['Full name', d.fullName], ['Email', d.email], ['Phone', d.phone]]],
      [2, 'Address', [['Country', d.country], ['City', d.city], ['Address', d.address], ['Postal code', d.postalCode]]],
      [3, 'Professional information', [['Occupation', d.occupation], ['Company', d.company], ['Experience', d.experience], ['Work type', d.workType]]],
      [4, 'Preferences', [['Contact method', d.contactMethod], ['Interests', d.interests.join(', ')], ['About you', d.bio || 'Not provided']]]
    ];
    return sections.map(([step, title, rows]) => `
      <div class="sum-sec">
        <div class="sum-head"><h3>${title}</h3>
          ${editable ? `<button type="button" class="edit" data-goto="${step}" aria-label="Edit ${title}">Edit</button>` : ''}
        </div>
        <dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v || '—')}</dd>`).join('')}</dl>
      </div>`).join('');
  }

  function updateSummary() { els.summary.innerHTML = summaryHTML(true); }

  // ---------- Navigation ----------
  function nextStep() {
    if (!validateStep()) return;
    if (state.step < TOTAL) showStep(state.step + 1, 'fwd'), focusHeading();
  }

  function previousStep() {
    if (state.step > 1) showStep(state.step - 1, 'back'), focusHeading();
  }

  function focusHeading() {
    const h = $(`.step[data-step="${state.step}"] h2`);
    h && h.focus({ preventScroll: true });
    els.formArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- Autosave ----------
  function saveFormData(silent = false) {
    if (state.submitted) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ step: state.step, data: collectData() }));
      if (!silent) {
        els.saveStatus.classList.add('show');
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => els.saveStatus.classList.remove('show'), 1800);
      }
    } catch (e) { /* storage unavailable – form still works */ }
  }

  function loadFormData() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || !saved.data) return 1;
      Object.entries(saved.data).forEach(([name, value]) => {
        if (name === 'interests') $$('input[name="interests"]').forEach(i => (i.checked = value.includes(i.value)));
        else if ($$(`input[type=radio][name="${name}"]`).length) $$(`input[name="${name}"]`).forEach(r => (r.checked = r.value === value));
        else if (form.elements[name]) form.elements[name].value = value;
      });
      els.bioCount.textContent = form.elements.bio.value.length;
      return Math.min(Math.max(+saved.step || 1, 1), TOTAL);
    } catch (e) { return 1; }
  }

  // ---------- Submit / reset ----------
  function submitForm(e) {
    e.preventDefault();
    if (state.submitting || state.submitted) return;
    for (let s = 1; s <= 4; s++) {
      if (!validateStep(s, false)) { showStep(s, 'back'); validateStep(s); return; }
    }
    state.submitting = true;
    els.submit.disabled = true;
    els.submit.textContent = 'Submitting…';
    setTimeout(() => {
      state.submitted = true;
      state.submitting = false;
      const payload = collectData();
      console.log('Form submitted:', payload);
      localStorage.removeItem(STORAGE_KEY);
      els.successSummary.innerHTML = summaryHTML(false);
      els.formArea.hidden = true;
      els.success.hidden = false;
      $('#successTitle').focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 700);
  }

  function resetForm() {
    localStorage.removeItem(STORAGE_KEY);
    form.reset();
    $$('.error').forEach(e => { e.textContent = ''; e.classList.remove('show'); });
    $$('.invalid, .has-error').forEach(e => e.classList.remove('invalid', 'has-error'));
    els.bioCount.textContent = '0';
    Object.assign(state, { submitted: false, submitting: false });
    els.submit.disabled = false;
    els.submit.textContent = 'Submit form';
    els.success.hidden = true;
    els.formArea.hidden = false;
    showStep(1, 'back');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- Init ----------
  function initializeForm() {
    const start = loadFormData();
    // Live re-validation clears errors once corrected; autosave on every change
    const onEdit = e => {
      const name = e.target.name;
      if (!name) return;
      const input = e.target;
      if (name === 'bio') els.bioCount.textContent = input.value.length;
      const hasError = $(`#err-${name}`) && $(`#err-${name}`).classList.contains('show');
      if (hasError) validateField(name);
      saveFormData();
    };
    form.addEventListener('input', onEdit);
    form.addEventListener('change', onEdit);
    form.addEventListener('focusout', e => {
      const n = e.target.name;
      if (n && rules[n] && e.target.value && (e.target.type === 'text' || e.target.type === 'email' || e.target.type === 'tel')) validateField(n);
    });

    els.next.addEventListener('click', nextStep);
    els.prev.addEventListener('click', previousStep);
    form.addEventListener('submit', submitForm);
    els.restart.addEventListener('click', resetForm);

    // Enter advances (except in textarea) instead of submitting early
    form.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') {
        e.preventDefault();
        state.step < TOTAL ? nextStep() : form.requestSubmit();
      }
    });

    // Edit buttons in summary (event delegation)
    els.summary.addEventListener('click', e => {
      const btn = e.target.closest('[data-goto]');
      if (btn) { showStep(+btn.dataset.goto, 'back'); focusHeading(); }
    });

    // Click completed steps in the stepper to go back
    els.stepper.forEach(li => li.addEventListener('click', () => {
      const i = +li.dataset.step;
      if (i < state.step) { showStep(i, 'back'); focusHeading(); }
    }));

    showStep(start, 'fwd');
  }

  initializeForm();
})();
