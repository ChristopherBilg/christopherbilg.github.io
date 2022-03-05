const cache = "chris-bilger-portfolio-v1"

const assets = [
    "/",
    "/index.html",
    "/mvp.css",
    "/profile.jpg"
]

self.addEventListener("install", installEvent => {
    installEvent.waitUntil(
        caches.open(cache).then(cache => {
            cache.addAll(assets)
        })
    )
})

self.addEventListener("fetch", fetchEvent => {
    fetchEvent.respondWith(
        caches.match(fetchEvent.request).then(res => {
            return res || fetch(fetchEvent.request)
        })
    )
})