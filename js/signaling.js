
window.Cudi.iniciarConexion = function () {
    const state = window.Cudi.state;

    // Signaling Fallback (Día 5)
    const community = window.communityManager ? window.communityManager.currentCommunity : null;
    if (community && community.peer_cache && community.peer_cache.length > 0) {
        console.log("[Cloak] Attempting Peer Cache reconnection before signaling...");
        // In a real scenario, we would try to send the offer via a direct P2P socket or local discovery.
        // For this demo, we will wait 3 seconds and then fallback if no connection established.
        setTimeout(() => {
            if (!state.peer || (state.peer.connectionState !== 'connected' && state.peer.connectionState !== 'connecting')) {
                console.log("[Cloak] Peer Cache failed or timed out. Falling back to Signaling Server.");
                this.connectToSignaling();
            }
        }, 3000);
        return;
    }

    this.connectToSignaling();
}

window.Cudi.connectToSignaling = function () {
    const state = window.Cudi.state;
    if (state.socket && (state.socket.readyState === WebSocket.OPEN || state.socket.readyState === WebSocket.CONNECTING)) return;

    console.log("📡 [Signaling] Iniciando conexión con Render...");
    state.socket = new WebSocket(window.Cudi.SIGNALING_SERVER_URL);

    state.socket.onopen = () => {
        console.log("🔵 [STEP 1] Socket Abierto. Registrando...");

        // Determine Flow: Room (Cloaks) or P2P (Messenger)
        if (state.salaId) {
            window.Cudi.appType = "cloaks";
            console.log(`🏠 [Signaling] Uniéndome a sala: ${state.salaId}`);
            window.Cudi.enviarSocket({
                type: "join",
                room: state.salaId,
                password: state.roomPassword,
                alias: state.localAlias
            });
        } else {
            window.Cudi.appType = "cudi-messenger";
            console.log(`🆔 [Signaling] Registrando ID permanente: ${state.myId}`);
            window.Cudi.enviarSocket({
                type: "register",
                peerId: state.myId,
                alias: state.localAlias
            });
        }

        // 2. SEGUNDO: Vaciamos la cola FIFO
        console.log(`📤 [Signaling] Vaciando cola. Mensajes pendientes: ${state.mensajePendiente.length}`);
        while (state.mensajePendiente.length > 0) {
            const msg = state.mensajePendiente.shift();
            state.socket.send(msg);
        }

        // Heartbeat logic
        if (state.heartbeatInterval) clearInterval(state.heartbeatInterval);
        state.heartbeatInterval = setInterval(() => {
            if (state.socket.readyState === WebSocket.OPEN) {
                state.socket.send(JSON.stringify({ type: 'ping', appType: window.Cudi.appType }));
            }
        }, 30000);

        if (state.modo === "send" && window.Cudi.iniciarHandshakeWebRTC) {
            // We'll wait for 'joined' or handle specifically
        }
    };

    state.socket.onclose = () => {
        console.log("📡 [Signaling] Socket cerrado.");
        if (state.heartbeatInterval) clearInterval(state.heartbeatInterval);
        window.Cudi.showToast("Disconnected from signaling.", "error");
    };

    state.socket.onerror = (e) => {
        console.error("WebSocket error:", e);
    };

    state.socket.onmessage = async (event) => {
        let mensaje;
        try {
            const data = typeof event.data === 'string' ? event.data : await event.data.text();
            mensaje = JSON.parse(data);
        } catch (_e) { return; }

        console.log(`📥 [STEP 3] Mensaje del servidor:`, mensaje);

        if (mensaje.type === "registered") {
            console.log("✅ [STEP 4] Servidor confirmó mi registro.");
        } else if (mensaje.type === "peer_found") {
            const targetId = mensaje.peerId;
            console.log(`🎯 [STEP 5] ¡PEER ENCONTRADO! ID: ${targetId}`);

            // 1. Notificar a la UI
            window.Cudi.showToast(`¡${targetId} está online! Conectando...`, "success");
            if (window.Cudi.ui && window.Cudi.ui.setChatStatus) {
                window.Cudi.ui.setChatStatus(targetId, 'online');
            }

            // 2. Limpiar búsqueda
            if (state.activeFinds.has(targetId)) {
                clearTimeout(state.activeFinds.get(targetId));
                state.activeFinds.delete(targetId);
            }

            // 3. DISPARAR WEBRTC (La oferta)
            if (window.Cudi.iniciarHandshakeWebRTC) {
                window.Cudi.iniciarHandshakeWebRTC(targetId);
            }
        } else {
            // Pasamos todos los mensajes de sala/señalización a webrtc logic
            window.Cudi.manejarMensaje(mensaje);
        }
    };
}

window.Cudi.enviarSocket = function (obj) {
    const state = window.Cudi.state;
    // Forzamos appType dinámico
    const payload = {
        ...obj,
        appType: window.Cudi.appType || 'cudi-messenger'
    };

    // Compatibilidad con el servidor para salas (Cloaks)
    // El servidor en handleCloakLogic solo acepta 'join' y 'signal'.
    // Si enviamos offer/answer/candidate directamente, los ignora.
    if ((payload.appType === 'cloaks' || payload.appType === 'cudi-sync') &&
        ['offer', 'answer', 'candidate', 'signal'].includes(payload.type)) {
        // Si ya es type 'signal' pero no tiene signalType, es una señal genérica.
        // Si es offer/answer/candidate, lo envolvemos.
        if (payload.type !== 'signal') {
            payload.signalType = payload.type; // Guardamos el tipo real
            payload.type = 'signal';           // Enmascaramos
        }
    }

    const mensajeAEnviar = JSON.stringify(payload);

    if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        console.log(`📤 [STEP 2] Enviando tipo: ${payload.type} (Real: ${payload.signalType || payload.type})`);
        state.socket.send(mensajeAEnviar);
    } else {
        const socketState = state.socket ? state.socket.readyState : 'NULL';
        console.log(`⏳ [STEP 2.1] Encolando ${payload.type} (Estado: ${socketState})`);
        state.mensajePendiente.push(mensajeAEnviar);
    }
}


window.Cudi.findPeer = function (peerId) {
    const state = window.Cudi.state;
    if (state.activeFinds.has(peerId)) return; // Busqueda ya en curso

    console.log(`🔍 [Signaling-Messenger] Iniciando find_peer para: ${peerId}`);
    window.Cudi.enviarSocket({
        type: 'find_peer',
        targetPeerId: peerId,
        appType: 'cudi-messenger'
    });

    const timeoutId = setTimeout(() => {
        if (state.activeFinds.has(peerId)) {
            state.activeFinds.delete(peerId);
            window.Cudi.showToast("El contacto sigue offline, te avisaremos cuando aparezca.", "info");
            if (window.Cudi.ui) window.Cudi.ui.renderRecentChats();
        }
    }, 10000);

    state.activeFinds.set(peerId, timeoutId);
    if (window.Cudi.ui) window.Cudi.ui.renderRecentChats();
};
