

window.Cudi.iniciarHandshakeWebRTC = function (targetId) {
    if (window.Cudi.webRTCManager) return window.Cudi.webRTCManager.crearPeer(true, targetId);
    return window.Cudi.crearPeer(true, targetId);
};

window.Cudi.handleOffer = function (mensaje) {
    if (window.Cudi.webRTCManager) return window.Cudi.webRTCManager.handleOffer(mensaje);
    const state = window.Cudi.state;
    const fromId = mensaje.fromPeerId;

    let instance = state.activeChats.get(fromId);
    if (instance) {
        try { instance.pc.close(); } catch {
            // Ignore error on close
        }
        state.activeChats.delete(fromId);
        window.Cudi.store.setState({ activeChats: state.activeChats });
    }

    instance = window.Cudi.crearPeer(false, fromId);
    const pc = instance.pc;
    const sdp = mensaje.oferta || mensaje.offer;

    pc.setRemoteDescription(new RTCSessionDescription(sdp))
        .then(() => {
            return pc.createAnswer();
        })
        .then((respuesta) => {
            return pc.setLocalDescription(respuesta);
        })
        .then(() => {
            window.Cudi.enviarSocket({
                type: "answer",
                answer: pc.localDescription,
                targetPeerId: fromId
            });
        })
        .catch(() => {
        });
};

window.Cudi.crearPeer = function (isOffer, targetId = null) {
    if (window.Cudi.webRTCManager) return window.Cudi.webRTCManager.crearPeer(isOffer, targetId);
    const state = window.Cudi.state;
    if (!state) return;

    state.activeChats = state.activeChats || new Map();
    state.peers = state.peers || new Map();

    if (!targetId) return;

    if (state.activeChats.has(targetId)) {
        const existing = state.activeChats.get(targetId);
        const pcState = existing.pc.connectionState;

        if (pcState === 'connected' || pcState === 'connecting') {
            return existing;
        }

        try { existing.pc.close(); } catch {
            // Ignore error on close
        }
        state.activeChats.delete(targetId);
    }

    const currentStun = window.currentSettings?.stun || "google";
    const dynamicIceServers = window.Cudi.STUN_SERVERS_MAP ? (window.Cudi.STUN_SERVERS_MAP[currentStun] || window.Cudi.STUN_SERVERS_MAP["google"]) : [{ urls: "stun:stun.l.google.com:19302" }];

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
            window.Cudi.enviarSocket({
                type: "candidate",
                candidato: event.candidate,
                targetPeerId: targetId
            });
        }
    };

    pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
            window.Cudi.showToast(`Connected to ${targetId}`, "success");
            document.getElementById('meeting-tools')?.classList.add('hidden');

            if (window.Cudi.webRTCManager) window.Cudi.webRTCManager.optimizeForMesh();
        }
        if (pc.connectionState === "closed" || pc.connectionState === "failed") {
            state.activeChats.delete(targetId);
        }
    };

    pc.ontrack = (event) => {
        if (event.track.kind === 'video') {
            const remoteVideo = document.getElementById('remoteVideo');
            if (remoteVideo) {
                remoteVideo.srcObject = event.streams[0];
                document.getElementById('videoContainer')?.classList.remove('hidden');
            }
        } else if (event.track.kind === 'audio') {
            const audio = new Audio();
            audio.srcObject = event.streams[0];
            audio.play().catch(() => { });
        }

        if (window.Cudi.webRTCManager) window.Cudi.webRTCManager.optimizeForMesh();
    };

    pc.ondatachannel = (event) => {
        window.Cudi.setupDataChannel(event.channel, targetId);
    };

    if (isOffer) {
        const dc = pc.createDataChannel("canalDatos");
        window.Cudi.setupDataChannel(dc, targetId);

        if (window.Cudi.ui && window.Cudi.ui.setChatStatus) {
            window.Cudi.ui.setChatStatus(targetId, 'connecting');
        }

        pc.createOffer()
            .then((oferta) => {
                return pc.setLocalDescription(oferta);
            })
            .then(() => {
                window.Cudi.enviarSocket({
                    type: "offer",
                    offer: pc.localDescription,
                    targetPeerId: targetId
                });
            })
            .catch(() => {
            });
    }

    return chatInstance;
}

