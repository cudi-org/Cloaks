window.Cudi.handleFileSelection = function (file) {
    const state = window.Cudi.state;
    state.archivoParaEnviar = file;

    const limitMB = parseInt(window.currentSettings?.maxFileSize || "0");
    if (limitMB > 0 && file.size > limitMB * 1024 * 1024) {
        window.Cudi.showToast(`File too large. Limit is ${limitMB}MB.`, "error");
        state.archivoParaEnviar = null;
        return;
    }

    const peerId = state.currentPeerId;
    const instance = state.activeChats.get(peerId);
    const dc = instance ? instance.dc : null;

    if (dc && dc.readyState === "open") {
        window.Cudi.enviarArchivo();
    } else {
        state.enviarArchivoPendiente = true;
        window.Cudi.showToast(`Selected ${file.name}. Queued.`, "info");
    }
}



function compareBuffers(buf1, buf2) {
    if (buf1.byteLength != buf2.byteLength) return false;
    const dv1 = new Int8Array(buf1);
    const dv2 = new Int8Array(buf2);
    for (let i = 0; i != buf1.byteLength; i++) {
        if (dv1[i] != dv2[i]) return false;
    }
    return true;
}

window.Cudi.enviarArchivo = async function () {
    const state = window.Cudi.state;
    if (!state.archivoParaEnviar) return;

    const peerId = state.currentPeerId;
    const instance = state.activeChats.get(peerId);
    const dc = instance ? instance.dc : null;

    if (!dc) {
        window.Cudi.showToast("No active data channel to send file.", "error");
        return;
    }

    const file = state.archivoParaEnviar;
    const limitMB = parseInt(window.currentSettings?.maxFileSize || "0");
    if (limitMB > 0 && file.size > limitMB * 1024 * 1024) {
        window.Cudi.showToast(`File too large. Limit is ${limitMB}MB.`, "error");
        return;
    }

    if (file.size === 0) {
        window.Cudi.showToast("Cannot send empty files.", "error");
        return;
    }

    if (file.size > 1024 * 1024 * 1024) {
        window.Cudi.showToast("Files over 1GB are not supported in this version.", "error");
        return;
    }

    try {
        dc.send(JSON.stringify({
            type: "meta",
            nombre: file.name,
            tamaño: file.size,
            tipoMime: file.type || 'application/octet-stream',
            hash: null,
            hashType: 'chunk'
        }));

        const fileUrl = URL.createObjectURL(file);
        window.Cudi.displayFileDownload(file.name, fileUrl, "sent", "You");

        window.Cudi.appendMessage(peerId, {
            type: "file",
            content: `📄 Sent file: ${file.name}`,
            filename: file.name,
            timestamp: Date.now(),
            sender: state.myId
        });

        window.Cudi.showToast("Waiting for peer to accept transfer...", "info");
        state.isWaitingForTransferStart = true;

    } catch (e) {
        console.error("Error sending file meta:", e);
        window.Cudi.showToast("Failed to start file transfer.", "error");
        return;
    }
}

