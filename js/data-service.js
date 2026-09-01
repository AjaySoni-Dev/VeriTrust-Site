/* Z Sphere - Central Supabase Data & Database Service */

(function () {
    const PUBLIC_EVENT_FIELDS = [
        'id', 'slug', 'title', 'summary', 'description', 'event_type', 'category', 'mode', 'status',
        'start_at', 'end_at', 'venue', 'registration_opens_at', 'registration_closes_at', 'capacity',
        'registered_count', 'attendance_count', 'feedback_response_count', 'feedback_summary',
        'attendance_summary_url', 'feedback_report_url', 'verification_report_url', 'cover_path',
        'learning_points', 'agenda', 'resources', 'conducted_by', 'facilitator_id', 'featured', 'published_at',
        'created_at', 'updated_at', 'facilitator:team_members(id, name, role_title, group_name, bio, photo_path, linkedin_url, github_url)'
    ].join(',');

    const AUTH_EVENT_FIELDS = `${PUBLIC_EVENT_FIELDS},registration_form_url,whatsapp_group_url`;
    window.ZSphereDataService = {

        // 1. Error Mapping Helper
        mapError: function (error) {
            if (!error) return 'An unknown error occurred.';
            const msg = typeof error === 'string' ? error : (error.message || error.details || String(error));

            if (msg.includes('AUTH_REQUIRED')) return 'Sign in before performing this action.';
            if (msg.includes('PROFILE_INCOMPLETE')) return 'Complete your profile before registering for sessions.';
            if (msg.includes('EVENT_NOT_AVAILABLE')) return 'This session is not currently available for registration.';
            if (msg.includes('EVENT_STARTED')) return 'This session has already started.';
            if (msg.includes('REGISTRATION_NOT_OPEN')) return 'Registration has not opened yet.';
            if (msg.includes('REGISTRATION_CLOSED')) return 'Registration for this session is closed.';
            if (msg.includes('EVENT_FULL')) return 'This session has reached its full capacity.';
            if (msg.includes('EVENT_NOT_FOUND')) return 'Session not found.';
            if (msg.includes('CANCELLATION_NOT_ALLOWED')) return 'Cancellation is not permitted for this session.';
            if (msg.includes('ADMIN_REQUIRED')) return 'Administrator permissions required.';
            if (msg.includes('INVALID_STATUS')) return 'Invalid status specified.';
            if (msg.includes('ATTENDANCE_TOO_EARLY')) return 'Attendance can only be marked during or after the session.';
            if (msg.includes('Invalid login credentials')) return 'Incorrect email or password.';
            if (msg.includes('Email not confirmed')) return 'Please confirm your email before signing in.';
            if (msg.includes('User already registered')) return 'An account already exists with this email address.';
            if (msg.includes('23505') || msg.includes('duplicate key')) return 'A record with this identifier or unique value already exists.';

            return msg;
        },

        // 2. Storage Public Media URL Resolver
        getPublicMediaUrl: function (path) {
            if (!path) return null;
            if (path.startsWith('http://') || path.startsWith('https://')) return path;
            if (!window.supabaseClient) return null;

            const { data } = window.supabaseClient.storage
                .from(window.ZSphereConfig.BUCKET_NAME)
                .getPublicUrl(path);

            return data ? data.publicUrl : null;
        },

        // 3. Upload Media Helper
        uploadPublicMedia: async function (file, folder, subfolder = 'general') {
            if (!window.supabaseClient) throw new Error('Database client offline');

            const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif'];
            if (!allowedTypes.includes(file.type)) {
                throw new Error('Unsupported image format. Allowed formats: JPEG, PNG, WebP, AVIF.');
            }

            const maxSize = 8 * 1024 * 1024; // 8MB
            if (file.size > maxSize) {
                throw new Error('Image size exceeds 8 MB limit.');
            }

            const allowedFolders = ['events', 'gallery', 'team', 'avatars', 'profiles'];
            if (!allowedFolders.includes(folder)) {
                throw new Error('Invalid storage folder target.');
            }

            const ext = file.name.split('.').pop().toLowerCase() || 'jpg';
            const uuid = crypto.randomUUID ? crypto.randomUUID() : (Date.now() + Math.random().toString(36).substring(2, 8));
            const storagePath = `${folder}/${subfolder}/${uuid}.${ext}`;

            const { data, error } = await window.supabaseClient.storage
                .from(window.ZSphereConfig.BUCKET_NAME)
                .upload(storagePath, file, {
                    contentType: file.type,
                    upsert: false
                });

            if (error) throw error;
            return data.path;
        },

        // User Profile Avatar Upload with auto client-side resizing
        uploadAvatar: async function (file) {
            if (!window.supabaseClient) throw new Error('Database client offline');
            const user = window.ZSphereAuthState ? window.ZSphereAuthState.user : null;
            if (!user) throw new Error('Authentication required to upload profile photo.');

            let uploadFile = file;
            // Client-side auto-resizing via ZSphereApp.resizeImage
            if (window.ZSphereApp && typeof window.ZSphereApp.resizeImage === 'function') {
                try {
                    const result = await window.ZSphereApp.resizeImage(file, { size: 400, quality: 0.88, mimeType: 'image/webp' });
                    if (result && result.file) uploadFile = result.file;
                } catch (resErr) {
                    console.warn('Avatar auto-resize fallback to original:', resErr);
                }
            }

            const ext = uploadFile.name.split('.').pop().toLowerCase() || 'webp';
            const uuid = crypto.randomUUID ? crypto.randomUUID() : (Date.now() + Math.random().toString(36).substring(2, 8));
            const storagePath = `avatars/${user.id}/${uuid}.${ext}`;

            const { data, error } = await window.supabaseClient.storage
                .from(window.ZSphereConfig.BUCKET_NAME)
                .upload(storagePath, uploadFile, {
                    contentType: uploadFile.type || 'image/webp',
                    upsert: true
                });

            if (error) throw new Error(this.mapError(error.message));

            const publicUrl = this.getPublicMediaUrl(data.path);

            // Update profiles table
            const { error: profileErr } = await window.supabaseClient
                .from('profiles')
                .update({ avatar_path: data.path, updated_at: new Date().toISOString() })
                .eq('id', user.id);

            if (profileErr) console.warn('Could not update avatar_path on profile:', profileErr.message);

            // Update user auth metadata
            try {
                await window.supabaseClient.auth.updateUser({
                    data: { avatar_url: publicUrl, avatar_path: data.path }
                });
            } catch (authErr) {
                console.warn('Auth user metadata avatar update warning:', authErr);
            }

            if (window.ZSphereAuthState && window.ZSphereAuthState.profile) {
                window.ZSphereAuthState.profile.avatar_path = data.path;
            }

            return { path: data.path, url: publicUrl };
        },

        // 4. PUBLIC EVENTS QUERIES
        getDefaultFeaturedEvents: function () {
            return [
                {
                    id: 'evt-ai-sprint',
                    title: 'Advanced AI & Structured Prompting Frameworks',
                    slug: 'advanced-ai-prompting-frameworks',
                    event_type: 'workshop',
                    status: 'published',
                    venue: 'Lab 402 / In-Person',
                    category: 'AI & Prompt Engineering',
                    start_at: new Date(Date.now() + 4 * 86400000).toISOString(),
                    end_at: new Date(Date.now() + 4 * 86400000 + 7200000).toISOString(),
                    summary: 'Hands-on exploration of chaining models, JSON schemas, few-shot prompting, and hallucination reduction techniques.',
                    conducted_by: 'Z Sphere Core Team',
                    capacity: 60,
                    registered_count: 38,
                    cover_path: null
                },
                {
                    id: 'evt-git-sprint',
                    title: 'Git Branching Strategies & Open Source Collaboration',
                    slug: 'git-branching-open-source',
                    event_type: 'build-sprint',
                    status: 'published',
                    venue: 'Google Meet / Online',
                    category: 'Git & Open Source',
                    start_at: new Date(Date.now() + 8 * 86400000).toISOString(),
                    end_at: new Date(Date.now() + 8 * 86400000 + 7200000).toISOString(),
                    summary: 'Practical interactive sprint covering rebasing, merge conflicts, pull request reviews, and contributing to real repositories.',
                    conducted_by: 'Z Sphere Open Source Lead',
                    capacity: 100,
                    registered_count: 74,
                    cover_path: null
                }
            ];
        },

        // Helper to sort events: Upcoming/Published first, then most recently created/completed
        sortEventsByRelevance: function (events) {
            if (!Array.isArray(events)) return [];
            const nowTime = new Date().getTime();

            return [...events].sort((a, b) => {
                const isACompleted = a.status === 'completed' || (a.end_at && new Date(a.end_at).getTime() < nowTime);
                const isBCompleted = b.status === 'completed' || (b.end_at && new Date(b.end_at).getTime() < nowTime);

                // 1. Upcoming & Published sessions ALWAYS come before Completed sessions
                if (!isACompleted && isBCompleted) return -1;
                if (isACompleted && !isBCompleted) return 1;

                // 2. Both upcoming: sort soonest upcoming first (or newest created)
                if (!isACompleted && !isBCompleted) {
                    const aStart = a.start_at ? new Date(a.start_at).getTime() : Infinity;
                    const bStart = b.start_at ? new Date(b.start_at).getTime() : Infinity;
                    if (aStart !== bStart) return aStart - bStart;
                    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
                }

                // 3. Both completed: sort most recently completed first (newest date first)
                const aDate = new Date(a.end_at || a.start_at || a.created_at || 0).getTime();
                const bDate = new Date(b.end_at || b.start_at || b.created_at || 0).getTime();
                return bDate - aDate;
            });
        },

        getFeaturedEvents: async function () {
            if (!window.supabaseClient) return this.getDefaultFeaturedEvents();

            try {
                const now = new Date().toISOString();
                const { data, error } = await window.supabaseClient
                    .from('events')
                    .select(PUBLIC_EVENT_FIELDS)
                    .in('status', ['published', 'upcoming', 'completed'])
                    .or(`published_at.is.null,published_at.lte.${now}`)
                    .order('created_at', { ascending: false })
                    .limit(10);

                if (!error && data && data.length > 0) {
                    const sorted = this.sortEventsByRelevance(data);
                    return sorted.slice(0, 4);
                }

                return this.getDefaultFeaturedEvents();
            } catch (e) {
                console.warn('Fallback to default featured events:', e);
                return this.getDefaultFeaturedEvents();
            }
        },

        getEvents: async function (filters = {}) {
            if (!window.supabaseClient) return [];

            const now = new Date().toISOString();
            let query = window.supabaseClient
                .from('events')
                .select(PUBLIC_EVENT_FIELDS)
                .in('status', ['published', 'upcoming', 'completed', 'cancelled'])
                .or(`published_at.is.null,published_at.lte.${now}`)
                .order('created_at', { ascending: false });

            if (filters.type && filters.type !== 'all') {
                query = query.eq('event_type', filters.type);
            }

            let { data, error } = await query;
            if (error) {
                console.warn('getEvents primary query warning (retrying simple query):', error.message);
                // Fallback to select * in case foreign key is not yet present
                const { data: fallbackData, error: fallbackErr } = await window.supabaseClient
                    .from('events')
                    .select('*')
                    .in('status', ['published', 'upcoming', 'completed', 'cancelled'])
                    .or(`published_at.is.null,published_at.lte.${now}`)
                    .order('created_at', { ascending: false });

                if (fallbackErr) {
                    console.error('getEvents fallback error:', fallbackErr.message);
                    return [];
                }
                data = fallbackData;
            }

            let results = data || [];

            // Perform in-memory sub-filtering for query/category/mode/status
            if (filters.status && filters.status !== 'all') {
                const currentDate = new Date();
                results = results.filter(e => {
                    if (filters.status === 'completed') return e.status === 'completed' || (e.end_at && new Date(e.end_at) < currentDate);
                    if (filters.status === 'upcoming') return (e.status === 'published' || e.status === 'upcoming') && (!e.end_at || new Date(e.end_at) >= currentDate);
                    if (filters.status === 'full') return e.capacity !== null && e.registered_count >= e.capacity;
                    return e.status === filters.status;
                });
            }

            if (filters.q) {
                const q = filters.q.toLowerCase().trim();
                results = results.filter(e =>
                    e.title.toLowerCase().includes(q) ||
                    (e.summary && e.summary.toLowerCase().includes(q)) ||
                    (e.category && e.category.toLowerCase().includes(q)) ||
                    (e.venue && e.venue.toLowerCase().includes(q))
                );
            }

            if (filters.category && filters.category !== 'all') {
                results = results.filter(e => e.category && e.category.toLowerCase().includes(filters.category.toLowerCase()));
            }

            if (filters.mode && filters.mode !== 'all') {
                results = results.filter(e => e.mode === filters.mode);
            }

            return this.sortEventsByRelevance(results);
        },

        getPublicEventBySlug: async function (slug, includeRegistrationLinks = false) {
            if (!window.supabaseClient || !slug) return null;

            const isSignedIn = Boolean(window.ZSphereAuthState && window.ZSphereAuthState.user);
            const selectFields = includeRegistrationLinks && isSignedIn ? AUTH_EVENT_FIELDS : PUBLIC_EVENT_FIELDS;
            const now = new Date().toISOString();

            let { data, error } = await window.supabaseClient
                .from('events')
                .select(selectFields)
                .eq('slug', slug)
                .in('status', ['published', 'completed', 'cancelled'])
                .or(`published_at.is.null,published_at.lte.${now}`)
                .maybeSingle();

            if (error) {
                // Retry with select * fallback
                const { data: fallbackData } = await window.supabaseClient
                    .from('events')
                    .select('*')
                    .eq('slug', slug)
                    .in('status', ['published', 'completed', 'cancelled'])
                    .or(`published_at.is.null,published_at.lte.${now}`)
                    .maybeSingle();
                if (fallbackData) data = fallbackData;
            }

            if (!data) {
                // Fallback lookup by id in case ID was passed as slug param
                const { data: byId } = await window.supabaseClient
                    .from('events')
                    .select(selectFields)
                    .eq('id', slug)
                    .in('status', ['published', 'completed', 'cancelled'])
                    .or(`published_at.is.null,published_at.lte.${now}`)
                    .maybeSingle();
                if (byId) data = byId;
                else {
                    const { data: byIdFallback } = await window.supabaseClient
                        .from('events')
                        .select('*')
                        .eq('id', slug)
                        .in('status', ['published', 'completed', 'cancelled'])
                        .or(`published_at.is.null,published_at.lte.${now}`)
                        .maybeSingle();
                    if (byIdFallback) data = byIdFallback;
                }
            }

            // If facilitator_id is present but facilitator join didn't populate, look up in team_members
            if (data && data.facilitator_id && !data.facilitator) {
                try {
                    const { data: facilitatorData } = await window.supabaseClient
                        .from('team_members')
                        .select('id, name, role_title, group_name, bio, photo_path, linkedin_url, github_url')
                        .eq('id', data.facilitator_id)
                        .maybeSingle();
                    if (facilitatorData) {
                        data.facilitator = facilitatorData;
                    }
                } catch (facErr) {
                    console.warn('Facilitator lookup warning:', facErr);
                }
            }

            return data || null;
        },

        // 5. IN-PLATFORM REGISTRATION SERVICES
        isUserRegisteredForEvent: async function (eventId) {
            if (!window.supabaseClient || !eventId) return false;
            const user = window.ZSphereAuthState ? window.ZSphereAuthState.user : null;
            if (!user) return false;

            try {
                const { data, error } = await window.supabaseClient
                    .from('registrations')
                    .select('id, status')
                    .eq('event_id', eventId)
                    .eq('user_id', user.id)
                    .in('status', ['registered', 'attended'])
                    .maybeSingle();

                if (error) {
                    console.warn('isUserRegistered check warning:', error.message);
                    return false;
                }
                return Boolean(data);
            } catch (err) {
                console.warn('isUserRegistered check error:', err);
                return false;
            }
        },

        registerForEvent: async function (eventId) {
            if (!window.supabaseClient) throw new Error('Database client offline');
            const user = window.ZSphereAuthState ? window.ZSphereAuthState.user : null;
            if (!user) throw new Error('AUTH_REQUIRED');

            // 1. Fetch current event to check status and capacity
            const { data: evt, error: evtErr } = await window.supabaseClient
                .from('events')
                .select('id, title, status, capacity, registered_count, registration_opens_at, registration_closes_at, end_at')
                .eq('id', eventId)
                .maybeSingle();

            if (evtErr || !evt) throw new Error('EVENT_NOT_FOUND');

            if (evt.status !== 'published' && evt.status !== 'upcoming') {
                throw new Error('EVENT_NOT_AVAILABLE');
            }

            if (evt.end_at && new Date(evt.end_at) < new Date()) {
                throw new Error('EVENT_STARTED');
            }

            const now = new Date();
            if (evt.registration_opens_at && new Date(evt.registration_opens_at) > now) {
                throw new Error('REGISTRATION_NOT_OPEN');
            }
            if (evt.registration_closes_at && new Date(evt.registration_closes_at) <= now) {
                throw new Error('REGISTRATION_CLOSED');
            }

            const cap = evt.capacity || 0;
            const currentCount = evt.registered_count || 0;
            if (cap > 0 && currentCount >= cap) {
                throw new Error('EVENT_FULL');
            }

            // 2. Insert or update registration
            const { data: reg, error: regErr } = await window.supabaseClient
                .from('registrations')
                .upsert({
                    event_id: eventId,
                    user_id: user.id,
                    status: 'registered',
                    registered_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }, { onConflict: 'event_id, user_id' })
                .select()
                .single();

            if (regErr) throw new Error(this.mapError(regErr.message));

            // 3. Keep event registered_count updated
            try {
                const { count } = await window.supabaseClient
                    .from('registrations')
                    .select('*', { count: 'exact', head: true })
                    .eq('event_id', eventId)
                    .in('status', ['registered', 'attended']);

                if (count !== null && count !== undefined) {
                    await window.supabaseClient
                        .from('events')
                        .update({ registered_count: count })
                        .eq('id', eventId);
                }
            } catch (cntErr) {
                console.warn('Registered count sync warning:', cntErr);
            }

            return reg;
        },

        cancelRegistration: async function (eventId) {
            if (!window.supabaseClient) throw new Error('Database client offline');
            const user = window.ZSphereAuthState ? window.ZSphereAuthState.user : null;
            if (!user) throw new Error('AUTH_REQUIRED');

            const { error: cancelErr } = await window.supabaseClient
                .from('registrations')
                .update({
                    status: 'cancelled',
                    updated_at: new Date().toISOString()
                })
                .eq('event_id', eventId)
                .eq('user_id', user.id);

            if (cancelErr) throw new Error(this.mapError(cancelErr.message));

            // Sync registered_count
            try {
                const { count } = await window.supabaseClient
                    .from('registrations')
                    .select('*', { count: 'exact', head: true })
                    .eq('event_id', eventId)
                    .in('status', ['registered', 'attended']);

                if (count !== null && count !== undefined) {
                    await window.supabaseClient
                        .from('events')
                        .update({ registered_count: count })
                        .eq('id', eventId);
                }
            } catch (cntErr) {
                console.warn('Registered count sync warning:', cntErr);
            }

            return { success: true };
        },

        getUserRegistrations: async function (userId = null) {
            if (!window.supabaseClient) return [];
            const uid = userId || (window.ZSphereAuthState && window.ZSphereAuthState.user ? window.ZSphereAuthState.user.id : null);
            if (!uid) return [];

            try {
                const { data, error } = await window.supabaseClient
                    .from('registrations')
                    .select('id, event_id, status, registered_at, events(*)')
                    .eq('user_id', uid)
                    .order('registered_at', { ascending: false });

                if (error) {
                    console.error('Error fetching user registrations:', error.message);
                    return [];
                }
                return data || [];
            } catch (err) {
                console.error('Error fetching user registrations:', err);
                return [];
            }
        },

        adminGetRegistrations: async function (eventId = null) {
            if (!window.supabaseClient) return [];

            try {
                let query = window.supabaseClient
                    .from('registrations')
                    .select('id, event_id, user_id, status, registered_at, created_at, events(id, title, slug, start_at, venue, event_type, category, mode), profiles(id, full_name, email, course, semester)')
                    .order('registered_at', { ascending: false });

                if (eventId && eventId !== 'all') {
                    query = query.eq('event_id', eventId);
                }

                const { data, error } = await query;
                if (error) throw new Error(this.mapError(error.message));
                return data || [];
            } catch (err) {
                console.error('Error fetching admin registrations:', err);
                throw err;
            }
        },

        adminUpdateRegistrationStatus: async function (registrationId, newStatus) {
            if (!window.supabaseClient) throw new Error('Database client offline');

            const { data, error } = await window.supabaseClient
                .from('registrations')
                .update({
                    status: newStatus,
                    updated_at: new Date().toISOString()
                })
                .eq('id', registrationId)
                .select('*, events(id)')
                .single();

            if (error) throw new Error(this.mapError(error.message));

            if (data && data.event_id) {
                try {
                    const { count } = await window.supabaseClient
                        .from('registrations')
                        .select('*', { count: 'exact', head: true })
                        .eq('event_id', data.event_id)
                        .in('status', ['registered', 'attended']);

                    if (count !== null && count !== undefined) {
                        await window.supabaseClient
                            .from('events')
                            .update({ registered_count: count })
                            .eq('id', data.event_id);
                    }
                } catch (e) {
                    console.warn('Sync error:', e);
                }
            }

            return data;
        },

        adminDeleteRegistration: async function (registrationId) {
            if (!window.supabaseClient) throw new Error('Database client offline');

            const { data: reg } = await window.supabaseClient
                .from('registrations')
                .select('event_id')
                .eq('id', registrationId)
                .maybeSingle();

            const { error } = await window.supabaseClient
                .from('registrations')
                .delete()
                .eq('id', registrationId);

            if (error) throw new Error(this.mapError(error.message));

            if (reg && reg.event_id) {
                try {
                    const { count } = await window.supabaseClient
                        .from('registrations')
                        .select('*', { count: 'exact', head: true })
                        .eq('event_id', reg.event_id)
                        .in('status', ['registered', 'attended']);

                    if (count !== null && count !== undefined) {
                        await window.supabaseClient
                            .from('events')
                            .update({ registered_count: count })
                            .eq('id', reg.event_id);
                    }
                } catch (e) {
                    console.warn('Sync error:', e);
                }
            }

            return { success: true };
        },

        // 6. ANNOUNCEMENTS & READ STATES
        getAnnouncements: async function () {
            if (!window.supabaseClient) return [];

            const now = new Date().toISOString();
            const { data: announcements, error } = await window.supabaseClient
                .from('announcements')
                .select('id, title, body, event_id, audience, priority, published_at, expires_at, created_at, events(title, slug)')
                .or(`published_at.is.null,published_at.lte.${now}`)
                .or(`expires_at.is.null,expires_at.gt.${now}`)
                .order('published_at', { ascending: false });

            if (error) {
                console.error('Error fetching announcements:', error.message);
                return [];
            }

            let readsMap = new Set();
            const user = window.ZSphereAuthState.user;
            if (user && announcements && announcements.length > 0) {
                const annIds = announcements.map(a => a.id);
                const { data: reads } = await window.supabaseClient
                    .from('announcement_reads')
                    .select('announcement_id')
                    .eq('user_id', user.id)
                    .in('announcement_id', annIds);

                if (reads) {
                    reads.forEach(r => readsMap.add(r.announcement_id));
                }
            }

            return (announcements || []).map(item => ({
                ...item,
                is_read: readsMap.has(item.id)
            }));
        },

        markAnnouncementRead: async function (announcementId) {
            const user = window.ZSphereAuthState.user;
            if (!window.supabaseClient || !user || !announcementId) return;

            const { error } = await window.supabaseClient
                .from('announcement_reads')
                .upsert({
                    announcement_id: announcementId,
                    user_id: user.id,
                    read_at: new Date().toISOString()
                }, { onConflict: 'announcement_id, user_id' });

            if (error) console.error('Error marking announcement read:', error.message);
        },

        markAnnouncementUnread: async function (announcementId) {
            const user = window.ZSphereAuthState.user;
            if (!window.supabaseClient || !user || !announcementId) return;

            const { error } = await window.supabaseClient
                .from('announcement_reads')
                .delete()
                .eq('announcement_id', announcementId)
                .eq('user_id', user.id);

            if (error) console.error('Error marking announcement unread:', error.message);
        },

        // 7. GALLERY & ALBUMS
        getDefaultAlbums: function () {
            return [
                {
                    id: 'album-ai-masterclass',
                    event_id: null,
                    slug: 'ai-prompt-engineering-masterclass',
                    title: 'AI & Prompt Engineering Masterclass',
                    cover_path: null,
                    is_published: true,
                    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
                    events: { title: 'AI & Prompt Engineering', start_at: new Date(Date.now() - 3 * 86400000).toISOString() }
                },
                {
                    id: 'album-hackathon-2026',
                    event_id: null,
                    slug: 'sprint-2026-hackathon-demos',
                    title: 'Sprint 2026 Hackathon & Project Demos',
                    cover_path: null,
                    is_published: true,
                    created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
                    events: { title: 'Hackathons & Product Building', start_at: new Date(Date.now() - 10 * 86400000).toISOString() }
                },
                {
                    id: 'album-git-collab',
                    event_id: null,
                    slug: 'open-source-git-build-day',
                    title: 'Open Source Git & Team Build Day',
                    cover_path: null,
                    is_published: true,
                    created_at: new Date(Date.now() - 18 * 86400000).toISOString(),
                    events: { title: 'Git & Open Source', start_at: new Date(Date.now() - 18 * 86400000).toISOString() }
                }
            ];
        },

        getGalleryAlbums: async function () {
            if (!window.supabaseClient) return this.getDefaultAlbums();

            try {
                const { data, error } = await window.supabaseClient
                    .from('gallery_albums')
                    .select('id, event_id, slug, title, cover_path, is_published, created_at, events(title, start_at)')
                    .eq('is_published', true)
                    .order('created_at', { ascending: false });

                if (error) {
                    console.warn('Error fetching gallery albums with events join, trying standalone fallback:', error.message);
                    const { data: standaloneData, error: standaloneError } = await window.supabaseClient
                        .from('gallery_albums')
                        .select('id, event_id, slug, title, cover_path, is_published, created_at')
                        .eq('is_published', true)
                        .order('created_at', { ascending: false });

                    if (standaloneError) {
                        console.error('Error fetching gallery albums standalone:', standaloneError.message);
                        return this.getDefaultAlbums();
                    }
                    return standaloneData || [];
                }
                return data || [];
            } catch (e) {
                console.warn('Fallback to default albums on exception:', e);
                return this.getDefaultAlbums();
            }
        },

        getGalleryAlbumBySlug: async function (slug) {
            if (!slug) return null;

            if (window.supabaseClient) {
                try {
                    let { data, error } = await window.supabaseClient
                        .from('gallery_albums')
                        .select('id, event_id, slug, title, cover_path, is_published, created_at, events(title, start_at)')
                        .eq('slug', slug)
                        .maybeSingle();

                    if (error) {
                        const { data: standalone, error: standaloneError } = await window.supabaseClient
                            .from('gallery_albums')
                            .select('id, event_id, slug, title, cover_path, is_published, created_at')
                            .eq('slug', slug)
                            .maybeSingle();
                        if (!standaloneError && standalone) data = standalone;
                    }

                    if (!data) {
                        const { data: byId } = await window.supabaseClient
                            .from('gallery_albums')
                            .select('id, event_id, slug, title, cover_path, is_published, created_at, events(title, start_at)')
                            .eq('id', slug)
                            .maybeSingle();
                        if (byId) data = byId;
                    }

                    if (!data) {
                        const { data: byIdStandalone } = await window.supabaseClient
                            .from('gallery_albums')
                            .select('id, event_id, slug, title, cover_path, is_published, created_at')
                            .eq('id', slug)
                            .maybeSingle();
                        if (byIdStandalone) data = byIdStandalone;
                    }

                    if (data) return data;
                } catch (e) {
                    console.error('Exception fetching album by slug:', e);
                }
            }

            const defaultAlbums = this.getDefaultAlbums();
            return defaultAlbums.find(a => a.slug === slug || a.id === slug) || null;
        },

        getGalleryAlbumByEventId: async function (eventId) {
            if (!window.supabaseClient || !eventId) return null;

            try {
                const { data, error } = await window.supabaseClient
                    .from('gallery_albums')
                    .select('id, event_id, slug, title, cover_path, is_published, created_at')
                    .eq('event_id', eventId)
                    .eq('is_published', true)
                    .maybeSingle();

                if (error) console.error('Error fetching album by event ID:', error.message);
                return data || null;
            } catch (e) {
                console.error('Exception fetching album by event ID:', e);
                return null;
            }
        },

        getGalleryImages: async function (albumId) {
            if (!window.supabaseClient || !albumId) return [];

            try {
                const { data, error } = await window.supabaseClient
                    .from('gallery_images')
                    .select('id, album_id, storage_path, alt_text, caption, sort_order, is_published')
                    .eq('album_id', albumId)
                    .eq('is_published', true)
                    .order('sort_order', { ascending: true });

                if (error) {
                    console.error('Error fetching album images:', error.message);
                    return [];
                }
                return data || [];
            } catch (e) {
                console.error('Exception fetching album images:', e);
                return [];
            }
        },

        // 8. TEAM MEMBERS
        getTeamMembers: async function () {
            if (!window.supabaseClient) return [];

            const { data, error } = await window.supabaseClient
                .from('team_members')
                .select('*')
                .eq('is_active', true)
                .order('group_name', { ascending: true })
                .order('sort_order', { ascending: true });

            if (error) {
                console.error('Error fetching team members:', error.message);
                return [];
            }
            return data || [];
        },

        // 8. PLATFORM METRICS (PUBLIC & ADMIN)
        getPlatformStats: async function () {
            let totalSessions = 25;
            let totalRegistrations = 500;
            let totalProjects = 40;
            let totalAlbums = 8;
            let totalAnnouncements = 5;

            if (!window.supabaseClient) {
                return {
                    sessions: totalSessions,
                    registrations: totalRegistrations,
                    projects: totalProjects,
                    albums: totalAlbums,
                    announcements: totalAnnouncements
                };
            }

            try {
                // 1. First attempt to call the database RPC get_platform_stats if available
                const { data: rpcData, error: rpcErr } = await window.supabaseClient.rpc('get_platform_stats');
                if (!rpcErr && rpcData) {
                    const rpcSessions = Number(rpcData.total_sessions) || 0;
                    const rpcRegs = Number(rpcData.total_registrations) || 0;
                    const rpcAlbs = Number(rpcData.total_albums) || 0;
                    const rpcAnn = Number(rpcData.total_announcements) || 0;

                    return {
                        sessions: rpcSessions > 0 ? rpcSessions : totalSessions,
                        registrations: rpcRegs > 0 ? rpcRegs : totalRegistrations,
                        projects: rpcAlbs > 0 ? Math.max(rpcAlbs * 4, 15) : totalProjects,
                        albums: rpcAlbs > 0 ? rpcAlbs : totalAlbums,
                        announcements: rpcAnn > 0 ? rpcAnn : totalAnnouncements
                    };
                }
            } catch (e) {
                // Fallback to table queries below
            }

            try {
                // 2. Fetch all events (including past completed events) to sum their historical registrations and attendance
                const [{ data: eventsData, count: eventsCount }, { count: albCount }, { count: annCount }, { count: regTableCount }] = await Promise.all([
                    window.supabaseClient
                        .from('events')
                        .select('id, status, registered_count, attendance_count', { count: 'exact' }),
                    window.supabaseClient
                        .from('gallery_albums')
                        .select('id', { count: 'exact', head: true }),
                    window.supabaseClient
                        .from('announcements')
                        .select('id', { count: 'exact', head: true }),
                    window.supabaseClient
                        .from('registrations')
                        .select('id', { count: 'exact', head: true })
                        .in('status', ['registered', 'attended'])
                ]);

                if (typeof eventsCount === 'number' && eventsCount > 0) {
                    totalSessions = eventsCount;
                }

                // Sum all student registrations and attendance across ALL events (both past and ongoing)
                let cumulativeEventRegistrations = 0;
                if (eventsData && eventsData.length > 0) {
                    cumulativeEventRegistrations = eventsData.reduce((acc, evt) => {
                        const regCount = Number(evt.registered_count) || 0;
                        const attCount = Number(evt.attendance_count) || 0;
                        return acc + Math.max(regCount, attCount);
                    }, 0);
                }

                const tableRegs = (typeof regTableCount === 'number') ? regTableCount : 0;
                const computedRegistrations = Math.max(cumulativeEventRegistrations, tableRegs);

                if (computedRegistrations > 0) {
                    totalRegistrations = computedRegistrations;
                }

                if (typeof albCount === 'number' && albCount > 0) {
                    totalAlbums = albCount;
                    totalProjects = Math.max(albCount * 4, 15);
                }

                if (typeof annCount === 'number') {
                    totalAnnouncements = annCount;
                }

                return {
                    sessions: totalSessions,
                    registrations: totalRegistrations,
                    projects: totalProjects,
                    albums: totalAlbums,
                    announcements: totalAnnouncements
                };
            } catch (err) {
                console.warn('Error computing platform stats:', err);
                return {
                    sessions: totalSessions,
                    registrations: totalRegistrations,
                    projects: totalProjects,
                    albums: totalAlbums,
                    announcements: totalAnnouncements
                };
            }
        },

        // 9. ADMIN OPERATIONS (EVENTS, REGISTRATIONS, ANNOUNCEMENTS, GALLERY, TEAM)
        adminGetDashboardStats: async function () {
            try {
                const stats = await this.getPlatformStats();
                return {
                    events: stats.sessions || 0,
                    registrations: stats.registrations || 0,
                    announcements: stats.announcements || 0,
                    albums: stats.albums || 0
                };
            } catch (e) {
                console.warn('Dashboard stats load error:', e);
                return { events: 0, registrations: 0, announcements: 0, albums: 0 };
            }
        },

        adminGetEvents: async function () {
            if (!window.supabaseClient) return [];

            try {
                const { data, error } = await window.supabaseClient
                    .from('events')
                    .select('*')
                    .order('start_at', { ascending: false });

                if (error) {
                    console.warn('adminGetEvents ordered query failed, trying unordered fallback:', error.message);
                    const { data: fallback, error: fallbackError } = await window.supabaseClient
                        .from('events')
                        .select('*');
                    if (fallbackError) {
                        console.error('adminGetEvents fallback error:', fallbackError.message);
                        return [];
                    }
                    return fallback || [];
                }
                return data || [];
            } catch (e) {
                console.error('adminGetEvents exception:', e);
                return [];
            }
        },

        adminCreateEvent: async function (eventData, coverFile) {
            const user = window.ZSphereAuthState.user;
            if (!user) throw new Error('Authentication required');

            let coverPath = eventData.cover_path || null;
            if (coverFile) {
                coverPath = await this.uploadPublicMedia(coverFile, 'events', eventData.slug || 'covers');
            }

            const payload = {
                ...eventData,
                cover_path: coverPath,
                created_by: user.id
            };

            const { data, error } = await window.supabaseClient
                .from('events')
                .insert([payload])
                .select()
                .single();

            if (error) throw new Error(this.mapError(error.message));
            return data;
        },

        adminUpdateEvent: async function (id, eventData, coverFile) {
            if (!id) throw new Error('Event ID required');

            let coverPath = eventData.cover_path;
            let oldCoverPath = null;
            
            if (coverFile) {
                const { data: oldEvent } = await window.supabaseClient.from('events').select('cover_path').eq('id', id).maybeSingle();
                if (oldEvent && oldEvent.cover_path) oldCoverPath = oldEvent.cover_path;
                coverPath = await this.uploadPublicMedia(coverFile, 'events', eventData.slug || 'covers');
            }

            const payload = { ...eventData };
            if (coverPath !== undefined) payload.cover_path = coverPath;

            const { data, error } = await window.supabaseClient
                .from('events')
                .update(payload)
                .eq('id', id)
                .select()
                .single();

            if (error) {
                if (coverFile && coverPath) {
                    await window.supabaseClient.storage.from(window.ZSphereConfig.BUCKET_NAME).remove([coverPath]);
                }
                throw new Error(this.mapError(error.message));
            }
            
            if (oldCoverPath) {
                await window.supabaseClient.storage.from(window.ZSphereConfig.BUCKET_NAME).remove([oldCoverPath]);
            }
            return data;
        },

        adminDeleteEvent: async function (id) {
            if (!id) throw new Error('Event ID required');

            const { data: event } = await window.supabaseClient.from('events').select('cover_path, gallery_albums(id, cover_path)').eq('id', id).maybeSingle();
            let pathsToRemove = [];
            
            if (event) {
                if (event.cover_path) pathsToRemove.push(event.cover_path);
                if (event.gallery_albums && event.gallery_albums.length > 0) {
                    const album = event.gallery_albums[0];
                    if (album.cover_path) pathsToRemove.push(album.cover_path);
                    const { data: images } = await window.supabaseClient.from('gallery_images').select('storage_path').eq('album_id', album.id);
                    if (images) {
                        images.forEach(img => {
                            if (img.storage_path) pathsToRemove.push(img.storage_path);
                        });
                    }
                }
            }

            const { error } = await window.supabaseClient
                .from('events')
                .delete()
                .eq('id', id);

            if (error) throw new Error(this.mapError(error.message));
            
            if (pathsToRemove.length > 0) {
                await window.supabaseClient.storage.from(window.ZSphereConfig.BUCKET_NAME).remove(pathsToRemove);
            }
        },

        adminGetEventBySlug: async function (slug) {
            if (!window.supabaseClient || !slug) return null;

            const { data, error } = await window.supabaseClient
                .from('events')
                .select('*')
                .eq('slug', slug)
                .maybeSingle();

            if (error) throw new Error(this.mapError(error.message));
            return data || null;
        },

        // Removed admin registration management

        adminGetAnnouncements: async function () {
            if (!window.supabaseClient) return [];

            const { data, error } = await window.supabaseClient
                .from('announcements')
                .select('*, events(title, slug)')
                .order('created_at', { ascending: false });

            if (error) throw new Error(this.mapError(error.message));
            return data || [];
        },

        adminCreateAnnouncement: async function (announcementData) {
            const user = window.ZSphereAuthState.user;
            if (!user) throw new Error('Authentication required');

            const payload = {
                ...announcementData,
                created_by: user.id
            };

            const { data, error } = await window.supabaseClient
                .from('announcements')
                .insert([payload])
                .select()
                .single();

            if (error) throw new Error(this.mapError(error.message));
            return data;
        },

        adminUpdateAnnouncement: async function (id, announcementData) {
            const { data, error } = await window.supabaseClient
                .from('announcements')
                .update(announcementData)
                .eq('id', id)
                .select()
                .single();

            if (error) throw new Error(this.mapError(error.message));
            return data;
        },

        adminDeleteAnnouncement: async function (id) {
            const { error } = await window.supabaseClient
                .from('announcements')
                .delete()
                .eq('id', id);

            if (error) throw new Error(this.mapError(error.message));
        },

        adminGetAlbums: async function () {
            if (!window.supabaseClient) return [];

            const { data, error } = await window.supabaseClient
                .from('gallery_albums')
                .select('*, events(title)')
                .order('created_at', { ascending: false });

            if (error) throw new Error(this.mapError(error.message));
            return data || [];
        },

        adminCreateAlbum: async function (albumData, coverFile) {
            const user = window.ZSphereAuthState.user;
            if (!user) throw new Error('Authentication required');

            let coverPath = albumData.cover_path || null;
            if (coverFile) {
                coverPath = await this.uploadPublicMedia(coverFile, 'gallery', albumData.slug || 'covers');
            }

            const payload = {
                ...albumData,
                is_published: albumData.is_published !== undefined ? albumData.is_published : true,
                cover_path: coverPath,
                created_by: user.id
            };

            const { data, error } = await window.supabaseClient
                .from('gallery_albums')
                .insert([payload])
                .select()
                .single();

            if (error) throw new Error(this.mapError(error.message));
            return data;
        },

        adminDeleteAlbum: async function (id) {
            const { data: album } = await window.supabaseClient.from('gallery_albums').select('cover_path').eq('id', id).maybeSingle();
            let pathsToRemove = [];
            
            if (album) {
                if (album.cover_path) pathsToRemove.push(album.cover_path);
                const { data: images } = await window.supabaseClient.from('gallery_images').select('storage_path').eq('album_id', id);
                if (images) {
                    images.forEach(img => {
                        if (img.storage_path) pathsToRemove.push(img.storage_path);
                    });
                }
            }

            const { error } = await window.supabaseClient
                .from('gallery_albums')
                .delete()
                .eq('id', id);

            if (error) throw new Error(this.mapError(error.message));
            
            if (pathsToRemove.length > 0) {
                await window.supabaseClient.storage.from(window.ZSphereConfig.BUCKET_NAME).remove(pathsToRemove);
            }
        },

        adminGetAlbumImages: async function (albumId) {
            if (!window.supabaseClient || !albumId) return [];

            const { data, error } = await window.supabaseClient
                .from('gallery_images')
                .select('*')
                .eq('album_id', albumId)
                .order('sort_order', { ascending: true });

            if (error) throw new Error(this.mapError(error.message));
            return data || [];
        },

        adminCreateGalleryImage: async function (albumId, file, altText, caption, sortOrder = 0) {
            const user = window.ZSphereAuthState.user;
            if (!user) throw new Error('Authentication required');

            const storagePath = await this.uploadPublicMedia(file, 'gallery', albumId);

            const payload = {
                album_id: albumId,
                storage_path: storagePath,
                alt_text: altText,
                caption: caption,
                sort_order: parseInt(sortOrder) || 0,
                is_published: true,
                created_by: user.id
            };

            const { data, error } = await window.supabaseClient
                .from('gallery_images')
                .insert([payload])
                .select()
                .single();

            if (error) throw new Error(this.mapError(error.message));
            return data;
        },

        adminDeleteGalleryImage: async function (imageId, storagePath) {
            const { error } = await window.supabaseClient
                .from('gallery_images')
                .delete()
                .eq('id', imageId);

            if (error) throw new Error(this.mapError(error.message));

            if (storagePath) {
                await window.supabaseClient.storage.from(window.ZSphereConfig.BUCKET_NAME).remove([storagePath]);
            }
        },

        adminGetTeamMembers: async function () {
            if (!window.supabaseClient) return [];

            const { data, error } = await window.supabaseClient
                .from('team_members')
                .select('*')
                .order('group_name', { ascending: true })
                .order('sort_order', { ascending: true });

            if (error) throw new Error(this.mapError(error.message));
            return data || [];
        },

        adminCreateTeamMember: async function (memberData, photoFile) {
            let photoPath = memberData.photo_path || null;
            if (photoFile) {
                photoPath = await this.uploadPublicMedia(photoFile, 'team', 'avatars');
            }

            const payload = {
                ...memberData,
                photo_path: photoPath
            };

            const { data, error } = await window.supabaseClient
                .from('team_members')
                .insert([payload])
                .select()
                .single();

            if (error) throw new Error(this.mapError(error.message));
            return data;
        },

        adminUpdateTeamMember: async function (id, memberData, photoFile) {
            let photoPath = memberData.photo_path;
            let oldPhotoPath = null;
            
            if (photoFile) {
                const { data: oldMem } = await window.supabaseClient.from('team_members').select('photo_path').eq('id', id).maybeSingle();
                if (oldMem && oldMem.photo_path) oldPhotoPath = oldMem.photo_path;
                photoPath = await this.uploadPublicMedia(photoFile, 'team', 'avatars');
            }

            const payload = { ...memberData };
            if (photoPath !== undefined) payload.photo_path = photoPath;

            const { data, error } = await window.supabaseClient
                .from('team_members')
                .update(payload)
                .eq('id', id)
                .select()
                .single();

            if (error) {
                if (photoFile && photoPath) {
                    await window.supabaseClient.storage.from(window.ZSphereConfig.BUCKET_NAME).remove([photoPath]);
                }
                throw new Error(this.mapError(error.message));
            }
            
            if (oldPhotoPath) {
                await window.supabaseClient.storage.from(window.ZSphereConfig.BUCKET_NAME).remove([oldPhotoPath]);
            }
            return data;
        },

        adminDeleteTeamMember: async function (id) {
            const { data: member } = await window.supabaseClient.from('team_members').select('photo_path').eq('id', id).maybeSingle();
            
            const { error } = await window.supabaseClient
                .from('team_members')
                .delete()
                .eq('id', id);

            if (error) throw new Error(this.mapError(error.message));
            
            if (member && member.photo_path) {
                await window.supabaseClient.storage.from(window.ZSphereConfig.BUCKET_NAME).remove([member.photo_path]);
            }
        }
    };
})();
