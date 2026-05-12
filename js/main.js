import './config.js';
import './dictionary.js';
import './state.js';
import './opfs.js';
import './commands.js';
import './utils.js';
import './ui.js';
import './file-transfer.js';
import './signaling.js';
import './webrtc.js';
import './community.js';
import './presence.js';
import './identity.js';

import { globalStore } from './Store.js';
import { WebRTCManager } from './WebRTCManager.js';

window.Cudi = window.Cudi || {};
window.Cudi.store = globalStore;
window.Cudi.state = globalStore.getState();

globalStore.subscribe((newState) => {
    window.Cudi.state = newState;
});

window.Cudi.webRTCManager = new WebRTCManager(globalStore, window.Cudi, window.Cudi.ui);


window.currentSettings = window.Cudi.LOADED_SETTINGS || {};
window.onerror = function () {
    return false;
};
window.onunhandledrejection = function () {
};
const salaStatus = document.getElementById("salaStatus");
const chatInput = document.getElementById("chatInput");
const sendChatBtn = document.getElementById("sendChatBtn");
const menuToggle = document.getElementById("menu-toggle");
const navbar = document.getElementById("navbar");
const tabSend = document.getElementById("tabSend");
const tabReceive = document.getElementById("tabReceive");
const btnCreate = document.getElementById("btnCreate");
const btnJoin = document.getElementById("unirseBtn");
const helpBtn = document.getElementById("help-btn");
window.Cudi.resetOnboarding = function () {
    const formSend = document.getElementById("form-send");
    const formReceive = document.getElementById("form-receive");
    if (formSend) {
        formSend.classList.add("hidden");
        const inputs = formSend.querySelectorAll('input');
        inputs.forEach(input => {
            if (input.id !== 'aliasInput') input.value = '';
        });
        const aliasInp = document.getElementById("aliasInput");
        if (aliasInp) aliasInp.value = localStorage.getItem("cudi_alias") || "";
    }
    if (formReceive) {
        formReceive.classList.add("hidden");
        const inputs = formReceive.querySelectorAll('input');
        inputs.forEach(input => input.value = '');
    }
    document.getElementById("meeting-tools")?.classList.add("hidden");
    document.getElementById("messagesDisplay")?.classList.add("hidden");
    document.querySelector('.chat-input-area')?.classList.add('hidden');
};
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
        salaStatus.innerHTML = window.Cudi.state.salaId;
        if (password) {
            salaStatus.innerHTML += " ()";
        }
    }
    const copyLinkBtn = document.getElementById("copy-link-btn");
    if (copyLinkBtn) {
        copyLinkBtn.style.display = "inline-flex";
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
            }).catch(() => {
            });
        });
    }
    window.Cudi.showToast("Room created. Access via Sidebar for info.", "info");
}
function unirseSala() {
    const codeInput = document.getElementById("codigoSala");
    const joinPasswordInput = document.getElementById("joinPasswordInput");
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
    if (messagesDisplay) {
        messagesDisplay.classList.remove("hidden");
        messagesDisplay.innerHTML = '';
    }
    if (window.communityManager) {
        window.communityManager.currentCommunity = null;
        window.communityManager.currentChannel = null;
        const nameDisplay = document.getElementById('community-name-display');
        if (nameDisplay) nameDisplay.textContent = "Cloaks";
        document.getElementById('community-settings-btn')?.classList.add('hidden');
    }
    document.querySelector('.chat-input-area')?.classList.remove('hidden');
    const meetingTools = document.getElementById("meeting-tools");
    if (meetingTools) meetingTools.classList.remove("hidden");
    if (salaStatus) salaStatus.innerHTML = window.Cudi.state.salaId + (window.Cudi.state.roomPassword ? " (🔒)" : "");
    const copyLinkBtn = document.getElementById("copy-link-btn");
    if (copyLinkBtn) {
        copyLinkBtn.classList.remove("hidden");
        const newBtn = copyLinkBtn.cloneNode(true);
        copyLinkBtn.parentNode.replaceChild(newBtn, copyLinkBtn);
        newBtn.addEventListener("click", () => {
            const baseUrl = window.location.href.split('#')[0];
            const url = `${baseUrl}#receive-${window.Cudi.state.salaId}`;
            navigator.clipboard.writeText(url).then(() => {
                window.Cudi.showToast("Link copied to clipboard!", "success");
            }).catch(() => {
            });
        });
    }
    const appShell = document.querySelector('.app-shell');
    if (appShell) appShell.classList.add('in-room');
    window.Cudi.iniciarConexion();
    if (window.location.hash) {
        window.history.replaceState(null, null, ' ');
    }
    const fInput = document.getElementById("fileInput");
    if (fInput) fInput.disabled = true;
    if (chatInput) chatInput.disabled = true;
    if (sendChatBtn) sendChatBtn.disabled = true;
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
window.Cudi.leaveRoom = function () {
    const state = window.Cudi.state;
    if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        state.socket.send(JSON.stringify({
            type: 'leave',
            room: state.salaId,
            peerId: state.myId
        }));
    }
    state.salaId = null;
    state.roomPassword = null;
    state.sessionPeers.clear();
    state.peers.clear();
    window.location.hash = '';
    document.getElementById("welcome-screen")?.classList.remove("hidden");
    document.getElementById("messagesDisplay")?.classList.add("hidden");
    document.querySelector('.chat-input-area')?.classList.add('hidden');
    document.getElementById("meeting-tools")?.classList.add("hidden");
    const shell = document.querySelector('.app-shell');
    if (shell) shell.classList.remove('in-room');
    if (window.Cudi.ui) {
        window.Cudi.ui.updateMemberSidebar();
        window.Cudi.ui.renderRecentChats();
    }
    window.Cudi.showToast("Has salido de la sala. Sesión limpiada.", "info");
};
window.addEventListener('beforeunload', () => {
    const state = window.Cudi.state;
    if (state.salaId) {
        window.Cudi.enviarSocket({
            type: 'disconnect',
            peerId: state.myId,
            room: state.salaId
        });
    }
});
document.getElementById("fileInput")?.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
        window.Cudi.handleFileSelection(e.target.files[0]);
    }
});
if (sendChatBtn && chatInput) {
    sendChatBtn.addEventListener("click", () => {
        const message = chatInput.value.trim();
        if (!message) return;
        if (window.Cudi.commands && window.Cudi.commands.handle(message)) {
            chatInput.value = "";
            return;
        }
        const state = window.Cudi.state;
        const peerId = state.currentPeerId;
        if (!peerId) {
            const firstPeerId = state.activeChats.keys().next().value;
            if (firstPeerId) state.currentPeerId = firstPeerId;
            else return;
        }
        const instance = state.activeChats.get(state.currentPeerId);
        const myAlias = state.localAlias;
        const payload = {
            type: "chat",
            subType: "text",
            content: message,
            alias: myAlias,
            timestamp: Date.now(),
            sender: state.myId
        };
        if (instance && instance.dc && instance.dc.readyState === "open") {
            instance.dc.send(JSON.stringify(payload));
            window.Cudi.appendMessage(state.currentPeerId, payload);
        } else {
            payload.status = "pending";
            window.Cudi.appendMessage(state.currentPeerId, payload);
        }
        window.Cudi.displayChatMessage(message, "sent", myAlias);
        chatInput.value = "";
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
            navigator.serviceWorker.register("./service-worker.js");
        });
    }
}
window.addEventListener("load", () => {
    if (window.location.hash) {
        const hash = window.location.hash.substring(1);
        if (hash.startsWith("send-")) {
            window.Cudi.state.salaId = hash.replace("send-", "").toLowerCase();
            window.Cudi.state.modo = "send";
            iniciarTransferencia();
            if (salaStatus) salaStatus.innerHTML = window.Cudi.state.salaId;
        } else if (hash.startsWith("receive-")) {
            const parts = hash.split('&');
            window.Cudi.state.salaId = parts[0].replace("receive-", "").toLowerCase();
            if (parts[1] && parts[1].startsWith("token=")) {
                window.Cudi.state.roomToken = parts[1].replace("token=", "");
            }
            window.Cudi.state.modo = "receive";
            iniciarTransferencia();
            const formReceive = document.getElementById("form-receive");
            if (formReceive) {
                formReceive.classList.remove("hidden");
                const codeInp = document.getElementById("codigoSala");
                if (codeInp) codeInp.value = window.Cudi.state.salaId;
            }
        }
        window.history.replaceState(null, null, ' ');
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
        const formSend = document.getElementById("form-send");
        const formReceive = document.getElementById("form-receive");
        if (formSend) formSend.classList.remove("hidden");
        if (formReceive) formReceive.classList.add("hidden");
    });
}
if (tabReceive) {
    tabReceive.addEventListener("click", () => {
        const formSend = document.getElementById("form-send");
        const formReceive = document.getElementById("form-receive");
        if (formReceive) formReceive.classList.remove("hidden");
        if (formSend) formSend.classList.add("hidden");
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
const openLegalBtn = document.getElementById("open-legal-modal");
const legalModal = document.getElementById("legal-modal");
const legalAcceptBtn = document.getElementById("legal-accept-btn");
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
        if (e.target === legalModal) {
            legalModal.classList.add("hidden");
        }
    });
}
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
            localStorage.clear();
            sessionStorage.clear();
            window.open('', '_self', '');
            window.close();
            window.location.href = "about:blank";
        }
    });
}
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
    stunSelect.addEventListener("change", () => {
        if (stunSelect.value === "custom") {
            if (customStunInput) customStunInput.classList.remove("hidden");
        } else {
            if (customStunInput) customStunInput.classList.add("hidden");
        }
    });
    settingsBtn.addEventListener("click", () => {
        stunSelect.value = window.currentSettings.stun || "google";
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
const aliasInput = document.getElementById("aliasInput");
if (aliasInput) {
    aliasInput.value = localStorage.getItem("cudi_alias") || "";
    aliasInput.addEventListener("change", () => {
        const val = aliasInput.value.trim();
        localStorage.setItem("cudi_alias", val);
        window.Cudi.state.localAlias = val;
        if (window.Cudi.broadcastProfile) window.Cudi.broadcastProfile();
    });
}
window.addEventListener("beforeunload", () => {
    if (window.currentSettings && window.currentSettings.autoClear) {
        localStorage.clear();
        sessionStorage.clear();
    }
    if (window.Cudi.autoCleanup) window.Cudi.autoCleanup();
});
const btnStartVideo = document.getElementById("btnStartVideo");
const btnStopVideo = document.getElementById("btnStopVideo");
const btnShareScreen = document.getElementById("btnShareScreen");
const btnToggleAudio = document.getElementById("btnToggleAudio");
const btnToggleVideo = document.getElementById("btnToggleVideo");
const btnVoiceCall = document.getElementById("btn-voice-call");
const btnVideoCall = document.getElementById("btn-video-call");
if (btnVoiceCall) {
    btnVoiceCall.addEventListener("click", () => {
        window.Cudi.showToast("Iniciando llamada de voz...", "info");
        window.Cudi.inviteToCall('voice');
    });
}
if (btnVideoCall) {
    btnVideoCall.addEventListener("click", () => {
        window.Cudi.showToast("Iniciando videollamada...", "info");
        window.Cudi.inviteToCall('video');
    });
}
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
            videoContainer.requestFullscreen().catch(() => { });
        } else {
            document.exitFullscreen();
        }
    });
}
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
