// Ensure Cudi namespace exists
window.Cudi = window.Cudi || {};

// Main Initialization
window.currentSettings = window.Cudi.LOADED_SETTINGS;

// Global Error Handler for debugging
window.onerror = function (msg, url, lineNo, columnNo, error) {
    console.error("Global Error:", msg, error);
    // Alert removed for production/usability
    return false;
};

window.onunhandledrejection = function (event) {
    console.error("Global Rejection:", event.reason);
};


// DOM Elements - Initialized when module runs (deferred)
const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const salaStatus = document.getElementById("salaStatus");
const qrContainer = document.getElementById("qrContainer");
const chatInput = document.getElementById("chatInput");
const sendChatBtn = document.getElementById("sendChatBtn");
const menuToggle = document.getElementById("menu-toggle");
const navbar = document.getElementById("navbar");
const tabSend = document.getElementById("tabSend");
const tabReceive = document.getElementById("tabReceive");
const btnCreate = document.getElementById("btnCreate");
const btnJoin = document.getElementById("unirseBtn");
const helpBtn = document.getElementById("help-btn");
const returnBtn = document.getElementById("return-btn");
const infoModal = document.getElementById("info-modal");
const closeModal = document.getElementById("close-modal");


function crearSala() {
    const customInput = document.getElementById("customRoomInput");
    const passwordInput = document.getElementById("roomPasswordInput");
    const customCode = customInput ? customInput.value.trim().toLowerCase() : "";
    const password = passwordInput ? passwordInput.value.trim() : "";

    if (customCode) {
        if (/^[a-z0-9-]{3,40}$/.test(customCode)) {
            window.Cudi.state.salaId = customCode;
        } else {
            window.Cudi.showToast("Invalid code. Use 3-40 alphanumeric chars.", "error");
            return;
        }
    } else {
        window.Cudi.state.salaId = window.Cudi.generarCodigo();
    }

    if (password) {
        window.Cudi.state.roomPassword = password;
    } else {
        window.Cudi.state.roomPassword = null;
    }

    window.Cudi.state.modo = "send";
    window.location.hash = `send-${window.Cudi.state.salaId}`;
    iniciarTransferencia();

    if (salaStatus) {
        salaStatus.textContent = window.Cudi.state.salaId;
        if (password) {
            salaStatus.textContent += " (🔒)";
        }
    }

    // Copy Link Button Logic
    const copyLinkBtn = document.getElementById("copy-link-btn");
    if (copyLinkBtn) {
        copyLinkBtn.style.display = "inline-flex";

        // Remove old listeners to prevent multiple toggles if re-running
        const newBtn = copyLinkBtn.cloneNode(true);
        copyLinkBtn.parentNode.replaceChild(newBtn, copyLinkBtn);

        newBtn.addEventListener("click", () => {
            const state = window.Cudi.state;
            let url = window.location.href.replace("send-", "receive-");
            if (state.roomToken) {
                url += `&token=${state.roomToken}`;
            }

            navigator.clipboard.writeText(url).then(() => {
                window.Cudi.showToast("Link copied to clipboard!", "success");
            }).catch(err => {
                console.error('Could not copy text: ', err);
            });
        });
    }

    // QR Logic - Hidden by default now
    if (qrContainer) {
        qrContainer.innerHTML = "";
        qrContainer.classList.add("hidden");

        const baseUrl = window.location.href.split('#')[0];
        const urlParaRecibir = `${baseUrl}#receive-${window.Cudi.state.salaId}`;

        if (typeof QRious !== 'undefined') {
            try {
                const qr = new QRious({
                    element: document.createElement("canvas"),
                    size: 220,
                    value: urlParaRecibir,
                });
                qrContainer.appendChild(qr.element);
            } catch (e) {
                console.error("QR Error", e);
                qrContainer.textContent = "Error generating QR";
            }
        } else {
            qrContainer.textContent = "QR Library not loaded.";
        }
    }

    // Toggle QR Button
    const toggleQrBtn = document.getElementById("toggle-qr-btn");
    if (toggleQrBtn) {
        // Remove old listeners
        const newQrBtn = toggleQrBtn.cloneNode(true);
        toggleQrBtn.parentNode.replaceChild(newQrBtn, toggleQrBtn);
        newQrBtn.addEventListener("click", () => {
            qrContainer.classList.toggle("hidden");
            window.Cudi.showToast(qrContainer.classList.contains("hidden") ? "QR Hidden" : "QR Visible", "info");
        });
    }

    window.Cudi.showToast("Room created. Access via Sidebar for info.", "info");
}

