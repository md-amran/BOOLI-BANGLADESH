// script.js - Merged Booli1 + Booli2 - FULLY FIXED
const DEBUG = true;

function debugLog(...args) {
  if (DEBUG) console.log('[DEBUG]', ...args);
}

// ===== STATE =====
const state = {
  user: null,
  currentChatId: null,
  currentContact: null,
  contacts: [],
  messages: [],
  tasks: [],
  currentTaskFilter: 'all',
  currentTaskSearch: '',
  section: 'chats',
  theme: localStorage.getItem('booli-theme') || 'dark',
  profileEditMode: false,
  messagesUnsubscribe: null,
  filter: 'all',
  usernameCheckTimeout: null,
  pendingVerification: false,
  pendingPhoneVerification: false,
  pendingSecondIdentifier: false,
  signupIdentifierType: 'email',
  phoneConfirmationResult: null,
  secondIdConfirmationResult: null,
  replyingTo: null,
  selectedMessages: [],
  searchResults: [],
  isSearching: false,
  contextMenuMsgId: null,
  contextMenuMsgText: null,
  bulkSelectMode: false,
  disappearingMessages: {},
  voiceRecorder: null,
  voiceChunks: [],
  voiceStream: null,
  isRecording: false,
  blockedUsers: [],
  searchDebounceTimer: null,
  muteTimeout: null,
  recordingStartTime: null,
  recordingTimerInterval: null
};

document.documentElement.setAttribute('data-theme', state.theme);

function FB() {
  if (!window._firebase) {
    console.error("❌ Firebase not initialized yet");
    return {};
  }
  return window._firebase;
}

// Add this to script.js after the existing toast function
// Make sure toast is globally available

function toast(msg, type = 'success') {
  const t = document.getElementById('toast');
  if (!t) return;
  const el = document.createElement('div');
  el.className = `toast-msg ${type}`;
  el.textContent = msg;
  t.appendChild(el);
  setTimeout(() => el.remove(), 3500);

  // Play sound based on toast type
  if (window.BooliSound) {
    if (type === 'success') {
      window.BooliSound.playSuccessSound();
    } else if (type === 'error') {
      window.BooliSound.playErrorSound();
    }
  }
}

// Make toast globally available
window.toast = toast;

function closeAllMenus() {
  const ctxMenu = document.getElementById('ctx-menu');
  if (ctxMenu) ctxMenu.style.display = 'none';
  const emojiPicker = document.getElementById('emoji-picker');
  if (emojiPicker) emojiPicker.style.display = 'none';
  const plusMenu = document.getElementById('plus-menu');
  if (plusMenu) plusMenu.style.display = 'none';
  document.querySelectorAll('.dropdown').forEach(d => d.style.display = 'none');
  const contactModal = document.querySelector('.contact-info-modal');
  if (contactModal) contactModal.remove();
  const forwardModal = document.querySelector('.forward-modal');
  if (forwardModal) forwardModal.remove();
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('#ctx-menu')) {
    const ctxMenu = document.getElementById('ctx-menu');
    if (ctxMenu) ctxMenu.style.display = 'none';
  }
  if (!e.target.closest('#plus-menu') && !e.target.closest('.input-action-btn')) {
    const plusMenu = document.getElementById('plus-menu');
    if (plusMenu) plusMenu.style.display = 'none';
  }
  if (!e.target.closest('#emoji-picker') && !e.target.closest('.input-action-btn')) {
    const emojiPicker = document.getElementById('emoji-picker');
    if (emojiPicker) emojiPicker.style.display = 'none';
  }
});

// ===== TASK MANAGER HELPERS =====
function saveTasks() {
  localStorage.setItem('booli-tasks', JSON.stringify(state.tasks));
}

