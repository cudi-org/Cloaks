/**
 * Presence Manager: Handles Spotify and Game Activity broadcasting
 */

const presenceManager = {
    spotifyToken: '',
    currentGame: '',
    heartbeats: new Map(),

    init() {
        this.loadSettings();
        this.bindUI();
    },

    loadSettings() {
        this.spotifyToken = localStorage.getItem('cloak_spotify_token') || '';
        this.currentGame = localStorage.getItem('cloak_game_activity') || '';

        const tokenInput = document.getElementById('spotify-token');
        const gameInput = document.getElementById('game-activity');

        if (tokenInput) tokenInput.value = this.spotifyToken;
        if (gameInput) gameInput.value = this.currentGame;
    },

    bindUI() {
        const tokenInput = document.getElementById('spotify-token');
        const gameInput = document.getElementById('game-activity');

        if (tokenInput) {
            tokenInput.addEventListener('change', (e) => {
                this.spotifyToken = e.target.value;
                localStorage.setItem('cloak_spotify_token', this.spotifyToken);
            });
        }

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
        }, 20000); // 20 seconds

        this.heartbeats.set(peerId, hb);
    },

    stopHeartbeat(peerId) {
        if (this.heartbeats.has(peerId)) {
            clearInterval(this.heartbeats.get(peerId));
            this.heartbeats.delete(peerId);
        }
    },

    async sendHeartbeat(peerId) {
        const instance = window.Cudi.state.activeChats.get(peerId);
        if (instance && instance.dc && instance.dc.readyState === 'open') {
            const status = {
                type: 'presence',
                typing: false, // Could be dynamic
                activity: await this.getSpotifyActivity() || this.currentGame,
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
        // Only sync if Social Mode is active
        if (window.identityManager && window.identityManager.profile.privacy !== 'social') {
            console.log("👻 [Presence] Ghost Mode active: Profile sync skipped.");
            return;
        }

        const instance = window.Cudi.state.activeChats.get(peerId);
        if (instance && instance.dc && instance.dc.readyState === 'open') {
            const profile = {
                type: 'profile',
                myId: window.Cudi.state.myId,
                name: window.Cudi.state.localAlias,
                pronouns: localStorage.getItem('cloak_pronouns') || '',
                photo: localStorage.getItem('cloak_photo') || null,
                timestamp: Date.now()
            };
            instance.dc.send(JSON.stringify(profile));
        }
    },

    async getSpotifyActivity() {
        if (!this.spotifyToken) return null;
        // Mocking for now as per requirement
        return "Listening to Cloaks FM";
    },

    handlePresenceUpdate(peerId, data) {
        console.log(`Presence update from ${peerId}:`, data);
        const state = window.Cudi.state;
        const peer = state.peers.get(peerId) || { id: peerId };

        if (data.type === 'profile') {
            peer.alias = data.name;
            peer.pronouns = data.pronouns;
            peer.photo = data.photo;
            state.peers.set(peerId, peer);
            window.Cudi.showToast(`${data.name} updated their profile.`, "info");
        } else if (data.type === 'presence') {
            peer.activity = data.activity;
            peer.isTyping = data.typing;
            state.peers.set(peerId, peer);
        }

        // Trigger UI update
        if (window.Cudi.ui && window.Cudi.ui.updateMemberSidebar) {
            window.Cudi.ui.updateMemberSidebar();
        }
        if (window.Cudi.ui && window.Cudi.ui.updateChatHeader) {
            window.Cudi.ui.updateChatHeader(peerId);
        }
    }
};

window.Cudi.syncProfile = (peerId) => presenceManager.syncProfile(peerId);
window.Cudi.startHeartbeat = (peerId) => presenceManager.startHeartbeat(peerId);
window.Cudi.stopHeartbeat = (peerId) => presenceManager.stopHeartbeat(peerId);
window.Cudi.handlePresenceUpdate = (peerId, data) => presenceManager.handlePresenceUpdate(peerId, data);

window.presenceManager = presenceManager;
document.addEventListener('DOMContentLoaded', () => {
    presenceManager.init();
});

