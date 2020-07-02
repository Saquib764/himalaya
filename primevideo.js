
(()=>{
    if(window.doorieInitialised){
        return
    }
    // console.log = ()=>{}
    window.doorieInitialised = true
    let room = null
    let SOCKET = null
    let isLocalConnected = false
    // const baseURL = 'ws://localhost:5000'
    const baseURL = 'wss://in.doorie.in'

    let videoElement = null
    let playState = {
        playing: false,
        initialized: false,
        time: 0
    }
    let mute = false;
    let speaker = true
    let STREAM = null
    let connectedPeers = []

    function getParticipants() {
        return connectedPeers.map(e=> e.remoteUserId)
    }
    function sleep(milliseconds) {
        const date = Date.now();
        let currentDate = null;
        do {
          currentDate = Date.now();
        } while (currentDate - date < milliseconds);
    }

    chrome.runtime.onMessage.addListener((message, cb)=>{
        switch(message.action) {
            case 'connect': init();
                room = message.payload.room
                break;
            case 'status': 
                chrome.runtime.sendMessage({action: "status", payload: {isLocalConnected}})
                break;
            case 'disconnect': 
                isLocalConnected = false
                if(!SOCKET) return
                SOCKET.sock.close()
                connectedPeers.forEach(peer=> peer.queue_to_kill())
                chrome.runtime.sendMessage({action: "disconnected", payload: {}})

                break;
        }
    })
    let skip = {
        play: false,
        pause: false,
        seeked: false
    }
    
    function pageScript(player){
        let executingExtensionCommands = 0
        window.player = player
        player.addEventListener('play', ()=>{
            console.log('play', executingExtensionCommands)
            if(executingExtensionCommands > 0){
                executingExtensionCommands --;
                return
            }
            document.dispatchEvent(new CustomEvent('doorie_play_status', {
                detail: {
                    source: 'user',
                    playing: true,
                    currentTime: player.currentTime
                }
            }))
        })
        player.addEventListener('pause', ()=>{
            console.log('pause', executingExtensionCommands)
            if(executingExtensionCommands > 0){
                executingExtensionCommands --;
                return
            }
            document.dispatchEvent(new CustomEvent('doorie_play_status', {
                detail: {
                    source: 'user',
                    playing: false,
                    currentTime: player.currentTime
                }
            }))
        })


        document.addEventListener('doorie_play_status', (e)=>{
            if(e.detail.source == 'user') return
            if(executingExtensionCommands > 0) return
            executingExtensionCommands ++
            if(e.detail.playing){
                player.currentTime = e.detail.currentTime

                player.oncanplaythrough = ()=> {
                    player.play()
                    player.oncanplaythrough = null
                }
            }else{
                player.currentTime = e.detail.currentTime
                player.oncanplaythrough = ()=> {
                    player.pause()
                    player.oncanplaythrough = null
                }
            }
        })
    }
    function setupPlayer(socket) {
        let player = document.querySelector('.doorie-top .scalingVideoContainer video')
        console.log(player)
        
        if(!player){
            setTimeout(()=> setupPlayer(socket), 1000)
            return
        }
        pageScript(player)

        document.addEventListener('doorie_play_status', (e)=>{
            if(e.detail.source == 'extension') return
            socket.emit('custom_event', {
                to: getParticipants(),
                event: 'doorie_play_status',
                payload: {
                    __version: '0.0.0',
                    playing: e.detail.playing,
                    currentTime: e.detail.currentTime
                },
            })
        })

        socket.on('doorie_play_status', (data)=> {
            document.dispatchEvent(new CustomEvent('doorie_play_status', {
                detail: {
                    source: 'extension',
                    playing: data.payload.playing,
                    currentTime: data.payload.currentTime
                }
            }))
        })
    }
    function init() {
        let player = document.querySelector('#dv-web-player div.cascadesContainer')
        let body = document.querySelector('div.doorie-holder')
        let count1 = 0;
        sleep(100)
        while(!player && count1 < 10 ) {
            let count = 0
            player = document.querySelector('#dv-web-player div.cascadesContainer')
            while(!player && count < 20) {
                sleep(100)
            }
        }
        if(!player){
            return
        }
        console.log(player)
        player.classList.add('doorie-top')
        if(!body) {
            body = document.createElement('div');
            body.classList.add('doorie-holder')
            body.classList.add('doorie-top')
            player.appendChild(body)    
    
            let video = document.createElement('video');
            video.muted = true
            video.style = "transform: scaleX(-1);"
            video.id = "doorie-my"
    
            let controls = document.createElement('div')
            controls.classList.add('doorie-controls')

            let cmute = document.createElement('img')
            cmute.src = chrome.runtime.getURL("icons/control/icons8-block-microphone-50.png")
            cmute.onclick = ()=>{
                mute = !mute
                STREAM.getAudioTracks()[0].enabled = !mute
            }
            controls.appendChild(cmute)

            let cspeaker = document.createElement('img')
            cspeaker.src = chrome.runtime.getURL("icons/control/icons8-audio-50.png")
            cspeaker.onclick = ()=>{
                speaker = !speaker
                connectedPeers.forEach(p=>{
                    let v = document.querySelector(`video#doorie-${p.remoteUserId}`)
                    if(v) {
                        v.muted = !speaker
                    }
                })
            }
            controls.appendChild(cspeaker)

            body.innerHTML = ''
            body.appendChild(controls)
            body.appendChild(video)
            startCamera()
        }
    }
    function getConstraints() {
        return  {
            audio: true,
            video: true
            // video: {
            //     width: { min: 100, ideal: 180, max: 1920 },
            //     height: { min: 100, ideal: 180, max: 1080 },
            //     // frameRate: { ideal: 16, max: 20 }
            // },
        }
    }
    async function startCamera(){
        let stream = null
        try{
            let c = getConstraints()
            c.video = true
            // c.video['frameRate'] = { ideal: 16, max: 30 }
            stream = await navigator.mediaDevices.getUserMedia(c)

        }catch(e) {
            stream = await navigator.mediaDevices.getUserMedia(getConstraints())
        }
        STREAM = stream
        let my = document.querySelector('video#doorie-my')
        my.srcObject = stream
        my.play()
        const param = (new URL(location.href)).searchParams
        const _userId = param.get('id')
        const _room = param.get('room')


        chrome.storage.sync.get('userId', (data)=> {
            if(!data.userId) return
            let userId = _userId || data.userId

            room = _room || room
            if(!room) return

            let BaseSocket = window.doorie.BaseSocket
            let socket = new BaseSocket(`${baseURL}/?room=${room}&userId=${userId}&app=sync`)
            SOCKET = socket
            if(socket) {
                setupPlayer(socket)
                registerCallManager(socket, stream, userId)
            }
            
        })
    }
    let onCallDisconnect = (peer) => {
        console.log("peer disconnect", peer)
    }
    let onCallConnect = (peer) => {
        console.log("peer connect", peer)
        let body = document.querySelector('div.doorie-holder')
        let video = body.querySelector(`video#doorie-${peer.remoteUserId}`)
        if(video) {
        }else{
            video = document.createElement('video');
            video.id = `doorie-${peer.remoteUserId}`
            body.appendChild(video)
        }
        video.srcObject = peer.getRemoteStream()
        setTimeout(()=> video.play(), 2000)

        // if(!playState.initialized) return
    }
    let onCallUpdate = (peer) => {
        console.log("peer update", peer)
    }
    let onLoadingNewUser = (peer) => {
        console.log("peer new", peer)
    }
    let registerCallManager = (conn, streamLocal, userId)=>{
        conn.on("room_check", (res)=>{
            chrome.runtime.sendMessage({action: "connected", payload: {room}})
            let participants = new Set(res.participants)
            participants.delete(userId)

            let callConnections = new Set(connectedPeers)
            callConnections.forEach((connection)=>{
                if(!participants.has(connection.remoteUserId)){
                    callConnections.delete(connection)
                    onCallDisconnect(connection)
                }else{
                    participants.delete(connection.remoteUserId)
                }
            })
            participants.forEach((remoteUserId)=>{
                console.log("New user detected", remoteUserId)
                let peer = new PeerConnection(conn, userId, remoteUserId)
                peer.add_video_to_peer(streamLocal.getVideoTracks()[0])
                peer.add_audio_to_peer(streamLocal.getAudioTracks()[0])
                peer.init()
                // peer.start_call()
                callConnections.add(peer)
                onLoadingNewUser(peer)
                peer.on_open = ()=>{
                    console.log("call_connected to", peer.remoteUserId)
                    onCallConnect(peer)
                }
                peer.on_close = ()=> {
                    peer.close()
                    onCallDisconnect(peer)
                }
                peer.on_update = ()=> {
                    onCallUpdate(peer)
                    console.log("--------update")
                }
            });
            connectedPeers = Array.from(callConnections)
        })

        conn.on("broadcast", (p) => {
            let payload = null;
            let peer = connectedPeers.find(item=> item.remoteUserId === p.from);
            if(!peer) return

            switch (p.action) {
                case 'ECHO_V1': peer.onecho(p.payload); break;
                case "PROCESS_OFFER_V1":
                    peer.process_offer(p.payload)
                    break;
                case "ADD_ICE_CANDIDATE_V1": 
                    peer.add_peer_ice_candidate(p.payload)
                    break;
                case "DISCONNECT_V1": 
                    peer.queue_to_kill()
                    onCallDisconnect(peer)
                    break;
                case "TOGGLE_SCREENSHARE_V1": 
                    peer.set_peer_screenshare(p.payload)
            }
        });

        setInterval(() => {
            conn.emit("room_check");
        }, 2 * 1000);
    }

    const STUN_URL1 = [
        // { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19305" },
        // { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:numb.viagenie.ca" },
        // { urls: "stun:stun01.sipphone.com" },
    ];
    const STUN_CONF = { iceServers: STUN_URL1, iceTransportPolicy: "all" };
    // const STUN_CONF = { 'optional': [{'DtlsSrtpKeyAgreement': true}] }
    
    
    function PeerConnection (socket, localUserId, remoteUserId) {
        // protected socket: BaseSocket;
        // protected _localUserId:string;
        // protected _remoteUserId:string;
    
        const _localStream = new MediaStream();
        // protected _localScreenStream = new MediaStream();
        // protected _isLocalScreenShared = false
    
        const _remoteStream = new MediaStream();
        let _remoteStreamId = ""
        this.remoteUserId = remoteUserId
        // protected _remoteScreenStream = new MediaStream();
        // protected _remoteScreenStreamId:string = ""
        // protected _isRemoteScreenShared = false
    
        let isCaller = false
        let isCallStarted = false
        let isPolite = false
        let isInitialConnectionSet = false
    
        let pc = undefined;
        let dataChannel = undefined;
    
        let onNegotiationNeeded = false
        let isGatheringICE = false
        let Q = []
        
        let _audioSender;
        let _videoSender;
        // protected _screenSender:any;
    
        let checkConnection;
        let isPeerOnline = false
        let isWaitingForConnection = false
        let isQueued_to_kill = false
    
        // get remoteUserId(){
        //     return this._remoteUserId
        // }
        this.getRemoteStream = () => {
            console.log(_remoteStream.getTracks())
            return _remoteStream
        }
        // get isPeerSharingScreen(){
        //     return this._isRemoteScreenShared
        // }
        // get remoteScreenStream(){
        //     return this._remoteScreenStream
        // }
    
        
        // this._localUserId = localUserId
        // this._remoteUserId = remoteUserId
        if(localUserId.localeCompare(remoteUserId) < 0) {
            // if local is first in dictionary, make it caller
            isPolite = true;
            isCaller = true
        }
        let oldPc;

        let init_RTC = () => {
            // this._isRemoteScreenShared = false
            oldPc = pc
            // try{
            //     if (this.pc) {
            //         this.close()
            //     }
            // }catch(e){
                
            // }
            pc = new RTCPeerConnection(STUN_CONF);
            pc.onsignalingstatechange = (evt)=>on_connection_state_change(evt)
            pc.onconnectionstatechange = (evt)=>on_connection_state_change(evt)
            pc.onicegatheringstatechange = (evt)=>on_icegathering_state_change(evt)
            pc.oniceconnectionstatechange = (evt)=>on_connection_state_change(evt)
            pc.onicecandidate = (evt)=>on_local_ice_candidate(evt)
            pc.ontrack = (evt)=> {
                on_track_from_peer(evt)
            }
            pc.onnegotiationneeded = (evt) => {
                renegotiate(evt)
            }
            _audioSender = pc.addTrack(_localStream.getAudioTracks()[0], _localStream)
            _videoSender = pc.addTrack(_localStream.getVideoTracks()[0], _localStream)
            // _screenSender = this.pc!.addTrack(this._localStream.clone().getVideoTracks()[0], this._localScreenStream)
    
            // if(this._isLocalScreenShared) {
            //     this._screenSender.replaceTrack(this._localScreenStream.getVideoTracks()[0])
            // }
    
            if(isCaller) {
                setup_datachannel(pc.createDataChannel("messageChannel"))
            }else{
                pc.ondatachannel = (evt)=> setup_datachannel(evt.channel)
            }
        }
        this.echo = () => {
            socket.emit("broadcast", {
                to: [remoteUserId],
                action: 'ECHO_V1',
                payload: {
                    isPeerOnline: isPeerOnline
                }
            });
        }
        this.onecho = (peer_state) => {
            if(!peer_state.isPeerOnline){
                this.echo()
            }
            isPeerOnline = true
            if(!isCaller) return
            this.send_offer()
        }
        this.init = () => {
            console.log("Init")
            // this.close()
            isCallStarted = false
            isPeerOnline = false
            isWaitingForConnection = false
            isQueued_to_kill = false
            init_RTC()
            this.echo()
            // @ts-ignore
            // window.peer = this
        }
        this.start_call = () =>{
            if(!isCaller) return
            // this.close()
            // this.init_RTC()
            if(isCallStarted) return
            this.send_offer()
            // this.isCallStarted = true
        }
        let renegotiate = (evt) => {
            console.log("renegotiate")
            if(!isInitialConnectionSet) return
            isInitialConnectionSet = false
            // this.start_call()
        }
        this.close = (init=true) => {
            this.Q = []
            // this._isRemoteScreenShared = false
            // this.pc?.close()
            oldPc = pc
            delete pc
            if(!isQueued_to_kill){
                init()
            }
        }
        const on_icegathering_state_change = (evt) => {
            if(pc.iceGatheringState == 'complete') {
            }
        }
        const on_connection_state_change = (evt) => {
            if(!pc) return
            const connectionState = pc.connectionState || pc.iceConnectionState
            if(pc.connectionState == 'failed') {
                isInitialConnectionSet = false
                // this.init()
            }
            if(pc.signalingState == 'stable' && connectionState == 'connected') {
                on_open_peer(evt)
            }
            if(isInitialConnectionSet && connectionState == 'disconnected'){
                close()
            }
        }
        const on_local_ice_candidate = (evt) => {
            // console.log(evt.candidate)
            if(!evt.candidate){
                // Discovery complete
                return
            }
            socket.emit("broadcast", {
                to: [remoteUserId],
                action: "ADD_ICE_CANDIDATE_V1",
                payload: evt.candidate,
            });
        }
        this.add_peer_ice_candidate = async (candidate) => {
            // if( !this.isGatheringICE) {
            //     this.Q.push(candidate)
            //     return
            // }
            try{
                await pc.addIceCandidate(candidate)
            }catch(e) {
                console.log(e)
                // this.init()
            }
        }
        const setup_datachannel = (channel) => {
            console.log("channel")
            dataChannel = channel
            dataChannel.onopen = (e) => on_open_peer(e);
            dataChannel.onclose = (e) => this.close();
            // this.dataChannel.onmessage = (e) => { this.on_message(e.data); };
        }
        this.send_offer = async() => {
            console.log("send_offer")
            isQueued_to_kill = false
            if(!pc){
                init()
                return
            }
            if(isWaitingForConnection) return
            if(checkConnection) clearTimeout(checkConnection)
            checkConnection = setTimeout(()=>{
                if(!isInitialConnectionSet) {
                    init()
                }
            }, 10000)
            // if(!this.isCaller) return
            // this.pc = this.pc!
            await pc.setLocalDescription(await pc.createOffer())
            this.isWaitingForConnection = true
            signal('PROCESS_OFFER_V1')
        }
        this.process_offer = async (offer) => {
            isQueued_to_kill = false
            try{
                _remoteStreamId = offer.streamId;
                // this._remoteScreenStreamId = offer.screenStreamId
                // this._isRemoteScreenShared = offer.isSharingScreen
                // if(!this._isLocalScreenShared){
                //     this._screenSender.track.stop()
                // }
                if(!offer.desc){
                    return
                }
                await pc.setRemoteDescription(new RTCSessionDescription(offer.desc))
                if(!isCaller) {
                    await pc.setLocalDescription(await pc.createAnswer())
                    signal('PROCESS_OFFER_V1')
                }
                // if(offer.desc.type == 'offer' && this.pc.signalingState != 'stable') {
                //     if(!this.isCaller) return
                //     await Promise.all([
                //         this.pc.setLocalDescription({type: "rollback"}),
                //         this.pc.setRemoteDescription(new RTCSessionDescription(offer.desc))
                //     ]);
                // }else{
                //     await this.pc.setRemoteDescription(new RTCSessionDescription(offer.desc))
                // }
    
                // if(offer.desc.type == 'offer') {
                //     await this.pc.setLocalDescription(await this.pc.createAnswer())
                //     // this.signal('PROCESS_OFFER_V1')
                // }
            }catch(e) {
                console.log("error", e)
                // this.init()
            }
        }
        let signal = (action) => {
            if(!pc.localDescription)  return
            let payload = {
                desc: pc.localDescription,
                streamId: _localStream.id,
                // screenStreamId: this._localScreenStream.id,
                // isSharingScreen: this._isLocalScreenShared
            }
            socket.emit("broadcast", {
                to: [remoteUserId],
                action,
                payload: payload,
            });
        }
        this.add_video_to_peer = (track) => {
            _localStream.getVideoTracks().forEach((_track)=> {
                _track.stop()
                _localStream.removeTrack(_track)
            })
            // @ts-ignore
            track.contentHint = "motion"
            _localStream.addTrack(track)
        }
        // let share_screen_to_peer(track:MediaStreamTrack|boolean) {
        //     if(track){
        //         // @ts-ignore
        //         track.contentHint = "detail"
        //         this._isLocalScreenShared = true
        //         this._localScreenStream.addTrack(track as MediaStreamTrack)
        //         if(!this.pc) return
        //         this._screenSender.replaceTrack(track)
        //     }else{
        //         this._localScreenStream.getVideoTracks().forEach((_track:MediaStreamTrack)=> {
        //             _track.stop()
        //             this._localScreenStream.removeTrack(_track)
        //         })
        //         this._screenSender?.track?.stop()
        //         this._isLocalScreenShared = false
        //     }
        //     if(!this.pc) return
        //     this.socket!.emit("broadcast", {
        //         to: [this._remoteUserId],
        //         action: 'TOGGLE_SCREENSHARE_V1',
        //         payload: this._isLocalScreenShared,
        //     });
        // }
        // public set_peer_screenshare(isShared:boolean) {
        //     if(!this.isInitialConnectionSet) return
        //     this._isRemoteScreenShared = isShared
        //     this.on_update()
        // }
        this.add_audio_to_peer = (track) => {
            _localStream.getAudioTracks().forEach((_track)=> {
                _track.stop()
                _localStream.removeTrack(_track)
            })
            _localStream.addTrack(track)
        }
        let on_track_from_peer = (evt) => {
            const stream = evt.streams[0]
            if(stream.id == _remoteStreamId){
                const tracks = evt.track.kind === 'video'?_remoteStream.getVideoTracks():_remoteStream.getAudioTracks();
                tracks.forEach((track)=> {
                    _remoteStream.removeTrack(track)
                })
                _remoteStream.addTrack(evt.track)
            }
            // if(stream.id == this._remoteScreenStreamId){
            //     this._remoteScreenStream.addTrack(evt.track)
            // }
        }
        this.on_close = () => {
        }
        this.on_update = () => {
        }
        let get_sender = (track) => {
            return pc.getSenders().find((e)=> e.track && e.track.id == track.id)
        }
        this.on_open = () => {
        }
        let on_open_peer = (evt) =>  {
            isWaitingForConnection = false
            // if(_isLocalScreenShared) {
            //     console.log(_localScreenStream.getVideoTracks()[0])
            //     this._screenSender.replaceTrack(this._localScreenStream.getVideoTracks()[0])
            // }
            try{
                // if(this.oldPc){
                //     this.oldPc.close()
                // }
            }catch(e) {}
            if(isQueued_to_kill) return
            console.log("RTC. open", isPolite);
            this.on_open()
            isInitialConnectionSet = true
            if(!onNegotiationNeeded){
                return
            }
        }
        let disconnect = () => {
            socket.emit("broadcast", {
                to: [this._remoteUserId],
                action: 'DISCONNECT_V1',
            });
        }
        this.queue_to_kill = () => {
            isQueued_to_kill = true
        }
    }


})()