function getPriorityInfo(priority) {
  switch(priority) {
    case 'high': return { color: '#EF4444', bg: 'rgba(239,68,68,0.1)', label: '🔥 High', icon: 'fa-arrow-up' };
    case 'medium': return { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', label: '⚡ Medium', icon: 'fa-minus' };
    case 'low': return { color: '#10B981', bg: 'rgba(16,185,129,0.1)', label: '🌱 Low', icon: 'fa-arrow-down' };
    default: return { color: '#6B7280', bg: 'rgba(107,114,128,0.1)', label: '📌 Normal', icon: 'fa-tag' };
  }
}

function formatDueDate(dueDate) {
  if (!dueDate) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const due = new Date(dueDate); due.setHours(0,0,0,0);
  const diffDays = Math.ceil((due - today) / (1000*60*60*24));
  if (diffDays < 0) return { text: `⚠️ Overdue`, class: 'overdue', icon: 'fa-exclamation-triangle' };
  if (diffDays === 0) return { text: `📅 Today`, class: 'today', icon: 'fa-calendar-day' };
  if (diffDays === 1) return { text: `📅 Tomorrow`, class: 'tomorrow', icon: 'fa-calendar-day' };
  if (diffDays <= 7) return { text: `📅 In ${diffDays} days`, class: 'soon', icon: 'fa-calendar-week' };
  return { text: `📅 ${new Date(dueDate).toLocaleDateString()}`, class: 'future', icon: 'fa-calendar-alt' };
}

function checkDueDateReminders(task) {
  if (!task.dueDate || task.completed) return;
  const today = new Date(); today.setHours(0,0,0,0);
  const due = new Date(task.dueDate); due.setHours(0,0,0,0);
  const diffDays = Math.ceil((due - today) / (1000*60*60*24));
  if (diffDays === 0) toast(`⏰ Reminder: "${task.text}" is due today!`, 'warning');
  else if (diffDays === 1) toast(`📌 Reminder: "${task.text}" is due tomorrow`, 'info');
}

function checkAllReminders() {
  state.tasks.forEach(task => checkDueDateReminders(task));
}

function getTaskStats() {
  const total = state.tasks.length;
  const completed = state.tasks.filter(t => t.completed).length;
  const pending = total - completed;
  const highPriority = state.tasks.filter(t => t.priority === 'high' && !t.completed).length;
  const overdue = state.tasks.filter(t => {
    if (!t.dueDate || t.completed) return false;
    const due = new Date(t.dueDate); due.setHours(0,0,0,0);
    const today = new Date(); today.setHours(0,0,0,0);
    return due < today;
  }).length;
  return { total, completed, pending, highPriority, overdue };
}

function renderTasks() {
  const list = document.getElementById('tasks-list');
  if (!list) return;
  let filtered = [...state.tasks];
  switch(state.currentTaskFilter) {
    case 'completed': filtered = filtered.filter(t => t.completed); break;
    case 'pending': filtered = filtered.filter(t => !t.completed); break;
    case 'important': filtered = filtered.filter(t => t.pinned); break;
  }
  if (state.currentTaskSearch) {
    filtered = filtered.filter(t => t.text.toLowerCase().includes(state.currentTaskSearch));
  }
  filtered.sort((a,b) => {
    if (a.pinned !== b.pinned) return b.pinned - a.pinned;
    if (a.completed !== b.completed) return a.completed - b.completed;
    const order = { high:3, medium:2, low:1 };
    if (order[a.priority] !== order[b.priority]) return order[b.priority] - order[a.priority];
    if (a.dueDate && b.dueDate) return new Date(a.dueDate) - new Date(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return b.createdAt?.localeCompare(a.createdAt) || 0;
  });
  const stats = getTaskStats();
  const statsHtml = `<div class="task-stats" style="display:flex;gap:16px;padding:12px 16px;background:var(--card);border-radius:12px;margin-bottom:16px;flex-wrap:wrap;">
    <div><strong>📊 Total:</strong> ${stats.total}</div>
    <div><strong>✅ Completed:</strong> ${stats.completed}</div>
    <div><strong>⏳ Pending:</strong> ${stats.pending}</div>
    <div><strong>🔥 High Priority:</strong> ${stats.highPriority}</div>
    ${stats.overdue > 0 ? `<div style="color:var(--error)"><strong>⚠️ Overdue:</strong> ${stats.overdue}</div>` : ''}
  </div>`;
  if (!filtered.length) {
    list.innerHTML = statsHtml + `<div style="text-align:center;padding:40px;color:var(--text-secondary);">
      <i class="fas fa-check-circle" style="font-size:48px;margin-bottom:16px;opacity:0.3;display:block;"></i>
      ${state.currentTaskFilter !== 'all' || state.currentTaskSearch ? 'No tasks match your filters' : 'No tasks yet. Create your first task above!'}
    </div>`;
    return;
  }
  list.innerHTML = statsHtml + filtered.map(task => {
    const priority = getPriorityInfo(task.priority);
    const dueInfo = formatDueDate(task.dueDate);
    const isOverdue = dueInfo && dueInfo.class === 'overdue';
    return `<div class="task-card ${task.completed ? 'completed' : ''} ${isOverdue ? 'overdue-task' : ''}" style="background:var(--card);border:1px solid var(--border);border-radius:16px;padding:16px;margin-bottom:12px;transition:all 0.2s;position:relative;${task.pinned ? 'border-left:4px solid #F59E0B;' : ''}">
      <div style="display:flex;align-items:flex-start;gap:12px;">
        <input type="checkbox" ${task.completed ? 'checked' : ''} onchange="toggleTask(${task.id})" style="width:20px;height:20px;margin-top:2px;cursor:pointer;accent-color:var(--primary);">
        <div style="flex:1;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
            <span style="background:${priority.bg};color:${priority.color};padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;display:inline-flex;align-items:center;gap:4px;"><i class="fas ${priority.icon}"></i> ${priority.label}</span>
            ${task.pinned ? '<span style="background:rgba(245,158,11,0.1);color:#F59E0B;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;"><i class="fas fa-thumbtack"></i> Pinned</span>' : ''}
            ${task.completed ? '<span style="background:rgba(34,197,94,0.1);color:#22C55E;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;"><i class="fas fa-check"></i> Done</span>' : ''}
          </div>
          <div style="font-size:15px;font-weight:500;margin-bottom:8px;word-wrap:break-word;${task.completed ? 'text-decoration:line-through;opacity:0.7;' : ''}cursor:pointer;" onclick="editTask(${task.id})">${escapeHtml(task.text)}</div>
          ${dueInfo ? `<div style="font-size:12px;color:${dueInfo.class === 'overdue' ? 'var(--error)' : 'var(--text-secondary)'};margin-top:6px;display:flex;align-items:center;gap:6px;"><i class="fas ${dueInfo.icon}"></i> <span>${dueInfo.text}</span></div>` : ''}
        </div>
        <div style="display:flex;gap:6px;">
          <button onclick="togglePinTask(${task.id})" style="background:transparent;border:none;color:${task.pinned ? '#F59E0B' : 'var(--text-secondary)'};cursor:pointer;padding:6px;border-radius:8px;font-size:14px;" title="${task.pinned ? 'Unpin' : 'Pin'}"><i class="fas fa-thumbtack"></i></button>
          <button onclick="deleteTask(${task.id})" style="background:transparent;border:none;color:var(--error);cursor:pointer;padding:6px;border-radius:8px;font-size:14px;" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    </div>`;
  }).join('');
}

window.addTask = function() {
  const input = document.getElementById('task-input');
  const priority = document.getElementById('task-priority')?.value || 'medium';
  const dueDate = document.getElementById('task-due-date')?.value || '';
  if (!input?.value.trim()) { toast('Please enter a task description', 'error'); return; }
  const newTask = {
    id: Date.now(),
    text: input.value.trim(),
    completed: false,
    priority: priority,
    dueDate: dueDate,
    pinned: false,
    createdAt: new Date().toISOString()
  };
  state.tasks.unshift(newTask);
  saveTasks();
  input.value = '';
  const prioritySelect = document.getElementById('task-priority');
  const dueDateInput = document.getElementById('task-due-date');
  if (prioritySelect) prioritySelect.value = 'medium';
  if (dueDateInput) dueDateInput.value = '';
  renderTasks();
  checkDueDateReminders(newTask);
  toast('Task added successfully!', 'success');
};

window.toggleTask = function(id) {
  const task = state.tasks.find(t => t.id === id);
  if (task) { task.completed = !task.completed; saveTasks(); renderTasks(); if (task.completed) toast('Task completed! 🎉', 'success'); }
};

window.deleteTask = function(id) {
  if (confirm('Delete this task?')) { state.tasks = state.tasks.filter(t => t.id !== id); saveTasks(); renderTasks(); toast('Task deleted', 'success'); }
};

window.togglePinTask = function(id) {
  const task = state.tasks.find(t => t.id === id);
  if (task) { task.pinned = !task.pinned; saveTasks(); renderTasks(); toast(task.pinned ? 'Task pinned! 📌' : 'Task unpinned', 'info'); }
};

window.editTask = function(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  const newText = prompt('Edit task:', task.text);
  if (newText && newText.trim()) { task.text = newText.trim(); saveTasks(); renderTasks(); toast('Task updated', 'success'); }
};

window.setTaskFilter = function(filter, btnElement) {
  state.currentTaskFilter = filter;
  document.querySelectorAll('.task-filter-btn').forEach(btn => btn.classList.remove('active'));
  if (btnElement) btnElement.classList.add('active');
  renderTasks();
};

window.searchTasks = function() {
  const searchInput = document.getElementById('task-search');
  state.currentTaskSearch = searchInput?.value.toLowerCase() || '';
  renderTasks();
};

window.clearCompletedTasks = function() {
  const pendingCount = state.tasks.filter(t => !t.completed).length;
  if (confirm(`Delete all completed tasks? (${state.tasks.length - pendingCount} tasks will be removed)`)) {
    state.tasks = state.tasks.filter(t => !t.completed);
    saveTasks();
    renderTasks();
    toast('Completed tasks cleared', 'success');
  }
};

// ===== AUTH FUNCTIONS =====
window.switchSignupIdentifier = function(type) {
  state.signupIdentifierType = type;
  const emailField = document.getElementById('signup-email-field');
  const phoneField = document.getElementById('signup-phone-field');
  const tabEmail = document.getElementById('signup-tab-email');
  const tabPhone = document.getElementById('signup-tab-phone');
  if (type === 'email') {
    if (emailField) emailField.style.display = 'block';
    if (phoneField) phoneField.style.display = 'none';
    if (tabEmail) { tabEmail.style.background = 'var(--primary)'; tabEmail.style.color = '#fff'; tabEmail.style.borderColor = 'var(--primary)'; }
    if (tabPhone) { tabPhone.style.background = 'transparent'; tabPhone.style.color = 'var(--text-secondary)'; tabPhone.style.borderColor = 'var(--border)'; }
  } else {
    if (emailField) emailField.style.display = 'none';
    if (phoneField) phoneField.style.display = 'block';
    if (tabPhone) { tabPhone.style.background = 'var(--primary)'; tabPhone.style.color = '#fff'; tabPhone.style.borderColor = 'var(--primary)'; }
    if (tabEmail) { tabEmail.style.background = 'transparent'; tabEmail.style.color = 'var(--text-secondary)'; tabEmail.style.borderColor = 'var(--border)'; }
  }
};

window.otpAutoFocus = function(current, prevId, nextId) {
  if (current.value && nextId) document.getElementById(nextId)?.focus();
  current.addEventListener('keydown', function(e) {
    if (e.key === 'Backspace' && !current.value && prevId) document.getElementById(prevId)?.focus();
  }, { once: true });
};

window.closeOTPModal = function() {
  const modal = document.getElementById('otp-modal');
  if (modal) modal.style.display = 'none';
  state.pendingPhoneVerification = false;
  state.phoneConfirmationResult = null;
  state.secondIdConfirmationResult = null;
};

function checkPasswordStrength() {
  const password = document.getElementById('signup-pass')?.value || '';
  const bar = document.getElementById('password-strength-bar');
  const text = document.getElementById('password-strength-text');
  const suggestions = document.getElementById('password-suggestions');
  if (!password) { if(bar) bar.className = 'password-strength-bar'; if(text) text.textContent = ''; if(suggestions) suggestions.innerHTML = ''; return; }
  let strength = 0, suggestionsList = [];
  if (password.length >= 8) strength++; else suggestionsList.push('• At least 8 characters');
  if (/[A-Z]/.test(password)) strength++; else suggestionsList.push('• Add uppercase letters');
  if (/[a-z]/.test(password)) strength++; else suggestionsList.push('• Add lowercase letters');
  if (/[0-9]/.test(password)) strength++; else suggestionsList.push('• Add numbers');
  if (/[^A-Za-z0-9]/.test(password)) strength++; else suggestionsList.push('• Add special characters (!@#$% etc.)');
  if (strength <= 2) { if(bar) bar.className = 'password-strength-bar weak'; if(text) text.textContent = 'Weak password'; if(text) text.style.color = 'var(--error)'; }
  else if (strength <= 4) { if(bar) bar.className = 'password-strength-bar medium'; if(text) text.textContent = 'Medium password'; if(text) text.style.color = 'var(--warning)'; }
  else { if(bar) bar.className = 'password-strength-bar strong'; if(text) text.textContent = 'Strong password'; if(text) text.style.color = 'var(--success)'; }
  if (suggestions && suggestionsList.length) suggestions.innerHTML = suggestionsList.join('<br>');
  else if (suggestions) suggestions.innerHTML = '';
}

window.togglePasswordVisibility = function(inputId, btn) {
  const input = document.getElementById(inputId);
  const icon = btn?.querySelector('i');
  if (input && icon) {
    if (input.type === 'password') { input.type = 'text'; icon.className = 'fas fa-eye-slash'; }
    else { input.type = 'password'; icon.className = 'fas fa-eye'; }
  }
};

async function checkUsernameAvailability() {
  const username = document.getElementById('signup-username')?.value.trim();
  const statusSpan = document.getElementById('username-status');
  if (!statusSpan) return;
  if (!username) { statusSpan.innerHTML = ''; statusSpan.className = ''; return; }
  if (username.length < 3) { statusSpan.innerHTML = '<i class="fas fa-info-circle"></i> Min 3 characters'; statusSpan.className = 'username-checking'; return; }
  if (state.usernameCheckTimeout) clearTimeout(state.usernameCheckTimeout);
  statusSpan.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';
  statusSpan.className = 'username-checking';
  state.usernameCheckTimeout = setTimeout(async () => {
    try {
      const { db, collection, query, where, getDocs } = FB();
      const q = query(collection(db, 'users'), where('username', '==', username.toLowerCase()));
      const snap = await getDocs(q);
      if (snap.empty) { statusSpan.innerHTML = '<i class="fas fa-check-circle"></i> Available'; statusSpan.className = 'username-available'; }
      else { statusSpan.innerHTML = '<i class="fas fa-times-circle"></i> Username taken'; statusSpan.className = 'username-taken'; }
    } catch(e) { statusSpan.innerHTML = '<i class="fas fa-check-circle"></i> Available'; statusSpan.className = 'username-available'; }
  }, 500);
}

window.switchAuthTab = function(tab) {
  const tabs = document.querySelectorAll('#auth-tab button');
  if (tabs[0]) tabs[0].classList.toggle('active', tab === 'login');
  if (tabs[1]) tabs[1].classList.toggle('active', tab === 'signup');
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  if (loginForm) loginForm.style.display = tab === 'login' ? 'block' : 'none';
  if (signupForm) signupForm.style.display = tab === 'signup' ? 'block' : 'none';
  if (tab === 'signup') {
    const usernameInput = document.getElementById('signup-username');
    const passwordInput = document.getElementById('signup-pass');
    if (usernameInput) usernameInput.addEventListener('input', checkUsernameAvailability);
    if (passwordInput) passwordInput.addEventListener('input', checkPasswordStrength);
  }
};

window.handleLogin = async function() {
  const identifier = document.getElementById('login-identifier')?.value.trim();
  const password = document.getElementById('login-pass')?.value;
  if (!identifier || !password) { toast('Please fill all fields', 'error'); return; }
  try {
    let email = identifier;
    if (/^\+?[0-9]{7,15}$/.test(identifier.replace(/\s/g, ''))) {
      const { db, collection, query, where, getDocs } = FB();
      const q = query(collection(db, 'users'), where('phone', '==', identifier.replace(/\s/g, '')));
      const snap = await getDocs(q);
      if (snap.empty) { toast('No account found with this phone number', 'error'); return; }
      email = snap.docs[0].data().email;
    } else if (!identifier.includes('@')) {
      const { db, collection, query, where, getDocs } = FB();
      const q = query(collection(db, 'users'), where('username', '==', identifier.toLowerCase()));
      const snap = await getDocs(q);
      if (snap.empty) { toast('Username not found', 'error'); return; }
      email = snap.docs[0].data().email;
    }
    await FB().signInWithEmailAndPassword(FB().auth, email, password);
    const user = FB().auth.currentUser;
    if (!user.emailVerified && user.providerData[0]?.providerId === 'password') {
      toast('Please verify your email before logging in', 'error');
      await FB().signOut(FB().auth);
      showVerificationModal(user.email);
      return;
    }
    toast('Login successful!', 'success');
    if (window.BooliSound) { window.BooliSound.playLoginSound(); }
  } catch(e) {
    console.error('Login error:', e);
    if (e.code === 'auth/user-not-found') toast('No account found with this email/username', 'error');
    else if (e.code === 'auth/wrong-password') toast('Incorrect password', 'error');
    else if (e.code === 'auth/invalid-email') toast('Please enter a valid email address', 'error');
    else toast(e.message || 'Login failed', 'error');
  }
};

window.handleSignup = async function() {
  console.log('Signup started');
  const firstName = document.getElementById('signup-firstname')?.value.trim() || '';
  const lastName = document.getElementById('signup-lastname')?.value.trim() || '';
  const username = document.getElementById('signup-username')?.value.trim().toLowerCase() || '';
  const password = document.getElementById('signup-pass')?.value || '';
  const identifierType = state.signupIdentifierType;
  const email = identifierType === 'email' ? document.getElementById('signup-email')?.value.trim() || '' : '';
  const phone = identifierType === 'phone' ? document.getElementById('signup-phone')?.value.trim().replace(/\s/g, '') || '' : '';
  if (!firstName || !lastName || !username) { toast('Please fill all fields', 'error'); return; }
  if (identifierType === 'email' && !email) { toast('Please enter your email address', 'error'); return; }
  if (identifierType === 'phone' && !phone) { toast('Please enter your phone number', 'error'); return; }
  if (identifierType === 'phone' && !/^\+[0-9]{7,15}$/.test(phone)) { toast('Phone number must start with + and country code (e.g. +8801XXXXXXXX)', 'error'); return; }
  if (username.length < 3) { toast('Username must be at least 3 characters', 'error'); return; }
  if (password.length < 8) { toast('Password must be at least 8 characters', 'error'); return; }
  if (!/^[a-z0-9_]+$/.test(username)) { toast('Username can only contain lowercase letters, numbers, and underscores', 'error'); return; }
  const signupBtn = document.querySelector('#signup-form .auth-btn');
  const originalText = signupBtn?.textContent || 'Create Account';
  if (signupBtn) { signupBtn.textContent = 'Creating account...'; signupBtn.disabled = true; }
  try {
    const { auth, db, doc, setDoc, collection, query, where, getDocs } = FB();
    const usersRef = collection(db, 'users');
    const uq = query(usersRef, where('username', '==', username));
    const existingUsers = await getDocs(uq);
    if (!existingUsers.empty) { toast('Username already taken. Please choose another.', 'error'); if(signupBtn){ signupBtn.textContent=originalText; signupBtn.disabled=false; } return; }
    if (identifierType === 'email') {
      const { createUserWithEmailAndPassword, updateProfile, sendEmailVerification } = FB();
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const fullName = `${firstName} ${lastName}`;
      await updateProfile(cred.user, { displayName: fullName });
      await sendEmailVerification(cred.user);
      await setDoc(doc(db, 'users', cred.user.uid), { uid: cred.user.uid, firstName, lastName, fullName, username, email, phone: '', verifiedEmail: false, verifiedPhone: false, signupMethod: 'email', about: 'Hey there! I am using Booli.', avatar: '', coverPhoto: '', blockedUsers: [], createdAt: Date.now() });
      toast('Account created! Please verify your email.', 'success');
      showVerificationModal(email);
      document.getElementById('signup-firstname').value = '';
      document.getElementById('signup-lastname').value = '';
      document.getElementById('signup-username').value = '';
      document.getElementById('signup-email').value = '';
      document.getElementById('signup-pass').value = '';
      setTimeout(() => switchAuthTab('login'), 2000);
    } else {
      const dummyEmail = `phone_${phone.replace('+', '')}_${Date.now()}@temp.booli.app`;
      const { createUserWithEmailAndPassword, updateProfile } = FB();
      const pq = query(usersRef, where('phone', '==', phone));
      const phoneSnap = await getDocs(pq);
      if (!phoneSnap.empty) { toast('This phone number is already registered.', 'error'); if(signupBtn){ signupBtn.textContent=originalText; signupBtn.disabled=false; } return; }
      const cred = await createUserWithEmailAndPassword(auth, dummyEmail, password);
      const fullName = `${firstName} ${lastName}`;
      await updateProfile(cred.user, { displayName: fullName });
      sessionStorage.setItem('booli_temp_pwd', password);
      await setDoc(doc(db, 'users', cred.user.uid), { uid: cred.user.uid, firstName, lastName, fullName, username, email: '', phone, verifiedEmail: false, verifiedPhone: false, signupMethod: 'phone', about: 'Hey there! I am using Booli.', avatar: '', coverPhoto: '', blockedUsers: [], createdAt: Date.now() });
      toast('Account created! Please verify your phone number.', 'success');
      await sendPhoneOTP(phone, 'otp-recaptcha-container', false);
      document.getElementById('signup-firstname').value = '';
      document.getElementById('signup-lastname').value = '';
      document.getElementById('signup-username').value = '';
      document.getElementById('signup-phone').value = '';
      document.getElementById('signup-pass').value = '';
    }
  } catch(e) {
    console.error('Signup error:', e);
    if (e.code === 'auth/email-already-in-use') toast('This email is already registered. Please sign in instead.', 'error');
    else if (e.code === 'auth/weak-password') toast('Password should be at least 6 characters', 'error');
    else if (e.code === 'auth/invalid-email') toast('Please enter a valid email address', 'error');
    else if (e.code === 'auth/network-request-failed') toast('Network error. Please check your connection.', 'error');
    else toast(e.message || 'Signup failed. Please try again.', 'error');
  } finally { if(signupBtn){ signupBtn.textContent=originalText; signupBtn.disabled=false; } }
};

function showVerificationModal(email) {
  const verifyEmailSpan = document.getElementById('verify-email');
  const modal = document.getElementById('verify-modal');
  if (verifyEmailSpan) verifyEmailSpan.textContent = email;
  if (modal) modal.style.display = 'flex';
  state.pendingVerification = true;
}

async function sendPhoneOTP(phoneNumber, recaptchaContainerId, isResend = false) {
  try {
    const { auth, RecaptchaVerifier, signInWithPhoneNumber } = FB();
    if (!isResend || !window._recaptchaVerifier) {
      if (window._recaptchaVerifier) { try { window._recaptchaVerifier.clear(); } catch(e) {} window._recaptchaVerifier = null; }
      let container = document.getElementById(recaptchaContainerId);
      if (!container) { const nc = document.createElement('div'); nc.id = recaptchaContainerId; nc.style.display = 'none'; document.body.appendChild(nc); }
      window._recaptchaVerifier = new RecaptchaVerifier(auth, recaptchaContainerId, { size: 'invisible', callback: () => console.log('reCAPTCHA resolved'), 'expired-callback': () => console.log('reCAPTCHA expired') });
    }
    const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, window._recaptchaVerifier);
    state.phoneConfirmationResult = confirmationResult;
    const phoneDisplay = document.getElementById('otp-phone-display');
    const otpModal = document.getElementById('otp-modal');
    if (phoneDisplay) phoneDisplay.textContent = phoneNumber;
    if (otpModal) otpModal.style.display = 'flex';
    state.pendingPhoneVerification = true;
    for (let i=1; i<=6; i++) { const el = document.getElementById(`otp-input-${i}`); if (el) el.value = ''; }
    document.getElementById('otp-input-1')?.focus();
    toast('OTP sent to ' + phoneNumber, 'success');
  } catch(e) {
    console.error('OTP send error:', e);
    if (e.code === 'auth/invalid-phone-number') toast('Invalid phone number format. Use +880XXXXXXXXXX', 'error');
    else if (e.code === 'auth/too-many-requests') toast('Too many requests. Please try again later.', 'error');
    else toast('Failed to send OTP: ' + (e.message || 'Try again'), 'error');
  }
}

window.verifyOTP = async function() {
  const otp = ['otp-input-1','otp-input-2','otp-input-3','otp-input-4','otp-input-5','otp-input-6'].map(id=>document.getElementById(id)?.value||'').join('');
  if (otp.length < 6) { toast('Please enter the 6-digit OTP', 'error'); return; }
  try {
    if (state.secondIdConfirmationResult) {
      const { PhoneAuthProvider, linkWithCredential } = FB();
      const credential = PhoneAuthProvider.credential(state.secondIdConfirmationResult.verificationId, otp);
      await linkWithCredential(FB().auth.currentUser, credential);
      const { db, doc, updateDoc } = FB();
      await updateDoc(doc(db, 'users', state.user.uid), { verifiedPhone: true });
      state.secondIdConfirmationResult = null;
      const otpModal = document.getElementById('otp-modal');
      const secondModal = document.getElementById('second-identifier-modal');
      if (otpModal) otpModal.style.display = 'none';
      if (secondModal) secondModal.style.display = 'none';
      state.pendingSecondIdentifier = false;
      state.pendingPhoneVerification = false;
      toast('Phone number verified and linked!', 'success');
      return;
    }
    if (state.phoneConfirmationResult) {
      await state.phoneConfirmationResult.confirm(otp);
      const user = FB().auth.currentUser;
      const { db, doc, updateDoc } = FB();
      await updateDoc(doc(db, 'users', user.uid), { verifiedPhone: true });
      const otpModal = document.getElementById('otp-modal');
      if (otpModal) otpModal.style.display = 'none';
      state.pendingPhoneVerification = false;
      state.phoneConfirmationResult = null;
      toast('Phone verified! Account ready.', 'success');
    }
  } catch(e) {
    console.error('OTP verify error:', e);
    if (e.code === 'auth/invalid-verification-code') toast('Incorrect OTP. Please try again.', 'error');
    else toast(e.message || 'Verification failed', 'error');
  }
};

window.resendOTP = async function() {
  const phone = document.getElementById('otp-phone-display')?.textContent;
  if (!phone) return;
  const containerId = state.secondIdConfirmationResult !== null ? 'second-id-recaptcha' : 'otp-recaptcha-container';
  await sendPhoneOTP(phone, containerId, false);
};

function showSecondIdentifierModal(signupMethod) {
  const modal = document.getElementById('second-identifier-modal');
  const title = document.getElementById('second-id-title');
  const desc = document.getElementById('second-id-desc');
  const icon = document.getElementById('second-id-icon');
  const input = document.getElementById('second-id-input');
  if (!modal) return;
  if (signupMethod === 'email') {
    if (title) title.textContent = 'Add Your Phone Number (Optional)';
    if (desc) desc.textContent = 'You can add a phone number to enable login via phone and account recovery. This is optional.';
    if (icon) icon.className = 'fas fa-mobile-alt';
    if (input) { input.type = 'tel'; input.placeholder = '+880XXXXXXXXXX (with country code)'; }
  } else {
    if (title) title.textContent = 'Add Your Email Address (Optional)';
    if (desc) desc.textContent = 'You can add an email address to enable login via email and account recovery. This is optional.';
    if (icon) icon.className = 'fas fa-envelope';
    if (input) { input.type = 'email'; input.placeholder = 'yourname@example.com'; }
  }
  if (input) input.value = '';
  state.pendingSecondIdentifier = true;
  modal.style.display = 'flex';
}

window.submitSecondIdentifier = async function() {
  const value = document.getElementById('second-id-input')?.value.trim();
  const btn = document.getElementById('second-id-btn');
  if (!value) { toast('Please enter a value', 'error'); return; }
  if (btn) { btn.textContent = 'Processing...'; btn.disabled = true; }
  try {
    const { db, doc, getDoc, updateDoc } = FB();
    const userSnap = await getDoc(doc(db, 'users', FB().auth.currentUser.uid));
    const userData = userSnap.data();
    const signupMethod = userData.signupMethod;
    if (signupMethod === 'email') {
      if (!/^\+[0-9]{7,15}$/.test(value)) { toast('Phone number must start with + and country code', 'error'); if(btn){ btn.textContent='Add & Verify'; btn.disabled=false; } return; }
      const { collection, query, where, getDocs } = FB();
      const pq = query(collection(db, 'users'), where('phone', '==', value));
      const pSnap = await getDocs(pq);
      if (!pSnap.empty) { toast('This phone number is already registered', 'error'); if(btn){ btn.textContent='Add & Verify'; btn.disabled=false; } return; }
      await updateDoc(doc(db, 'users', FB().auth.currentUser.uid), { phone: value });
      const { auth, RecaptchaVerifier, signInWithPhoneNumber } = FB();
      if (window._recaptchaVerifier2) { try { window._recaptchaVerifier2.clear(); } catch(e) {} window._recaptchaVerifier2 = null; }
      window._recaptchaVerifier2 = new RecaptchaVerifier(auth, 'second-id-recaptcha', { size: 'invisible', callback: () => {} });
      const confirmResult = await signInWithPhoneNumber(auth, value, window._recaptchaVerifier2);
      state.secondIdConfirmationResult = confirmResult;
      const phoneDisplay = document.getElementById('otp-phone-display');
      const secondModal = document.getElementById('second-identifier-modal');
      const otpModal = document.getElementById('otp-modal');
      if (phoneDisplay) phoneDisplay.textContent = value;
      if (secondModal) secondModal.style.display = 'none';
      if (otpModal) otpModal.style.display = 'flex';
      for (let i=1; i<=6; i++) { const el = document.getElementById(`otp-input-${i}`); if (el) el.value = ''; }
      document.getElementById('otp-input-1')?.focus();
      toast('OTP sent to ' + value, 'success');
    } else {
      if (!value.includes('@')) { toast('Please enter a valid email address', 'error'); if(btn){ btn.textContent='Add & Verify'; btn.disabled=false; } return; }
      const savedPassword = sessionStorage.getItem('booli_temp_pwd');
      if (!savedPassword) { toast('Session expired. Please sign in again.', 'error'); if(btn){ btn.textContent='Add & Verify'; btn.disabled=false; } return; }
      const { EmailAuthProvider, linkWithCredential } = FB();
      const credential = EmailAuthProvider.credential(value, savedPassword);
      await linkWithCredential(FB().auth.currentUser, credential);
      const { sendEmailVerification } = FB();
      await sendEmailVerification(FB().auth.currentUser);
      await updateDoc(doc(db, 'users', FB().auth.currentUser.uid), { email: value });
      sessionStorage.removeItem('booli_temp_pwd');
      const secondModal = document.getElementById('second-identifier-modal');
      if (secondModal) secondModal.style.display = 'none';
      state.pendingSecondIdentifier = false;
      toast('Email added! Please verify your email.', 'success');
      showVerificationModal(value);
    }
  } catch(e) { console.error('Second identifier error:', e); toast(e.message || 'Failed. Please try again.', 'error'); }
  finally { if(btn){ btn.textContent='Add & Verify'; btn.disabled=false; } }
};

window.skipSecondIdentifier = function() {
  const modal = document.getElementById('second-identifier-modal');
  if (modal) modal.style.display = 'none';
  state.pendingSecondIdentifier = false;
  toast('You can add this later in your profile settings', 'info');
};

window.resendVerificationEmail = async function() {
  try { const user = FB().auth.currentUser; if (user) { await FB().sendEmailVerification(user); toast('Verification email resent!', 'success'); } }
  catch(e) { toast(e.message, 'error'); }
};

window.checkEmailVerification = async function() {
  try {
    await FB().auth.currentUser.reload();
    const user = FB().auth.currentUser;
    if (user.emailVerified) {
      const { db, doc, updateDoc } = FB();
      await updateDoc(doc(db, 'users', user.uid), { verifiedEmail: true });
      const modal = document.getElementById('verify-modal');
      if (modal) modal.style.display = 'none';
      state.pendingVerification = false;
      toast('Email verified! Welcome to Booli!', 'success');
    } else toast('Email not verified yet. Please check your inbox.', 'error');
  } catch(e) { toast(e.message, 'error'); }
};

window.showForgotPassword = function() { const modal = document.getElementById('forgot-password-modal'); if (modal) modal.style.display = 'flex'; };
window.closeForgotModal = function() { const modal = document.getElementById('forgot-password-modal'); if (modal) modal.style.display = 'none'; };
window.showForgotID = function() { const modal = document.getElementById('forgot-id-modal'); if (modal) modal.style.display = 'flex'; };
window.closeForgotIDModal = function() { const modal = document.getElementById('forgot-id-modal'); if (modal) modal.style.display = 'none'; };

window.sendPasswordReset = async function() {
  const input = document.getElementById('reset-email')?.value.trim();
  if (!input) { toast('Please enter your email, username, or phone', 'error'); return; }
  try {
    let email = input;
    if (/^\+?[0-9]{7,15}$/.test(input.replace(/\s/g, ''))) {
      const { db, collection, query, where, getDocs } = FB();
      const q = query(collection(db, 'users'), where('phone', '==', input.replace(/\s/g, '')));
      const snap = await getDocs(q);
      if (snap.empty) { toast('No account found with this phone number', 'error'); return; }
      email = snap.docs[0].data().email;
    } else if (!input.includes('@')) {
      const { db, collection, query, where, getDocs } = FB();
      const q = query(collection(db, 'users'), where('username', '==', input.toLowerCase()));
      const snap = await getDocs(q);
      if (snap.empty) { toast('No account found with this username', 'error'); return; }
      email = snap.docs[0].data().email;
    }
    if (!email) { toast('No email found for this account', 'error'); return; }
    await FB().sendPasswordResetEmail(FB().auth, email);
    toast('Password reset email sent!', 'success');
    window.closeForgotModal();
  } catch(e) { toast(e.message, 'error'); }
};

window.recoverUsername = async function() {
  const email = document.getElementById('recover-email')?.value.trim();
  const recoverBtn = document.querySelector('#forgot-id-modal .auth-btn:first-child');
  const originalText = recoverBtn?.textContent || 'Recover Username';
  if (!email) { toast('Please enter your email', 'error'); return; }
  if (recoverBtn) { recoverBtn.textContent = 'Searching...'; recoverBtn.disabled = true; }
  try {
    const { db, collection, query, where, getDocs } = FB();
    const q = query(collection(db, 'users'), where('email', '==', email));
    const snap = await getDocs(q);
    if (snap.empty) { toast('No account found with this email', 'error'); return; }
    const userData = snap.docs[0].data();
    if (userData.username) { toast(`Your username is: ${userData.username}`, 'success'); window.closeForgotIDModal(); const ri = document.getElementById('recover-email'); if(ri) ri.value=''; }
    else toast('Username not found for this account', 'error');
  } catch(e) { console.error('Recovery error:', e); toast('Unable to recover username. Please try again.', 'error'); }
  finally { if(recoverBtn){ recoverBtn.textContent=originalText; recoverBtn.disabled=false; } }
};

window.handleLogout = async function() {
  if (window.BooliSound) { window.BooliSound.playLogoutSound(); }
  await FB().signOut(FB().auth);
};

// ===== AUTH STATE =====
window.addEventListener('load', () => {
  state.tasks = JSON.parse(localStorage.getItem('booli-tasks') || '[]');
  setTimeout(() => {
    FB().onAuthStateChanged(FB().auth, async user => {
      if (user) {
        console.log('User logged in:', user.uid);
        if (!user.emailVerified && !state.pendingVerification && user.providerData[0]?.providerId === 'password') {
          showVerificationModal(user.email);
          const authScreen = document.getElementById('auth-screen');
          const appDiv = document.getElementById('app');
          if (authScreen) authScreen.style.display = 'none';
          if (appDiv) appDiv.style.display = 'flex';
          return;
        }
        state.user = user;
        const authScreen = document.getElementById('auth-screen');
        const appDiv = document.getElementById('app');
        if (authScreen) authScreen.style.display = 'none';
        if (appDiv) appDiv.style.display = 'flex';
        const verifyModal = document.getElementById('verify-modal');
        if (verifyModal) verifyModal.style.display = 'none';
        setTimeout(async () => {
          await ensureUserDoc(user);
          updateAvatar(user);
          await loadBlockedUsers();
          loadContacts();
          renderStatus();
          renderCommunity();
          renderTools();
          renderSettings();
          renderProfile();
          renderCallList();
          setPresence(user.uid, true);
          loadDisappearingSettings();
          const { db, doc, getDoc } = FB();
          const userSnap = await getDoc(doc(db, 'users', user.uid));
          const userData = userSnap.data();
          if (userData) {
            if (userData.signupMethod === 'email' && !userData.phone && !state.pendingSecondIdentifier) setTimeout(() => showSecondIdentifierModal('email'), 1000);
            else if (userData.signupMethod === 'phone' && !userData.email && !state.pendingSecondIdentifier) setTimeout(() => showSecondIdentifierModal('phone'), 1000);
          }
        }, 1000);
      } else {
        console.log('User logged out');
        state.user = null; state.currentChatId = null; state.currentContact = null; state.contacts = []; state.messages = []; state.pendingVerification = false;
        if (state.messagesUnsubscribe) { state.messagesUnsubscribe(); state.messagesUnsubscribe = null; }
        const authScreen = document.getElementById('auth-screen');
        const appDiv = document.getElementById('app');
        if (authScreen) authScreen.style.display = 'flex';
        if (appDiv) appDiv.style.display = 'none';
        const verifyModal = document.getElementById('verify-modal');
        if (verifyModal) verifyModal.style.display = 'none';
        const chatWindow = document.getElementById('chat-window');
        const welcomeScreen = document.getElementById('welcome-screen');
        const messagesArea = document.getElementById('messages-area');
        const chatList = document.getElementById('chat-list');
        if (chatWindow) chatWindow.style.display = 'none';
        if (welcomeScreen) welcomeScreen.style.display = 'flex';
        if (messagesArea) messagesArea.innerHTML = '';
        if (chatList) chatList.innerHTML = '';
      }
    });
  }, 1500);
});

async function ensureUserDoc(user) {
  if (!user || !user.uid) return false;
  const { db, doc, getDoc, setDoc, updateDoc } = FB();
  const ref = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const name = user.displayName || user.email || 'User';
      const nameParts = name.split(' ');
      await setDoc(ref, { uid: user.uid, firstName: nameParts[0] || '', lastName: nameParts.slice(1).join(' ') || '', fullName: name, username: `user_${user.uid.slice(0,8)}`, email: user.email, phone: '', verifiedEmail: user.emailVerified || false, about: 'Hey! I am using Booli.', avatar: '', coverPhoto: '', blockedUsers: [], createdAt: Date.now() });
      console.log('User document created');
    } else if (snap.data().verifiedEmail !== user.emailVerified) await updateDoc(ref, { verifiedEmail: user.emailVerified });
    return true;
  } catch(e) { console.error('Error ensuring user doc:', e); return false; }
}

