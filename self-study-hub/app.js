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
    savedFileIds: [],       // Array of resource IDs starred by user
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

// Target Storage Bucket Name
const BUCKET_NAME = 'user-files';

// File Limits: 10 MB Max
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

// Allowed Extensions (No Word .docx)
const ALLOWED_EXTENSIONS = [
    '.jpg', '.jpeg', '.png', '.webp', '.gif',
    '.mp4', '.webm', '.ogg', '.mov',
    '.mp3', '.wav', '.m4a',
    '.pdf'
];

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
            showPlainError('Failed to initialize Supabase client: ' + err.message);
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
            file_size: 1048576,
            file_path: 'user-deal/1700000000000-Gauss_Law_FRQ_Solutions.pdf',
            created_at: new Date(Date.now() - 3600000 * 24 * 2).toISOString()
        }
    ];
}

function saveDemoResources() {
    localStorage.setItem('ap_hub_demo_resources', JSON.stringify(state.demoResources));
}

// Requirement 4: Load starred file IDs for current user from localStorage
function loadSavedFileIds() {
    if (!state.currentUser) {
        state.savedFileIds = [];
        return;
    }
    const key = `ap_hub_saved_files_${state.currentUser.id}`;
    const raw = localStorage.getItem(key);
    if (raw) {
        try {
            state.savedFileIds = JSON.parse(raw);
        } catch (e) {
            state.savedFileIds = [];
        }
    } else {
        state.savedFileIds = [];
    }
}

function persistSavedFileIds() {
    if (!state.currentUser) return;
    const key = `ap_hub_saved_files_${state.currentUser.id}`;
    localStorage.setItem(key, JSON.stringify(state.savedFileIds));
}

function toggleStarFile(resourceId) {
    const index = state.savedFileIds.indexOf(resourceId);
    if (index > -1) {
        state.savedFileIds.splice(index, 1);
        showToast('File removed from Saved Files', 'info');
    } else {
        state.savedFileIds.push(resourceId);
        showToast('File added to Saved Files!', 'success');
    }
    persistSavedFileIds();
    renderResourceFeed();
}

async function checkInitialSession() {
    if (state.isDemoMode) {
        const demoUser = localStorage.getItem('ap_hub_demo_user');
        if (demoUser) {
            const userObj = JSON.parse(demoUser);
            state.currentUser = userObj;
            state.currentProfile = { username: userObj.username || (userObj.email ? userObj.email.split('@')[0] : 'demo_user') };
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
            state.savedFileIds = [];
            switchScreen('auth');
            updateNavUI();
        }
    });

    const { data: { session }, error } = await state.supabase.auth.getSession();
    if (error) {
        showPlainError(error.message);
        displayAuthError(error.message);
    }
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
            .maybeSingle();

        if (error) {
            showPlainError('Profile lookup failed: ' + error.message);
            switchScreen('username-setup');
            updateNavUI();
            return;
        }

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
        showPlainError(e.message || 'Error fetching user profile.');
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
    const banner = document.getElementById('supabase-error-banner');
    if (banner) banner.classList.add('hidden');
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
            showPlainError(error.message);
            displayAuthError(error.message);
            return;
        }

        showToast('Account created successfully!', 'success');
        if (data.user) {
            state.currentUser = data.user;
            switchScreen('username-setup');
        }
    } catch (error) {
        showPlainError(error.message || 'Error signing up.');
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
        loadSavedFileIds();
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
            showPlainError(error.message);
            displayAuthError(error.message);
            return;
        }

        showToast('Welcome back!', 'success');
        state.currentUser = data.user;
        loadSavedFileIds();
        await fetchUserProfile(data.user.id);
    } catch (error) {
        showPlainError(error.message || 'Invalid login credentials.');
    } finally {
        showLoading(false);
    }
}

