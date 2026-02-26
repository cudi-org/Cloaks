
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
        console.log("Connected to signaling server.");

        if (state.heartbeatInterval) clearInterval(state.heartbeatInterval);
        state.heartbeatInterval = setInterval(() => {
            if (state.socket.readyState === WebSocket.OPEN) {
                state.socket.send(JSON.stringify({ type: 'ping' }));
            }
        }, 30000);

        while (state.mensajePendiente.length > 0) {
            state.socket.send(state.mensajePendiente.shift());
        }
        window.Cudi.enviarSocket({
            type: "join",
            room: state.salaId,
            appType: window.Cudi.appType,
            alias: state.localAlias,
            password: state.roomPassword
        });

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
        if (typeof event.data === "string") {
            let mensaje;
            try {
                mensaje = JSON.parse(event.data);
                console.log(`📥 [Signaling] Mensaje recibido: ${mensaje.type} desde ${mensaje.fromPeerId || 'Servidor'}`);
            } catch { return; }
            if (window.Cudi.manejarMensaje) window.Cudi.manejarMensaje(mensaje);
        } else if (event.data instanceof Blob) {
            try {
                const texto = await event.data.text();
                const mensaje = JSON.parse(texto);
                console.log(`📥 [Signaling] Mensaje recibido (Blob): ${mensaje.type} desde ${mensaje.fromPeerId || 'Servidor'}`);
                if (window.Cudi.manejarMensaje) window.Cudi.manejarMensaje(mensaje);
            } catch { }
        }
    });
}

window.Cudi.enviarSocket = function (obj) {
    const state = window.Cudi.state;
    let mensajeAEnviar;
    if (obj.type === "join") {
        mensajeAEnviar = JSON.stringify(obj);
    } else if (
        obj.tipo === "oferta" ||
        obj.tipo === "respuesta" ||
        obj.tipo === "candidato"
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
        console.log(`⏳ [Signaling] Socket no listo. Encolando mensaje: ${JSON.parse(mensajeAEnviar).type}`);
        state.mensajePendiente.push(mensajeAEnviar);
    }
}