async function loadBlockedUsers() {
  const { db, doc, getDoc } = FB();
  const userRef = doc(db, 'users', state.user.uid);
  const userSnap = await getDoc(userRef);
  state.blockedUsers = userSnap.data()?.blockedUsers || [];
}

function updateAvatar(user) {
  const name = user.displayName || user.email?.[0]?.toUpperCase() || 'U';
  const initials = name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
  const url = `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=E11D48&color=fff&bold=true&size=80`;
  const avatarImg = document.getElementById('main-avatar-img');
  if (avatarImg) avatarImg.src = url;
}

function setPresence(uid, online) {
  const { rtdb, ref, set, onDisconnect, rtServerTimestamp } = FB();
  const r = ref(rtdb, `presence/${uid}`);
  set(r, { online, lastSeen: rtServerTimestamp() });
  onDisconnect(r).set({ online: false, lastSeen: rtServerTimestamp() });
}

window.switchSection = function(section) {
  state.section = section;
  document.querySelectorAll('.sidebar-icon-btn').forEach(b=>b.classList.remove('active'));
  const navBtn = document.getElementById('nav-'+section);
  if (navBtn) navBtn.classList.add('active');
  document.querySelectorAll('.sec-section').forEach(s=>s.style.display='none');
  const secEl = document.getElementById('sec-'+section);
  if (secEl) secEl.style.display = 'flex';
  const sidebar = document.getElementById('secondary-sidebar');
  if (sidebar) sidebar.classList.remove('collapsed');
  if (['tools','settings','profile'].includes(section)) {
    const welcomeScreen = document.getElementById('welcome-screen');
    const chatWindow = document.getElementById('chat-window');
    const toolsMain = document.getElementById('tools-main');
    if (welcomeScreen) welcomeScreen.style.display = 'flex';
    if (chatWindow) chatWindow.style.display = 'none';
    if (toolsMain) toolsMain.style.display = 'none';
  }
  if (section === 'tools') renderToolsMain();
  closeAllMenus();
};

async function loadContacts() {
  if (!state.user || !state.user.uid) return;
  const { db, collection, onSnapshot, query, where } = FB();
  try {
    const q = query(collection(db, 'chats'), where('participants', 'array-contains', state.user.uid));
    onSnapshot(q, (snap) => {
      const chats = [];
      snap.forEach(d => {
        const data = d.data();
        const otherId = data.participants?.find(p=>p!==state.user.uid);
        if (otherId && state.blockedUsers.includes(otherId)) return;
        chats.push({ id: d.id, ...data });
      });
      state.contacts = chats;
      renderChatList(chats);
    }, (error) => console.error('Error loading chats:', error));
  } catch(e) { console.error('Error in loadContacts:', e); }
}

