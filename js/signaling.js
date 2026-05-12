window.Cudi.sanitizeAlias = function (alias) {
    if (alias === null || alias === undefined) return 'Anonymous';
    const str = String(alias).slice(0, 32).replace(/[<>"'`]/g, '').trim();
    return str || 'Anonymous';
};

window.Cudi.iniciarConexion = function () {
    const state = window.Cudi.state;

    const community = window.communityManager ? window.communityManager.currentCommunity : null;
    if (community && community.peer_cache && community.peer_cache.length > 0) {
        setTimeout(() => {
            if (!state.peer || (state.peer.connectionState !== 'connected' && state.peer.connectionState !== 'connecting')) {
                this.connectToSignaling();
            }
        }, 3000);
        return;
    }

    this.connectToSignaling();
}

window.Cudi.connectToSignaling = function () {
    const state = window.Cudi.state;

    if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        window.Cudi.registerOrJoin();
        return;
    }

    if (state.socket && state.socket.readyState === WebSocket.CONNECTING) return;

    try {
        state.socket = new WebSocket(window.Cudi.SIGNALING_SERVER_URL);
    } catch {
        window.Cudi.showToast('Cannot connect to signaling server', 'error');
        return;
    }

    state.socket.onopen = () => {
        window.Cudi.registerOrJoin();

        while (state.mensajePendiente.length > 0) {
            const msg = state.mensajePendiente.shift();
            state.socket.send(msg);
        }

        if (state.heartbeatInterval) clearInterval(state.heartbeatInterval);
        state.heartbeatInterval = setInterval(() => {
            if (state.socket.readyState === WebSocket.OPEN) {
                state.socket.send(JSON.stringify({ type: 'ping', appType: window.Cudi.appType }));
            }
        }, 30000);
    };

    state.socket.onmessage = async (event) => {
        try {
            const dataStr = typeof event.data === 'string' ? event.data : await event.data.text();
            const data = JSON.parse(dataStr);

            if (data.token) {
                window.Cudi.savePeerToken(data.token);
            }

            if (data.type === 'error') {
                window.Cudi.showToast(data.message, 'error');
                return;
            }

            if (data.type === "peer_found") {
                const targetId = data.permanentId || data.peerId;

                window.Cudi.showToast(`¡${targetId} It's online! Connecting...`, "success");
                document.getElementById('meeting-tools')?.classList.add('hidden');
                if (window.Cudi.ui && window.Cudi.ui.setChatStatus) {
                    window.Cudi.ui.setChatStatus(targetId, 'connecting');
                }

                if (window.Cudi.state.activeFinds.has(targetId)) {
                    clearTimeout(window.Cudi.state.activeFinds.get(targetId));
                    window.Cudi.state.activeFinds.delete(targetId);
                }

                if (window.Cudi.iniciarHandshakeWebRTC) {
                    window.Cudi.iniciarHandshakeWebRTC(targetId);
                }
            } else {
                window.Cudi.manejarMensaje(data);
            }
        } catch {
        }
    };

    state.socket.onerror = () => {
    };

    state.socket.onclose = () => {
        if (window.Cudi.state.heartbeatInterval) clearInterval(window.Cudi.state.heartbeatInterval);

        if (window.location.hash || window.Cudi.state.salaId) {
            setTimeout(() => {
                window.Cudi.connectToSignaling();
            }, 3000);
        }
    };
};

window.Cudi.registerOrJoin = function () {
    const state = window.Cudi.state;

    if (!state.myId) {
        setTimeout(() => window.Cudi.registerOrJoin(), 500);
        return;
    }

    if (state.salaId) {
        window.Cudi.appType = "cloaks";
        window.Cudi.enviarSocket({
            type: "join",
            room: state.salaId,
            appType: 'cloaks',
            alias: window.Cudi.sanitizeAlias(state.localAlias),
            permanentId: state.myId
        });
    } else {
        window.Cudi.appType = "cudi-messenger";
        window.Cudi.enviarSocket({
            type: "register",
            peerId: state.myId,
            alias: window.Cudi.sanitizeAlias(state.localAlias),
            appType: 'cudi-messenger',
            token: window.Cudi.getPeerToken() || undefined
        });
    }
};

window.Cudi.enviarSocket = function (obj) {
    const state = window.Cudi.state;
    const payload = { ...obj, permanentId: state.myId };

    if (!state.salaId) {
        payload.appType = 'cudi-messenger';
    } else {
        if (['offer', 'answer', 'candidate'].includes(payload.type)) {
            payload.signalType = payload.type;
            payload.type = 'signal';
            payload.appType = 'cloaks';
            payload.room = state.salaId;
        } else {
            if (!payload.appType) payload.appType = 'cloaks';
            if (!payload.room) payload.room = state.salaId;
        }
    }

    const payloadJson = JSON.stringify(payload);

    if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        state.socket.send(payloadJson);
    } else {
        state.mensajePendiente.push(payloadJson);
    }
};

window.Cudi.findPeer = function (peerId) {
    const state = window.Cudi.state;
    if (state.activeFinds.has(peerId)) return;

    window.Cudi.enviarSocket({
        type: 'find_peer',
        targetPeerId: peerId,
        appType: window.Cudi.appType || 'cudi-messenger'
    });

    const timeoutId = setTimeout(() => {
        if (state.activeFinds.has(peerId)) {
            state.activeFinds.delete(peerId);
            window.Cudi.showToast("The contact is still offline, we'll let you know when it reappears.", "info");
            if (window.Cudi.ui) window.Cudi.ui.renderRecentChats();
        }
    }, 10000);

    state.activeFinds.set(peerId, timeoutId);
    if (window.Cudi.ui) window.Cudi.ui.renderRecentChats();
};
