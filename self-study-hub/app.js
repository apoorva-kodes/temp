/**
 * AP Study Resource Hub - Core Application Logic
 * Handles Authentication, Supabase Database & Storage Operations,
 * UI State, Filtering, and File Management.
 */

// Global Application State
const state = {
    supabase: null,
    currentUser: null,      // Auth user object
    currentProfile: null,   // Profile database record (username, etc.)
    resources: [],          // Active resources list
    activeScreen: 'auth',   // 'auth', 'username-setup', 'feed', 'add-resource', 'search', 'settings'
    searchQuery: '',
    selectedSubject: 'ALL',
    selectedTag: 'ALL',
    viewMode: 'grid',       // 'grid' or 'list'
    isDemoMode: false,      // True if Supabase keys are not configured
    demoResources: []       // Fallback local storage state
};

// Target AP Subjects list
const AP_SUBJECTS = [
    'AP Physics C: Mechanics',
    'AP Physics C: E&M',
    'AP Calculus BC',
    'AP Calculus AB',
    'AP Chemistry',
    'AP Biology',
    'AP Computer Science A',
    'AP US History',
    'AP Statistics',
    'AP Micro/Macroeconomics',
    'AP World History',
    'AP Environmental Science'
];

// Allowed File Extensions and Max Size (25MB)
const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.docx', '.txt'];
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

document.addEventListener('DOMContentLoaded', async () => {
    initSupabaseClient();
    setupEventListeners();
    await checkInitialSession();
});

function initSupabaseClient() {
    const url = window.SUPABASE_URL;
    const key = window.SUPABASE_ANON_KEY;

    if (url && key && url.includes('supabase.co') && !url.includes('your-supabase-project')) {
        try {
            state.supabase = window.supabase.createClient(url, key);
            state.isDemoMode = false;
        } catch (err) {
            console.warn('Failed to initialize Supabase client:', err);
            enableDemoMode();
        }
    } else {
        enableDemoMode();
    }
}

function enableDemoMode() {
    state.isDemoMode = true;
    const localSaved = localStorage.getItem('ap_hub_demo_resources');
    if (localSaved) {
        try {
            state.demoResources = JSON.parse(localSaved);
        } catch (e) {
            state.demoResources = getDefaultDemoResources();
        }
    } else {
        state.demoResources = getDefaultDemoResources();
        saveDemoResources();
    }
}

function getDefaultDemoResources() {
    return [
        {
            id: 'res-1',
            user_id: 'user-deal',
            username: 'Mr. Deal',
            title: 'AP Physics C: Mechanics Gauss Law Progress Check & Solutions',
            subject: 'AP Physics C: Mechanics',
            tags: ['Progress Check', 'Gauss Law', 'FRQ'],
            file_url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
            file_name: 'Gauss_Law_FRQ_Solutions.pdf',
            created_at: new Date(Date.now() - 3600000 * 24 * 2).toISOString()
        }
    ];
}

function saveDemoResources() {
    localStorage.setItem('ap_hub_demo_resources', JSON.stringify(state.demoResources));
}

async function checkInitialSession() {
    if (state.isDemoMode) {
        const demoUser = localStorage.getItem('ap_hub_demo_user');
        if (demoUser) {
            const userObj = JSON.parse(demoUser);
            state.currentUser = userObj;
            state.currentProfile = { username: userObj.username || userObj.email.split('@')[0] };
            switchScreen('feed');
            await loadResources();
        } else {
            switchScreen('auth');
        }
        updateNavUI();
        return;
    }

    // Set up auth state change listener
    state.supabase.auth.onAuthStateChange(async (event, session) => {
        if (session && session.user) {
            state.currentUser = session.user;
            updateNavUI();
            await fetchUserProfile(session.user.id);
        } else {
            state.currentUser = null;
            state.currentProfile = null;
            switchScreen('auth');
            updateNavUI();
        }
    });

    // Check current session
    const { data: { session } } = await state.supabase.auth.getSession();
    if (!session) {
        switchScreen('auth');
    }
}