function renderChatList(chats) {
  const list = document.getElementById('chat-list');
  const searchInput = document.getElementById('chat-search');
  const search = searchInput?.value.toLowerCase() || '';
  const filter = state.filter;
  if (!list) return;
  let filtered = chats.filter(c => {
    const name = getOtherName(c).toLowerCase();
    const matchSearch = !search || name.includes(search);
    const matchFilter = filter==='all' || (filter==='unread' && (c.unreadCount||0)>0) || (filter==='read' && (c.unreadCount||0)===0);
    return matchSearch && matchFilter;
  });
  if (!filtered.length) { list.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--text-secondary);font-size:14px"><i class="fas fa-comments" style="font-size:32px;margin-bottom:12px;opacity:0.4;display:block"></i>No conversations yet.<br>Start one with the + button!</div>`; return; }
  filtered.sort((a,b)=>(b.lastMsgTime||0)-(a.lastMsgTime||0));
  list.innerHTML = filtered.map(chat => {
    const name = getOtherName(chat);
    const initials = name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=E11D48&color=fff&bold=true&size=80`;
    const unread = chat.unreadCount || 0;
    const lastMsg = chat.lastMsg || 'Say hello! 👋';
    const time = chat.lastMsgTime ? formatTime(chat.lastMsgTime) : '';
    const active = state.currentChatId === chat.id ? 'active' : '';
    const otherId = chat.participants?.find(p=>p!==state.user.uid) || '';
    const escapedName = name.replace(/'/g,"\\'");
    const isMuted = chat.mutedUntil && chat.mutedUntil > Date.now();
    const isFavorite = chat.favorite === true;
    return `<div class="chat-item ${active}" onclick="openChat('${chat.id}','${escapedName}','${otherId}')" oncontextmenu="showChatContextMenu(event,'${chat.id}')">
      <div class="chat-avatar" style="position:relative"><img src="${avatarUrl}" alt="${name}"><span class="online-dot" style="display:none" id="dot-${chat.id}"></span></div>
      <div class="chat-info"><div class="chat-name">${escapeHtml(name)}${isFavorite ? '<i class="fas fa-heart" style="color:#f59e0b;font-size:10px;margin-left:4px;"></i>' : ''}${isMuted ? '<i class="fas fa-bell-slash" style="color:var(--text-secondary);font-size:10px;margin-left:4px;"></i>' : ''}</div><div class="chat-last-msg">${escapeHtml(lastMsg)}</div></div>
      <div class="chat-meta"><span class="chat-time">${time}</span>${unread>0?`<span class="unread-badge">${unread}</span>`:''}</div>
    </div>`;
  }).join('');
}

function getOtherName(chat) {
  if (!chat || !chat.participantNames || !chat.participants) return 'Unknown';
  const otherId = chat.participants.find(p=>p!==state.user.uid);
  if (!otherId) return 'Unknown';
  const name = chat.participantNames[otherId];
  return name && name !== 'undefined' ? name : 'Unknown';
}

window.filterChats = function() { renderChatList(state.contacts); };
window.setFilter = function(f, el) { state.filter = f; document.querySelectorAll('.filter-tab').forEach(t=>t.classList.remove('active')); if(el) el.classList.add('active'); filterChats(); };

window.openChat = async function(chatId, name, otherId) {
  state.currentChatId = chatId;
  state.currentContact = { id: otherId, name };
  state.replyingTo = null;
  state.selectedMessages = [];
  state.isSearching = false;
  const welcomeScreen = document.getElementById('welcome-screen');
  const chatWindow = document.getElementById('chat-window');
  const toolsMain = document.getElementById('tools-main');
  const chName = document.getElementById('ch-name');
  const chAvatar = document.getElementById('ch-avatar');
  if (welcomeScreen) welcomeScreen.style.display = 'none';
  if (chatWindow) chatWindow.style.display = 'flex';
  if (toolsMain) toolsMain.style.display = 'none';
  if (chName) chName.textContent = name;
  const initials = name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
  if (chAvatar) chAvatar.innerHTML = `<img src="https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=E11D48&color=fff&bold=true&size=80" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
  renderChatList(state.contacts);
  subscribeMessages(chatId);
  try { const { db, doc, updateDoc } = FB(); await updateDoc(doc(db, 'chats', chatId), { unreadCount: 0 }); } catch(e) {}
};

function subscribeMessages(chatId) {
  if (state.messagesUnsubscribe) state.messagesUnsubscribe();
  const { db, collection, onSnapshot, query, orderBy } = FB();
  const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('ts', 'asc'));
  state.messagesUnsubscribe = onSnapshot(q, snap => {
    const msgs = [];
    snap.forEach(d => msgs.push({ id: d.id, ...d.data() }));
    state.messages = msgs;
    renderMessages(msgs);
    checkDisappearingMessages(msgs);

    // Play sound for incoming messages from others
    if (snap.docChanges().length > 0) {
      snap.docChanges().forEach(change => {
        if (change.type === 'added') {
          const msg = change.doc.data();
          // Only play sound if message is from someone else (not current user)
          if (msg.uid !== state.user?.uid && window.BooliSound) {
            window.BooliSound.playMessageSound();
          }
        }
      });
    }
  }, error => console.error('Message subscription error:', error));
}

function renderMessages(msgs, shouldScrollToBottom = true) {
  const area = document.getElementById('messages-area');
  if (!area) return;
  if (!msgs.length) { area.innerHTML = `<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-secondary);font-size:14px">No messages yet. Say hi! 👋</div>`; if(shouldScrollToBottom) area.scrollTop=area.scrollHeight; return; }
  let html = '', lastDate = '';
  const searchTerm = document.getElementById('in-chat-search-input')?.value.toLowerCase() || '';
  msgs.forEach(msg => {
    const msgDate = msg.ts ? new Date(msg.ts.toMillis ? msg.ts.toMillis() : msg.ts).toDateString() : '';
    if (msgDate && msgDate !== lastDate) { html += `<div class="msg-date-divider"><span>${formatDate(msg.ts)}</span></div>`; lastDate = msgDate; }
    const isOut = msg.uid === state.user.uid;
    const isSelected = state.selectedMessages.includes(msg.id);
    const highlight = searchTerm && (msg.text?.toLowerCase().includes(searchTerm) || (msg.attachment?.name?.toLowerCase().includes(searchTerm)));
    const isStarred = msg.starred === true;
    const isPinned = msg.pinned === true;
    const hasReaction = msg.reaction && msg.reaction !== null;
    const isEdited = msg.edited === true;
    const initials = (msg.name || 'U').split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
    const time = msg.ts ? formatMsgTime(msg.ts) : '';
    let replyHtml = '';
    if (msg.replyTo && msg.replyToMessage) replyHtml = `<div class="reply-preview"><i class="fas fa-reply"></i> ${escapeHtml(msg.replyToMessage.text?.substring(0,50)||'')}</div>`;
    let starIcon = isStarred ? '<i class="fas fa-star" style="font-size:10px;color:#f59e0b;margin-left:4px;"></i>' : '';
    let pinIcon = isPinned ? '<i class="fas fa-thumbtack" style="font-size:10px;color:#f59e0b;margin-left:4px;"></i>' : '';
    let reactionHtml = hasReaction ? `<div class="msg-reaction">${msg.reaction}</div>` : '';
    let editIndicator = isEdited ? '<span style="font-size:10px;margin-left:4px;opacity:0.6;">(edited)</span>' : '';
    let contentHtml = '';
    if (msg.text && msg.text.trim()) contentHtml += `<div class="msg-text">${escapeHtml(msg.text)} ${starIcon} ${pinIcon} ${editIndicator}</div>`;
    if (msg.attachment) {
      const url = msg.attachment.url, type = msg.attachmentType || 'file';
      if (type === 'image' || (msg.attachment.type && msg.attachment.type.startsWith('image/'))) contentHtml += `<div class="msg-attachment"><img src="${url}" class="msg-image" onclick="openImagePreview('${url}')" loading="lazy"></div>`;
      else if (type === 'video' || (msg.attachment.type && msg.attachment.type.startsWith('video/'))) contentHtml += `<div class="msg-attachment"><video controls class="msg-video" src="${url}"></video></div>`;
      else if (type === 'audio' || (msg.attachment.type && msg.attachment.type.startsWith('audio/'))) contentHtml += `<div class="msg-attachment"><audio controls class="msg-audio" src="${url}"></audio></div>`;
      else if (type === 'voice') contentHtml += `<div class="msg-attachment"><audio controls class="msg-audio" src="${url}"></audio></div>`;
      else contentHtml += `<div class="msg-attachment"><a href="${url}" target="_blank" class="file-download"><i class="fas fa-download"></i> ${escapeHtml(msg.attachment.name || 'Download')}</a></div>`;
    }
    if (msg.poll) contentHtml += renderPollUI(msg.poll, msg.id);
    if (msg.event) contentHtml += renderEventUI(msg.event);
    if (msg.contactCard) contentHtml += `<div class="contact-card"><i class="fas fa-address-card"></i> <div><strong>${escapeHtml(msg.contactCard.name)}</strong><br><span class="contact-card-id">User ID: ${msg.contactCard.userId}</span></div></div>`;
    const bubbleClass = highlight ? 'highlight' : '';
    const msgWrapClass = `msg-wrap ${isOut ? 'out' : 'in'} ${isSelected ? 'selected' : ''}`;
    const avatarHtml = `<div class="msg-avatar"><img src="https://ui-avatars.com/api/?name=${initials}&background=E11D48&color=fff&bold=true&size=60" alt="${escapeHtml(msg.name)}"></div>`;
    const escapedMsgText = (msg.text || '').replace(/'/g,"\\'");
    html += `<div class="${msgWrapClass}" data-msg-id="${msg.id}" oncontextmenu="showMsgContextMenu(event,'${msg.id}','${escapedMsgText}')" onclick="selectMessageForBulk('${msg.id}', event)">
      ${avatarHtml}
      <div>${replyHtml}<div class="msg-bubble ${bubbleClass}">${contentHtml}</div><div class="msg-time">${time}${isOut ? '<i class="fas fa-check-double" style="font-size:10px;margin-left:4px;color:var(--accent)"></i>' : ''}</div>${reactionHtml}</div>
    </div>`;
  });
  area.innerHTML = html;
  if (shouldScrollToBottom) setTimeout(() => area.scrollTop = area.scrollHeight, 50);
}

function renderPollUI(poll, msgId) {
  if (!poll) return '';
  const totalVotes = poll.totalVotes || 0;
  const userVote = poll.votes?.[state.user.uid];
  const optionsHtml = poll.options.map((opt, idx) => {
    const voteCount = poll.votes?.[`opt_${idx}`] || 0;
    const percentage = totalVotes > 0 ? (voteCount / totalVotes) * 100 : 0;
    const isSelected = userVote === idx;
    return `<div class="poll-option" onclick="votePoll('${msgId}', ${idx})"><div class="poll-option-bar" style="width: ${percentage}%"></div><div class="poll-option-text">${escapeHtml(opt)}</div><div class="poll-option-count">${voteCount} (${Math.round(percentage)}%)</div>${isSelected ? '<i class="fas fa-check-circle poll-check"></i>' : ''}</div>`;
  }).join('');
  return `<div class="poll-container"><div class="poll-question">📊 ${escapeHtml(poll.question)}</div><div class="poll-options">${optionsHtml}</div><div class="poll-total">${totalVotes} vote${totalVotes !== 1 ? 's' : ''}</div></div>`;
}

function renderEventUI(event) {
  if (!event) return '';
  return `<div class="event-container"><div class="event-icon"><i class="fas fa-calendar-alt"></i></div><div class="event-details"><div class="event-title">${escapeHtml(event.title)}</div><div class="event-date"><i class="fas fa-calendar-day"></i> ${escapeHtml(event.date)}</div><div class="event-time"><i class="fas fa-clock"></i> ${escapeHtml(event.time)}</div><div class="event-location"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(event.location)}</div><div class="event-attendees"><i class="fas fa-users"></i> ${event.attendees?.length || 0} attending</div><button class="event-attend-btn" onclick="attendEvent('${event.id}')"><i class="fas fa-check"></i> Attend</button></div></div>`;
}

window.openImagePreview = function(url) {
  const modal = document.createElement('div');
  modal.className = 'image-preview-modal';
  modal.innerHTML = `<div class="image-preview-container"><img src="${url}" class="image-preview-img"><button class="image-preview-close" onclick="this.closest('.image-preview-modal').remove()"><i class="fas fa-times"></i></button></div>`;
  document.body.appendChild(modal);
  modal.onclick = (e) => { if(e.target===modal) modal.remove(); };
};

window.votePoll = async function(msgId, optionIndex) {
  if (!state.currentChatId) return;
  const { db, doc, updateDoc } = FB();
  const msgRef = doc(db, 'chats', state.currentChatId, 'messages', msgId);
  try {
    const msg = state.messages.find(m=>m.id===msgId);
    if (!msg || !msg.poll) return;
    const poll = msg.poll, userVote = poll.votes?.[state.user.uid];
    if (userVote === optionIndex) { toast('You already voted for this option', 'info'); return; }
    const votes = poll.votes || {};
    const oldOption = userVote;
    if (oldOption !== undefined) { votes[`opt_${oldOption}`] = (votes[`opt_${oldOption}`]||0)-1; delete votes[state.user.uid]; }
    votes[`opt_${optionIndex}`] = (votes[`opt_${optionIndex}`]||0)+1;
    votes[state.user.uid] = optionIndex;
    const totalVotes = Object.keys(votes).filter(k=>!k.startsWith('opt_')).length;
    await updateDoc(msgRef, { 'poll.votes': votes, 'poll.totalVotes': totalVotes });
    toast('Vote recorded!', 'success');
  } catch(e) { console.error('Poll vote error:', e); toast('Failed to vote', 'error'); }
};

window.attendEvent = async function(eventId) { toast('Event attendance feature coming soon!', 'info'); };

function checkDisappearingMessages(msgs) {
  const disappearTime = localStorage.getItem(`disappear_${state.currentChatId}`);
  if (!disappearTime) return;
  const seconds = parseInt(disappearTime);
  msgs.forEach(msg => {
    if (msg.uid !== state.user.uid && !msg._disappearScheduled) {
      msg._disappearScheduled = true;
      setTimeout(async () => { try { const { db, doc, deleteDoc } = FB(); await deleteDoc(doc(db, 'chats', state.currentChatId, 'messages', msg.id)); toast('A message disappeared', 'info'); } catch(e){} }, seconds*1000);
    }
  });
}

function loadDisappearingSettings() {
  for(let i=0;i<localStorage.length;i++) {
    const key = localStorage.key(i);
    if(key && key.startsWith('disappear_')) state.disappearingMessages[key.replace('disappear_','')] = parseInt(localStorage.getItem(key));
  }
}

window.sendMessage = async function() {
  const input = document.getElementById('msg-input');
  const text = input?.value.trim() || '';
  if (!text && !state.replyingTo) { toast('Please type a message', 'error'); return; }
  if (!state.currentChatId) { toast('No chat selected', 'error'); return; }
  if (!state.user) { toast('You are not logged in', 'error'); return; }
  if (state.currentContact && state.blockedUsers.includes(state.currentContact.id)) { toast('You cannot send messages to a blocked user', 'error'); return; }
  if (input) { input.value = ''; autoResize(input); }
  updateSendBtn();
  const { db, collection, addDoc, serverTimestamp, doc, updateDoc, increment } = FB();
  const userName = state.user.displayName || state.user.email || 'User';
  try {
    const messageData = { text: text || '', uid: state.user.uid, name: userName, ts: serverTimestamp(), type: 'text' };
    if (state.replyingTo) { messageData.replyTo = state.replyingTo.id; messageData.replyToMessage = { text: state.replyingTo.text, name: state.replyingTo.name }; state.replyingTo = null; const ri = document.getElementById('reply-indicator'); if(ri) ri.remove(); }
    await addDoc(collection(db, 'chats', state.currentChatId, 'messages'), messageData);
    await updateDoc(doc(db, 'chats', state.currentChatId), { lastMsg: text || '📎 Attachment', lastMsgTime: Date.now(), unreadCount: increment(1) });
    if (window.BooliSound) { window.BooliSound.playSendSound(); }
  } catch(e) { console.error('Error sending message:', e); toast('Error: ' + (e.message || 'Failed to send message'), 'error'); if(input){ input.value=text; autoResize(input); } updateSendBtn(); }
};

async function uploadToCloudinary(file) {
  const cloudName = "dyscr90sb", uploadPreset = "unsigned_upload";
  const url = `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`;
  const fd = new FormData(); fd.append("file", file); fd.append("upload_preset", uploadPreset);
  const res = await fetch(url, { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error("Upload failed");
  return data.secure_url;
}

async function sendMediaMessage(file, type, metadata = {}) {
  if (!state.currentChatId) { toast('No chat selected', 'error'); return; }
  toast(`Uploading ${file.name}...`, 'info');
  try {
    const url = await uploadToCloudinary(file);
    const { db, collection, addDoc, serverTimestamp, doc, updateDoc, increment } = FB();
    const userName = state.user.displayName || state.user.email || 'User';
    await addDoc(collection(db, 'chats', state.currentChatId, 'messages'), { text: metadata.caption || '', attachment: { url, name: file.name, type: file.type, size: file.size }, attachmentType: type, uid: state.user.uid, name: userName, ts: serverTimestamp(), type });
    let lastMsgText = type==='image'?'📷 Photo':type==='video'?'🎥 Video':type==='audio'?'🎵 Audio':type==='voice'?'🎤 Voice message':`📎 ${file.name}`;
    await updateDoc(doc(db, 'chats', state.currentChatId), { lastMsg: lastMsgText, lastMsgTime: Date.now(), unreadCount: increment(1) });
    toast('Sent successfully!', 'success');
    if (window.BooliSound) { window.BooliSound.playSendSound(); }
  } catch(e) { console.error('Upload error:', e); toast('Failed to upload: ' + (e.message || 'Unknown error'), 'error'); }
}

let voiceRecordingTimeout = null, isHolding = false;
window.startVoiceHold = function() { if(state.isRecording) return; isHolding=true; voiceRecordingTimeout = setTimeout(async()=>{ if(isHolding) await startVoiceRecording(); },200); };
window.stopVoiceHold = function() { if(voiceRecordingTimeout) clearTimeout(voiceRecordingTimeout); if(state.isRecording) stopVoiceRecording(); isHolding=false; };
window.cancelVoiceHold = function() { if(voiceRecordingTimeout) clearTimeout(voiceRecordingTimeout); if(state.isRecording) cancelVoiceRecording(); isHolding=false; };

async function startVoiceRecording() {
  if(state.voiceStream) { stopVoiceRecording(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.voiceStream = stream;
    state.voiceRecorder = new MediaRecorder(stream);
    state.voiceChunks = [];
    state.voiceRecorder.ondataavailable = (e) => { if(e.data.size>0) state.voiceChunks.push(e.data); };
    state.voiceRecorder.onstop = async () => {
      const audioBlob = new Blob(state.voiceChunks, { type: 'audio/webm' });
      const file = new File([audioBlob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
      await sendMediaMessage(file, 'voice');
      if(state.voiceStream) state.voiceStream.getTracks().forEach(t=>t.stop());
      state.voiceStream=null; state.voiceRecorder=null; state.voiceChunks=[]; state.isRecording=false;
      const ui = document.getElementById('voice-recording-ui'); if(ui) ui.remove();
      if(state.recordingTimerInterval) clearInterval(state.recordingTimerInterval);
    };
    state.voiceRecorder.start();
    state.isRecording = true;
    showRecordingUI();
    setTimeout(()=>{ if(state.isRecording && state.voiceRecorder && state.voiceRecorder.state==='recording') stopVoiceRecording(); },60000);
  } catch(e) { console.error('Recording error:', e); toast('Microphone access denied', 'error'); }
}

function stopVoiceRecording() { if(state.voiceRecorder && state.voiceRecorder.state==='recording') state.voiceRecorder.stop(); }
function cancelVoiceRecording() { if(state.voiceRecorder && state.voiceRecorder.state==='recording') state.voiceRecorder=null; if(state.voiceStream){ state.voiceStream.getTracks().forEach(t=>t.stop()); state.voiceStream=null; } state.voiceChunks=[]; state.isRecording=false; const ui=document.getElementById('voice-recording-ui'); if(ui) ui.remove(); if(state.recordingTimerInterval) clearInterval(state.recordingTimerInterval); toast('Recording cancelled', 'info'); }

function showRecordingUI() {
  let ui = document.getElementById('voice-recording-ui'); if(ui) ui.remove();
  ui = document.createElement('div'); ui.id='voice-recording-ui'; ui.className='voice-recording-ui';
  ui.innerHTML = `<div class="recording-wave"><span></span><span></span><span></span><span></span><span></span></div><span id="recording-time">Recording... 0:00</span><div style="display:flex;gap:12px;margin-left:12px;"><button onclick="sendVoiceMessage()" class="cancel-recording" style="background:var(--success);"><i class="fas fa-paper-plane"></i> Send</button><button onclick="deleteVoiceMessage()" class="cancel-recording" style="background:var(--error);"><i class="fas fa-trash"></i> Delete</button></div>`;
  document.body.appendChild(ui);
  state.recordingStartTime = Date.now();
  state.recordingTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now()-state.recordingStartTime)/1000);
    const mins = Math.floor(elapsed/60), secs = elapsed%60;
    const td = document.getElementById('recording-time');
    if(td) td.textContent = `Recording... ${mins}:${secs.toString().padStart(2,'0')}`;
  },1000);
}

window.sendVoiceMessage = async function() { if(state.voiceRecorder && state.voiceRecorder.state==='recording') stopVoiceRecording(); toast('Voice message sent!', 'success'); };
window.deleteVoiceMessage = function() { cancelVoiceRecording(); toast('Voice message deleted', 'info'); };

let cameraStream = null;
window.openRealCamera = async function() {
  const modal = document.createElement('div'); modal.className='camera-modal';
  modal.innerHTML = `<div class="camera-container"><video id="camera-preview" autoplay playsinline></video><div class="camera-controls"><button onclick="capturePhoto()" class="capture-btn"><i class="fas fa-camera"></i></button><button onclick="switchCamera()" class="switch-camera-btn"><i class="fas fa-sync-alt"></i></button><button onclick="closeCamera()" class="close-camera-btn"><i class="fas fa-times"></i></button></div></div>`;
  document.body.appendChild(modal);
  let facingMode='environment';
  try { cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode:{ exact:facingMode } }, audio:false }); const v = document.getElementById('camera-preview'); if(v) v.srcObject = cameraStream; }
  catch(e) { try { cameraStream = await navigator.mediaDevices.getUserMedia({ video:true }); const v = document.getElementById('camera-preview'); if(v) v.srcObject = cameraStream; } catch(err){ toast('Camera access denied', 'error'); modal.remove(); } }
  window.switchCamera = async function() { facingMode = facingMode==='environment'?'user':'environment'; if(cameraStream) cameraStream.getTracks().forEach(t=>t.stop()); try { cameraStream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ exact:facingMode } } }); const v = document.getElementById('camera-preview'); if(v) v.srcObject = cameraStream; } catch(e){ try { cameraStream = await navigator.mediaDevices.getUserMedia({ video:true }); const v = document.getElementById('camera-preview'); if(v) v.srcObject = cameraStream; } catch(err){} } };
  window.capturePhoto = function() { const video = document.getElementById('camera-preview'); if(!video) return; const canvas = document.createElement('canvas'); canvas.width=video.videoWidth; canvas.height=video.videoHeight; const ctx=canvas.getContext('2d'); ctx.drawImage(video,0,0,canvas.width,canvas.height); canvas.toBlob(async (blob)=>{ const file = new File([blob],`camera_${Date.now()}.jpg`,{type:'image/jpeg'}); await sendMediaMessage(file,'image'); closeCamera(); },'image/jpeg',0.9); };
  window.closeCamera = function() { if(cameraStream){ cameraStream.getTracks().forEach(t=>t.stop()); cameraStream=null; } modal.remove(); };
};

