const cacheName="BetaRox-v1";
self.addEventListener("install",event=>event.waitUntil(caches.open(cacheName).then(cache=>cache.addAll(["/","/editor/","/editor/beepbox_editor.min.js","/betarox-icon.svg"]).then(()=>self.skipWaiting()))));
self.addEventListener("activate",event=>event.waitUntil(self.clients.claim()));
self.addEventListener("fetch",event=>{if(event.request.method!=="GET")return;event.respondWith(caches.open(cacheName).then(async cache=>{try{const response=await fetch(event.request);if(event.request.url.startsWith(self.location.origin))cache.put(event.request,response.clone());return response}catch{return cache.match(event.request)}}))});
