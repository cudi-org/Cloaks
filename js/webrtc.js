// Custom Logger Logic
const DEBUG_MODE = false;

function logger(message, data = "") {
    if (DEBUG_MODE) {
        console.log(`[CUDI-LOG] ${message}`, data);
    }
}

window.Cudi.crearPeer = function (isOffer, targetId = null) {
    const state = window.Cudi.state;
    if (!targetId) return;

    // Instance System: Check if already exists
    if (state.activeChats.has(targetId)) {
        const existing = state.activeChats.get(targetId);
        if (existing.pc.connectionState !== 'closed' && existing.pc.connectionState !== 'failed') {
            logger(`Chat instance for ${targetId} already exists and is active.`);
            return existing;
        }
    }

    logger(`Creating new PeerConnection for: ${targetId}`);

    const currentStun = window.currentSettings?.stun || "google";
    const dynamicIceServers = window.Cudi.STUN_SERVERS_MAP[currentStun] || window.Cudi.STUN_SERVERS_MAP["google"];

    const pc = new RTCPeerConnection({ iceServers: dynamicIceServers });
    const chatInstance = {
        pc: pc,
        dc: null,
        peerId: targetId,
        history: [],
        lastHeartbeat: Date.now()
    };

    state.activeChats.set(targetId, chatInstance);

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            console.log("❄️ [WebRTC] Nuevo candidato ICE generado");
            window.Cudi.enviarSocket({
                type: "candidate",
                candidato: event.candidate,
                targetPeerId: targetId
            });
        } else {
            console.log("✅ [WebRTC] Todos los candidatos ICE enviados");
        }
    };

    pc.onconnectionstatechange = () => {
        console.log(`🔌 [WebRTC] Estado de conexión con ${targetId}: ${pc.connectionState}`);
        if (pc.connectionState === "connected") {
            window.Cudi.showToast(`Connected to ${targetId}`, "success");
            // Trigger UI update if this is the current chat
        }
        if (pc.connectionState === "closed" || pc.connectionState === "failed") {
            state.activeChats.delete(targetId);
        }
    };


    pc.ondatachannel = (event) => {
        logger(`Received DataChannel from ${targetId}`);
        window.Cudi.setupDataChannel(event.channel, targetId);
    };

    if (isOffer) {
        const dc = pc.createDataChannel("canalDatos");
        window.Cudi.setupDataChannel(dc, targetId);

        pc.createOffer()
            .then((oferta) => pc.setLocalDescription(oferta))
            .then(() => {
                logger("Sending offer to:", targetId);
                window.Cudi.enviarSocket({
                    type: "offer",
                    offer: pc.localDescription,
                    targetPeerId: targetId
                });
            })
            .catch((error) => console.error("Error creating offer:", error));
    }

    return chatInstance;
}

window.Cudi.setupDataChannel = function (channel, peerId) {
    const state = window.Cudi.state;
    const instance = state.activeChats.get(peerId);
    if (!instance) return;

    instance.dc = channel;

    instance.dc.onopen = () => {
        console.log(`🟢 [DataChannel] ¡Túnel P2P abierto con ${peerId}!`);
        window.Cudi.showToast("Secure channel established.", "success");

        // Sync pending messages from disk
        if (window.Cudi.syncPendingMessages) {
            window.Cudi.syncPendingMessages(peerId);
        }

        // Sync Profile (including permanent ID)
        window.Cudi.syncProfile(peerId);

        // Notify restored connection if it was a find_peer
        if (window.Cudi.state.currentPeerId === peerId) {
            window.Cudi.showToast(`¡Conexión restaurada con el peer!`, "success");
        }

        // Start Heartbeat for this channel
        window.Cudi.startHeartbeat(peerId);

        // Update UI
        if (window.Cudi.ui && window.Cudi.ui.renderRecentChats) {
            window.Cudi.ui.renderRecentChats();
        }

        const chatInput = document.getElementById("chatInput");
        const sendChatBtn = document.getElementById("sendChatBtn");
        if (chatInput && window.Cudi.state.currentPeerId === peerId) {
            chatInput.disabled = false;
            chatInput.placeholder = `Message #${peerId}`;
        }
        if (sendChatBtn) sendChatBtn.disabled = false;
    };

    instance.dc.onclose = () => {
        logger(`DataChannel CLOSED for ${peerId}`);
        window.Cudi.stopHeartbeat(peerId);
    };

    instance.dc.onmessage = (event) => {
        if (typeof event.data === 'string') {
            console.log(`💬 [DataChannel] Nuevo mensaje P2P [${peerId}]:`, JSON.parse(event.data));
        }
        manejarChunk(event.data, peerId);
    };
}


