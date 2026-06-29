export class Store {
    constructor(initialState = {}) {
        this.state = initialState;
        this.listeners = [];
    }

    getState() {
        return this.state;
    }

    setState(newState) {
        this.state = { ...this.state, ...newState };
        this.notify();
    }

    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    notify() {
        for (const listener of this.listeners) {
            listener(this.state);
        }
    }
}

export const globalStore = new Store({
    socket: null,
    peer: null,
    dataChannel: null,
    salaId: null,
    modo: null,
    mensajePendiente: [],
    heartbeatInterval: null,
    isRoomLocked: false,
    archivoParaEnviar: null,
    enviarArchivoPendiente: false,
    archivoRecibidoBuffers: [],
    tamañoArchivoEsperado: 0,
    nombreArchivoRecibido: "",
    localAlias: localStorage.getItem('cudi_alias') || "",
    remoteAlias: null,
    activeChats: new Map(),
    activeFinds: new Map(),
    peers: new Map(),
    isZeroTrace: localStorage.getItem('cloaks_zero_trace') === 'true',
    myId: null,
    sessionPeers: new Map(),
    discoveredRooms: new Map(),
});
