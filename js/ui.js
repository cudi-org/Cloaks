window.Cudi.ui = {
    init() {
        // Essential state protection
        if (window.Cudi && window.Cudi.state) {
            window.Cudi.state.peers = window.Cudi.state.peers || new Map();
            window.Cudi.state.activeChats = window.Cudi.state.activeChats || new Map();
            window.Cudi.state.activeFinds = window.Cudi.state.activeFinds || new Map();
        }
        this.bindZeroTrace();
        this.renderRecentChats();
        this.bindMobileSidebars();
        this.bindHomeButton();
    },

    bindHomeButton() {
        const btnHome = document.getElementById('btn-home');
        btnHome?.addEventListener('click', () => {
            // UI state
            window.Cudi.state.currentPeerId = null;

            // Toggle visibility
            document.getElementById('welcome-screen')?.classList.remove('hidden');
            document.getElementById('messagesDisplay')?.classList.add('hidden');
            document.getElementById('zonaTransferencia')?.classList.add('hidden');

            // Header reset
            document.getElementById('current-channel-name').textContent = 'welcome';
            document.getElementById('header-peer-info')?.classList.add('hidden');

            // Server icon active state
            document.querySelectorAll('.server-icon').forEach(i => i.classList.remove('active'));
            btnHome.classList.add('active');

            if (window.innerWidth <= 1024) {
                this.closeMobileSidebars();
            }
        });
    },

    closeMobileSidebars() {
        const shell = document.querySelector('.app-shell');
        const overlay = document.getElementById('sidebar-overlay');
        shell.classList.remove('menu-open', 'members-open');
        overlay.classList.add('hidden');
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

        // Close sidebar on item clicks (mobile)
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 1024) {
                if (e.target.closest('.channel-item') || e.target.closest('.server-icon')) {
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
            if (isActive) {
                inputArea.classList.add('zero-trace-active');
                if (!document.getElementById('zero-trace-warn')) {
                    const warn = document.createElement('div');
                    warn.id = 'zero-trace-warn';
                    warn.className = 'zero-trace-warning';
                    warn.textContent = 'Modo Zero-Trace activo: los mensajes morirán con esta pestaña';
                    inputArea.appendChild(warn);
                }
            } else {
                inputArea.classList.remove('zero-trace-active');
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

    async renderRecentChats() {
        const sidebar = document.getElementById('channel-list');
        const state = window.Cudi?.state;
        if (!sidebar || !state) return;

        // Ensure sub-objects exist
        state.peers = state.peers || new Map();
        state.activeChats = state.activeChats || new Map();
        state.activeFinds = state.activeFinds || new Map();

        // Index all files from OPFS
        const recent = await window.Cudi.opfs.getRecentChats();

        // Combine with active
        const activePeers = Array.from(state.activeChats ? state.activeChats.keys() : []);
        const allChats = Array.from(new Set([...activePeers, ...recent]));

        if (allChats.length === 0) {
            sidebar.innerHTML = '<div class="empty-state-msg">No recent conversations</div>';
            return;
        }

        sidebar.innerHTML = '<h4>CONVERSATIONS</h4>';
        for (const peerId of allChats) {
            if (!peerId || peerId === 'state') continue;

            // Try to get cached metadata
            const metadata = await window.Cudi.opfs.getContactMetadata(peerId);
            const peerState = state.peers ? state.peers.get(peerId) : null;

            const alias = (peerState && peerState.alias) || (metadata && metadata.alias) || peerId;
            const photo = (peerState && peerState.photo) || (metadata && metadata.photo) || './icons/logo.png';

            const item = document.createElement('div');
            item.className = `channel-item dm-item ${state.currentPeerId === peerId ? 'active' : ''}`;

            const online = state.activeChats.has(peerId);
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
                this.switchChat(peerId);
                this.renderRecentChats();
            };

            item.querySelector('.delete-chat-btn').onclick = async (e) => {
                e.stopPropagation();
                if (confirm(`Delete conversation with ${alias}?`)) {
                    await window.Cudi.opfs.deleteChat(peerId);
                    this.renderRecentChats();
                    if (window.Cudi.state.currentPeerId === peerId) {
                        document.getElementById('messagesDisplay').innerHTML = '';
                        document.getElementById('current-channel-name').textContent = 'Cloaks';
                    }
                }
            };

            sidebar.appendChild(item);
        }
    },

    switchChat(peerId) {
        if (!peerId || peerId === 'state') return;
        if (window.Cudi.state.currentPeerId === peerId) return;

        console.log(`📂 [OPFS] Intentando cargar historial de: ${peerId}`);

        window.Cudi.state.currentPeerId = peerId;

        // Toggle View: Show Chat, Hide Welcome
        document.getElementById('welcome-screen')?.classList.add('hidden');
        document.getElementById('messagesDisplay')?.classList.remove('hidden');
        document.getElementById('zonaTransferencia')?.classList.remove('hidden');

        // Update header
        document.getElementById('current-channel-name').textContent = peerId;
        this.updateChatHeader(peerId);

        // Load history from disco
        window.Cudi.loadHistory(peerId).then(history => {
            const display = document.getElementById('messagesDisplay');
            if (!display) return;
            display.innerHTML = '';

            if (history.length === 0) {
                display.innerHTML = '<div class="empty-state-msg">No messages here yet. Get the conversation started!</div>';
            }

            history.forEach(msg => {
                // Sender logic: Any message NOT from the peerId is assumed to be FROM ME
                // This handles same-browser testing where both tabs might share the same ID.
                const type = (msg.sender && msg.sender === peerId) ? 'received' : 'sent';
                window.Cudi.displayChatMessage(msg.content, type, msg.alias);
            });
        });

        // Connection logic: If offline, try to find peer
        const online = window.Cudi.state.activeChats.has(peerId);
        const input = document.getElementById('chatInput');
        if (!online) {
            // Iniciar reencuentro via helper con timeout
            window.Cudi.findPeer(peerId);

            // Disable input until connected
            if (input) {
                input.placeholder = "Esperando a que el peer se conecte...";
                input.disabled = true;
            }
        } else {
            if (input) {
                input.placeholder = `Message #${peerId}`;
                input.disabled = false;
            }
        }
    },

    updateChatHeader(peerId) {
        const state = window.Cudi?.state;
        if (!state?.peers) return;
        const peer = state.peers.get(peerId);
        const headerInfo = document.getElementById('header-peer-info');
        if (!peer || !headerInfo) return;

        headerInfo.classList.remove('hidden');
        document.getElementById('current-channel-name').textContent = peer.alias || peerId;
        document.getElementById('peer-pronouns').textContent = peer.pronouns ? `(${peer.pronouns})` : '';

        const spotify = document.getElementById('peer-spotify');
        if (peer.activity) {
            spotify.innerHTML = `<span class="spotify-dot"></span> ${peer.activity}`;
        } else {
            spotify.innerHTML = '';
        }
    },

    updateMemberSidebar() {
        const list = document.getElementById('member-list');
        const count = document.getElementById('peer-count');
        const state = window.Cudi?.state;
        if (!list || !state?.peers) return;

        list.innerHTML = '';
        const peers = state.peers;
        count.textContent = peers.size;

        peers.forEach((peer, id) => {
            const item = document.createElement('div');
            item.className = 'member-item';

            const online = state.activeChats.has(id);

            item.innerHTML = `
                <div class="user-avatar-wrapper">
                    <img src="${peer.photo || './icons/logo.png'}" class="avatar-small">
                    <span class="status-dot ${online ? 'social' : 'ghost'}"></span>
                </div>
                <div class="member-name">${peer.alias || id}</div>
            `;
            list.appendChild(item);
        });
    },

    displayChatMessage(message, type, alias) {
        const messagesDisplay = document.getElementById("messagesDisplay");
        if (!messagesDisplay) return;

        const item = document.createElement("div");
        item.className = `message-item ${type}`;

        // Get avatar from state or currentpeer
        let avatarSrc = "./icons/logo.png";
        if (type === "sent") {
            avatarSrc = document.getElementById('user-avatar-small')?.src || "./icons/logo.png";
        } else {
            const state = window.Cudi?.state;
            const peer = state?.peers ? state.peers.get(window.Cudi.state.currentPeerId) : null;
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
        text.textContent = message;

        content.appendChild(header);
        content.appendChild(text);

        item.appendChild(avatar);
        item.appendChild(content);

        messagesDisplay.appendChild(item);
        messagesDisplay.scrollTop = messagesDisplay.scrollHeight;
    },

    displayFileDownload(filename, url, type, alias) {
        const messagesDisplay = document.getElementById("messagesDisplay");
        if (!messagesDisplay) return;

        const item = document.createElement("div");
        item.className = `message-item ${type}`;

        const avatar = document.createElement("img");
        avatar.className = "msg-avatar";
        avatar.src = (type === "sent") ? (document.getElementById('user-avatar-small')?.src || "./icons/logo.png") : "./icons/logo.png";

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
        wrapper.style.backgroundColor = "var(--bg-input)";
        wrapper.style.padding = "12px";
        wrapper.style.borderRadius = "8px";
        wrapper.style.marginTop = "4px";

        const fileMeta = document.createElement("div");
        fileMeta.style.display = "flex";
        fileMeta.style.alignItems = "center";
        fileMeta.style.gap = "12px";

        const fileInfo = document.createElement("div");
        fileInfo.innerHTML = `<div style="color: var(--text-light); font-weight: 600;">${filename}</div>`;

        const dlBtn = document.createElement("button");
        dlBtn.textContent = "Download";
        dlBtn.className = "Discord-btn-primary";
        dlBtn.style.padding = "4px 12px";
        dlBtn.style.width = "auto";
        dlBtn.style.marginTop = "8px";
        dlBtn.onclick = () => {
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            a.click();
        };

        fileMeta.appendChild(fileInfo);
        wrapper.appendChild(fileMeta);
        wrapper.appendChild(dlBtn);

        content.appendChild(header);
        content.appendChild(wrapper);

        item.appendChild(avatar);
        item.appendChild(content);

        messagesDisplay.appendChild(item);
        messagesDisplay.scrollTop = messagesDisplay.scrollHeight;
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
                <button class="discord-btn-primary" id="accept-file-btn">💾 Save to Disk</button>
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

// Aliases for compatibility
window.Cudi.displayChatMessage = (m, t, a) => window.Cudi.ui.displayChatMessage(m, t, a);
window.Cudi.displayFileDownload = (f, u, t, a, v) => window.Cudi.ui.displayFileDownload(f, u, t, a, v);
window.Cudi.displayIncomingFileRequest = (f, s, o) => window.Cudi.ui.displayIncomingFileRequest(f, s, o);

// Toast Notifications
window.showToast = function (message, type = "info") {
    console.log(`🍞 [Toast] [${type}]:`, message);
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