window.Cudi.manejarMensaje = function (mensaje) {
    const state = window.Cudi.state;
    logger("Mensaje recibido", mensaje);

    switch (mensaje.type) {
        case "joined":
            state.sessionId = mensaje.yourId;
            logger("Successfully joined. Session ID:", state.sessionId, "Persistent ID:", state.myId);
            window.Cudi.showToast("Logged in successfully.", "success");
            window.Cudi.toggleLoading(false);

            if (mensaje.peers && mensaje.peers.length > 0) {
                mensaje.peers.forEach(p => state.peers.set(p.id, p));
                if (state.modo === "send") {
                    const firstPeer = mensaje.peers[0];
                    window.Cudi.crearPeer(true, firstPeer.id);
                }
            }
            break;

        case "registered":
            state.sessionId = mensaje.peerId; // In messenger peerId is the session match
            logger("Registered on messenger. ID:", state.sessionId);
            window.Cudi.toggleLoading(false);
            break;

        case "peer_joined":
            state.peers.set(mensaje.peerId, { id: mensaje.peerId, alias: mensaje.alias });
            window.Cudi.showToast(`${mensaje.alias} joined.`, "info");
            if (state.modo === "send") {
                logger("Initiating negotiation with new peer:", mensaje.peerId);
                window.Cudi.crearPeer(true, mensaje.peerId);
            }
            break;

        case "peer_left":
            state.peers.delete(mensaje.peerId);
            window.Cudi.showToast("A peer left the cloak.", "info");
            break;

        case "signal":
        case "offer":
        case "answer":
        case "candidate": {
            const fromId = mensaje.fromPeerId;
            const type = mensaje.type;

            if (type === "oferta" || type === "offer") {
                // Handshake Manager: Instantiate automatically on offer
                let instance = state.activeChats.get(fromId);
                if (!instance) {
                    instance = window.Cudi.crearPeer(false, fromId);
                }
                const pc = instance.pc;
                const sdp = mensaje.oferta || mensaje.offer;

                pc.setRemoteDescription(new RTCSessionDescription(sdp))
                    .then(() => pc.createAnswer())
                    .then((respuesta) => pc.setLocalDescription(respuesta))
                    .then(() => {
                        window.Cudi.enviarSocket({
                            type: "answer",
                            answer: pc.localDescription,
                            targetPeerId: fromId
                        });
                    })
                    .catch((error) => console.error("Error handling offer:", error));

            } else if (type === "respuesta" || type === "answer") {
                const instance = state.activeChats.get(fromId);
                const sdp = mensaje.respuesta || mensaje.answer;
                if (instance) {
                    instance.pc.setRemoteDescription(new RTCSessionDescription(sdp)).catch(console.error);
                }

            } else if (type === "candidato" || type === "candidate") {
                const instance = state.activeChats.get(fromId);
                const cand = mensaje.candidato || mensaje.candidate;
                if (instance) {
                    instance.pc.addIceCandidate(new RTCIceCandidate(cand)).catch(console.error);
                }
            }
            break;
        }

        case "error":
            logger("Server Error:", mensaje.message);
            window.Cudi.toggleLoading(false);
            if (mensaje.message === "Wrong password") {
                alert("Incorrect Password.");
                window.location.hash = "";
                window.location.reload();
            } else {
                window.Cudi.showToast(mensaje.message, "error");
            }
            break;
    }
}

