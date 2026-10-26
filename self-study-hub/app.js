/**
 * AP Study Resource Hub - Core Application Logic
 */

const state = {
    supabase: null,
    currentUser: null,
    currentProfile: null,
    resources: [],
    savedFileIds: [],
    activeScreen: 'auth',   // 'auth', 'username-setup', 'feed', 'search', 'community', 'add-resource'
    searchQuery: '',
    selectedSubject: 'ALL',
    selectedTag: 'ALL',
    isDemoMode: false,
    demoResources: []
};

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

const BUCKET_NAME = 'user-files';
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4', '.webm', '.ogg', '.mov', '.mp3', '.wav', '.m4a', '.pdf'];

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
        try { state.demoResources = JSON.parse(localSaved); }
        catch (e) { state.demoResources = getDefaultDemoResources(); }
    } else {
        state.demoResources = getDefaultDemoResources();
        saveDemoResources();
    }
}

function getDefaultDemoResources() {
    return [{
        id: 'res-1',
        user_id: 'user-deal',
        username: 'Mr. Deal',
        title: 'AP Physics C: Mechanics Gauss Law Progress Check & Solutions',
        subject: 'AP Physics C: Mechanics',
        tags: ['Progress Check', 'Gauss Law', 'FRQ'],
        file_url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        file_name: 'Gauss_Law_FRQ_Solutions.pdf',
        file_size: 1048576,
        file_path: 'user-deal/1700000000000-Gauss_Law_FRQ_Solutions.pdf',
        created_at: new Date(Date.now() - 3600000 * 24 * 2).toISOString()
    }];
}

function saveDemoResources() {
    localStorage.setItem('ap_hub_demo_resources', JSON.stringify(state.demoResources));
}

function loadSavedFileIds() {
    if (!state.currentUser) return;
    const key = `ap_hub_saved_files_${state.currentUser.id}`;
    const raw = localStorage.getItem(key);
    state.savedFileIds = raw ? JSON.parse(raw) : [];
}

function persistSavedFileIds() {
    if (!state.currentUser) return;
    localStorage.setItem(`ap_hub_saved_files_${state.currentUser.id}`, JSON.stringify(state.savedFileIds));
}

function toggleStarFile(resourceId) {
    const idx = state.savedFileIds.indexOf(resourceId);
    if (idx > -1) {
        state.savedFileIds.splice(idx, 1);
        showToast('File removed from Saved Files', 'info');
    } else {
        state.savedFileIds.push(resourceId);
        showToast('File added to Saved Files!', 'success');
    }
    persistSavedFileIds();
    renderAllViews();
}

async function checkInitialSession() {
    if (state.isDemoMode) {
        const demoUser = localStorage.getItem('ap_hub_demo_user');
        if (demoUser) {
            const userObj = JSON.parse(demoUser);
            state.currentUser = userObj;
            state.currentProfile = { username: userObj.username || 'demo_user' };
            loadSavedFileIds();
            switchScreen('feed');
            await loadResources();
        } else {
            switchScreen('auth');
        }
        updateNavUI();
        return;
    }

    state.supabase.auth.onAuthStateChange(async (event, session) => {
        if (session && session.user) {
            state.currentUser = session.user;
            loadSavedFileIds();
            await fetchUserProfile(session.user.id);
        } else {
            state.currentUser = null;
            state.currentProfile = null;
            switchScreen('auth');
            updateNavUI();
        }
    });

    const { data: { session } } = await state.supabase.auth.getSession();
    if (!session) switchScreen('auth');
}