function unirseSala() {
    const codeInput = document.getElementById("codigoSala");
    const joinPasswordInput = document.getElementById("joinPasswordInput"); // Separate input for join
    const codigo = codeInput.value.trim();
    const password = joinPasswordInput ? joinPasswordInput.value.trim() : "";

    if (codigo) {
        window.Cudi.state.salaId = codigo.toLowerCase();
        window.Cudi.state.modo = "receive";
        if (password) {
            window.Cudi.state.roomPassword = password;
        } else {
            window.Cudi.state.roomPassword = null;
        }

        window.location.hash = `receive-${window.Cudi.state.salaId}`;
        iniciarTransferencia();
        window.Cudi.showToast("Joining room...", "info");
    } else {
        window.Cudi.showToast("Please enter a room code.", "error");
    }
}

function iniciarTransferencia() {
    document.getElementById("welcome-screen").classList.add("hidden");
    const messagesDisplay = document.getElementById("messagesDisplay");
    messagesDisplay.classList.remove("hidden");

    const zona = document.getElementById("zonaTransferencia");
    zona.classList.remove("hidden");

    const qrCont = document.getElementById("qrContainer");
    if (qrCont) qrCont.classList.add("hidden"); // Ensure hidden on start

    // Setup QR toggle in all cases
    const toggleQrBtn = document.getElementById("toggle-qr-btn");
    if (toggleQrBtn) {
        const newQrBtn = toggleQrBtn.cloneNode(true);
        toggleQrBtn.parentNode.replaceChild(newQrBtn, toggleQrBtn);
        newQrBtn.addEventListener("click", () => {
            qrCont.classList.toggle("hidden");
        });
    }

    if (salaStatus) salaStatus.textContent = window.Cudi.state.salaId + (window.Cudi.state.roomPassword ? " (🔒)" : "");

    const copyLinkBtn = document.getElementById("copy-link-btn");
    if (copyLinkBtn) {
        copyLinkBtn.classList.remove("hidden");

        // Remove old listeners
        const newBtn = copyLinkBtn.cloneNode(true);
        copyLinkBtn.parentNode.replaceChild(newBtn, copyLinkBtn);

        newBtn.addEventListener("click", () => {
            const baseUrl = window.location.href.split('#')[0];
            const url = `${baseUrl}#receive-${window.Cudi.state.salaId}`;

            navigator.clipboard.writeText(url).then(() => {
                window.Cudi.showToast("Link copied to clipboard!", "success");
            }).catch(err => {
                console.error('Could not copy text: ', err);
            });
        });
    }

    // document.querySelector('.container').classList.add('glass'); // Removed as .container no longer exists
    const appShell = document.querySelector('.app-shell');
    if (appShell) appShell.classList.add('in-room');

    window.Cudi.iniciarConexion();

    fileInput.disabled = true;
    chatInput.disabled = true;
    sendChatBtn.disabled = true;

    if (window.Cudi.state.modo === "receive") {
        window.Cudi.toggleLoading(true, "Connecting to peer...");

        setTimeout(() => {
            const loading = document.getElementById("loading-overlay");
            if (loading && !loading.classList.contains("hidden") && (!window.Cudi.state.peer || window.Cudi.state.peer.connectionState !== "connected")) {
                window.Cudi.toggleLoading(false);
                if (confirm("Connection timed out or rejected. Return to menu?")) {
                    window.location.hash = "";
                    window.location.reload();
                }
            }
        }, 15000);


        const lockBtn = document.getElementById("lock-room-btn");
        if (lockBtn) lockBtn.classList.add("hidden");
    } else {
        const lockBtn = document.getElementById("lock-room-btn");
        if (lockBtn) lockBtn.classList.remove("hidden");
    }
}




// Event Listeners
if (dropZone) {
    dropZone.addEventListener("click", () => {
        if (!fileInput.disabled) fileInput.click();
    });

    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("dragover");
    });

    dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("dragover");
    });

    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("dragover");
        if (fileInput.disabled) {
            window.Cudi.showToast("Wait for connection before sending files.", "error");
            return;
        }
        if (e.dataTransfer.files.length > 0) {
            window.Cudi.handleFileSelection(e.dataTransfer.files[0]);
        }
    });
}