async function handleGitHubSignIn() {
    clearAuthError();

    if (state.isDemoMode) {
        const githubUser = { id: 'user-github', email: 'github_student@example.com', username: 'GitHubStudent' };
        state.currentUser = githubUser;
        state.currentProfile = { username: githubUser.username };
        localStorage.setItem('ap_hub_demo_user', JSON.stringify(githubUser));
        loadSavedFileIds();
        showToast('Signed in via GitHub (Demo Mode)!', 'success');
        switchScreen('feed');
        await loadResources();
        updateNavUI();
        return;
    }

    try {
        showLoading(true, 'Redirecting to GitHub...');
        const redirectUrl = window.location.origin + window.location.pathname;
        const { error } = await state.supabase.auth.signInWithOAuth({
            provider: 'github',
            options: {
                redirectTo: redirectUrl
            }
        });

        if (error) {
            showPlainError(error.message);
        }
    } catch (error) {
        showPlainError(error.message || 'GitHub OAuth failed.');
    } finally {
        showLoading(false);
    }
}

async function handleSignOut() {
    if (state.isDemoMode) {
        localStorage.removeItem('ap_hub_demo_user');
        state.currentUser = null;
        state.currentProfile = null;
        state.savedFileIds = [];
        showToast('Signed out successfully.', 'info');
        switchScreen('auth');
        updateNavUI();
        return;
    }

    try {
        await state.supabase.auth.signOut();
        state.currentUser = null;
        state.currentProfile = null;
        state.savedFileIds = [];
        showToast('Signed out successfully.', 'info');
        switchScreen('auth');
        updateNavUI();
    } catch (error) {
        showPlainError(error.message || 'Error signing out.');
    }
}

async function handleUsernameSetup(username) {
    const errEl = document.getElementById('username-error-msg');
    if (errEl) {
        errEl.textContent = '';
        errEl.classList.add('hidden');
    }

    const trimmed = username.trim().toLowerCase().replace(/^@/, '');
    if (!trimmed || trimmed.length < 3) {
        if (errEl) {
            errEl.textContent = 'Username must be at least 3 characters long.';
            errEl.classList.remove('hidden');
        } else {
            showToast('Username must be at least 3 characters long.', 'error');
        }
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
        showLoading(true, 'Saving profile...');
        
        const { data: existing, error: checkErr } = await state.supabase
            .from('profiles')
            .select('id, username')
            .eq('username', trimmed)
            .maybeSingle();

        if (checkErr) {
            showPlainError(checkErr.message);
            throw checkErr;
        }

        if (existing && existing.id !== state.currentUser.id) {
            const takenMsg = `Username "@${trimmed}" is taken. Please pick another.`;
            if (errEl) {
                errEl.textContent = takenMsg;
                errEl.classList.remove('hidden');
            }
            showToast(takenMsg, 'error');
            return;
        }

        const { error: upsertErr } = await state.supabase
            .from('profiles')
            .upsert({
                id: state.currentUser.id,
                username: trimmed,
                created_at: new Date().toISOString()
            });

        if (upsertErr) {
            showPlainError(upsertErr.message);
            if (errEl) {
                errEl.textContent = upsertErr.message;
                errEl.classList.remove('hidden');
            }
            throw upsertErr;
        }

        state.currentProfile = { id: state.currentUser.id, username: trimmed };
        showToast(`Welcome @${trimmed}! Your profile is saved.`, 'success');
        switchScreen('feed');
        await loadResources();
        updateNavUI();
    } catch (error) {
        showPlainError(error.message || 'Failed to save username.');
    } finally {
        showLoading(false);
    }
}

