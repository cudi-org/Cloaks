const communityManager = {
    currentCommunity: null,
    peerCache: [],

    init() {
        this.bindEvents();
        this.setupDragAndDrop();
        this.loadDefaultCommunities();
    },

    loadDefaultCommunities() {
        const officialCloak = {
            version: "1.0",
            type: "cloak-community",
            is_official: true,
            community_id: "official-guide",
            name: "Cloaks Info",
            photo: "./icons/official_info.png",
            channels: [
                { type: "category", name: "Documentation", immutable: true },
                { id: "intro", name: "getting-started", type: "text", immutable: true },
                { id: "security", name: "security-tips", type: "text", immutable: true },
                { type: "category", name: "Support", immutable: true },
                { id: "faq", name: "faq", type: "text", immutable: true },
                { id: "report-bug", name: "report-bug", type: "text", immutable: true }
            ]
        };
        this.addCommunityToServerRail(officialCloak);
    },

    bindEvents() {
        const createBtn = document.getElementById('btnCreateCommunity');
        const tabCommunity = document.getElementById('tabCommunity');

        if (createBtn) {
            createBtn.addEventListener('click', () => this.generateCommunity());
        }

        if (tabCommunity) {
            tabCommunity.addEventListener('click', () => {
                this.promptForCommunityFile();
            });
        }

        const settingsBtn = document.getElementById('community-settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => this.openCommunitySettings());
        }

        const closeBtn = document.getElementById('close-community-settings');
        if (closeBtn) {
            closeBtn.onclick = () => document.getElementById('community-settings-modal').classList.add('hidden');
        }

        const addChannelBtn = document.getElementById('btn-add-channel-trigger');
        if (addChannelBtn) {
            addChannelBtn.onclick = () => document.getElementById('add-channel-form').classList.remove('hidden');
        }
        const cancelAddBtn = document.getElementById('cancel-add-channel');
        if (cancelAddBtn) {
            cancelAddBtn.onclick = () => document.getElementById('add-channel-form').classList.add('hidden');
        }

        const confirmAddBtn = document.getElementById('confirm-add-channel');
        if (confirmAddBtn) {
            confirmAddBtn.onclick = () => this.addChannelToSettings();
        }

        const saveSettingsBtn = document.getElementById('save-community-settings');
        if (saveSettingsBtn) {
            saveSettingsBtn.onclick = () => this.saveCommunitySettings();
        }

        const exportBtn = document.getElementById('export-community-btn');
        if (exportBtn) {
            exportBtn.onclick = () => {
                if (this.currentCommunity) this.downloadCommunityFile(this.currentCommunity);
            };
        }

        const changeIconBtn = document.getElementById('btn-change-community-icon');
        const iconInput = document.getElementById('community-icon-input');
        if (changeIconBtn && iconInput) {
            changeIconBtn.onclick = () => iconInput.click();
            iconInput.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (re) => {
                        const preview = document.getElementById('edit-community-icon-preview');
                        if (preview) preview.src = re.target.result;
                        this.tempIcon = re.target.result;
                    };
                    reader.readAsDataURL(file);
                }
            };
        }
    },

    setupDragAndDrop() {
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
                { id: "general", name: "general", type: "text", immutable: true },
                { id: "voice-general", name: "general", type: "voice", immutable: true }
            ],
            peer_cache: []
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
        return exported.k;
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
            } catch {
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

        document.getElementById('welcome-screen').classList.add('hidden');
        document.getElementById('messagesDisplay').classList.remove('hidden');
        document.getElementById('meeting-tools')?.classList.add('hidden');

        document.getElementById('community-settings-btn')?.classList.remove('hidden');
        const hashEl = document.querySelector('.hash');
        if (hashEl) hashEl.style.display = 'inline';

        const nameDisplay = document.getElementById('community-name-display');
        if (nameDisplay) nameDisplay.textContent = community.name;

        this.addCommunityToServerRail(community);

        this.renderChannels(community.channels);

        document.querySelectorAll('.server-icon').forEach(icon => {
            icon.classList.toggle('active', icon.dataset.id === community.community_id);
        });
        document.getElementById('btn-home')?.classList.remove('active');
    },

    addCommunityToServerRail(community) {
        const rail = document.getElementById('server-list');
        if (!rail) return;

        if (document.querySelector(`[data-id="${community.community_id}"]`)) return;

        const icon = document.createElement('div');
        icon.className = 'server-icon';
        icon.dataset.id = community.community_id;
        icon.title = community.name;

        if (community.photo) {
            const img = document.createElement('img');
            img.src = community.photo;
            img.className = 'server-icon-img';
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.borderRadius = 'inherit';
            img.style.objectFit = 'cover';
            icon.appendChild(img);
        } else {
            icon.textContent = community.name.charAt(0).toUpperCase();
        }

        icon.onclick = () => this.activateCommunity(community);

        rail.appendChild(icon);
    },

    renderChannels(channels) {
        if (!this.currentCommunity) {
            return;
        }
        const list = document.getElementById('channel-list');
        if (!list) return;
        list.innerHTML = '';

        const groups = {
            text: { label: 'TEXT CHANNELS', items: [] },
            voice: { label: 'VOICE CHANNELS', items: [] },
            resource: { label: 'RESOURCES', items: [] }
        };

        channels.forEach(ch => {
            if (ch.type !== 'category' && groups[ch.type]) {
                groups[ch.type].items.push(ch);
            }
        });

        ['text', 'voice', 'resource'].forEach(type => {
            const group = groups[type];
            if (group.items.length > 0) {
                const header = document.createElement('div');
                header.className = 'channel-category';
                header.textContent = group.label;
                list.appendChild(header);

                group.items.forEach(ch => {
                    const div = document.createElement('div');
                    div.className = `channel-item ${ch.type}`;
                    const prefix = ch.type === 'voice' ? '🔊 ' : '# ';
                    div.textContent = prefix + ch.name;
                    div.onclick = () => this.switchChannel(ch);
                    list.appendChild(div);
                });
            }
        });

        const allItems = [...groups.text.items, ...groups.voice.items, ...groups.resource.items];
        if (allItems.length > 0 && !this.currentChannel) {
            this.switchChannel(allItems[0]);
        }
    },

    async switchChannel(channel) {
        if (this.currentChannel?.type === 'voice' && channel.type !== 'voice') {
            if (window.Cudi.stopVoiceOnly) window.Cudi.stopVoiceOnly();
        }

        this.currentChannel = channel;
        if (window.presenceManager && window.presenceManager.broadcastPresence) {
            window.presenceManager.broadcastPresence();
        }
        document.querySelectorAll('.channel-item').forEach(el => {
            el.classList.toggle('active', el.textContent === channel.name && el.classList.contains(channel.type));
        });

        const headerName = document.getElementById('current-channel-name');
        if (headerName) headerName.textContent = channel.name;

        const chatInput = document.getElementById('chatInput');
        const sendBtn = document.getElementById('sendChatBtn');
        const display = document.getElementById('messagesDisplay');
        const inputArea = document.querySelector('.chat-input-area');

        if (display) display.innerHTML = '';

        if (channel.type === 'voice') {
            if (inputArea) inputArea.classList.add('hidden');
            if (chatInput) {
                chatInput.placeholder = "En sala de voz...";
                chatInput.disabled = true;
            }
            if (sendBtn) sendBtn.disabled = true;

            this.renderVoiceCallUI(display);

            if (window.Cudi.startVoiceOnly) window.Cudi.startVoiceOnly();
        } else {
            if (this.currentCommunity.is_official) {
                if (inputArea) inputArea.classList.add('hidden');
                if (display) {
                    display.innerHTML = this.getOfficialContent(channel.id);
                }
                return;
            }

            if (inputArea) inputArea.classList.remove('hidden');
            if (chatInput) {
                chatInput.placeholder = `Message #${channel.name}`;
                chatInput.disabled = false;
            }
            if (sendBtn) sendBtn.disabled = false;

            if (!this.zeroTraceMode) {
                await this.loadChannelHistory(channel.id);
            } else if (display) {
                display.innerHTML = '<div class="message-item system"><div class="msg-content"><div class="msg-text">Zero-Trace Mode Activo: Historial no cargado.</div></div></div>';
            }
        }
    },

    getOfficialContent(id) {
        const contents = {
            'intro': `
                <div class="official-info-container">
                    <div class="official-info-header">Welcome to Cloaks</div>
                    <div class="official-info-text">
                        Cloaks is a sovereign P2P communication platform designed for privacy and freedom. 
                        <br><br>
                        - <strong>Private Chats</strong>: Direct encrypted connections between users.<br>
                        - <strong>Communities (Cloaks)</strong>: Shared spaces defined by a simple JSON file.<br>
                        - <strong>Zero-Trace</strong>: Everything stays in RAM. No logs on disk.
                        <br><br>
                        <strong> Pro-tip:</strong> Type <strong>/help</strong> in the chat input area at any time to see the list of advanced sovereign commands.
                    </div>
                </div>
            `,
            'security': `
                <div class="official-info-container">
                    <div class="official-info-header">Security Protocols</div>
                    <div class="official-info-text">
                        - <strong>Keys</strong>: Your keys are generated locally. Never touch a server.<br>
                        - <strong>OPFS</strong>: Local storage is handled via Origin Private File System.<br>
                        - <strong>Network</strong>: Cloaks uses WebRTC for true P2P data flow.
                    </div>
                </div>
            `,
            'faq': `
                <div class="official-info-container">
                    <div class="official-info-header">Frequently Asked Questions</div>
                    <div class="official-info-text">
                        <strong>Q: Where are my messages stored?</strong><br>
                        A: Locally in your browser's private silo (OPFS). 
                        <br><br>
                        <strong>Q: How do I invite someone?</strong><br>
                        A: Share your Peer ID or create a Cloak file and send it to them.
                    </div>
                </div>
            `,
            'report-bug': `
                <div class="official-info-container">
                    <div class="official-info-header">Report Bug / Support</div>
                    <div class="official-info-text">
                        Help us improve Cloaks. Found a glitch? Your feedback is essential for this beta. Please choose your preferred way to report:
                        <div class="report-options-centered">
                            <a href="https://github.com/cudi-org/Cloaks/issues/new" target="_blank" class="report-action-item-centered">
                               <div style="width: 32px; height: 32px; background: rgba(255, 255, 255, 0.1); border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                                 <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.419 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.577.688.48C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10z"/></svg>
                               </div>
                               <div>
                                 <div style="font-weight: bold; font-size: 14px;">GitHub Issues</div>
                                 <div style="font-size: 11px; opacity: 0.6;">Formal bug tracking</div>
                               </div>
                            </a>

                            <a href="mailto:breolanapp@gmail.com?subject=Cloaks Bug Report - Beta 0.1&body=Device/Browser: %0A%0ADescription of the bug: " class="report-action-item-centered">
                               <div style="width: 32px; height: 32px; background: rgba(0, 217, 55, 0.1); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: var(--accent);">
                                 <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
                               </div>
                               <div>
                                 <div style="font-weight: bold; font-size: 14px;">Email Support</div>
                                 <div style="font-size: 11px; opacity: 0.6;">Direct feedback</div>
                               </div>
                            </a>
                        </div>
                    </div>
                </div>
            `
        };
        return contents[id] || '<div class="empty-state-msg">Information coming soon...</div>';
    },

    renderVoiceCallUI(container) {
        if (!container) return;

        container.innerHTML = `
            <div class="voice-call-container">
                <div class="voice-participants-grid" id="voice-grid">
                </div>
                
                <div class="voice-controls">
                    <button class="leave-voice-btn" id="leave-voice-btn">
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                            <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.15-2.67 1.93-.16.16-.38.25-.61.25-.23 0-.46-.09-.61-.25L.29 13.29c-.19-.19-.29-.44-.29-.71 0-.26.1-.51.29-.7C3.34 8.97 7.46 7 12 7s8.66 1.97 11.71 4.88c.19.19.29.44.29.71 0 .26-.1.51-.29.7l-2.67 2.67c-.15.16-.38.25-.61.25-.23 0-.46-.09-.61-.25-.79-.78-1.69-1.44-2.67-1.93-.33-.16-.56-.51-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
                        </svg>
                        SALIR DEL CANAL
                    </button>
                </div>
            </div>
        `;

        this.renderVoiceParticipants(container.querySelector('#voice-grid'));

        const leaveBtn = container.querySelector('#leave-voice-btn');
        if (leaveBtn) {
            leaveBtn.onclick = () => {
                const general = this.currentCommunity?.channels.find(c => c.type === 'text');
                if (general) {
                    this.switchChannel(general);
                } else {
                    document.getElementById('btn-home')?.click();
                }
            };
        }
    },

    renderVoiceParticipants(grid) {
        if (!grid || !this.currentChannel) return;
        const state = window.Cudi.state;
        const myProfile = window.identityManager?.profile || { name: 'You', photo: './icons/logo_matrix_v2.png' };

        grid.innerHTML = `
            <div class="voice-participant self">
                <img src="${myProfile.photo || './icons/logo_matrix_v2.png'}" class="avatar-large">
                <span class="participant-name">${myProfile.name || 'You'} (Tú)</span>
            </div>
        `;

        state.peers.forEach((peer, peerId) => {
            if (peer.currentChannelId === this.currentChannel.id) {
                const div = document.createElement('div');
                div.className = 'voice-participant';
                div.innerHTML = `
                    <img src="${peer.photo || './icons/logo_matrix_v2.png'}" class="avatar-large">
                    <span class="participant-name">${peer.alias || peerId}</span>
                `;
                grid.appendChild(div);
            }
        });
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
        } catch {
            // Ignorar errores de guardado
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
        } catch {
            // Ignorar errores de carga
        }
    },

    reconnectToPeers(peers) {
        if (!peers || peers.length === 0) return;
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

    openCommunitySettings() {
        if (!this.currentCommunity) {
            showToast("No active Cloak detected.", "error");
            return;
        }

        if (this.currentCommunity.is_official) {
            window.Cudi.showToast("This is a read-only official space.", "info");
            return;
        }

        const modal = document.getElementById('community-settings-modal');
        const nameInput = document.getElementById('edit-community-name');
        const preview = document.getElementById('edit-community-icon-preview');

        nameInput.value = this.currentCommunity.name;
        if (preview) {
            preview.src = this.currentCommunity.photo || './icons/logo_matrix_v2.png';
        }
        this.tempIcon = this.currentCommunity.photo;
        this.tempChannels = [...this.currentCommunity.channels];
        this.renderSettingsChannels();

        modal.classList.remove('hidden');
    },

    renderSettingsChannels() {
        const list = document.getElementById('edit-channels-list');
        if (!list) return;
        list.innerHTML = '';

        const groups = {
            text: { label: 'TEXT', items: [] },
            voice: { label: 'VOICE', items: [] },
            resource: { label: 'RESOURCES', items: [] }
        };

        this.tempChannels.forEach((ch, index) => {
            if (ch.type !== 'category' && groups[ch.type]) {
                groups[ch.type].items.push({ ...ch, index });
            }
        });

        ['text', 'voice', 'resource'].forEach(type => {
            const group = groups[type];
            if (group.items.length > 0) {
                const header = document.createElement('div');
                header.className = 'edit-channel-category';
                header.style.fontSize = '10px';
                header.style.color = 'var(--text-muted)';
                header.style.marginTop = '15px';
                header.style.marginBottom = '5px';
                header.textContent = group.label;
                list.appendChild(header);

                group.items.forEach(ch => {
                    const row = document.createElement('div');
                    row.className = 'edit-channel-row';

                    const prefix = ch.type === 'voice' ? '🔊 ' : '# ';
                    const deleteBtn = ch.immutable ? '' : `<button class="delete-channel-btn" data-index="${ch.index}">&times;</button>`;

                    row.innerHTML = `
                        <span>${prefix}${ch.name}</span>
                        ${deleteBtn}
                    `;


                    const btn = row.querySelector('.delete-channel-btn');
                    if (btn) {
                        btn.onclick = (e) => {
                            const idx = parseInt(e.target.dataset.index);
                            this.tempChannels.splice(idx, 1);
                            this.renderSettingsChannels();
                        };
                    }
                });
            }
        });
    },

    addChannelToSettings() {
        const type = document.getElementById('new-channel-type').value;
        const name = document.getElementById('new-channel-name').value.trim();

        if (!name) return;

        const newCh = {
            id: type === 'category' ? null : name.toLowerCase().replace(/\s+/g, '-'),
            name: name,
            type: type
        };

        this.tempChannels.push(newCh);
        this.renderSettingsChannels();

        document.getElementById('new-channel-name').value = '';
        document.getElementById('add-channel-form').classList.add('hidden');
    },

    saveCommunitySettings() {
        if (!this.currentCommunity) return;

        const newName = document.getElementById('edit-community-name').value.trim();
        if (newName) {
            this.currentCommunity.name = newName;
            const nameDisplay = document.getElementById('community-name-display');
            if (nameDisplay) nameDisplay.textContent = newName;
        }

        if (this.tempIcon) {
            this.currentCommunity.photo = this.tempIcon;
            const railIcon = document.querySelector(`.server-icon[data-id="${this.currentCommunity.community_id}"]`);
            if (railIcon) {
                railIcon.innerHTML = `<img src="${this.tempIcon}" class="server-icon-img" style="width:100%; height:100%; border-radius:inherit; object-fit:cover;">`;
            }
        }

        this.currentCommunity.channels = [...this.tempChannels];
        this.renderChannels(this.currentCommunity.channels);

        document.getElementById('community-settings-modal').classList.add('hidden');
        showToast("Community updated localy.", "success");
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
            avatar.src = peer.photo || "./icons/logo_matrix_v2.png";

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
});
