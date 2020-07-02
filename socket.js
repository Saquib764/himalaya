
(()=>{
    if(window.socketInitialised){
        return
    }
    window.socketInitialised = true

    function BaseSocket(url) {
        /* Base Socket class
        *
        */
        const heartbeatFrequency = 200
        let initialised = false;
        this.sock;
        let heartbeat;
        events = {};

        this.emit = (event, data) => {
            data = data || {};
            data._event = event;
            if(!this.sock) return
            if(this.sock.readyState === 1) {
                this.sock.send(JSON.stringify(data));
            }
        }
        this.on = (eventname, fn) => {
            events[eventname] = fn;
        }
        function dispatchEvent(eventname, data) {
            const fn = events[eventname];
            if ( fn ) {
                setTimeout(() => fn(data), 1);
            }
        }
        this.close = ()=>{

            this.sock.onclose = (e) => {
                dispatchEvent("close", e);
            };
            this.sock.close()
        }
        let connect = (url) => {
            this.sock = new WebSocket(url, "echo-protocol");
            this.sock.onerror = (e) => {
                console.log('Connection error')
            }
            this.sock.onopen = (e) => {
                let event = "socket_reconnect";
                if (!this.initialised) {
                    event = "connected";
                    this.initialised = true;
                }
                dispatchEvent(event, e);
                if (heartbeat) {
                    clearInterval(heartbeat);
                }
                heartbeat = setInterval(() => {
                    if(this.emit)
                        this.emit("heartbeat");
                }, heartbeatFrequency);
            };
            this.sock.onmessage = (e) => {
                if (!e) {
                    e = "{}";
                }
                const data = JSON.parse(e.data);
                const event = data._event;
                delete data._event;
                dispatchEvent(event, data);
            };
            this.sock.onclose = (e) => {
                console.log('d')
                connect(url);
                dispatchEvent("close", e);
            };
        }
        connect(url)
    }
    if(!window.doorie){
        window.doorie = {}
    }
    window.doorie.BaseSocket = BaseSocket
})()