window.Cudi.startFileStreaming = async function () {
    const state = window.Cudi.state;
    const file = state.archivoParaEnviar;
    if (!file) {
        return;
    }

    const peerId = state.currentPeerId;
    const instance = state.activeChats.get(peerId);
    const dc = instance ? instance.dc : null;

    if (!dc) return;

    let offset = 0;
    let lastLoggedPercent = 0;
    const CHUNK_SIZE = 32 * 1024;
    const MAX_BUFFERED_AMOUNT = 1 * 1024 * 1024;
    dc.bufferedAmountLowThreshold = MAX_BUFFERED_AMOUNT / 2;

    window.Cudi.showToast(`Header accepted! Sending: ${file.name}...`, "info");

    const monitorVelocidad = setInterval(() => {
        if (!state.isWaitingForTransferStart || offset >= file.size) {
            clearInterval(monitorVelocidad);
            return;
        }
    }, 1000);

    try {
        while (offset < file.size) {
            if (dc.readyState !== 'open') throw new Error("Connection lost");



            if (dc.bufferedAmount > MAX_BUFFERED_AMOUNT) {
                await new Promise(resolve => setTimeout(resolve, 10));
                continue;
            }

            const slice = file.slice(offset, offset + CHUNK_SIZE);
            const chunkBuffer = await slice.arrayBuffer();

            const chunkHash = await crypto.subtle.digest('SHA-256', chunkBuffer);

            const packet = new Uint8Array(32 + chunkBuffer.byteLength);
            packet.set(new Uint8Array(chunkHash), 0);
            packet.set(new Uint8Array(chunkBuffer), 32);

            dc.send(packet);

            const percent = Math.floor(((offset + CHUNK_SIZE) / file.size) * 100);
            if (percent > lastLoggedPercent && percent % 5 === 0) {
                lastLoggedPercent = percent;
            }

            offset += CHUNK_SIZE;

            if ((offset / CHUNK_SIZE) % 400 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        window.Cudi.showToast("File sent successfully!", "success");

        if (window.Cudi.ui?.markFileAsVerified) {
            window.Cudi.ui.markFileAsVerified(file.name, "sent");
        }

        state.archivoParaEnviar = null;
        state.isWaitingForTransferStart = false;
        if (document.getElementById("fileInput")) document.getElementById("fileInput").value = "";

    } catch {
        clearInterval(monitorVelocidad);
        window.Cudi.showToast("Error sending file.", "error");
        state.isWaitingForTransferStart = false;
    }
}

window.Cudi.processBuffer = async function (data) {
    const state = window.Cudi.state;

    let dataContent = data;

    if (state.hashType === 'chunk') {
        if (data.byteLength <= 32) {
            return;
        }

        const receivedHash = data.slice(0, 32);
        dataContent = data.slice(32);

        try {
            const calculatedHash = await crypto.subtle.digest('SHA-256', dataContent);
            if (!compareBuffers(receivedHash, calculatedHash)) {
                window.Cudi.showToast(" Transmission Error: Chunk Corrupted. Aborting.", "error");
                state.tamañoArchivoEsperado = 0;

                if (state.fileWritable) {
                    await state.fileWritable.abort();
                    state.fileWritable = null;
                    state.fileHandle = null;
                }
                return;
            }
        } catch {
            return;
        }
    }

    if (state.fileWritable) {
        try {
            await state.fileWritable.write(dataContent);
        } catch {
            window.Cudi.showToast("Disk write failed (Space full?)", "error");
            state.tamañoArchivoEsperado = 0;
            return;
        }
    } else {
        state.archivoRecibidoBuffers.push(dataContent);
    }

    if (typeof state.bytesReceived === 'undefined') state.bytesReceived = 0;
    state.bytesReceived += dataContent.byteLength;

    if (state.tamañoArchivoEsperado > 0) {
        const percent = Math.floor((state.bytesReceived / state.tamañoArchivoEsperado) * 100);
        if (typeof state.lastLoggedPercent === 'undefined') state.lastLoggedPercent = 0;

        if (percent > state.lastLoggedPercent && percent % 5 === 0) {
            state.lastLoggedPercent = percent;
        }
    }

    if (state.bytesReceived >= state.tamañoArchivoEsperado) {
        window.Cudi.showToast(` File Verified & Received: ${state.nombreArchivoRecibido}`, "success");
        state.bytesReceived = 0;

        if (state.fileWritable) {
            await state.fileWritable.close();
            state.fileWritable = null;
            window.Cudi.displayChatMessage(`Saved to disk: ${state.nombreArchivoRecibido}`, "received", "Sender");

            if (window.Cudi.ui?.markFileAsVerified) {
                window.Cudi.ui.markFileAsVerified(state.nombreArchivoRecibido, "received");
            }

            const peerId = window.Cudi.state.currentPeerId;
            if (peerId) {
                window.Cudi.appendMessage(peerId, {
                    type: "file",
                    content: `📄 Received file (Saved to disk): ${state.nombreArchivoRecibido}`,
                    filename: state.nombreArchivoRecibido,
                    timestamp: Date.now(),
                    sender: peerId
                });
            }
        } else {
            const ext = state.nombreArchivoRecibido.split('.').pop().toLowerCase();
            let mimeType = state.tipoMimeRecibido || 'application/octet-stream';

            const MIME_MAP = {
                'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'ogg': 'audio/ogg',
                'mp4': 'video/mp4', 'webm': 'video/webm',
                'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'gif': 'image/gif', 'webp': 'image/webp',
                'pdf': 'application/pdf'
            };
            if (MIME_MAP[ext]) mimeType = MIME_MAP[ext];

            const blob = new Blob(state.archivoRecibidoBuffers, { type: mimeType });
            state.archivoRecibidoBuffers = [];

            const url = URL.createObjectURL(blob);
            window.Cudi.displayFileDownload(state.nombreArchivoRecibido, url, "received", "Sender", true);

            const peerId = window.Cudi.state.currentPeerId;
            if (peerId) {
                window.Cudi.appendMessage(peerId, {
                    type: "file",
                    content: `📄 Received file: ${state.nombreArchivoRecibido}`,
                    filename: state.nombreArchivoRecibido,
                    timestamp: Date.now(),
                    sender: peerId
                });
            }
        }
    }
}