function manejarChunk(data, peerId) {
    const state = window.Cudi.state;
    if (typeof data === "string") {
        try {
            const msg = JSON.parse(data);
            const instance = state.activeChats.get(peerId);
            const dc = instance ? instance.dc : state.dataChannel;

            if (msg.type === "presence" || msg.type === "profile") {
                window.Cudi.handlePresenceUpdate(peerId, msg);

                // Cache metadata for sidebar persistence
                if (msg.type === "profile" && window.Cudi.opfs.saveContactMetadata) {
                    window.Cudi.opfs.saveContactMetadata(peerId, {
                        alias: msg.name,
                        photo: msg.photo
                    });
                }
                return; // Vital: Volatile presence
            }

            if (msg.type === "meta") {
                state.nombreArchivoRecibido = msg.nombre;
                state.tamañoArchivoEsperado = msg.tamaño;
                state.tipoMimeRecibido = msg.tipoMime;
                state.hashEsperado = msg.hash;
                state.hashType = msg.hashType;
                state.archivoRecibidoBuffers = [];
                state.bytesReceived = 0;
                state.lastLoggedPercent = 0;

                // Prompt User to Start Download (Disk or RAM)
                if (window.Cudi.displayIncomingFileRequest) {
                    window.Cudi.displayIncomingFileRequest(msg.nombre, msg.tamaño, async () => {
                        // Try Native File System API
                        if (window.showSaveFilePicker) {
                            try {
                                const handle = await window.showSaveFilePicker({ suggestedName: msg.nombre });
                                state.fileHandle = handle;
                                state.fileWritable = await handle.createWritable();
                            } catch (e) {
                                if (e.name === 'AbortError') return false;
                                console.warn("File saving skipped/failed, falling back to RAM");
                            }
                        }
                        // Send Ready Signal
                        if (dc) dc.send(JSON.stringify({ type: "start_transfer" }));
                        return true;
                    });
                } else {
                    if (dc) dc.send(JSON.stringify({ type: "start_transfer" }));
                }

            } else if (msg.type === "start_transfer") {
                if (window.Cudi.startFileStreaming) window.Cudi.startFileStreaming();
            } else if (msg.type === "chat") {
                // Protocol: { type: "text", content: "...", timestamp: 123, sender: "id" }
                const formattedMsg = {
                    type: msg.subType || "text",
                    content: msg.content || msg.message,
                    timestamp: msg.timestamp || Date.now(),
                    sender: peerId
                };

                // Persistence handled in window.Cudi.appendMessage (which checks isZeroTrace)
                window.Cudi.appendMessage(peerId, formattedMsg);
                window.Cudi.displayChatMessage(formattedMsg.content, "received", msg.alias || peerId);
            }


        } catch {
            // Ignore JSON parse errors for non-JSON strings
        }
    } else {
        // ... binary handling ...
        if (data instanceof Blob) {
            const reader = new FileReader();
            reader.onload = () => window.Cudi.processBuffer(reader.result);
            reader.readAsArrayBuffer(data);
        } else {
            window.Cudi.processBuffer(data);
        }
    }
}

/* ===========================
   Sync Live (Video/Screen)
   =========================== */

window.Cudi.localStream = null;

window.Cudi.renegotiate = async function () {
    const state = window.Cudi.state;
    if (!state.peer) return;
    try {
        const offer = await state.peer.createOffer();
        await state.peer.setLocalDescription(offer);
        window.Cudi.enviarSocket({
            tipo: 'oferta',
            oferta: state.peer.localDescription,
            sala: state.salaId
        });
    } catch (e) {
        console.error('Renegotiation failed', e);
    }
};

window.Cudi.startVideo = async function () {
    const state = window.Cudi.state;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        window.Cudi.localStream = stream;

        const localVideo = document.getElementById('localVideo');
        const localVideoPlaceholder = document.getElementById('localVideoPlaceholder');
        const btnToggleAudio = document.getElementById('btnToggleAudio');
        const btnToggleVideo = document.getElementById('btnToggleVideo');

        if (localVideo) {
            localVideo.srcObject = stream;
            localVideo.muted = true;
            document.getElementById('videoContainer').classList.remove('hidden');
            if (localVideoPlaceholder) localVideoPlaceholder.classList.add('hidden');
        }

        if (btnToggleAudio) {
            btnToggleAudio.innerHTML = ICONS.micOn;
            btnToggleAudio.style.backgroundColor = '';
            btnToggleAudio.style.color = '';
        }
        if (btnToggleVideo) {
            btnToggleVideo.innerHTML = ICONS.videoOn;
            btnToggleVideo.style.backgroundColor = '';
            btnToggleVideo.style.color = '';
        }

        if (state.peer) {
            stream.getTracks().forEach(track => {
                const senders = state.peer.getSenders();
                const existingSender = senders.find(s => s.track && s.track.kind === track.kind);
                if (existingSender) {
                    existingSender.replaceTrack(track);
                } else {
                    state.peer.addTrack(track, stream);
                }
            });
            window.Cudi.renegotiate();
        }

        const btnStart = document.getElementById('btnStartVideo');
        if (btnStart) btnStart.classList.add('hidden');

    } catch (err) {
        console.error('Error accessing media devices: ', err);
        window.Cudi.showToast('Cannot access camera/microphone.', 'error');
    }
};

window.Cudi.stopVideo = function () {
    const state = window.Cudi.state;
    if (window.Cudi.localStream) {
        window.Cudi.localStream.getTracks().forEach(track => {
            track.stop();
            if (state.peer) {
                const senders = state.peer.getSenders();
                const sender = senders.find(s => s.track === track);
                if (sender) {
                    try { state.peer.removeTrack(sender); } catch (e) {
                        // Ignore removeTrack errors
                    }
                }
            }
        });
        window.Cudi.localStream = null;
    }

    document.getElementById('videoContainer').classList.add('hidden');
    const btnStart = document.getElementById('btnStartVideo');
    if (btnStart) btnStart.classList.remove('hidden');

    const localVideoPlaceholder = document.getElementById('localVideoPlaceholder');
    if (localVideoPlaceholder) localVideoPlaceholder.classList.add('hidden');

    window.Cudi.renegotiate();
};

