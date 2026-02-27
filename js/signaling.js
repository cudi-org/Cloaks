
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
    if (state.socket && state.socket.readyState === WebSocket.OPEN) return;

    console.log("📡 [Signaling] Conectando a Render...");
    state.socket = new WebSocket(window.Cudi.SIGNALING_SERVER_URL);

    state.socket.addEventListener("open", () => {
        console.log("🔵 [STEP 1] Socket Abierto. Enviando 'register'...");

        // 1. Register or Join FIRST
        if (window.Cudi.appType === 'cudi-messenger') {
            window.Cudi.enviarSocket({
                type: "register",
                peerId: state.myId,
                alias: state.localAlias
            });
        } else {
            window.Cudi.enviarSocket({
                type: "join",
                room: state.salaId,
                appType: window.Cudi.appType,
                peerId: state.myId,
                alias: state.localAlias,
                password: state.roomPassword
            });
        }

        // 2. Flush pending messages AFTER registration
        console.log("📤 [STEP 2] Vaciando cola FIFO...");
        while (state.mensajePendiente.length > 0) {
            const msg = state.mensajePendiente.shift();
            state.socket.send(msg);
        }

        // 3. Setup Heartbeat
        if (state.heartbeatInterval) clearInterval(state.heartbeatInterval);
        state.heartbeatInterval = setInterval(() => {
            if (state.socket.readyState === WebSocket.OPEN) {
                state.socket.send(JSON.stringify({ type: 'ping' }));
            }
        }, 30000);

        if (state.modo === "send") {
            if (window.Cudi.crearPeer) window.Cudi.crearPeer(true);
        }
    });

    state.socket.addEventListener("close", () => {
        window.Cudi.showToast("Disconnected from server.", "error");
        if (state.heartbeatInterval) clearInterval(state.heartbeatInterval);
        const fileInput = document.getElementById("fileInput");
        const chatInput = document.getElementById("chatInput");
        const sendChatBtn = document.getElementById("sendChatBtn");

        if (fileInput) fileInput.disabled = true;
        if (chatInput) chatInput.disabled = true;
        if (sendChatBtn) sendChatBtn.disabled = true;
    });

    state.socket.addEventListener("error", (e) => {
        console.error("WebSocket error:", e);
        window.Cudi.showToast("Connection error.", "error");
        window.Cudi.toggleLoading(false);
    });

    state.socket.addEventListener("message", async (event) => {
        let mensaje;
        try {
            const data = typeof event.data === "string" ? event.data : await event.data.text();
            mensaje = JSON.parse(data);
        } catch { return; }

        console.log(`📥 [STEP 3] Mensaje recibido del servidor:`, mensaje);

        if (mensaje.type === "registered") {
            console.log("✅ [STEP 4] Servidor confirmó mi registro.");
        }

        if (mensaje.type === "peer_found") {
            const targetId = mensaje.peerId;
            console.log(`🎯 [STEP 5] ¡PEER ENCONTRADO! ID: ${targetId}. Iniciando WebRTC...`);

            // Clear search timeout
            if (state.activeFinds.has(targetId)) {
                clearTimeout(state.activeFinds.get(targetId));
                state.activeFinds.delete(targetId);
            }

            // Iniciar WebRTC como Offer
            if (window.Cudi.crearPeer) window.Cudi.crearPeer(true, targetId);

            // Refresh UI
            if (window.Cudi.ui) window.Cudi.ui.renderRecentChats();

        } else if (mensaje.type === "peer_not_found") {
            console.warn(`⚠️ [Signaling] Peer ${mensaje.target} not found on server.`);
        } else if (mensaje.type === "signal") {
            window.Cudi.manejarMensaje(mensaje);
        }
    });
}

window.Cudi.enviarSocket = function (obj) {
    const state = window.Cudi.state;
    let mensajeAEnviar;

    const type = obj.type || obj.tipo;

    if (window.Cudi.appType === 'cudi-messenger') {
        // Messenger Protocol
        const payload = {
            appType: 'cudi-messenger',
            ...obj,
            type: type
        };
        console.log(`📤 [STEP 2] Intentando enviar tipo: ${payload.type} | ReadyState: ${state.socket?.readyState}`);
        mensajeAEnviar = JSON.stringify(payload);
    } else {
        // Cloaks/Sync Protocol
        if (type === "join") {
            mensajeAEnviar = JSON.stringify(obj);
        } else if (
            type === "oferta" ||
            type === "respuesta" ||
            type === "candidato"
        ) {
            mensajeAEnviar = JSON.stringify({
                type: "signal",
                ...obj,
                appType: window.Cudi.appType,
                room: state.salaId,
            });
        } else {
            mensajeAEnviar = JSON.stringify({
                ...obj,
                appType: window.Cudi.appType
            });
        }
    }

    // Security Check: Payload Size Limit
    // 16KB limit to protect signaling server connection
    const MAX_PAYLOAD_BYTES = 16384;
    // Using simple length check as rough estimator, or Blob for accuracy if needed. 
    // TextEncoder is cleaner for bytes.
    const payloadSize = new TextEncoder().encode(mensajeAEnviar).length;

    if (payloadSize > MAX_PAYLOAD_BYTES) {
        console.error("Payload too large for signaling server:", payloadSize, "bytes. Dropping message.");
        // Optional: window.Cudi.showToast("Error: Signal message too large.", "error");
        return;
    }

    if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        console.log(`📤 [Signaling] Enviando: ${JSON.parse(mensajeAEnviar).type}`);
        state.socket.send(mensajeAEnviar);
    } else {
        console.log(`⏳ [Signaling] Socket no listo. Encolando mensaje (FIFO): ${JSON.parse(mensajeAEnviar).type}`);
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
    }, 30000);

    state.activeFinds.set(peerId, timeoutId);
    if (window.Cudi.ui) window.Cudi.ui.renderRecentChats();
};