async function fetchUserProfile(userId) {
    if (state.isDemoMode) return;
    try {
        const { data } = await state.supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
        if (data && data.username) {
            state.currentProfile = data;
            if (['auth', 'username-setup'].includes(state.activeScreen)) {
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

function showPlainError(message) {
    const banner = document.getElementById('supabase-error-banner');
    const text = document.getElementById('supabase-error-banner-text');
    if (banner && text) {
        text.textContent = message;
        banner.classList.remove('hidden');
    }
    showToast(message, 'error');
}

function dismissErrorBanner() {
    document.getElementById('supabase-error-banner')?.classList.add('hidden');
}

async function handleSignUp(email, password) {
    if (state.isDemoMode) {
        const newUser = { id: 'user-' + Date.now(), email, username: '' };
        state.currentUser = newUser;
        localStorage.setItem('ap_hub_demo_user', JSON.stringify(newUser));
        switchScreen('username-setup');
        updateNavUI();
        return;
    }
    const { data, error } = await state.supabase.auth.signUp({ email, password });
    if (error) return showPlainError(error.message);
    if (data.user) {
        state.currentUser = data.user;
        switchScreen('username-setup');
    }
}

async function handleSignIn(email, password) {
    if (state.isDemoMode) {
        const savedUser = localStorage.getItem('ap_hub_demo_user');
        let userObj = savedUser ? JSON.parse(savedUser) : { id: 'user-demo', email, username: email.split('@')[0] };
        state.currentUser = userObj;
        state.currentProfile = { username: userObj.username };
        localStorage.setItem('ap_hub_demo_user', JSON.stringify(userObj));
        loadSavedFileIds();
        switchScreen('feed');
        await loadResources();
        updateNavUI();
        return;
    }
    const { data, error } = await state.supabase.auth.signInWithPassword({ email, password });
    if (error) return showPlainError(error.message);
    state.currentUser = data.user;
    loadSavedFileIds();
    await fetchUserProfile(data.user.id);
}

async function handleSignOut() {
    if (!state.isDemoMode) await state.supabase.auth.signOut();
    localStorage.removeItem('ap_hub_demo_user');
    state.currentUser = null;
    state.currentProfile = null;
    switchScreen('auth');
    updateNavUI();
}

async function handleUsernameSetup(username) {
    const trimmed = username.trim().toLowerCase().replace(/^@/, '');
    if (!trimmed || trimmed.length < 3) return showToast('Username must be 3+ chars', 'error');

    if (state.isDemoMode) {
        state.currentProfile = { username: trimmed };
        switchScreen('feed');
        await loadResources();
        updateNavUI();
        return;
    }

    const { error } = await state.supabase.from('profiles').upsert({ id: state.currentUser.id, username: trimmed, created_at: new Date().toISOString() });
    if (error) return showPlainError(error.message);

    state.currentProfile = { id: state.currentUser.id, username: trimmed };
    switchScreen('feed');
    await loadResources();
    updateNavUI();
}

async function loadResources() {
    if (state.isDemoMode) {
        state.resources = [...state.demoResources];
        renderAllViews();
        return;
    }

    try {
        const { data: resourcesData, error } = await state.supabase.from('resources').select('*').order('created_at', { ascending: false });
        if (error) throw error;

        const { data: profilesData } = await state.supabase.from('profiles').select('id, username');
        const profileMap = {};
        if (profilesData) profilesData.forEach(p => { profileMap[p.id] = p.username; });

        state.resources = await Promise.all((resourcesData || []).map(async (item) => {
            let fileUrl = item.file_url;
            if (item.file_path && state.supabase) {
                const { data } = await state.supabase.storage.from(BUCKET_NAME).createSignedUrl(item.file_path, 3600);
                if (data?.signedUrl) fileUrl = data.signedUrl;
            }
            return {
                ...item,
                file_url: fileUrl,
                username: item.username || profileMap[item.user_id] || 'AP Student',
                tags: Array.isArray(item.tags) ? item.tags : (item.tags ? item.tags.split(',').map(t => t.trim()) : [])
            };
        }));

        renderAllViews();
    } catch (error) {
        showPlainError(error.message || 'Failed to load resources.');
    }
}

function handleFileSelect(inputElement) {
    const file = inputElement.files[0];
    const nameDisplay = document.getElementById('selected-file-name');
    if (!file) return;
    const fileExt = '.' + file.name.split('.').pop().toLowerCase();
    if (file.size > MAX_FILE_SIZE_BYTES || !ALLOWED_EXTENSIONS.includes(fileExt)) {
        showPlainError('Invalid file or size > 10 MB.');
        inputElement.value = '';
        return;
    }
    if (nameDisplay) nameDisplay.textContent = `${file.name} (${formatBytes(file.size)})`;
}

async function handleResourceUpload({ title, subject, tags, file }) {
    if (!file) return showToast('Please select a file.', 'error');
    const timestamp = Date.now();
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const filePath = `${state.currentUser?.id || 'demo'}/${timestamp}-${cleanFileName}`;

    if (state.isDemoMode) {
        const newRes = {
            id: 'res-' + timestamp,
            user_id: state.currentUser?.id || 'demo',
            username: state.currentProfile?.username || 'You',
            title: title.trim(),
            subject,
            tags: tags.split(',').map(t => t.trim()),
            file_url: URL.createObjectURL(file),
            file_name: file.name,
            file_size: file.size,
            file_path: filePath,
            created_at: new Date().toISOString()
        };
        state.demoResources.unshift(newRes);
        saveDemoResources();
        state.resources.unshift(newRes);
        switchScreen('feed');
        renderAllViews();
        return;
    }

    try {
        const { error: storageError } = await state.supabase.storage.from(BUCKET_NAME).upload(filePath, file);
        if (storageError) throw storageError;

        const { data: signedData } = await state.supabase.storage.from(BUCKET_NAME).createSignedUrl(filePath, 3600 * 24 * 365);
        const { error: dbError } = await state.supabase.from('resources').insert({
            user_id: state.currentUser.id,
            username: state.currentProfile?.username || 'AP Student',
            title: title.trim(),
            subject,
            tags: tags.split(',').map(t => t.trim()),
            file_url: signedData?.signedUrl || '',
            file_name: file.name,
            file_size: file.size,
            file_path: filePath,
            created_at: new Date().toISOString()
        });
        if (dbError) throw dbError;

        showToast('File published!', 'success');
        switchScreen('feed');
        await loadResources();
    } catch (error) {
        showPlainError(error.message);
    }
}

async function handleDeleteResource(resourceId, filePath) {
    if (state.isDemoMode) {
        state.demoResources = state.demoResources.filter(r => r.id !== resourceId);
        saveDemoResources();
        state.resources = state.resources.filter(r => r.id !== resourceId);
        renderAllViews();
        return;
    }
    try {
        await state.supabase.from('resources').delete().eq('id', resourceId);
        if (filePath) await state.supabase.storage.from(BUCKET_NAME).remove([filePath]);
        await loadResources();
    } catch (error) {
        showPlainError(error.message);
    }
}

// Requirement 2 & 3: Dedicated Search Page Keyword / Subject Filter logic
function getFilteredSearchResults() {
    return state.resources.filter(res => {
        const matchesSubject = state.selectedSubject === 'ALL' || res.subject === state.selectedSubject;
        if (!matchesSubject) return false;

        const q = state.searchQuery.toLowerCase().trim();
        if (!q) return true;

        const keywords = q.split(/[\s,]+/).filter(k => k.length > 0);
        const title = (res.title || '').toLowerCase();
        const subject = (res.subject || '').toLowerCase();
        const fileName = (res.file_name || '').toLowerCase();
        const tagsStr = (res.tags || []).join(' ').toLowerCase();

        return keywords.some(kw => title.includes(kw) || subject.includes(kw) || fileName.includes(kw) || tagsStr.includes(kw));
    });
}

function renderSingleFileCard(item) {
    const isOwner = state.currentUser && (item.user_id === state.currentUser.id || (state.isDemoMode && item.username === state.currentProfile?.username));
    const isStarred = state.savedFileIds.includes(item.id);
    const fileExt = item.file_name ? item.file_name.split('.').pop().toLowerCase() : '';

    let previewHTML = '';
    if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fileExt)) {
        previewHTML = `<div class="mt-2 overflow-hidden rounded-xl border border-slate-700/60 max-h-40 bg-slate-950 flex items-center justify-center"><img src="${escapeHTML(item.file_url)}" class="max-h-40 w-full object-cover"/></div>`;
    } else if (['mp4', 'webm', 'ogg', 'mov'].includes(fileExt)) {
        previewHTML = `<div class="mt-2 rounded-xl border border-slate-700/60 overflow-hidden bg-slate-950"><video controls class="w-full max-h-40"><source src="${escapeHTML(item.file_url)}"></video></div>`;
    } else if (['mp3', 'wav', 'm4a'].includes(fileExt)) {
        previewHTML = `<div class="mt-2 p-2 rounded-xl bg-slate-950 border border-slate-700/60"><audio controls class="w-full h-8"><source src="${escapeHTML(item.file_url)}"></audio></div>`;
    } else if (fileExt === 'pdf') {
        previewHTML = `<div class="mt-2 p-2.5 rounded-xl bg-slate-950 border border-slate-700/60 flex items-center justify-between text-xs"><span class="text-rose-400 font-semibold"><i class="fa-solid fa-file-pdf"></i> PDF</span><a href="${escapeHTML(item.file_url)}" target="_blank" class="text-xs text-indigo-400 hover:underline">Open tab <i class="fa-solid fa-arrow-up-right-from-square"></i></a></div>`;
    }

    return `
        <div class="bg-slate-800/60 border border-slate-700/60 hover:border-indigo-500/50 rounded-2xl p-4 transition-all flex flex-col justify-between">
            <div>
                <div class="flex items-start justify-between gap-2 mb-2">
                    <span class="text-[11px] font-semibold px-2 py-0.5 bg-indigo-950 text-indigo-300 border border-indigo-800/60 rounded-lg truncate max-w-[150px]">${escapeHTML(item.subject)}</span>
                    <button onclick="toggleStarFile('${item.id}')" class="p-1 rounded-lg border ${isStarred ? 'bg-amber-500/20 text-amber-400 border-amber-500/50' : 'bg-slate-900 text-slate-500 border-slate-700'}"><i class="${isStarred ? 'fa-solid' : 'fa-regular'} fa-star text-xs"></i></button>
                </div>
                <h4 class="text-sm font-semibold text-slate-100 line-clamp-2 mb-1">${escapeHTML(item.title)}</h4>
                <p class="text-[11px] text-slate-400 truncate">${escapeHTML(item.file_name)}</p>
                ${previewHTML}
            </div>
            <div class="pt-3 mt-3 border-t border-slate-700/40 flex items-center justify-between text-xs">
                <span class="truncate font-semibold text-indigo-300">@${escapeHTML(item.username)}</span>
                <div class="flex items-center gap-1.5">
                    <a href="${escapeHTML(item.file_url)}" download="${escapeHTML(item.file_name)}" target="_blank" class="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[11px] font-medium"><i class="fa-solid fa-download"></i> Download</a>
                    ${isOwner ? `<button onclick="confirmDeleteResource('${item.id}', '${escapeHTML(item.file_path || '')}')" class="p-1 text-rose-400 hover:bg-rose-950/60 rounded-lg"><i class="fa-solid fa-trash-can"></i></button>` : ''}
                </div>
            </div>
        </div>
    `;
}

function renderAllViews() {
    renderHomeView();
    renderSearchView();
    renderCommunityView();
}

function renderHomeView() {
    const savedContainer = document.getElementById('saved-files-container');
    const myFilesContainer = document.getElementById('my-files-container');

    const savedFiles = state.resources.filter(r => state.savedFileIds.includes(r.id));
    document.getElementById('saved-files-count').textContent = `(${savedFiles.length})`;
    if (savedContainer) savedContainer.innerHTML = savedFiles.length ? savedFiles.map(renderSingleFileCard).join('') : '<p class="text-xs text-slate-500 col-span-full py-4 text-center">No saved files.</p>';

    const currentUserId = state.currentUser?.id;
    const myFiles = state.resources.filter(r => currentUserId && (r.user_id === currentUserId || (state.isDemoMode && r.username === state.currentProfile?.username)));
    document.getElementById('my-files-count').textContent = `(${myFiles.length})`;
    if (myFilesContainer) myFilesContainer.innerHTML = myFiles.length ? myFiles.map(renderSingleFileCard).join('') : '<p class="text-xs text-slate-500 col-span-full py-4 text-center">You haven\'t uploaded any files yet.</p>';
}

// Requirement 3: Dedicated Search Page rendering without returning to Home
function renderSearchView() {
    const container = document.getElementById('search-results-container');
    const countEl = document.getElementById('search-results-count');
    if (!container) return;

    const results = getFilteredSearchResults();
    if (countEl) countEl.textContent = `${results.length} file${results.length === 1 ? '' : 's'} found`;

    container.innerHTML = results.length ? results.map(renderSingleFileCard).join('') : '<p class="text-xs text-slate-500 col-span-full py-8 text-center">No files match your search criteria.</p>';
}

// Requirement 4: Community Resources Page - Top 10 most recent per AP subject
function renderCommunityView() {
    const wrapper = document.getElementById('community-subjects-wrapper');
    if (!wrapper) return;

    wrapper.innerHTML = AP_SUBJECTS.map(subj => {
        const subjectFiles = state.resources.filter(r => r.subject === subj).slice(0, 10);
        if (subjectFiles.length === 0) return '';

        return `
            <div class="space-y-3">
                <div class="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h3 class="text-base font-bold text-indigo-300 flex items-center gap-2">
                        <i class="fa-solid fa-book-bookmark text-indigo-500"></i> ${escapeHTML(subj)}
                    </h3>
                    <span class="text-xs text-slate-500">${subjectFiles.length} file${subjectFiles.length === 1 ? '' : 's'}</span>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    ${subjectFiles.map(renderSingleFileCard).join('')}
                </div>
            </div>
        `;
    }).join('') || '<div class="py-12 text-center text-slate-500 text-xs">No community files available yet.</div>';
}

function switchScreen(screenName) {
    state.activeScreen = screenName;
    document.querySelectorAll('.app-screen').forEach(el => el.classList.add('hidden'));
    document.getElementById(`screen-${screenName}`)?.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    updateNavUI();
}

function updateNavUI() {
    const navSection = document.getElementById('user-nav-section');
    if (['auth', 'username-setup'].includes(state.activeScreen) || !state.currentUser) {
        navSection?.classList.add('hidden');
    } else {
        navSection?.classList.remove('hidden');
        navSection?.classList.add('flex');
        document.getElementById('top-username-display').textContent = `@${state.currentProfile?.username || ''}`;
        document.getElementById('user-email-display').textContent = state.currentUser?.email || '';
    }
}

function setupEventListeners() {
    document.getElementById('signin-btn')?.addEventListener('click', () => handleSignIn(document.getElementById('auth-email').value, document.getElementById('auth-password').value));
    document.getElementById('signup-btn')?.addEventListener('click', () => handleSignUp(document.getElementById('auth-email').value, document.getElementById('auth-password').value));
    document.getElementById('username-form')?.addEventListener('submit', (e) => { e.preventDefault(); handleUsernameSetup(document.getElementById('setup-username-input').value); });
    document.getElementById('signout-btn')?.addEventListener('click', handleSignOut);

    document.getElementById('dedicated-search-input')?.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        renderSearchView();
    });

    document.getElementById('add-resource-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        handleResourceUpload({
            title: document.getElementById('res-title-input').value,
            subject: document.getElementById('res-subject-select').value,
            tags: document.getElementById('res-tags-input').value,
            file: document.getElementById('res-file-input').files[0]
        });
    });

    populateSubjectFilters();
}