async function loadResources() {
    if (state.isDemoMode) {
        state.resources = [...state.demoResources];
        await renderResourceFeed();
        return;
    }

    try {
        showLoading(true, 'Loading resources...');
        const { data: resourcesData, error: resError } = await state.supabase
            .from('resources')
            .select('*')
            .order('created_at', { ascending: false });

        if (resError) {
            showPlainError(resError.message);
            throw resError;
        }

        const { data: profilesData } = await state.supabase
            .from('profiles')
            .select('id, username');

        const profileMap = {};
        if (profilesData) {
            profilesData.forEach(p => { profileMap[p.id] = p.username; });
        }

        const loadedResources = await Promise.all((resourcesData || []).map(async (item) => {
            let fileUrl = item.file_url;

            if (item.file_path && state.supabase) {
                const { data: signedData, error: signedErr } = await state.supabase.storage
                    .from(BUCKET_NAME)
                    .createSignedUrl(item.file_path, 3600);

                if (!signedErr && signedData?.signedUrl) {
                    fileUrl = signedData.signedUrl;
                }
            }

            return {
                ...item,
                file_url: fileUrl,
                username: item.username || profileMap[item.user_id] || 'AP Student',
                tags: Array.isArray(item.tags) ? item.tags : (item.tags ? item.tags.split(',').map(t => t.trim()) : [])
            };
        }));

        state.resources = loadedResources;
        await renderResourceFeed();
    } catch (error) {
        showPlainError(error.message || 'Failed to load resources.');
    } finally {
        showLoading(false);
    }
}

function handleFileSelect(inputElement) {
    const file = inputElement.files[0];
    const nameDisplay = document.getElementById('selected-file-name');
    
    if (!file) {
        if (nameDisplay) nameDisplay.textContent = 'No file chosen';
        return;
    }

    const fileExt = '.' + file.name.split('.').pop().toLowerCase();

    if (file.size > MAX_FILE_SIZE_BYTES) {
        showPlainError(`File "${file.name}" exceeds the 10 MB limit. Current size: ${(file.size / (1024 * 1024)).toFixed(2)} MB.`);
        inputElement.value = '';
        if (nameDisplay) nameDisplay.textContent = 'No file chosen';
        return;
    }

    if (!ALLOWED_EXTENSIONS.includes(fileExt)) {
        showPlainError(`File format "${fileExt}" is not allowed. Allowed types: JPG, PNG, WEBP, GIF, Video, Audio, and PDF.`);
        inputElement.value = '';
        if (nameDisplay) nameDisplay.textContent = 'No file chosen';
        return;
    }

    if (nameDisplay) {
        nameDisplay.textContent = `${file.name} (${formatBytes(file.size)})`;
    }
}