if (fileInput) {
    fileInput.addEventListener("change", () => {
        if (fileInput.files.length > 0) {
            window.Cudi.handleFileSelection(fileInput.files[0]);
        }
    });
}

if (sendChatBtn && chatInput) {
    sendChatBtn.addEventListener("click", () => {
        const message = chatInput.value.trim();
        const state = window.Cudi.state;
        const peerId = state.currentPeerId;

        if (!peerId) {
            // Fallback for single-peer mode if any
            const firstPeerId = state.activeChats.keys().next().value;
            if (firstPeerId) state.currentPeerId = firstPeerId;
            else return;
        }

        const instance = state.activeChats.get(state.currentPeerId);
        if (message && instance && instance.dc && instance.dc.readyState === "open") {
            const myAlias = state.localAlias;
            const payload = {
                type: "chat",
                subType: "text",
                content: message,
                alias: myAlias,
                timestamp: Date.now(),
                sender: state.myId
            };

            instance.dc.send(JSON.stringify(payload));

            // Persist
            window.Cudi.appendMessage(state.currentPeerId, payload);

            window.Cudi.displayChatMessage(message, "sent", myAlias);
            chatInput.value = "";
        }
    });

    chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            sendChatBtn.click();
        }
    });
}


if ("serviceWorker" in navigator) {
    if (window.location.protocol.startsWith('http')) {
        window.addEventListener("load", () => {
            navigator.serviceWorker.register("./service-worker.js")
                .then(() => console.log("SW Registrado"))
                .catch((err) => console.log("SW Falló", err));
        });
    } else {
        console.log("Service Worker skipped (running on file:// protocol)");
    }
}

window.addEventListener("load", () => {
    if (window.location.hash) {
        const hash = window.location.hash.substring(1);
        if (hash.startsWith("send-")) {
            window.Cudi.state.salaId = hash.replace("send-", "").toLowerCase();
            window.Cudi.state.modo = "send";
            iniciarTransferencia();
            if (salaStatus) salaStatus.textContent = window.Cudi.state.salaId;
            // Re-gen QR if needed
            const baseUrl = window.location.href.split('#')[0];
            const urlParaRecibir = `${baseUrl}#receive-${window.Cudi.state.salaId}`;
            if (qrContainer && typeof QRious !== 'undefined') {
                qrContainer.innerHTML = "";
                qrContainer.classList.remove("hidden");
                try {
                    const qr = new QRious({
                        element: document.createElement("canvas"),
                        size: 220,
                        value: urlParaRecibir,
                    });
                    qrContainer.appendChild(qr.element);
                } catch (e) { console.error(e); }
            }

        } else if (hash.startsWith("receive-")) {
            const parts = hash.split('&');
            window.Cudi.state.salaId = parts[0].replace("receive-", "").toLowerCase();
            if (parts[1] && parts[1].startsWith("token=")) {
                window.Cudi.state.roomToken = parts[1].replace("token=", "");
            }
            window.Cudi.state.modo = "receive";
            iniciarTransferencia();
            const recepcion = document.getElementById("recepcion");
            if (recepcion) {
                recepcion.classList.remove("hidden");
                const codeInp = document.getElementById("codigoSala");
                if (codeInp) codeInp.value = window.Cudi.state.salaId;
            }
        }
    }
});

if (menuToggle && navbar) {
    menuToggle.addEventListener("click", () => {
        navbar.classList.toggle("active");
    });
}

if (btnCreate) btnCreate.addEventListener("click", crearSala);
if (btnJoin) btnJoin.addEventListener("click", unirseSala);

if (tabSend) {
    tabSend.addEventListener("click", () => {
        document.getElementById("send-controls").classList.remove("hidden");
        document.getElementById("recepcion").classList.add("hidden");
    });
}

if (tabReceive) {
    tabReceive.addEventListener("click", () => {
        document.getElementById("recepcion").classList.remove("hidden");
        document.getElementById("send-controls").classList.add("hidden");
    });
}

const btnCreateComm = document.getElementById("btnCreateCommunity");
if (btnCreateComm) {
    btnCreateComm.addEventListener("click", () => {
        if (window.communityManager) window.communityManager.generateCommunity();
    });
}