window.Cudi.setupDataChannel = function (channel, peerId) {
    const state = window.Cudi.state;
    const instance = state.activeChats.get(peerId);
    if (!instance) return;

    instance.dc = channel;

    instance.dc.onopen = () => {
        window.Cudi.showToast("Secure channel established.", "success");

        if (window.Cudi.syncPendingMessages) {
            window.Cudi.syncPendingMessages(peerId);
        }

        if (window.communityManager && window.communityManager.currentCommunity) {
            instance.dc.send(JSON.stringify({
                type: 'room_suggestions',
                suggestedRooms: [
                    { id: 'general-lobby', name: 'General Lobby' },
                    { id: 'dev-cloak', name: 'Developers' }
                ]
            }));
        }

        window.Cudi.syncProfile(peerId);

        if (window.Cudi.state.currentPeerId === peerId) {
            window.Cudi.showToast(`Connection restored with peer!`, "success");
        }

        window.Cudi.startHeartbeat(peerId);

        if (window.Cudi.ui) {
            if (window.Cudi.ui.setChatStatus) window.Cudi.ui.setChatStatus(peerId, 'online');
            if (window.Cudi.ui.renderRecentChats) window.Cudi.ui.renderRecentChats();
            if (window.Cudi.ui.updateMemberSidebar) window.Cudi.ui.updateMemberSidebar();
        }

        if (!state.currentPeerId && window.Cudi.appType === 'cloaks') {
            window.Cudi.store.setState({ currentPeerId: peerId });
        }

        const chatInput = document.getElementById("chatInput");
        const sendChatBtn = document.getElementById("sendChatBtn");
        const fileInput = document.getElementById("fileInput");

        if (chatInput && window.Cudi.state.currentPeerId === peerId) {
            chatInput.disabled = false;
            chatInput.placeholder = `Message #${peerId}`;
        }
        if (sendChatBtn) sendChatBtn.disabled = false;
        if (fileInput) fileInput.disabled = false;
    };

    instance.dc.onclose = () => {
        window.Cudi.stopHeartbeat(peerId);
    };

    instance.dc.onmessage = (event) => {
        const state = window.Cudi.state;
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'room_suggestions') {
                data.suggestedRooms.forEach(room => {
                    state.discoveredRooms.set(room.id, room);
                });
                if (window.Cudi.ui) window.Cudi.ui.renderRecentChats();
                return;
            }
        } catch {
            // Ignore JSON parsing errors for non-JSON payloads
        }

        manejarChunk(event.data, peerId);
    };
}

