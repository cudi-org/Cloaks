const presenceManager = {
    currentGame: '',
    heartbeats: new Map(),

    init() {
        this.loadSettings();
        this.bindUI();
    },

    loadSettings() {
        this.currentGame = localStorage.getItem('cloak_game_activity') || '';
        const gameInput = document.getElementById('game-activity');
        if (gameInput) gameInput.value = this.currentGame;
    },

    bindUI() {
        const gameInput = document.getElementById('game-activity');

        if (gameInput) {
            gameInput.addEventListener('change', (e) => {
                this.currentGame = e.target.value;
                localStorage.setItem('cloak_game_activity', this.currentGame);
                this.broadcastPresence();
            });
        }
    },

    startHeartbeat(peerId) {
        if (this.heartbeats.has(peerId)) return;

        const hb = setInterval(() => {
            this.sendHeartbeat(peerId);
        }, 20000);

        this.heartbeats.set(peerId, hb);
    },

    stopHeartbeat(peerId) {
        if (this.heartbeats.has(peerId)) {
            clearInterval(this.heartbeats.get(peerId));
            this.heartbeats.delete(peerId);
        }
    },

    async sendHeartbeat(peerId) {
        const state = window.Cudi.state;
        if (!state.activeChats) return;
        const instance = state.activeChats.get(peerId);
        if (instance && instance.dc && instance.dc.readyState === 'open') {
            const status = {
                type: 'presence',
                typing: false,
                activity: this.currentGame,
                channelId: window.communityManager?.currentChannel?.id || null,
                timestamp: Date.now()
            };
            instance.dc.send(JSON.stringify(status));
        }
    },

    async broadcastPresence() {
        window.Cudi.state.activeChats.forEach((instance, peerId) => {
            this.sendHeartbeat(peerId);
        });
    },

    async syncProfile(peerId) {
        if (window.identityManager && window.identityManager.profile.privacy !== 'social') {
            return;
        }

        const instance = window.Cudi.state.activeChats.get(peerId);
        if (instance && instance.dc && instance.dc.readyState === 'open') {
            const profileData = window.identityManager ? window.identityManager.profile : {};
            const profile = {
                type: 'profile',
                myId: window.Cudi.state.myId,
                name: window.Cudi.state.localAlias,
                pronouns: profileData.pronouns || '',
                photo: profileData.photo || null,
                timestamp: Date.now()
            };
            instance.dc.send(JSON.stringify(profile));
        }
    },

    async broadcastProfile() {
        window.Cudi.state.activeChats.forEach((instance, peerId) => {
            this.syncProfile(peerId);
        });
    },

    handlePresenceUpdate(peerId, data) {
        const state = window.Cudi.state;
        if (peerId === state.myId) return;

        if (!state.peers) state.peers = new Map();
        const peer = state.peers.get(peerId) || { id: peerId };

        if (data.type === 'profile') {
            peer.alias = data.name;
            peer.pronouns = data.pronouns;
            peer.photo = data.photo;
            state.peers.set(peerId, peer);

            if (window.Cudi.ui && window.Cudi.ui.renderRecentChats) {
                window.Cudi.ui.renderRecentChats();
            }

            window.Cudi.showToast(`${data.name || peerId} updated their profile.`, "info");
        } else if (data.type === 'presence') {
            peer.activity = data.activity;
            peer.isTyping = data.typing;
            peer.currentChannelId = data.channelId;
            state.peers.set(peerId, peer);

            if (window.communityManager?.currentChannel?.type === 'voice') {
                const display = document.getElementById('messagesDisplay');
                if (display && display.querySelector('.voice-call-container')) {
                    window.communityManager.renderVoiceParticipants(display.querySelector('#voice-grid'));
                }
            }
            if (window.Cudi.updateAudioBridging) {
                window.Cudi.updateAudioBridging(peerId);
            }
        }

        if (window.Cudi.ui && window.Cudi.ui.updateMemberSidebar) {
            window.Cudi.ui.updateMemberSidebar();
        }
        if (window.Cudi.ui && window.Cudi.ui.updateChatHeader) {
            window.Cudi.ui.updateChatHeader(peerId);
        }
    }
};

window.Cudi.syncProfile = (peerId) => presenceManager.syncProfile(peerId);
window.Cudi.broadcastProfile = () => presenceManager.broadcastProfile();
window.Cudi.startHeartbeat = (peerId) => presenceManager.startHeartbeat(peerId);
window.Cudi.stopHeartbeat = (peerId) => presenceManager.stopHeartbeat(peerId);
window.Cudi.handlePresenceUpdate = (peerId, data) => presenceManager.handlePresenceUpdate(peerId, data);

window.presenceManager = presenceManager;
document.addEventListener('DOMContentLoaded', () => {
    presenceManager.init();
});
