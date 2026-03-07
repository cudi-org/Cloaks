window.Cudi.ui = {
    init() {
        if (window.Cudi && window.Cudi.state) {
            window.Cudi.state.peers = window.Cudi.state.peers || new Map();
            window.Cudi.state.activeChats = window.Cudi.state.activeChats || new Map();
            window.Cudi.state.activeFinds = window.Cudi.state.activeFinds || new Map();
        }

        const attachBtn = document.querySelector('.attach-btn');
        if (attachBtn) {
            attachBtn.onclick = (e) => {
                e.preventDefault();
                const fInput = document.getElementById('fileInput');
                if (fInput) {
                    if (fInput.disabled) {
                        window.Cudi.showToast("Connection not ready. Please wait...", "info");
                    } else {
                        fInput.click();
                    }
                } else {
                    console.error("Critical: #fileInput not found in DOM");
                }
            };
        }

        this.bindZeroTrace();
        this.renderRecentChats();
        this.bindMobileSidebars();
        this.bindMobileNavbar();
        this.bindHomeButton();
        this.bindDevTools();

        if (window.Cudi.connectToSignaling) {
            window.Cudi.connectToSignaling();
        }
    },

    bindMobileNavbar() {
        const homeNav = document.getElementById('nav-home');
        const commsNav = document.getElementById('nav-communities');
        const membersNav = document.getElementById('nav-members');
        const settingsNav = document.getElementById('nav-settings');

        const setActive = (el) => {
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            el.classList.add('active');
        };

        homeNav?.addEventListener('click', () => {
            setActive(homeNav);
            document.getElementById('btn-home')?.click();
        });

        commsNav?.addEventListener('click', () => {
            setActive(commsNav);
            const shell = document.querySelector('.app-shell');
            const overlay = document.getElementById('sidebar-overlay');
            shell.classList.toggle('menu-open');
            shell.classList.remove('members-open');
            if (shell.classList.contains('menu-open')) overlay.classList.remove('hidden');
            else overlay.classList.add('hidden');
        });

        membersNav?.addEventListener('click', () => {
            if (!window.Cudi.state.currentPeerId && !window.communityManager?.currentCommunity) {
                window.Cudi.showToast("Open a chat or community first", "info");
                return;
            }
            setActive(membersNav);
            const shell = document.querySelector('.app-shell');
            const overlay = document.getElementById('sidebar-overlay');
            shell.classList.toggle('members-open');
            shell.classList.remove('menu-open');
            if (shell.classList.contains('members-open')) overlay.classList.remove('hidden');
            else overlay.classList.add('hidden');
        });

        settingsNav?.addEventListener('click', () => {
            setActive(settingsNav);
            document.getElementById('settings-btn')?.click();
        });
    },

    bindHomeButton() {
        const btnHome = document.getElementById('btn-home');
        btnHome?.addEventListener('click', () => {
            window.Cudi.state.currentPeerId = null;
            if (window.communityManager) {
                window.communityManager.currentCommunity = null;
                window.communityManager.currentChannel = null;
            }

            const sidebar = document.getElementById('channel-list');
            if (sidebar) sidebar.innerHTML = '';

            document.getElementById('welcome-screen')?.classList.remove('hidden');
            document.getElementById('messagesDisplay')?.classList.add('hidden');
            document.querySelector('.chat-input-area')?.classList.add('hidden');

            document.getElementById('community-settings-btn')?.classList.add('hidden');
            const hashEl = document.querySelector('.chat-header .hash');
            if (hashEl) hashEl.style.display = 'none';

            const nameDisplay = document.getElementById('community-name-display');
            if (nameDisplay) nameDisplay.textContent = "Cloaks";

            document.getElementById('current-channel-name').textContent = '';
            document.getElementById('header-peer-info')?.classList.add('hidden');
            document.getElementById('btn-voice-call')?.classList.add('hidden');
            document.getElementById('btn-video-call')?.classList.add('hidden');

            document.querySelectorAll('.server-icon').forEach(i => i.classList.remove('active'));
            btnHome.classList.add('active');

            this.renderRecentChats();

            if (window.innerWidth <= 1024) {
                this.closeMobileSidebars();
            }

            if (window.Cudi.resetOnboarding) {
                window.Cudi.resetOnboarding();
            }
        });
    },

    closeMobileSidebars() {
        const shell = document.querySelector('.app-shell');
        const overlay = document.getElementById('sidebar-overlay');
        shell.classList.remove('menu-open', 'members-open');
        overlay.classList.add('hidden');
    },

    bindDevTools() {
        const btnClear = document.getElementById('btn-clear-opfs');
        btnClear?.addEventListener('click', async () => {
            if (confirm("Are you sure you want to delete ALL history and local cache? (Recommended for development only)")) {
                await window.Cudi.opfs.clearAllHistory();
                window.Cudi.showToast("Message and contact cache deleted.", "success");
                setTimeout(() => window.location.reload(), 1000);
            }
        });
    },

    bindMobileSidebars() {
        const shell = document.querySelector('.app-shell');
        const menuBtn = document.getElementById('mobile-menu-btn');
        const membersBtn = document.getElementById('mobile-members-btn');
        const overlay = document.getElementById('sidebar-overlay');

        const closeAll = () => this.closeMobileSidebars();

        menuBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            shell.classList.toggle('menu-open');
            shell.classList.remove('members-open');
            if (shell.classList.contains('menu-open')) overlay.classList.remove('hidden');
            else overlay.classList.add('hidden');
        });

        membersBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            shell.classList.toggle('members-open');
            shell.classList.remove('menu-open');
            if (shell.classList.contains('members-open')) overlay.classList.remove('hidden');
            else overlay.classList.add('hidden');
        });

        overlay?.addEventListener('click', closeAll);

        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 1024) {
                if (e.target.closest('.channel-item')) {
                    closeAll();
                }
            }
        });
    },

    bindZeroTrace() {
        const btn = document.getElementById('zero-trace-btn');
        const inputArea = document.querySelector('.chat-input-area');

        const updateUI = () => {
            const isActive = window.Cudi.state.isZeroTrace;
            if (btn) btn.classList.toggle('active', isActive);
            if (window.communityManager) window.communityManager.zeroTraceMode = isActive;

            if (isActive) {
                inputArea?.classList.add('zero-trace-active');
                if (!document.getElementById('zero-trace-warn')) {
                    const warn = document.createElement('div');
                    warn.id = 'zero-trace-warn';
                    warn.className = 'zero-trace-warning';
                    warn.textContent = 'Modo Zero-Trace activo: los mensajes morirán con esta pestaña';
                    inputArea?.appendChild(warn);
                }
            } else {
                inputArea?.classList.remove('zero-trace-active');
                document.getElementById('zero-trace-warn')?.remove();
            }
        };

        btn?.addEventListener('click', () => {
            window.Cudi.state.isZeroTrace = !window.Cudi.state.isZeroTrace;
            localStorage.setItem('cloaks_zero_trace', window.Cudi.state.isZeroTrace);
            updateUI();
            window.Cudi.showToast(window.Cudi.state.isZeroTrace ? "Zero-Trace Enabled" : "Zero-Trace Disabled", "info");
        });

        updateUI();
    },

    renderGeneration: 0,
    async renderRecentChats() {
        const sidebar = document.getElementById('channel-list');
        const state = window.Cudi?.state;
        if (!sidebar || !state) return;

        const currentGen = ++this.renderGeneration;

        sidebar.innerHTML = '<div class="empty-state-msg">Scanning conversations...</div>';

        state.peers = state.peers || new Map();
        state.activeChats = state.activeChats || new Map();
        state.activeFinds = state.activeFinds || new Map();

        try {
            const recent = await window.Cudi.opfs.getRecentChats();
            const cached = await window.Cudi.opfs.getAllCachedContacts();
            if (currentGen !== this.renderGeneration) return;

            const activePeers = Array.from(state.activeChats ? state.activeChats.keys() : []);
            const allChats = Array.from(new Set([...activePeers, ...recent, ...cached]));

            if (allChats.length === 0) {
                sidebar.innerHTML = '<div class="empty-state-msg">No recent conversations</div>';
                return;
            }

            sidebar.innerHTML = '<h4>CONVERSATIONS</h4>';
            for (const peerId of allChats) {
                if (!peerId || peerId === 'state') continue;

                const metadata = await window.Cudi.opfs.getContactMetadata(peerId);
                if (currentGen !== this.renderGeneration) return;
                const peerState = state.peers ? state.peers.get(peerId) : null;

                let alias = (peerState && peerState.alias) || (metadata && metadata.alias) || peerId;
                if (peerId === state.myId) alias += " (You)";
                const photo = (peerState && peerState.photo) || (metadata && metadata.photo) || './icons/logo_matrix_v2.png';

                const item = document.createElement('div');
                item.className = `channel-item dm-item ${state.currentPeerId === peerId ? 'active' : ''}`;
                item.setAttribute('data-id', peerId);

                const instance = state.activeChats.get(peerId);
                const online = instance && instance.dc && instance.dc.readyState === 'open';
                const searching = state.activeFinds.has(peerId);
                const statusClass = online ? 'social' : (searching ? 'searching' : 'ghost');

                item.innerHTML = `
                <div class="user-avatar-wrapper-mini">
                    <img src="${photo}" class="avatar-mini">
                    <span class="status-dot-mini ${statusClass}"></span>
                </div>
                <span class="channel-name">${alias}</span>
                <button class="delete-chat-btn" title="Delete conversation">×</button>
            `;

                item.querySelector('.channel-name').onclick = () => {
                    if (window.communityManager) {
                        window.communityManager.currentCommunity = null;
                        window.communityManager.currentChannel = null;
                    }

                    document.getElementById('community-settings-btn')?.classList.add('hidden');
                    const hashEl = document.querySelector('.chat-header .hash');
                    if (hashEl) hashEl.style.display = 'none';

                    const nameDisplay = document.getElementById('community-name-display');
                    if (nameDisplay) nameDisplay.textContent = "Home";

                    this.switchChat(peerId);
                    this.renderRecentChats();
                };

                item.querySelector('.delete-chat-btn').onclick = async (e) => {
                    e.stopPropagation();
                    if (confirm(`Delete conversation with ${alias}?`)) {
                        await window.Cudi.opfs.deleteChat(peerId);
                        this.renderRecentChats();
                        if (window.Cudi.state.currentPeerId === peerId) {
                            window.Cudi.state.currentPeerId = null;
                            document.getElementById('messagesDisplay')?.classList.add('hidden');
                            document.getElementById('welcome-screen')?.classList.remove('hidden');
                        }
                    }
                };
                sidebar.appendChild(item);
            }
        } catch {
            // Error safety
            sidebar.innerHTML = '<div class="empty-state-msg">Error loading conversations</div>';
        }
    },

    async renderMessagesFromDisk(peerId) {
        const history = await window.Cudi.loadHistory(peerId);
        const display = document.getElementById('messagesDisplay');
        if (!display) return;
        display.innerHTML = '';

        if (history.length === 0) {
            display.innerHTML = '<div class="empty-state-msg">No messages here yet. Get the conversation started!</div>';
        }

        history.forEach(msg => {
            const type = (msg.sender && msg.sender === peerId) ? 'received' : 'sent';
            if (msg.type === 'file') {
                window.Cudi.ui.displayFileDownload(msg.filename, '#', type, msg.alias);
            } else {
                window.Cudi.displayChatMessage(msg.content, type, msg.alias);
            }
        });
    },

    setChatStatus(peerId, status) {
        const input = document.getElementById('chatInput');
        const fInput = document.getElementById('fileInput');

        if (status === 'searching') {
            window.Cudi.findPeer(peerId);
            if (input && window.Cudi.state.currentPeerId === peerId) {
                input.placeholder = "Buscando contacto... (Localizando en red)";
                input.disabled = true;
            }
            if (fInput) fInput.disabled = true;
        } else if (status === 'connecting') {
            if (input && window.Cudi.state.currentPeerId === peerId) {
                input.placeholder = "Estableciendo túnel P2P seguro...";
                input.disabled = true;
            }
            if (fInput) fInput.disabled = true;
        } else if (status === 'online') {
            if (input && window.Cudi.state.currentPeerId === peerId) {
                const state = window.Cudi.state;
                const peer = state.peers ? state.peers.get(peerId) : null;
                const alias = peer ? (peer.alias || peerId) : peerId;
                input.placeholder = `Message #${alias}`;
                input.disabled = false;
            }
            if (fInput) fInput.disabled = false;
        }
        this.renderRecentChats();
    },

    async switchChat(peerId) {
        if (!peerId || peerId === 'state') return;
        if (window.Cudi.state.currentPeerId === peerId) return;

        window.Cudi.state.currentPeerId = peerId;

        document.getElementById('welcome-screen')?.classList.add('hidden');
        document.getElementById('messagesDisplay')?.classList.remove('hidden');
        document.getElementById('meeting-tools')?.classList.add('hidden');
        document.querySelector('.chat-input-area')?.classList.remove('hidden');

        document.getElementById('current-channel-name').textContent = peerId;
        this.updateChatHeader(peerId);

        await this.renderMessagesFromDisk(peerId);

        const instance = window.Cudi.state.activeChats.get(peerId);
        const isActuallyConnected = instance && instance.dc && instance.dc.readyState === 'open';

        if (!isActuallyConnected) {
            this.setChatStatus(peerId, 'searching');
        } else {
            this.setChatStatus(peerId, 'online');
        }
    },

    updateChatHeader(peerId) {
        const state = window.Cudi?.state;
        if (!state?.peers) return;
        const peer = state.peers.get(peerId);
        const headerInfo = document.getElementById('header-peer-info');

        let displayName = peer ? (peer.alias || peerId) : peerId;
        if (peerId === state.myId) displayName += " (You)";
        const nameEl = document.getElementById('current-channel-name');
        if (nameEl) nameEl.textContent = displayName;

        if (!peer || !headerInfo) return;

        headerInfo.classList.remove('hidden');
        document.getElementById('peer-pronouns').textContent = peer.pronouns ? `(${peer.pronouns})` : '';

        const presenceEl = document.getElementById('peer-activity');
        if (peer.activity) {
            presenceEl.textContent = peer.activity;
        } else {
            presenceEl.textContent = '';
        }

        document.getElementById('btn-voice-call')?.classList.remove('hidden');
        document.getElementById('btn-video-call')?.classList.remove('hidden');
    },

    async updateMemberSidebar() {
        if (!this.memberRenderGeneration) this.memberRenderGeneration = 0;
        const currentGen = ++this.memberRenderGeneration;

        const list = document.getElementById('member-list');
        const count = document.getElementById('peer-count');
        const state = window.Cudi?.state;
        if (!list || !state?.peers) return;

        list.innerHTML = '';
        const peers = state.peers;
        const otherPeers = Array.from(peers.entries()).filter(([id]) => id !== state.myId);
        count.textContent = otherPeers.length;

        for (const [id, peer] of otherPeers) {
            const isPermanent = await window.Cudi.opfs.isPermanentContact(id);
            if (currentGen !== this.memberRenderGeneration) return;

            const item = document.createElement('div');
            item.className = `member-item ${isPermanent ? 'permanent' : 'session'}`;

            const instance = state.activeChats.get(id);
            const online = instance && instance.dc && instance.dc.readyState === 'open';


            const saveBtn = (!isPermanent && id !== state.myId)
                ? `<button class="save-contact-mini" onclick="window.Cudi.opfs.savePermanentContact('${id}', '${peer.alias || id}')" title="Save to disk">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>
                   </button>`
                : '';

            item.innerHTML = `
                <div class="user-avatar-wrapper">
                    <img src="${peer.photo || './icons/logo_matrix_v2.png'}" class="avatar-small">
                    <span class="status-dot ${online ? 'social' : 'ghost'}"></span>
                </div>
                <div class="member-name-wrapper">
                    <div class="member-name">${(peer.alias || id) + (id === state.myId ? " (You)" : "")}</div>
                    <div class="member-badge">${isPermanent ? 'Sovereign' : 'Guest'}</div>
                </div>
                ${saveBtn}
            `;
            list.appendChild(item);
        }
    },

    displayChatMessage(message, type, alias) {
        const messagesDisplay = document.getElementById("messagesDisplay");
        if (!messagesDisplay) return;

        const item = document.createElement("div");
        item.className = `message-item ${type}`;

        let avatarSrc = "./icons/logo_matrix_v2.png";
        if (type === "sent") {
            avatarSrc = document.getElementById('user-avatar-small')?.src || "./icons/logo_matrix_v2.png";
        } else {
            const state = window.Cudi?.state;
            const peerId = alias || state?.currentPeerId;
            const peer = state?.peers ? state.peers.get(peerId) : null;
            if (peer && peer.photo) avatarSrc = peer.photo;
        }

        const avatar = document.createElement("img");
        avatar.className = "msg-avatar";
        avatar.src = avatarSrc;

        const content = document.createElement("div");
        content.className = "msg-content";

        const header = document.createElement("div");
        header.className = "msg-header";

        const author = document.createElement("span");
        author.className = "msg-author";
        author.textContent = alias || ((type === "sent") ? "You" : "Guest");

        const time = document.createElement("span");
        time.className = "msg-time";
        const now = new Date();
        time.textContent = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;

        header.appendChild(author);
        header.appendChild(time);

        const text = document.createElement("div");
        text.className = "msg-text";
        text.innerHTML = message;

        content.appendChild(header);
        content.appendChild(text);

        item.appendChild(avatar);
        item.appendChild(content);

        messagesDisplay.appendChild(item);
        messagesDisplay.scrollTop = messagesDisplay.scrollHeight;
    },

    displayFileDownload(filename, url, type, alias, verified = false) {
        const messagesDisplay = document.getElementById("messagesDisplay");
        if (!messagesDisplay) return;

        const item = document.createElement("div");
        item.className = `message-item ${type}`;
        item.dataset.filename = filename;
        item.dataset.type = type;

        const avatar = document.createElement("img");
        avatar.className = "msg-avatar";
        avatar.src = (type === "sent") ? (document.getElementById('user-avatar-small')?.src || "./icons/logo_matrix_v2.png") : "./icons/logo_matrix_v2.png";

        const content = document.createElement("div");
        content.className = "msg-content";

        const header = document.createElement("div");
        header.className = "msg-header";

        const author = document.createElement("span");
        author.className = "msg-author";
        author.textContent = alias || ((type === "sent") ? "You" : "Guest");

        const time = document.createElement("span");
        time.className = "msg-time";
        const now = new Date();
        time.textContent = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;

        header.appendChild(author);
        header.appendChild(time);

        const wrapper = document.createElement("div");
        wrapper.className = "media-wrapper";
        wrapper.style.backgroundColor = "rgba(0,0,0,0.2)";
        wrapper.style.padding = "10px";
        wrapper.style.borderRadius = "8px";
        wrapper.style.marginTop = "6px";
        wrapper.style.border = verified ? "1px solid var(--accent)" : "1px solid rgba(255,255,255,0.1)";
        wrapper.style.maxWidth = "min(400px, 100%)";
        wrapper.style.transition = "border-color 0.3s ease";

        const extension = filename.split('.').pop().toLowerCase();
        const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension);
        const isPDF = extension === 'pdf';

        if (isImage) {
            const img = document.createElement("img");
            img.src = url;
            img.style.maxWidth = "100%";
            img.style.maxHeight = "300px";
            img.style.borderRadius = "4px";
            img.style.display = "block";
            img.style.marginBottom = "10px";
            img.style.cursor = "pointer";
            img.onclick = () => window.open(url, '_blank');
            wrapper.appendChild(img);
        } else if (isPDF) {
            const iframe = document.createElement("iframe");
            iframe.src = url;
            iframe.style.width = "100%";
            iframe.style.height = "250px";
            iframe.style.border = "none";
            iframe.style.borderRadius = "4px";
            iframe.style.marginBottom = "10px";
            wrapper.appendChild(iframe);
        }

        const fileMeta = document.createElement("div");
        fileMeta.style.display = "flex";
        fileMeta.style.alignItems = "center";
        fileMeta.style.justifyContent = "space-between";
        fileMeta.style.gap = "12px";

        const fileInfo = document.createElement("div");
        fileInfo.style.display = "flex";
        fileInfo.style.alignItems = "center";
        fileInfo.style.gap = "8px";

        const tickSvg = verified ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="var(--accent)"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>` : '';

        fileInfo.innerHTML = `${tickSvg}<div style="color: var(--text-light); font-weight: 600; font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px;">${filename}</div>`;

        const dlBtn = document.createElement("button");
        dlBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="margin-right: 4px;"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg> Download`;
        dlBtn.className = "cloaks-btn-primary";
        dlBtn.style.padding = "4px 12px";
        dlBtn.style.width = "auto";
        dlBtn.style.fontSize = "0.8rem";
        dlBtn.style.display = "flex";
        dlBtn.style.alignItems = "center";
        dlBtn.onclick = () => {
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            a.click();
        };

        if (url === '#') {
            dlBtn.style.display = "none";
            fileInfo.innerHTML += `<div style="font-size: 0.75rem; opacity: 0.6; margin-top: 2px;">Session-only preview</div>`;
        }

        fileMeta.appendChild(fileInfo);
        fileMeta.appendChild(dlBtn);
        wrapper.appendChild(fileMeta);

        content.appendChild(header);
        content.appendChild(wrapper);

        item.appendChild(avatar);
        item.appendChild(content);

        messagesDisplay.appendChild(item);
        messagesDisplay.scrollTop = messagesDisplay.scrollHeight;
    },

    markFileAsVerified(filename, type) {
        const items = document.querySelectorAll(`.message-item[data-filename="${filename}"][data-type="${type}"]`);
        const item = items[items.length - 1];
        if (!item) return;

        const wrapper = item.querySelector('.media-wrapper');
        if (wrapper) wrapper.style.borderColor = "var(--accent)";

        const fileInfo = item.querySelector('.msg-content div[style*="display: flex"]');
        if (fileInfo && !fileInfo.querySelector('.verified-tick')) {
            const tick = document.createElement("span");
            tick.className = "verified-tick";
            tick.style.display = "flex";
            tick.style.alignItems = "center";
            tick.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="var(--accent)" style="margin-right: 8px;"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>`;
            fileInfo.prepend(tick);
        }
    },

    displayIncomingFileRequest(filename, size, onAccept) {
        const messagesDisplay = document.getElementById("messagesDisplay");
        if (!messagesDisplay) return;

        const container = document.createElement("div");
        container.className = "message-item received";
        container.innerHTML = `
            <div class="msg-content" style="background: var(--bg-input); padding: 15px; border-radius: 8px; border-left: 4px solid var(--accent-cyan);">
                <strong>📄 Incoming File Request</strong>
                <div style="font-size: 0.9rem; margin: 5px 0;">${filename} (${(size / 1024 / 1024).toFixed(2)} MB)</div>
                <button class="cloaks-btn-primary" id="accept-file-btn"> Save to Disk</button>
            </div>
        `;

        const btn = container.querySelector("#accept-file-btn");
        btn.onclick = async () => {
            btn.disabled = true;
            btn.textContent = "⏳ Initializing...";
            const result = await onAccept();
            if (result) {
                container.innerHTML = `<div class="msg-content" style="color: var(--status-green)">✅ Starting Download: ${filename}</div>`;
            } else {
                btn.disabled = false;
                btn.textContent = "💾 Save to Disk (Retry)";
            }
        };

        messagesDisplay.appendChild(container);
        messagesDisplay.scrollTop = messagesDisplay.scrollHeight;
    }
};

window.Cudi.displayChatMessage = (m, t, a) => window.Cudi.ui.displayChatMessage(m, t, a);
window.Cudi.displayFileDownload = (f, u, t, a, v) => window.Cudi.ui.displayFileDownload(f, u, t, a, v);
window.Cudi.displayIncomingFileRequest = (f, s, o) => window.Cudi.ui.displayIncomingFileRequest(f, s, o);

window.showToast = function (message, type = "info") {
    const toast = document.createElement('div');
    toast.className = `cloak-toast ${type}`;
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        toast.style.transition = 'all 0.5s ease';
        setTimeout(() => toast.remove(), 500);
    }, 3000);
};

window.Cudi.showToast = window.showToast;

document.addEventListener('DOMContentLoaded', () => {
    window.Cudi.ui.init();
});