window.Cudi.manejarMensaje = function (mensaje) {
    const fromId = mensaje.permanentId || mensaje.fromPeerId || mensaje.peerId || mensaje.sender || mensaje.fromId || mensaje.from;
    if (fromId) {
        mensaje.fromPeerId = fromId;
        mensaje.peerId = fromId;
    }
    const state = window.Cudi.state;

    switch (mensaje.type) {
        case "joined":
            state.sessionId = mensaje.yourId;
            window.Cudi.showToast("Logged in successfully.", "success");
            window.Cudi.toggleLoading(false);

            if (mensaje.peers && mensaje.peers.length > 0) {
                mensaje.peers.filter(p => (p.permanentId || p.id) !== state.myId).forEach(p => {
                    const idToUse = p.permanentId || p.id;
                    const cleanAlias = window.Cudi.sanitizeAlias(p.alias || idToUse);
                    const peerData = { ...p, alias: cleanAlias };
                    state.sessionPeers.set(idToUse, peerData);
                    state.peers.set(idToUse, peerData);

                    window.Cudi.crearPeer(true, idToUse);
                });

                if (window.Cudi.appType === 'cloaks' && !state.currentPeerId && mensaje.peers.length > 0) {
                    const firstPeer = mensaje.peers[0];
                    const firstPeerId = firstPeer.permanentId || firstPeer.id;
                    window.Cudi.store.setState({ currentPeerId: firstPeerId });
                    if (window.Cudi.ui) window.Cudi.ui.updateChatHeader(firstPeerId);
                }
            }

            if (window.Cudi.ui) window.Cudi.ui.updateMemberSidebar();
            break;

        case "registered":
            state.sessionId = mensaje.peerId;
            window.Cudi.toggleLoading(false);
            break;

        case "peer_joined": {
            const realId = mensaje.permanentId || mensaje.peerId;
            if (realId === state.myId) return;

            const cleanAlias = window.Cudi.sanitizeAlias(mensaje.alias || realId);
            const peerData = { id: realId, alias: cleanAlias };

            state.sessionPeers.set(realId, peerData);
            state.peers.set(realId, peerData);

            window.Cudi.showToast(`${cleanAlias} joined the room.`, "info");

            if (window.Cudi.ui) {
                window.Cudi.ui.updateMemberSidebar();
            }

            if (window.Cudi.appType === 'cloaks' && !state.currentPeerId) {
                window.Cudi.store.setState({ currentPeerId: realId });
                if (window.Cudi.ui) {
                    window.Cudi.ui.updateChatHeader(realId);
                    window.Cudi.ui.renderRecentChats();
                }
            }
            break;
        }

        case "peer_left": {
            const leftId = mensaje.peerId;
            const instance = state.activeChats.get(leftId);
            const active = instance && instance.pc && 
                           (instance.pc.connectionState === 'connected' || instance.pc.connectionState === 'connecting');
            if (active) {
                break;
            }

            state.sessionPeers.delete(leftId);
            state.peers.delete(leftId);

            if (window.Cudi.ui) {
                window.Cudi.ui.updateMemberSidebar();
            }
            window.Cudi.showToast("A contact has left the room.", "info");
            break;
        }

        case "signal":
        case "offer":
        case "answer":
        case "candidate": {
            const fromId = mensaje.permanentId || mensaje.fromPeerId || mensaje.peerId || mensaje.sender || mensaje.fromId || mensaje.from;

            mensaje.fromPeerId = fromId;

            if (!fromId) {
                break;
            }
            const type = mensaje.signalType || mensaje.type;

            if (type === "offer") {
                window.Cudi.handleOffer(mensaje);
            } else if (type === "answer") {
                const instance = state.activeChats.get(fromId);
                const sdp = mensaje.respuesta || mensaje.answer;
                if (instance) {
                    instance.pc.setRemoteDescription(new RTCSessionDescription(sdp)).catch(() => { /* ignore */ });
                }
            } else if (type === "candidate") {
                const instance = state.activeChats.get(fromId);
                const cand = mensaje.candidato || mensaje.candidate;
                if (instance) {
                    instance.pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => { /* ignore */ });
                }
            }
            break;
        }

        case "call_invite":
            window.Cudi.handleCallInvite(mensaje);
            break;
        case "call_accepted":
            window.Cudi.handleCallAccepted(mensaje);
            break;
        case "call_declined":
            window.Cudi.showToast(`${mensaje.fromAlias || mensaje.fromPeerId} declined the call.`, "info");
            break;

        case "error":
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

async function manejarChunk(data, peerId) {
    const state = window.Cudi.state;
    if (typeof data === "string") {
        try {
            const msg = JSON.parse(data);
            const instance = state.activeChats.get(peerId);
            const dc = instance ? instance.dc : state.dataChannel;

            if (msg.type === "presence" || msg.type === "profile") {
                window.Cudi.handlePresenceUpdate(peerId, msg);

                if (msg.type === "profile" && window.Cudi.opfs.saveContactMetadata) {
                    window.Cudi.opfs.saveContactMetadata(peerId, {
                        alias: msg.name,
                        photo: msg.photo
                    });
                }
                return;
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

                const RAM_LIMIT = 50 * 1024 * 1024;

                if (msg.tamaño > RAM_LIMIT) {
                    if (window.showSaveFilePicker) {
                        try {
                            const handle = await window.showSaveFilePicker({ suggestedName: msg.nombre });
                            state.fileHandle = handle;
                            state.fileWritable = await handle.createWritable();
                            if (dc) dc.send(JSON.stringify({ type: "start_transfer" }));
                        } catch {
                            window.Cudi.showToast("File too large. Save location required.", "error");
                        }
                    } else {
                        window.Cudi.showToast("Browser does not support saving large files directly to disk.", "error");
                    }
                } else if (window.Cudi.displayIncomingFileRequest) {
                    window.Cudi.displayIncomingFileRequest(msg.nombre, msg.tamaño, async () => {
                        if (window.showSaveFilePicker) {
                            try {
                                const handle = await window.showSaveFilePicker({ suggestedName: msg.nombre });
                                state.fileHandle = handle;
                                state.fileWritable = await handle.createWritable();
                            } catch {
                                return false;
                            }
                        }
                        if (dc) dc.send(JSON.stringify({ type: "start_transfer" }));
                        return true;
                    });
                } else {
                    if (dc) dc.send(JSON.stringify({ type: "start_transfer" }));
                }

            } else if (msg.type === "start_transfer") {
                if (window.Cudi.startFileStreaming) window.Cudi.startFileStreaming();
            } else if (msg.type === "retry_chunk") {
                if (window.Cudi.retryChunk) window.Cudi.retryChunk(msg.offset);
            } else if (msg.type === "chat") {
                const formattedMsg = {
                    type: msg.subType || "text",
                    content: msg.content || msg.message,
                    alias: msg.alias || peerId,
                    timestamp: msg.timestamp || Date.now(),
                    sender: peerId
                };

                window.Cudi.appendMessage(peerId, formattedMsg);
                window.Cudi.displayChatMessage(formattedMsg.content, "received", msg.alias || peerId);
            }


        } catch {
            // Ignore message handling error
        }
    } else {
        if (data instanceof Blob) {
            const reader = new FileReader();
            reader.onload = () => window.Cudi.processBuffer(reader.result);
            reader.readAsArrayBuffer(data);
        } else {
            window.Cudi.processBuffer(data);
        }
    }
}

window.Cudi.localStream = null;

window.Cudi.renegotiate = async function (targetPeerId = null) {
    const state = window.Cudi.state;
    const doRenegotiate = async (peerId, instance) => {
        if (!instance || !instance.pc) return;
        const pc = instance.pc;
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            window.Cudi.enviarSocket({
                type: 'offer',
                offer: pc.localDescription,
                targetPeerId: peerId
            });
        } catch {
            // Ignore renegotiation error
        }
    };

    if (targetPeerId) {
        await doRenegotiate(targetPeerId, state.activeChats.get(targetPeerId));
    } else if (state.currentPeerId) {
        await doRenegotiate(state.currentPeerId, state.activeChats.get(state.currentPeerId));
    }
};