async function fetchUserProfile(userId) {
    if (state.isDemoMode) return;

    try {
        const { data, error } = await state.supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (data && data.username) {
            state.currentProfile = data;
            if (state.activeScreen === 'auth' || state.activeScreen === 'username-setup') {
                switchScreen('feed');
                await loadResources();
            }
        } else {
            switchScreen('username-setup');
        }
    } catch (e) {
        switchScreen('username-setup');
    }
    updateNavUI();
}

function validatePassword(password) {
    const minLength = password.length >= 8;
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);

    return {
        isValid: minLength && hasLower && hasUpper && hasNumber,
        minLength,
        hasLower,
        hasUpper,
        hasNumber
    };
}

function updatePasswordStrengthUI(password) {
    const v = validatePassword(password);
    const setRule = (elementId, passed) => {
        const el = document.getElementById(elementId);
        if (!el) return;
        if (passed) {
            el.className = 'text-xs text-emerald-400 flex items-center gap-1.5';
            el.querySelector('i').className = 'fa-solid fa-check-circle';
        } else {
            el.className = 'text-xs text-slate-400 flex items-center gap-1.5';
            el.querySelector('i').className = 'fa-regular fa-circle';
        }
    };

    setRule('rule-length', v.minLength);
    setRule('rule-lower', v.hasLower);
    setRule('rule-upper', v.hasUpper);
    setRule('rule-number', v.hasNumber);
}

function displayAuthError(message) {
    const box = document.getElementById('auth-error-msg');
    const text = document.getElementById('auth-error-text');
    if (box && text) {
        text.textContent = message;
        box.classList.remove('hidden');
    }
}

function clearAuthError() {
    const box = document.getElementById('auth-error-msg');
    if (box) box.classList.add('hidden');
}

async function handleSignUp(email, password) {
    clearAuthError();

    if (!email || !password) {
        displayAuthError('Please fill in both email and password.');
        return;
    }

    const passwordCheck = validatePassword(password);
    if (!passwordCheck.isValid) {
        displayAuthError('Password must be at least 8 characters long and contain uppercase, lowercase, and numbers.');
        return;
    }

    if (state.isDemoMode) {
        const newUser = { id: 'user-' + Date.now(), email: email, username: '' };
        state.currentUser = newUser;
        localStorage.setItem('ap_hub_demo_user', JSON.stringify(newUser));
        showToast('Account created (Demo Mode)!', 'success');
        switchScreen('username-setup');
        updateNavUI();
        return;
    }

    try {
        showLoading(true);
        const { data, error } = await state.supabase.auth.signUp({
            email: email,
            password: password
        });

        if (error) {
            if (error.message.includes('already registered')) {
                displayAuthError('An account with this email address already exists.');
            } else {
                displayAuthError(error.message);
            }
            return;
        }

        showToast('Account created successfully!', 'success');
        if (data.user) {
            state.currentUser = data.user;
            switchScreen('username-setup');
        }
    } catch (error) {
        displayAuthError(error.message || 'Error signing up.');
    } finally {
        showLoading(false);
    }
}

async function handleSignIn(email, password) {
    clearAuthError();

    if (!email || !password) {
        displayAuthError('Please fill in both email and password.');
        return;
    }

    if (state.isDemoMode) {
        const savedUser = localStorage.getItem('ap_hub_demo_user');
        let userObj = savedUser ? JSON.parse(savedUser) : { id: 'user-demo', email: email, username: email.split('@')[0] };
        state.currentUser = userObj;
        state.currentProfile = { username: userObj.username };
        localStorage.setItem('ap_hub_demo_user', JSON.stringify(userObj));
        showToast('Signed in successfully!', 'success');
        
        switchScreen('feed');
        await loadResources();
        updateNavUI();
        return;
    }

    try {
        showLoading(true);
        const { data, error } = await state.supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            if (error.message.includes('Invalid login credentials')) {
                displayAuthError('Incorrect email or password. Please try again.');
            } else {
                displayAuthError(error.message);
            }
            return;
        }

        showToast('Welcome back!', 'success');
        state.currentUser = data.user;
        await fetchUserProfile(data.user.id);
    } catch (error) {
        displayAuthError(error.message || 'Invalid login credentials.');
    } finally {
        showLoading(false);
    }
}