// ===== MESSAGE ACTIONS =====
window.showReplyUI = function(msgId,text,name) {
  state.replyingTo = { id: msgId, text, name };
  const existing = document.getElementById('reply-indicator'); if(existing) existing.remove();
  const indicator = document.createElement('div'); indicator.id='reply-indicator'; indicator.className='reply-indicator';
  indicator.innerHTML = `<div class="reply-info"><i class="fas fa-reply"></i><span>Replying to ${escapeHtml(name)}: "${escapeHtml(text.substring(0,50))}"</span></div><button class="cancel-reply" onclick="cancelReply()"><i class="fas fa-times"></i></button>`;
  const inputBar = document.getElementById('input-bar');
  if(inputBar && inputBar.parentNode) inputBar.parentNode.insertBefore(indicator, inputBar);
  closeAllMenus();
};
window.cancelReply = function() { state.replyingTo = null; const ri=document.getElementById('reply-indicator'); if(ri) ri.remove(); };
window.copyMessage = async function(text) { try{ await navigator.clipboard.writeText(text); toast('Message copied to clipboard','success'); } catch(e){ toast('Failed to copy','error'); } closeAllMenus(); };
window.forwardMessage = function(msgId,text) {
  const modal = document.createElement('div'); modal.className='forward-modal';
  modal.innerHTML = `<div class="forward-card"><h3>Forward to...</h3><div class="forward-list">${state.contacts.map(chat=>`<div class="forward-item" onclick="sendForwardMessage('${msgId}','${text.replace(/'/g,"\\'")}','${chat.id}')"><div class="forward-avatar">${getOtherName(chat).charAt(0).toUpperCase()}</div><div class="forward-name">${getOtherName(chat)}</div></div>`).join('')}${!state.contacts.length?'<div style="padding:20px;text-align:center">No contacts available</div>':''}</div><button class="close-modal" onclick="this.closest(\'.forward-modal\').remove()">Cancel</button></div>`;
  document.body.appendChild(modal); closeAllMenus();
};
window.sendForwardMessage = async function(msgId,text,targetChatId) {
  const { db, collection, addDoc, serverTimestamp } = FB();
  try { await addDoc(collection(db, 'chats', targetChatId, 'messages'), { text: `📨 Forwarded: ${text}`, uid: state.user.uid, name: state.user.displayName || state.user.email || 'User', ts: serverTimestamp(), isForwarded: true }); toast('Message forwarded!', 'success'); document.querySelector('.forward-modal')?.remove(); }
  catch(e) { toast('Failed to forward', 'error'); }
};
window.editMessage = async function(msgId) {
  const msg = state.messages.find(m=>m.id===msgId);
  if(!msg) return;
  if(msg.uid !== state.user.uid) { toast('You can only edit your own messages', 'error'); return; }
  const { value: newText } = await Swal.fire({ title:'Edit message', input:'text', inputValue:msg.text, showCancelButton:true, confirmButtonText:'Save', cancelButtonText:'Cancel', background:'var(--card)', color:'var(--text-primary)' });
  if(!newText || newText===msg.text) return;
  const { db, doc, updateDoc } = FB();
  try { await updateDoc(doc(db, 'chats', state.currentChatId, 'messages', msgId), { text: newText, edited: true, editedAt: new Date() }); toast('Message edited', 'success'); } catch(e){ toast('Failed to edit message', 'error'); }
  closeAllMenus();
};
window.starMessage = async function(msgId) {
  if(!state.currentChatId) { toast('No chat selected', 'error'); return; }
  const { db, doc, updateDoc } = FB();
  try { const msg = state.messages.find(m=>m.id===msgId); const newStarred = !(msg?.starred===true); await updateDoc(doc(db, 'chats', state.currentChatId, 'messages', msgId), { starred: newStarred }); toast(newStarred?'⭐ Message starred!':'⭐ Message unstarred!','success'); renderMessages(state.messages,false); } catch(e){ console.error('Error starring message:',e); toast('Failed to star message','error'); }
  closeAllMenus();
};
window.pinMessage = async function(msgId) {
  if(!state.currentChatId) { toast('No chat selected', 'error'); return; }
  const { db, doc, updateDoc } = FB();
  try { const msg = state.messages.find(m=>m.id===msgId); const newPinned = !(msg?.pinned===true); await updateDoc(doc(db, 'chats', state.currentChatId, 'messages', msgId), { pinned: newPinned }); toast(newPinned?'📌 Message pinned!':'📌 Message unpinned!','success'); renderMessages(state.messages,false); } catch(e){ console.error('Error pinning message:',e); toast('Failed to pin message','error'); }
  closeAllMenus();
};
window.deleteMessage = async function(msgId) {
  const result = await Swal.fire({ title:'Delete message?', text:'This action cannot be undone', icon:'warning', showCancelButton:true, confirmButtonText:'Delete', cancelButtonText:'Cancel', background:'var(--card)', color:'var(--text-primary)' });
  if(!result.isConfirmed) return;
  if(!state.currentChatId) { toast('No chat selected','error'); return; }
  const { db, doc, deleteDoc } = FB();
  try { await deleteDoc(doc(db, 'chats', state.currentChatId, 'messages', msgId)); toast('Message deleted','success'); } catch(e){ console.error('Error deleting message:',e); toast('Failed to delete message','error'); }
  closeAllMenus();
};
window.reactMsg = async function(msgId, reaction) {
  if(!state.currentChatId) return;
  const { db, doc, updateDoc } = FB();
  try { const msg = state.messages.find(m=>m.id===msgId); const currentReaction = msg?.reaction; const newReaction = currentReaction===reaction ? null : reaction; await updateDoc(doc(db, 'chats', state.currentChatId, 'messages', msgId), { reaction: newReaction }); toast(newReaction?`Reacted with ${reaction}`:'Reaction removed','success'); renderMessages(state.messages,false); } catch(e){ console.error('Error adding reaction:',e); }
  closeAllMenus();
};

// ===== SELECT MESSAGES =====
window.selectMessageForBulk = function(msgId, event) {
  if(event.ctrlKey || event.metaKey) {
    event.stopPropagation();
    if(state.selectedMessages.includes(msgId)) state.selectedMessages = state.selectedMessages.filter(id=>id!==msgId);
    else state.selectedMessages.push(msgId);
    renderMessages(state.messages,false);
    if(state.selectedMessages.length>0) showBulkActionBar(); else hideBulkActionBar();
  }
};
function showBulkActionBar() {
  let bar = document.getElementById('bulk-action-bar');
  if(!bar) { bar = document.createElement('div'); bar.id='bulk-action-bar'; bar.className='bulk-action-bar'; const cw=document.getElementById('chat-window'); if(cw) cw.appendChild(bar); }
  bar.innerHTML = `<div class="bulk-info">${state.selectedMessages.length} selected</div><div class="bulk-actions"><button onclick="bulkDeleteMessages()"><i class="fas fa-trash"></i> Delete</button><button onclick="bulkStarMessages()"><i class="fas fa-star"></i> Star</button><button onclick="clearMessageSelection()"><i class="fas fa-times"></i> Clear</button></div>`;
  bar.style.display='flex';
}
function hideBulkActionBar() { const bar=document.getElementById('bulk-action-bar'); if(bar) bar.style.display='none'; }
window.clearMessageSelection = function() { state.selectedMessages=[]; renderMessages(state.messages,false); hideBulkActionBar(); };
window.bulkDeleteMessages = async function() {
  const result = await Swal.fire({ title:`Delete ${state.selectedMessages.length} messages?`, text:'This action cannot be undone', icon:'warning', showCancelButton:true, confirmButtonText:'Delete', cancelButtonText:'Cancel', background:'var(--card)', color:'var(--text-primary)' });
  if(!result.isConfirmed) return;
  const { db, doc, deleteDoc } = FB();
  for(const msgId of state.selectedMessages) try{ await deleteDoc(doc(db, 'chats', state.currentChatId, 'messages', msgId)); } catch(e){}
  toast(`${state.selectedMessages.length} messages deleted`,'success'); clearMessageSelection();
};
window.bulkStarMessages = async function() {
  const { db, doc, updateDoc } = FB();
  for(const msgId of state.selectedMessages) try{ await updateDoc(doc(db, 'chats', state.currentChatId, 'messages', msgId), { starred: true }); } catch(e){}
  toast(`${state.selectedMessages.length} messages starred`,'success'); clearMessageSelection();
};

window.toggleChatSearch = function() {
  const s = document.getElementById('in-chat-search');
  if(!s) return;
  if(s.style.display==='none'||!s.style.display) { s.style.display='block'; if(!document.getElementById('in-chat-search-input')) s.innerHTML = `<div class="search-bar"><i class="fas fa-search"></i><input type="text" id="in-chat-search-input" placeholder="Search in conversation..." oninput="searchInChat()"><button onclick="closeChatSearch()" style="background:none;border:none;color:var(--text-secondary);cursor:pointer"><i class="fas fa-times"></i></button></div>`; }
  else { s.style.display='none'; state.isSearching=false; renderMessages(state.messages,false); }
};
window.closeChatSearch = function() { const s=document.getElementById('in-chat-search'); if(s) s.style.display='none'; state.isSearching=false; renderMessages(state.messages,false); };
window.searchInChat = function() { const input=document.getElementById('in-chat-search-input'); const term=input?.value.toLowerCase(); state.isSearching=!!term; renderMessages(state.messages,false); };

const EMOJIS = ['😀','😂','😍','🥰','😎','🤩','😇','🥳','😜','🤗','😭','😱','🤔','😴','🤑','😡','🥺','😷','🤒','😈','👍','👎','❤️','🔥','✨','🎉','🙌','💪','🫶','👏','🙏','💯','🚀','🌟','💡','🎯','🏆','💎','🌈','⚡','🍕','🍔','🍣','☕','🍰','🎂','🎁','🎵','📱','💻'];
window.toggleEmojiPicker = function() { const ep=document.getElementById('emoji-picker'); if(!ep) return; if(ep.style.display==='none'||!ep.style.display){ ep.innerHTML=`<div class="emoji-grid">${EMOJIS.map(e=>`<button class="emoji-btn" onclick="insertEmoji('${e}')">${e}</button>`).join('')}</div>`; ep.style.display='block'; } else ep.style.display='none'; };
window.insertEmoji = function(e) { const input=document.getElementById('msg-input'); if(!input) return; const start=input.selectionStart,end=input.selectionEnd,text=input.value; input.value=text.substring(0,start)+e+text.substring(end); input.selectionStart=input.selectionEnd=start+e.length; const ep=document.getElementById('emoji-picker'); if(ep) ep.style.display='none'; input.focus(); updateSendBtn(); autoResize(input); };

window.togglePlusMenu = function() { const pm=document.getElementById('plus-menu'); if(!pm) return; if(pm.style.display==='none'||!pm.style.display) pm.style.display='block'; else pm.style.display='none'; };
window.pickMedia = function() { const input=document.createElement('input'); input.type='file'; input.accept='image/*,video/*'; input.multiple=true; input.onchange=async(e)=>{ const files=Array.from(e.target.files); for(const file of files) await sendMediaMessage(file,file.type.startsWith('image/')?'image':'video'); }; input.click(); const pm=document.getElementById('plus-menu'); if(pm) pm.style.display='none'; };
window.captureCamera = function() { openRealCamera(); const pm=document.getElementById('plus-menu'); if(pm) pm.style.display='none'; };
window.uploadDocument = function() { const input=document.createElement('input'); input.type='file'; input.accept='.pdf,.doc,.docx,.txt,.xls,.xlsx,.ppt,.pptx,.zip,.rar'; input.onchange=async(e)=>{ if(e.target.files[0]) await sendMediaMessage(e.target.files[0],'file'); }; input.click(); const pm=document.getElementById('plus-menu'); if(pm) pm.style.display='none'; };
window.recordAudio = function() { startVoiceRecording(); const pm=document.getElementById('plus-menu'); if(pm) pm.style.display='none'; };
window.shareContact = async function() { const modal=document.createElement('div'); modal.className='forward-modal'; modal.innerHTML=`<div class="forward-card"><h3>Share Contact</h3><div class="forward-list">${state.contacts.map(chat=>`<div class="forward-item" onclick="sendContactCard('${chat.id}','${getOtherName(chat)}')"><div class="forward-avatar">${getOtherName(chat).charAt(0)}</div><div class="forward-name">${getOtherName(chat)}</div></div>`).join('')}</div><button class="close-modal" onclick="this.closest('.forward-modal').remove()">Cancel</button></div>`; document.body.appendChild(modal); const pm=document.getElementById('plus-menu'); if(pm) pm.style.display='none'; };
window.sendContactCard = async function(chatId,contactName) { const { db, collection, addDoc, serverTimestamp, doc, updateDoc, increment } = FB(); await addDoc(collection(db, 'chats', state.currentChatId, 'messages'), { text: '', contactCard: { name: contactName, userId: chatId }, uid: state.user.uid, name: state.user.displayName || state.user.email || 'User', ts: serverTimestamp(), type: 'contact' }); await updateDoc(doc(db, 'chats', state.currentChatId), { lastMsg: `👤 Shared contact: ${contactName}`, lastMsgTime: Date.now(), unreadCount: increment(1) }); toast('Contact shared!','success'); document.querySelector('.forward-modal')?.remove(); };
window.createPoll = async function() {
  const { value: fv } = await Swal.fire({ title:'Create a Poll', html:`<input id="poll-question" class="swal2-input" placeholder="Poll question"><div id="poll-options-container"><input id="poll-opt-0" class="swal2-input" placeholder="Option 1"><input id="poll-opt-1" class="swal2-input" placeholder="Option 2"></div><button type="button" id="add-option-btn" class="swal2-button" style="background:var(--primary);color:white;padding:8px 16px;border-radius:8px;border:none;cursor:pointer;margin-top:8px;">+ Add Option</button>`, focusConfirm:false, showCancelButton:true, confirmButtonText:'Create Poll', cancelButtonText:'Cancel', background:'var(--card)', color:'var(--text-primary)', didOpen:()=>{ let oc=2; document.getElementById('add-option-btn').onclick=()=>{ if(oc<10){ const c=document.getElementById('poll-options-container'); const i=document.createElement('input'); i.id=`poll-opt-${oc}`; i.className='swal2-input'; i.placeholder=`Option ${oc+1}`; c.appendChild(i); oc++; } else toast('Maximum 10 options allowed','error'); }; }, preConfirm:()=>{ const q=document.getElementById('poll-question').value; const opts=[]; for(let i=0;i<10;i++){ const o=document.getElementById(`poll-opt-${i}`); if(o&&o.value.trim()) opts.push(o.value.trim()); } if(!q){ Swal.showValidationMessage('Please enter a question'); return false; } if(opts.length<2){ Swal.showValidationMessage('Please add at least 2 options'); return false; } return { question:q, options:opts }; } });
  if(fv){ const { db, collection, addDoc, serverTimestamp, doc, updateDoc, increment } = FB(); await addDoc(collection(db, 'chats', state.currentChatId, 'messages'), { text: '', poll: { question: fv.question, options: fv.options, votes: {}, totalVotes: 0, createdBy: state.user.uid, createdAt: Date.now() }, uid: state.user.uid, name: state.user.displayName || state.user.email || 'User', ts: serverTimestamp(), type: 'poll' }); await updateDoc(doc(db, 'chats', state.currentChatId), { lastMsg: `📊 Poll: ${fv.question}`, lastMsgTime: Date.now(), unreadCount: increment(1) }); toast('Poll created!','success'); }
  const pm=document.getElementById('plus-menu'); if(pm) pm.style.display='none';
};
window.createNewEvent = async function() {
  const { value: fv } = await Swal.fire({ title:'Create an Event', html:`<input id="event-title" class="swal2-input" placeholder="Event title"><input id="event-date" class="swal2-input" type="date" placeholder="Date"><input id="event-time" class="swal2-input" type="time" placeholder="Time"><input id="event-location" class="swal2-input" placeholder="Location">`, focusConfirm:false, showCancelButton:true, confirmButtonText:'Create Event', cancelButtonText:'Cancel', background:'var(--card)', color:'var(--text-primary)', preConfirm:()=>{ const t=document.getElementById('event-title').value, d=document.getElementById('event-date').value, tm=document.getElementById('event-time').value, l=document.getElementById('event-location').value; if(!t){ Swal.showValidationMessage('Please enter an event title'); return false; } if(!d){ Swal.showValidationMessage('Please select a date'); return false; } if(!tm){ Swal.showValidationMessage('Please select a time'); return false; } return { title:t, date:d, time:tm, location:l||'TBD' }; } });
  if(fv){ const { db, collection, addDoc, serverTimestamp, doc, updateDoc, increment } = FB(); await addDoc(collection(db, 'chats', state.currentChatId, 'messages'), { text: '', event: { id: Date.now().toString(), title: fv.title, date: fv.date, time: fv.time, location: fv.location, attendees: [], createdBy: state.user.uid, createdAt: Date.now() }, uid: state.user.uid, name: state.user.displayName || state.user.email || 'User', ts: serverTimestamp(), type: 'event' }); await updateDoc(doc(db, 'chats', state.currentChatId), { lastMsg: `📅 Event: ${fv.title}`, lastMsgTime: Date.now(), unreadCount: increment(1) }); toast('Event created!','success'); }
  const pm=document.getElementById('plus-menu'); if(pm) pm.style.display='none';
};
window.pickSticker = function() {
  const stickers=['😀','😂','🥰','😎','🔥','✨','❤️','💯','🚀','🎉','🙌','💪','🫶','👏','🎈','🍕','🍔','🍦','☕','🐱','🐶','🦄','⭐','🌈','⚡'];
  const modal=document.createElement('div'); modal.className='forward-modal'; modal.innerHTML=`<div class="forward-card"><h3>Choose a Sticker</h3><div class="sticker-grid">${stickers.map(s=>`<div class="sticker-item" onclick="sendSticker('${s}')">${s}</div>`).join('')}</div><button class="close-modal" onclick="this.closest('.forward-modal').remove()">Cancel</button></div>`;
  document.body.appendChild(modal); const pm=document.getElementById('plus-menu'); if(pm) pm.style.display='none';
};
window.sendSticker = async function(sticker) { const { db, collection, addDoc, serverTimestamp, doc, updateDoc, increment } = FB(); await addDoc(collection(db, 'chats', state.currentChatId, 'messages'), { text: sticker, uid: state.user.uid, name: state.user.displayName || state.user.email || 'User', ts: serverTimestamp(), type: 'sticker' }); await updateDoc(doc(db, 'chats', state.currentChatId), { lastMsg: `Sticker: ${sticker}`, lastMsgTime: Date.now(), unreadCount: increment(1) }); toast('Sticker sent!','success'); document.querySelector('.forward-modal')?.remove(); };

