/* Z Sphere - Photo Gallery & Supabase Storage Lightbox Controller */

document.addEventListener('DOMContentLoaded', async function () {
    const galleryList = document.getElementById('gallery-albums-container');
    const albumDetail = document.getElementById('album-detail-container');

    // 1. Gallery Albums Overview (gallery.html)
    async function loadGallery() {
        if (!galleryList || !window.ZSphereDataService) return;
        if (window.ZSphereUI) window.ZSphereUI.renderLoadingSkeleton(galleryList, 3, 'card');

        try {
            const albums = await window.ZSphereDataService.getGalleryAlbums();

            if (albums.length === 0) {
                if (window.ZSphereUI) {
                    window.ZSphereUI.renderEmptyState(galleryList, 'No photo albums yet', 'Photographs and recaps from past workshops will be showcased here soon.', 'Explore Sessions', 'sessions.html');
                }
                return;
            }

            galleryList.innerHTML = albums.map(alb => {
                const dateDisplay = alb.created_at ? window.ZSphereApp.formatDate(alb.created_at) : '';
                const coverUrl = alb.cover_path ? window.ZSphereDataService.getPublicMediaUrl(alb.cover_path) : null;
                const initials = alb.title ? alb.title.substring(0, 2).toUpperCase() : 'ZS';
                const safeAlbumSlug = encodeURIComponent(alb.slug || alb.id || '');
                const eventTitle = alb.events ? (Array.isArray(alb.events) ? (alb.events[0] && alb.events[0].title) : alb.events.title) : '';

                return `
                    <div class="album-card">
                        <div class="album-cover">
                            ${coverUrl ? `<img src="${coverUrl}" alt="${window.ZSphereApp.escapeHtml(alb.title)}" loading="lazy" class="w-full h-full" data-fallback-text="${window.ZSphereApp.escapeHtml(initials)}">` : initials}
                        </div>
                        <div class="album-info">
                            <span class="text-muted text-xs d-block mb-1">${dateDisplay} ${eventTitle ? '· ' + window.ZSphereApp.escapeHtml(eventTitle) : ''}</span>
                            <h3 class="card-title mb-2">${window.ZSphereApp.escapeHtml(alb.title)}</h3>
                            <a href="gallery-album.html?album=${safeAlbumSlug}" class="btn btn-secondary btn-sm mt-2">View Album &rarr;</a>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (err) {
            console.error('Error fetching gallery albums:', err);
            if (window.ZSphereUI) {
                window.ZSphereUI.renderErrorState(galleryList, 'Could not load photo albums', 'Failed to load gallery albums from database.', loadGallery);
            }
        }
    }

    if (galleryList) {
        loadGallery();
    }

    // 2. Gallery Album Detail Page (gallery-album.html)
    async function loadAlbum() {
        if (!albumDetail || !window.ZSphereDataService) return;
        const albumSlug = window.ZSphereApp.getParam('album') || window.ZSphereApp.getParam('slug') || window.ZSphereApp.getParam('id');
        if (!albumSlug) {
            if (window.ZSphereUI) {
                window.ZSphereUI.renderEmptyState(albumDetail, 'Album Not Specified', 'Please choose an album from the gallery overview.', 'Back to Gallery', 'gallery.html');
            }
            return;
        }

        if (window.ZSphereUI) window.ZSphereUI.renderLoadingSkeleton(albumDetail, 4, 'card');

        try {
            const album = await window.ZSphereDataService.getGalleryAlbumBySlug(albumSlug);

            if (!album) {
                if (window.ZSphereUI) {
                    window.ZSphereUI.renderEmptyState(albumDetail, 'Album Not Found', 'The requested album does not exist or has been removed.', 'Back to Gallery', 'gallery.html');
                }
                return;
            }

            document.title = `${album.title} — Z Sphere Gallery`;

            const images = await window.ZSphereDataService.getGalleryImages(album.id);
            const dateDisplay = album.created_at ? window.ZSphereApp.formatDate(album.created_at) : '';
            const albumEventTitle = album.events ? (Array.isArray(album.events) ? (album.events[0] && album.events[0].title) : album.events.title) : '';

            albumDetail.innerHTML = `
                <nav class="breadcrumb" aria-label="Breadcrumb">
                    <span class="breadcrumb-item"><a href="../index2.html">Home</a></span>
                    <span class="breadcrumb-separator">/</span>
                    <span class="breadcrumb-item"><a href="gallery.html">Gallery</a></span>
                    <span class="breadcrumb-separator">/</span>
                    <span class="breadcrumb-item" aria-current="page">${window.ZSphereApp.escapeHtml(album.title)}</span>
                </nav>

                <div class="mb-4">
                    <h1 class="page-title mb-2">${window.ZSphereApp.escapeHtml(album.title)}</h1>
                    <p class="text-muted">${dateDisplay} · ${images.length} Photographs ${albumEventTitle ? '· ' + window.ZSphereApp.escapeHtml(albumEventTitle) : ''}</p>
                </div>

                ${images.length === 0 ? `
                    <div class="empty-state">
                        <div class="empty-state-title">No photographs in this album yet</div>
                        <div class="empty-state-desc">Event photos will be uploaded soon.</div>
                    </div>
                ` : `
                    <div class="photo-grid">
                        ${images.map((img, idx) => {
                            const imgUrl = img.storage_path ? window.ZSphereDataService.getPublicMediaUrl(img.storage_path) : (img.url || '');
                            const initials = `IMG ${idx + 1}`;
                            return `
                                <div class="photo-item" data-idx="${idx}" role="button" tabindex="0" aria-label="View photo ${idx + 1}: ${window.ZSphereApp.escapeHtml(img.caption || album.title)}">
                                    ${imgUrl ? `<img src="${imgUrl}" alt="${window.ZSphereApp.escapeHtml(img.alt_text || album.title)}" loading="lazy" data-fallback-text="${window.ZSphereApp.escapeHtml(initials)}">` : initials}
                                </div>
                            `;
                        }).join('')}
                    </div>
                `}
            `;

            // Attach Keyboard & Click Lightbox Viewer (UI-18)
            const photoItems = albumDetail.querySelectorAll('.photo-item');
            photoItems.forEach(item => {
                const openIdx = () => {
                    const idx = parseInt(item.getAttribute('data-idx'), 10);
                    if (window.ZSphereUI && window.ZSphereUI.showGalleryLightbox) {
                        window.ZSphereUI.showGalleryLightbox(images, idx, album.title);
                    }
                };

                item.addEventListener('click', openIdx);
                item.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openIdx();
                    }
                });
            });

        } catch (err) {
            console.error('Error fetching album detail:', err);
            if (window.ZSphereUI) {
                window.ZSphereUI.renderErrorState(albumDetail, 'Unable to load album', 'Please verify your connection and try again.', loadAlbum);
            }
        }
    }

    if (albumDetail) {
        loadAlbum();
    }
});
