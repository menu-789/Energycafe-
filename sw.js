const CACHE_NAME = "energy-cafe-offline-v2";
const IMAGE_CACHE = "energy-cafe-images-v2";
const API_CACHE = "energy-cafe-api-v2";

self.addEventListener("install", event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
            await cache.addAll(["./", "./index.html"]);
        } catch (e) {
            console.warn("Menu shell cache:", e);
        }
        await self.skipWaiting();
    })());
});

self.addEventListener("activate", event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(
            keys
                .filter(key =>
                    key.startsWith("energy-cafe-") &&
                    ![CACHE_NAME, IMAGE_CACHE, API_CACHE].includes(key)
                )
                .map(key => caches.delete(key))
        );
        await self.clients.claim();
    })());
});

async function fetchWithTimeout(request, milliseconds = 4500) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), milliseconds);

    try {
        return await fetch(request, { signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

async function refreshInBackground(request, cacheName) {
    try {
        const response = await fetchWithTimeout(request, 12000);

        if (response && (response.ok || response.type === "opaque")) {
            const cache = await caches.open(cacheName);
            await cache.put(request, response.clone());
        }
    } catch (error) {
        // Keep the last saved copy.
    }
}

async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const saved = await cache.match(request);

    if (saved) {
        refreshInBackground(request, cacheName);
        return saved;
    }

    try {
        const response = await fetchWithTimeout(request, 4500);

        if (response && (response.ok || response.type === "opaque")) {
            await cache.put(request, response.clone());
        }

        return response;
    } catch (error) {
        return new Response("", {
            status: 504,
            statusText: "Image unavailable offline"
        });
    }
}

async function networkFirst(request, cacheName) {
    const cache = await caches.open(cacheName);

    try {
        const response = await fetchWithTimeout(request, 4500);

        if (response && response.ok) {
            await cache.put(request, response.clone());
        }

        return response;
    } catch (error) {
        const saved = await cache.match(request);
        if (saved) {
            refreshInBackground(request, cacheName);
            return saved;
        }

        throw error;
    }
}

self.addEventListener("fetch", event => {
    const request = event.request;

    if (request.method !== "GET") return;

    const url = new URL(request.url);
    const path = url.pathname.toLowerCase();

    const isProductApi =
        path.includes("/api/v1/products") ||
        path.includes("/api/v1/categories");

    const isProductImage =
        path.includes("/media/products/") ||
        request.destination === "image";

    if (isProductApi) {
        event.respondWith(
            networkFirst(request, API_CACHE).catch(() =>
                new Response("[]", {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                })
            )
        );
        return;
    }

    if (isProductImage) {
        event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE));
        return;
    }

    if (request.mode === "navigate") {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE_NAME);

            try {
                const response = await fetchWithTimeout(request, 4500);

                if (response && response.ok) {
                    await cache.put("./index.html", response.clone());
                }

                return response;
            } catch (error) {
                return (await cache.match("./index.html")) ||
                    (await cache.match("./")) ||
                    new Response(
                        "منوی ENERGY+ CAFE در حال حاضر در دسترس نیست.",
                        {
                            status: 503,
                            headers: {
                                "Content-Type": "text/plain; charset=utf-8"
                            }
                        }
                    );
            }
        })());
    }
});