// Nexora.AI Authentication Flow
(() => {
  const config = window.NEXORA_CONFIG || window.CONFIG || {};
  const supabaseUrl = config.SUPABASE_URL || 'YOUR_SUPABASE_URL_HERE';
  const supabaseAnonKey = config.SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY_HERE';

  if (!window.supabase) {
    console.error('Supabase SDK was not loaded. Check the CDN script in pages/login/index.html.');
    return;
  }

  const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

  const isFileProtocol = window.location.protocol === 'file:';
  const toChat = () => {
    const target = isFileProtocol
      ? new URL('../chat/index.html', window.location.href).href
      : (config.ROUTES?.CHAT || '/pages/chat/index.html');
    window.location.replace(target);
  };

  const toSignup = () => {
    const target = isFileProtocol
      ? new URL('../sign-up/index.html', window.location.href).href
      : '/pages/sign-up/index.html';
    window.location.href = target;
  };

  const toForgotPassword = () => {
    const email = emailInput?.value.trim();
    const target = isFileProtocol
      ? new URL('../forgot-password/index.html', window.location.href)
      : new URL(config.ROUTES?.FORGOT_PASSWORD || '/pages/forgot-password/index.html', window.location.origin);
    if (email && emailInput?.checkValidity()) target.searchParams.set('email', email);
    window.location.href = target.href;
  };

  const loginRedirectUrl = () => {
    return isFileProtocol
      ? new URL('./index.html', window.location.href).href
      : `${window.location.origin}${config.ROUTES?.LOGIN || '/pages/login/index.html'}`;
  };

  const $ = (id) => document.getElementById(id);
  const loginForm = $('loginForm');
  const emailInput = $('email');
  const passwordInput = $('password');
  const forgotPasswordLink = $('forgotPasswordLink');
  const authModeToggle = $('authModeToggle');
  const authTitle = $('authTitle');
  const authSubtitle = $('authSubtitle');
  const authSubmitText = $('authSubmitText');
  const authSwitchText = $('authSwitchText');

  const params = new URLSearchParams(window.location.search);
  let mode = (params.get('mode') === 'signup' || window.location.pathname.toLowerCase().includes('signup')) ? 'signup' : 'login';

  const notify = (message) => {
    if (typeof showToast === 'function') showToast(message);
    else console.log(message);
  };

  function renderMode() {
    const isSignup = mode === 'signup';
    if (authTitle) authTitle.innerHTML = isSignup ? 'Create account <span class="wave">✨</span>' : 'Welcome back <span class="wave">👋</span>';
    if (authSubtitle) authSubtitle.textContent = isSignup ? 'Sign up to start creating with Nexora AI' : 'Login to continue to Nexora AI';
    if (authSubmitText) authSubmitText.textContent = isSignup ? 'Create Nexora AI account' : 'Login to Nexora AI';
    if (authSwitchText) authSwitchText.textContent = isSignup ? 'Already have an account?' : "Don't have an account?";
    if (authModeToggle) authModeToggle.textContent = isSignup ? 'Login' : 'Sign up';
    if (passwordInput) passwordInput.autocomplete = isSignup ? 'new-password' : 'current-password';
  }

  renderMode();

  function syncModeUrl() {
    const nextUrl = isFileProtocol
      ? `${window.location.pathname}${mode === 'signup' ? '?mode=signup' : ''}`
      : (mode === 'signup' ? (config.ROUTES?.SIGNUP || '/signup') : (config.ROUTES?.LOGIN || '/login'));
    window.history.replaceState({}, '', nextUrl);
  }

  authModeToggle?.addEventListener('click', (event) => {
    event.preventDefault();
    toSignup();
  });

  // Existing Supabase session or OAuth callback should always land in chat.
  supabaseClient.auth.getSession().then(({ data: { session } }) => {
    if (session) toChat();
  }).catch((error) => {
    console.error('Session check failed:', error);
  });

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
      toChat();
    }
  });

  const providerMap = {
    google: 'google',
    github: 'github'
  };

  function setupOAuth(providerName, selector) {
    const button = document.querySelector(selector);
    if (!button) return;

    button.addEventListener('click', async (event) => {
      event.preventDefault();
      const provider = providerMap[providerName.toLowerCase()];
      if (!provider) return notify(`${providerName} is not configured.`);

      notify(`Opening ${providerName} sign-in...`);
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: loginRedirectUrl(),
          queryParams: provider === 'google' ? { access_type: 'offline', prompt: 'consent' } : undefined
        }
      });

      if (error) {
        console.error(`${providerName} sign-in error:`, error.message);
        notify(`${providerName} sign-in failed: ${error.message}`);
      }
    });
  }

  setupOAuth('Google', '.social[data-message*="Google"]');
  setupOAuth('GitHub', '.social[data-message*="GitHub"]');

  forgotPasswordLink?.addEventListener('click', (event) => {
    event.preventDefault();
    toForgotPassword();
  });

  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = emailInput?.value.trim();
    const password = passwordInput?.value || '';

    if (!email) return notify('Please enter your email.');
    if (!emailInput.checkValidity()) return notify('Please enter a valid email.');
    if (!password) return notify('Please enter your password.');
    if (mode === 'signup' && password.length < 6) return notify('Password must be at least 6 characters.');

    notify(mode === 'signup' ? 'Creating account...' : 'Logging in...');

    if (mode === 'signup') {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: loginRedirectUrl() }
      });

      if (error) {
        console.error('Sign-up error:', error.message);
        notify(`Sign-up failed: ${error.message}`);
        return;
      }

      if (data.session) {
        notify('Account created. Opening chat...');
        toChat();
      } else {
        notify('Account created. Please verify your email, then log in.');
        mode = 'login';
        syncModeUrl();
        renderMode();
      }
      return;
    }

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
      console.error('Login error:', error.message);
      notify(`Login failed: ${error.message}`);
      return;
    }

    notify('Logged in successfully. Opening chat...');
    toChat();
  });
})();