window.Cudi.startScreenShare = async function () {
    const state = window.Cudi.state;
    if (!state.peer) {
        window.Cudi.showToast('No active connection.', 'error');
        return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        window.Cudi.showToast('Screen sharing not supported on this device.', 'error');
        return;
    }

    try {
        // Mobile browsers might behave differently, simple constraint is best
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const videoTrack = screenStream.getVideoTracks()[0];

        const sender = state.peer.getSenders().find(s => s.track && s.track.kind === 'video');

        if (sender) {
            sender.replaceTrack(videoTrack);
        } else {
            state.peer.addTrack(videoTrack, screenStream);
            window.Cudi.renegotiate();
        }

        document.getElementById('localVideo').srcObject = screenStream;

        videoTrack.onended = () => {
            if (window.Cudi.localStream) {
                const camTrack = window.Cudi.localStream.getVideoTracks()[0];
                if (sender) sender.replaceTrack(camTrack);
                document.getElementById('localVideo').srcObject = window.Cudi.localStream;
            } else {
                if (sender) try { state.peer.removeTrack(sender); } catch (e) {
                    // Ignore track removal error
                }
                window.Cudi.stopVideo();
                window.Cudi.renegotiate();
            }
        };

    } catch (err) {
        console.error('Error sharing screen: ', err);
        if (err.name === 'NotAllowedError') {
            window.Cudi.showToast('Screen sharing permission denied.', 'error');
        } else if (err.name === 'NotFoundError') {
            window.Cudi.showToast('No screen found to share.', 'error');
        } else {
            window.Cudi.showToast('Screen share failed: ' + err.message, 'error');
        }
    }
};

const ICONS = {
    micOn: '<svg name="mic-on" viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>',
    micOff: '<svg name="mic-off" viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-1.01.9-2.15.9-3.28zm-3.21 4.38l1.45 1.45C16.16 17.58 14.88 18.24 13.5 18.5v2.26h-3v-2.26c-1.66-.31-3.15-1.25-4.14-2.58l1.43-1.43c.72.93 1.76 1.62 2.96 1.83V12.9L3 5.27 4.27 4l16.73 16.73L19.73 22l-1.57-1.57-2.37-5.05zM7 9h1.74l1.55 1.55c-.09-.18-.16-.36-.21-.55V5c0-1.66 1.34-3 3-3 1.35 0 2.5.86 2.87 2.06l3.63 3.63c-.15-2.5-2.25-4.49-4.75-4.49-2.61 0-4.75 2.14-4.75 4.75V9z"/></svg>',
    videoOn: '<svg name="video-on" viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>',
    videoOff: '<svg name="video-off" viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M19.73 21.46L18 19.73v-1.23l-4-4v-3L6.27 3.73 5 5l12.73 12.73 2 2 1.27-1.27zM21 7c0-.55-.45-1-1-1h-6.73l2 2H20v5.27l1 1V7zM4 6.27L14.73 17H4c-.55 0-1-.45-1-1V7c0-.55.45-1 1-1h-.27z"/></svg>'
};

window.Cudi.toggleAudio = function () {
    if (window.Cudi.localStream) {
        const audioTrack = window.Cudi.localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            const btn = document.querySelector('#btnToggleAudio');
            if (btn) {
                btn.innerHTML = audioTrack.enabled ? ICONS.micOn : ICONS.micOff;
                btn.style.backgroundColor = audioTrack.enabled ? '' : '#dc3545';
                btn.style.color = audioTrack.enabled ? '' : 'white';
            }
        }
    }
};

window.Cudi.toggleVideo = function () {
    if (window.Cudi.localStream) {
        const videoTrack = window.Cudi.localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            const btn = document.querySelector('#btnToggleVideo');
            if (btn) {
                btn.innerHTML = videoTrack.enabled ? ICONS.videoOn : ICONS.videoOff;
                btn.style.backgroundColor = videoTrack.enabled ? '' : '#dc3545';
                btn.style.color = videoTrack.enabled ? '' : 'white';

                const localVideoPlaceholder = document.getElementById('localVideoPlaceholder');
                if (localVideoPlaceholder) {
                    if (videoTrack.enabled) {
                        localVideoPlaceholder.classList.add('hidden');
                    } else {
                        localVideoPlaceholder.classList.remove('hidden');
                    }
                }
            }
        }
    }
};