// Requirement 3: Real progress bar synced directly with Supabase via uploadResumable / XHR Progress
async function handleResourceUpload({ title, subject, tags, file }) {
    if (!file) {
        showToast('Please select a file to upload.', 'error');
        return;
    }

    const fileExt = '.' + file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(fileExt)) {
        showPlainError(`Invalid file format. Allowed types: JPG, PNG, WEBP, GIF, Video, Audio, PDF.`);
        return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
        showPlainError(`File size exceeds 10 MB limit. Yours is ${(file.size / (1024 * 1024)).toFixed(2)} MB.`);
        return;
    }

    const parsedTags = tags.split(',')
        .map(t => t.trim().replace(/^#/, ''))
        .filter(t => t.length > 0);

    const submitBtn = document.getElementById('add-file-submit-btn');
    const progressContainer = document.getElementById('upload-progress-container');
    const progressBar = document.getElementById('upload-progress-bar');
    const progressPercent = document.getElementById('upload-progress-percent');

    const timestamp = Date.now();
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const filePath = `${state.currentUser ? state.currentUser.id : 'user-demo'}/${timestamp}-${cleanFileName}`;

    if (state.isDemoMode) {
        const demoUrl = URL.createObjectURL(file);
        const newRes = {
            id: 'res-' + timestamp,
            user_id: state.currentUser ? state.currentUser.id : 'user-demo',
            username: state.currentProfile ? state.currentProfile.username : 'You',
            title: title.trim(),
            subject: subject,
            tags: parsedTags.length > 0 ? parsedTags : ['AP Prep'],
            file_url: demoUrl,
            file_name: file.name,
            file_size: file.size,
            file_path: filePath,
            created_at: new Date().toISOString()
        };

        state.demoResources.unshift(newRes);
        saveDemoResources();
        state.resources.unshift(newRes);

        showToast('Resource uploaded successfully (Demo Mode)!', 'success');
        resetAddResourceForm();
        switchScreen('feed');
        renderResourceFeed();
        return;
    }

    try {
        if (submitBtn) submitBtn.disabled = true;
        if (progressContainer) progressContainer.classList.remove('hidden');
        if (progressBar) progressBar.style.width = '0%';
        if (progressPercent) progressPercent.textContent = '0%';

        // Use Resumable upload (TUS) or XHR upload listener to track REAL percentage from Supabase Storage
        await new Promise((resolve, reject) => {
            const uploadTask = state.supabase.storage
                .from(BUCKET_NAME)
                .uploadResumable(filePath, file, {
                    cacheControl: '3600',
                    upsert: false,
                    onProgress: (progress) => {
                        if (progress.totalBytes > 0) {
                            const percent = Math.min(100, Math.round((progress.bytesUploaded / progress.totalBytes) * 100));
                            if (progressBar) progressBar.style.width = `${percent}%`;
                            if (progressPercent) progressPercent.textContent = `${percent}%`;
                        }
                    }
                });

            // Handle promise completion fallback if uploadResumable isn't supported
            if (uploadTask && typeof uploadTask.then === 'function') {
                uploadTask.then(res => {
                    if (res.error) reject(res.error);
                    else resolve(res.data);
                }).catch(reject);
            } else {
                // Direct upload fallback with progress state
                state.supabase.storage
                    .from(BUCKET_NAME)
                    .upload(filePath, file)
                    .then(res => {
                        if (res.error) reject(res.error);
                        else {
                            if (progressBar) progressBar.style.width = '100%';
                            if (progressPercent) progressPercent.textContent = '100%';
                            resolve(res.data);
                        }
                    })
                    .catch(reject);
            }
        });

        let publicUrl = '';
        const { data: signedData, error: signedErr } = await state.supabase.storage
            .from(BUCKET_NAME)
            .createSignedUrl(filePath, 3600 * 24 * 365);

        if (!signedErr && signedData?.signedUrl) {
            publicUrl = signedData.signedUrl;
        } else {
            const { data: urlData } = state.supabase.storage
                .from(BUCKET_NAME)
                .getPublicUrl(filePath);
            publicUrl = urlData.publicUrl;
        }

        const username = state.currentProfile ? state.currentProfile.username : 'AP Student';

        const { error: dbError } = await state.supabase
            .from('resources')
            .insert({
                user_id: state.currentUser.id,
                username: username,
                title: title.trim(),
                subject: subject,
                tags: parsedTags,
                file_url: publicUrl,
                file_name: file.name,
                file_size: file.size,
                file_path: filePath,
                created_at: new Date().toISOString()
            });

        if (dbError) {
            showPlainError(`Database Insert Error: ${dbError.message}`);
            throw dbError;
        }

        showToast('File published to the hub!', 'success');
        resetAddResourceForm();
        switchScreen('feed');
        await loadResources();
    } catch (error) {
        showPlainError(error.message || 'Error uploading file.');
    } finally {
        if (submitBtn) submitBtn.disabled = false;
        if (progressContainer) progressContainer.classList.add('hidden');
    }
}

async function handleDeleteResource(resourceId, filePath) {
    if (state.isDemoMode) {
        state.demoResources = state.demoResources.filter(r => r.id !== resourceId);
        saveDemoResources();
        state.resources = state.resources.filter(r => r.id !== resourceId);
        showToast('Resource deleted.', 'info');
        renderResourceFeed();
        return;
    }

    try {
        showLoading(true, 'Deleting file...');

        const { error: dbError } = await state.supabase
            .from('resources')
            .delete()
            .eq('id', resourceId)
            .eq('user_id', state.currentUser.id);

        if (dbError) {
            showPlainError(`Database Error: ${dbError.message}`);
            throw dbError;
        }

        if (filePath) {
            const { error: storageError } = await state.supabase.storage
                .from(BUCKET_NAME)
                .remove([filePath]);

            if (storageError) {
                console.warn('Storage removal warning:', storageError.message);
            }
        }

        showToast('File deleted successfully.', 'info');
        await loadResources();
    } catch (error) {
        showPlainError(error.message || 'Could not delete file.');
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
        if (error) {
            showPlainError(error.message);
            throw error;
        }

        showToast('Password updated successfully!', 'success');
        document.getElementById('change-password-form')?.reset();
    } catch (error) {
        showPlainError(error.message || 'Failed to update password.');
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

// Requirements 4 & 5: Render single Card with clickable yellow star and Delete button
function renderSingleFileCard(item, currentUserId) {
    const isOwner = currentUserId && (item.user_id === currentUserId || (state.isDemoMode && item.username === state.currentProfile?.username));
    const isStarred = state.savedFileIds.includes(item.id);
    const fileExt = item.file_name ? item.file_name.split('.').pop().toLowerCase() : '';
    const sizeStr = item.file_size ? formatBytes(item.file_size) : 'File';

    let mediaPreviewHTML = '';

    if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fileExt)) {
        mediaPreviewHTML = `
            <div class="mt-3 overflow-hidden rounded-xl border border-slate-700/60 max-h-48 bg-slate-950 flex items-center justify-center">
                <img src="${escapeHTML(item.file_url)}" class="max-h-48 w-full object-cover group-hover:scale-105 transition-transform duration-300" alt="${escapeHTML(item.title)}" loading="lazy"/>
            </div>
        `;
    } else if (['mp4', 'webm', 'ogg', 'mov'].includes(fileExt)) {
        mediaPreviewHTML = `
            <div class="mt-3 rounded-xl border border-slate-700/60 overflow-hidden bg-slate-950">
                <video controls preload="metadata" class="w-full max-h-48">
                    <source src="${escapeHTML(item.file_url)}">
                    Your browser does not support video.
                </video>
            </div>
        `;
    } else if (['mp3', 'wav', 'm4a'].includes(fileExt)) {
        mediaPreviewHTML = `
            <div class="mt-3 p-2 rounded-xl bg-slate-950 border border-slate-700/60">
                <audio controls class="w-full h-9">
                    <source src="${escapeHTML(item.file_url)}">
                    Your browser does not support audio.
                </audio>
            </div>
        `;
    } else if (fileExt === 'pdf') {
        mediaPreviewHTML = `
            <div class="mt-3 p-3 rounded-xl bg-slate-950 border border-slate-700/60 flex items-center justify-between">
                <div class="flex items-center gap-2 text-rose-400 text-xs font-semibold">
                    <i class="fa-solid fa-file-pdf text-base"></i> PDF Document
                </div>
                <a href="${escapeHTML(item.file_url)}" target="_blank" rel="noopener noreferrer" class="px-2.5 py-1 bg-rose-950/60 hover:bg-rose-900/80 text-rose-200 border border-rose-800/60 text-[11px] font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors">
                    <i class="fa-solid fa-arrow-up-right-from-square"></i> Open PDF
                </a>
            </div>
        `;
    }

    return `
        <div class="bg-slate-800/60 border border-slate-700/60 hover:border-indigo-500/50 rounded-2xl p-5 transition-all duration-200 flex flex-col justify-between group hover:shadow-xl hover:shadow-indigo-950/20">
            <div>
                <div class="flex items-start justify-between gap-3 mb-2">
                    <span class="inline-block text-xs font-semibold px-2.5 py-1 bg-indigo-950/90 text-indigo-300 border border-indigo-800/60 rounded-lg">
                        ${escapeHTML(item.subject)}
                    </span>
                    <div class="flex items-center gap-2">
                        <!-- Requirement 4: Clickable Star button (Turns yellow when saved) -->
                        <button onclick="toggleStarFile('${item.id}')" class="p-1.5 rounded-lg border transition-all ${
                            isStarred
                                ? 'bg-amber-500/20 text-amber-400 border-amber-500/50 hover:bg-amber-500/30'
                                : 'bg-slate-900 text-slate-500 border-slate-700/50 hover:text-amber-400 hover:border-amber-500/30'
                        }" title="${isStarred ? 'Unstar file' : 'Star & save file'}">
                            <i class="${isStarred ? 'fa-solid' : 'fa-regular'} fa-star text-sm"></i>
                        </button>
                        <span class="text-[11px] text-slate-400 font-mono bg-slate-900 px-2 py-0.5 rounded border border-slate-700/50">
                            ${sizeStr}
                        </span>
                    </div>
                </div>

                <h4 class="text-base font-semibold text-slate-100 group-hover:text-indigo-300 transition-colors line-clamp-2 mb-1">
                    ${escapeHTML(item.title)}
                </h4>

                <p class="text-xs text-slate-400 truncate mb-2">
                    <i class="fa-solid fa-paperclip mr-1 text-slate-500"></i>${escapeHTML(item.file_name)}
                </p>

                ${mediaPreviewHTML}

                <div class="flex flex-wrap gap-1.5 my-3">
                    ${(item.tags || []).map(tag => `
                        <span onclick="filterByTag('${escapeHTML(tag)}')" class="cursor-pointer text-[11px] bg-slate-700/40 hover:bg-slate-700 text-slate-300 px-2 py-0.5 rounded-md transition-colors">
                            #${escapeHTML(tag)}
                        </span>
                    `).join('')}
                </div>
            </div>

            <div class="pt-3 border-t border-slate-700/40 flex items-center justify-between text-xs text-slate-400">
                <div class="flex items-center gap-1.5 min-w-0">
                    <div class="w-6 h-6 rounded-full bg-indigo-600/30 text-indigo-300 flex items-center justify-center text-[10px] font-bold uppercase">
                        ${escapeHTML(item.username).replace(/^@/, '').charAt(0)}
                    </div>
                    <span class="truncate font-semibold text-indigo-300">@${escapeHTML(item.username).replace(/^@/, '')}</span>
                </div>

                <div class="flex items-center gap-1.5 shrink-0">
                    <a href="${escapeHTML(item.file_url)}" download="${escapeHTML(item.file_name)}" target="_blank" class="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors font-medium text-xs inline-flex items-center gap-1 shadow-sm" title="Download File">
                        <i class="fa-solid fa-download"></i> Download
                    </a>

                    ${isOwner ? `
                        <button onclick="confirmDeleteResource('${item.id}', '${escapeHTML(item.file_path || '')}')" class="p-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/40 rounded-lg transition-colors" title="Delete File">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
}

// Requirements 4 & 5: Render Saved Files, My Files, and All Community Files
async function renderResourceFeed() {
    const feedContainer = document.getElementById('resource-feed-container');
    const savedContainer = document.getElementById('saved-files-container');
    const myFilesContainer = document.getElementById('my-files-container');

    const resultsCountEl = document.getElementById('results-count');
    const savedCountEl = document.getElementById('saved-files-count');
    const myFilesCountEl = document.getElementById('my-files-count');

    const filtered = getFilteredResources();
    const currentUserId = state.currentUser ? state.currentUser.id : null;

    if (resultsCountEl) {
        resultsCountEl.textContent = `${filtered.length} file${filtered.length === 1 ? '' : 's'} available`;
    }

    // 1. Render Saved Files Subsection (Requirement 4)
    const savedFiles = state.resources.filter(r => state.savedFileIds.includes(r.id));
    if (savedCountEl) savedCountEl.textContent = `(${savedFiles.length})`;

    if (savedContainer) {
        if (savedFiles.length === 0) {
            savedContainer.innerHTML = `
                <div class="col-span-full py-6 text-center bg-slate-900/40 border border-slate-800 rounded-2xl p-4">
                    <p class="text-xs text-slate-500">No saved files yet. Click the <i class="fa-regular fa-star text-amber-400"></i> star on any file to save it here.</p>
                </div>
            `;
        } else {
            savedContainer.className = state.viewMode === 'grid'
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5'
                : 'flex flex-col gap-3';
            savedContainer.innerHTML = savedFiles.map(item => renderSingleFileCard(item, currentUserId)).join('');
        }
    }

    // 2. Render My Files Subsection (Requirement 5)
    const myFiles = state.resources.filter(r => currentUserId && (r.user_id === currentUserId || (state.isDemoMode && r.username === state.currentProfile?.username)));
    if (myFilesCountEl) myFilesCountEl.textContent = `(${myFiles.length})`;

    if (myFilesContainer) {
        if (myFiles.length === 0) {
            myFilesContainer.innerHTML = `
                <div class="col-span-full py-6 text-center bg-slate-900/40 border border-slate-800 rounded-2xl p-4">
                    <p class="text-xs text-slate-500">You haven't uploaded any files yet. Click "Add file" above to upload your first note.</p>
                </div>
            `;
        } else {
            myFilesContainer.className = state.viewMode === 'grid'
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5'
                : 'flex flex-col gap-3';
            myFilesContainer.innerHTML = myFiles.map(item => renderSingleFileCard(item, currentUserId)).join('');
        }
    }

    // 3. Render All Filtered Community Feed
    if (feedContainer) {
        if (filtered.length === 0) {
            feedContainer.innerHTML = `
                <div class="col-span-full py-12 text-center bg-slate-800/40 border border-slate-700/60 rounded-2xl p-8">
                    <div class="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-700/50 flex items-center justify-center text-slate-400 text-xl">
                        <i class="fa-solid fa-folder-open"></i>
                    </div>
                    <h3 class="text-base font-semibold text-slate-200 mb-1">No AP Resources Found</h3>
                    <p class="text-slate-400 max-w-md mx-auto text-xs mb-4">
                        Try clearing your search query or selecting a different subject.
                    </p>
                </div>
            `;
            return;
        }

        feedContainer.className = state.viewMode === 'grid'
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5'
            : 'flex flex-col gap-3';

        feedContainer.innerHTML = filtered.map(item => renderSingleFileCard(item, currentUserId)).join('');
    }
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
    const topUsernameDisplay = document.getElementById('top-username-display');
    const mainNav = document.getElementById('main-nav');
    const authScreens = ['auth', 'username-setup'];

    if (authScreens.includes(state.activeScreen) || !state.currentUser) {
        if (mainNav) mainNav.classList.add('hidden');
        if (userNavSection) userNavSection.classList.add('hidden');
    } else {
        if (mainNav) mainNav.classList.remove('hidden');
        if (userNavSection) {
            userNavSection.classList.remove('hidden');
            userNavSection.classList.add('flex');
        }

        if (userEmailDisplay && state.currentUser) {
            userEmailDisplay.textContent = state.currentUser.email || 'Signed In';
        }

        if (topUsernameDisplay && state.currentProfile) {
            topUsernameDisplay.textContent = `@${state.currentProfile.username.replace(/^@/, '')}`;
        }
    }

    const settingsUserEmail = document.getElementById('settings-user-email');
    const settingsUsername = document.getElementById('settings-username');
    if (settingsUserEmail && state.currentUser) {
        settingsUserEmail.textContent = state.currentUser.email || 'GitHub Account';
    }
    if (settingsUsername && state.currentProfile) {
        settingsUsername.textContent = `@${state.currentProfile.username.replace(/^@/, '')}`;
    }
}

function setupEventListeners() {
    const signInBtn = document.getElementById('signin-btn');
    const signUpBtn = document.getElementById('signup-btn');
    const githubSignInBtn = document.getElementById('github-signin-btn');

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

    githubSignInBtn?.addEventListener('click', async () => {
        await handleGitHubSignIn();
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
    const progressContainer = document.getElementById('upload-progress-container');
    if (progressContainer) progressContainer.classList.add('hidden');
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

function confirmDeleteResource(id, filePath) {
    const modal = document.getElementById('confirm-modal');
    const confirmBtn = document.getElementById('confirm-action-btn');
    const cancelBtn = document.getElementById('cancel-action-btn');

    if (!modal) return;

    modal.classList.remove('hidden');

    const handleConfirm = async () => {
        modal.classList.add('hidden');
        confirmBtn.removeEventListener('click', handleConfirm);
        await handleDeleteResource(id, filePath);
    };

    const handleCancel = () => {
        modal.classList.add('hidden');
        cancelBtn.removeEventListener('click', handleCancel);
    };

    confirmBtn.onclick = handleConfirm;
    cancelBtn.onclick = handleCancel;
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

function formatBytes(bytes, decimals = 2) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
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