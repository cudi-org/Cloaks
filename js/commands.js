window.Cudi = window.Cudi || {};

window.Cudi.commands = {
    handle(input) {
        if (!input.startsWith('/')) return false;

        const parts = input.slice(1).split(' ');
        const cmd = parts[0].toLowerCase();

        switch (cmd) {
            case 'help':
                this.showHelp();
                return true;
            case 'status':
                this.showStatus();
                return true;
            case 'peerid':
                this.showPeerId();
                return true;
            case 'version':
                this.showVersion();
                return true;
            case 'clear':
                this.clearHistory();
                return true;
            case 'nuke':
                this.nukeAll();
                return true;
            case 'export':
                this.exportData();
                return true;
            case 'report':
                this.showReport();
                return true;
            case 'cloak':
                this.showCloakInfo();
                return true;
            default:
                window.Cudi.displayChatMessage(`Unknown command: /${cmd}. Type /help for a list of commands.`, 'system', 'System');
                return true;
        }
    },

    showHelp() {
        const helpText = `Available Commands:
/status - Show connection & system status
/peerid - Show your sovereign ID
/version - Show current protocol version
/clear - Clear messages in this channel
/nuke - PANIC: Wipe all local data
/export - Download your keys and history
/cloak - Show configuration of current Cloak
/report - Get support links
/help - Show this list`;
        window.Cudi.displayChatMessage(helpText, 'system', 'System');
    },

    showStatus() {
        const state = window.Cudi.state;
        const instance = state.activeChats.get(state.currentPeerId);
        const isP2P = instance && instance.dc && instance.dc.readyState === 'open';

        const statusReport = `Cloaks Status:
> * Transport: ${isP2P ? 'P2P WebRTC Direct' : 'Disconnected / Signaling'}
> * Storage: Local OPFS Active
> * Encryption: Ed25519 Sovereign Keys
> * Relay: None (True P2P)`;

        window.Cudi.displayChatMessage(statusReport, 'system', 'System');
    },

    showPeerId() {
        const myId = window.Cudi.state.myId ||
            window.identityManager?.profile?.myId ||
            localStorage.getItem('cloaks_my_id');

        if (!myId || myId.trim() === '') {
            window.Cudi.displayChatMessage(`Your Peer ID: [Not Generated Yet]
Try to complete your profile or reload the app.`, 'system', 'System');
        } else {
            window.Cudi.displayChatMessage(`Your Peer ID: ${myId}`, 'system', 'System');
        }
    },

    showVersion() {
        window.Cudi.displayChatMessage(`Cloaks Beta 0.1: This is a sovereign prototype.`, 'system', 'System');
    },

    async clearHistory() {
        const peerId = window.Cudi.state.currentPeerId;
        if (!peerId) return;

        if (confirm("Clear local history for this chat? This cannot be undone.")) {
            await window.Cudi.opfs.deleteChat(peerId);
            window.Cudi.showToast("History cleared.", "success");
            const display = document.getElementById('messagesDisplay');
            if (display) display.innerHTML = '<div class="empty-state-msg">History cleared.</div>';
        }
    },

    nukeAll() {
        if (confirm("NUKE: This will delete ALL data, keys, and chats from this browser. Continue?")) {
            localStorage.clear();
            sessionStorage.clear();
            indexedDB.deleteDatabase('CloaksIdentityDB');
            window.Cudi.opfs.clearAllHistory().then(() => {
                window.location.reload();
            });
        }
    },

    async exportData() {
        const profile = window.identityManager?.profile;
        const allChats = await window.Cudi.opfs.getRecentChats();

        let exportObj = {
            profile: profile,
            timestamp: Date.now(),
            history: {}
        };

        for (const pid of allChats) {
            exportObj.history[pid] = await window.Cudi.loadHistory(pid);
        }

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportObj, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `cloaks_backup_${new Date().toISOString().slice(0, 10)}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();

        window.Cudi.displayChatMessage("Backup generated and download started.", 'system', 'System');
    },

    showReport() {
        const reportMsg = `Support & Bug Report:
GitHub: https://github.com/cudi-org/Cloaks/issues
Email: breolanapp@gmail.com`;
        window.Cudi.displayChatMessage(reportMsg, 'system', 'System');
    },

    showCloakInfo() {
        const community = window.communityManager?.currentCommunity;
        if (!community) {
            window.Cudi.displayChatMessage("Not in a Cloak community.", 'system', 'System');
            return;
        }

        const info = `Current Cloak: ${community.name}
ID: ${community.community_id}
Channels: ${community.channels.length}
Protocol: ${community.type} v${community.version}`;

        window.Cudi.displayChatMessage(info, 'system', 'System');
    }
};