window.showChatContextMenu = function(e, chatId) { e.preventDefault(); e.stopPropagation(); closeAllMenus(); const menu=document.getElementById('ctx-menu'); if(!menu) return; menu.innerHTML=`<div class="dropdown-item" onclick="showContactInfo()"><i class="fas fa-user"></i>Contact info</div><div class="dropdown-item" onclick="toggleChatSearch()"><i class="fas fa-search"></i>Search</div><div class="dropdown-item" onclick="toggleSelectMode()"><i class="fas fa-check-square"></i>Select messages</div><div class="dropdown-item" onclick="muteChat()"><i class="fas fa-bell-slash"></i>Mute notifications</div><div class="dropdown-item" onclick="toggleDisappearingMessages()"><i class="fas fa-clock"></i>Disappearing messages</div><div class="dropdown-item" onclick="addToFavorites()"><i class="fas fa-heart"></i>Add to favourites</div><div class="dropdown-divider"></div><div class="dropdown-item" onclick="closeChat()"><i class="fas fa-times"></i>Close chat</div><div class="dropdown-item" onclick="reportChat()"><i class="fas fa-flag"></i>Report</div><div class="dropdown-item" onclick="blockUser()"><i class="fas fa-ban"></i>Block</div><div class="dropdown-item" onclick="clearChat()"><i class="fas fa-eraser"></i>Clear chat</div><div class="dropdown-item" style="color:var(--error)" onclick="deleteChat()"><i class="fas fa-trash" style="color:var(--error)"></i>Delete chat</div>`; menu.style.left=Math.min(e.clientX,window.innerWidth-220)+'px'; menu.style.top=Math.min(e.clientY,window.innerHeight-350)+'px'; menu.style.display='block'; };
window.showContactInfo = async function() { if(!state.currentContact){ toast('No contact selected','error'); return; } const { db, doc, getDoc } = FB(); const userRef=doc(db,'users',state.currentContact.id); const userSnap=await getDoc(userRef); const userData=userSnap.data()||{}; const modal=document.createElement('div'); modal.className='contact-info-modal'; modal.innerHTML=`<div class="contact-info-card"><div class="contact-avatar-large">${state.currentContact.name.charAt(0).toUpperCase()}</div><h3>${escapeHtml(state.currentContact.name)}</h3><p style="color:var(--text-secondary);font-size:13px;margin:4px 0;">@${escapeHtml(userData.username||'')}</p><p style="color:var(--text-secondary);font-size:12px;margin:4px 0;">${escapeHtml(userData.email||'')}</p><p style="color:var(--text-secondary);font-size:12px;margin:4px 0;">${escapeHtml(userData.phone||'No phone number')}</p><p style="color:var(--text-secondary);font-size:12px;margin:8px 0;">${escapeHtml(userData.about||'Hey there! I am using Booli.')}</p><div class="contact-info-actions"><button onclick="startCall('audio'); this.closest('.contact-info-modal').remove();"><i class="fas fa-phone"></i> Audio</button><button onclick="startCall('video'); this.closest('.contact-info-modal').remove();"><i class="fas fa-video"></i> Video</button></div><button class="close-modal" onclick="this.closest('.contact-info-modal').remove()">Close</button></div>`; document.body.appendChild(modal); closeAllMenus(); };
window.toggleSelectMode = function() { state.bulkSelectMode=!state.bulkSelectMode; if(state.bulkSelectMode) toast('Selection mode active. Click on messages while holding Ctrl/Cmd to select','info'); else { clearMessageSelection(); toast('Selection mode disabled','info'); } closeAllMenus(); };
window.muteChat = async function() { if(!state.currentChatId){ toast('No chat selected','error'); return; } const { value: dur } = await Swal.fire({ title:'Mute Notifications', text:'Choose how long to mute this chat', input:'select', inputOptions:{ '3600':'1 hour', '28800':'8 hours', '86400':'24 hours', '604800':'1 week', '0':'Until I unmute' }, inputPlaceholder:'Select duration', showCancelButton:true, confirmButtonText:'Mute', cancelButtonText:'Cancel', background:'var(--card)', color:'var(--text-primary)' }); if(dur!==undefined){ const { db, doc, updateDoc } = FB(); try{ const mutedUntil = dur==='0'?null:Date.now()+(parseInt(dur)*1000); await updateDoc(doc(db,'chats',state.currentChatId),{ mutedUntil }); toast(dur==='0'?'Chat muted until unmuted':'Chat muted','success'); renderChatList(state.contacts); } catch(e){ toast('Failed to mute chat','error'); } } closeAllMenus(); };
window.toggleDisappearingMessages = async function() { const cur = localStorage.getItem(`disappear_${state.currentChatId}`)||'0'; const { value: sec } = await Swal.fire({ title:'Disappearing Messages', text:'Messages will disappear after the selected time', input:'select', inputOptions:{ '0':'Off', '5':'5 seconds', '30':'30 seconds', '60':'1 minute', '300':'5 minutes', '3600':'1 hour' }, inputValue:cur, showCancelButton:true, confirmButtonText:'Save', cancelButtonText:'Cancel', background:'var(--card)', color:'var(--text-primary)' }); if(sec!==undefined){ if(sec==='0'){ localStorage.removeItem(`disappear_${state.currentChatId}`); toast('Disappearing messages disabled','success'); } else{ localStorage.setItem(`disappear_${state.currentChatId}`,sec); toast(`Messages will disappear after ${sec} seconds`,'success'); } } closeAllMenus(); };
window.addToFavorites = async function() { if(!state.currentChatId){ toast('No chat selected','error'); return; } const { db, doc, updateDoc } = FB(); try{ const chat = state.contacts.find(c=>c.id===state.currentChatId); const isFav = chat?.favorite===true; await updateDoc(doc(db,'chats',state.currentChatId),{ favorite: !isFav }); toast(isFav?'Removed from favorites':'Added to favorites','success'); renderChatList(state.contacts); } catch(e){ toast('Failed to update favorites','error'); } closeAllMenus(); };
window.closeChat = function() { state.currentChatId=null; state.currentContact=null; const ws=document.getElementById('welcome-screen'); const cw=document.getElementById('chat-window'); if(ws) ws.style.display='flex'; if(cw) cw.style.display='none'; closeAllMenus(); };
window.reportChat = async function() { const { value: reason } = await Swal.fire({ title:'Report Chat', text:'Please describe why you are reporting this chat', input:'textarea', inputPlaceholder:'Spam, harassment, etc.', showCancelButton:true, confirmButtonText:'Report', cancelButtonText:'Cancel', background:'var(--card)', color:'var(--text-primary)' }); if(reason){ try{ const { db, collection, addDoc, serverTimestamp } = FB(); await addDoc(collection(db,'reports'),{ chatId:state.currentChatId, reportedBy:state.user.uid, reportedUser:state.currentContact?.id, reason, reportedAt:serverTimestamp() }); toast('Report sent to admin. Thank you for helping keep Booli safe!','success'); } catch(e){ console.error('Report error:',e); toast('Failed to send report','error'); } } closeAllMenus(); };
window.blockUser = async function() { if(!state.currentContact) return; const { db, doc, updateDoc, arrayUnion, arrayRemove } = FB(); const userRef=doc(db,'users',state.user.uid); try{ const isBlocked = state.blockedUsers.includes(state.currentContact.id); if(isBlocked){ const res=await Swal.fire({ title:'Unblock User', text:`Unblock ${state.currentContact.name}? They will be able to message you again.`, icon:'question', showCancelButton:true, confirmButtonText:'Unblock', cancelButtonText:'Cancel', background:'var(--card)', color:'var(--text-primary)' }); if(res.isConfirmed){ await updateDoc(userRef,{ blockedUsers: arrayRemove(state.currentContact.id) }); state.blockedUsers=state.blockedUsers.filter(id=>id!==state.currentContact.id); toast(`${state.currentContact.name} has been unblocked`,'success'); loadContacts(); } } else { const res=await Swal.fire({ title:'Block User', text:`Block ${state.currentContact.name}? You will no longer receive messages from them.`, icon:'warning', showCancelButton:true, confirmButtonText:'Block', cancelButtonText:'Cancel', background:'var(--card)', color:'var(--text-primary)' }); if(res.isConfirmed){ await updateDoc(userRef,{ blockedUsers: arrayUnion(state.currentContact.id) }); state.blockedUsers.push(state.currentContact.id); toast(`${state.currentContact.name} has been blocked`,'success'); closeChat(); loadContacts(); } } } catch(e){ console.error('Block error:',e); toast('Failed to update block status','error'); } closeAllMenus(); };
window.clearChat = async function() { if(!state.currentChatId) return; const res=await Swal.fire({ title:'Clear Chat', text:'Clear all messages in this chat? This cannot be undone.', icon:'warning', showCancelButton:true, confirmButtonText:'Clear', cancelButtonText:'Cancel', background:'var(--card)', color:'var(--text-primary)' }); if(!res.isConfirmed) return; const { db, collection, getDocs, deleteDoc } = FB(); const msgsRef=collection(db,'chats',state.currentChatId,'messages'); const snap=await getDocs(msgsRef); let d=0; for(const doc of snap.docs){ await deleteDoc(doc.ref); d++; } toast(`Cleared ${d} messages`,'success'); closeAllMenus(); };
window.deleteChat = async function() { if(!state.currentChatId) return; const res=await Swal.fire({ title:'Delete Chat', text:'Delete this chat permanently? This cannot be undone.', icon:'warning', showCancelButton:true, confirmButtonText:'Delete', cancelButtonText:'Cancel', background:'var(--card)', color:'var(--text-primary)' }); if(!res.isConfirmed) return; const { db, deleteDoc, doc } = FB(); try{ await deleteDoc(doc(db,'chats',state.currentChatId)); toast('Chat deleted','success'); closeChat(); loadContacts(); } catch(e){ toast('Failed to delete chat','error'); } closeAllMenus(); };
window.showMsgContextMenu = function(e, msgId, text) { e.preventDefault(); e.stopPropagation(); closeAllMenus(); const menu=document.getElementById('ctx-menu'); if(!menu) return; const msg=state.messages.find(m=>m.id===msgId); const isStarred=msg?.starred===true, isPinned=msg?.pinned===true, isOwn=msg?.uid===state.user.uid; menu.innerHTML=`<div class="reaction-row">${['❤️','😂','😮','😢','😡','👍'].map(r=>`<button class="reaction-btn-small" onclick="reactMsg('${msgId}','${r}')">${r}</button>`).join('')}</div><div class="dropdown-item" onclick="showReplyUI('${msgId}', '${text.replace(/'/g,"\\'")}', '${state.user?.displayName||'User'}')"><i class="fas fa-reply"></i>Reply</div>${isOwn?`<div class="dropdown-item" onclick="editMessage('${msgId}')"><i class="fas fa-edit"></i>Edit</div>`:''}<div class="dropdown-item" onclick="copyMessage('${text.replace(/'/g,"\\'")}')"><i class="fas fa-copy"></i>Copy</div><div class="dropdown-item" onclick="forwardMessage('${msgId}', '${text.replace(/'/g,"\\'")}')"><i class="fas fa-share"></i>Forward</div><div class="dropdown-item" onclick="pinMessage('${msgId}')"><i class="fas fa-thumbtack"></i>${isPinned?'Unpin':'Pin'}</div><div class="dropdown-item" onclick="starMessage('${msgId}')"><i class="fas ${isStarred?'fa-star':'fa-star-o'}"></i>${isStarred?'Unstar':'Star'}</div><div class="dropdown-divider"></div><div class="dropdown-item" onclick="addMessageToNote('${msgId}')"><i class="fas fa-sticky-note"></i>Add to notes</div><div class="dropdown-divider"></div><div class="dropdown-item" style="color:var(--error)" onclick="deleteMessage('${msgId}')"><i class="fas fa-trash" style="color:var(--error)"></i>Delete</div>`; menu.style.left=Math.min(e.clientX,window.innerWidth-220)+'px'; menu.style.top=Math.min(e.clientY,window.innerHeight-450)+'px'; menu.style.display='block'; };
window.addMessageToNote = function(msgId) { const msg=state.messages.find(m=>m.id===msgId); if(!msg||!msg.text){ toast('No text to add to notes','error'); return; } let notes=JSON.parse(localStorage.getItem('booli-notes')||'[]'); notes.unshift({ text:msg.text, done:false, id:Date.now(), fromChat:state.currentContact?.name||'Unknown', createdAt:new Date().toISOString() }); localStorage.setItem('booli-notes',JSON.stringify(notes)); toast('Added to notes!','success'); closeAllMenus(); };
window.markAllAsRead = async function() { const { db, doc, updateDoc } = FB(); for(const chat of state.contacts){ if(chat.unreadCount>0){ try{ await updateDoc(doc(db,'chats',chat.id),{ unreadCount:0 }); } catch(e){} } } toast('All messages marked as read','success'); closeAllMenus(); };
window.openStarredMessages = function() { toast('Starred messages feature coming soon!','info'); closeAllMenus(); };
window.openPinnedMessages = function() { toast('Pinned messages feature coming soon!','info'); closeAllMenus(); };
window.openArchivedChats = function() { toast('Archived chats feature coming soon!','info'); closeAllMenus(); };
window.startCall = function(type) { if(window.callManager && window.callManager.startCall){ if(!state.currentContact){ toast("Select a contact first","error"); return; } if(state.blockedUsers.includes(state.currentContact.id)){ toast("You cannot call a blocked user","error"); return; } window.callManager.startCall(state.currentContact.id,state.currentContact.name,type); } else toast('Call feature initializing...','info'); closeAllMenus(); };
window.endCall = function() { if(window.callManager) window.callManager.endCall(); };
function autoResize(el) { if(!el) return; el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,120)+'px'; }
function updateSendBtn() { const input=document.getElementById('msg-input'), btn=document.getElementById('send-btn'); if(!btn) return; const v=input?.value.trim()||''; if(v){ btn.innerHTML='<i class="fas fa-paper-plane"></i>'; btn.onclick=window.sendMessage; btn.style.background='var(--primary)'; } else{ btn.innerHTML='<i class="fas fa-microphone"></i>'; btn.onclick=null; btn.style.background='var(--primary)'; } }
window.handleMsgKey = function(e) { if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); window.sendMessage(); } };

function renderCallList() {
  const list=document.getElementById('call-list'); if(!list) return;
  if(!state.user){ list.innerHTML='<div style="text-align:center;padding:40px;color:var(--text-secondary)">Please login to view call history</div>'; return; }
  const { db, collection, query, orderBy, onSnapshot } = FB();
  const callsRef=collection(db,'users',state.user.uid,'callHistory');
  const q=query(callsRef,orderBy('timestamp','desc'));
  onSnapshot(q,(snap)=>{ if(snap.empty){ list.innerHTML='<div style="text-align:center;padding:40px;color:var(--text-secondary)"><i class="fas fa-phone-slash" style="font-size:32px;margin-bottom:12px;opacity:0.4;display:block"></i>No calls yet</div>'; return; } let html=''; snap.forEach(doc=>{ const call=doc.data(); const date=new Date(call.timestamp||Date.now()); const timeStr=date.toLocaleDateString(); const durationStr=call.duration?formatDuration(call.duration):'0:00'; const isIncoming=!call.isInitiator; const iconClass=call.callType==='video'?'fa-video':'fa-phone'; const colorClass=isIncoming?'var(--success)':'var(--primary)'; html+=`<div class="chat-item" onclick="if(window.callManager && window.callManager.startCall && window.state?.currentContact) { window.startCall('${call.callType}'); } else { toast('Select a contact first', 'error'); }"><div class="chat-avatar"><i class="fas ${iconClass}" style="color:${colorClass};font-size:20px;"></i></div><div class="chat-info"><div class="chat-name">${escapeHtml(call.calleeName||'Unknown')}</div><div class="chat-last-msg"><i class="fas ${isIncoming?'fa-arrow-down':'fa-arrow-up'}" style="font-size:10px;margin-right:4px;"></i>${isIncoming?'Incoming':'Outgoing'} • ${durationStr}</div></div><div class="chat-meta"><div class="chat-time">${timeStr}</div></div></div>`; }); list.innerHTML=html; },(error)=>{ console.error('Error loading call history:',error); if(error.code==='permission-denied') list.innerHTML='<div style="text-align:center;padding:40px;color:var(--text-secondary)"><i class="fas fa-lock" style="font-size:32px;margin-bottom:12px;opacity:0.4;display:block"></i>Call history will appear after you make your first call</div>'; else list.innerHTML='<div style="text-align:center;padding:40px;color:var(--text-secondary)"><i class="fas fa-phone-slash" style="font-size:32px;margin-bottom:12px;opacity:0.4;display:block"></i>No calls yet</div>'; });
}
function formatDuration(seconds) { const m=Math.floor(seconds/60), s=seconds%60; return `${m}:${s.toString().padStart(2,'0')}`; }
function renderStatus() { const list=document.getElementById('status-list'); if(!list) return; const myName=state.user?.displayName||'Me'; list.innerHTML=`<div style="padding:14px 16px;border-bottom:1px solid var(--border)"><div style="font-size:12px;color:var(--text-secondary);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px">My Status</div><div class="status-item" style="border:none;padding:0"><div style="position:relative"><div class="status-avatar" style="border-color:var(--border);display:flex;align-items:center;justify-content:center;background:var(--card)"><div class="status-avatar-inner">${myName[0]}</div></div><div style="position:absolute;bottom:-2px;right:-2px;width:22px;height:22px;border-radius:50%;background:var(--primary);border:2px solid var(--bg);display:flex;align-items:center;justify-content:center"><i class="fas fa-plus" style="color:#fff;font-size:10px"></i></div></div><div><div class="chat-name">Add to my status</div><div class="chat-last-msg">Share text, photos, video</div></div></div></div><div style="padding:14px 16px 8px"><div style="font-size:12px;color:var(--text-secondary);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">Recent Updates</div><div style="text-align:center;padding:20px;color:var(--text-secondary)">No status updates</div></div>`; }
window.addStatus = function() { toast('Status update feature coming soon!','info'); };
function renderCommunity() { const list=document.getElementById('community-list'); if(!list) return; list.innerHTML=`<p style="font-size:14px;color:var(--text-secondary);margin-bottom:16px">Join communities to connect with people who share your interests.</p><div style="text-align:center;padding:20px;color:var(--text-secondary)">Communities coming soon!</div>`; }