if (helpBtn && infoModal && closeModal) {
    helpBtn.addEventListener("click", () => {
        infoModal.classList.remove("hidden");
    });

    closeModal.addEventListener("click", () => {
        infoModal.classList.add("hidden");
    });

    infoModal.addEventListener("click", (e) => {
        if (e.target === infoModal) {
            infoModal.classList.add("hidden");
        }
    });
}

if (returnBtn) {
    returnBtn.addEventListener("click", () => {
        window.location.hash = "";
        window.location.reload();
    });
}

// Legal Notice Logic
const openLegalBtn = document.getElementById("open-legal-modal");
const legalModal = document.getElementById("legal-modal");
const legalAcceptBtn = document.getElementById("legal-accept-btn");

// Check if user has already accepted
if (!localStorage.getItem('legalAccepted')) {
    if (legalModal) legalModal.classList.remove('hidden');
}

if (openLegalBtn && legalModal && legalAcceptBtn) {
    openLegalBtn.addEventListener("click", (e) => {
        e.preventDefault();
        legalModal.classList.remove("hidden");
    });

    legalAcceptBtn.addEventListener("click", () => {
        localStorage.setItem('legalAccepted', 'true');
        legalModal.classList.add("hidden");
    });

    legalModal.addEventListener("click", (e) => {
        // Only allow closing by background click if already accepted? 
        // Or just allow it always for better UX
        if (e.target === legalModal) {
            // But if it's first time, we might want to force button click.
            // For now, let's just close it.
            legalModal.classList.add("hidden");
        }
    });
}

// Settings / Lock Room logic (missing from original script split? Add basic handling if needed)
// Assuming button IDs exist
// Settings / Lock Room logic
const lockRoomBtnLogic = document.getElementById("lock-room-btn");
if (lockRoomBtnLogic) {
    lockRoomBtnLogic.addEventListener("click", () => {
        window.Cudi.state.isRoomLocked = !window.Cudi.state.isRoomLocked;
        lockRoomBtnLogic.classList.toggle("locked", window.Cudi.state.isRoomLocked);
        window.Cudi.showToast(window.Cudi.state.isRoomLocked ? "Room Locked. New connections filtered." : "Room Unlocked.", "info");
    });
}

const panicBtnLogic = document.getElementById("panic-btn");
if (panicBtnLogic) {
    panicBtnLogic.addEventListener("click", () => {
        if (confirm("PANIC: Close session and clear all data?")) {
            if (window.Cudi.state.peer) window.Cudi.state.peer.close();
            if (window.Cudi.state.socket) window.Cudi.state.socket.close();

            // ALWAYS clear on panic, regardless of settings
            localStorage.clear();
            sessionStorage.clear();

            window.open('', '_self', '');
            window.close();
            window.location.href = "about:blank";
        }
    });
}

// Settings Logic
const settingsBtn = document.getElementById("settings-btn");
const settingsModal = document.getElementById("settings-modal");
const closeSettingsModal = document.getElementById("close-settings-modal");
const saveSettingsBtn = document.getElementById("save-settings-btn");
const stunSelect = document.getElementById("stun-select");
const filesizeSelect = document.getElementById("filesize-select");

const DEFAULT_SETTINGS = {
    stun: "google",
    maxFileSize: "0",
    manualApproval: false,
    autoClear: true
};

function loadSettings() {
    const saved = localStorage.getItem("cudi_settings");
    if (saved) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    }
    return DEFAULT_SETTINGS;
}

window.Cudi.saveSettings = function (settings) {
    localStorage.setItem("cudi_settings", JSON.stringify(settings));
    window.currentSettings = settings;
    window.Cudi.showToast("Settings saved!", "success");
    settingsModal.classList.add("hidden");
}

window.currentSettings = loadSettings();