window.Cudi.startVoiceOnly = async function () {
    const state = window.Cudi.state;
    try {
        if (!window.Cudi.localStream) {
            window.Cudi.localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        }

        state.activeChats.forEach(async (instance, peerId) => {
            await window.Cudi.updateAudioBridging(peerId);
        });

        window.Cudi.showToast("Active voice channel.", "success");
    } catch {
        window.Cudi.showToast('The microphone cannot be accessed.', 'error');
    }
};

window.Cudi.stopVoiceOnly = function () {
    if (window.Cudi.localStream) {
        window.Cudi.localStream.getTracks().forEach(track => track.stop());
        window.Cudi.localStream = null;
    }
    window.Cudi.state.activeChats.forEach(async (instance, peerId) => {
        const pc = instance.pc;
        pc.getSenders().forEach(sender => {
            if (sender.track && (sender.track.kind === 'audio' || sender.track.kind === 'video')) {
                pc.removeTrack(sender);
            }
        });
        if (window.Cudi.state.myId >= peerId) {
            await window.Cudi.renegotiate(peerId);
        }
    });
    window.Cudi.showToast("You have left the voice channel.", "info");
};

window.Cudi.updateAudioBridging = async function (peerId) {
    const state = window.Cudi.state;
    const instance = state.activeChats.get(peerId);
    if (!instance || !instance.pc) return;

    const peerData = state.peers.get(peerId);
    const currentChannel = window.communityManager?.currentChannel;

    const sameChannel = currentChannel && currentChannel.type === 'voice' && peerData && peerData.currentChannelId === currentChannel.id;
    const isDirectChat = !currentChannel && window.Cudi.appType === 'cloaks';

    const pc = instance.pc;
    const currentSenders = pc.getSenders();
    const hasAudioTrack = currentSenders.some(s => s.track && s.track.kind === 'audio');

    if (sameChannel || isDirectChat) {
        if (!hasAudioTrack && window.Cudi.localStream) {
            window.Cudi.localStream.getAudioTracks().forEach(track => {
                pc.addTrack(track, window.Cudi.localStream);
            });
            if (state.myId >= peerId) await window.Cudi.renegotiate(peerId);
        }
    } else {
        if (hasAudioTrack) {
            currentSenders.forEach(s => {
                if (s.track && s.track.kind === 'audio') pc.removeTrack(s);
            });
            if (state.myId >= peerId) await window.Cudi.renegotiate(peerId);
        }
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

        const instance = state.activeChats.get(state.currentPeerId);
        const pc = instance ? instance.pc : state.peer;

        if (pc) {
            stream.getTracks().forEach(track => {
                const senders = pc.getSenders();
                const existingSender = senders.find(s => s.track && s.track.kind === track.kind);
                if (existingSender) {
                    existingSender.replaceTrack(track);
                } else {
                    pc.addTrack(track, stream);
                }
            });
            window.Cudi.renegotiate();
        }

        const btnStart = document.getElementById('btnStartVideo');
        if (btnStart) btnStart.classList.add('hidden');

    } catch {
        window.Cudi.showToast('Cannot access camera/microphone.', 'error');
    }
};

