/* Z Sphere - Core App Utilities & Helpers */

(function () {
    window.ZSphereApp = {
        // Query Parameter Parser
        getParam: function (key) {
            const params = new URLSearchParams(window.location.search);
            return params.get(key);
        },

        // Helper to format dates
        formatDate: function (isoString) {
            if (!isoString) return 'TBA';
            try {
                const date = new Date(isoString);
                if (isNaN(date.getTime())) return 'TBA';
                return date.toLocaleDateString('en-US', {
                    month: 'short',
                    day: '2-digit',
                    year: 'numeric'
                });
            } catch (e) {
                return 'TBA';
            }
        },

        // Helper to format date and time
        formatDateTime: function (isoString) {
            if (!isoString) return 'TBA';
            try {
                const date = new Date(isoString);
                if (isNaN(date.getTime())) return 'TBA';
                return date.toLocaleDateString('en-US', {
                    month: 'short',
                    day: '2-digit',
                    year: 'numeric'
                }) + ' · ' + date.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });
            } catch (e) {
                return 'TBA';
            }
        },

        // Helper to escape HTML to prevent XSS in rendering
        escapeHtml: function (str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        },

        // Helper to sanitize dynamic URLs (ensures http://, https://, or mailto:, rejects javascript:, data:, vbscript:)
        sanitizeUrl: function (url) {
            if (!url || typeof url !== 'string') return '#';
            const trimmed = url.trim();
            if (!trimmed) return '#';

            // Explicitly block dangerous protocols even with obfuscated characters
            const normalized = trimmed.toLowerCase().replace(/[\x00-\x20]/g, '');
            if (normalized.startsWith('javascript:') || normalized.startsWith('data:') || normalized.startsWith('vbscript:')) {
                return '#';
            }

            // Allow safe protocols (http, https, mailto)
            if (/^(https?:\/\/|mailto:)/i.test(trimmed)) {
                return this.escapeHtml(trimmed);
            }

            // Allow safe relative paths (#anchor, /path, ./path, ../path, or relative HTML links without protocol)
            if (trimmed.startsWith('#') || trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) {
                return this.escapeHtml(trimmed);
            }

            if (!trimmed.includes(':')) {
                return this.escapeHtml(trimmed);
            }

            return '#';
        },

        // Check relative depth to set correct links if needed
        isPagesDir: function () {
            return window.location.pathname.includes('/pages/');
        },

        // Helper to build proper relative paths
        getPath: function (path) {
            if (this.isPagesDir()) {
                if (path.startsWith('pages/')) {
                    return path.replace('pages/', '');
                }
                if (path === 'index2.html') {
                    return '../index2.html';
                }
                if (path.startsWith('css/') || path.startsWith('js/')) {
                    return '../' + path;
                }
            }
            return path;
        },

        // Helper to provide realistic high-res default Unsplash tech banners
        getDefaultBanner: function (evt) {
            if (!evt) return 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=80';
            const category = (evt.category || '').toLowerCase();
            const type = (evt.event_type || '').toLowerCase();
            const slug = (evt.slug || '').toLowerCase();
            const title = (evt.title || '').toLowerCase();

            if (category.includes('ai') || slug.includes('prompt') || title.includes('prompt') || title.includes('ai')) {
                return 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80';
            }
            if (category.includes('git') || category.includes('open source') || slug.includes('git') || title.includes('git')) {
                return 'https://images.unsplash.com/photo-1556075798-4825dfaaf498?auto=format&fit=crop&w=1200&q=80';
            }
            if (category.includes('data') || category.includes('machine learning') || slug.includes('python') || title.includes('python')) {
                return 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=80';
            }
            if (type.includes('hackathon') || category.includes('hackathon') || slug.includes('hack') || title.includes('hack')) {
                return 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=1200&q=80';
            }
            return 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=80';
        },

        // Helper to debounce function execution for search/filter inputs
        debounce: function (func, wait = 250) {
            let timeout;
            return function (...args) {
                const context = this;
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(context, args), wait);
            };
        },

        // Client-side image resizing and square-cropping to high-quality standard resolution (400x400)
        resizeImage: function (file, options = {}) {
            return new Promise((resolve, reject) => {
                if (!file || !(file instanceof Blob)) {
                    return reject(new Error('Invalid image file provided'));
                }

                const targetSize = options.size || options.maxWidth || 400;
                const quality = options.quality !== undefined ? options.quality : 0.88;
                const mimeType = options.mimeType || 'image/webp';

                const reader = new FileReader();
                reader.onerror = () => reject(new Error('Failed to read image file'));
                reader.onload = (e) => {
                    const img = new Image();
                    img.onerror = () => reject(new Error('Failed to parse image data'));
                    img.onload = () => {
                        try {
                            const canvas = document.createElement('canvas');
                            canvas.width = targetSize;
                            canvas.height = targetSize;
                            const ctx = canvas.getContext('2d');
                            if (!ctx) {
                                return reject(new Error('Canvas 2D context unavailable'));
                            }

                            // Calculate center square crop
                            const sourceWidth = img.naturalWidth || img.width;
                            const sourceHeight = img.naturalHeight || img.height;
                            const minSide = Math.min(sourceWidth, sourceHeight);
                            const sourceX = (sourceWidth - minSide) / 2;
                            const sourceY = (sourceHeight - minSide) / 2;

                            // High-quality image smoothing
                            ctx.imageSmoothingEnabled = true;
                            ctx.imageSmoothingQuality = 'high';

                            // Fill with white background in case of transparent PNG
                            ctx.fillStyle = '#ffffff';
                            ctx.fillRect(0, 0, targetSize, targetSize);

                            // Draw cropped & resized image
                            ctx.drawImage(img, sourceX, sourceY, minSide, minSide, 0, 0, targetSize, targetSize);

                            canvas.toBlob((blob) => {
                                if (!blob) {
                                    // Fallback to jpeg if webp unsupported
                                    canvas.toBlob((jpegBlob) => {
                                        if (!jpegBlob) return reject(new Error('Image compression failed'));
                                        const cleanName = (file.name || 'avatar').replace(/\.[^/.]+$/, '') + '.jpg';
                                        const resizedFile = new File([jpegBlob], cleanName, { type: 'image/jpeg' });
                                        resolve({ file: resizedFile, blob: jpegBlob, dataUrl: canvas.toDataURL('image/jpeg', quality) });
                                    }, 'image/jpeg', quality);
                                    return;
                                }
                                const cleanName = (file.name || 'avatar').replace(/\.[^/.]+$/, '') + (mimeType === 'image/webp' ? '.webp' : '.jpg');
                                const resizedFile = new File([blob], cleanName, { type: blob.type || mimeType });
                                resolve({ file: resizedFile, blob: blob, dataUrl: canvas.toDataURL(mimeType, quality) });
                            }, mimeType, quality);
                        } catch (err) {
                            reject(err);
                        }
                    };
                    img.src = e.target.result;
                };
                reader.readAsDataURL(file);
            });
        }
    };

    // Centralized image fallback handling avoids inline event handlers and remains CSP-friendly.
    document.addEventListener('error', function (event) {
        const image = event.target;
        if (!image || image.tagName !== 'IMG') return;

        const fallbackSrc = image.dataset ? image.dataset.fallbackSrc : '';
        if (fallbackSrc && image.getAttribute('src') !== fallbackSrc) {
            image.setAttribute('src', fallbackSrc);
            image.removeAttribute('data-fallback-src');
            return;
        }

        const fallbackText = image.dataset ? image.dataset.fallbackText : '';
        if (fallbackText) {
            const textNode = document.createElement('span');
            textNode.className = 'image-fallback-text';
            textNode.textContent = fallbackText;
            image.replaceWith(textNode);
        }
    }, true);
})();
