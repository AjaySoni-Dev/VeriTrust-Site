/* Z Sphere - Supabase Configuration & URL Helpers */

(function () {
    window.ZSphereConfig = {
        SUPABASE_URL: "https://mfalnaqlejbqqxaxfbro.supabase.co",
        SUPABASE_KEY: "sb_publishable_pzix1QoGSyxfBWkyD8sxRQ_qvQ9OTr5",
        BUCKET_NAME: "public-media",

        // Helper to construct absolute URLs for auth redirects (password recovery, email confirmation)
        getRedirectUrl: function (path) {
            if (window.location.protocol === 'file:') {
                return null; // file:// protocol cannot receive external OAuth/email HTTP redirects
            }
            const origin = window.location.origin;
            const pathname = window.location.pathname;
            let basePath = pathname.substring(0, pathname.lastIndexOf('/') + 1);

            if (basePath.endsWith('/pages/')) {
                return origin + basePath + path;
            } else {
                return origin + (basePath.endsWith('/') ? basePath : basePath + '/') + 'pages/' + path;
            }
        }
    };
})();
