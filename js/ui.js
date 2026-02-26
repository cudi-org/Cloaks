window.Cudi.ui = {
    init() {
        this.bindZeroTrace();
        this.renderRecentChats();
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
        if (!sidebar) return;

        const recent = await window.Cudi.opfs.getRecentChats();
        if (recent.length === 0) return;

        sidebar.innerHTML = '<h4>RECENT CHATS</h4>';
        recent.forEach(peerId => {
            const item = document.createElement('div');
            item.className = 'channel-item';
            item.textContent = peerId; // Could be alias later
            item.onclick = () => this.switchChat(peerId);

            // Status Indicator
            const online = window.Cudi.state.activeChats.has(peerId);
            item.style.color = online ? 'var(--accent-cyan)' : 'var(--text-muted)';

            sidebar.appendChild(item);
        });
    },

    switchChat(peerId) {
        if (!peerId || peerId === 'state') return;
        console.log(`📂 [OPFS] Intentando cargar historial de: ${peerId}`);

        window.Cudi.state.currentPeerId = peerId;
        document.getElementById('current-channel-name').textContent = peerId;
        this.updateChatHeader(peerId);
        // Load history
        window.Cudi.loadHistory(peerId).then(history => {
            const display = document.getElementById('messagesDisplay');
            if (!display) return;
            display.innerHTML = '';
            // history is guaranteed array by opfs.js fix
            history.forEach(msg => {
                window.Cudi.displayChatMessage(msg.content, msg.sender === window.Cudi.state.myId ? 'sent' : 'received', msg.sender);
            });
        });
    },

    updateChatHeader(peerId) {
        const peer = window.Cudi.state.peers.get(peerId);
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
        if (!list) return;

        list.innerHTML = '';
        const peers = window.Cudi.state.peers;
        count.textContent = peers.size;

        peers.forEach((peer, id) => {
            const item = document.createElement('div');
            item.className = 'member-item';

            const online = window.Cudi.state.activeChats.has(id);

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

