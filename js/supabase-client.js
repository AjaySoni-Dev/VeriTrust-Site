/* Z Sphere - Supabase Browser Client Initialization */

(function () {
    if (typeof supabase === 'undefined') {
        console.warn('Supabase CDN script not loaded prior to supabase-client.js');
        return;
    }

    if (!window.ZSphereConfig) {
        console.error('ZSphereConfig missing');
        return;
    }

    // Initialize single logical browser Supabase client
    window.supabaseClient = supabase.createClient(
        window.ZSphereConfig.SUPABASE_URL,
        window.ZSphereConfig.SUPABASE_KEY,
        {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        }
    );
})();