async function handleSignOut() {
    if (state.isDemoMode) {
        localStorage.removeItem('ap_hub_demo_user');
        state.currentUser = null;
        state.currentProfile = null;
        showToast('Signed out successfully.', 'info');
        switchScreen('auth');
        updateNavUI();
        return;
    }

    try {
        await state.supabase.auth.signOut();
        state.currentUser = null;
        state.currentProfile = null;
        showToast('Signed out successfully.', 'info');
        switchScreen('auth');
        updateNavUI();
    } catch (error) {
        showToast('Error signing out.', 'error');
    }
}

async function handleUsernameSetup(username) {
    const trimmed = username.trim();
    if (!trimmed || trimmed.length < 3) {
        showToast('Username must be at least 3 characters long.', 'error');
        return;
    }

    if (state.isDemoMode) {
        if (state.currentUser) {
            state.currentUser.username = trimmed;
            localStorage.setItem('ap_hub_demo_user', JSON.stringify(state.currentUser));
        }
        state.currentProfile = { username: trimmed };
        showToast(`Username set to @${trimmed}!`, 'success');
        switchScreen('feed');
        await loadResources();
        updateNavUI();
        return;
    }

    try {
        showLoading(true);
        const { data: existing } = await state.supabase
            .from('profiles')
            .select('id')
            .eq('username', trimmed)
            .maybeSingle();

        if (existing && existing.id !== state.currentUser.id) {
            showToast('Username is already taken. Please choose another.', 'error');
            return;
        }

        const { error } = await state.supabase
            .from('profiles')
            .upsert({
                id: state.currentUser.id,
                username: trimmed,
                created_at: new Date().toISOString()
            });

        if (error) throw error;

        state.currentProfile = { id: state.currentUser.id, username: trimmed };
        showToast(`Welcome @${trimmed}!`, 'success');
        switchScreen('feed');
        await loadResources();
        updateNavUI();
    } catch (error) {
        showToast(error.message || 'Failed to save username.', 'error');
    } finally {
        showLoading(false);
    }
}

async function loadResources() {
    if (state.isDemoMode) {
        state.resources = [...state.demoResources];
        renderResourceFeed();
        return;
    }

    try {
        showLoading(true);
        const { data: resourcesData, error: resError } = await state.supabase
            .from('resources')
            .select('*')
            .order('created_at', { ascending: false });

        if (resError) throw resError;

        const { data: profilesData } = await state.supabase
            .from('profiles')
            .select('id, username');

        const profileMap = {};
        if (profilesData) {
            profilesData.forEach(p => { profileMap[p.id] = p.username; });
        }

        state.resources = (resourcesData || []).map(item => ({
            ...item,
            username: profileMap[item.user_id] || 'AP Student',
            tags: Array.isArray(item.tags) ? item.tags : (item.tags ? item.tags.split(',').map(t => t.trim()) : [])
        }));

        renderResourceFeed();
    } catch (error) {
        showToast('Failed to load resources.', 'error');
    } finally {
        showLoading(false);
    }
}