const toolsData = [
  { icon:'🤖', title:'AI Smart Assistant', desc:'Intelligent AI helper', id:'ai' },
  { icon:'🌐', title:'Quick Translator', desc:'Instant translations', id:'translator' },
  { icon:'📝', title:'Note & Task Manager', desc:'Organize ideas and tasks', id:'notes' },
  { icon:'🔒', title:'File Vault', desc:'Secure encrypted storage', id:'vault' },
  { icon:'📢', title:'Broadcast Messages', desc:'Mass messages to groups', id:'broadcast' },
  { icon:'📊', title:'Analytics Dashboard', desc:'Insights & statistics', id:'analytics' },
  { icon:'🔗', title:'Integrations', desc:'Connect with other apps', id:'integrations' },
];
function renderTools() { const grid=document.getElementById('tools-grid'); if(!grid) return; grid.innerHTML=toolsData.map(t=>`<div class="tool-card" onclick="openTool('${t.id}')"><div class="tool-icon">${t.icon}</div><div style="font-weight:600;font-size:13px;margin-bottom:4px">${t.title}</div><div style="font-size:12px;color:var(--text-secondary)">${t.desc}</div></div>`).join(''); }
function renderToolsMain() { const ws=document.getElementById('welcome-screen'), cw=document.getElementById('chat-window'), main=document.getElementById('tools-main'); if(ws) ws.style.display='none'; if(cw) cw.style.display='none'; if(main){ main.style.display='block'; main.innerHTML=`<h2 style="font-size:26px;font-weight:700;margin-bottom:8px">Tools</h2><p style="color:var(--text-secondary);margin-bottom:28px">Productivity tools to supercharge your workflow</p><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px">${toolsData.map(t=>`<div class="tool-card" onclick="openTool('${t.id}')"><div class="tool-icon">${t.icon}</div><div style="font-weight:600;font-size:15px;margin-bottom:6px">${t.title}</div><div style="font-size:13px;color:var(--text-secondary)">${t.desc}</div></div>`).join('')}</div>`; } }

window.openTool = function(id) {
  const ws=document.getElementById('welcome-screen'), cw=document.getElementById('chat-window'), main=document.getElementById('tools-main');
  if(ws) ws.style.display='none'; if(cw) cw.style.display='none'; if(main) main.style.display='block';
  if(id==='notes'){
    state.tasks = JSON.parse(localStorage.getItem('booli-tasks') || '[]');
    main.innerHTML = `<div style="max-width:800px;margin:0 auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px;">
        <h3 style="font-size:24px;font-weight:700;">📝 Task Manager</h3>
        <button onclick="clearCompletedTasks()" style="padding:8px 16px;border-radius:10px;border:1px solid var(--border);background:transparent;color:var(--text-secondary);cursor:pointer;font-size:13px;"><i class="fas fa-trash-alt"></i> Clear Completed</button>
      </div>
      <div style="background:var(--card);border:1px solid var(--border);border-radius:20px;padding:20px;margin-bottom:24px;">
        <div style="display:flex;flex-direction:column;gap:12px;">
          <input class="profile-input" id="task-input" type="text" placeholder="What needs to be done?" style="font-size:16px;">
          <div style="display:flex;gap:12px;flex-wrap:wrap;">
            <select id="task-priority" class="profile-input" style="width:auto;flex:1;min-width:120px;"><option value="low">🌱 Low Priority</option><option value="medium" selected>⚡ Medium Priority</option><option value="high">🔥 High Priority</option></select>
            <input type="date" id="task-due-date" class="profile-input" style="width:auto;flex:1;min-width:140px;">
            <button class="auth-btn" onclick="addTask()" style="width:auto;padding:11px 24px;"><i class="fas fa-plus"></i> Add Task</button>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;">
        <div class="search-bar" style="flex:1;"><i class="fas fa-search"></i><input type="text" id="task-search" placeholder="Search tasks..." oninput="searchTasks()"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="task-filter-btn active" onclick="setTaskFilter('all', this)" style="padding:8px 16px;border-radius:20px;border:1.5px solid var(--border);background:transparent;color:var(--text-secondary);cursor:pointer;">📋 All</button>
          <button class="task-filter-btn" onclick="setTaskFilter('pending', this)" style="padding:8px 16px;border-radius:20px;border:1.5px solid var(--border);background:transparent;color:var(--text-secondary);cursor:pointer;">⏳ Pending</button>
          <button class="task-filter-btn" onclick="setTaskFilter('completed', this)" style="padding:8px 16px;border-radius:20px;border:1.5px solid var(--border);background:transparent;color:var(--text-secondary);cursor:pointer;">✅ Completed</button>
          <button class="task-filter-btn" onclick="setTaskFilter('important', this)" style="padding:8px 16px;border-radius:20px;border:1.5px solid var(--border);background:transparent;color:var(--text-secondary);cursor:pointer;">📌 Important</button>
        </div>
      </div>
      <div id="tasks-list"></div>
    </div>`;
    renderTasks(); checkAllReminders();
    const ti=document.getElementById('task-input'); if(ti) ti.addEventListener('keypress',(e)=>{ if(e.key==='Enter') addTask(); });
  } else if(id==='translator'){
    main.innerHTML = `<div style="max-width:500px"><h3 style="font-size:22px;font-weight:700;margin-bottom:16px">🌐 Quick Translator</h3><textarea class="profile-input" id="translate-input" rows="4" placeholder="Enter text to translate..."></textarea><div style="display:flex;gap:10px;margin-top:12px;margin-bottom:12px"><select class="profile-input" id="translate-from" style="width:50%"><option value="auto">Detect language</option><option value="en">English</option><option value="bn">Bengali</option><option value="hi">Hindi</option><option value="ar">Arabic</option><option value="es">Spanish</option><option value="fr">French</option></select><select class="profile-input" id="translate-to" style="width:50%"><option value="en">English</option><option value="bn">Bengali</option><option value="hi">Hindi</option><option value="ar">Arabic</option><option value="es">Spanish</option><option value="fr">French</option></select></div><button class="auth-btn" onclick="translateText()">Translate</button><div id="translate-result" style="margin-top:20px;padding:16px;background:var(--card);border-radius:12px;border:1px solid var(--border);display:none"></div></div>`;
  } else if(id==='ai'){
    main.innerHTML = `<div style="max-width:600px"><h3 style="font-size:22px;font-weight:700;margin-bottom:16px">🤖 AI Smart Assistant</h3><div id="ai-chat-area" style="height:400px;overflow-y:auto;background:var(--card);border:1px solid var(--border);border-radius:16px;padding:16px;margin-bottom:12px"></div><div style="display:flex;gap:10px"><input class="profile-input" id="ai-input" type="text" placeholder="Ask me anything..." onkeypress="if(event.key==='Enter') askAI()"><button class="auth-btn" style="width:auto;padding:11px 22px" onclick="askAI()">Send</button></div></div>`;
    initAIChat();
  } else { main.innerHTML = `<h3 style="font-size:22px;font-weight:700;margin-bottom:8px">${toolsData.find(t=>t.id===id)?.icon} ${toolsData.find(t=>t.id===id)?.title}</h3><p style="color:var(--text-secondary)">This tool is coming soon!</p>`; }
};

// Translator
window.translateText = async function() {
  const text=document.getElementById('translate-input')?.value.trim(), toLang=document.getElementById('translate-to')?.value, fromLang=document.getElementById('translate-from')?.value;
  const btn=document.querySelector('#tools-main .auth-btn'), resultDiv=document.getElementById('translate-result');
  if(!text){ toast('Please enter text to translate','error'); return; }
  if(btn){ const ot=btn.textContent; btn.textContent='Translating... ⏳'; btn.disabled=true; }
  if(resultDiv){ resultDiv.style.display='block'; resultDiv.innerHTML='<div style="text-align:center;padding:20px;"><i class="fas fa-spinner fa-spin"></i> Translating... Please wait</div>'; }
  try{
    let translated='';
    const url=`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${fromLang}|${toLang}`;
    const resp=await fetch(url), data=await resp.json();
    if(data && data.responseData && data.responseData.translatedText){ translated=data.responseData.translatedText; if(translated===text && text.length>3) translated=await fallbackTranslation(text,fromLang,toLang); }
    else translated=await fallbackTranslation(text,fromLang,toLang);
    if(resultDiv) resultDiv.innerHTML=`<div style="padding:12px;background:var(--hover);border-radius:12px;margin-bottom:8px;"><div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;">📝 Original:</div><div style="font-size:14px;font-weight:500;word-wrap:break-word;">${escapeHtml(text)}</div></div><div style="padding:12px;background:var(--hover);border-radius:12px;"><div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;">🌐 Translation (${toLang.toUpperCase()}):</div><div style="font-size:14px;font-weight:600;color:var(--primary);word-wrap:break-word;">${escapeHtml(translated)}</div></div><div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;"><button onclick="copyTranslation('${escapeHtml(translated).replace(/'/g,"\\'")}')" style="padding:6px 12px;border-radius:8px;border:1px solid var(--border);background:var(--card);color:var(--text-primary);cursor:pointer;font-size:12px;"><i class="fas fa-copy"></i> Copy</button><button onclick="document.getElementById('translate-input').value='${escapeHtml(translated).replace(/'/g,"\\'")}';translateText();" style="padding:6px 12px;border-radius:8px;border:1px solid var(--border);background:var(--card);color:var(--text-primary);cursor:pointer;font-size:12px;"><i class="fas fa-exchange-alt"></i> Translate This</button></div>`;
    toast('Translation complete!','success');
  } catch(e){ console.error('Translation error:',e); if(resultDiv) resultDiv.innerHTML='<div style="padding:20px;text-align:center;color:var(--error);"><i class="fas fa-exclamation-triangle" style="font-size:24px;margin-bottom:8px;display:block;"></i>Translation failed. Please check your internet connection and try again.</div>'; toast('Translation failed. Please try again.','error'); }
  finally{ if(btn){ btn.textContent='Translate'; btn.disabled=false; } }
};
async function fallbackTranslation(text,fromLang,toLang){
  try{
    const resp=await fetch('https://translate.mentality.rip/translate',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ q:text, source:fromLang==='auto'?'en':fromLang, target:toLang, format:'text' }) });
    if(resp.ok){ const data=await resp.json(); if(data && data.translatedText) return data.translatedText; }
  } catch(e){ console.log('LibreTranslate failed'); }
  const common={ 'hello':'হ্যালো','hi':'হাই','good morning':'সুপ্রভাত','good evening':'শুভ সন্ধ্যা','thank you':'ধন্যবাদ','thanks':'ধন্যবাদ','how are you':'আপনি কেমন আছেন?','i am fine':'আমি ভালো আছি','what is your name':'আপনার নাম কি?','my name is':'আমার নাম','yes':'হ্যাঁ','no':'না','ok':'ঠিক আছে','sorry':'দুঃখিত','help':'সাহায্য','love':'ভালোবাসা','friend':'বন্ধু','family':'পরিবার','home':'বাড়ি','work':'কাজ','school':'বিদ্যালয়','college':'কলেজ','university':'বিশ্ববিদ্যালয়','happy':'খুশি','sad':'দুঃখিত','good':'ভাল','bad':'খারাপ','big':'বড়','small':'ছোট','new':'নতুন','old':'পুরাতন','beautiful':'সুন্দর','handsome':'সুদর্শন','smart':'চতুর' };
  const lower=text.toLowerCase();
  if(common[lower]) return toLang==='bn'?common[lower]:Object.keys(common).find(k=>common[k]===text)||text;
  return text+" ℹ️ [Auto-translation limited. Please try shorter text or check connection.]";
}
window.copyTranslation = function(text){ navigator.clipboard.writeText(text).then(()=>toast('Translation copied to clipboard!','success')).catch(()=>toast('Failed to copy','error')); };

// AI Assistant
let aiMessages=[];
function initAIChat(){ const a=document.getElementById('ai-chat-area'); if(!a) return; aiMessages=[]; a.innerHTML='<div style="text-align:center;color:var(--text-secondary);padding:20px">Ask me anything! I\'m your AI assistant.</div>'; }
window.askAI = async function() {
  const input=document.getElementById('ai-input'), q=input?.value.trim(); if(!q) return;
  if(input) input.value=''; const area=document.getElementById('ai-chat-area'); if(!area) return;
  area.innerHTML+=`<div style="text-align:right;margin:8px 0;animation:messageAppear 0.2s ease"><span style="display:inline-block;background:var(--primary);color:white;padding:10px 14px;border-radius:18px;border-bottom-right-radius:4px;max-width:80%;word-wrap:break-word;">${escapeHtml(q)}</span></div>`;
  area.scrollTop=area.scrollHeight;
  const tid=Date.now();
  area.innerHTML+=`<div id="typing-${tid}" style="text-align:left;margin:8px 0"><span style="display:inline-block;background:var(--card);border:1px solid var(--border);padding:10px 14px;border-radius:18px;border-bottom-left-radius:4px;"><i class="fas fa-spinner fa-spin"></i> Thinking...</span></div>`;
  area.scrollTop=area.scrollHeight;
  await new Promise(r=>setTimeout(r,500+Math.random()*500));
  try{
    const ans=getSmartResponse(q);
    const td=document.getElementById(`typing-${tid}`); if(td) td.remove();
    area.innerHTML+=`<div style="text-align:left;margin:8px 0;animation:messageAppear 0.2s ease"><span style="display:inline-block;background:var(--card);border:1px solid var(--border);padding:10px 14px;border-radius:18px;border-bottom-left-radius:4px;max-width:80%;word-wrap:break-word;white-space:pre-line;">${escapeHtml(ans)}</span></div>`;
    area.scrollTop=area.scrollHeight;
    if(!area.querySelector('.suggestion-chips')){
      const chips=document.createElement('div'); chips.className='suggestion-chips'; chips.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;padding:8px;border-top:1px solid var(--border);';
      chips.innerHTML=['How to send messages?','Make a call','Edit profile','Use translator'].map(s=>`<button onclick="document.getElementById('ai-input').value='${s}';window.askAI();" style="background:var(--hover);border:none;color:var(--text-primary);padding:6px 12px;border-radius:20px;cursor:pointer;font-size:12px;">${s}</button>`).join('');
      area.appendChild(chips);
    }
  } catch(e){ const td=document.getElementById(`typing-${tid}`); if(td) td.remove(); area.innerHTML+=`<div style="text-align:left;margin:8px 0"><span style="display:inline-block;background:var(--error);color:white;padding:10px 14px;border-radius:18px;">Sorry, I'm having trouble connecting. Please try again later.</span></div>`; area.scrollTop=area.scrollHeight; }
};
function getSmartResponse(question){
  const q=question.toLowerCase().trim();
  const faqs=[
    { keywords:['hello','hi','hey','good morning','good afternoon','good evening','hola'], response:"Hello! 👋 I'm your Booli AI Assistant. How can I help you today?" },
    { keywords:['how are you','how r u','how are u','how do you do'], response:"I'm doing fantastic! 🤖 Thanks for asking. What can I assist you with today?" },
    { keywords:['thanks','thank you','thx','appreciate','grateful'], response:"You're very welcome! 😊 Is there anything else you'd like to know?" },
    { keywords:['bye','goodbye','see you','later','ciao','tata'], response:"Goodbye! 👋 Have a great day!" },
    { keywords:['message','send message','chat','text','messaging'], response:"💬 **Sending Messages:**\n\n• Type your message in the text box at the bottom of any chat\n• Press **Enter** or click the **Send** button\n• **Reply to messages** by right-clicking or long-pressing any message\n• **Edit messages** by right-clicking your own messages\n\nNeed to send media? Click the **+** button to attach photos, videos, documents, and more!" },
    { keywords:['call','voice call','audio call','video call','phone call'], response:"📞 **Making Calls:**\n\n• Open any chat with a contact\n• Click the **Phone icon** 📱 for audio calls\n• Click the **Video icon** 🎥 for video calls\n• During a call, you can **mute**, **turn camera off**, or **share screen**\n• Call history is saved in the **Calls** section" },
    { keywords:['profile','edit profile','update profile','change name','username','avatar'], response:"👤 **Profile Settings:**\n\n• Click your **avatar** in the bottom-left corner\n• Go to **Profile** section\n• You can edit: First & Last Name, Username, About/Bio, Profile Picture, Cover Photo\n• Click **Save Changes** to update" },
    { keywords:['password','reset password','forgot password','change password'], response:"🔐 **Password Help:**\n\n• On the login screen, click **Forgot Password?**\n• Enter your email, username, or phone number\n• You'll receive a password reset email\n• Follow the link to create a new password" },
    { keywords:['block','block user','blocked','unblock'], response:"🚫 **Blocking Users:**\n\n• Open a chat with the user you want to block\n• Click the **three dots** menu in the chat header\n• Select **Block**\n• Blocked users can't message or call you" },
    { keywords:['tools','translator','notes','ai assistant'], response:"🛠️ **Booli Tools:**\n\n• Click the **Tools** icon in the sidebar (wrench icon)\n\n**Available Tools:**\n• **AI Assistant** - Ask me anything! 🤖\n• **Quick Translator** - Translate between Bengali, English, and Hindi 🌐\n• **Note & Task Manager** - Organize your ideas and to-dos 📝" }
  ];
  for(const faq of faqs) for(const kw of faq.keywords) if(q.includes(kw)) return faq.response;
  return "I'm here to help! 🤖 Here are some things you can ask me:\n\n💬 **Messaging:** How to send messages, upload photos\n📞 **Calls:** Make audio/video calls, screen share\n👤 **Profile:** Edit profile, change username\n🔧 **Tools:** Use translator, notes, AI assistant\n\nWhat would you like to know more about?";
}