if (settingsBtn && settingsModal && closeSettingsModal && saveSettingsBtn) {
    const manualApprovalToggle = document.getElementById("manual-approval-toggle");
    const autoClearToggle = document.getElementById("auto-clear-toggle");
    const customStunInput = document.getElementById("custom-stun-input");
    const advancedToggle = document.getElementById("advanced-settings-toggle");
    const advancedContent = document.getElementById("advanced-settings-content");
    const advancedArrow = document.getElementById("advanced-arrow");

    if (advancedToggle && advancedContent && advancedArrow) {
        advancedToggle.addEventListener("click", () => {
            advancedContent.classList.toggle("hidden");
            advancedArrow.classList.toggle("rotated");
        });
    }

    // Toggle custom input visibility
    stunSelect.addEventListener("change", () => {
        if (stunSelect.value === "custom") {
            if (customStunInput) customStunInput.classList.remove("hidden");
        } else {
            if (customStunInput) customStunInput.classList.add("hidden");
        }
    });

    settingsBtn.addEventListener("click", () => {
        stunSelect.value = window.currentSettings.stun || "google";

        // Init custom input state
        if (customStunInput) {
            customStunInput.value = window.currentSettings.customStun || "";
            if (stunSelect.value === "custom") customStunInput.classList.remove("hidden");
            else customStunInput.classList.add("hidden");
        }

        filesizeSelect.value = window.currentSettings.maxFileSize || "0";
        manualApprovalToggle.checked = window.currentSettings.manualApproval || false;
        autoClearToggle.checked = window.currentSettings.autoClear !== false;

        settingsModal.classList.remove("hidden");

        const manualGroup = document.getElementById("manual-approval-group");
        if (manualGroup) {
            if (window.Cudi.state.modo === "receive") {
                manualGroup.classList.add("hidden");
            } else {
                manualGroup.classList.remove("hidden");
            }
        }
    });

    closeSettingsModal.addEventListener("click", () => {
        settingsModal.classList.add("hidden");
    });

    settingsBtn.addEventListener("click", () => {
        if (settingsModal) {
            settingsModal.classList.remove("hidden");
        }
    });

    closeSettingsModal.addEventListener("click", () => {
        settingsModal.classList.add("hidden");
    });

    settingsModal.addEventListener("click", (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.add("hidden");
        }
    });
}


// Entry Logic
const aliasInput = document.getElementById("aliasInput");

if (aliasInput) {
    aliasInput.value = localStorage.getItem("cudi_alias") || "";
    aliasInput.addEventListener("change", () => {
        localStorage.setItem("cudi_alias", aliasInput.value);
        window.Cudi.state.localAlias = aliasInput.value;
    });
}

// Auto Clear on Exit
window.addEventListener("beforeunload", () => {
    if (window.currentSettings && window.currentSettings.autoClear) {
        localStorage.clear();
        sessionStorage.clear();
    }
    // Requirement 2.3: Auto-Cleanup
    if (window.Cudi.autoCleanup) window.Cudi.autoCleanup();
});

// Video Call Logic
const btnStartVideo = document.getElementById("btnStartVideo");
const btnStopVideo = document.getElementById("btnStopVideo");
const btnShareScreen = document.getElementById("btnShareScreen");
const btnToggleAudio = document.getElementById("btnToggleAudio");
const btnToggleVideo = document.getElementById("btnToggleVideo");

if (btnStartVideo) {
    btnStartVideo.addEventListener("click", () => {
        window.Cudi.startVideo();
    });
}

if (btnStopVideo) {
    btnStopVideo.addEventListener("click", () => {
        window.Cudi.stopVideo();
    });
}

if (btnShareScreen) {
    btnShareScreen.addEventListener("click", () => {
        window.Cudi.startScreenShare();
    });
}

if (btnToggleAudio) {
    btnToggleAudio.addEventListener("click", () => {
        window.Cudi.toggleAudio();
    });
}

if (btnToggleVideo) {
    btnToggleVideo.addEventListener("click", () => {
        window.Cudi.toggleVideo();
    });
}

const btnFullscreen = document.getElementById("btnFullscreen");
if (btnFullscreen) {
    btnFullscreen.addEventListener("click", () => {
        const videoContainer = document.getElementById("videoContainer");
        if (!document.fullscreenElement) {
            videoContainer.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable fullscreen: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    });
}

// Split View Logic
const localVideo = document.getElementById("localVideo");
const localVideoPlaceholder = document.getElementById("localVideoPlaceholder");
const videoWrapper = document.querySelector(".video-wrapper");
const videoWatermark = document.getElementById("videoWatermark");

function toggleSplitView() {
    if (videoWrapper) {
        videoWrapper.classList.toggle("split-view");
        const isSplit = videoWrapper.classList.contains("split-view");

        if (videoWatermark) {
            if (isSplit) {
                videoWatermark.classList.remove("hidden");
            } else {
                videoWatermark.classList.add("hidden");
            }
        }
    }
}

if (localVideo) {
    localVideo.addEventListener("click", toggleSplitView);
}

if (localVideoPlaceholder) {
    localVideoPlaceholder.addEventListener("click", toggleSplitView);
}
