/**
 * Community Engine: Handles Cloak (JSON) community files and Peer Caching
 */

const communityManager = {
    currentCommunity: null,
    peerCache: [], // List of last known IPs

    init() {
        this.bindEvents();
        this.setupDragAndDrop();
    },

    bindEvents() {
        const createBtn = document.getElementById('btnCreateCommunity');
        const tabCommunity = document.getElementById('tabCommunity');

        if (createBtn) {
            createBtn.addEventListener('click', () => this.generateCommunity());
        }

        if (tabCommunity) {
            tabCommunity.addEventListener('click', () => {
                // Logic to switch to community view or prompt for file
                this.promptForCommunityFile();
            });
        }
    },

    setupDragAndDrop() {
        // Listen on the whole document for .json files
        document.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        document.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const files = e.dataTransfer.files;
            if (files.length > 0) {
                const file = files[0];
                if (file.name.endsWith('.json')) {
                    this.loadCommunityFromFile(file);
                }
            }
        });
    },

    promptForCommunityFile() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) this.loadCommunityFromFile(file);
        };
        input.click();
    },

    async generateCommunity() {
        const name = prompt("Community Name:", "New Cloak");
        if (!name) return;

        const community = {
            version: "1.0",
            type: "cloak-community",
            community_id: crypto.randomUUID(),
            name: name,
            created_at: new Date().toISOString(),
            encryption_key: await this.generateKey(),
            channels: [
                { id: "general", name: "general", type: "text" },
                { id: "voice", name: "voice-hq", type: "voice" },
                { id: "transfers", name: "deep-transfer", type: "transfer" }
            ],
            peer_cache: [] // Last known IPs
        };

        this.currentCommunity = community;
        this.downloadCommunityFile(community);
        this.activateCommunity(community);
    },

    async generateKey() {
        const key = await crypto.subtle.generateKey(
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );
        const exported = await crypto.subtle.exportKey("jwk", key);
        return exported.k; // Store the raw key material
    },

    loadCommunityFromFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const community = JSON.parse(e.target.result);
                if (community.type === 'cloak-community') {
                    this.activateCommunity(community);
                    showToast(`Connected to ${community.name}`, 'success');
                } else {
                    showToast("Invalid Cloak file", "error");
                }
            } catch (err) {
                console.error("Error parsing community file:", err);
                showToast("Error loading community", "error");
            }
        };
        reader.readAsText(file);
    },

    downloadCommunityFile(community) {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(community, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `${community.name.replace(/\s+/g, '_')}_cloak.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    },

    activateCommunity(community) {
        this.currentCommunity = community;
        console.log("Community Activated:", community);

        // Hide welcome screen, show messages area if first time
        document.getElementById('welcome-screen').classList.add('hidden');
        document.getElementById('messagesDisplay').classList.remove('hidden');

        // Update Top Header
        const nameDisplay = document.getElementById('community-name-display');
        if (nameDisplay) nameDisplay.textContent = community.name;

        // Add to Server Rail
        this.addCommunityToServerRail(community);

        // Render Channels
        this.renderChannels(community.channels);

        // Update footer profile
        this.updateSidebarProfile();

        // Peer Caching (Día 2): Try to reconnect
        this.reconnectToPeers(community.peer_cache);
    },

    addCommunityToServerRail(community) {
        const rail = document.getElementById('server-list');
        if (!rail) return;

        // Check if already there
        if (document.querySelector(`[data-id="${community.community_id}"]`)) return;

        const icon = document.createElement('div');
        icon.className = 'server-icon';
        icon.dataset.id = community.community_id;
        icon.title = community.name;
        icon.textContent = community.name.charAt(0).toUpperCase();
        icon.onclick = () => this.activateCommunity(community);

        rail.appendChild(icon);
    },

    renderChannels(channels) {
        const list = document.getElementById('channel-list');
        if (!list) return;
        list.innerHTML = '';
        channels.forEach(ch => {
            const div = document.createElement('div');
            div.className = `channel-item ${ch.type}`;
            div.textContent = ch.name;
            div.onclick = () => this.switchChannel(ch);
            list.appendChild(div);
        });
        // Select first channel by default
        if (channels.length > 0) this.switchChannel(channels[0]);
    },

    async switchChannel(channel) {
        console.log("Switching to channel:", channel);
        document.querySelectorAll('.channel-item').forEach(el => {
            el.classList.toggle('active', el.textContent === channel.name);
        });

        // Update Header Name
        const headerName = document.getElementById('current-channel-name');
        if (headerName) headerName.textContent = channel.name;

        // Update Chat Input Placeholder
        const chatInput = document.getElementById('chatInput');
        if (chatInput) chatInput.placeholder = `Message #${channel.name}`;

        // Update display
        const display = document.getElementById('messagesDisplay');
        if (display) display.innerHTML = '';

        // Load history from OPFS (Día 3)
        if (!this.zeroTraceMode) {
            await this.loadChannelHistory(channel.id);
        } else {
            if (display) display.innerHTML = '<div class="message-item system"><div class="msg-content"><div class="msg-text">Zero-Trace Mode Active: No history loaded.</div></div></div>';
        }
    },

    updateSidebarProfile() {
        const profile = window.identityManager ? window.identityManager.profile : null;
        if (profile) {
            const nameEl = document.getElementById('user-name-small');
            if (nameEl) nameEl.textContent = profile.name || 'Anonymous';

            const avatarEl = document.getElementById('user-avatar-small');
            if (avatarEl && profile.photo) avatarEl.src = profile.photo;

            const dot = document.getElementById('user-status-dot');
            if (dot) dot.className = `status-dot ${profile.privacy === 'social' ? 'active' : 'ghost'}`;
        }
    },

    // OPFS Persistence (Día 3)
    async saveMessageLocal(channelId, message) {
        if (this.zeroTraceMode) return;
        try {
            const root = await navigator.storage.getDirectory();
            const fileHandle = await root.getFileHandle(`chat_${channelId}.log`, { create: true });
            const writable = await fileHandle.createWritable({ keepExistingData: true });
            const file = await fileHandle.getFile();
            const size = file.size;
            await writable.write({ type: 'write', data: JSON.stringify(message) + '\n', position: size });
            await writable.close();
        } catch (e) {
            console.error("OPFS error:", e);
        }
    },

    async loadChannelHistory(channelId) {
        try {
            const root = await navigator.storage.getDirectory();
            const fileHandle = await root.getFileHandle(`chat_${channelId}.log`, { create: true });
            const file = await fileHandle.getFile();
            const text = await file.text();
            const lines = text.split('\n').filter(l => l.trim());
            lines.forEach(line => {
                const msg = JSON.parse(line);
                if (window.Cudi.displayChatMessage) {
                    window.Cudi.displayChatMessage(msg.text || msg.message, "received", msg.alias);
                }
            });
        } catch (e) {
            console.log("No history found for channel:", channelId);
        }
    },

    reconnectToPeers(peers) {
        if (!peers || peers.length === 0) return;
        console.log("Attempting P2P reconnection to:", peers);
        // Logic to try direct connection to IPs
    },

    updatePeerCache(newIp) {
        if (!this.currentCommunity) return;
        if (!this.currentCommunity.peer_cache.includes(newIp)) {
            this.currentCommunity.peer_cache.push(newIp);
            if (this.currentCommunity.peer_cache.length > 10) {
                this.currentCommunity.peer_cache.shift();
            }
        }
    },
    updatePeerList(peers) {
        const list = document.getElementById('member-list');
        const count = document.getElementById('peer-count');
        if (!list) return;

        list.innerHTML = '';
        if (count) count.textContent = peers.length;

        peers.forEach(peer => {
            const item = document.createElement('div');
            item.className = 'member-item';

            const avatar = document.createElement('img');
            avatar.className = 'avatar-small';
            avatar.src = peer.photo || "./icons/logo.png";

            const name = document.createElement('span');
            name.className = 'member-name';
            name.textContent = peer.name || 'Anonymous';

            item.appendChild(avatar);
            item.appendChild(name);
            list.appendChild(item);
        });
    }
};

window.communityManager = communityManager;
document.addEventListener('DOMContentLoaded', () => {
    communityManager.init();

    // Zero-Trace Toggle logic
    const zeroTraceBtn = document.getElementById('zero-trace-btn');
    if (zeroTraceBtn) {
        zeroTraceBtn.addEventListener('click', () => {
            communityManager.zeroTraceMode = !communityManager.zeroTraceMode;
            zeroTraceBtn.classList.toggle('active', communityManager.zeroTraceMode);
            if (window.Cudi && window.Cudi.showToast) {
                window.Cudi.showToast(communityManager.zeroTraceMode ? "Zero-Trace Enabled" : "Zero-Trace Disabled", "info");
            }
        });
    }
});