function renderSettings() {
  const list=document.getElementById('settings-list'); if(!list) return;
  const items=[
    { icon:'fa-briefcase', label:'Business tools', sub:'Quick replies, Labels, Catalogue', color:'#F43F5E', action:'showComingSoon()' },
    { icon:'fa-moon', label:'Theme', sub:state.theme==='dark'?'Dark mode':'Light mode', color:'#F43F5E', toggle:true },
    { icon:'fa-sliders-h', label:'General', sub:'Language, accessibility', color:'#E11D48', action:'showComingSoon()' },
    { icon:'fa-user-shield', label:'Account', sub:'Security, change number', color:'#E11D48', action:'switchSection("profile")' },
    { icon:'fa-lock', label:'Privacy', sub:'Last seen, profile photo', color:'#be123c', action:'showComingSoon()' },
    { icon:'fa-comment', label:'Chats', sub:'Theme, wallpaper, history', color:'#F43F5E', action:'showComingSoon()' },
    { icon:'fa-video', label:'Video & Voice', sub:'Call settings', color:'#ec4899', action:'showComingSoon()' },
    { icon:'fa-bell', label:'Notifications', sub:'Message, group, call tones', color:'#f59e0b', action:'showComingSoon()' },
    { icon:'fa-keyboard', label:'Keyboard shortcuts', sub:'', color:'#64748b', action:'showComingSoon()' },
    { icon:'fa-question-circle', label:'Help and feedback', sub:'', color:'#E11D48', action:"window.open('https://md-amran.github.io/Portfolio/','_blank')" },
    { icon:'fa-info-circle', label:'About', sub:'Version 2.0.0', color:'#8b5cf6', action:'showAbout()' },
    { icon:'fa-sign-out-alt', label:'Log out', sub:'', color:'#ef4444', action:'handleLogout()', danger:true },
  ];
  list.innerHTML=items.map(item=>`<div class="settings-item" onclick="${item.action||(item.toggle?'':'showComingSoon()')}"><div class="settings-icon" style="background:${item.color}22;color:${item.color}"><i class="fas ${item.icon}"></i></div><div><div class="settings-label" style="${item.danger?'color:var(--error)':''}">${item.label}</div>${item.sub?`<div class="settings-sublabel">${item.sub}</div>`:''}</div>${item.toggle?`<button class="toggle ${state.theme==='dark'?'on':''}" onclick="event.stopPropagation();toggleTheme();event.stopPropagation();" id="theme-toggle"></button>`:`<i class="fas fa-chevron-right" style="color:var(--text-secondary);font-size:12px;margin-left:auto"></i>`}</div>`).join('');
}
window.showComingSoon=function(){ toast('This feature is coming soon!','info'); };
window.showAbout=function(){ toast('Booli v2.0.0 - Next-Gen Messaging App with Voice/Video Calls','info'); };
window.toggleTheme=function(){ state.theme=state.theme==='dark'?'light':'dark'; document.documentElement.setAttribute('data-theme',state.theme); localStorage.setItem('booli-theme',state.theme); renderSettings(); };

function renderProfile() {
  const c=document.getElementById('profile-content'), u=state.user; if(!c||!u) return;
  (async()=>{
    const { db, doc, getDoc }=FB(); const userDoc=await getDoc(doc(db,'users',u.uid)); const ud=userDoc.exists()?userDoc.data():{};
    const fn=ud.firstName||'', ln=ud.lastName||'', un=ud.username||'', em=u.email||'', ph=ud.phone||'', full=ud.fullName||u.displayName||'Your Name', about=ud.about||'Hey there! I am using Booli.', av=ud.avatar||'', cv=ud.coverPhoto||'', init=full.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
    c.innerHTML=`<div style="position:relative"><div class="profile-cover" style="background: ${cv?`url(${cv}) center/cover no-repeat`:'linear-gradient(135deg, var(--primary), var(--accent))'}">${state.profileEditMode?`<label style="position:absolute;bottom:16px;right:16px;padding:8px 16px;border-radius:12px;background:rgba(0,0,0,0.6);color:white;cursor:pointer;font-size:13px;font-weight:600;backdrop-filter:blur(8px);display:flex;align-items:center;gap:8px;"><i class="fas fa-camera"></i> Change Cover<input type="file" accept="image/*" onchange="uploadCoverPhoto(event)" style="display:none;"></label>`:''}</div><div class="profile-avatar-wrap"><div class="profile-avatar-large" style="background: ${av?`url(${av}) center/cover no-repeat`:'var(--card)'}; color: ${av?'transparent':'var(--primary)'}">${av?'':init}</div>${state.profileEditMode?`<label style="position:absolute;bottom:0;right:0;width:32px;height:32px;border-radius:50%;background:var(--primary);color:white;display:flex;align-items:center;justify-content:center;cursor:pointer;"><i class="fas fa-camera" style="font-size:14px;"></i><input type="file" accept="image/*" onchange="uploadProfilePicture(event)" style="display:none;"></label>`:''}</div></div><div style="padding:56px 24px 24px"><div style="margin-bottom:20px"><label style="font-size:12px;color:var(--text-secondary);font-weight:600;text-transform:uppercase;">First Name</label><input class="profile-input" id="p-firstname" value="${escapeHtml(fn)}" ${state.profileEditMode?'':'readonly'}></div><div style="margin-bottom:20px"><label>Last Name</label><input class="profile-input" id="p-lastname" value="${escapeHtml(ln)}" ${state.profileEditMode?'':'readonly'}></div><div style="margin-bottom:20px"><label>Username</label><div style="display:flex;gap:8px;"><input class="profile-input" id="p-username" value="${escapeHtml(un)}" ${state.profileEditMode?'':'readonly'} style="flex:1">${state.profileEditMode?`<button class="icon-btn" onclick="checkUsernameAvailabilityProfile()" style="width:auto;padding:0 12px"><i class="fas fa-check"></i></button>`:''}</div><span id="profile-username-status" style="font-size:11px;margin-top:4px;display:block"></span></div><div style="margin-bottom:20px"><label>Email ${ud.verifiedEmail?'<span style="color:var(--success);font-size:11px;">✓ Verified</span>':'<span style="color:var(--warning);font-size:11px;">⚠ Not Verified</span>'}</label><input class="profile-input" value="${escapeHtml(em)}" readonly></div><div style="margin-bottom:20px"><label>Phone Number ${ud.verifiedPhone?'<span style="color:var(--success);font-size:11px;">✓ Verified</span>':(ph?'<span style="color:var(--warning);font-size:11px;">⚠ Not Verified</span>':'')}</label><input class="profile-input" id="p-phone" placeholder="+880XXXXXXXXXX" value="${escapeHtml(ph)}" ${state.profileEditMode?'':'readonly'}></div><div style="margin-bottom:20px"><label>About</label><input class="profile-input" id="p-about" placeholder="Hey there! I am using Booli." value="${escapeHtml(about)}" ${state.profileEditMode?'':'readonly'}></div>${state.profileEditMode?`<button class="auth-btn" onclick="saveProfile()">Save Changes</button>`:''}</div>`;
  })();
}
window.checkUsernameAvailabilityProfile = async function() {
  const un=document.getElementById('p-username')?.value.trim().toLowerCase(), st=document.getElementById('profile-username-status'); if(!st) return;
  if(!un){ st.innerHTML=''; return; }
  if(un.length<3){ st.innerHTML='Min 3 characters'; st.style.color='var(--error)'; return; }
  if(!/^[a-z0-9_]+$/.test(un)){ st.innerHTML='Only lowercase letters, numbers, and underscores allowed'; st.style.color='var(--error)'; return; }
  st.innerHTML='Checking...'; st.style.color='var(--warning)';
  try{
    const { db, collection, query, where, getDocs }=FB(); const q=query(collection(db,'users'),where('username','==',un)); const snap=await getDocs(q);
    let avail=true; snap.forEach(d=>{ if(d.id!==state.user.uid) avail=false; });
    if(avail){ st.innerHTML='✓ Username available'; st.style.color='var(--success)'; return true; }
    else{ st.innerHTML='✗ Username taken'; st.style.color='var(--error)'; return false; }
  } catch(e){ console.error('Error checking username:',e); st.innerHTML='Error checking username'; st.style.color='var(--error)'; return false; }
};
window.toggleProfileEdit=function(){ state.profileEditMode=!state.profileEditMode; const btn=document.getElementById('profile-edit-btn'); if(btn) btn.innerHTML=state.profileEditMode?'<i class="fas fa-times"></i>':'<i class="fas fa-edit"></i>'; renderProfile(); };
window.uploadProfilePicture=async function(e){ const f=e?.target?.files[0]; if(!f){ toast('Please select a file','error'); return; } if(!f.type.startsWith('image/')){ toast('Please select an image file','error'); return; } if(f.size>5*1024*1024){ toast('File size must be less than 5MB','error'); return; } try{ toast('Uploading profile picture...','info'); const url=await uploadToImgBB(f); const { db, doc, updateDoc }=FB(); await updateDoc(doc(db,'users',state.user.uid),{ avatar:url }); toast('Profile picture updated!','success'); renderProfile(); updateAvatar(state.user); } catch(e){ console.error('Error uploading profile picture:',e); toast('Failed to upload profile picture','error'); } };
window.uploadCoverPhoto=async function(e){ const f=e?.target?.files[0]; if(!f){ toast('Please select a file','error'); return; } if(!f.type.startsWith('image/')){ toast('Please select an image file','error'); return; } if(f.size>5*1024*1024){ toast('File size must be less than 5MB','error'); return; } try{ toast('Uploading cover photo...','info'); const url=await uploadToImgBB(f); const { db, doc, updateDoc }=FB(); await updateDoc(doc(db,'users',state.user.uid),{ coverPhoto:url }); toast('Cover photo updated!','success'); renderProfile(); } catch(e){ console.error('Error uploading cover photo:',e); toast('Failed to upload cover photo','error'); } };
async function uploadToImgBB(file){ const apiKey="b23e145cca40cba162ec4051eb6597ca"; const fd=new FormData(); fd.append("image",file); const resp=await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`,{ method:"POST", body:fd }); const data=await resp.json(); if(data.success) return data.data.url; throw new Error("ImgBB upload failed"); }
window.saveProfile=async function(){ const fn=document.getElementById('p-firstname')?.value.trim(), ln=document.getElementById('p-lastname')?.value.trim(), nu=document.getElementById('p-username')?.value.trim().toLowerCase(), ph=document.getElementById('p-phone')?.value.trim(), about=document.getElementById('p-about')?.value.trim(); if(!fn||!ln){ toast('First and last name are required','error'); return; } if(nu&&nu.length<3){ toast('Username must be at least 3 characters','error'); return; } if(nu&&!/^[a-z0-9_]+$/.test(nu)){ toast('Username can only contain lowercase letters, numbers, and underscores','error'); return; } const full=`${fn} ${ln}`; try{ if(nu&&nu!==state.user.displayName?.toLowerCase()){ const { db, collection, query, where, getDocs }=FB(); const q=query(collection(db,'users'),where('username','==',nu)); const snap=await getDocs(q); let avail=true; snap.forEach(d=>{ if(d.id!==state.user.uid) avail=false; }); if(!avail){ toast('Username already taken','error'); return; } } await FB().updateProfile(FB().auth.currentUser,{ displayName:full }); const { db, doc, updateDoc }=FB(); const upd={ firstName:fn, lastName:ln, fullName:full, about:about||'Hey there! I am using Booli.' }; if(nu) upd.username=nu; if(ph) upd.phone=ph; await updateDoc(doc(db,'users',state.user.uid),upd); state.user=FB().auth.currentUser; state.profileEditMode=false; updateAvatar(state.user); renderProfile(); toast('Profile saved!','success'); } catch(e){ console.error('Save profile error:',e); toast(e.message||'Error saving profile','error'); } };
window.showNewChatModal=function(){ const m=document.getElementById('new-chat-modal'); if(m) m.style.display='flex'; };
window.closeNewChatModal=function(){ const m=document.getElementById('new-chat-modal'); if(m) m.style.display='none'; };
window.startNewChat=async function(){ const inp=document.getElementById('new-chat-email')?.value.trim(); if(!inp) return toast('Enter an email, username, or phone number','error'); const { db, collection, getDocs, query, where, addDoc }=FB(); try{ let snap; if(/^\+?[0-9]{7,15}$/.test(inp.replace(/\s/g,''))){ const ph=inp.replace(/\s/g,''); const q=query(collection(db,'users'),where('phone','==',ph)); snap=await getDocs(q); } else if(inp.includes('@')){ const q=query(collection(db,'users'),where('email','==',inp.toLowerCase())); snap=await getDocs(q); } else{ const q=query(collection(db,'users'),where('username','==',inp.toLowerCase())); snap=await getDocs(q); } if(snap.empty){ toast('User not found. Try username, email, or phone number.','error'); return; } const other=snap.docs[0].data(); if(other.uid===state.user.uid) return toast("You can't chat with yourself",'error'); const existing=state.contacts.find(c=>c.participants&&c.participants.includes(other.uid)); if(existing){ window.closeNewChatModal(); openChat(existing.id,other.fullName||other.username||'User',other.uid); return; } const myName=state.user.displayName||state.user.email||'User', otherName=other.fullName||other.username||other.email||'User'; const pn={}; pn[state.user.uid]=myName; pn[other.uid]=otherName; const chatRef=await addDoc(collection(db,'chats'),{ participants:[state.user.uid,other.uid], participantNames:pn, lastMsg:'', lastMsgTime:Date.now(), unreadCount:0, createdAt:Date.now() }); window.closeNewChatModal(); toast(`Chat started with ${otherName}`,'success'); openChat(chatRef.id,otherName,other.uid); } catch(e){ console.error('Error starting chat:',e); toast('Error: '+(e.message||'Failed to start chat'),'error'); } };
window.toggleDropdown=function(id,event){ if(event) event.stopPropagation(); closeAllMenus(); const el=document.getElementById(id); if(el){ const vis=el.style.display==='block'; el.style.display=vis?'none':'block'; if(!vis){ setTimeout(()=>{ document.addEventListener('click',function close(e){ if(!el.contains(e.target)&&!e.target.closest(`[onclick*="${id}"]`)){ el.style.display='none'; document.removeEventListener('click',close); } }); },0); } } };
function formatTime(ts){ if(!ts) return ''; const d=new Date(ts), now=new Date(); if(d.toDateString()===now.toDateString()) return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); if(now-d<7*864e5) return d.toLocaleDateString([],{weekday:'short'}); return d.toLocaleDateString([],{month:'short',day:'numeric'}); }
function formatMsgTime(ts){ if(!ts) return ''; const ms=ts.toMillis?ts.toMillis():ts; return new Date(ms).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); }
function formatDate(ts){ if(!ts) return 'Today'; const ms=ts.toMillis?ts.toMillis():ts; const d=new Date(ms), now=new Date(); if(d.toDateString()===now.toDateString()) return 'Today'; const yest=new Date(now-864e5); if(d.toDateString()===yest.toDateString()) return 'Yesterday'; return d.toLocaleDateString([],{month:'long',day:'numeric',year:'numeric'}); }
function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>]/g,function(m){ if(m==='&') return '&amp;'; if(m==='<') return '&lt;'; if(m==='>') return '&gt;'; return m; }); }
setTimeout(()=>updateSendBtn(),1000);
window.state=state;
console.log('✅ Script loaded successfully');







// ===== COLORFUL AVATAR FUNCTION =====
const AVATAR_COLORS = [
    '#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4',
    '#ec489a', '#84cc16', '#d946ef', '#f97316', '#14b8a6',
    '#6366f1', '#ef4444', '#0ea5e9', '#a855f7', '#22c55e'
];

function getColorFromName(name) {
    if (!name) return AVATAR_COLORS[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = ((hash << 5) - hash) + name.charCodeAt(i);
        hash |= 0;
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function createColorAvatar(name, size = 40, hasImage = false) {
    if (hasImage) return null;
    const color = getColorFromName(name);
    const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size, size);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${size * 0.4}px 'Inter', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials, size / 2, size / 2);
    
    return canvas.toDataURL();
}

// Avatar render function - call this when displaying avatars
function renderAvatar(element, userName, userAvatar = null) {
    if (!element) return;
    
    if (userAvatar && userAvatar.startsWith('http')) {
        element.innerHTML = `<img src="${userAvatar}" alt="${userName}">`;
        element.style.background = 'transparent';
    } else {
        const color = getColorFromName(userName);
        const initials = userName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
        element.innerHTML = `<div class="color-avatar" style="background: ${color};">${initials}</div>`;
    }
}