window.Cudi.stopVoiceOnly = function () {
    const state = window.Cudi.state;
    if (window.Cudi.localStream) {
        const instance = state.activeChats.get(state.currentPeerId);
        const pc = instance ? instance.pc : state.peer;

        window.Cudi.localStream.getTracks().forEach(track => {
            track.stop();
            if (pc) {
                const senders = pc.getSenders();
                const sender = senders.find(s => s.track === track);
                if (sender) {
                    try { pc.removeTrack(sender); } catch {
                        // Ignore track removal error
                    }
                }
            }
        });
        window.Cudi.localStream = null;
        window.Cudi.renegotiate();
    }
};

window.Cudi.stopVideo = function () {
    const state = window.Cudi.state;
    if (window.Cudi.localStream) {
        const instance = state.activeChats.get(state.currentPeerId);
        const pc = instance ? instance.pc : state.peer;

        window.Cudi.localStream.getTracks().forEach(track => {
            track.stop();
            if (pc) {
                const senders = pc.getSenders();
                const sender = senders.find(s => s.track === track);
                if (sender) {
                    try { pc.removeTrack(sender); } catch {
                        // Ignore track removal error
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
                if (sender) {
                    try { state.peer.removeTrack(sender); } catch {
                        // Ignore track removal error
                    }
                }
                window.Cudi.stopVideo();
                window.Cudi.renegotiate();
            }
        };

    } catch (err) {
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

window.Cudi.inviteToCall = function (type) {
    const state = window.Cudi.state;
    if (!state.currentPeerId) return;

    window.Cudi.enviarSocket({
        type: "call_invite",
        callType: type,
        fromPeerId: state.myId,
        fromAlias: state.localAlias,
        fromPhoto: window.identityManager?.profile?.photo || "",
        targetPeerId: state.currentPeerId
    });
};

window.Cudi.handleCallInvite = function (mensaje) {
    const modal = document.getElementById('incoming-call-modal');
    if (!modal) return;

    const callerName = document.getElementById('caller-name');
    const callTypeLabel = document.getElementById('call-type');
    const callerAvatar = document.getElementById('caller-avatar');

    if (callerName) callerName.innerHTML = mensaje.fromAlias || mensaje.fromPeerId;
    if (callTypeLabel) callTypeLabel.innerHTML = mensaje.callType === 'video' ? 'Videollamada entrante...' : 'Llamada de voz entrante...';
    if (callerAvatar && mensaje.fromPhoto) {
        callerAvatar.src = mensaje.fromPhoto;
    }

    modal.classList.remove('hidden');

    const btnAccept = document.getElementById('btn-accept-call');
    const btnDecline = document.getElementById('btn-decline-call');

    btnAccept.onclick = () => {
        modal.classList.add('hidden');
        window.Cudi.enviarSocket({
            type: "call_accepted",
            callType: mensaje.callType,
            fromPeerId: window.Cudi.state.myId,
            targetPeerId: mensaje.fromPeerId
        });
        if (mensaje.callType === 'video') {
            window.Cudi.startVideo();
        } else {
            window.Cudi.startVoiceOnly();
        }
    };

    btnDecline.onclick = () => {
        modal.classList.add('hidden');
        window.Cudi.enviarSocket({
            type: "call_declined",
            fromPeerId: window.Cudi.state.myId,
            targetPeerId: mensaje.fromPeerId
        });
    };
};

window.Cudi.handleCallAccepted = function (mensaje) {
    window.Cudi.showToast("Call Accepted. Connecting...", "success");
    if (mensaje.callType === 'video') {
        window.Cudi.startVideo();
    } else {
        window.Cudi.startVoiceOnly();
    }
};

window.Cudi.manejarChunk = manejarChunk;
