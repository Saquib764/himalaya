
function getRandom(n) {
    return Math.floor(Math.random() * (Math.pow(10, n) - Math.pow(10, n - 1)  - 1) + Math.pow(10, n - 1));
}

function randomElement(ar) {
    return ar[Math.floor(Math.random()*ar.length)]
}

chrome.runtime.onInstalled.addListener(()=>{
    // chrome.storage.sync.
    console.log("Installed")
    chrome.storage.sync.get('userId', (data)=> {
        if(data.userId) return
        let userId = "D" + (Date.now() + "_" + getRandom(4) + "_" + getRandom(3)).toString();
        chrome.storage.sync.set({'userId': userId})
    })
    chrome.storage.sync.set({'state': 'not-connected'})
    chrome.declarativeContent.onPageChanged.removeRules(undefined, ()=>{
        chrome.declarativeContent.onPageChanged.addRules([{
            conditions: [new chrome.declarativeContent.PageStateMatcher({
                pageUrl: {urlContains: "primevideo.com"}
            }), new chrome.declarativeContent.PageStateMatcher({
                pageUrl: {urlContains: "netflix.com"}
            })],
            actions: [new chrome.declarativeContent.ShowPageAction()]
        }])
    })
})


chrome.runtime.onMessage.addListener((message, cb)=>{
    console.log(message)
})