async function handleResourceUpload({ title, subject, tags, file }) {
    if (!file) {
        showToast('Please select a file to upload.', 'error');
        return;
    }

    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
        showToast(`Invalid file format. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`, 'error');
        return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
        showToast('File size exceeds 25 MB.', 'error');
        return;
    }

    const parsedTags = tags.split(',')
        .map(t => t.trim().replace(/^#/, ''))
        .filter(t => t.length > 0);

    if (state.isDemoMode) {
        const newRes = {
            id: 'res-' + Date.now(),
            user_id: state.currentUser ? state.currentUser.id : 'user-demo',
            username: state.currentProfile ? state.currentProfile.username : 'You',
            title: title.trim(),
            subject: subject,
            tags: parsedTags.length > 0 ? parsedTags : ['AP Prep'],
            file_url: URL.createObjectURL(file),
            file_name: file.name,
            created_at: new Date().toISOString()
        };

        state.demoResources.unshift(newRes);
        saveDemoResources();
        state.resources.unshift(newRes);

        showToast('Resource uploaded successfully!', 'success');
        resetAddResourceForm();
        switchScreen('feed');
        renderResourceFeed();
        return;
    }

    try {
        showLoading(true, 'Uploading file...');

        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
        const filePath = `${state.currentUser.id}/${fileName}`;

        const { error: storageError } = await state.supabase.storage
            .from('ap-resources')
            .upload(filePath, file);

        if (storageError) throw storageError;

        const { data: { publicUrl } } = state.supabase.storage
            .from('ap-resources')
            .getPublicUrl(filePath);

        const { error: dbError } = await state.supabase
            .from('resources')
            .insert({
                user_id: state.currentUser.id,
                title: title.trim(),
                subject: subject,
                tags: parsedTags,
                file_url: publicUrl,
                file_name: file.name,
                created_at: new Date().toISOString()
            });

        if (dbError) throw dbError;

        showToast('Resource published to the hub!', 'success');
        resetAddResourceForm();
        switchScreen('feed');
        await loadResources();
    } catch (error) {
        showToast(error.message || 'Error uploading resource.', 'error');
    } finally {
        showLoading(false);
    }
}

async function handleDeleteResource(resourceId) {
    if (state.isDemoMode) {
        state.demoResources = state.demoResources.filter(r => r.id !== resourceId);
        saveDemoResources();
        state.resources = state.resources.filter(r => r.id !== resourceId);
        showToast('Resource deleted.', 'info');
        renderResourceFeed();
        return;
    }

    try {
        showLoading(true, 'Deleting resource...');
        const { error: dbError } = await state.supabase
            .from('resources')
            .delete()
            .eq('id', resourceId)
            .eq('user_id', state.currentUser.id);

        if (dbError) throw dbError;

        showToast('Resource deleted.', 'info');
        await loadResources();
    } catch (error) {
        showToast(error.message || 'Could not delete resource.', 'error');
    } finally {
        showLoading(false);
    }
}

async function handlePasswordChange(newPassword) {
    const v = validatePassword(newPassword);
    if (!v.isValid) {
        showToast('Password does not satisfy requirements.', 'error');
        return;
    }

    if (state.isDemoMode) {
        showToast('Password updated successfully (Demo Mode)!', 'success');
        document.getElementById('change-password-form')?.reset();
        return;
    }

    try {
        showLoading(true);
        const { error } = await state.supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;

        showToast('Password updated successfully!', 'success');
        document.getElementById('change-password-form')?.reset();
    } catch (error) {
        showToast(error.message || 'Failed to update password.', 'error');
    } finally {
        showLoading(false);
    }
}

function getFilteredResources() {
    return state.resources.filter(res => {
        const q = state.searchQuery.toLowerCase().trim();
        const titleMatch = res.title ? res.title.toLowerCase().includes(q) : false;
        const subjectMatch = res.subject ? res.subject.toLowerCase().includes(q) : false;
        const tagMatch = res.tags ? res.tags.some(t => t.toLowerCase().includes(q)) : false;
        const userMatch = res.username ? res.username.toLowerCase().includes(q) : false;
        const matchesQuery = !q || titleMatch || subjectMatch || tagMatch || userMatch;

        const matchesSubject = state.selectedSubject === 'ALL' || res.subject === state.selectedSubject;
        const matchesTag = state.selectedTag === 'ALL' || (res.tags && res.tags.includes(state.selectedTag));

        return matchesQuery && matchesSubject && matchesTag;
    });
}

function renderResourceFeed() {
    const feedContainer = document.getElementById('resource-feed-container');
    const resultsCountEl = document.getElementById('results-count');
    if (!feedContainer) return;

    const filtered = getFilteredResources();

    if (resultsCountEl) {
        resultsCountEl.textContent = `${filtered.length} resource${filtered.length === 1 ? '' : 's'} available`;
    }

    if (filtered.length === 0) {
        feedContainer.innerHTML = `
            <div class="col-span-full py-16 text-center bg-slate-800/40 border border-slate-700/60 rounded-2xl p-8">
                <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-700/50 flex items-center justify-center text-slate-400 text-2xl">
                    <i class="fa-solid fa-folder-open"></i>
                </div>
                <h3 class="text-xl font-semibold text-slate-200 mb-1">No AP Resources Found</h3>
                <p class="text-slate-400 max-w-md mx-auto text-sm mb-6">
                    Try clearing your active search filters or selecting a different subject.
                </p>
                <button onclick="switchScreen('add-resource')" class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-all duration-200 inline-flex items-center gap-2 shadow-lg shadow-indigo-600/20">
                    <i class="fa-solid fa-plus"></i> Upload First Resource
                </button>
            </div>
        `;
        return;
    }

    const currentUserId = state.currentUser ? state.currentUser.id : null;

    feedContainer.className = state.viewMode === 'grid'
        ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5'
        : 'flex flex-col gap-3';

    feedContainer.innerHTML = filtered.map(item => {
        const isOwner = currentUserId && (item.user_id === currentUserId || (state.isDemoMode && item.username === state.currentProfile?.username));
        const fileExt = item.file_name ? item.file_name.split('.').pop().toUpperCase() : 'FILE';
        
        let iconClass = 'fa-file-lines text-indigo-400';
        if (['PNG', 'JPG', 'JPEG'].includes(fileExt)) iconClass = 'fa-file-image text-emerald-400';
        else if (fileExt === 'PDF') iconClass = 'fa-file-pdf text-rose-400';
        else if (['DOC', 'DOCX'].includes(fileExt)) iconClass = 'fa-file-word text-blue-400';

        const formattedDate = item.created_at ? new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently';

        return `
            <div class="bg-slate-800/60 border border-slate-700/60 hover:border-indigo-500/50 rounded-2xl p-5 transition-all duration-200 flex flex-col justify-between group hover:shadow-xl hover:shadow-indigo-950/20">
                <div>
                    <div class="flex items-start justify-between gap-3 mb-3">
                        <span class="inline-block text-xs font-semibold px-2.5 py-1 bg-indigo-950/90 text-indigo-300 border border-indigo-800/60 rounded-lg">
                            ${escapeHTML(item.subject)}
                        </span>
                        <div class="w-8 h-8 rounded-lg bg-slate-700/50 flex items-center justify-center text-lg shrink-0">
                            <i class="fa-solid ${iconClass}"></i>
                        </div>
                    </div>

                    <h4 class="text-base font-semibold text-slate-100 group-hover:text-indigo-300 transition-colors line-clamp-2 mb-2">
                        ${escapeHTML(item.title)}
                    </h4>

                    <div class="flex flex-wrap gap-1.5 mb-4">
                        ${(item.tags || []).map(tag => `
                            <span onclick="filterByTag('\${escapeHTML(tag)}')" class="cursor-pointer text-[11px] bg-slate-700/40 hover:bg-slate-700 text-slate-300 px-2 py-0.5 rounded-md transition-colors">
                                #\${escapeHTML(tag)}
                            </span>
                        `).join('')}
                    </div>
                </div>

                <div class="pt-3 border-t border-slate-700/40 flex items-center justify-between text-xs text-slate-400">
                    <div class="flex items-center gap-1.5 min-w-0">
                        <div class="w-6 h-6 rounded-full bg-indigo-600/30 text-indigo-300 flex items-center justify-center text-[10px] font-bold uppercase">
                            ${escapeHTML(item.username).charAt(0)}
                        </div>
                        <span class="truncate font-medium text-slate-300">@${escapeHTML(item.username)}</span>
                    </div>

                    <div class="flex items-center gap-1.5 shrink-0">
                        <button onclick="previewFile('${escapeHTML(item.file_url)}', '${escapeHTML(item.title)}', '${fileExt}')" class="p-1.5 bg-slate-700/60 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors" title="Quick View">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                        <a href="${escapeHTML(item.file_url)}" download="${escapeHTML(item.file_name)}" target="_blank" class="p-1.5 bg-indigo-600/80 hover:bg-indigo-600 text-white rounded-lg transition-colors" title="Download File">
                            <i class="fa-solid fa-download"></i>
                        </a>
                        ${isOwner ? `
                            <button onclick="confirmDeleteResource('\${item.id}')" class="p-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/40 rounded-lg transition-colors" title="Delete">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function switchScreen(screenName) {
    state.activeScreen = screenName;

    document.querySelectorAll('.app-screen').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById(`screen-${screenName}`);
    if (target) {
        target.classList.remove('hidden');
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
    updateNavUI();
}

function updateNavUI() {
    const userNavSection = document.getElementById('user-nav-section');
    const userEmailDisplay = document.getElementById('user-email-display');
    const mainNav = document.getElementById('main-nav');
    const authScreens = ['auth', 'username-setup'];

    if (authScreens.includes(state.activeScreen) || !state.currentUser) {
        if (mainNav) mainNav.classList.add('hidden');
        if (userNavSection) userNavSection.classList.add('hidden');
    } else {
        if (mainNav) mainNav.classList.remove('hidden');
        if (userNavSection) userNavSection.classList.remove('hidden');
        if (userEmailDisplay && state.currentUser) {
            userEmailDisplay.textContent = state.currentUser.email || 'Signed In';
        }
    }

    const settingsUserEmail = document.getElementById('settings-user-email');
    const settingsUsername = document.getElementById('settings-username');
    if (settingsUserEmail && state.currentUser) {
        settingsUserEmail.textContent = state.currentUser.email || 'User';
    }
    if (settingsUsername && state.currentProfile) {
        settingsUsername.textContent = `@${state.currentProfile.username}`;
    }
}

function setupEventListeners() {
    const signInBtn = document.getElementById('signin-btn');
    const signUpBtn = document.getElementById('signup-btn');

    signInBtn?.addEventListener('click', async () => {
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        await handleSignIn(email, password);
    });

    signUpBtn?.addEventListener('click', async () => {
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        await handleSignUp(email, password);
    });

    const authPasswordInput = document.getElementById('auth-password');
    authPasswordInput?.addEventListener('input', (e) => {
        updatePasswordStrengthUI(e.target.value);
    });

    document.getElementById('username-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('setup-username-input').value;
        await handleUsernameSetup(username);
    });

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const screen = btn.dataset.screen;
            if (screen) switchScreen(screen);
        });
    });

    document.getElementById('signout-btn')?.addEventListener('click', handleSignOut);

    const addForm = document.getElementById('add-resource-form');
    addForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('res-title-input').value;
        const subject = document.getElementById('res-subject-select').value;
        const tags = document.getElementById('res-tags-input').value;
        const fileInput = document.getElementById('res-file-input');

        await handleResourceUpload({
            title,
            subject,
            tags,
            file: fileInput.files[0]
        });
    });

    const searchInput = document.getElementById('search-query-input');
    searchInput?.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        renderResourceFeed();
    });

    document.getElementById('view-grid-btn')?.addEventListener('click', () => {
        state.viewMode = 'grid';
        renderResourceFeed();
    });
    document.getElementById('view-list-btn')?.addEventListener('click', () => {
        state.viewMode = 'list';
        renderResourceFeed();
    });

    document.getElementById('change-password-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newPass = document.getElementById('new-password-input').value;
        await handlePasswordChange(newPass);
    });

    populateSubjectFilters();
}

