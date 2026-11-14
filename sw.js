const CACHE_NAME = "energy-cafe-offline-v1";
const IMAGE_CACHE = "energy-cafe-images-v1";
const API_CACHE = "energy-cafe-api-v1";

self.addEventListener("install", event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(["./", "./index.html"]);
        await self.skipWaiting();
    })());
});

self.addEventListener("activate", event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys
            .filter(key => key.startsWith("energy-cafe-") &&
                ![CACHE_NAME, IMAGE_CACHE, API_CACHE].includes(key))
            .map(key => caches.delete(key)));
        await self.clients.claim();
    })());
});

async function networkFirst(request, cacheName) {
    const cache = await caches.open(cacheName);

    try {
        const response = await fetch(request);
        if (response && response.ok) {
            await cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        const saved = await cache.match(request);
        if (saved) return saved;
        throw error;
    }
}

async function imageFirst(request) {
    const cache = await caches.open(IMAGE_CACHE);
    const saved = await cache.match(request);

    if (saved) {
        fetch(request).then(async response => {
            if (response && (response.ok || response.type === "opaque")) {
                await cache.put(request, response.clone());
            }
        }).catch(() => {});
        return saved;
    }

    const response = await fetch(request);

    if (response && (response.ok || response.type === "opaque")) {
        await cache.put(request, response.clone());
    }

    return response;
}

self.addEventListener("fetch", event => {
    const request = event.request;

    if (request.method !== "GET") return;

    const url = new URL(request.url);
    const path = url.pathname.toLowerCase();

    const isProductApi =
        path.includes("/api/v1/products") ||
        path.includes("/api/v1/categories");

    const isImage =
        path.includes("/media/products/") ||
        request.destination === "image";

    if (isProductApi) {
        event.respondWith(networkFirst(request, API_CACHE));
        return;
    }

    if (isImage) {
        event.respondWith(imageFirst(request).catch(async () => {
            return new Response("", { status: 504 });
        }));
        return;
    }

    if (request.mode === "navigate") {
        event.respondWith((async () => {
            try {
                const response = await fetch(request);
                if (response && response.ok) {
                    const cache = await caches.open(CACHE_NAME);
                    await cache.put("./index.html", response.clone());
                }
                return response;
            } catch (error) {
                const cache = await caches.open(CACHE_NAME);
                return (await cache.match("./index.html")) ||
                    new Response("منوی ENERGY+ CAFE در حال حاضر در دسترس نیست.", {
                        status: 503,
                        headers: { "Content-Type": "text/plain; charset=utf-8" }
                    });
            }
        })());
    }
});