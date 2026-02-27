/**
 * Identity-Silo: Handles local profile persistence using IndexedDB
 */

const DB_NAME = 'CloaksIdentityDB';
const DB_VERSION = 1;
const STORE_NAME = 'identity';

const identityManager = {
    db: null,
    profile: {
        myId: '', // Unique persistent ID
        name: '',
        pronouns: '',
        photo: '',
        privacy: 'social' // 'social' or 'ghost'
    },

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };

            request.onsuccess = async (event) => {
                this.db = event.target.result;
                await this.loadProfile();
                this.bindUI();
                resolve();
            };

            request.onerror = () => reject(request.error);
        });
    },

    async loadProfile() {
        return new Promise((resolve) => {
            const transaction = this.db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get('user_profile');

            request.onsuccess = () => {
                if (request.result) {
                    this.profile = { ...this.profile, ...request.result };
                    console.log("👤 [Identity] Perfil local cargado:", this.profile.name, "| ID:", this.profile.myId);
                } else {
                    console.log("⚠️ [Identity] No hay perfil local. Usando identidad temporal.");
                    // Generate permanent ID
                    this.profile.myId = Math.random().toString(16).slice(2, 10);
                    this.saveProfile();
                }

                // Update global state
                if (window.Cudi && window.Cudi.state) {
                    window.Cudi.state.myId = this.profile.myId;
                }

                this.updateUI();
                resolve();
            };

            request.onerror = () => resolve();
        });
    },

    async saveProfile() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(this.profile, 'user_profile');

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    updateUI() {
        document.getElementById('profile-name').value = this.profile.name || '';
        document.getElementById('profile-pronouns').value = this.profile.pronouns || '';

        // Update Live Preview
        document.getElementById('preview-name-val').textContent = this.profile.name || 'Anonymous';
        document.getElementById('preview-pronouns-val').textContent = this.profile.pronouns || 'he/him';

        if (this.profile.photo) {
            document.getElementById('profile-avatar-preview').src = this.profile.photo;
            // Also update the small avatar in sidebar
            const sideAvatar = document.getElementById('user-avatar-small');
            if (sideAvatar) sideAvatar.src = this.profile.photo;
        }

        const privacyToggle = document.getElementById('privacy-toggle');
        if (privacyToggle) {
            privacyToggle.checked = this.profile.privacy === 'social';
            this.updatePrivacyLabel();
        }

        if (this.profile.name) {
            window.Cudi.state.localAlias = this.profile.name;
        }

        // Update global alias input if it exists
        const aliasInput = document.getElementById('aliasInput');
        if (aliasInput && this.profile.name) {
            aliasInput.value = this.profile.name;
        }
    },

    updatePrivacyLabel() {
        const label = document.getElementById('privacy-mode-label');
        if (!label) return;
        const isSocial = this.profile.privacy === 'social';
        label.textContent = isSocial ? 'Social Mode' : 'Ghost Mode';

        const dot = document.getElementById('preview-status-dot');
        if (dot) {
            dot.className = `preview-status-dot ${isSocial ? 'social' : 'ghost'}`;
        }
    },

    setupTabs() {
        const tabs = document.querySelectorAll('.settings-tab');
        const sections = document.querySelectorAll('.settings-section');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                if (tab.id === 'panic-btn-modal') return; // Handled separately

                const target = tab.dataset.target;

                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                sections.forEach(s => {
                    s.classList.toggle('hidden', s.id !== target);
                });
            });
        });
    },

    bindUI() {
        this.setupTabs();

        const nameInput = document.getElementById('profile-name');
        const pronounsInput = document.getElementById('profile-pronouns');
        const privacyToggle = document.getElementById('privacy-toggle');
        const photoInput = document.getElementById('profile-photo-input');
        const changeAvatarBtn = document.getElementById('change-avatar-btn');
        const exportBtn = document.getElementById('export-identity-btn');
        const saveBar = document.getElementById('settings-save-bar');
        const resetBtn = document.getElementById('reset-settings-btn');

        const showSaveBar = () => {
            if (saveBar) saveBar.classList.add('visible');
        };

        nameInput.addEventListener('input', (e) => {
            document.getElementById('preview-name-val').textContent = e.target.value || 'Anonymous';
            showSaveBar();
        });

        pronounsInput.addEventListener('input', (e) => {
            document.getElementById('preview-pronouns-val').textContent = e.target.value || 'he/him';
            showSaveBar();
        });

        privacyToggle.addEventListener('change', (e) => {
            const isSocial = e.target.checked;
            document.getElementById('privacy-mode-label').textContent = isSocial ? 'Social Mode' : 'Ghost Mode';
            const dot = document.getElementById('preview-status-dot');
            if (dot) dot.className = `preview-status-dot ${isSocial ? 'social' : 'ghost'}`;
            showSaveBar();
        });

        changeAvatarBtn.addEventListener('click', () => photoInput.click());

        photoInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    document.getElementById('profile-avatar-preview').src = event.target.result;
                    showSaveBar();
                    this.pendingPhoto = event.target.result;
                };
                reader.readAsDataURL(file);
            }
        });

        resetBtn.addEventListener('click', () => {
            this.updateUI();
            if (saveBar) saveBar.classList.remove('visible');
            this.pendingPhoto = null;
        });

        const saveSettingsBtn = document.getElementById('save-settings-btn');
        if (saveSettingsBtn) {
            saveSettingsBtn.addEventListener('click', async () => {
                // Profile Save
                this.profile.name = nameInput.value;
                this.profile.pronouns = pronounsInput.value;
                this.profile.privacy = privacyToggle.checked ? 'social' : 'ghost';
                if (this.pendingPhoto) this.profile.photo = this.pendingPhoto;
                await this.saveProfile();

                // General App Settings Save (Día 1/5)
                const stunSelect = document.getElementById('stun-select');
                const filesizeSelect = document.getElementById('filesize-select');
                const customStunInput = document.getElementById('custom-stun-input');

                if (window.saveSettings) {
                    window.saveSettings({
                        stun: stunSelect ? stunSelect.value : 'google',
                        customStun: (customStunInput && stunSelect.value === 'custom') ? customStunInput.value.trim() : "",
                        maxFileSize: filesizeSelect ? filesizeSelect.value : '0'
                    });
                }

                this.updateUI();
                if (saveBar) saveBar.classList.remove('visible');

                if (window.Cudi && window.Cudi.showToast) {
                    window.Cudi.showToast("Settings saved!", "success");
                }
            });
        }

        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportIdentity());
        }

        const panicBtn = document.getElementById('panic-btn-modal');
        if (panicBtn) {
            panicBtn.addEventListener('click', () => {
                if (confirm("WARNING: This will clear all local data, identities and history. Continue?")) {
                    localStorage.clear();
                    indexedDB.deleteDatabase(DB_NAME);
                    window.location.reload();
                }
            });
        }
    },

    exportIdentity() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.profile, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `identity_backup_${this.profile.name || 'user'}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    }
};

// Initialize when the script loads or via main.js
window.identityManager = identityManager;
document.addEventListener('DOMContentLoaded', () => {
    // Only init if we are not in a worker context
    if (typeof window !== 'undefined') {
        identityManager.init().catch(console.error);
    }
});