function populateSubjectFilters() {
    const filterContainer = document.getElementById('subject-pills-container');
    const selectDropdown = document.getElementById('res-subject-select');

    if (selectDropdown) {
        selectDropdown.innerHTML = AP_SUBJECTS.map(subj => `<option value="${subj}">${subj}</option>`).join('');
    }

    if (filterContainer) {
        const allSubjects = ['ALL', ...AP_SUBJECTS];
        filterContainer.innerHTML = allSubjects.map(subj => `
            <button onclick="filterBySubject('${subj}')" class="subj-pill px-3 py-1.5 text-xs font-medium rounded-xl transition-all border ${
                state.selectedSubject === subj
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/20'
                    : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:border-slate-500'
            }">
                ${subj === 'ALL' ? 'All Subjects' : subj}
            </button>
        `).join('');
    }
}

function filterBySubject(subj) {
    state.selectedSubject = subj;
    populateSubjectFilters();
    renderResourceFeed();
}

function filterByTag(tag) {
    state.selectedTag = state.selectedTag === tag ? 'ALL' : tag;
    switchScreen('feed');
    renderResourceFeed();
}

function resetAddResourceForm() {
    const form = document.getElementById('add-resource-form');
    if (form) form.reset();
    const fileNameDisplay = document.getElementById('selected-file-name');
    if (fileNameDisplay) fileNameDisplay.textContent = 'No file chosen';
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const colors = {
        success: 'bg-emerald-950/90 border-emerald-700/80 text-emerald-200',
        error: 'bg-rose-950/90 border-rose-700/80 text-rose-200',
        info: 'bg-slate-900/90 border-indigo-700/80 text-indigo-200'
    };

    const icons = {
        success: 'fa-circle-check text-emerald-400',
        error: 'fa-circle-exclamation text-rose-400',
        info: 'fa-circle-info text-indigo-400'
    };

    toast.className = `flex items-center gap-3 px-4 py-3 rounded-xl border ${colors[type] || colors.info} shadow-2xl backdrop-blur-md transform transition-all duration-300 translate-y-2 opacity-0 max-w-md w-full`;
    toast.innerHTML = `
        <i class="fa-solid ${icons[type] || icons.info} text-lg shrink-0"></i>
        <p class="text-xs font-medium leading-relaxed">${escapeHTML(message)}</p>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    }, 10);

    setTimeout(() => {
        toast.classList.add('opacity-0', '-translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function confirmDeleteResource(id) {
    const modal = document.getElementById('confirm-modal');
    const confirmBtn = document.getElementById('confirm-action-btn');
    const cancelBtn = document.getElementById('cancel-action-btn');

    if (!modal) return;

    modal.classList.remove('hidden');

    const handleConfirm = async () => {
        modal.classList.add('hidden');
        confirmBtn.removeEventListener('click', handleConfirm);
        await handleDeleteResource(id);
    };

    const handleCancel = () => {
        modal.classList.add('hidden');
        cancelBtn.removeEventListener('click', handleCancel);
    };

    confirmBtn.onclick = handleConfirm;
    cancelBtn.onclick = handleCancel;
}

function previewFile(url, title, ext) {
    const modal = document.getElementById('preview-modal');
    const titleEl = document.getElementById('preview-title');
    const bodyEl = document.getElementById('preview-body');

    if (!modal || !bodyEl) return;

    titleEl.textContent = title;

    if (['PNG', 'JPG', 'JPEG'].includes(ext)) {
        bodyEl.innerHTML = `<img src="${url}" class="max-h-[70vh] mx-auto rounded-xl object-contain border border-slate-700" alt="Preview"/>`;
    } else if (ext === 'PDF') {
        bodyEl.innerHTML = `<iframe src="${url}" class="w-full h-[70vh] rounded-xl border border-slate-700"></iframe>`;
    } else {
        bodyEl.innerHTML = `
            <div class="p-8 text-center bg-slate-800 rounded-xl">
                <i class="fa-solid fa-file-arrow-down text-5xl text-indigo-400 mb-4"></i>
                <p class="text-sm text-slate-300 mb-4">Direct inline preview is not supported for .${ext.toLowerCase()} files.</p>
                <a href="${url}" download target="_blank" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg inline-flex items-center gap-2">
                    <i class="fa-solid fa-download"></i> Download File Instead
                </a>
            </div>
        `;
    }

    modal.classList.remove('hidden');
}

function closePreviewModal() {
    const modal = document.getElementById('preview-modal');
    if (modal) modal.classList.add('hidden');
}

function showLoading(isLoading, text = 'Processing...') {
    const spinner = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');
    if (!spinner) return;

    if (isLoading) {
        if (loadingText) loadingText.textContent = text;
        spinner.classList.remove('hidden');
    } else {
        spinner.classList.add('hidden');
    }
}

function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}