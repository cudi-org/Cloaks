export class WebRTCManager {
    constructor(store, signaling, ui) {
        this.store = store;
        this.signaling = signaling;
        this.ui = ui;
        this.localStream = null;
        this.STUN_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

        setInterval(() => this.autoCleanup(), 60000);
    }

    setStunServers(servers) {
        this.STUN_SERVERS = servers;
    }

    crearPeer(isOffer, targetId) {
        const state = this.store.getState();
        if (!state || !targetId) return null;

        let activeChats = state.activeChats || new Map();

        if (activeChats.has(targetId)) {
            const existing = activeChats.get(targetId);
            if (existing.pc.connectionState === 'connected' || existing.pc.connectionState === 'connecting') {
                return existing;
            }
            try { existing.pc.close(); } catch {
                // Ignore error on close
            }
            activeChats.delete(targetId);
        }

        const pc = new RTCPeerConnection({ iceServers: this.STUN_SERVERS });
        const chatInstance = {
            pc, dc: null, peerId: targetId, history: [], lastHeartbeat: Date.now()
        };

        activeChats.set(targetId, chatInstance);
        this.store.setState({ activeChats });

        pc.onicecandidate = (e) => {
            if (e.candidate) {
                this.signaling.enviarSocket({
                    type: "candidate", candidato: e.candidate, targetPeerId: targetId
                });
            }
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === "connected") {
                if (window.Cudi && window.Cudi.showToast) window.Cudi.showToast(`Connected to ${targetId}`, "success");
            }
            if (pc.connectionState === "closed" || pc.connectionState === "failed") {
                const s = this.store.getState();
                s.activeChats.delete(targetId);
                this.store.setState({ activeChats: s.activeChats });
            }
        };

        pc.ontrack = (e) => {
            if (e.track.kind === 'video') {
                const remoteVideo = document.getElementById('remoteVideo');
                if (remoteVideo) remoteVideo.srcObject = e.streams[0];
            } else if (e.track.kind === 'audio') {
                const audio = new Audio();
                audio.srcObject = e.streams[0];
                audio.play().catch(() => { });
            }
        };

        pc.ondatachannel = (e) => this.setupDataChannel(e.channel, targetId);

        if (isOffer) {
            const dc = pc.createDataChannel("canalDatos");
            this.setupDataChannel(dc, targetId);

            pc.createOffer()
                .then(offer => pc.setLocalDescription(offer))
                .then(() => {
                    this.signaling.enviarSocket({
                        type: "offer", offer: pc.localDescription, targetPeerId: targetId
                    });
                }).catch(() => { });
        }

        return chatInstance;
    }

    setupDataChannel(channel, peerId) {
        const state = this.store.getState();
        const instance = state.activeChats.get(peerId);
        if (!instance) return;

        instance.dc = channel;
        instance.dc.onopen = () => {
            if (window.Cudi && window.Cudi.showToast) window.Cudi.showToast("Secure channel established.", "success");
            this.store.setState({ currentPeerId: peerId });

            if (typeof document !== 'undefined') {
                const chatInput = document.getElementById("chatInput");
                const sendChatBtn = document.getElementById("sendChatBtn");
                if (chatInput) {
                    chatInput.disabled = false;
                    chatInput.placeholder = `Message #${peerId}`;
                }
                if (sendChatBtn) sendChatBtn.disabled = false;
            }
        };

        instance.dc.onmessage = (e) => {
            if (window.Cudi && window.Cudi.manejarChunk) {
                window.Cudi.manejarChunk(e.data, peerId);
            }
        };
    }

    handleOffer(msg) {
        const state = this.store.getState();
        const fromId = msg.fromPeerId;

        let instance = state.activeChats.get(fromId);
        if (!instance) {
            instance = this.crearPeer(false, fromId);
        }

        instance.pc.setRemoteDescription(new RTCSessionDescription(msg.offer || msg.oferta))
            .then(() => instance.pc.createAnswer())
            .then(answer => instance.pc.setLocalDescription(answer))
            .then(() => {
                this.signaling.enviarSocket({
                    type: "answer", answer: instance.pc.localDescription, targetPeerId: fromId
                });
            }).catch(() => { });
    }

    async optimizeForMesh() {
        const state = this.store.getState();
        if (!state.activeChats) return;

        let voiceCount = 0;
        state.activeChats.forEach(instance => {
            const senders = instance.pc.getSenders();
            const hasAudio = senders.some(s => s.track && s.track.kind === 'audio');
            if (hasAudio) voiceCount++;
        });

        if (voiceCount >= 5 && this.localStream) {
            const videoTracks = this.localStream.getVideoTracks();
            if (videoTracks.length > 0 && videoTracks[0].enabled) {
                videoTracks[0].enabled = false;
                if (window.Cudi && window.Cudi.showToast) window.Cudi.showToast("Video paused due to high number of participants.", "warning");

                const btnToggleVideo = document.getElementById('btnToggleVideo');
                if (btnToggleVideo) {
                    btnToggleVideo.style.backgroundColor = '#dc3545';
                    btnToggleVideo.style.color = 'white';
                }
            }
        }
    }

    autoCleanup() {
        const state = this.store.getState();
        const now = Date.now();
        let changed = false;

        state.activeChats.forEach((instance, peerId) => {
            if (now - instance.lastHeartbeat > 300000) {
                try {
                    instance.pc.close();
                    instance.pc = null;
                } catch {
                    // Ignore error on close
                }
                state.activeChats.delete(peerId);
                changed = true;
            }
        });

        if (changed) {
            this.store.setState({ activeChats: state.activeChats });
            if (this.ui) this.ui.updateMemberSidebar();
        }
    }
}
