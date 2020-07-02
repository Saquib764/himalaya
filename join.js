
let room = document.querySelector("#room")
let name = document.querySelector("#name")
let connectedEl = document.querySelector("#connected")
let notconnectedEl = document.querySelector("#not-connected")

chrome.storage.sync.get('state', (data)=>{
})


chrome.tabs.query({active: true, currentWindow: true}, (tabs)=> {
    chrome.tabs.sendMessage(tabs[0].id, {action: "status", payload: {}})
})

document.querySelector('#start').onclick = (e) => {
    if(!room.value) return
    let s = document.querySelector('#start')
    let loader = s.querySelector('div')
    loader.classList.add('lds-dual-ring')
    chrome.tabs.query({active: true, currentWindow: true}, (tabs)=> {
        chrome.tabs.sendMessage(tabs[0].id, {action: "connect", payload: {room: room.value}})
    })
}
document.querySelector('#disconnect').onclick = (e) => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs)=> {
        chrome.tabs.sendMessage(tabs[0].id, {action: "disconnect", payload: {room: room.value}})
    })
}
chrome.runtime.onMessage.addListener((message, cb)=>{
    switch(message.action) {
        case 'connect': init();
            room = message.payload.room
            break;
        case 'status': 
            setView(message.payload.isLocalConnected)
            break;
        case 'connected': 
            name.innerHTML = message.payload.room
            setView(true)
            break;
        case 'disconnected': 
            name.innerHTML = ""
            setView(false)
            break;
    }
})

function setView(isLocalConnected) {
    let s = document.querySelector('#start')
    let loader = s.querySelector('div')
    loader.classList.remove('lds-dual-ring')
    if(isLocalConnected) {
        notconnectedEl.classList.remove('show')
        connectedEl.classList.add('show')
    }else{
        connectedEl.classList.remove('show')
        notconnectedEl.classList.add('show')
    }
}