function populateSubjectFilters() {
    const container = document.getElementById('subject-pills-container');
    const selectDropdown = document.getElementById('res-subject-select');

    if (selectDropdown) selectDropdown.innerHTML = AP_SUBJECTS.map(s => `<option value="${s}">${s}</option>`).join('');

    if (container) {
        const allSubjects = ['ALL', ...AP_SUBJECTS];
        container.innerHTML = allSubjects.map(subj => `
            <button onclick="filterBySubject('${subj}')" class="px-3 py-1.5 text-xs font-medium rounded-xl transition-all border ${
                state.selectedSubject === subj ? 'bg-indigo-600 text-white border-indigo-500 shadow-md' : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500'
            }">
                ${subj === 'ALL' ? 'All Subjects' : subj}
            </button>
        `).join('');
    }
}

function filterBySubject(subj) {
    state.selectedSubject = subj;
    populateSubjectFilters();
    renderSearchView();
}

function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `px-4 py-3 rounded-xl border bg-slate-900 text-xs font-medium text-slate-100 shadow-xl opacity-90`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function confirmDeleteResource(id, filePath) {
    const modal = document.getElementById('confirm-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    document.getElementById('confirm-action-btn').onclick = async () => { modal.classList.add('hidden'); await handleDeleteResource(id, filePath); };
    document.getElementById('cancel-action-btn').onclick = () => modal.classList.add('hidden');
}

function formatBytes(bytes) {
    if (!bytes) return '0 Bytes';
    const k = 1024, sizes = ['Bytes', 'KB', 'MB', 'GB'], i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function escapeHTML(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}