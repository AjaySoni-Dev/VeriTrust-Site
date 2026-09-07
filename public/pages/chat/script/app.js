// Nexora.AI Chat Page Interactivity & Logic

// Browser runtime configuration is initialized in script/config.js.
// The fallbacks below keep this app file safe even if it is loaded directly.
const NEXORA_CHAT_CONFIG = window.NexoraChatConfig || {};
const NEXORA_RUNTIME_CONFIG = NEXORA_CHAT_CONFIG.runtime || window.NEXORA_CONFIG || window.CONFIG || {};
const OPENROUTER_API_URL = NEXORA_CHAT_CONFIG.openRouter?.apiUrl || NEXORA_RUNTIME_CONFIG.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_PROXY_URL = NEXORA_CHAT_CONFIG.openRouter?.proxyUrl || NEXORA_RUNTIME_CONFIG.OPENROUTER_PROXY_URL || '/api/openrouter';
const OPENROUTER_API_KEY = NEXORA_CHAT_CONFIG.openRouter?.apiKey || NEXORA_RUNTIME_CONFIG.OPENROUTER_API_KEY || ''; // local-only fallback
const OPENROUTER_APP_TITLE = NEXORA_CHAT_CONFIG.openRouter?.appTitle || 'Nexora AI';
const WEB_PROJECT_SCHEMA = NEXORA_CHAT_CONFIG.schemas?.webProject || 'nexora.web-project';
const PAGE_DOCUMENT_SCHEMA = NEXORA_CHAT_CONFIG.schemas?.pageDocument || 'nexora.page-document';
const VISUAL_DOCUMENT_SCHEMA = NEXORA_CHAT_CONFIG.schemas?.visualDocument || 'nexora.visual-document';
const VISUAL_BLUEPRINT_SCHEMA = NEXORA_CHAT_CONFIG.schemas?.visualBlueprint || 'nexora.visual-blueprint';
const AI_WEBSITE_BUNDLE_SCHEMA = NEXORA_CHAT_CONFIG.schemas?.aiWebsiteBundle || 'nexora.ai-website-bundle';
const VISUAL_DOCUMENT_STORAGE_KEY = NEXORA_CHAT_CONFIG.storage?.pendingVisualDocument || 'nexora_pending_visual_document';
const GENERATED_PROJECT_STORAGE_KEY = NEXORA_CHAT_CONFIG.storage?.pendingGeneratedProject || 'nexora_pending_generated_project';
const UNIVERSAL_PAGE_STORAGE_KEY = NEXORA_CHAT_CONFIG.storage?.pendingUniversalPage || 'nexora_pending_universal_page';
const WEB_PROJECT_STORAGE_KEY = NEXORA_CHAT_CONFIG.storage?.pendingWebProject || 'nexora_pending_web_project';
const PAGE_DOCUMENT_STORAGE_KEY = NEXORA_CHAT_CONFIG.storage?.pendingPageDocument || 'nexora_pending_page_document';
const EDITOR_HANDOFF_STORAGE_KEY = NEXORA_CHAT_CONFIG.storage?.pendingEditorHandoff || 'nexora_pending_editor_handoff_v5';
const NEXORA_WEB_PROJECT = window.NexoraWebProject || null;
const NEXORA_PAGE_DOCUMENT = window.NexoraPageDocument || null;
const NEXORA_VISUAL_DOCUMENT = window.NexoraVisualDocument || null;
const NEXORA_MODULAR_PIPELINE = window.NexoraModularJsonPipeline || null;
const NEXORA_STORAGE = window.NexoraStorageBridge || {
  get: (key, fallback = null) => { try { const value = localStorage.getItem(key); return value === null ? fallback : value; } catch { return fallback; } },
  set: (key, value) => { try { localStorage.setItem(key, value); return true; } catch { return false; } },
  getJSON: (key, fallback = null) => { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; } catch { return fallback; } },
  setJSON: (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
};

document.addEventListener('DOMContentLoaded', () => {
  document.body.classList.add('is-hydrating');
  document.body.classList.add('history-is-loading', 'profile-is-loading');
  // DOM Elements
  const sidebar = document.getElementById('sidebar');
  const btnCollapse = document.getElementById('btnCollapse');
  const btnMenuToggle = document.getElementById('btnMenuToggle');
  const mobileOverlay = document.getElementById('mobileOverlay');
  const btnNewChat = document.getElementById('btnNewChat');
  const logoLink = document.getElementById('logoLink');
  const searchInput = document.getElementById('searchInput');
  const chatInput = document.getElementById('chatInput');
  const btnSend = document.getElementById('btnSend');
  const welcomeScreen = document.getElementById('welcomeScreen');
  const chatMessages = document.getElementById('chatMessages');
  const historyLinks = document.querySelectorAll('.history-link');
  const quickPills = document.querySelectorAll('.btn-pill');
  const btnModelPicker = document.getElementById('btnModelPicker');
  const modelMenu = document.getElementById('modelMenu');
  const modelItems = document.querySelectorAll('.model-item');
  const selectedModelLabel = document.getElementById('selectedModelLabel');
  const btnThinkingMode = document.getElementById('btnThinkingMode');
  const reasoningEffortSelect = document.getElementById('reasoningEffortSelect');
  const btnReasoningPicker = document.getElementById('btnReasoningPicker');
  const selectedReasoningLabel = document.getElementById('selectedReasoningLabel');
  const reasoningMenu = document.getElementById('reasoningMenu');
  const btnVoice = document.getElementById('btnVoice');
  const btnUpload = document.getElementById('btnUpload');
  const historyListToday = document.getElementById('historyListToday');
  const themeToggle = document.getElementById('themeToggle');
  const themeText = document.getElementById('themeText');
  const MODEL_STORAGE_KEY = 'nexora-selected-openrouter-model';
  const THINKING_MODE_STORAGE_KEY = 'nexora-thinking-mode-enabled';
  const REASONING_EFFORT_STORAGE_KEY = 'nexora-reasoning-effort';
  const AGENT_PROVIDER_STORAGE_KEY = 'nexora.agent.provider';
  const AGENT_API_KEY_STORAGE = {
    openrouter: 'nexora.agent.openrouter.apiKey',
    nvidia: 'nexora.agent.nvidia.apiKey'
  };
  const AGENT_MODEL_STORAGE = {
    openrouter: 'nexora.agent.openrouter.model',
    nvidia: 'nexora.agent.nvidia.model',
    codex: 'nexora.agent.codex.model'
  };
  const AGENT_BASE_URL_STORAGE = {
    openrouter: 'nexora.agent.openrouter.baseUrl',
    nvidia: 'nexora.agent.nvidia.baseUrl'
  };
  const AGENT_DEFAULT_BASE_URL = {
    openrouter: 'https://openrouter.ai/api/v1',
    nvidia: 'https://integrate.api.nvidia.com/v1',
    codex: ''
  };
  let activeAgentProjectId = null;
  let activeAgentRunId = null;
  let currentGeneratedProject = null;
  let activeConversationPlanCard = null;
  let activeThinkingBubble = null;
  let thinkingModeEnabled = NEXORA_STORAGE.get(THINKING_MODE_STORAGE_KEY, 'true') !== 'false';
  let selectedReasoningEffort = String(NEXORA_STORAGE.get(REASONING_EFFORT_STORAGE_KEY, 'medium') || 'medium').trim().toLowerCase();
  let liveModelsProvider = '';
  let codexRuntimeState = { configured: false, connected: false, account_email: null, plan_type: null, models: [], verified_at: null };
  let codexLoginController = null;
  
  // Pro Plan DOM Elements
  const btnProPlan = document.querySelector('.btn-pro-plan');
  const proPlanModal = document.getElementById('proPlanModal');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const btnClaimPro = document.getElementById('btnClaimPro');
  const profilePlanText = document.querySelector('.profile-plan');
  const chatInputContainer = document.querySelector('.chat-input-container');
  const composerPlanTracker = document.getElementById('composerPlanTracker');
  const composerPlanProgress = document.getElementById('composerPlanProgress');
  const composerPlanSummary = document.getElementById('composerPlanSummary');
  const composerPlanDiff = document.getElementById('composerPlanDiff');
  const composerPlanToggle = document.getElementById('composerPlanToggle');
  const composerPlanDetails = document.getElementById('composerPlanDetails');
  const composerPlanDetailsList = document.getElementById('composerPlanDetailsList');
  const composerPlanDetailsMeta = document.getElementById('composerPlanDetailsMeta');
  const composerPlanDetailsClose = document.getElementById('composerPlanDetailsClose');
  const chatContentWrapper = document.querySelector('.chat-content-wrapper');
  const generationInspector = document.getElementById('generationInspector');
  const generationInspectorToggle = document.getElementById('generationInspectorToggle');
  const generationInspectorTitle = document.getElementById('generationInspectorTitle');
  const generationInspectorStatus = document.getElementById('generationInspectorStatus');
  const generationThinkingTokens = document.getElementById('generationThinkingTokens');
  const generationOutputTokens = document.getElementById('generationOutputTokens');
  const generationProgressBar = document.getElementById('generationProgressBar');
  const generationPlanBlock = document.getElementById('generationPlanBlock');
  const generationPlanList = document.getElementById('generationPlanList');
  const generationEventLog = document.getElementById('generationEventLog');
  const workspaceTitle = document.getElementById('workspaceTitle');

  const navTemplates = document.getElementById('navTemplates');
  const templatesScreen = document.getElementById('templatesScreen');
  const templatesGrid = document.getElementById('templatesGrid');
  const templatesSearchInput = document.getElementById('templatesSearchInput');

  const navProjects = document.getElementById('navProjects');
  const projectsScreen = document.getElementById('projectsScreen');
  const projectsGrid = document.getElementById('projectsGrid');
  const projectsEmptyState = document.getElementById('projectsEmptyState');
  const btnCreateProject = document.getElementById('btnCreateProject');
  const btnEmptyCreateProject = document.getElementById('btnEmptyCreateProject');

  // Library DOM Elements
  const navLibrary = document.getElementById('navLibrary');
  const libraryScreen = document.getElementById('libraryScreen');
  const libraryGrid = document.getElementById('libraryGrid');
  const librarySearchInput = document.getElementById('librarySearchInput');

  // Settings and Archive DOM Elements
  const navSettings = document.getElementById('navSettings');
  const settingsScreen = document.getElementById('settingsScreen');
  const profileSettingsForm = document.getElementById('profileSettingsForm');
  const profileNameInput = document.getElementById('profileNameInput');
  const profileEmailInput = document.getElementById('profileEmailInput');
  const profileAvatarInput = document.getElementById('profileAvatarInput');
  const profileSaveStatus = document.getElementById('profileSaveStatus');
  const profilePhotoInput = document.getElementById('profilePhotoInput');
  const btnProfilePhoto = document.getElementById('btnProfilePhoto');
  const userProfileButton = document.getElementById('userProfileButton');
  const profileDropup = document.getElementById('profileDropup');
  const profileDropupForm = document.getElementById('profileDropupForm');
  const dropupProfileNameInput = document.getElementById('dropupProfileNameInput');
  const dropupProfileEmailInput = document.getElementById('dropupProfileEmailInput');
  const dropupProfileAvatarInput = document.getElementById('dropupProfileAvatarInput');
  const profileDropupPhotoInput = document.getElementById('profileDropupPhotoInput');
  const btnDropupPhoto = document.getElementById('btnDropupPhoto');
  const profileDropupStatus = document.getElementById('profileDropupStatus');
  const btnDropupSettings = document.getElementById('btnDropupSettings');
  const btnDropupSignOut = document.getElementById('btnDropupSignOut');
  const emailNotificationsToggle = document.getElementById('emailNotificationsToggle');
  const btnOpenArchive = document.getElementById('btnOpenArchive');
  const archiveScreen = document.getElementById('archiveScreen');
  const btnBackToSettings = document.getElementById('btnBackToSettings');
  const archiveGrid = document.getElementById('archiveGrid');
  const agentProviderSelect = document.getElementById('agentProviderSelect');
  const agentApiKeyInput = document.getElementById('agentApiKeyInput');
  const agentBaseUrlInput = document.getElementById('agentBaseUrlInput');
  const agentModelSelect = document.getElementById('agentModelSelect');
  const agentModelPathInput = document.getElementById('agentModelPathInput');
  const agentRuntimeStatus = document.getElementById('agentRuntimeStatus');
  const btnAgentLoadModels = document.getElementById('btnAgentLoadModels');
  const btnAgentTestModel = document.getElementById('btnAgentTestModel');
  const btnAgentSaveConfig = document.getElementById('btnAgentSaveConfig');
  const btnAgentToggleKey = document.getElementById('btnAgentToggleKey');
  const agentApiKeyField = document.getElementById('agentApiKeyField');
  const agentBaseUrlField = document.getElementById('agentBaseUrlField');
  const agentRuntimeNote = document.getElementById('agentRuntimeNote');
  const codexAccountPanel = document.getElementById('codexAccountPanel');
  const codexAccountDot = document.getElementById('codexAccountDot');
  const codexAccountTitle = document.getElementById('codexAccountTitle');
  const codexAccountSubtitle = document.getElementById('codexAccountSubtitle');
  const btnCodexConnect = document.getElementById('btnCodexConnect');
  const btnCodexDisconnect = document.getElementById('btnCodexDisconnect');
  const codexDeviceCodeBox = document.getElementById('codexDeviceCodeBox');
  const codexDeviceCode = document.getElementById('codexDeviceCode');
  const btnCodexCopyCode = document.getElementById('btnCodexCopyCode');
  const codexVerificationLink = document.getElementById('codexVerificationLink');

  const newProjectModal = document.getElementById('newProjectModal');
  const btnCloseNewProjectModal = document.getElementById('btnCloseNewProjectModal');
  const btnCancelNewProject = document.getElementById('btnCancelNewProject');
  const btnSubmitNewProject = document.getElementById('btnSubmitNewProject');
  const btnAddSourcesLater = document.getElementById('btnAddSourcesLater');
  const newProjectName = document.getElementById('newProjectName');
  const newProjectInstructions = document.getElementById('newProjectInstructions');
  const newProjectSources = document.getElementById('newProjectSources');
  const btnUploadSourceFile = document.getElementById('btnUploadSourceFile');
  const sourceFileInput = document.getElementById('sourceFileInput');
  const sourceFileList = document.getElementById('sourceFileList');

  // Supabase auth guard: unauthenticated users go back to Login.
  const config = NEXORA_RUNTIME_CONFIG;
  const supabaseBridge = window.NexoraSupabaseBridge;
  const hasSupabaseConfig = supabaseBridge
    ? supabaseBridge.hasUsableSupabaseConfig(config)
    : Boolean(
      config.SUPABASE_URL &&
      config.SUPABASE_ANON_KEY &&
      !String(config.SUPABASE_URL).includes('YOUR_SUPABASE') &&
      !String(config.SUPABASE_ANON_KEY).includes('YOUR_SUPABASE')
    );
  const supabaseClient = supabaseBridge
    ? supabaseBridge.createClient(config)
    : ((window.supabase?.createClient && hasSupabaseConfig)
      ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY)
      : null);
  const routeConfig = supabaseBridge?.getRoutes(config) || {
    isFileProtocol: window.location.protocol === 'file:',
    loginRoute: window.location.protocol === 'file:'
      ? new URL('../login/index.html', window.location.href).href
      : (config.ROUTES?.LOGIN || '/pages/login/index.html'),
    templateRoute: window.location.protocol === 'file:'
      ? new URL('../template/template.html', window.location.href).href
      : (config.ROUTES?.TEMPLATE || '/template')
  };
  const isFileProtocol = routeConfig.isFileProtocol;
  const loginRoute = routeConfig.loginRoute;
  const templateRoute = routeConfig.templateRoute;

  const appState = {
    user: null,
    profile: null,
    preferences: null,
    billing: null,
    selectedTemplate: null,
    databaseErrors: [],
    storageKey: 'nexora-workspace:local',
    ready: !supabaseClient
  };

  let activeChatId = null;
  const chatDatabase = {};
  const defaultTemplates = [
    { title: "Landing Page", desc: "A sleek, dark-themed responsive landing page with a hero section.", icon: "WEB", source_url: "nexora://template/landing-page" },
    { title: "E-commerce App", desc: "Modern web store frontend with cart and checkout layout.", icon: "SHOP", source_url: "nexora://template/ecommerce" },
    { title: "Analytics Dashboard", desc: "Analytics dashboard template with charts and data tables.", icon: "DATA", source_url: "nexora://template/analytics" },
    { title: "Developer Portfolio", desc: "Minimalist portfolio to showcase your work and GitHub repos.", icon: "DEV", source_url: "nexora://template/portfolio" },
    { title: "SaaS Platform", desc: "Complete SaaS layout with sidebar, header, and pricing page.", icon: "SAAS", source_url: "nexora://template/saas" },
    { title: "Blog Layout", desc: "Clean typography-focused blog template for content creators.", icon: "POST", source_url: "nexora://template/blog" },
    { title: "Authentication Flow", desc: "Login, register, and forgot password screens.", icon: "AUTH", source_url: "nexora://template/authentication" },
    { title: "Settings Page", desc: "User profile and application settings layouts.", icon: "SET", source_url: "nexora://template/settings" },
  ];
  let templateDatabase = [...defaultTemplates];
  let conversationList = [];
  let projectDatabase = [];
  let deploymentDatabase = [];
  let libraryDatabase = [];
  let archiveDatabase = [];
  let workspacePersistTimer = null;
  let workspacePersistPending = false;
  let activeGenerationController = null;
  let activeGenerationStopped = false;
  let historyExpanded = false;
  let pendingProjectLinkId = null;
  let voiceRecorder = null;
  let voiceStream = null;
  let voiceChunks = [];
  let voiceStartedAt = 0;
  let voiceTimer = null;
  let voiceAutoStopTimer = null;
  let isListeningForSpeech = false;
  let isTranscribingSpeech = false;
  const VOICE_MAX_RECORDING_MS = 90 * 1000;
  const VOICE_TARGET_SAMPLE_RATE = 16000;

  const sendButtonMarkup = btnSend?.innerHTML || '';
  const stopButtonMarkup = `
    <span class="stop-icon" aria-hidden="true"></span>
  `;
  const mobileHistoryMedia = window.matchMedia('(max-width: 700px)');
  const compactPlaceholderMedia = window.matchMedia('(max-width: 420px)');
  const defaultChatPlaceholder = 'Message Nexora.AI...';
  const compactChatPlaceholder = 'Ask Nexora anything...';
  const HISTORY_PREVIEW_LIMIT = 5;
  const STORAGE_BUCKETS = Object.freeze({
    avatars: 'avatars',
    projectAssets: 'project-assets',
    projectPayloads: 'project-payloads'
  });
  const STORAGE_URI_PREFIX = 'supabase://';
  const MAX_INLINE_UPLOAD_TEXT_BYTES = 512 * 1024;

  function normalizeModelConfig(model, index = 0) {
    if (typeof model === 'string') {
      return {
        id: model,
        label: model,
        premium: false,
        default: index === 0,
        reasoning: null,
        supportedParameters: [],
        supportedReasoningEfforts: [],
        defaultReasoningEffort: null
      };
    }
    const id = String(model?.id || model?.model || model?.value || '').trim();
    const label = String(model?.label || model?.name || id || 'Model').trim();
    return {
      id,
      label,
      premium: Boolean(model?.premium || model?.requiresPaidPlan),
      default: Boolean(model?.default || model?.isDefault) || index === 0,
      reasoning: model?.reasoning || null,
      supportedParameters: Array.isArray(model?.supported_parameters) ? model.supported_parameters : (Array.isArray(model?.supportedParameters) ? model.supportedParameters : []),
      supportedReasoningEfforts: Array.isArray(model?.supportedReasoningEfforts)
        ? model.supportedReasoningEfforts
        : (Array.isArray(model?.supported_reasoning_efforts) ? model.supported_reasoning_efforts : []),
      defaultReasoningEffort: model?.defaultReasoningEffort || model?.default_reasoning_effort || null
    };
  }

  const rememberedInitialModel = String(NEXORA_STORAGE.get(MODEL_STORAGE_KEY, '') || '').trim();
  let configuredModels = [];
  let selectedOpenRouterModel = rememberedInitialModel
    ? { id: rememberedInitialModel, label: rememberedInitialModel, premium: false, reasoning: null, supportedParameters: [], supportedReasoningEfforts: [], defaultReasoningEffort: null }
    : { id: '', label: 'Select model', premium: false, reasoning: null, supportedParameters: [], supportedReasoningEfforts: [], defaultReasoningEffort: null };

  function selectedCheckIconMarkup() {
    return `
      <svg class="selected-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    `;
  }

  function lockIconMarkup() {
    return `
      <svg class="lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
      </svg>
    `;
  }

  function getSelectedOpenRouterModel() {
    return selectedOpenRouterModel?.id || '';
  }

  function getActiveProviderModelId() {
    try {
      return String(getAgentRuntimeConfig?.().modelId || getSelectedOpenRouterModel() || '').trim();
    } catch {
      return String(getSelectedOpenRouterModel() || '').trim();
    }
  }

  function getHistoryPreviewLimit() {
    return HISTORY_PREVIEW_LIMIT;
  }

  function updateChatInputPlaceholder() {
    if (!chatInput) return;
    chatInput.placeholder = compactPlaceholderMedia.matches ? compactChatPlaceholder : defaultChatPlaceholder;
  }

  function resizeChatInput() {
    if (!chatInput) return;
    const minHeight = mobileHistoryMedia.matches ? 32 : 22;
    if (!chatInput.value.trim()) {
      chatInput.style.height = `${minHeight}px`;
      return;
    }
    chatInput.style.height = 'auto';
    chatInput.style.height = `${Math.max(minHeight, chatInput.scrollHeight)}px`;
  }

  function renderHydratedShell() {
    renderProfile();
    renderSettings();
    renderHistoryList();
    renderProjects();
    renderLibrary();
    document.body.classList.remove('is-hydrating');
  }

  updateChatInputPlaceholder();
  resizeChatInput();

  mobileHistoryMedia.addEventListener?.('change', () => {
    if (!historyExpanded) renderHistoryList();
    resizeChatInput();
  });
  compactPlaceholderMedia.addEventListener?.('change', () => {
    updateChatInputPlaceholder();
    resizeChatInput();
  });

  async function loadSignedInUser() {
    if (!supabaseClient) {
      loadLocalWorkspace();
      document.body.classList.remove('history-is-loading', 'profile-is-loading');
      renderHydratedShell();
      restoreActiveChatFromStorage();
      return;
    }

    let session = null;
    let error = null;
    try {
      const authResult = await withTimeout(
        supabaseClient.auth.getSession(),
        4000,
        'auth.getSession'
      );
      session = authResult?.data?.session || null;
      error = authResult?.error || null;
    } catch (authError) {
      recordDatabaseError('auth.getSession', authError);
      window.location.replace(loginRoute);
      return;
    }
    if (error || !session) {
      window.location.replace(loginRoute);
      return;
    }

    appState.user = session.user;
    appState.storageKey = `nexora-workspace:${session.user.id}`;
    appState.databaseErrors = [];
    activeChatId = null;
    currentGeneratedProject = null;
    activeConversationPlanCard = null;
    activeThinkingBubble = null;
    conversationList = [];
    projectDatabase = [];
    deploymentDatabase = [];
    libraryDatabase = [];
    archiveDatabase = [];
    Object.keys(chatDatabase).forEach(key => delete chatDatabase[key]);

    loadLocalWorkspace();
    renderHydratedShell();

    const rpcLoaded = await loadWorkspaceBootstrapFromRpc(session.user);
    if (rpcLoaded) {
      document.body.classList.remove('history-is-loading', 'profile-is-loading');
      hydrateMissingAccountRowsInBackground(session.user);
      hydrateProjectPayloadsInBackground();
      await migrateLegacyWorkspaceToDatabase(readLocalWorkspaceSnapshot());
      appState.ready = true;
      renderHydratedShell();
      persistWorkspace({ immediate: true });
      restoreActiveChatFromStorage();
      return;
    }

    const accountLoad = Promise.allSettled([
      ensureProfile(session.user),
      ensureUserPreferences(session.user.id),
      ensureBilling(session.user.id)
    ]).then(() => {
      document.body.classList.remove('profile-is-loading');
      renderProfile();
      renderSettings();
    });

    const workspaceLoad = Promise.allSettled([
      loadTemplatesFromDatabase(),
      loadProjectsFromDatabase(),
      loadConversationsFromDatabase()
    ]).then(() => {
      document.body.classList.remove('history-is-loading');
      renderHistoryList();
      hydrateProjectPayloadsInBackground();
    });

    await Promise.allSettled([accountLoad, workspaceLoad]);

    appState.ready = true;
    renderHydratedShell();
    await migrateLegacyWorkspaceToDatabase(readLocalWorkspaceSnapshot());
    if (projectDatabase.length) persistWorkspace();
  }

  async function signOutAndReturnToLogin() {
    if (supabaseClient) await supabaseClient.auth.signOut();
    window.location.replace(loginRoute);
  }

  document.getElementById('btnSignOut')?.addEventListener('click', signOutAndReturnToLogin);
  btnDropupSignOut?.addEventListener('click', signOutAndReturnToLogin);

  function closeProfileDropup() {
    profileDropup?.classList.remove('open');
    profileDropup?.setAttribute('aria-hidden', 'true');
    userProfileButton?.setAttribute('aria-expanded', 'false');
  }

  function updateWorkspaceShell({ panelOpen = false, activeNav = null, title = 'New website' } = {}) {
    chatContentWrapper?.classList.toggle('panel-open', panelOpen);
    if (workspaceTitle) workspaceTitle.textContent = title;
    [navProjects, navLibrary, navTemplates, navSettings].forEach(nav => {
      const isActive = nav === activeNav;
      nav?.classList.toggle('active', isActive);
      if (isActive) nav.setAttribute('aria-current', 'page');
      else nav?.removeAttribute('aria-current');
    });
  }

  function showWorkspacePanel(screen, activeNav, title, render) {
    welcomeScreen.style.display = 'none';
    chatMessages.style.display = 'none';
    [templatesScreen, projectsScreen, libraryScreen, settingsScreen, archiveScreen].forEach(candidate => {
      if (candidate) candidate.style.display = candidate === screen ? 'flex' : 'none';
    });
    updateWorkspaceShell({ panelOpen: true, activeNav, title });
    animateTabScreen(screen);
    render?.();
    sidebar.classList.remove('open');
    mobileOverlay.classList.remove('visible');
  }

  function openSettingsScreen() {
    showWorkspacePanel(settingsScreen, navSettings, 'Settings', renderSettings);
  }

  userProfileButton?.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = profileDropup?.classList.toggle('open');
    profileDropup?.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    userProfileButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    if (isOpen && document.body.classList.contains('profile-is-loading')) return;
    renderProfile();
  });

  profileDropup?.addEventListener('click', event => {
    event.stopPropagation();
  });

  document.addEventListener('click', closeProfileDropup);

  btnDropupSettings?.addEventListener('click', () => {
    closeProfileDropup();
    openSettingsScreen();
  });

  btnProfilePhoto?.addEventListener('click', () => profilePhotoInput?.click());
  btnDropupPhoto?.addEventListener('click', () => profileDropupPhotoInput?.click());
  profilePhotoInput?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (file) await applyProfilePhoto(file, profileAvatarInput, profileSaveStatus);
  });
  profileDropupPhotoInput?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (file) await applyProfilePhoto(file, dropupProfileAvatarInput, profileDropupStatus);
  });

  profileSettingsForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await saveProfileFromInputs({
      nameInput: profileNameInput,
      emailInput: profileEmailInput,
      avatarInput: profileAvatarInput,
      statusNode: profileSaveStatus
    });
  });

  profileDropupForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await saveProfileFromInputs({
      nameInput: dropupProfileNameInput,
      emailInput: dropupProfileEmailInput,
      avatarInput: dropupProfileAvatarInput,
      statusNode: profileDropupStatus
    });
  });

  emailNotificationsToggle?.addEventListener('change', async () => {
    const enabled = emailNotificationsToggle.checked;
    appState.preferences = {
      ...(appState.preferences || {}),
      user_id: appState.user?.id,
      theme: document.body.classList.contains('light') ? 'light' : 'dark',
      email_notifications: enabled
    };
    if (supabaseClient && appState.preferences?.id) {
      const { data, error } = await supabaseClient
        .from('user_preferences')
        .update({ email_notifications: enabled, updated_at: new Date().toISOString() })
        .eq('id', appState.preferences.id)
        .select()
        .maybeSingle();
      if (error) recordDatabaseError('user_preferences.update_notifications', error);
      if (data) appState.preferences = data;
    }
    renderSettings();
    persistWorkspace();
  });

  const THEME_STORAGE_KEY = 'nexora-theme';

  function readStoredTheme() {
    try {
      return NEXORA_STORAGE.get(THEME_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  function storeTheme(theme) {
    try {
      NEXORA_STORAGE.set(THEME_STORAGE_KEY, theme);
    } catch {}
  }

  function applyTheme(theme) {
    const isLight = theme === 'light';
    document.body.classList.toggle('light', isLight);
    if (themeText) themeText.textContent = isLight ? 'Light' : 'Dark';
    return isLight;
  }

  applyTheme(readStoredTheme() === 'light' ? 'light' : 'dark');

  themeToggle?.addEventListener('click', async () => {
    const nextTheme = document.body.classList.contains('light') ? 'dark' : 'light';
    applyTheme(nextTheme);
    storeTheme(nextTheme);
    if (appState.preferences?.id && supabaseClient) {
      const { error } = await supabaseClient
        .from('user_preferences')
        .update({ theme: nextTheme, updated_at: new Date().toISOString() })
        .eq('id', appState.preferences.id);
      if (error) recordDatabaseError('user_preferences.update_theme', error);
      if (!error) appState.preferences.theme = nextTheme;
    }
    renderSettings();
    persistWorkspace();
  });

  function consumeWorkspaceRouteIntent() {
    let url;
    try {
      url = new URL(window.location.href);
    } catch {
      return;
    }

    let storedSelection = null;
    try {
      const raw = sessionStorage.getItem('nexora:selected-template');
      storedSelection = raw ? JSON.parse(raw) : null;
      const selectedAt = storedSelection?.selectedAt ? Date.parse(storedSelection.selectedAt) : 0;
      if (selectedAt && (Date.now() - selectedAt) > 2 * 60 * 60 * 1000) {
        sessionStorage.removeItem('nexora:selected-template');
        storedSelection = null;
      }
    } catch {}

    const templatePrompt = String(url.searchParams.get('templatePrompt') || '').trim();
    const templateName = String(url.searchParams.get('template') || storedSelection?.name || '').trim();
    const templateId = String(url.searchParams.get('templateId') || storedSelection?.id || '').trim();
    const templateVersion = String(url.searchParams.get('templateVersion') || storedSelection?.version || '').trim();
    const templateTier = String(url.searchParams.get('templateTier') || storedSelection?.tier || '').trim();
    const templateCategory = String(url.searchParams.get('templateCategory') || storedSelection?.category || '').trim();
    const panel = String(url.searchParams.get('panel') || '').trim().toLowerCase();

    if (templateId) {
      appState.selectedTemplate = {
        id: templateId,
        version: templateVersion || '1.0.0',
        name: templateName || 'Selected template',
        tier: templateTier || 'Free',
        category: templateCategory || 'Template'
      };
    }

    if (templatePrompt || templateId) {
      resetToWelcome();
      const fallbackPrompt = templateName
        ? `Build my website using the “${templateName}” template as the starting implementation. Adapt it to my requirements while preserving its strongest layout, styling, hierarchy, responsive behavior, and interactions.`
        : 'Build my website using the selected Nexora template as the starting implementation and adapt it to my requirements.';
      chatInput.value = String(templatePrompt || fallbackPrompt).slice(0, 5000);
      chatInput.focus();
      resizeChatInput();
      if (templateName) showNexoraToast(`${templateName} selected. Its Supabase source package will be applied when you build.`, 'success', 5200);
    } else if (panel === 'templates') {
      showWorkspacePanel(templatesScreen, navTemplates, 'Templates', renderChatTemplates);
    } else if (panel === 'projects') {
      showWorkspacePanel(projectsScreen, navProjects, 'Projects', renderProjects);
    } else if (panel === 'library') {
      showWorkspacePanel(libraryScreen, navLibrary, 'Library', renderLibrary);
    } else if (panel === 'settings') {
      showWorkspacePanel(settingsScreen, navSettings, 'Settings', renderSettings);
    }

    const intentKeys = ['templatePrompt', 'template', 'templateId', 'templateVersion', 'templateTier', 'templateCategory', 'panel'];
    if (intentKeys.some(key => url.searchParams.has(key))) {
      intentKeys.forEach(key => url.searchParams.delete(key));
      try {
        window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
      } catch {}
    }
  }

  loadSignedInUser().then(() => {
    refreshLiveModelsForCurrentProvider({ quiet: true });
    consumeWorkspaceRouteIntent();
  }).catch((error) => {
    console.error('Workspace hydration failed:', error);
    if (!appState.user?.id) loadLocalWorkspace();
    document.body.classList.remove('history-is-loading', 'profile-is-loading');
    renderProfile();
    renderSettings();
    renderHistoryList();
    renderProjects();
    renderLibrary();
    restoreActiveChatFromStorage();
    consumeWorkspaceRouteIntent();
    document.body.classList.remove('is-hydrating');
  });

  // Legacy encoded template literals kept inert; live templates come from defaultTemplates/Supabase.
  /*
    { title: "Landing Page", desc: "A sleek, dark-themed responsive landing page with a hero section.", icon: "ðŸŒ" },
    { title: "E-commerce App", desc: "Modern web store frontend with cart and checkout layout.", icon: "ðŸ›’" },
    { title: "Analytics Dashboard", desc: "Analytics dashboard template with charts and data tables.", icon: "ðŸ“Š" },
    { title: "Developer Portfolio", desc: "Minimalist portfolio to showcase your work and github repos.", icon: "ðŸŽ¨" },
    { title: "SaaS Platform", desc: "Complete SaaS layout with sidebar, header, and pricing page.", icon: "ðŸš€" },
    { title: "Blog Layout", desc: "Clean typography-focused blog template for content creators.", icon: "ðŸ“" },
    { title: "Authentication Flow", desc: "Login, register, and forgot password screens.", icon: "ðŸ”’" },
    { title: "Settings Page", desc: "User profile and application settings layouts.", icon: "âš™ï¸" },
  */

  /* ==========================================================================
     IN-WORKSPACE TEMPLATE CATALOG (SUPABASE STORAGE)
     ========================================================================== */
  const templateCatalogState = {
    loading: false,
    error: null,
    catalog: [],
    query: '',
    tier: 'All',
    category: 'All',
    cache: new Map(),
    observer: null,
    activeTemplate: null,
    initialized: false
  };

  const CATEGORY_DESCRIPTIONS = {
    all: 'Explore all ready-to-use website templates across every category.',
    business: 'Clean corporate layouts, service highlights, trust proof, and client conversion flow.',
    dashboard: 'Metric visualization, data tables, quick action widgets, and system overview cards.',
    ecommerce: 'Product grids, merchandising highlights, sticky checkout actions, and shopping layouts.',
    event: 'Speaker schedules, ticket tiers, sponsor grids, venue highlights, and registration anchors.',
    'landing page': 'High-converting above-the-fold storytelling, feature comparisons, and CTA anchors.',
    personal: 'Personal brand showcases, creative portfolios, links, and personal stories.',
    portfolio: 'Visual project showcases, gallery layouts, case study presentations, and contact forms.',
    'real estate': 'Property listings, high-impact photo cards, filter toolbars, and inquiry forms.',
    restaurant: 'Menu showcases, opening hours, reservation triggers, and chef spotlights.',
    saas: 'Product demo previews, tiered pricing tables, customer reviews, and onboarding funnels.',
    tools: 'Interactive utilities, generator interfaces, configuration forms, and output previews.',
    other: 'Versatile starter frameworks for custom web products.'
  };

  function templateStorageSettings() {
    const bridge = window.NexoraSupabaseBridge;
    const runtimeConfig = bridge?.getEffectiveConfig?.(window.__NEXORA_APP_CONFIG__ || window.NEXORA_APP_CONFIG || {}) || config || {};
    const storageConfig = runtimeConfig.TEMPLATE_STORAGE || {};
    const supabaseUrl = String(runtimeConfig.SUPABASE_URL || '').replace(/\/+$/, '');
    const previewBucket = String(storageConfig.PREVIEW_BUCKET || 'template-previews').trim();
    const catalogPath = String(storageConfig.CATALOG_PATH || 'catalog.json').replace(/^\/+/, '');
    const version = String(storageConfig.CATALOG_VERSION || '').trim();
    return { supabaseUrl, previewBucket, catalogPath, version };
  }

  function encodeStoragePath(path = '') {
    return String(path).split('/').filter(Boolean).map(segment => encodeURIComponent(segment)).join('/');
  }

  function publicTemplateObjectUrl(path = '') {
    const { supabaseUrl, previewBucket } = templateStorageSettings();
    if (!supabaseUrl || !previewBucket) return '';
    const rawPath = String(path || '');
    const trailingSlash = rawPath.endsWith('/') ? '/' : '';
    return `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(previewBucket)}/${encodeStoragePath(rawPath)}${trailingSlash}`;
  }

  function templateCatalogUrl() {
    const { catalogPath, version } = templateStorageSettings();
    const base = publicTemplateObjectUrl(catalogPath);
    return version ? `${base}?v=${encodeURIComponent(version)}` : base;
  }

  function normalizeCatalogItem(raw) {
    const category = String(raw?.category || 'other').trim().toLowerCase();
    const tierLower = String(raw?.tier || 'free').trim().toLowerCase();
    const tier = tierLower === 'premium' ? 'Premium' : 'Free';
    const previewBasePath = String(raw?.preview_base_path || '').replace(/^\/+/, '');
    const previewIndexPath = String(raw?.preview_index_path || '').replace(/^\/+/, '');
    const packagePath = String(raw?.package_path || '').replace(/^\/+/, '');
    const id = String(raw?.template_id || raw?.id || '').trim();
    const slug = String(raw?.slug || '').trim();
    if (!id || !slug || !previewIndexPath || !previewBasePath || !packagePath) return null;
    return {
      id,
      slug,
      title: String(raw?.name || titleCase(slug)).trim(),
      tier,
      category,
      categoryLabel: titleCase(category),
      description: CATEGORY_DESCRIPTIONS[category] || 'Production-ready website starter with responsive layout and polished visual structure.',
      version: String(raw?.version || '1.0.0').trim(),
      previewBasePath,
      previewIndexPath,
      previewBaseUrl: publicTemplateObjectUrl(previewBasePath),
      previewIndexUrl: publicTemplateObjectUrl(previewIndexPath),
      packagePath,
      packageSha256: String(raw?.package_sha256 || '').trim(),
      packageSizeBytes: Number(raw?.package_size_bytes || 0) || 0
    };
  }

  function titleCase(str = '') {
    return String(str).replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function injectTemplateBaseHref(html, baseUrl, isThumbnail = false) {
    const safeBase = String(baseUrl || '').replace(/"/g, '&quot;');
    const baseTag = `<base href="${safeBase}">`;
    const thumbnailReset = isThumbnail ? `<style>
      html, body {
        overflow: hidden !important;
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
        margin: 0 !important;
        padding: 0 !important;
        pointer-events: none !important;
        user-select: none !important;
        width: 100% !important;
        min-width: 100% !important;
      }
      ::-webkit-scrollbar { display: none !important; }
    </style>` : '';
    let source = String(html || '');
    if (isThumbnail) {
      source = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<script\b[^>]*\/>/gi, '');
    }
    if (/<base\s/i.test(source)) {
      source = source.replace(/<base\b[^>]*>/i, baseTag);
    } else if (/<head\b[^>]*>/i.test(source)) {
      source = source.replace(/<head\b([^>]*)>/i, `<head$1>${baseTag}`);
    } else {
      source = `<!doctype html><html><head>${baseTag}</head><body>${source}</body></html>`;
    }
    if (thumbnailReset) {
      if (/<head\b[^>]*>/i.test(source)) {
        return source.replace(/<\/head>/i, `${thumbnailReset}</head>`);
      }
      return thumbnailReset + source;
    }
    return source;
  }

  async function fetchTemplateWithRetry(url, maxRetries = 2) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, { cache: 'force-cache', mode: 'cors' });
        if (!response.ok) throw new Error(`Preview returned HTTP ${response.status}.`);
        const html = await response.text();
        if (!html.trim()) throw new Error('Preview HTML is empty.');
        return html;
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 250 * (attempt + 1)));
        }
      }
    }
    throw lastError || new Error('Failed to load preview.');
  }

  async function loadTemplateDocument(item, isThumbnail = true) {
    if (!item) throw new Error('Template not found.');
    const key = `${item.id}:${isThumbnail ? 'thumb' : 'full'}`;
    if (templateCatalogState.cache.has(key)) return templateCatalogState.cache.get(key);
    const promise = (async () => {
      const html = await fetchTemplateWithRetry(item.previewIndexUrl, 2);
      return injectTemplateBaseHref(html, item.previewBaseUrl, isThumbnail);
    })();
    templateCatalogState.cache.set(key, promise);
    try {
      return await promise;
    } catch (e) {
      templateCatalogState.cache.delete(key);
      throw e;
    }
  }

  async function hydrateChatTemplateFrame(frame, item) {
    if (!frame || !item || frame.dataset.loaded === '1' || frame.dataset.loaded === 'loading') return;
    frame.dataset.loaded = 'loading';
    try {
      const docHtml = await loadTemplateDocument(item, true);
      frame.srcdoc = docHtml;
      frame.dataset.loaded = '1';
      frame.closest('.card-preview')?.classList.add('preview-ready');
    } catch (err) {
      frame.dataset.loaded = 'error';
      frame.srcdoc = `<!doctype html><html><body style="background:#0d0f12;color:#9aa1ab;font:600 13px system-ui;display:grid;place-items:center;height:100%;margin:0">Preview unavailable</body></html>`;
    }
  }

  function filteredChatCatalog() {
    return templateCatalogState.catalog.filter(item => {
      if (templateCatalogState.tier !== 'All' && item.tier !== templateCatalogState.tier) return false;
      if (templateCatalogState.category !== 'All' && item.category !== templateCatalogState.category.toLowerCase()) return false;
      if (!templateCatalogState.query) return true;
      const q = templateCatalogState.query.toLowerCase();
      return item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.tier.toLowerCase().includes(q) ||
        item.slug.toLowerCase().includes(q);
    });
  }

  function chatTemplateCardHTML(item) {
    const isPaid = hasActivePaidPlan();
    const premium = item.tier === 'Premium';
    const locked = premium && !isPaid;
    const useLabel = locked ? 'Upgrade to use' : 'Use template';
    return `<article class="catalog-card${premium ? ' is-premium' : ''}${locked ? ' is-locked' : ''}" data-template-id="${escapeHTML(item.id)}">
      <div class="card-preview" data-preview-template="${escapeHTML(item.id)}" role="button" tabindex="0" aria-label="Preview ${escapeHTML(item.title)}">
        <iframe data-preview-frame="${escapeHTML(item.id)}" title="${escapeHTML(item.title)} miniature preview" tabindex="-1" sandbox="allow-scripts allow-forms allow-modals allow-same-origin"></iframe>
        <span class="card-preview-loading" aria-hidden="true"><span></span></span>
        <span class="card-preview-overlay"><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>Live preview</span></span>
      </div>
      <div class="card-body">
        <div class="card-meta"><span class="card-category">${escapeHTML(item.categoryLabel)}</span><span class="tier-badge${premium ? ' premium' : ''}">${escapeHTML(item.tier)}</span></div>
        <h5 title="${escapeHTML(item.title)}">${escapeHTML(item.title)}</h5>
        <p>${escapeHTML(item.description)}</p>
        <div class="card-actions">
          <button class="card-action preview" type="button" data-preview-template="${escapeHTML(item.id)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle></svg>Preview</button>
          <button class="card-action use${locked ? ' locked' : ''}" type="button" data-use-template="${escapeHTML(item.id)}">${escapeHTML(useLabel)}</button>
        </div>
      </div>
    </article>`;
  }

  function chatTemplateSectionHTML(tier, items) {
    if (!items.length) return '';
    return `<section class="template-tier-section" data-tier="${tier}">
      <div class="tier-section-header"><div class="tier-section-title"><h4>${tier} templates</h4><span>${items.length}</span></div></div>
      <div class="catalog-grid">${items.map(chatTemplateCardHTML).join('')}</div>
    </section>`;
  }

  function installChatTemplateObserver(container) {
    templateCatalogState.observer?.disconnect?.();
    const frames = Array.from(container.querySelectorAll('[data-preview-frame]'));
    if (!frames.length) return;

    frames.slice(0, 8).forEach(frame => {
      const item = templateCatalogState.catalog.find(t => t.id === frame.dataset.previewFrame);
      if (item) hydrateChatTemplateFrame(frame, item);
    });

    if (!('IntersectionObserver' in window)) {
      frames.forEach(frame => {
        const item = templateCatalogState.catalog.find(t => t.id === frame.dataset.previewFrame);
        if (item) hydrateChatTemplateFrame(frame, item);
      });
      return;
    }

    templateCatalogState.observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const frame = entry.target;
        templateCatalogState.observer.unobserve(frame);
        const item = templateCatalogState.catalog.find(t => t.id === frame.dataset.previewFrame);
        if (item) hydrateChatTemplateFrame(frame, item);
      });
    }, { root: container.closest('.template-scroll') || null, rootMargin: '1000px 0px', threshold: 0 });

    frames.forEach(frame => {
      if (frame.dataset.loaded !== '1') templateCatalogState.observer.observe(frame);
    });
  }

  function renderChatTemplateCategories() {
    const strip = document.getElementById('categoryStrip');
    if (!strip) return;
    const cats = ['All', ...new Set(templateCatalogState.catalog.map(i => i.categoryLabel))].sort((a, b) => {
      if (a === 'All') return -1;
      if (b === 'All') return 1;
      return a.localeCompare(b);
    });
    strip.innerHTML = cats.map(cat => {
      const active = templateCatalogState.category.toLowerCase() === cat.toLowerCase();
      return `<button class="category-chip${active ? ' active' : ''}" type="button" data-category="${escapeHTML(cat)}">${escapeHTML(cat)}</button>`;
    }).join('');

    strip.querySelectorAll('.category-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        templateCatalogState.category = chip.dataset.category || 'All';
        renderChatTemplates();
      });
    });
  }

  function populateChatTemplateCounts() {
    const total = templateCatalogState.catalog.length || 39;
    const free = templateCatalogState.catalog.filter(i => i.tier === 'Free').length || 10;
    const premium = templateCatalogState.catalog.filter(i => i.tier === 'Premium').length || 29;
    const setT = (id, v) => { const n = document.getElementById(id); if (n) n.textContent = v; };
    setT('totalCount', total);
    setT('freeCount', free);
    setT('premiumCount', premium);
    setT('tierTabAllCount', total);
    setT('tierTabFreeCount', free);
    setT('tierTabPremiumCount', premium);
    setT('templatesCount', total);
    setT('footerCount', `${total} production-ready starters`);
  }

  function initChatTemplateListeners() {
    if (templateCatalogState.initialized) return;
    templateCatalogState.initialized = true;

    const search = document.getElementById('templateSearch');
    search?.addEventListener('input', (e) => {
      templateCatalogState.query = String(e.target.value || '').trim();
      renderChatTemplates();
    });

    document.getElementById('tierTabs')?.querySelectorAll('.tier-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.getElementById('tierTabs').querySelectorAll('.tier-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        templateCatalogState.tier = tab.dataset.tier || 'All';
        renderChatTemplates();
      });
    });

    document.getElementById('clearFilters')?.addEventListener('click', () => {
      templateCatalogState.query = '';
      templateCatalogState.tier = 'All';
      templateCatalogState.category = 'All';
      if (search) search.value = '';
      document.getElementById('tierTabs')?.querySelectorAll('.tier-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tier === 'All');
      });
      renderChatTemplates();
    });

    // Preview modal events
    document.querySelectorAll('[data-close-preview]').forEach(btn => {
      btn.addEventListener('click', closeChatTemplatePreview);
    });

    document.getElementById('useTemplateModal')?.addEventListener('click', () => {
      if (templateCatalogState.activeTemplate) {
        useChatTemplate(templateCatalogState.activeTemplate.id);
      }
    });

    document.getElementById('openFullPreview')?.addEventListener('click', () => {
      if (!templateCatalogState.activeTemplate) return;
      const fullPreviewRoute = window.location.protocol === 'file:'
        ? new URL('../template/preview.html', window.location.href).href
        : (config?.ROUTES?.TEMPLATE_PREVIEW || '/template/preview');
      const target = new URL(fullPreviewRoute, window.location.href);
      target.searchParams.set('id', templateCatalogState.activeTemplate.id);
      target.searchParams.set('version', templateCatalogState.activeTemplate.version);
      window.open(target.href, '_blank', 'noopener,noreferrer');
    });

    document.addEventListener('keydown', (e) => {
      const modal = document.getElementById('previewModal');
      if (e.key === 'Escape' && modal?.classList.contains('open')) {
        closeChatTemplatePreview();
        return;
      }
      if (e.key === '/' && templatesScreen && templatesScreen.style.display !== 'none' && !modal?.classList.contains('open') && !/input|textarea/i.test(document.activeElement?.tagName || '')) {
        e.preventDefault();
        search?.focus();
      }
    });
  }

  async function loadChatTemplateCatalog() {
    if (templateCatalogState.catalog.length) return;
    templateCatalogState.loading = true;
    templateCatalogState.error = null;
    const url = templateCatalogUrl();
    if (!url) {
      templateCatalogState.loading = false;
      templateCatalogState.error = 'Supabase storage configuration missing.';
      return;
    }
    try {
      const res = await fetch(url, { cache: 'no-cache', mode: 'cors' });
      if (!res.ok) throw new Error(`catalog.json returned HTTP ${res.status}`);
      const payload = await res.json();
      const raw = Array.isArray(payload) ? payload : payload?.templates;
      if (!Array.isArray(raw)) throw new Error('catalog.json has no templates array');
      const items = raw.map(normalizeCatalogItem).filter(Boolean);
      items.sort((a, b) => {
        if (a.tier !== b.tier) return a.tier === 'Free' ? -1 : 1;
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return a.title.localeCompare(b.title);
      });
      templateCatalogState.catalog = items;
      populateChatTemplateCounts();
      renderChatTemplateCategories();
    } catch (e) {
      console.warn('Chat templates catalog load failed:', e);
      templateCatalogState.error = e.message;
    } finally {
      templateCatalogState.loading = false;
    }
  }

  async function openChatTemplatePreview(id) {
    const item = templateCatalogState.catalog.find(t => t.id === id);
    if (!item) return;
    templateCatalogState.activeTemplate = item;
    const modal = document.getElementById('previewModal');
    const title = document.getElementById('previewTitle');
    const category = document.getElementById('previewCategory');
    const tier = document.getElementById('previewTier');
    const address = document.getElementById('previewAddress');
    const frame = document.getElementById('previewFrame');
    const useBtn = document.getElementById('useTemplateModal');
    if (!modal || !frame) return;

    if (title) title.textContent = item.title;
    if (category) category.textContent = `${item.categoryLabel} · v${item.version}`;
    if (tier) {
      tier.textContent = item.tier;
      tier.className = `preview-tier${item.tier === 'Premium' ? ' premium' : ''}`;
    }
    if (address) address.textContent = `nexora://templates/${item.slug}`;
    if (useBtn) {
      const isPaid = hasActivePaidPlan();
      const locked = item.tier === 'Premium' && !isPaid;
      useBtn.textContent = locked ? 'Upgrade to use' : 'Use template';
      useBtn.classList.toggle('locked', locked);
    }

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    frame.srcdoc = `<!doctype html><html><body style="background:#0d0f12;color:#9aa1ab;font:600 14px system-ui;display:grid;place-items:center;height:100%;margin:0">Loading live interactive preview…</body></html>`;

    try {
      const docHtml = await loadTemplateDocument(item, false);
      frame.srcdoc = docHtml;
    } catch (err) {
      frame.srcdoc = `<!doctype html><html><body style="background:#0d0f12;color:#ef6e6e;font:600 14px system-ui;display:grid;place-items:center;height:100%;margin:0">Could not load preview.</body></html>`;
    }
  }

  function closeChatTemplatePreview() {
    const modal = document.getElementById('previewModal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    const frame = document.getElementById('previewFrame');
    if (frame) frame.srcdoc = '';
    templateCatalogState.activeTemplate = null;
  }

  function useChatTemplate(id) {
    const item = templateCatalogState.catalog.find(t => t.id === id);
    if (!item) return;
    if (item.tier === 'Premium' && !hasActivePaidPlan()) {
      showNexoraToast('Upgrade to Pro to use premium templates.', 'warning', 4000);
      return;
    }
    appState.selectedTemplate = {
      id: item.id,
      version: item.version || '1.0.0',
      name: item.title,
      tier: item.tier,
      category: item.category
    };
    try {
      sessionStorage.setItem('nexora:selected-template', JSON.stringify({
        id: item.id,
        name: item.title,
        version: item.version,
        tier: item.tier,
        category: item.category,
        selectedAt: Date.now()
      }));
    } catch {}

    closeChatTemplatePreview();
    resetToWelcome();
    const prompt = `Build my website using the “${item.title}” template as the starting implementation. Adapt it to my requirements while preserving its strongest layout, styling, hierarchy, responsive behavior, and interactions.`;
    chatInput.value = prompt;
    chatInput.focus();
    resizeChatInput();
    showNexoraToast(`${item.title} selected. Its source package will be applied when you build.`, 'success', 4500);
  }

  async function renderChatTemplates() {
    initChatTemplateListeners();
    const sectionsNode = document.getElementById('templateSections');
    const emptyNode = document.getElementById('catalogEmpty');
    const titleNode = document.getElementById('resultsTitle');
    const summaryNode = document.getElementById('resultsSummary');
    if (!sectionsNode) return;

    if (!templateCatalogState.catalog.length && !templateCatalogState.loading) {
      if (sectionsNode) sectionsNode.innerHTML = `<div class="catalog-loading" role="status"><span class="catalog-spinner" aria-hidden="true"></span><strong>Loading templates from Supabase Storage…</strong><p>Nexora is reading the published catalog and preparing live previews.</p></div>`;
      await loadChatTemplateCatalog();
    }

    if (templateCatalogState.error) {
      sectionsNode.innerHTML = `<div class="catalog-loading catalog-error" role="alert"><strong>Template library is unavailable</strong><p>${escapeHTML(templateCatalogState.error)}</p></div>`;
      return;
    }

    populateChatTemplateCounts();
    renderChatTemplateCategories();

    const items = filteredChatCatalog();
    const free = items.filter(i => i.tier === 'Free');
    const premium = items.filter(i => i.tier === 'Premium');

    sectionsNode.innerHTML = chatTemplateSectionHTML('Free', free) + chatTemplateSectionHTML('Premium', premium);
    if (emptyNode) emptyNode.hidden = items.length > 0;
    sectionsNode.hidden = items.length === 0;

    const filterName = templateCatalogState.tier === 'All' ? 'All templates' : `${templateCatalogState.tier} templates`;
    if (titleNode) titleNode.textContent = templateCatalogState.category === 'All' ? filterName : `${filterName} · ${templateCatalogState.category}`;
    const parts = [`Showing ${items.length} of ${templateCatalogState.catalog.length} templates`];
    if (templateCatalogState.query) parts.push(`matching “${templateCatalogState.query}”`);
    if (templateCatalogState.category !== 'All') parts.push(`in ${templateCatalogState.category}`);
    if (templateCatalogState.tier === 'All') parts.push('sorted Free first and Premium second');
    if (summaryNode) summaryNode.textContent = `${parts.join(', ')}.`;

    // Bind card buttons
    sectionsNode.querySelectorAll('[data-preview-template]').forEach(node => {
      node.addEventListener('click', (e) => {
        e.preventDefault();
        openChatTemplatePreview(node.dataset.previewTemplate);
      });
      if (node.classList.contains('card-preview')) {
        node.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openChatTemplatePreview(node.dataset.previewTemplate);
          }
        });
      }
    });

    sectionsNode.querySelectorAll('[data-use-template]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        useChatTemplate(btn.dataset.useTemplate);
      });
    });

    installChatTemplateObserver(sectionsNode);
  }

  function renderTemplates(query = "") {
    if (query) templateCatalogState.query = query;
    renderChatTemplates();
  }

  function renderProjects() {
    projectsGrid.innerHTML = "";
    if (projectDatabase.length === 0) {
      projectsEmptyState.style.display = "flex";
      projectsGrid.style.display = "none";
      renderTabCounts();
    } else {
      projectsEmptyState.style.display = "none";
      projectsGrid.style.display = "grid";
      
      projectDatabase.forEach(project => {
        const card = document.createElement("div");
        card.className = "project-card";
        card.innerHTML = `
          <div class="project-header-row">
            <div class="project-icon">${escapeHTML(project.icon || 'PRJ')}</div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="project-date">${escapeHTML(project.date)}</span>
              <div class="project-actions" style="position: relative;">
                <button class="project-actions-btn" aria-label="Project actions" onclick="event.stopPropagation(); this.nextElementSibling.classList.toggle('show')">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="5" r="1"></circle>
                    <circle cx="12" cy="12" r="1"></circle>
                    <circle cx="12" cy="19" r="1"></circle>
                  </svg>
                </button>
                <div class="project-dropdown-menu">
                  <div class="dropdown-item" onclick="event.stopPropagation(); window.openProject('${project.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                    Open preview
                  </div>
                  <div class="dropdown-item" onclick="event.stopPropagation(); window.renameProject('${project.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                    Rename
                  </div>
                  <div class="dropdown-item delete" onclick="event.stopPropagation(); window.deleteProject('${project.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    Delete
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="project-info">
            <h3>${escapeHTML(project.title)}</h3>
            <p>${escapeHTML(project.deployment?.status ? `Deployment: ${project.deployment.status}` : project.description || 'Click to open workspace')}</p>
          </div>
        `;
        card.addEventListener('click', () => window.openProject(project.id));
        projectsGrid.appendChild(card);
      });
    }
    renderTabCounts();
  }

  function formatBytes(bytes, decimals = 1) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  }

  function getUserDisplayName(user = appState.user, profile = appState.profile) {
    const metadata = user?.user_metadata || {};
    return profile?.name || metadata.full_name || metadata.name || user?.email?.split('@')[0] || 'User';
  }

  function getUserInitial() {
    return getUserDisplayName().trim().charAt(0).toUpperCase() || 'U';
  }

  function formatDate(value) {
    if (!value) return 'Just now';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Just now';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function recordDatabaseError(scope, error) {
    if (!error) return;
    const message = error.message || String(error);
    appState.databaseErrors.push({ scope, message, at: new Date().toISOString() });
    console.error(`[Nexora database:${scope}]`, error);
  }

  function formatDatabaseIssue(scope, error) {
    const message = error?.message || String(error || 'Unknown database error');
    return `${scope}: ${message}`;
  }

  function withTimeout(promise, timeoutMs, scope = 'request') {
    let timer = null;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`${scope} timed out after ${Math.round(timeoutMs / 1000)}s`));
      }, timeoutMs);
    });
    return Promise.race([Promise.resolve(promise), timeout]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }

  async function runSupabaseQuery(scope, queryFactory, timeoutMs = 6500) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timer = null;
    try {
      const query = queryFactory();
      const request = controller && query && typeof query.abortSignal === 'function'
        ? query.abortSignal(controller.signal)
        : query;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller?.abort();
          reject(new Error(`${scope} timed out after ${Math.round(timeoutMs / 1000)}s`));
        }, timeoutMs);
      });
      return await Promise.race([Promise.resolve(request), timeout]);
    } catch (error) {
      recordDatabaseError(scope, error);
      return { data: null, error };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function sanitizeStorageSegment(value = 'file') {
    return String(value || 'file')
      .normalize('NFKD')
      .replace(/[^\w.\-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 96) || 'file';
  }

  function getFileExtension(fileName = '', fallback = 'bin') {
    const clean = String(fileName || '').split(/[\\/]/).pop() || '';
    const match = clean.match(/\.([a-z0-9]{1,12})$/i);
    return sanitizeStorageSegment(match?.[1] || fallback).toLowerCase();
  }

  function makeStorageUri(bucket, path) {
    return `${STORAGE_URI_PREFIX}${bucket}/${String(path || '').replace(/^\/+/, '')}`;
  }

  function parseStorageUri(value = '') {
    const text = String(value || '');
    if (!text.startsWith(STORAGE_URI_PREFIX)) return null;
    const rest = text.slice(STORAGE_URI_PREFIX.length);
    const slashIndex = rest.indexOf('/');
    if (slashIndex <= 0) return null;
    return {
      bucket: rest.slice(0, slashIndex),
      path: rest.slice(slashIndex + 1)
    };
  }

  function getPublicStorageUrl(bucket, path) {
    try {
      return supabaseClient?.storage?.from(bucket)?.getPublicUrl(path)?.data?.publicUrl || '';
    } catch {
      return '';
    }
  }

  async function uploadBlobToBucket(bucket, path, body, options = {}) {
    if (!supabaseClient?.storage?.from || !bucket || !path || !body) {
      throw new Error('Supabase Storage is not available.');
    }
    const { data, error } = await supabaseClient.storage.from(bucket).upload(path, body, {
      cacheControl: options.cacheControl || '3600',
      contentType: options.contentType || body.type || 'application/octet-stream',
      upsert: options.upsert !== false
    });
    if (error) throw error;
    return {
      bucket,
      path: data?.path || path,
      storage_uri: makeStorageUri(bucket, data?.path || path),
      public_url: getPublicStorageUrl(bucket, data?.path || path)
    };
  }

  function isProbablyTextUpload(file) {
    const name = String(file?.name || '').toLowerCase();
    return Boolean(
      file?.type?.startsWith('text/') ||
      /\.(txt|md|json|js|jsx|ts|tsx|css|html|htm|xml|csv|svg|yml|yaml|sql|py|java|c|cpp|cs|go|rs|php|rb|sh)$/i.test(name)
    );
  }

  function inferLanguageFromFileName(fileName = '') {
    const ext = getFileExtension(fileName, '').toLowerCase();
    const map = {
      html: 'html',
      htm: 'html',
      css: 'css',
      js: 'javascript',
      jsx: 'javascript',
      ts: 'typescript',
      tsx: 'typescript',
      json: 'json',
      md: 'markdown',
      txt: 'text',
      svg: 'svg',
      csv: 'csv',
      sql: 'sql',
      py: 'python'
    };
    return map[ext] || 'upload';
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error('Choose a valid file.'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Could not read the selected file.'));
      reader.readAsDataURL(file);
    });
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error('Choose a valid file.'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Could not read the selected file.'));
      reader.readAsText(file);
    });
  }

  async function readInlineUploadContent(file) {
    if (!file || file.size > MAX_INLINE_UPLOAD_TEXT_BYTES || !isProbablyTextUpload(file)) return '';
    try {
      return await readFileAsText(file);
    } catch {
      return '';
    }
  }

  async function uploadAvatarFile(file) {
    const userId = appState.user?.id;
    if (!userId) throw new Error('Sign in before uploading an avatar.');
    const ext = getFileExtension(file.name, (file.type || 'image/png').split('/').pop() || 'png');
    const path = `${userId}/avatar-${Date.now()}.${ext}`;
    return uploadBlobToBucket(STORAGE_BUCKETS.avatars, path, file, {
      contentType: file.type || `image/${ext}`,
      upsert: true
    });
  }

  async function uploadProjectAsset(file, context = {}) {
    const userId = appState.user?.id;
    if (!userId) throw new Error('Sign in before uploading project assets.');
    const label = sanitizeStorageSegment(context.label || context.projectId || 'chat-upload');
    const originalName = sanitizeStorageSegment(file.name || `upload-${Date.now()}`);
    const path = `${userId}/${label}/${Date.now()}-${Math.random().toString(16).slice(2)}-${originalName}`;
    const uploaded = await uploadBlobToBucket(STORAGE_BUCKETS.projectAssets, path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false
    });
    const inlineContent = await readInlineUploadContent(file);
    return {
      name: file.name,
      size: formatBytes(file.size),
      bytes: file.size,
      type: file.type || 'application/octet-stream',
      language: inferLanguageFromFileName(file.name),
      content: inlineContent || `[Uploaded asset]\nname: ${file.name}\nsize: ${formatBytes(file.size)}\nstorage: ${uploaded.storage_uri}`,
      storage_bucket: uploaded.bucket,
      storage_path: uploaded.path,
      storage_uri: uploaded.storage_uri,
      public_url: uploaded.public_url,
      uploaded_at: new Date().toISOString()
    };
  }

  async function prepareUploadedFiles(files = [], context = {}) {
    const selected = Array.from(files || []).filter(Boolean);
    const results = [];
    for (const file of selected) {
      if (supabaseClient?.storage?.from && appState.user?.id) {
        try {
          results.push(await uploadProjectAsset(file, context));
          continue;
        } catch (error) {
          recordDatabaseError('storage.project_assets.upload', error);
          showNexoraToast?.(`Storage upload failed for ${file.name}; keeping a local fallback.`, 'error', 5200);
        }
      }

      const inlineContent = await readInlineUploadContent(file);
      results.push({
        name: file.name,
        size: formatBytes(file.size),
        bytes: file.size,
        type: file.type || 'application/octet-stream',
        language: inferLanguageFromFileName(file.name),
        content: inlineContent || `[Uploaded file metadata]\nname: ${file.name}\nsize: ${formatBytes(file.size)}`,
        uploaded_at: new Date().toISOString(),
        local_fallback: true
      });
    }
    return results;
  }

  async function saveProjectPayload(projectId, payload = {}) {
    if (!supabaseClient?.storage?.from || !appState.user?.id || !projectId) {
      throw new Error('Supabase Storage is not available for project payloads.');
    }
    const path = `${appState.user.id}/${projectId}/payload.json`;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const uploaded = await uploadBlobToBucket(STORAGE_BUCKETS.projectPayloads, path, blob, {
      contentType: 'application/json',
      upsert: true
    });
    return uploaded.storage_uri;
  }

  async function loadProjectPayloadFromStorage(reference = '') {
    const parsed = parseStorageUri(reference);
    if (!parsed || !supabaseClient?.storage?.from) return null;
    const { data, error } = await supabaseClient.storage.from(parsed.bucket).download(parsed.path);
    if (error) throw error;
    const text = await data.text();
    return JSON.parse(text);
  }

  function hydrateMissingAccountRowsInBackground(user) {
    if (!supabaseClient || !user?.id) return;
    Promise.allSettled([
      appState.profile ? Promise.resolve() : ensureProfile(user),
      appState.preferences ? Promise.resolve() : ensureUserPreferences(user.id),
      appState.billing ? Promise.resolve() : ensureBilling(user.id)
    ]).then(() => {
      if (document.body.classList.contains('profile-is-loading')) return;
      renderProfile();
      renderSettings();
    });
  }

  function getPlanTier() {
    return String(appState.billing?.plan_tier || 'free').toLowerCase();
  }

  function hasActivePaidPlan() {
    const tier = getPlanTier();
    const status = String(appState.billing?.status || 'active').toLowerCase();
    return tier !== 'free' && ['active', 'trialing', 'paid'].includes(status);
  }

  function getPlanLabel(plan = getPlanTier()) {
    const tier = String(plan || 'free').toLowerCase();
    if (tier === 'free') return 'Free Plan';
    if (tier === 'paid' || tier === 'pro') return 'Paid Plan';
    return `${tier.charAt(0).toUpperCase()}${tier.slice(1)} Plan`;
  }

  function updateProPlanModalState() {
    if (!proPlanModal) return;
    const isPaid = hasActivePaidPlan();
    const title = proPlanModal.querySelector('.modal-title');
    const text = proPlanModal.querySelector('.modal-text');
    if (title) title.textContent = isPaid ? 'Paid Plan Active' : 'Upgrade to Pro';
    if (text) {
      text.textContent = isPaid
        ? 'Your account is already on the paid tier with premium model access enabled.'
        : 'Upgrade your billing row to the paid tier and unlock premium model access.';
    }
    if (btnClaimPro) {
      btnClaimPro.textContent = isPaid ? 'Paid Plan Active' : 'Upgrade to Paid Plan';
      btnClaimPro.classList.toggle('is-paid', isPaid);
      btnClaimPro.setAttribute('aria-label', isPaid ? 'Paid plan is already active' : 'Upgrade to paid plan');
    }
  }

  function setAvatarNode(node, avatarUrl) {
    if (!node) return;
    node.textContent = avatarUrl ? '' : getUserInitial();
    node.classList.toggle('has-image', Boolean(avatarUrl));
    if (avatarUrl) {
      const safeUrl = `url("${String(avatarUrl).replace(/"/g, '%22')}")`;
      node.style.setProperty('--profile-avatar-image', safeUrl);
      node.style.backgroundImage = safeUrl;
      node.style.backgroundSize = 'cover';
      node.style.backgroundPosition = 'center';
    } else {
      node.style.removeProperty('--profile-avatar-image');
      node.style.backgroundImage = '';
    }
  }

  function readImageAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type?.startsWith('image/')) {
        reject(new Error('Choose a valid image file.'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Could not read the selected image.'));
      reader.readAsDataURL(file);
    });
  }

  async function applyProfilePhoto(file, targetInput, statusNode) {
    try {
      if (statusNode) statusNode.textContent = 'Uploading photo...';
      let avatarUrl = '';
      if (supabaseClient?.storage?.from && appState.user?.id) {
        try {
          const uploaded = await uploadAvatarFile(file);
          avatarUrl = uploaded.public_url || uploaded.storage_uri;
        } catch (error) {
          recordDatabaseError('storage.avatars.upload', error);
        }
      }

      if (!avatarUrl) {
        if (statusNode) statusNode.textContent = 'Loading local preview...';
        avatarUrl = await readImageAsDataUrl(file);
      }

      const dataUrl = await readImageAsDataUrl(file);
      const previewUrl = avatarUrl || dataUrl;
      if (targetInput) targetInput.value = previewUrl;
      if (profileAvatarInput && targetInput !== profileAvatarInput) profileAvatarInput.value = previewUrl;
      if (dropupProfileAvatarInput && targetInput !== dropupProfileAvatarInput) dropupProfileAvatarInput.value = previewUrl;
      appState.profile = { ...(appState.profile || {}), avatar_url: previewUrl };
      renderProfile();
      renderSettings();
      if (statusNode) statusNode.textContent = avatarUrl && !avatarUrl.startsWith('data:')
        ? 'Photo uploaded. Save profile to sync.'
        : 'Photo ready locally. Save profile to sync.';
    } catch (error) {
      if (statusNode) statusNode.textContent = error.message;
    }
  }

  async function saveProfileFromInputs({ nameInput, emailInput, avatarInput, statusNode }) {
    const nextProfile = {
      id: appState.user?.id || appState.profile?.id || 'local-user',
      name: nameInput?.value.trim() || getUserDisplayName(),
      email: emailInput?.value.trim() || appState.user?.email || appState.profile?.email || null,
      avatar_url: avatarInput?.value.trim() || null
    };

    if (statusNode) statusNode.textContent = 'Saving...';

    if (supabaseClient && appState.user?.id) {
      const authEmail = appState.user.email || '';
      if (nextProfile.email && nextProfile.email !== authEmail) {
        const { error: authError } = await supabaseClient.auth.updateUser({ email: nextProfile.email });
        if (authError) {
          recordDatabaseError('auth.updateUser', authError);
          if (statusNode) statusNode.textContent = formatDatabaseIssue('Email update failed', authError);
          return false;
        }
      }

      const { data, error } = await supabaseClient
        .from('profiles')
        .upsert(nextProfile, { onConflict: 'id' })
        .select()
        .maybeSingle();
      if (error) {
        recordDatabaseError('profiles.upsert', error);
        if (statusNode) statusNode.textContent = formatDatabaseIssue('Profile save failed', error);
        return false;
      }
      appState.profile = data || nextProfile;
      if (statusNode) statusNode.textContent = nextProfile.email !== authEmail
        ? 'Profile saved. Check your inbox to confirm the new email.'
        : 'Profile saved.';
    } else {
      appState.profile = { ...(appState.profile || {}), ...nextProfile };
      if (statusNode) statusNode.textContent = 'Profile saved for this local file session.';
    }

    renderProfile();
    renderSettings();
    persistWorkspace();
    setTimeout(() => {
      if (statusNode) statusNode.textContent = '';
    }, 2200);
    return true;
  }

  function buildWorkspaceSnapshot() {
    return {
      version: 2,
      savedAt: new Date().toISOString(),
      activeChatId: null,
      profile: null,
      billing: null,
      preferences: null,
      conversations: [],
      messagesByConversation: {},
      tabs: {
        templates: templateDatabase,
        projects: projectDatabase.map(project => ({
          id: project.id,
          title: project.title,
          description: project.description,
          date: project.date,
          icon: project.icon,
          files: project.files || [],
          webProject: project.webProject || null,
          visualDocument: project.visualDocument || null,
          generatedProject: project.generatedProject || null,
          template_id: project.template_id || null,
          deployment: project.deployment || null,
          raw: project.raw || null
        })),
        deployments: deploymentDatabase,
        library: libraryDatabase,
        archive: archiveDatabase,
        settings: {
          profile: null,
          billing: null,
          preferences: null
        }
      }
    };
  }

  function writeWorkspaceSnapshotNow() {
    try {
      NEXORA_STORAGE.setJSON(appState.storageKey, buildWorkspaceSnapshot());
      workspacePersistPending = false;
    } catch {}
  }

  function persistWorkspace(options = {}) {
    const immediate = options === true || options.immediate === true;
    if (immediate) {
      if (workspacePersistTimer) clearTimeout(workspacePersistTimer);
      workspacePersistTimer = null;
      writeWorkspaceSnapshotNow();
      return;
    }
    workspacePersistPending = true;
    if (workspacePersistTimer) clearTimeout(workspacePersistTimer);
    workspacePersistTimer = setTimeout(() => {
      workspacePersistTimer = null;
      writeWorkspaceSnapshotNow();
    }, 320);
  }

  window.addEventListener('beforeunload', () => {
    if (workspacePersistPending) persistWorkspace({ immediate: true });
  });

  function readLocalWorkspaceSnapshot() {
    try {
      const snapshot = NEXORA_STORAGE.getJSON(appState.storageKey, null);
      return snapshot && typeof snapshot === 'object' ? snapshot : null;
    } catch {
      return null;
    }
  }

  function hasLegacyWorkspaceData(snapshot) {
    return Boolean(
      snapshot &&
      (
        Array.isArray(snapshot.conversations) && snapshot.conversations.length ||
        Array.isArray(snapshot.tabs?.projects) && snapshot.tabs.projects.length
      )
    );
  }

  function isAlreadyMigrated(snapshot) {
    return snapshot?.database_migrated_user_id === appState.user?.id;
  }

  function markLegacyWorkspaceMigrated(snapshot) {
    if (!snapshot || !appState.user?.id) return;
    try {
      NEXORA_STORAGE.set(appState.storageKey, JSON.stringify({
        ...snapshot,
        database_migrated_user_id: appState.user.id,
        database_migrated_at: new Date().toISOString()
      }));
    } catch {}
  }

  async function migrateLegacyWorkspaceToDatabase(snapshot) {
    if (!supabaseClient || !appState.user?.id || !hasLegacyWorkspaceData(snapshot) || isAlreadyMigrated(snapshot)) return;

    const shouldMigrateChats = conversationList.length === 0 && Array.isArray(snapshot.conversations) && snapshot.conversations.length;
    const shouldMigrateProjects = projectDatabase.length === 0 && Array.isArray(snapshot.tabs?.projects) && snapshot.tabs.projects.length;
    if (!shouldMigrateChats && !shouldMigrateProjects) return;

    try {
      if (shouldMigrateChats) {
        for (const conversation of snapshot.conversations) {
          const messages = Array.isArray(snapshot.messagesByConversation?.[conversation.id])
            ? snapshot.messagesByConversation[conversation.id]
            : [];
          const title = conversation.title || messages.find(message => message.sender === 'user')?.text || 'New chat';
          const { data: createdConversation, error: conversationError } = await supabaseClient
            .from('conversations')
            .insert({
              user_id: appState.user.id,
              title: titleFromText(title),
              created_at: conversation.created_at || new Date().toISOString()
            })
            .select()
            .maybeSingle();
          if (conversationError || !createdConversation) throw conversationError || new Error('Conversation migration did not return a row.');

          if (messages.length) {
            const rows = messages
              .filter(message => message?.text || message?.content)
              .map(message => ({
                conversation_id: createdConversation.id,
                role: ['user', 'assistant', 'system'].includes(message.role || message.sender) ? (message.role || message.sender) : 'assistant',
                content: message.text || message.content
              }));
            if (rows.length) {
              const { error: messagesError } = await supabaseClient.from('messages').insert(rows);
              if (messagesError) throw messagesError;
            }
          }
        }
      }

      if (shouldMigrateProjects) {
        for (const project of snapshot.tabs.projects) {
          const payload = {
            kind: project.icon === 'WEB' ? 'generated-website' : 'manual-project',
            files: Array.isArray(project.files) ? project.files : [],
            webProject: project.webProject || null,
            visualDocument: project.visualDocument || null,
            generatedProject: project.generatedProject || null,
            description: project.description || '',
            migrated_at: new Date().toISOString()
          };
          const { data: createdProject, error: projectError } = await supabaseClient
            .from('projects')
            .insert({
              user_id: appState.user.id,
              template_id: project.template_id || null,
              name: project.title || project.name || 'Untitled Project',
              description: project.description || '',
              zip_file_path: null
            })
            .select()
            .maybeSingle();
          if (projectError || !createdProject) throw projectError || new Error('Project migration did not return a row.');

          let payloadRef = '';
          try {
            payloadRef = await saveProjectPayload(createdProject.id, payload);
          } catch (storageError) {
            recordDatabaseError('storage.project_payloads.migrate_upload', storageError);
            payloadRef = encodeProjectPayload(payload);
          }
          if (payloadRef) {
            const { error: payloadUpdateError } = await supabaseClient
              .from('projects')
              .update({ zip_file_path: payloadRef, updated_at: new Date().toISOString() })
              .eq('id', createdProject.id);
            if (payloadUpdateError) recordDatabaseError('projects.migrate_payload_ref_update', payloadUpdateError);
          }

          const deployment = project.deployment || null;
          if (deployment?.deployment_url || deployment?.status) {
            const { error: deploymentError } = await supabaseClient
              .from('deployments')
              .insert({
                project_id: createdProject.id,
                user_id: appState.user.id,
                deployment_url: deployment.deployment_url || `preview://nexora/${createdProject.id}`,
                status: deployment.status || 'ready'
              });
            if (deploymentError) recordDatabaseError('deployments.migrate', deploymentError);
          }
        }
      }

      markLegacyWorkspaceMigrated(snapshot);
      conversationList = [];
      projectDatabase = [];
      deploymentDatabase = [];
      libraryDatabase = [];
      archiveDatabase = [];
      Object.keys(chatDatabase).forEach(key => delete chatDatabase[key]);
      await Promise.all([
        loadProjectsFromDatabase(),
        loadConversationsFromDatabase()
      ]);
    } catch (error) {
      recordDatabaseError('workspace.migration', error);
    }
  }

  function loadLocalWorkspace(options = {}) {
    try {
      const snapshot = readLocalWorkspaceSnapshot();
      if (!snapshot || typeof snapshot !== 'object') return;

      appState.billing = appState.billing || snapshot.billing || snapshot.tabs?.settings?.billing || null;
      appState.preferences = appState.preferences || snapshot.preferences || snapshot.tabs?.settings?.preferences || null;

      if (Array.isArray(snapshot.tabs?.templates) && snapshot.tabs.templates.length) {
        templateDatabase = snapshot.tabs.templates;
      }
      if (Array.isArray(snapshot.tabs?.projects)) {
        projectDatabase = snapshot.tabs.projects;
      }
      if (Array.isArray(snapshot.tabs?.deployments)) {
        deploymentDatabase = snapshot.tabs.deployments;
      }
      rebuildLibraryFromProjects();
      if (!libraryDatabase.length && Array.isArray(snapshot.tabs?.library)) {
        libraryDatabase = snapshot.tabs.library;
      }
      if (!archiveDatabase.length && Array.isArray(snapshot.tabs?.archive)) {
        archiveDatabase = snapshot.tabs.archive;
      }
    } catch {}
  }

  function restoreActiveChatFromStorage() {
    if (activeChatId && chatDatabase[activeChatId]?.length) {
      loadChat(activeChatId);
    }
  }

  function titleFromText(text = 'New chat') {
    const clean = String(text).replace(/\s+/g, ' ').trim() || 'New chat';
    return clean.length > 42 ? `${clean.slice(0, 39)}...` : clean;
  }

  function buildTemplateIcon(name = '') {
    const letters = String(name).replace(/[^a-z0-9 ]/gi, '').split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('');
    return (letters || 'NX').toUpperCase();
  }

  function encodeProjectPayload(payload = {}) {
    try {
      return `nexora://project-payload;base64,${btoa(unescape(encodeURIComponent(JSON.stringify(payload))))}`;
    } catch {
      return '';
    }
  }

  function decodeProjectPayload(value = '') {
    if (!String(value).startsWith('nexora://project-payload;base64,')) return {};
    try {
      const encoded = String(value).split(',')[1] || '';
      return JSON.parse(decodeURIComponent(escape(atob(encoded))));
    } catch {
      return {};
    }
  }

  async function readProjectPayloadReference(value = '') {
    if (!value) return {};
    const storageRef = parseStorageUri(value);
    if (storageRef) {
      try {
        return await loadProjectPayloadFromStorage(value) || {};
      } catch (error) {
        recordDatabaseError('storage.project_payloads.download', error);
        return {};
      }
    }
    return decodeProjectPayload(value);
  }

  function mapTemplateRow(row) {
    return {
      id: row.id,
      title: row.name,
      desc: row.description || 'Reusable Nexora AI project starter.',
      source_url: row.source_url,
      icon: buildTemplateIcon(row.name)
    };
  }

  function mapProjectRow(row) {
    const payload = decodeProjectPayload(row.zip_file_path);
    const deployment = deploymentDatabase.find(item => item.project_id === row.id);
    return {
      id: row.id,
      title: row.name || 'Untitled Project',
      description: row.description || payload.description || '',
      date: formatDate(row.updated_at || row.created_at),
      icon: payload.kind === 'generated-website' ? 'WEB' : 'PRJ',
      files: Array.isArray(payload.files) ? payload.files : [],
      webProject: payload.webProject || null,
      visualDocument: payload.visualDocument || null,
      generatedProject: payload.generatedProject || null,
      template_id: row.template_id,
      deployment,
      payload_ref: row.zip_file_path || null,
      raw: row
    };
  }

  function rebuildLibraryFromProjects() {
    libraryDatabase = [];
    projectDatabase.forEach(project => {
      (project.files || []).forEach((file, index) => {
        libraryDatabase.push({
          id: `${project.id}:${index}`,
          projectId: project.id,
          name: file.name || `file-${index + 1}.txt`,
          size: file.size || `${Math.max(1, Math.round((file.content || '').length / 1024))} KB`,
          date: project.date,
          archived: Boolean(file.archived),
          file
        });
      });
    });
    archiveDatabase = libraryDatabase.filter(file => file.archived);
    libraryDatabase = libraryDatabase.filter(file => !file.archived);
  }

  function normalizeRpcArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function mapRpcMessageRow(row) {
    return {
      sender: ['user', 'assistant', 'system'].includes(row?.role) ? row.role : 'assistant',
      text: row?.content || '',
      id: row?.id || `message-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      created_at: row?.created_at || null
    };
  }

  function applyWorkspaceBootstrap(payload = {}) {
    if (!payload || typeof payload !== 'object') return false;

    appState.profile = payload.profile || appState.profile;
    appState.preferences = payload.preferences || appState.preferences;
    appState.billing = payload.billing || appState.billing || { user_id: appState.user?.id || null, plan_tier: 'free', status: 'active' };

    const preferredTheme = appState.preferences?.theme === 'light' ? 'light' : 'dark';
    applyTheme(preferredTheme);
    storeTheme(preferredTheme);

    if (Array.isArray(payload.templates)) {
      templateDatabase = payload.templates.map(mapTemplateRow);
    }

    deploymentDatabase = normalizeRpcArray(payload.deployments);
    projectDatabase = normalizeRpcArray(payload.projects).map(mapProjectRow);
    rebuildLibraryFromProjects();

    conversationList = normalizeRpcArray(payload.conversations).map(conversation => ({
      ...conversation,
      messages_loaded: false
    }));

    Object.keys(chatDatabase).forEach(key => delete chatDatabase[key]);
    const messagesByConversation = payload.messages_by_conversation || {};
    const rpcMessageLimit = Number(payload.limits?.message_limit_per_conversation || 0);
    conversationList.forEach(conversation => {
      const rows = normalizeRpcArray(messagesByConversation[conversation.id]);
      chatDatabase[conversation.id] = rows.map(mapRpcMessageRow);
      conversation.messages_loaded = rows.length > 0 && (!rpcMessageLimit || rows.length < rpcMessageLimit);
    });

    return true;
  }

  async function loadWorkspaceBootstrapFromRpc(user) {
    if (!supabaseClient || !user?.id) return false;

    try {
      const { data, error } = await runSupabaseQuery(
        'rpc.get_nexora_chat_bootstrap_v2',
        () => supabaseClient.rpc('get_nexora_chat_bootstrap_v2', {
          p_recent_conversation_limit: 35,
          p_message_limit_per_conversation: 0,
          p_project_limit: 30,
          p_template_limit: 60
        }),
        8500
      );

      if (error) {
        recordDatabaseError('rpc.get_nexora_chat_bootstrap_v2', error);
      } else if (applyWorkspaceBootstrap(data)) {
        return true;
      }

      const legacy = await runSupabaseQuery(
        'rpc.get_user_dashboard',
        () => supabaseClient.rpc('get_user_dashboard', {
          p_user_id: user.id,
          p_conversations_limit: 40,
          p_projects_limit: 50
        }),
        8500
      );

      if (legacy.error) {
        recordDatabaseError('rpc.get_user_dashboard', legacy.error);
        return false;
      }

      return applyLegacyDashboardBootstrap(legacy.data);
    } catch (error) {
      recordDatabaseError('rpc.get_nexora_chat_bootstrap_v2', error);
      return false;
    }
  }

  function applyLegacyDashboardBootstrap(payload = {}) {
    if (!payload || typeof payload !== 'object') return false;

    appState.profile = payload.profile || appState.profile;
    appState.preferences = payload.preferences || appState.preferences;
    appState.billing = payload.billing || appState.billing || { user_id: appState.user?.id || null, plan_tier: 'free', status: 'active' };

    const preferredTheme = appState.preferences?.theme === 'light' ? 'light' : 'dark';
    applyTheme(preferredTheme);
    storeTheme(preferredTheme);

    deploymentDatabase = normalizeRpcArray(payload.deployments);
    projectDatabase = normalizeRpcArray(payload.projects).map(mapProjectRow);
    rebuildLibraryFromProjects();

    conversationList = normalizeRpcArray(payload.conversations).map(conversation => ({
      ...conversation,
      messages_loaded: false
    }));

    Object.keys(chatDatabase).forEach(key => delete chatDatabase[key]);
    const groupedMessages = {};
    normalizeRpcArray(payload.messages).forEach(message => {
      if (!message?.conversation_id) return;
      groupedMessages[message.conversation_id] = groupedMessages[message.conversation_id] || [];
      groupedMessages[message.conversation_id].push(mapRpcMessageRow(message));
    });

    conversationList.forEach(conversation => {
      chatDatabase[conversation.id] = groupedMessages[conversation.id] || [];
      conversation.messages_loaded = chatDatabase[conversation.id].length > 0;
    });

    return true;
  }

  async function ensureProfile(user) {
    if (!supabaseClient || !user?.id) return;
    const metadata = user.user_metadata || {};
    const fallbackProfile = {
      id: user.id,
      name: metadata.full_name || metadata.name || user.email?.split('@')[0] || 'User',
      email: user.email || null,
      avatar_url: metadata.avatar_url || metadata.picture || null
    };

    const { data, error } = await runSupabaseQuery(
      'profiles.select',
      () => supabaseClient.from('profiles').select('id,name,email,avatar_url,created_at').eq('id', user.id).maybeSingle()
    );
    if (error) {
      recordDatabaseError('profiles.select', error);
      return;
    }
    if (data) {
      appState.profile = data;
      const needsUpdate = (!data.name && fallbackProfile.name) || data.email !== fallbackProfile.email || (!data.avatar_url && fallbackProfile.avatar_url);
      if (needsUpdate) {
        const { data: updated, error: updateError } = await runSupabaseQuery(
          'profiles.update',
          () => supabaseClient
            .from('profiles')
            .update({
              name: data.name || fallbackProfile.name,
              email: fallbackProfile.email,
              avatar_url: data.avatar_url || fallbackProfile.avatar_url
            })
            .eq('id', user.id)
            .select()
            .maybeSingle()
        );
        if (updateError) recordDatabaseError('profiles.update', updateError);
        if (updated) appState.profile = updated;
      }
      return;
    }

    const { data: created, error: insertError } = await runSupabaseQuery(
      'profiles.insert',
      () => supabaseClient.from('profiles').insert(fallbackProfile).select().maybeSingle()
    );
    if (insertError) {
      recordDatabaseError('profiles.insert', insertError);
      return;
    }
    appState.profile = created || fallbackProfile;
  }

  async function ensureUserPreferences(userId) {
    if (!supabaseClient || !userId) return;
    const { data, error } = await runSupabaseQuery(
      'user_preferences.select',
      () => supabaseClient
        .from('user_preferences')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    );
    if (error) {
      recordDatabaseError('user_preferences.select', error);
      return;
    }

    if (data) {
      appState.preferences = data;
      applyTheme(data.theme === 'light' ? 'light' : 'dark');
      storeTheme(data.theme === 'light' ? 'light' : 'dark');
      return;
    }

    const preferredTheme = readStoredTheme() === 'light' ? 'light' : 'dark';
    const { data: created, error: insertError } = await runSupabaseQuery(
      'user_preferences.insert',
      () => supabaseClient
        .from('user_preferences')
        .insert({ user_id: userId, theme: preferredTheme, email_notifications: true })
        .select()
        .maybeSingle()
    );
    if (insertError) {
      recordDatabaseError('user_preferences.insert', insertError);
      return;
    }
    appState.preferences = created || { user_id: userId, theme: preferredTheme, email_notifications: true };
  }

  async function ensureBilling(userId) {
    if (!supabaseClient || !userId) return;
    const { data, error } = await runSupabaseQuery(
      'billing.select',
      () => supabaseClient
        .from('billing')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    );
    if (error) {
      recordDatabaseError('billing.select', error);
      return;
    }

    if (data) {
      appState.billing = data;
      return;
    }

    const { data: created, error: insertError } = await runSupabaseQuery(
      'billing.insert',
      () => supabaseClient
        .from('billing')
        .insert({ user_id: userId, plan_tier: 'free', status: 'active' })
        .select()
        .maybeSingle()
    );
    if (insertError) {
      recordDatabaseError('billing.insert', insertError);
      return;
    }
    appState.billing = created || { user_id: userId, plan_tier: 'free', status: 'active' };
  }

  async function loadTemplatesFromDatabase() {
    if (!supabaseClient) return;
    const { data, error } = await runSupabaseQuery(
      'templates.select',
      () => supabaseClient.from('templates').select('id,name,description,source_url,created_at').order('created_at', { ascending: false }).limit(60)
    );
    if (!error && data?.length) {
      templateDatabase = data.map(mapTemplateRow);
      return;
    }
    if (error) {
      recordDatabaseError('templates.select', error);
      return;
    }

    const seedRows = defaultTemplates.map(template => ({
      name: template.title,
      description: template.desc,
      source_url: template.source_url
    }));
    const { data: seeded, error: seedError } = await runSupabaseQuery(
      'templates.seed',
      () => supabaseClient.from('templates').insert(seedRows).select()
    );
    if (seedError) {
      recordDatabaseError('templates.seed', seedError);
      return;
    }
    if (seeded?.length) templateDatabase = seeded.map(mapTemplateRow);
  }

  async function loadProjectsFromDatabase() {
    if (!supabaseClient || !appState.user?.id) return;
    const [deploymentsResult, projectsResult] = await Promise.allSettled([
      runSupabaseQuery(
        'deployments.select',
        () => supabaseClient.from('deployments').select('id,project_id,user_id,deployment_url,status,created_at').eq('user_id', appState.user.id).order('created_at', { ascending: false }).limit(80)
      ),
      runSupabaseQuery(
        'projects.select',
        () => supabaseClient.from('projects').select('id,user_id,template_id,name,description,created_at,updated_at').eq('user_id', appState.user.id).order('updated_at', { ascending: false }).limit(30)
      )
    ]);
    const deploymentsPayload = deploymentsResult.status === 'fulfilled' ? deploymentsResult.value : { data: [], error: deploymentsResult.reason };
    const projectsPayload = projectsResult.status === 'fulfilled' ? projectsResult.value : { data: [], error: projectsResult.reason };
    const { data: deployments, error: deploymentsError } = deploymentsPayload;
    const { data: projects, error: projectsError } = projectsPayload;
    if (deploymentsError) recordDatabaseError('deployments.select', deploymentsError);
    deploymentDatabase = !deploymentsError && Array.isArray(deployments) ? deployments : [];
    if (projectsError) recordDatabaseError('projects.select', projectsError);
    projectDatabase = !projectsError && Array.isArray(projects) ? projects.map(mapProjectRow) : [];
    rebuildLibraryFromProjects();
  }

  async function loadConversationsFromDatabase() {
    if (!supabaseClient || !appState.user?.id) return;
    const { data: conversations, error: conversationsError } = await runSupabaseQuery(
      'conversations.select',
      () => supabaseClient
        .from('conversations')
        .select('id,user_id,project_id,title,created_at,updated_at')
        .eq('user_id', appState.user.id)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false, nullsFirst: false })
        .limit(35)
    );

    if (conversationsError) {
      recordDatabaseError('conversations.select', conversationsError);
      return;
    }
    conversationList = Array.isArray(conversations) ? conversations : [];
    conversationList.forEach(conversation => {
      chatDatabase[conversation.id] = chatDatabase[conversation.id] || [];
    });

    conversationList.forEach(conversation => {
      if (!Array.isArray(chatDatabase[conversation.id])) chatDatabase[conversation.id] = [];
      if (chatDatabase[conversation.id].length) conversation.messages_loaded = true;
    });
  }

  async function loadConversationMessagesFromDatabase(conversationId) {
    if (!supabaseClient || !appState.user?.id || !conversationId || String(conversationId).startsWith('local-')) return chatDatabase[conversationId] || [];
    const conversation = conversationList.find(item => item.id === conversationId);
    if (conversation?.messages_loaded && Array.isArray(chatDatabase[conversationId])) return chatDatabase[conversationId];

    // Load the complete transcript instead of silently truncating long chats. The
    // model-facing context layer performs semantic compaction only when the
    // configured 100k-token window is approached.
    const pageSize = 500;
    const messageRows = [];
    let offset = 0;
    let loadError = null;

    while (true) {
      const { data, error } = await runSupabaseQuery(
        `messages.select.${offset}`,
        () => supabaseClient
          .from('messages')
          .select('id,conversation_id,role,content,created_at')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true })
          .range(offset, offset + pageSize - 1)
      );

      if (error) {
        loadError = error;
        break;
      }

      const page = Array.isArray(data) ? data : [];
      messageRows.push(...page);
      if (page.length < pageSize) break;
      offset += page.length;
    }

    if (loadError) {
      recordDatabaseError('messages.select', loadError);
      showNexoraToast('Could not load this chat history. Try refreshing if it stays empty.', 'error', 5200);
      return chatDatabase[conversationId] || [];
    }

    const messages = messageRows
      .map(message => ({ sender: message.role, text: message.content, id: message.id }));
    chatDatabase[conversationId] = messages;
    if (conversation) conversation.messages_loaded = true;
    persistWorkspace();
    return messages;
  }

  function renderProfile() {
    const editableEmail = appState.profile?.email || appState.user?.email || '';
    const displayEmail = editableEmail || 'Local user';
    const profileName = document.getElementById('profileName');
    const profileAvatar = document.getElementById('profileAvatar');
    const plan = getPlanTier();
    const planLabel = getPlanLabel(plan);
    const avatarUrl = appState.profile?.avatar_url;
    if (profileName) profileName.textContent = getUserDisplayName();
    setAvatarNode(profileAvatar, avatarUrl);
    setAvatarNode(document.getElementById('profileDropupAvatar'), avatarUrl);
    if (profileNameInput) profileNameInput.value = getUserDisplayName();
    if (profileEmailInput) profileEmailInput.value = editableEmail;
    if (profileAvatarInput) profileAvatarInput.value = appState.profile?.avatar_url || '';
    if (dropupProfileNameInput) dropupProfileNameInput.value = getUserDisplayName();
    if (dropupProfileEmailInput) dropupProfileEmailInput.value = editableEmail;
    if (dropupProfileAvatarInput) dropupProfileAvatarInput.value = appState.profile?.avatar_url || '';
    if (profilePlanText) profilePlanText.textContent = planLabel;
    document.getElementById('profileDropupName') && (document.getElementById('profileDropupName').textContent = getUserDisplayName());
    document.getElementById('profileDropupEmail') && (document.getElementById('profileDropupEmail').textContent = displayEmail);
    document.getElementById('profileDropupPlan') && (document.getElementById('profileDropupPlan').textContent = planLabel);
    const billingText = `${appState.billing?.status || 'active'}${appState.billing?.current_period_end ? ` - renews ${formatDate(appState.billing.current_period_end)}` : ''}`;
    document.getElementById('profileDropupBilling') && (document.getElementById('profileDropupBilling').textContent = billingText);
    chatInputContainer?.classList.toggle('has-pro-plan', hasActivePaidPlan());
    if (btnProPlan) {
      btnProPlan.classList.toggle('is-paid', hasActivePaidPlan());
      const textNode = Array.from(btnProPlan.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
      if (textNode) textNode.textContent = hasActivePaidPlan() ? ' Paid Plan' : ' Upgrade';
    }
    updateProPlanModalState();
    renderModelMenu();
    document.getElementById('settingsProfileName') && (document.getElementById('settingsProfileName').textContent = getUserDisplayName());
    document.getElementById('settingsProfileEmail') && (document.getElementById('settingsProfileEmail').textContent = displayEmail);
  }

  function renderSettings() {
    const plan = getPlanTier();
    const status = appState.billing?.status || 'active';
    const period = appState.billing?.current_period_end ? formatDate(appState.billing.current_period_end) : 'No renewal date';
    const prefs = appState.preferences || {};
    const setText = (id, text) => {
      const node = document.getElementById(id);
      if (node) node.textContent = text;
    };
    setText('settingsProfileName', getUserDisplayName());
    setText('settingsProfileEmail', appState.profile?.email || appState.user?.email || 'Local mode');
    setText('settingsBillingPlan', getPlanLabel(plan));
    setText('settingsBillingStatus', `${status} - ${period}`);
    setText('settingsThemeValue', prefs.theme === 'light' ? 'Light' : 'Dark');
    setText('settingsEmailValue', prefs.email_notifications === false ? 'Off' : 'On');
    if (appState.databaseErrors.length) {
      const latest = appState.databaseErrors[appState.databaseErrors.length - 1];
      setText('settingsBillingStatus', `${status} - ${period}. Last database issue: ${latest.scope}`);
    }
    if (emailNotificationsToggle) emailNotificationsToggle.checked = prefs.email_notifications !== false;
    renderTabCounts();
  }

  function renderTabCounts() {
    const setText = (id, text) => {
      const node = document.getElementById(id);
      if (node) node.textContent = text;
    };
    setText('templatesCount', String(templateDatabase.length));
    setText('projectsCount', String(projectDatabase.length));
    setText('libraryCount', String(libraryDatabase.length));
    setText('archiveCount', String(archiveDatabase.length));
  }

  function renderModelMenu() {
    const paid = hasActivePaidPlan();
    if (selectedOpenRouterModel.premium && !paid) {
      selectedOpenRouterModel = configuredModels.find(model => !model.premium) || selectedOpenRouterModel;
      NEXORA_STORAGE.set(MODEL_STORAGE_KEY, selectedOpenRouterModel.id);
    }
    if (selectedModelLabel) selectedModelLabel.textContent = selectedOpenRouterModel.label || selectedOpenRouterModel.id || 'Select model';
    if (!modelMenu) return;
    if (!configuredModels.length) {
      modelMenu.innerHTML = '<div class="model-empty-state">Connect a provider in Settings to load its live model list.</div>';
      return;
    }
    modelMenu.innerHTML = configuredModels.map(model => {
      const selected = model.id === selectedOpenRouterModel.id;
      const locked = model.premium && !paid;
      return `
        <div class="model-item ${selected ? 'selected' : ''} ${locked ? 'locked' : ''} ${model.premium ? 'premium-model' : ''}"
          data-model-id="${escapeHTML(model.id)}"
          data-model-label="${escapeHTML(model.label)}"
          data-premium="${model.premium ? 'true' : 'false'}"
          title="${escapeHTML(model.id)}">
          <span class="${model.premium ? 'premium-text' : ''}">${escapeHTML(model.label)}</span>
          ${selected ? selectedCheckIconMarkup() : ''}
          ${locked ? lockIconMarkup() : ''}
        </div>
      `;
    }).join('');
  }

  const FALLBACK_REASONING_EFFORTS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']);
  const REASONING_EFFORT_LABELS = Object.freeze({
    minimal: 'Minimal', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max'
  });

  function normalizeReasoningEffort(value, fallback = 'medium') {
    const normalized = String(value || '').trim().toLowerCase().replace('extra-high', 'xhigh');
    return /^(?:minimal|low|medium|high|xhigh|max)$/.test(normalized) ? normalized : fallback;
  }

  function getSelectedModelReasoningEfforts() {
    const direct = Array.isArray(selectedOpenRouterModel?.supportedReasoningEfforts)
      ? selectedOpenRouterModel.supportedReasoningEfforts
      : [];
    const nested = selectedOpenRouterModel?.reasoning;
    const nestedEfforts = Array.isArray(nested?.supportedReasoningEfforts)
      ? nested.supportedReasoningEfforts
      : (Array.isArray(nested?.efforts) ? nested.efforts : []);
    const values = [...direct, ...nestedEfforts]
      .map(item => normalizeReasoningEffort(typeof item === 'string' ? item : (item?.reasoningEffort || item?.effort), ''))
      .filter(Boolean);
    return [...new Set(values)].filter(value => value !== 'none');
  }

  function renderReasoningEffortOptions() {
    if (!reasoningEffortSelect) return;
    const supported = getSelectedModelReasoningEfforts();
    const values = supported.length ? supported : [...FALLBACK_REASONING_EFFORTS];
    const modelDefault = normalizeReasoningEffort(selectedOpenRouterModel?.defaultReasoningEffort, '');
    if (!values.includes(selectedReasoningEffort)) {
      selectedReasoningEffort = values.includes(modelDefault)
        ? modelDefault
        : (values.includes('medium') ? 'medium' : values[0]);
      NEXORA_STORAGE.set(REASONING_EFFORT_STORAGE_KEY, selectedReasoningEffort);
    }
    reasoningEffortSelect.replaceChildren(...values.map(value => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = REASONING_EFFORT_LABELS[value] || value;
      return option;
    }));
    reasoningEffortSelect.value = selectedReasoningEffort;

    if (selectedReasoningLabel) {
      selectedReasoningLabel.textContent = REASONING_EFFORT_LABELS[selectedReasoningEffort] || selectedReasoningEffort;
    }

    if (reasoningMenu) {
      reasoningMenu.innerHTML = values.map(val => {
        const isSelected = val === selectedReasoningEffort;
        const label = REASONING_EFFORT_LABELS[val] || val;
        return `
          <button class="reasoning-item ${isSelected ? 'selected' : ''}" type="button" data-value="${val}" role="option" aria-selected="${isSelected}">
            <span>${escapeHTML(label)}</span>
            ${isSelected ? selectedCheckIconMarkup() : ''}
          </button>
        `;
      }).join('');
    }
  }

  function updateThinkingModeUi() {
    renderReasoningEffortOptions();
    if (btnThinkingMode) {
      btnThinkingMode.classList.toggle('is-active', thinkingModeEnabled);
      btnThinkingMode.setAttribute('aria-pressed', thinkingModeEnabled ? 'true' : 'false');
      btnThinkingMode.setAttribute('aria-label', thinkingModeEnabled ? 'Turn thinking mode off' : 'Turn thinking mode on');
      btnThinkingMode.title = `Thinking mode is ${thinkingModeEnabled ? 'on' : 'off'}`;
    }
    if (btnReasoningPicker) {
      btnReasoningPicker.disabled = !thinkingModeEnabled;
      btnReasoningPicker.classList.toggle('disabled', !thinkingModeEnabled);
      btnReasoningPicker.setAttribute('aria-disabled', thinkingModeEnabled ? 'false' : 'true');
      btnReasoningPicker.title = thinkingModeEnabled
        ? `Reasoning effort: ${REASONING_EFFORT_LABELS[selectedReasoningEffort] || selectedReasoningEffort}`
        : 'Turn thinking mode on to choose reasoning effort';
    }
    if (reasoningEffortSelect) {
      reasoningEffortSelect.disabled = !thinkingModeEnabled;
    }
  }

  function getReasoningRequestOptions() {
    return {
      enableThinking: thinkingModeEnabled,
      reasoningEffort: thinkingModeEnabled ? selectedReasoningEffort : 'none'
    };
  }

  function selectOpenRouterModel(modelId) {
    const nextModel = configuredModels.find(model => model.id === modelId);
    if (!nextModel) return false;
    if (nextModel.premium && !hasActivePaidPlan()) {
      proPlanModal?.classList.add('visible');
      modelMenu?.classList.remove('open');
      return false;
    }
    selectedOpenRouterModel = nextModel;
    NEXORA_STORAGE.set(MODEL_STORAGE_KEY, nextModel.id);
    const activeProvider = normalizeAgentProvider(NEXORA_STORAGE.get(AGENT_PROVIDER_STORAGE_KEY, 'openrouter'));
    NEXORA_STORAGE.set(AGENT_MODEL_STORAGE[activeProvider], nextModel.id);
    if (agentModelPathInput) agentModelPathInput.value = nextModel.id;
    renderModelMenu();
    updateThinkingModeUi();
    modelMenu?.classList.remove('open');
    showNexoraToast?.(`Using ${nextModel.label}`, 'success', 2200);
    return true;
  }

  function normalizeAgentProvider(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'nvidia' || normalized === 'codex') return normalized;
    return 'openrouter';
  }

  function providerLabel(provider = '') {
    if (provider === 'nvidia') return 'NVIDIA NIM';
    if (provider === 'codex') return 'ChatGPT Codex';
    return 'OpenRouter';
  }

  async function getNexoraAccessToken() {
    if (!supabaseClient?.auth?.getSession) throw new Error('Nexora authentication is unavailable. Sign in again.');
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    const token = data?.session?.access_token || '';
    if (!token) throw new Error('Your Nexora session expired. Sign in again to continue.');
    return token;
  }

  function getAgentRuntimeConfig({ fromUi = false } = {}) {
    const provider = normalizeAgentProvider(fromUi ? agentProviderSelect?.value : NEXORA_STORAGE.get(AGENT_PROVIDER_STORAGE_KEY, 'openrouter'));
    const keyStorage = AGENT_API_KEY_STORAGE[provider];
    const storedKey = keyStorage ? NEXORA_STORAGE.get(keyStorage, '') : '';
    const apiKey = provider === 'codex' ? '' : String(fromUi ? (agentApiKeyInput?.value || storedKey) : storedKey || '').trim();
    const fallbackModel = provider === 'openrouter' ? getSelectedOpenRouterModel() : '';
    const storedModel = NEXORA_STORAGE.get(AGENT_MODEL_STORAGE[provider], fallbackModel);
    const uiModel = fromUi ? String(agentModelPathInput?.value || agentModelSelect?.value || '').trim() : '';
    const modelId = uiModel || String(storedModel || '').trim();
    const baseStorage = AGENT_BASE_URL_STORAGE[provider];
    const storedBase = baseStorage ? NEXORA_STORAGE.get(baseStorage, '') : '';
    const uiBase = fromUi && provider !== 'codex' ? String(agentBaseUrlInput?.value || '').trim() : '';
    const baseUrl = provider === 'codex' ? '' : (uiBase || String(storedBase || '').trim() || AGENT_DEFAULT_BASE_URL[provider]).replace(/\/+$/, '');
    return { provider, apiKey, modelId, baseUrl };
  }

  function setAgentRuntimeStatus(message, kind = '') {
    if (!agentRuntimeStatus) return;
    agentRuntimeStatus.textContent = message;
    agentRuntimeStatus.classList.remove('is-ready', 'is-working', 'is-error');
    if (kind) agentRuntimeStatus.classList.add(`is-${kind}`);
  }

  function updateCodexAccountPanel(state = codexRuntimeState, { working = false, error = '' } = {}) {
    codexRuntimeState = { ...codexRuntimeState, ...(state || {}) };
    if (!codexAccountPanel) return;
    const connected = Boolean(codexRuntimeState.connected);
    codexAccountDot?.classList.remove('is-ready', 'is-working', 'is-error');
    if (working) codexAccountDot?.classList.add('is-working');
    else if (error) codexAccountDot?.classList.add('is-error');
    else if (connected) codexAccountDot?.classList.add('is-ready');

    if (codexAccountTitle) {
      if (working) codexAccountTitle.textContent = 'Waiting for ChatGPT authorization…';
      else if (error) codexAccountTitle.textContent = 'ChatGPT Codex connection needs attention';
      else if (connected) codexAccountTitle.textContent = codexRuntimeState.account_email ? `Connected · ${codexRuntimeState.account_email}` : 'ChatGPT Codex connected';
      else codexAccountTitle.textContent = 'ChatGPT Codex not connected';
    }
    if (codexAccountSubtitle) {
      if (error) codexAccountSubtitle.textContent = error;
      else if (connected) {
        const plan = codexRuntimeState.plan_type ? `${codexRuntimeState.plan_type} plan` : 'ChatGPT account';
        codexAccountSubtitle.textContent = `${plan} · encrypted credential vault · tokens never enter browser localStorage.`;
      } else if (codexRuntimeState.configured === false) {
        codexAccountSubtitle.textContent = 'Server vault setup is required on Vercel before ChatGPT Codex can be connected.';
      } else {
        codexAccountSubtitle.textContent = 'Connect securely with OpenAI device-code authentication. Nexora never receives your ChatGPT password.';
      }
    }
    if (btnCodexConnect) btnCodexConnect.hidden = connected;
    if (btnCodexDisconnect) btnCodexDisconnect.hidden = !connected;
  }

  async function refreshCodexRuntimeStatus({ quiet = false } = {}) {
    if (normalizeAgentProvider(agentProviderSelect?.value || NEXORA_STORAGE.get(AGENT_PROVIDER_STORAGE_KEY, 'openrouter')) !== 'codex' && quiet) return codexRuntimeState;
    try {
      const token = await getNexoraAccessToken();
      const result = await agentJsonRequest('/api/codex/status', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
      });
      codexRuntimeState = { ...codexRuntimeState, ...result };
      updateCodexAccountPanel(codexRuntimeState);
      if (normalizeAgentProvider(agentProviderSelect?.value) === 'codex') {
        if (result.connected && getAgentRuntimeConfig({ fromUi: true }).modelId) setAgentRuntimeStatus('Codex ready', 'ready');
        else if (result.connected) setAgentRuntimeStatus('Codex connected · choose model', 'working');
        else if (result.configured === false) setAgentRuntimeStatus('Codex vault setup required', 'error');
        else setAgentRuntimeStatus('Connect ChatGPT');
      }
      return codexRuntimeState;
    } catch (error) {
      updateCodexAccountPanel(codexRuntimeState, { error: error.message });
      if (!quiet) throw error;
      return codexRuntimeState;
    }
  }

  function syncAgentRuntimeUi() {
    const config = getAgentRuntimeConfig();
    const isCodex = config.provider === 'codex';
    if (agentProviderSelect) agentProviderSelect.value = config.provider;
    if (agentApiKeyField) agentApiKeyField.hidden = isCodex;
    if (agentBaseUrlField) agentBaseUrlField.hidden = isCodex;
    if (codexAccountPanel) codexAccountPanel.hidden = !isCodex;
    if (agentApiKeyInput) agentApiKeyInput.value = config.apiKey;
    if (agentBaseUrlInput) {
      const baseStorage = AGENT_BASE_URL_STORAGE[config.provider];
      const storedBase = baseStorage ? NEXORA_STORAGE.get(baseStorage, '') : '';
      agentBaseUrlInput.value = storedBase || '';
      agentBaseUrlInput.placeholder = AGENT_DEFAULT_BASE_URL[config.provider] || 'Not used by ChatGPT Codex';
    }
    if (agentModelPathInput) agentModelPathInput.value = config.modelId || '';
    if (agentRuntimeNote) {
      agentRuntimeNote.textContent = isCodex
        ? 'ChatGPT Codex uses OpenAI device-code sign-in. The sensitive Codex auth cache is encrypted server-side and tied to your authenticated Nexora user; it is never stored in browser localStorage.'
        : 'The provider API key is saved only in this browser localStorage and is sent to Nexora only for the selected provider request.';
    }
    if (isCodex) {
      updateCodexAccountPanel(codexRuntimeState);
      if (codexRuntimeState.connected && config.modelId) setAgentRuntimeStatus('Codex ready', 'ready');
      else if (codexRuntimeState.connected) setAgentRuntimeStatus('Codex connected · choose model', 'working');
      else setAgentRuntimeStatus('Connect ChatGPT');
    } else if (config.apiKey && config.modelId) setAgentRuntimeStatus('Configured', 'ready');
    else if (config.apiKey) setAgentRuntimeStatus('Key saved · choose model', 'working');
    else setAgentRuntimeStatus('Not configured');
  }

  function applyAgentModelsToPicker(models = [], selectedId = '') {
    const normalized = models
      .map((model, index) => normalizeModelConfig({
        id: model?.id,
        label: model?.name && model.name !== model.id ? `${model.name} · ${model.id}` : model?.id,
        premium: false,
        default: Boolean(model?.isDefault) || index === 0,
        reasoning: model?.reasoning || null,
        supported_parameters: model?.supported_parameters || model?.supportedParameters || [],
        supportedReasoningEfforts: model?.supportedReasoningEfforts || model?.supported_reasoning_efforts || [],
        defaultReasoningEffort: model?.defaultReasoningEffort || model?.default_reasoning_effort || null
      }))
      .filter(model => model.id);
    if (!normalized.length) return;
    configuredModels = normalized;
    liveModelsProvider = normalizeAgentProvider(agentProviderSelect?.value || NEXORA_STORAGE.get(AGENT_PROVIDER_STORAGE_KEY, 'openrouter'));
    const target = selectedId || getAgentRuntimeConfig({ fromUi: true }).modelId || normalized[0].id;
    selectedOpenRouterModel = configuredModels.find(model => model.id === target) || configuredModels[0];
    NEXORA_STORAGE.set(MODEL_STORAGE_KEY, selectedOpenRouterModel.id);
    renderModelMenu();
    updateThinkingModeUi();
  }

  async function agentJsonRequest(url, options = {}, signal = null) {
    let response;
    try {
      response = await fetch(url, {
        ...options,
        signal: signal || options.signal || undefined,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      throw new Error(`Nexora agent API is unreachable. On Vercel, check /api/health and the deployment Function logs. ${error?.message || ''}`.trim());
    }
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { detail: text }; }
    if (!response.ok) {
      const detail = data?.detail || data?.error || data?.message || `HTTP ${response.status}`;
      throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    }
    return data || {};
  }

  function persistAgentRuntimeConfig() {
    const config = getAgentRuntimeConfig({ fromUi: true });
    NEXORA_STORAGE.set(AGENT_PROVIDER_STORAGE_KEY, config.provider);
    if (config.provider !== 'codex') {
      NEXORA_STORAGE.set(AGENT_API_KEY_STORAGE[config.provider], config.apiKey);
      const explicitBase = String(agentBaseUrlInput?.value || '').trim();
      if (explicitBase) NEXORA_STORAGE.set(AGENT_BASE_URL_STORAGE[config.provider], explicitBase.replace(/\/+$/, ''));
      else {
        try { localStorage.removeItem(AGENT_BASE_URL_STORAGE[config.provider]); } catch {}
      }
    }
    NEXORA_STORAGE.set(AGENT_MODEL_STORAGE[config.provider], config.modelId);
    if (config.modelId) {
      const found = configuredModels.find(model => model.id === config.modelId);
      if (found) {
        selectedOpenRouterModel = found;
        NEXORA_STORAGE.set(MODEL_STORAGE_KEY, found.id);
        renderModelMenu();
      }
    }
    if (config.provider === 'codex') {
      setAgentRuntimeStatus(codexRuntimeState.connected && config.modelId ? 'Codex ready' : 'Codex preference saved', codexRuntimeState.connected ? 'ready' : 'working');
    } else {
      setAgentRuntimeStatus(config.apiKey && config.modelId ? 'Configured' : 'Saved', config.apiKey ? 'ready' : 'working');
    }
    return config;
  }

  function populateAgentModelSelect(models = [], remembered = '') {
    if (!agentModelSelect) return;
    agentModelSelect.innerHTML = models.map(model => `<option value="${escapeHTML(model.id)}">${escapeHTML(model.name && model.name !== model.id ? `${model.name} — ${model.id}` : model.id)}</option>`).join('');
    if (!models.length) {
      agentModelSelect.innerHTML = '<option value="">No models returned</option>';
      return;
    }
    const selected = remembered && models.some(model => model.id === remembered)
      ? remembered
      : (models.find(model => model.isDefault)?.id || models[0].id);
    agentModelSelect.value = selected;
    if (agentModelPathInput) agentModelPathInput.value = selected;
    const provider = normalizeAgentProvider(agentProviderSelect?.value);
    NEXORA_STORAGE.set(AGENT_MODEL_STORAGE[provider], selected);
    applyAgentModelsToPicker(models, selected);
  }

  async function loadAgentRuntimeModels() {
    const config = persistAgentRuntimeConfig();
    if (config.provider !== 'codex' && !config.apiKey) throw new Error(`Add your ${providerLabel(config.provider)} API key first.`);
    if (config.provider === 'codex' && !codexRuntimeState.connected) throw new Error('Connect your ChatGPT Codex account first.');
    setAgentRuntimeStatus('Loading models…', 'working');
    [btnAgentLoadModels, btnAgentTestModel, btnAgentSaveConfig].forEach(button => { if (button) button.disabled = true; });
    try {
      let result;
      if (config.provider === 'codex') {
        const token = await getNexoraAccessToken();
        result = await agentJsonRequest('/api/codex/models', {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` }
        });
        codexRuntimeState = { ...codexRuntimeState, connected: true, account_email: result.account_email, plan_type: result.plan_type, models: result.models || [] };
        updateCodexAccountPanel(codexRuntimeState);
      } else {
        result = await agentJsonRequest('/api/models/discover', {
          method: 'POST',
          body: JSON.stringify({ provider: config.provider, api_key: config.apiKey, base_url: config.baseUrl })
        });
      }
      if (!result.ok) throw new Error(result.error || 'Provider returned no models.');
      const models = Array.isArray(result.models) ? result.models : [];
      if (!models.length) throw new Error('The provider returned an empty model list. You can still enter a model path manually.');
      populateAgentModelSelect(models, config.modelId);
      setAgentRuntimeStatus(`${models.length} models loaded`, 'ready');
      return models;
    } finally {
      [btnAgentLoadModels, btnAgentTestModel, btnAgentSaveConfig].forEach(button => { if (button) button.disabled = false; });
    }
  }

  async function refreshLiveModelsForCurrentProvider({ quiet = false } = {}) {
    const config = getAgentRuntimeConfig();
    try {
      if (config.provider === 'codex') {
        const state = await refreshCodexRuntimeStatus({ quiet: true });
        if (!state.connected) return [];
      } else if (!config.apiKey) {
        return [];
      }
      return await loadAgentRuntimeModels();
    } catch (error) {
      if (!quiet) showNexoraToast?.(error.message, 'error', 7000);
      return [];
    }
  }

  async function testAgentRuntimeModel() {
    const config = persistAgentRuntimeConfig();
    if (config.provider !== 'codex' && !config.apiKey) throw new Error('Add an API key first.');
    if (config.provider === 'codex' && !codexRuntimeState.connected) throw new Error('Connect your ChatGPT Codex account first.');
    if (!config.modelId) throw new Error('Choose a model or enter its model path first.');
    setAgentRuntimeStatus('Testing model…', 'working');
    if (btnAgentTestModel) btnAgentTestModel.disabled = true;
    try {
      let result;
      if (config.provider === 'codex') {
        const token = await getNexoraAccessToken();
        result = await agentJsonRequest('/api/codex/test', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({ model_id: config.modelId })
        });
      } else {
        result = await agentJsonRequest('/api/models/test', {
          method: 'POST',
          body: JSON.stringify({ provider: config.provider, model_id: config.modelId, api_key: config.apiKey, base_url: config.baseUrl })
        });
      }
      if (!result.ok) throw new Error(result.error || 'Model test failed.');
      setAgentRuntimeStatus('Model ready', 'ready');
      showNexoraToast?.(`${providerLabel(config.provider)} model connected`, 'success', 2400);
      return result;
    } finally {
      if (btnAgentTestModel) btnAgentTestModel.disabled = false;
    }
  }

  function processNamedSseBlock(block, fallbackEvent = 'message') {
    let name = fallbackEvent;
    const dataLines = [];
    for (const line of String(block || '').split(/\r?\n/)) {
      if (line.startsWith('event:')) name = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    const raw = dataLines.join('\n');
    let data = {};
    if (raw) {
      try { data = JSON.parse(raw); } catch { data = { message: raw }; }
    }
    return { name, data };
  }

  async function connectCodexAccount() {
    if (codexLoginController) codexLoginController.abort();
    codexLoginController = new AbortController();
    // Open synchronously from the user's click so popup blockers allow the
    // OpenAI device-code window; navigate it after the backend returns the URL.
    const authWindow = window.open('about:blank', 'nexoraCodexAuth', 'popup=yes,width=560,height=760');
    let token = '';
    try {
      token = await getNexoraAccessToken();
    } catch (error) {
      try { if (authWindow && !authWindow.closed) authWindow.close(); } catch {}
      codexLoginController = null;
      updateCodexAccountPanel(codexRuntimeState, { error: error.message });
      setAgentRuntimeStatus('Sign in to Nexora first', 'error');
      throw error;
    }
    updateCodexAccountPanel(codexRuntimeState, { working: true });
    setAgentRuntimeStatus('Waiting for ChatGPT sign-in…', 'working');
    if (codexDeviceCodeBox) codexDeviceCodeBox.hidden = true;
    if (btnCodexConnect) btnCodexConnect.disabled = true;
    if (authWindow) {
      try {
        authWindow.document.title = 'Nexora · ChatGPT Codex';
        authWindow.document.body.innerHTML = '<div style="font-family:system-ui;padding:32px;background:#0d1013;color:#fff;min-height:100vh"><h2>Preparing secure OpenAI sign-in…</h2><p style="color:#aeb5c0">Return to Nexora after authorization completes.</p></div>';
      } catch {}
    }
    try {
      const response = await fetch('/api/codex/login', {
        method: 'POST',
        signal: codexLoginController.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: '{}'
      });
      if (!response.ok || !response.body) {
        const text = await response.text().catch(() => '');
        throw new Error(text || `Codex login returned HTTP ${response.status}.`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let completed = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() || '';
        for (const block of blocks) {
          if (!block || block.startsWith(':')) continue;
          const { name, data } = processNamedSseBlock(block);
          if (name === 'device_code') {
            const url = String(data.verification_url || 'https://auth.openai.com/codex/device');
            const code = String(data.user_code || '');
            if (codexDeviceCode) codexDeviceCode.textContent = code || '—';
            if (codexVerificationLink) codexVerificationLink.href = url;
            if (codexDeviceCodeBox) codexDeviceCodeBox.hidden = false;
            try { if (authWindow && !authWindow.closed) authWindow.location.replace(url); } catch {}
            showNexoraToast?.('OpenAI sign-in opened. Use the displayed device code if requested.', 'info', 6000);
          } else if (name === 'complete') {
            completed = true;
            codexRuntimeState = {
              ...codexRuntimeState,
              configured: true,
              connected: true,
              account_email: data.account_email || null,
              plan_type: data.plan_type || null,
              models: Array.isArray(data.models) ? data.models : []
            };
            updateCodexAccountPanel(codexRuntimeState);
            populateAgentModelSelect(codexRuntimeState.models, getAgentRuntimeConfig({ fromUi: true }).modelId);
            persistAgentRuntimeConfig();
            setAgentRuntimeStatus('Codex connected', 'ready');
            showNexoraToast?.('ChatGPT Codex connected securely.', 'success', 3500);
            try { if (authWindow && !authWindow.closed) authWindow.close(); } catch {}
          } else if (name === 'failed') {
            throw new Error(data.error || 'ChatGPT Codex sign-in failed.');
          }
        }
      }
      if (!completed) throw new Error('ChatGPT Codex sign-in ended before completion. Try Connect ChatGPT again.');
      return codexRuntimeState;
    } catch (error) {
      try { if (authWindow && !authWindow.closed) authWindow.close(); } catch {}
      updateCodexAccountPanel(codexRuntimeState, { error: error.message });
      setAgentRuntimeStatus('Codex sign-in failed', 'error');
      throw error;
    } finally {
      codexLoginController = null;
      if (btnCodexConnect) btnCodexConnect.disabled = false;
    }
  }

  async function disconnectCodexAccount() {
    const token = await getNexoraAccessToken();
    if (btnCodexDisconnect) btnCodexDisconnect.disabled = true;
    try {
      await agentJsonRequest('/api/codex/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: '{}'
      });
      codexRuntimeState = { configured: true, connected: false, account_email: null, plan_type: null, models: [], verified_at: null };
      updateCodexAccountPanel(codexRuntimeState);
      if (codexDeviceCodeBox) codexDeviceCodeBox.hidden = true;
      if (agentModelSelect) agentModelSelect.innerHTML = '<option value="">Connect ChatGPT, then load models</option>';
      setAgentRuntimeStatus('Connect ChatGPT');
      showNexoraToast?.('ChatGPT Codex disconnected from Nexora.', 'success', 3000);
    } finally {
      if (btnCodexDisconnect) btnCodexDisconnect.disabled = false;
    }
  }

  function initializeAgentRuntimeSettings() {
    syncAgentRuntimeUi();
    updateThinkingModeUi();
    if (getAgentRuntimeConfig().provider === 'codex') refreshCodexRuntimeStatus({ quiet: true }).catch(() => {});
    agentProviderSelect?.addEventListener('change', () => {
      NEXORA_STORAGE.set(AGENT_PROVIDER_STORAGE_KEY, normalizeAgentProvider(agentProviderSelect.value));
      if (agentModelSelect) agentModelSelect.innerHTML = '<option value="">Load models for this provider</option>';
      configuredModels = [];
      liveModelsProvider = '';
      selectedOpenRouterModel = { id: '', label: 'Select model', premium: false, reasoning: null, supportedParameters: [], supportedReasoningEfforts: [], defaultReasoningEffort: null };
      renderModelMenu();
      syncAgentRuntimeUi();
      refreshLiveModelsForCurrentProvider({ quiet: true });
    });
    agentModelSelect?.addEventListener('change', () => {
      if (!agentModelSelect.value) return;
      if (agentModelPathInput) agentModelPathInput.value = agentModelSelect.value;
      const provider = normalizeAgentProvider(agentProviderSelect?.value);
      NEXORA_STORAGE.set(AGENT_MODEL_STORAGE[provider], agentModelSelect.value);
      const found = configuredModels.find(model => model.id === agentModelSelect.value);
      if (found) {
        selectedOpenRouterModel = found;
        NEXORA_STORAGE.set(MODEL_STORAGE_KEY, found.id);
        renderModelMenu();
      }
      syncAgentRuntimeUi();
      updateThinkingModeUi();
    });
    btnAgentToggleKey?.addEventListener('click', () => {
      if (!agentApiKeyInput) return;
      const show = agentApiKeyInput.type === 'password';
      agentApiKeyInput.type = show ? 'text' : 'password';
      btnAgentToggleKey.textContent = show ? 'Hide' : 'Show';
    });
    btnThinkingMode?.addEventListener('click', () => {
      thinkingModeEnabled = !thinkingModeEnabled;
      NEXORA_STORAGE.set(THINKING_MODE_STORAGE_KEY, thinkingModeEnabled ? 'true' : 'false');
      updateThinkingModeUi();
      showNexoraToast?.(`Thinking mode ${thinkingModeEnabled ? 'enabled' : 'disabled'}`, 'success', 1800);
    });
    reasoningEffortSelect?.addEventListener('change', () => {
      selectedReasoningEffort = normalizeReasoningEffort(reasoningEffortSelect.value);
      NEXORA_STORAGE.set(REASONING_EFFORT_STORAGE_KEY, selectedReasoningEffort);
      updateThinkingModeUi();
      showNexoraToast?.(`Reasoning effort set to ${REASONING_EFFORT_LABELS[selectedReasoningEffort] || selectedReasoningEffort}`, 'success', 1800);
    });
    btnAgentSaveConfig?.addEventListener('click', () => {
      const config = persistAgentRuntimeConfig();
      if (config.provider === 'codex') {
        showNexoraToast?.(codexRuntimeState.connected ? 'Codex model preference saved.' : 'Codex selected. Connect ChatGPT to use it.', codexRuntimeState.connected ? 'success' : 'info', 3000);
      } else {
        showNexoraToast?.(config.apiKey ? 'Agentic AI configuration saved in this browser.' : 'Provider preference saved. Add an API key to generate.', config.apiKey ? 'success' : 'info', 3000);
      }
    });
    btnAgentLoadModels?.addEventListener('click', () => loadAgentRuntimeModels().catch(error => {
      setAgentRuntimeStatus('Model load failed', 'error');
      showNexoraToast?.(error.message, 'error', 7000);
    }));
    btnAgentTestModel?.addEventListener('click', () => testAgentRuntimeModel().catch(error => {
      setAgentRuntimeStatus('Model test failed', 'error');
      showNexoraToast?.(error.message, 'error', 7000);
    }));
    btnCodexConnect?.addEventListener('click', () => connectCodexAccount().catch(error => {
      showNexoraToast?.(error.message, 'error', 8000);
    }));
    btnCodexDisconnect?.addEventListener('click', () => disconnectCodexAccount().catch(error => {
      showNexoraToast?.(error.message, 'error', 7000);
    }));
    btnCodexCopyCode?.addEventListener('click', async () => {
      const code = String(codexDeviceCode?.textContent || '').trim();
      if (!code || code === '—') return;
      try {
        await navigator.clipboard.writeText(code);
        showNexoraToast?.('OpenAI device code copied.', 'success', 1800);
      } catch {
        showNexoraToast?.('Copy was blocked. Select the device code manually.', 'info', 2800);
      }
    });
  }

  function getActiveConversationHistoryForAi() {
    const rows = activeChatId && Array.isArray(chatDatabase[activeChatId]) ? chatDatabase[activeChatId] : [];
    return rows
      .map(item => ({
        role: item.role || (item.sender === 'assistant' ? 'assistant' : 'user'),
        content: String(item.text || item.content || '').trim()
      }))
      .filter(item => item.content && ['user', 'assistant', 'system'].includes(item.role));
  }

  async function resolveActiveGeneratedProject() {
    if (currentGeneratedProject?.files?.length) return currentGeneratedProject;
    const conversation = conversationList.find(item => item.id === activeChatId);
    const projectId = conversation?.project_id;
    if (!projectId) return null;
    const stored = projectDatabase.find(item => item.id === projectId);
    if (!stored) return null;
    const hydrated = await hydrateProjectPayload(stored).catch(() => stored);
    const project = hydrated?.generatedProject || (hydrated?.files?.length ? {
      projectName: hydrated.title || 'Generated Website',
      files: hydrated.files,
      webProject: hydrated.webProject || null,
      visualDocument: hydrated.visualDocument || null
    } : null);
    if (project?.files?.length) currentGeneratedProject = project;
    return project;
  }

  function createConversationPlanCard(route = {}) {
    const plan = Array.isArray(route.plan) ? route.plan : [];
    if (!plan.length || !composerPlanTracker) return null;
    activeConversationPlanCard = composerPlanTracker;
    composerPlanTracker.hidden = false;
    composerPlanTracker.dataset.state = 'working';
    composerPlanTracker.__plan = plan.map((step, index) => ({
      ...step,
      id: String(step?.id || `S${index + 1}`),
      status: String(step?.status || 'pending')
    }));
    composerPlanTracker.__filesChanged = 0;
    composerPlanTracker.__linesAdded = 0;
    composerPlanTracker.__linesRemoved = 0;
    syncConversationPlanCard(composerPlanTracker.__plan);
    return composerPlanTracker;
  }

  function syncConversationPlanCard(plan = []) {
    if (!composerPlanTracker || !Array.isArray(plan) || !plan.length) return;
    composerPlanTracker.__plan = plan.map((step, index) => ({
      ...(composerPlanTracker.__plan?.[index] || {}),
      ...step,
      id: String(step?.id || composerPlanTracker.__plan?.[index]?.id || `S${index + 1}`),
      status: String(step?.status || composerPlanTracker.__plan?.[index]?.status || 'pending')
    }));
    const steps = composerPlanTracker.__plan;
    const completeStatuses = new Set(['passed', 'skipped', 'complete', 'completed']);
    let currentIndex = steps.findIndex(step => !completeStatuses.has(String(step.status).toLowerCase()));
    const isComplete = currentIndex === -1;
    if (isComplete) currentIndex = Math.max(0, steps.length - 1);
    const current = steps[currentIndex] || steps[0];
    composerPlanTracker.hidden = false;
    composerPlanTracker.dataset.state = isComplete ? 'complete' : 'working';
    if (composerPlanProgress) composerPlanProgress.textContent = `Step ${currentIndex + 1} / ${steps.length}`;
    if (composerPlanSummary) composerPlanSummary.textContent = isComplete ? 'Website ready' : String(current?.title || current?.description || 'Building website');
    const filesChanged = Number(composerPlanTracker.__filesChanged || 0);
    const added = Number(composerPlanTracker.__linesAdded || 0);
    const removed = Number(composerPlanTracker.__linesRemoved || 0);
    if (composerPlanDiff) {
      composerPlanDiff.hidden = filesChanged <= 0;
      composerPlanDiff.innerHTML = filesChanged > 0
        ? `<span>${filesChanged} file${filesChanged === 1 ? '' : 's'} changed</span><span class="is-added">+${added}</span><span class="is-removed">−${removed}</span>`
        : '';
    }
    composerPlanTracker.setAttribute('aria-label', `${composerPlanProgress?.textContent || ''}. ${composerPlanSummary?.textContent || ''}. ${filesChanged ? `${filesChanged} files changed, ${added} lines added, ${removed} lines removed.` : ''}`.trim());
    renderComposerPlanDetails(steps);
  }

  function aggregateFileChanges(changes = []) {
    const byPath = new Map();
    (Array.isArray(changes) ? changes : []).forEach(change => {
      const path = String(change?.path || change?.name || '').trim();
      if (!path) return;
      const current = byPath.get(path) || { path, name: path, lines_added: 0, lines_removed: 0, events: 0 };
      current.lines_added += Math.max(0, Number(change?.lines_added ?? change?.added_lines ?? change?.['+'] ?? 0) || 0);
      current.lines_removed += Math.max(0, Number(change?.lines_removed ?? change?.removed_lines ?? change?.['-'] ?? 0) || 0);
      current.events += 1;
      byPath.set(path, current);
    });
    return [...byPath.values()];
  }

  function updateComposerPlanFileStats(entries = [], changes = null) {
    if (!composerPlanTracker || composerPlanTracker.hidden) return;
    const normalizedChanges = aggregateFileChanges(changes);
    const fileEntries = Array.isArray(entries) ? entries : [];
    const activeFileNames = new Set(
      fileEntries
        .filter(entry => ['writing', 'ready'].includes(String(entry?.status || '')))
        .map(entry => String(entry?.file?.name || entry?.name || '').trim())
        .filter(Boolean)
    );
    composerPlanTracker.__filesChanged = normalizedChanges.length || activeFileNames.size;
    composerPlanTracker.__linesAdded = normalizedChanges.length
      ? normalizedChanges.reduce((total, change) => total + change.lines_added, 0)
      : fileEntries.reduce((total, entry) => total + Math.max(0, Number(entry?.lines) || Number(entry?.file?.content ? countCodeLines(entry.file.content) : 0)), 0);
    composerPlanTracker.__linesRemoved = normalizedChanges.reduce((total, change) => total + change.lines_removed, 0);
    syncConversationPlanCard(composerPlanTracker.__plan || []);
  }

  function renderComposerPlanDetails(plan = []) {
    if (!composerPlanDetailsList) return;
    const steps = Array.isArray(plan) ? plan : [];
    composerPlanDetailsList.replaceChildren();
    steps.forEach((step, index) => {
      const item = document.createElement('li');
      const status = String(step?.status || 'pending').toLowerCase();
      item.dataset.status = status;

      const state = document.createElement('span');
      state.className = 'composer-plan-detail-state';
      state.setAttribute('aria-hidden', 'true');

      const copy = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = `${index + 1}. ${String(step?.title || `Step ${index + 1}`)}`;
      const description = document.createElement('span');
      description.textContent = String(step?.description || step?.reason || 'Queued for the agent.');
      copy.append(title, description);
      item.append(state, copy);
      composerPlanDetailsList.appendChild(item);
    });

    if (composerPlanDetailsMeta) {
      const filesChanged = Number(composerPlanTracker?.__filesChanged || 0);
      composerPlanDetailsMeta.textContent = `${steps.length} step${steps.length === 1 ? '' : 's'}${filesChanged ? ` · ${filesChanged} file${filesChanged === 1 ? '' : 's'} changed` : ''}`;
    }
  }

  function setComposerPlanDetailsExpanded(expanded) {
    const open = Boolean(expanded && composerPlanTracker && !composerPlanTracker.hidden && composerPlanTracker.__plan?.length);
    if (composerPlanDetails) composerPlanDetails.hidden = !open;
    if (composerPlanToggle) {
      composerPlanToggle.setAttribute('aria-expanded', String(open));
      composerPlanToggle.title = open ? 'Hide build steps' : 'Show build steps';
    }
    composerPlanTracker?.classList.toggle('is-expanded', open);
  }

  composerPlanToggle?.addEventListener('click', event => {
    event.stopPropagation();
    setComposerPlanDetailsExpanded(composerPlanToggle.getAttribute('aria-expanded') !== 'true');
  });
  composerPlanDetailsClose?.addEventListener('click', () => setComposerPlanDetailsExpanded(false));
  document.addEventListener('click', event => {
    if (composerPlanDetails?.hidden) return;
    if (composerPlanDetails.contains(event.target) || composerPlanTracker?.contains(event.target)) return;
    setComposerPlanDetailsExpanded(false);
  });

  function hideConversationPlanTracker() {
    activeConversationPlanCard = null;
    setComposerPlanDetailsExpanded(false);
    if (!composerPlanTracker) return;
    composerPlanTracker.hidden = true;
    composerPlanTracker.removeAttribute('data-state');
    composerPlanTracker.__plan = [];
    composerPlanDetailsList?.replaceChildren();
  }

  function getClarificationQuestions(route = {}) {
    // The turn planner owns the wording and option generation. The client only
    // validates the AI payload and intentionally renders one decision per turn.
    return (Array.isArray(route.questions) ? route.questions : [])
      .map((item, index) => {
        const question = String(item?.question || '').trim();
        const rawId = String(item?.id || `question-${index + 1}`).trim().toLowerCase();
        const id = rawId.replace(/[^a-z0-9-]+/g, '-') || `question-${index + 1}`;
        const inferredKind = /palette|colou?r/.test(`${id} ${question}`) ? 'palette'
          : /responsive|device|viewport/.test(`${id} ${question}`) ? 'multiple'
          : 'single';
        const kind = ['single', 'multiple', 'palette', 'text'].includes(String(item?.kind || '').toLowerCase())
          ? String(item.kind).toLowerCase()
          : inferredKind;
        const options = [...new Set(
          (Array.isArray(item?.options) ? item.options : [])
            .map(option => String(option || '').trim())
            .filter(Boolean)
        )].slice(0, 6);
        return {
          id,
          question,
          kind,
          options,
          required: item?.required !== false,
          allowCustom: Boolean(item?.allowCustom)
        };
      })
      .filter(item => item.question && (item.options.length || item.kind === 'text'))
      .slice(0, 1);
  }

  function getPrimaryClarification(route = {}) {
    const item = getClarificationQuestions(route)[0] || {};
    return { question: item.question || '', options: item.options || [] };
  }

  function getPaletteSwatches(label = '') {
    // Palette colors come from the AI-generated option itself. This avoids a
    // local catalogue silently turning arbitrary labels into hard-coded colors.
    return [...String(label || '').matchAll(/#[0-9a-f]{6}\b/gi)]
      .map(match => match[0])
      .slice(0, 4);
  }

  function renderClarificationChoices(route = {}) {
    const questions = getClarificationQuestions(route);
    const question = questions[0];
    if (!question) return;

    const wrap = document.createElement('div');
    wrap.className = 'ai-clarification-options website-brief-builder is-sequential';
    wrap.setAttribute('aria-label', 'Website design preference');
    wrap.innerHTML = `
      <div class="brief-builder-heading">
        <div><strong>Shape your website</strong><span>One decision at a time. Your answer stays in context for the next question.</span></div>
        <span class="brief-builder-count">1 question</span>
      </div>
      <div class="brief-builder-fields"></div>
    `;
    const fields = wrap.querySelector('.brief-builder-fields');

    function sendClarificationAnswer(answerText) {
      const answer = String(answerText || '').trim();
      if (!answer || activeGenerationController) return;
      chatInput.value = answer;
      resizeChatInput();
      wrap.querySelectorAll('button, textarea, input').forEach(control => { control.disabled = true; });
      handleSendMessage();
    }

    const field = document.createElement('fieldset');
    field.className = 'brief-question';
    field.dataset.questionId = question.id;
    const legend = document.createElement('legend');
    legend.innerHTML = `<span>1</span>${escapeHTML(question.question)}`;
    field.appendChild(legend);

    if (question.kind === 'text') {
      const inputWrap = document.createElement('div');
      inputWrap.style.cssText = 'display: flex; gap: 8px; align-items: flex-start; width: 100%;';
      const input = document.createElement('textarea');
      input.className = 'brief-custom-answer is-visible';
      input.rows = 2;
      input.placeholder = 'Type your answer…';
      input.setAttribute('aria-label', question.question);
      const submitBtn = document.createElement('button');
      submitBtn.type = 'button';
      submitBtn.className = 'brief-submit';
      submitBtn.textContent = 'Send';
      submitBtn.style.cssText = 'margin: 0; height: 42px; min-width: 80px;';
      submitBtn.addEventListener('click', () => sendClarificationAnswer(input.value));
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendClarificationAnswer(input.value);
        }
      });
      inputWrap.appendChild(input);
      inputWrap.appendChild(submitBtn);
      field.appendChild(inputWrap);
    } else {
      const choices = document.createElement('div');
      choices.className = 'brief-choice-grid';
      choices.setAttribute('role', 'group');

      question.options.forEach(option => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `brief-choice${question.kind === 'palette' ? ' is-palette' : ''}`;
        button.setAttribute('aria-pressed', 'false');
        if (question.kind === 'palette') {
          const swatches = getPaletteSwatches(option).map(color => `<i style="--swatch:${color}"></i>`).join('');
          button.innerHTML = `${swatches ? `<span class="palette-swatches" aria-hidden="true">${swatches}</span>` : ''}<span>${escapeHTML(option)}</span>`;
        } else {
          button.textContent = option;
        }

        button.addEventListener('click', () => {
          const isCustom = question.allowCustom && /custom/i.test(option);
          if (isCustom) {
            choices.querySelectorAll('.brief-choice').forEach(choice => {
              choice.classList.remove('is-selected');
              choice.setAttribute('aria-pressed', 'false');
            });
            button.classList.add('is-selected');
            button.setAttribute('aria-pressed', 'true');
            const customWrap = field.querySelector('.brief-custom-wrap');
            if (customWrap) {
              customWrap.style.display = 'flex';
              const customInput = customWrap.querySelector('.brief-custom-answer');
              customInput?.focus();
            }
          } else {
            button.classList.add('is-selected');
            button.setAttribute('aria-pressed', 'true');
            sendClarificationAnswer(option);
          }
        });
        choices.appendChild(button);
      });
      field.appendChild(choices);

      if (question.allowCustom) {
        const customWrap = document.createElement('div');
        customWrap.className = 'brief-custom-wrap';
        customWrap.style.cssText = 'display: none; gap: 8px; margin-top: 10px; width: 100%; padding-left: 28px;';
        const customInput = document.createElement('textarea');
        customInput.className = 'brief-custom-answer is-visible';
        customInput.rows = 2;
        customInput.placeholder = 'Describe your custom choice…';
        customInput.setAttribute('aria-label', `Custom answer for ${question.question}`);
        const customSubmitBtn = document.createElement('button');
        customSubmitBtn.type = 'button';
        customSubmitBtn.className = 'brief-submit';
        customSubmitBtn.textContent = 'Send';
        customSubmitBtn.style.cssText = 'margin: 0; height: 42px; min-width: 80px;';
        customSubmitBtn.addEventListener('click', () => sendClarificationAnswer(customInput.value));
        customInput.addEventListener('keydown', e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendClarificationAnswer(customInput.value);
          }
        });
        customWrap.appendChild(customInput);
        customWrap.appendChild(customSubmitBtn);
        field.appendChild(customWrap);
      }
    }

    fields.appendChild(field);
    chatMessages.appendChild(wrap);
    if (composerPlanTracker) composerPlanTracker.hidden = true;
    setTimeout(() => {
      scrollChatItemToTop(wrap);
    }, 60);
  }

  async function streamConfiguredProviderChat(message, handlers = {}) {
    const config = getAgentRuntimeConfig();
    if (!config.modelId) {
      throw new Error('AI model is not configured. Open Settings → Agentic AI Runtime and select a model.');
    }
    if (config.provider !== 'codex' && !config.apiKey) {
      throw new Error('AI provider is not configured. Open Settings → Agentic AI Runtime, add an OpenRouter or NVIDIA NIM API key, and select a model.');
    }
    if (config.provider === 'codex' && !codexRuntimeState.connected) {
      throw new Error('ChatGPT Codex is not connected. Open Settings → Agentic AI Runtime → Connect ChatGPT.');
    }
    handlers.onStatus?.(
      thinkingModeEnabled ? 'Thinking…' : 'Responding…',
      { phase: thinkingModeEnabled ? 'THINK' : 'GENERATE' }
    );
    const headers = { 'Content-Type': 'application/json' };
    if (config.provider === 'codex') headers.Authorization = `Bearer ${await getNexoraAccessToken()}`;
    let response;
    try {
      response = await fetch('/api/nexora/chat', {
        method: 'POST',
        signal: handlers.signal || undefined,
        headers,
        body: JSON.stringify({
          provider: config.provider,
          model_id: config.modelId,
          api_key: config.apiKey,
          base_url: config.baseUrl,
          message,
          system: handlers.system || getChatSystemPrompt(handlers.route || null),
          history: Array.isArray(handlers.history) ? handlers.history : getActiveConversationHistoryForAi(),
          temperature: Number.isFinite(Number(handlers.temperature)) ? Math.max(0, Math.min(2, Number(handlers.temperature))) : 0.6,
          response_format: handlers.jsonMode ? { type: 'json_object' } : undefined,
          max_tokens: Number.isFinite(Number(handlers.maxTokens)) ? Math.max(16, Math.min(32768, Math.round(Number(handlers.maxTokens)))) : 5000,
          enable_thinking: getReasoningRequestOptions().enableThinking,
          reasoning_effort: getReasoningRequestOptions().reasoningEffort
        })
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      throw new Error(`Nexora AI API is unreachable. Check the deployment and /api/health. ${error?.message || ''}`.trim());
    }
    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      throw new Error(getConfiguredProviderErrorMessage(text, response.status));
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const state = { fullText: '', reasoningTokens: 0 };
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split(/\r?\n\r?\n/);
      buffer = parts.pop() || '';
      for (const part of parts) processOpenRouterSseChunk(part, handlers, state);
    }
    buffer += decoder.decode();
    if (buffer.trim()) processOpenRouterSseChunk(buffer, handlers, state);
    if (handlers.jsonMode && ['length','max_tokens','content_filter'].includes(state.finishReason)) {
      const error = new Error(`Generation stopped before a complete document (${state.finishReason}). Request a smaller complete page or increase the model output budget.`); error.partialText=state.fullText; throw error;
    }
    return state.fullText;
  }

  function renderHistoryList() {
    if (!historyListToday) return;
    historyListToday.innerHTML = '';
    const historySection = document.getElementById('historyTodaySection');
    const isHistoryLoading = document.body.classList.contains('history-is-loading');
    if (historySection) historySection.style.display = (isHistoryLoading || conversationList.length) ? 'flex' : 'none';
    if (isHistoryLoading) {
      Array.from({ length: 5 }).forEach((_, index) => {
        const skeletonLi = document.createElement('li');
        skeletonLi.className = 'history-item history-skeleton-row';
        skeletonLi.innerHTML = `
          <span class="history-skeleton-dot" aria-hidden="true"></span>
          <span class="history-skeleton-line history-skeleton-line-${index + 1}" aria-hidden="true"></span>
        `;
        historyListToday.appendChild(skeletonLi);
      });
      renderTabCounts();
      return;
    }
    const historyPreviewLimit = getHistoryPreviewLimit();
    const visibleConversations = historyExpanded ? conversationList : conversationList.slice(0, historyPreviewLimit);
    visibleConversations.forEach(conversation => {
      const newLi = document.createElement('li');
      newLi.classList.add('history-item');
      const title = conversation.title || 'New chat';
      newLi.innerHTML = `
        <a class="history-link ${conversation.id === activeChatId ? 'active' : ''}" data-chat-id="${conversation.id}" title="${escapeHTML(title)}">
          <span class="bullet-dot"></span>
          <span class="history-title">${escapeHTML(title)}</span>
        </a>
      `;
      historyListToday.appendChild(newLi);
    });
    if (conversationList.length > historyPreviewLimit) {
      const historyMoreLabel = historyExpanded ? 'Show recent chats' : 'Show all chats';
      const moreLi = document.createElement('li');
      moreLi.className = 'history-item history-more-item';
      moreLi.innerHTML = `
        <button class="history-more-btn" type="button" id="historyMoreButton" aria-expanded="${historyExpanded ? 'true' : 'false'}" aria-label="${historyMoreLabel}" title="${historyMoreLabel}">
          <span>${historyMoreLabel}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="${historyExpanded ? '18 15 12 9 6 15' : '6 9 12 15 18 9'}"></polyline>
          </svg>
        </button>
      `;
      historyListToday.appendChild(moreLi);
      moreLi.querySelector('#historyMoreButton')?.addEventListener('click', () => {
        historyExpanded = !historyExpanded;
        renderHistoryList();
      });
    }
    setupHistoryListeners();
    renderTabCounts();
  }

  async function createProjectRecord({ title, description = '', template_id = null, files = [], kind = 'manual-project', webProject = null, pageDocument = null, visualDocument = null, generatedProject = null }) {
    const localProject = {
      id: `local-project-${Date.now()}`,
      title,
      description,
      date: 'Just now',
      icon: kind === 'generated-website' ? 'WEB' : 'PRJ',
      files,
      webProject,
      pageDocument,
      visualDocument,
      generatedProject
    };

    if (!supabaseClient || !appState.user?.id) {
      projectDatabase.unshift(localProject);
      rebuildLibraryFromProjects();
      persistWorkspace();
      return localProject;
    }

    const payload = { kind, files, webProject, pageDocument, visualDocument, generatedProject, description, saved_at: new Date().toISOString() };
    const { data, error } = await supabaseClient
      .from('projects')
      .insert({
        user_id: appState.user.id,
        template_id,
        name: title,
        description,
        zip_file_path: null
      })
        .select()
        .maybeSingle();

    if (error || !data) {
      const issue = error || new Error('Project insert did not return a row.');
      recordDatabaseError('projects.insert', issue);
      throw issue;
    }

    let payloadRef = '';
    try {
      payloadRef = await saveProjectPayload(data.id, payload);
    } catch (storageError) {
      recordDatabaseError('storage.project_payloads.upload', storageError);
      payloadRef = encodeProjectPayload(payload);
    }

    if (payloadRef) {
      const { error: payloadUpdateError } = await supabaseClient
        .from('projects')
        .update({ zip_file_path: payloadRef, updated_at: new Date().toISOString() })
        .eq('id', data.id);
      if (payloadUpdateError) recordDatabaseError('projects.payload_ref_update', payloadUpdateError);
    }

    const project = {
      id: data.id,
      title,
      description,
      date: formatDate(data.updated_at || data.created_at),
      icon: kind === 'generated-website' ? 'WEB' : 'PRJ',
      files,
      webProject,
      visualDocument,
      generatedProject,
      template_id,
      deployment: null,
      payload_ref: payloadRef || null,
      payload_loaded: true,
      raw: { ...data, zip_file_path: payloadRef || null }
    };
    projectDatabase.unshift(project);

    if (data && kind === 'generated-website') {
      const { data: deployment, error: deploymentError } = await supabaseClient
        .from('deployments')
        .insert({
          project_id: data.id,
          user_id: appState.user.id,
          deployment_url: `preview://nexora/${data.id}`,
          status: 'ready'
        })
        .select()
        .maybeSingle();
      if (deploymentError) {
        recordDatabaseError('deployments.insert', deploymentError);
      }
      if (deployment) {
        deploymentDatabase.unshift(deployment);
        project.deployment = deployment;
      }
    }

    rebuildLibraryFromProjects();
    persistWorkspace();
    return project;
  }

  async function linkActiveConversationToProject(projectId) {
    if (!supabaseClient || !appState.user?.id || !activeChatId || !projectId || String(activeChatId).startsWith('local-')) return;
    const { data, error } = await supabaseClient
      .from('conversations')
      .update({ project_id: projectId, updated_at: new Date().toISOString() })
      .eq('id', activeChatId)
      .eq('user_id', appState.user.id)
      .select('id,user_id,project_id,title,created_at,updated_at')
      .maybeSingle();
    if (error) {
      recordDatabaseError('conversations.link_project', error);
      return;
    }
    const index = conversationList.findIndex(item => item.id === activeChatId);
    if (index >= 0 && data) conversationList[index] = { ...(conversationList[index] || {}), ...data };
    renderHistoryList();
    persistWorkspace();
  }

  function renderLibrary(query = "") {
    if(!libraryGrid) return;
    libraryGrid.innerHTML = "";
    const filtered = libraryDatabase.filter(f => 
      f.name.toLowerCase().includes(query.toLowerCase())
    );

    if (filtered.length === 0) {
      libraryGrid.innerHTML = "<p style='color: var(--text-muted); padding: 20px; width: 100%;'>No files found.</p>";
      renderTabCounts();
      return;
    }

    filtered.forEach(file => {
      const card = document.createElement("div");
      card.className = "library-file-card";
      card.innerHTML = `
        <div style="display: flex; align-items: flex-start; justify-content: space-between;">
          <div class="library-file-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
              <polyline points="13 2 13 9 20 9"></polyline>
            </svg>
          </div>
          <div class="file-actions" style="position: relative;">
            <button class="project-actions-btn" aria-label="File actions" onclick="event.stopPropagation(); this.nextElementSibling.classList.toggle('show')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="5" r="1"></circle>
                <circle cx="12" cy="12" r="1"></circle>
                <circle cx="12" cy="19" r="1"></circle>
              </svg>
            </button>
            <div class="project-dropdown-menu">
              <div class="dropdown-item" onclick="event.stopPropagation(); window.openLibraryFile('${file.id}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                Open file
              </div>
              <div class="dropdown-item" onclick="event.stopPropagation(); window.archiveFile('${file.id}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line></svg>
                Archive
              </div>
              <div class="dropdown-item delete" onclick="event.stopPropagation(); window.deleteFile('${file.id}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                Delete
              </div>
            </div>
          </div>
        </div>
        <div class="library-file-info">
          <span class="library-file-name" title="${escapeHTML(file.name)}">${escapeHTML(file.name)}</span>
          <span class="library-file-meta">${escapeHTML(file.size)} - ${escapeHTML(file.date)}</span>
        </div>
      `;
      libraryGrid.appendChild(card);
    });
    renderTabCounts();
  }

  function renderArchive() {
    if(!archiveGrid) return;
    archiveGrid.innerHTML = "";
    
    if (archiveDatabase.length === 0) {
      archiveGrid.innerHTML = "<p style='color: var(--text-muted); padding: 20px; width: 100%;'>No archived files.</p>";
      renderTabCounts();
      return;
    }

    archiveDatabase.forEach(file => {
      const card = document.createElement("div");
      card.className = "library-file-card";
      card.innerHTML = `
        <div style="display: flex; align-items: flex-start; justify-content: space-between;">
          <div class="library-file-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
              <polyline points="13 2 13 9 20 9"></polyline>
            </svg>
          </div>
          <div class="file-actions" style="position: relative;">
            <button class="project-actions-btn" aria-label="File actions" onclick="event.stopPropagation(); this.nextElementSibling.classList.toggle('show')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="5" r="1"></circle>
                <circle cx="12" cy="12" r="1"></circle>
                <circle cx="12" cy="19" r="1"></circle>
              </svg>
            </button>
            <div class="project-dropdown-menu">
              <div class="dropdown-item" onclick="event.stopPropagation(); window.restoreFile('${file.id}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 10 4 15 9 20"></polyline><path d="M20 4v7a4 4 0 0 1-4 4H4"></path></svg>
                Restore
              </div>
              <div class="dropdown-item delete" onclick="event.stopPropagation(); window.deleteArchivedFile('${file.id}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                Delete permanently
              </div>
            </div>
          </div>
        </div>
        <div class="library-file-info">
          <span class="library-file-name" title="${escapeHTML(file.name)}">${escapeHTML(file.name)}</span>
          <span class="library-file-meta">${escapeHTML(file.size)} - ${escapeHTML(file.date)}</span>
        </div>
      `;
      archiveGrid.appendChild(card);
    });
    renderTabCounts();
  }

  // Expose rename and delete to global scope for inline onclicks
  async function persistProjectFiles(project) {
    if (!supabaseClient || !project?.id || String(project.id).startsWith('local-')) return;
    const payload = {
      kind: project.icon === 'WEB' ? 'generated-website' : 'manual-project',
      description: project.description || '',
      files: project.files || [],
      webProject: project.webProject || null,
      visualDocument: project.visualDocument || null,
      generatedProject: project.generatedProject || null,
      saved_at: new Date().toISOString()
    };
    let payloadRef = '';
    try {
      payloadRef = await saveProjectPayload(project.id, payload);
    } catch (storageError) {
      recordDatabaseError('storage.project_payloads.upload', storageError);
      payloadRef = encodeProjectPayload(payload);
    }
    project.payload_ref = payloadRef;
    project.raw = { ...(project.raw || {}), zip_file_path: payloadRef };
    await supabaseClient
      .from('projects')
      .update({ zip_file_path: payloadRef, updated_at: new Date().toISOString() })
      .eq('id', project.id);
    persistWorkspace();
  }

  async function hydrateProjectPayload(project) {
    if (!project || project.payload_loaded || String(project.id).startsWith('local-')) return project;
    if (project.files?.length || project.webProject || project.visualDocument || project.generatedProject) {
      project.payload_loaded = true;
      return project;
    }
    if (!supabaseClient || !appState.user?.id) return project;

    const { data, error } = await runSupabaseQuery(
      'projects.payload_select',
      () => supabaseClient
        .from('projects')
        .select('id,zip_file_path')
        .eq('id', project.id)
        .eq('user_id', appState.user.id)
        .maybeSingle(),
      9000
    );

    if (error || !data?.zip_file_path) {
      if (error) recordDatabaseError('projects.payload_select', error);
      project.payload_loaded = true;
      return project;
    }

    const payload = await readProjectPayloadReference(data.zip_file_path);
    project.files = Array.isArray(payload.files) ? payload.files : [];
    project.webProject = payload.webProject || null;
    project.visualDocument = payload.visualDocument || null;
    project.generatedProject = payload.generatedProject || null;
    project.description = project.description || payload.description || '';
    project.icon = payload.kind === 'generated-website' ? 'WEB' : project.icon;
    project.payload_ref = data.zip_file_path || null;
    project.raw = { ...(project.raw || {}), zip_file_path: data.zip_file_path };
    project.payload_loaded = true;
    rebuildLibraryFromProjects();
    return project;
  }

  function hydrateProjectPayloadsInBackground() {
    if (!supabaseClient || !appState.user?.id || !projectDatabase.length) return;
    const targetProjects = projectDatabase
      .filter(project => project?.id && !String(project.id).startsWith('local-') && !project.payload_loaded)
      .slice(0, 30);
    if (!targetProjects.length) return;

    Promise.resolve().then(async () => {
      const ids = targetProjects.map(project => project.id);
      const { data, error } = await runSupabaseQuery(
        'projects.payload_refs_select',
        () => supabaseClient
          .from('projects')
          .select('id,zip_file_path')
          .eq('user_id', appState.user.id)
          .in('id', ids),
        9000
      );
      if (error) {
        recordDatabaseError('projects.payload_refs_select', error);
        return;
      }

      const refById = new Map((Array.isArray(data) ? data : []).map(row => [row.id, row.zip_file_path]));
      for (const project of targetProjects) {
        const ref = refById.get(project.id);
        if (!ref) {
          project.payload_loaded = true;
          continue;
        }
        const payload = await readProjectPayloadReference(ref);
        project.files = Array.isArray(payload.files) ? payload.files : project.files || [];
        project.webProject = payload.webProject || project.webProject || null;
        project.visualDocument = payload.visualDocument || project.visualDocument || null;
        project.generatedProject = payload.generatedProject || project.generatedProject || null;
        project.description = project.description || payload.description || '';
        project.icon = payload.kind === 'generated-website' ? 'WEB' : project.icon;
        project.payload_ref = ref;
        project.raw = { ...(project.raw || {}), zip_file_path: ref };
        project.payload_loaded = true;
      }

      rebuildLibraryFromProjects();
      renderProjects();
      renderLibrary(librarySearchInput?.value || '');
      renderArchive();
      persistWorkspace();
    }).catch(error => recordDatabaseError('projects.payload_background_hydration', error));
  }

  window.openProject = async function(id) {
    const project = projectDatabase.find(item => item.id === id);
    if (!project) return;
    const hydratedProject = await hydrateProjectPayload(project);
    if (hydratedProject.generatedProject) {
      openGeneratedProjectInEditor(hydratedProject.generatedProject);
    } else if (hydratedProject.webProject?.schema === WEB_PROJECT_SCHEMA) {
      openGeneratedProjectInEditor({ projectName: hydratedProject.title, webProject: hydratedProject.webProject, files: hydratedProject.files || [] });
    } else if (isVisualDocumentPayload(hydratedProject.visualDocument)) {
      openVisualDocumentInEditor(hydratedProject.visualDocument);
    } else if (hydratedProject.files?.length) {
      openWebsitePreviewDialog({
        projectName: hydratedProject.title,
        files: hydratedProject.files,
        visualDocument: hydratedProject.visualDocument || null,
        generatedProject: hydratedProject.generatedProject || null
      });
    } else if (hydratedProject.deployment?.deployment_url) {
      window.open(hydratedProject.deployment.deployment_url, '_blank');
    }
  };

  async function resolveStoredFileUrl(fileRecord) {
    const file = fileRecord?.file || fileRecord || {};
    if (file.public_url) return file.public_url;
    if (file.url) return file.url;
    const storageRef = parseStorageUri(file.storage_uri);
    const bucket = file.storage_bucket || storageRef?.bucket;
    const path = file.storage_path || storageRef?.path;
    if (!bucket || !path || !supabaseClient?.storage?.from) return '';
    const publicUrl = getPublicStorageUrl(bucket, path);
    if (publicUrl) return publicUrl;
    const { data, error } = await supabaseClient.storage.from(bucket).createSignedUrl(path, 60 * 10);
    if (error) throw error;
    return data?.signedUrl || '';
  }

  window.openLibraryFile = async function(id) {
    const fileRecord = libraryDatabase.find(file => file.id === id) || archiveDatabase.find(file => file.id === id);
    if (!fileRecord) return;
    try {
      const url = await resolveStoredFileUrl(fileRecord);
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
      }
      if (fileRecord.file?.content) {
        openCodeFileDialog(fileRecord.file);
        return;
      }
      showNexoraToast('This file only has local metadata available.', 'error', 4200);
    } catch (error) {
      recordDatabaseError('storage.project_assets.open', error);
      showNexoraToast('Could not open this stored file. Check bucket access policies.', 'error', 5200);
    }
  };

  window.renameProject = async function(id) {
    const project = projectDatabase.find(item => item.id === id);
    if (!project) return;
    const newName = prompt("Enter new project name:", project.title);
    if (newName !== null && newName.trim() !== "") {
      project.title = newName.trim();
      if (supabaseClient && !String(id).startsWith('local-')) {
        await supabaseClient
          .from('projects')
          .update({ name: project.title, updated_at: new Date().toISOString() })
          .eq('id', id);
      }
      renderProjects();
      persistWorkspace();
    }
  };

  window.deleteProject = async function(id) {
    if (confirm("Are you sure you want to delete this project?")) {
      if (supabaseClient && !String(id).startsWith('local-')) {
        await supabaseClient.from('deployments').delete().eq('project_id', id);
        await supabaseClient.from('projects').delete().eq('id', id);
      }
      projectDatabase = projectDatabase.filter(project => project.id !== id);
      rebuildLibraryFromProjects();
      renderProjects();
      renderLibrary();
      persistWorkspace();
    }
  };

  // Global File Functions
  window.archiveFile = async function(id) {
    const idx = libraryDatabase.findIndex(f => f.id === id);
    if (idx !== -1) {
      const file = libraryDatabase[idx];
      const project = projectDatabase.find(item => item.id === file.projectId);
      if (project?.files?.[Number(id.split(':').pop())]) {
        project.files[Number(id.split(':').pop())].archived = true;
        await persistProjectFiles(project);
      }
      archiveDatabase.unshift({ ...file, archived: true });
      libraryDatabase.splice(idx, 1);
      renderLibrary();
      renderArchive();
      persistWorkspace();
    }
  };

  window.deleteFile = async function(id) {
    if (confirm("Are you sure you want to delete this file?")) {
      const idx = libraryDatabase.findIndex(f => f.id === id);
      if (idx !== -1) {
        const file = libraryDatabase[idx];
        const fileIndex = Number(id.split(':').pop());
        const project = projectDatabase.find(item => item.id === file.projectId);
        if (project?.files?.[fileIndex]) {
          project.files.splice(fileIndex, 1);
          await persistProjectFiles(project);
        }
        libraryDatabase.splice(idx, 1);
        rebuildLibraryFromProjects();
        renderLibrary();
        persistWorkspace();
      }
    }
  };

  window.restoreFile = async function(id) {
    const idx = archiveDatabase.findIndex(f => f.id === id);
    if (idx !== -1) {
      const file = archiveDatabase[idx];
      const project = projectDatabase.find(item => item.id === file.projectId);
      if (project?.files?.[Number(id.split(':').pop())]) {
        project.files[Number(id.split(':').pop())].archived = false;
        await persistProjectFiles(project);
      }
      libraryDatabase.unshift({ ...file, archived: false });
      archiveDatabase.splice(idx, 1);
      renderLibrary();
      renderArchive();
      persistWorkspace();
    }
  };

  window.deleteArchivedFile = async function(id) {
    if (confirm("Are you sure you want to permanently delete this file?")) {
      const idx = archiveDatabase.findIndex(f => f.id === id);
      if (idx !== -1) {
        const file = archiveDatabase[idx];
        const fileIndex = Number(id.split(':').pop());
        const project = projectDatabase.find(item => item.id === file.projectId);
        if (project?.files?.[fileIndex]) {
          project.files.splice(fileIndex, 1);
          await persistProjectFiles(project);
        }
        archiveDatabase.splice(idx, 1);
        rebuildLibraryFromProjects();
        renderArchive();
        renderLibrary();
        persistWorkspace();
      }
    }
  };

  // Close project and file action menus on outside click
  document.addEventListener('click', () => {
    document.querySelectorAll('.project-dropdown-menu.show').forEach(menu => {
      menu.classList.remove('show');
    });
  });

  function openNewProjectModal() {
    newProjectModal.classList.add('visible');
    newProjectName.value = '';
    newProjectInstructions.value = '';
    if (newProjectSources) newProjectSources.value = '';
    if (sourceFileInput) sourceFileInput.value = '';
    if (sourceFileList) sourceFileList.innerHTML = '';
    newProjectName.focus();
  }

  function closeNewProjectModal() {
    newProjectModal.classList.remove('visible');
  }

  async function submitNewProject() {
    const title = newProjectName.value.trim() || "Untitled Project";
    const description = newProjectInstructions?.value.trim() || newProjectSources?.value.trim() || '';
    const selectedFiles = sourceFileInput?.files ? Array.from(sourceFileInput.files) : [];

    try {
      if (btnSubmitNewProject) {
        btnSubmitNewProject.disabled = true;
        btnSubmitNewProject.textContent = selectedFiles.length ? 'Uploading...' : 'Saving...';
      }
      const files = await prepareUploadedFiles(selectedFiles, {
        label: title,
        source: 'project-source'
      });
      await createProjectRecord({ title, description, files, kind: 'manual-project' });
      renderProjects();
      renderLibrary();
      closeNewProjectModal();
    } catch (error) {
      alert(formatDatabaseIssue('Project save failed', error));
    } finally {
      if (btnSubmitNewProject) {
        btnSubmitNewProject.disabled = false;
        btnSubmitNewProject.textContent = 'Next';
      }
    }
  }

  if (btnCreateProject) btnCreateProject.addEventListener('click', openNewProjectModal);
  if (btnEmptyCreateProject) btnEmptyCreateProject.addEventListener('click', openNewProjectModal);
  if (btnCloseNewProjectModal) btnCloseNewProjectModal.addEventListener('click', closeNewProjectModal);
  if (btnCancelNewProject) btnCancelNewProject.addEventListener('click', closeNewProjectModal);
  if (btnSubmitNewProject) btnSubmitNewProject.addEventListener('click', submitNewProject);
  if (btnAddSourcesLater) btnAddSourcesLater.addEventListener('click', submitNewProject);

  // File Upload Logic for Sources
  if (btnUploadSourceFile && sourceFileInput) {
    btnUploadSourceFile.addEventListener('click', () => {
      sourceFileInput.click();
    });

    sourceFileInput.addEventListener('change', (e) => {
      sourceFileList.innerHTML = '';
      const files = Array.from(e.target.files);
      files.forEach(file => {
        const fileItem = document.createElement('div');
        fileItem.style.display = 'flex';
        fileItem.style.alignItems = 'center';
        fileItem.style.gap = '6px';
        fileItem.style.color = 'var(--text-white)';
        fileItem.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px; color: var(--text-muted);">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
            <polyline points="13 2 13 9 20 9"></polyline>
          </svg>
          ${escapeHTML(file.name)}
        `;
        sourceFileList.appendChild(fileItem);
      });
    });
  }

  // Initialize: load welcome screen at startup
  resetToWelcome();

  // PRO PLAN LOGIC
  btnProPlan?.addEventListener('click', () => {
    updateProPlanModalState();
    proPlanModal.classList.add('visible');
  });

  btnCloseModal?.addEventListener('click', () => {
    proPlanModal.classList.remove('visible');
  });

  btnClaimPro?.addEventListener('click', async () => {
    if (hasActivePaidPlan()) {
      updateProPlanModalState();
      proPlanModal.classList.remove('visible');
      return;
    }

    btnClaimPro.disabled = true;
    btnClaimPro.textContent = 'Updating plan...';
    const nextBilling = {
      ...(appState.billing || {}),
      user_id: appState.user?.id || appState.billing?.user_id || null,
      plan_tier: 'paid',
      status: 'active'
    };

    try {
      if (supabaseClient && appState.billing?.id) {
        const { data, error } = await supabaseClient
          .from('billing')
          .update({ plan_tier: 'paid', status: 'active' })
          .eq('id', appState.billing.id)
          .select()
          .maybeSingle();
        if (error || !data) throw error || new Error('Billing update did not return a row.');
        appState.billing = data;
      } else if (supabaseClient && appState.user?.id) {
        const { data, error } = await supabaseClient
          .from('billing')
          .insert({ user_id: appState.user.id, plan_tier: 'paid', status: 'active' })
          .select()
          .maybeSingle();
        if (error || !data) throw error || new Error('Billing insert did not return a row.');
        appState.billing = data;
      } else {
        appState.billing = nextBilling;
      }
      proPlanModal.classList.remove('visible');
      renderProfile();
      renderSettings();
      persistWorkspace();
    } catch (error) {
      recordDatabaseError('billing.upsert_paid_plan', error);
      alert(formatDatabaseIssue('Billing update failed', error));
    } finally {
      btnClaimPro.disabled = false;
      updateProPlanModalState();
    }
  });

  // Close modal when clicking outside of it
  proPlanModal?.addEventListener('click', (e) => {
    if (e.target === proPlanModal) {
      proPlanModal.classList.remove('visible');
    }
  });

  // 1. COLLAPSE SIDEBAR FUNCTIONALITY
  btnCollapse.addEventListener('click', () => {
    if (window.matchMedia('(max-width: 900px)').matches && sidebar.classList.contains('open')) {
      sidebar.classList.remove('open');
      mobileOverlay.classList.remove('visible');
      return;
    }

    sidebar.classList.toggle('collapsed');
  });

  // 2. MOBILE SIDEBAR DRAWER INTERACTION
  btnMenuToggle.addEventListener('click', () => {
    sidebar.classList.remove('collapsed');
    sidebar.classList.add('open');
    mobileOverlay.classList.add('visible');
  });

  mobileOverlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    mobileOverlay.classList.remove('visible');
  });

  // 3. SEARCH FILTER FOR CHAT HISTORY
  // Password managers/browser autofill occasionally treat the sidebar search
  // box as an identity field and inject the signed-in email. Ignore that
  // startup autofill while preserving searches the user actually types.
  let sidebarSearchUserEdited = false;
  const markSidebarSearchEdited = () => { sidebarSearchUserEdited = true; };
  searchInput?.addEventListener('keydown', markSidebarSearchEdited, { passive: true });
  searchInput?.addEventListener('paste', markSidebarSearchEdited, { passive: true });
  searchInput?.addEventListener('drop', markSidebarSearchEdited, { passive: true });

  function clearSidebarCredentialAutofill() {
    if (!searchInput || sidebarSearchUserEdited) return;
    const value = String(searchInput.value || '').trim();
    if (!value) return;
    const knownEmails = [appState.user?.email, appState.profile?.email]
      .filter(Boolean)
      .map(email => String(email).trim().toLowerCase());
    const normalized = value.toLowerCase();
    const looksLikeInjectedEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    if (!looksLikeInjectedEmail && !knownEmails.includes(normalized)) return;
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
  }

  [60, 350, 1000, 2200].forEach(delay => window.setTimeout(clearSidebarCredentialAutofill, delay));

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    const items = sidebar.querySelectorAll('.history-item');

    items.forEach(item => {
      if (item.classList.contains('history-more-item')) {
        item.style.display = query ? 'none' : '';
        return;
      }
      const text = item.querySelector('span:not(.bullet-dot)')?.textContent?.toLowerCase() || '';
      if (text.includes(query)) {
        item.style.display = 'block';
      } else {
        item.style.display = 'none';
      }
    });

    // Hide empty sections
    const sections = sidebar.querySelectorAll('.history-section');
    sections.forEach(section => {
      const visibleItems = section.querySelectorAll('.history-item[style="display: block;"]').length;
      const allItems = section.querySelectorAll('.history-item').length;
      const hiddenItems = section.querySelectorAll('.history-item[style="display: none;"]').length;
      
      if (query !== '' && hiddenItems === allItems) {
        section.style.display = 'none';
      } else {
        section.style.display = 'flex';
      }
    });
  });

  // 4. NEW CHAT RESET
  btnNewChat.addEventListener('click', () => {
    activeAgentProjectId = null;
    activeAgentRunId = null;
    resetToWelcome();
    // Close mobile menu if open
    sidebar.classList.remove('open');
    mobileOverlay.classList.remove('visible');
  });

  logoLink.addEventListener('click', (e) => {
    e.preventDefault();
    resetToWelcome();
  });

  function resetToWelcome() {
    activeChatId = null;
    currentGeneratedProject = null;
    activeConversationPlanCard = null;
    hideConversationPlanTracker();
    activeThinkingBubble = null;
    if (generationInspector && !activeGenerationController) generationInspector.hidden = true;
    document.querySelectorAll('.history-link').forEach(link => {
      link.classList.remove('active');
    });
    chatMessages.style.display = 'none';
    chatMessages.innerHTML = '';
    if(templatesScreen) templatesScreen.style.display = 'none';
    if(projectsScreen) projectsScreen.style.display = 'none';
    if(libraryScreen) libraryScreen.style.display = 'none';
    if(settingsScreen) settingsScreen.style.display = 'none';
    if(archiveScreen) archiveScreen.style.display = 'none';
    welcomeScreen.style.display = 'flex';
    document.querySelector('.chat-container')?.classList.remove('chat-active');
    document.body.classList.remove('chat-active');
    updateWorkspaceShell({ panelOpen: false, title: 'New website' });
    chatInputContainer?.classList.remove('compact');
    chatInput.value = '';
    resizeChatInput();
    chatInput.focus();
  }

  document.querySelectorAll('[data-close-tab]').forEach(button => {
    button.addEventListener('click', () => {
      resetToWelcome();
      sidebar.classList.remove('open');
      mobileOverlay.classList.remove('visible');
    });
  });

  function animateTabScreen(screen) {
    if (!screen) return;
    screen.classList.remove('tab-screen-enter');
    void screen.offsetWidth;
    screen.classList.add('tab-screen-enter');
  }

  // Templates Nav Logic - opens in-workspace gallery
  if (navTemplates) {
    navTemplates.addEventListener('click', (event) => {
      event.preventDefault();
      showWorkspacePanel(templatesScreen, navTemplates, 'Templates', renderChatTemplates);
    });
  }

  // Projects Nav Logic
  if (navProjects) {
    navProjects.addEventListener('click', () => {
      showWorkspacePanel(projectsScreen, navProjects, 'Projects', renderProjects);
    });
  }

  // Library Nav Logic
  if (navLibrary) {
    navLibrary.addEventListener('click', () => {
      showWorkspacePanel(libraryScreen, navLibrary, 'Library', renderLibrary);
    });
  }

  // Settings Nav Logic
  if (navSettings) {
    navSettings.addEventListener('click', () => {
      closeProfileDropup();
      openSettingsScreen();
    });
  }

  if (btnOpenArchive) {
    btnOpenArchive.addEventListener('click', () => {
      showWorkspacePanel(archiveScreen, navSettings, 'Archived files', renderArchive);
    });
  }

  if (btnBackToSettings) {
    btnBackToSettings.addEventListener('click', () => {
      openSettingsScreen();
    });
  }

  if (templatesSearchInput) {
    templatesSearchInput.addEventListener('input', (e) => {
      renderTemplates(e.target.value);
    });
  }

  if (librarySearchInput) {
    librarySearchInput.addEventListener('input', (e) => {
      renderLibrary(e.target.value);
    });
  }

  // 5. TEXTAREA AUTO-RESIZE
  chatInput.addEventListener('input', function() {
    resizeChatInput();
  });

  // Prevent Enter from submitting a newline unless Shift is held
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!activeGenerationController) handleSendMessage();
    }
  });

  btnSend.addEventListener('click', () => {
    if (activeGenerationController) {
      stopActiveGeneration();
      return;
    }
    handleSendMessage();
  });

  // 6. QUICK ACTION SUGGESTION PILLS
  quickPills.forEach(pill => {
    pill.addEventListener('click', () => {
      const text = pill.textContent.trim().toLowerCase();
      if (text === 'templates') {
        showWorkspacePanel(templatesScreen, navTemplates, 'Templates', renderChatTemplates);
        return;
      }
      const prompt = pill.getAttribute('data-prompt');
      chatInput.value = prompt;
      chatInput.focus();
      resizeChatInput();
    });
  });

  // 7. MODEL PICKER & REASONING EFFORT CUSTOM DROPDOWNS
  btnModelPicker?.addEventListener('click', (e) => {
    e.stopPropagation();
    reasoningMenu?.classList.remove('open');
    modelMenu?.classList.toggle('open');
    const provider = normalizeAgentProvider(NEXORA_STORAGE.get(AGENT_PROVIDER_STORAGE_KEY, 'openrouter'));
    if (!configuredModels.length || liveModelsProvider !== provider) refreshLiveModelsForCurrentProvider({ quiet: true });
  });

  btnReasoningPicker?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!thinkingModeEnabled) return;
    modelMenu?.classList.remove('open');
    reasoningMenu?.classList.toggle('open');
  });

  renderModelMenu();
  initializeAgentRuntimeSettings();

  modelMenu?.addEventListener('click', (e) => {
    e.stopPropagation();
    const item = e.target.closest('.model-item');
    if (!item) return;
    selectOpenRouterModel(item.getAttribute('data-model-id'));
  });

  reasoningMenu?.addEventListener('click', (e) => {
    e.stopPropagation();
    const item = e.target.closest('.reasoning-item');
    if (!item) return;
    const value = normalizeReasoningEffort(item.getAttribute('data-value'));
    selectedReasoningEffort = value;
    NEXORA_STORAGE.set(REASONING_EFFORT_STORAGE_KEY, selectedReasoningEffort);
    if (reasoningEffortSelect) reasoningEffortSelect.value = value;
    updateThinkingModeUi();
    reasoningMenu?.classList.remove('open');
    showNexoraToast?.(`Reasoning effort set to ${REASONING_EFFORT_LABELS[selectedReasoningEffort] || selectedReasoningEffort}`, 'success', 1800);
  });

  // Close dropdowns on click outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.model-dropdown-container')) {
      modelMenu?.classList.remove('open');
    }
    if (!e.target.closest('.reasoning-dropdown-container')) {
      reasoningMenu?.classList.remove('open');
    }
  });

  // 8. VOICE & UPLOAD actions
  function ensureVoiceStatusNode() {
    let status = document.getElementById('voiceStatus');
    if (!status && chatInputContainer) {
      status = document.createElement('div');
      status.id = 'voiceStatus';
      status.className = 'voice-status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      const controlsRow = chatInputContainer.querySelector('.controls-row');
      if (controlsRow) controlsRow.insertAdjacentElement('beforebegin', status);
      else chatInputContainer.appendChild(status);
    }
    return status;
  }

  function setVoiceStatus(message = '', type = 'info', autoClearMs = 0) {
    const status = ensureVoiceStatusNode();
    if (!status) return;
    window.clearTimeout(status._clearTimer);
    if (!message) {
      status.className = 'voice-status';
      status.replaceChildren();
      return;
    }

    status.className = `voice-status visible ${type || 'info'}`;
    const wave = document.createElement('span');
    wave.className = 'voice-wave';
    wave.setAttribute('aria-hidden', 'true');
    wave.innerHTML = '<i></i><i></i><i></i>';
    const label = document.createElement('span');
    label.className = 'voice-status-text';
    label.textContent = message;
    status.replaceChildren(wave, label);

    if (autoClearMs) {
      status._clearTimer = window.setTimeout(() => {
        if (label.isConnected && label.textContent === message) setVoiceStatus('');
      }, autoClearMs);
    }
  }

  function setVoiceListeningState(isListening, label = 'Voice input') {
    isListeningForSpeech = isListening;
    btnVoice.classList.toggle('is-listening', isListening);
    btnVoice.setAttribute('aria-pressed', isListening ? 'true' : 'false');
    btnVoice.setAttribute('aria-label', label);
    btnVoice.setAttribute('title', label);
  }

  function setVoiceTranscribingState(isTranscribing) {
    isTranscribingSpeech = isTranscribing;
    btnVoice.classList.toggle('is-transcribing', isTranscribing);
    btnVoice.toggleAttribute('disabled', isTranscribing);
    btnVoice.setAttribute('aria-busy', isTranscribing ? 'true' : 'false');
  }

  function isSpeechSecureContext() {
    return window.isSecureContext || ['localhost', '127.0.0.1'].includes(window.location.hostname);
  }

  function formatVoiceElapsed(ms = 0) {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(seconds / 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function updateVoiceRecordingStatus() {
    if (!isListeningForSpeech || !voiceStartedAt) return;
    const elapsed = Date.now() - voiceStartedAt;
    setVoiceStatus(`Listening ${formatVoiceElapsed(elapsed)} · tap the mic to transcribe`, 'listening');
  }

  function getRecorderMimeType() {
    if (!window.MediaRecorder?.isTypeSupported) return '';
    return [
      'audio/webm;codecs=opus',
      'audio/mp4;codecs=mp4a.40.2',
      'audio/ogg;codecs=opus',
      'audio/webm'
    ].find(type => MediaRecorder.isTypeSupported(type)) || '';
  }

  function mergeAudioChannels(audioBuffer) {
    const channels = Math.max(1, audioBuffer.numberOfChannels || 1);
    const mono = new Float32Array(audioBuffer.length);
    for (let channel = 0; channel < channels; channel += 1) {
      const samples = audioBuffer.getChannelData(channel);
      for (let index = 0; index < samples.length; index += 1) mono[index] += samples[index] / channels;
    }
    return mono;
  }

  function resampleVoicePcm(samples, sourceRate, targetRate = VOICE_TARGET_SAMPLE_RATE) {
    if (!samples.length || !sourceRate || sourceRate === targetRate) return samples;
    const ratio = sourceRate / targetRate;
    const outputLength = Math.max(1, Math.round(samples.length / ratio));
    const output = new Float32Array(outputLength);
    for (let index = 0; index < outputLength; index += 1) {
      const sourcePosition = index * ratio;
      const leftIndex = Math.floor(sourcePosition);
      const rightIndex = Math.min(samples.length - 1, leftIndex + 1);
      const mix = sourcePosition - leftIndex;
      output[index] = samples[leftIndex] * (1 - mix) + samples[rightIndex] * mix;
    }
    return output;
  }

  function encodePcm16Wav(samples, sampleRate = VOICE_TARGET_SAMPLE_RATE) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const writeAscii = (offset, value) => {
      for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
    };
    writeAscii(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeAscii(8, 'WAVE');
    writeAscii(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeAscii(36, 'data');
    view.setUint32(40, samples.length * 2, true);
    let offset = 44;
    for (let index = 0; index < samples.length; index += 1) {
      const clamped = Math.max(-1, Math.min(1, samples[index]));
      view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
      offset += 2;
    }
    return new Blob([buffer], { type: 'audio/wav' });
  }

  async function normalizeVoiceBlobToWav(blob) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return blob;
    const context = new AudioContextClass();
    try {
      const sourceBuffer = await blob.arrayBuffer();
      const decoded = await context.decodeAudioData(sourceBuffer.slice(0));
      const mono = mergeAudioChannels(decoded);
      const pcm = resampleVoicePcm(mono, decoded.sampleRate, VOICE_TARGET_SAMPLE_RATE);
      return encodePcm16Wav(pcm, VOICE_TARGET_SAMPLE_RATE);
    } finally {
      try { await context.close(); } catch {}
    }
  }

  function cleanupVoiceCapture() {
    window.clearInterval(voiceTimer);
    window.clearTimeout(voiceAutoStopTimer);
    voiceTimer = null;
    voiceAutoStopTimer = null;
    if (voiceStream) {
      voiceStream.getTracks().forEach(track => track.stop());
      voiceStream = null;
    }
    voiceRecorder = null;
    voiceStartedAt = 0;
    setVoiceListeningState(false, 'Voice input');
  }

  async function transcribeVoiceBlob(recordedBlob) {
    setVoiceTranscribingState(true);
    setVoiceStatus('Preparing audio for transcription…', 'transcribing');
    try {
      const wavBlob = await normalizeVoiceBlobToWav(recordedBlob);
      if (!wavBlob.size) throw new Error('No microphone audio was captured.');
      if (wavBlob.size > 8 * 1024 * 1024) throw new Error('Voice recording is too large. Please record a shorter message.');

      setVoiceStatus('Transcribing with Nemotron ASR…', 'transcribing');
      const token = await getNexoraAccessToken();
      const response = await fetch('/api/speech-to-text', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'audio/wav',
          'X-Audio-Filename': 'nexora-voice.wav'
        },
        body: wavBlob
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.detail || `Speech transcription failed (${response.status}).`);
      const transcript = String(payload?.text || '').trim();
      if (!transcript) throw new Error('No speech could be transcribed from that recording.');

      const currentPrompt = chatInput.value.trim();
      setPromptText([currentPrompt, transcript].filter(Boolean).join(currentPrompt ? ' ' : ''));
      resizeChatInput();
      chatInput.focus();
      const durationMs = Number(payload?.duration_ms || 0);
      setVoiceStatus(`Transcribed${durationMs ? ` in ${(durationMs / 1000).toFixed(1)}s` : ''}. Review and send when ready.`, 'done', 3400);
    } catch (error) {
      setVoiceStatus(error?.message || 'Speech transcription failed. Please try again.', 'error');
    } finally {
      setVoiceTranscribingState(false);
    }
  }

  async function stopVoiceRecording({ auto = false } = {}) {
    if (!voiceRecorder || !isListeningForSpeech) return;
    setVoiceStatus(auto ? 'Recording limit reached · preparing transcription…' : 'Preparing transcription…', 'transcribing');
    setVoiceListeningState(false, 'Voice input');
    window.clearInterval(voiceTimer);
    window.clearTimeout(voiceAutoStopTimer);
    voiceTimer = null;
    voiceAutoStopTimer = null;

    const recorder = voiceRecorder;
    await new Promise(resolve => {
      const finish = () => resolve();
      recorder.addEventListener('stop', finish, { once: true });
      try { recorder.stop(); } catch { resolve(); }
    });
    const mimeType = recorder.mimeType || 'audio/webm';
    const blob = new Blob(voiceChunks, { type: mimeType });
    voiceChunks = [];
    cleanupVoiceCapture();
    if (!blob.size) {
      setVoiceStatus('No microphone audio was captured. Please try again.', 'error');
      return;
    }
    await transcribeVoiceBlob(blob);
  }

  async function startVoiceRecording() {
    if (isTranscribingSpeech) return;
    if (isListeningForSpeech) {
      await stopVoiceRecording();
      return;
    }
    if (!isSpeechSecureContext()) {
      setVoiceStatus('Voice input needs HTTPS or localhost to access the microphone.', 'error');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setVoiceStatus('Voice recording is not supported in this browser. Use a current Chrome, Edge, Safari, or Firefox release.', 'error');
      return;
    }

    try {
      setVoiceStatus('Requesting microphone permission…', 'info');
      voiceStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      const mimeType = getRecorderMimeType();
      voiceRecorder = mimeType ? new MediaRecorder(voiceStream, { mimeType }) : new MediaRecorder(voiceStream);
      voiceChunks = [];
      voiceRecorder.addEventListener('dataavailable', event => {
        if (event.data?.size) voiceChunks.push(event.data);
      });
      voiceRecorder.addEventListener('error', event => {
        const message = event?.error?.message || 'Microphone recording failed.';
        cleanupVoiceCapture();
        setVoiceStatus(message, 'error');
      });
      voiceRecorder.start(250);
      voiceStartedAt = Date.now();
      setVoiceListeningState(true, 'Stop and transcribe voice input');
      updateVoiceRecordingStatus();
      voiceTimer = window.setInterval(updateVoiceRecordingStatus, 500);
      voiceAutoStopTimer = window.setTimeout(() => stopVoiceRecording({ auto: true }), VOICE_MAX_RECORDING_MS);
      chatInput.focus();
    } catch (error) {
      cleanupVoiceCapture();
      const denied = ['NotAllowedError', 'SecurityError'].includes(error?.name);
      setVoiceStatus(
        denied ? 'Microphone permission is blocked. Allow microphone access and try again.' : (error?.message || 'Could not start microphone recording.'),
        'error'
      );
    }
  }

  btnVoice.setAttribute('title', 'Voice input · Nemotron 3.5 ASR');
  btnVoice.addEventListener('click', async () => {
    btnVoice.style.transform = 'scale(0.92)';
    window.setTimeout(() => { btnVoice.style.transform = ''; }, 110);
    await startVoiceRecording();
  });

  btnUpload.addEventListener('click', () => {
    btnUpload.style.transform = 'scale(0.9)';
    setTimeout(() => { btnUpload.style.transform = 'none'; }, 100);
    
    // Create an input file element to open system file dialog
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.onchange = async (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length) {
        const fileNames = files.map(file => file.name).join(', ');
        chatInput.value = `[Attached ${files.length === 1 ? 'file' : 'files'}: ${fileNames}] ${chatInput.value}`;
        chatInput.focus();

        try {
          const uploadedFiles = await prepareUploadedFiles(files, {
            label: activeChatId || 'chat-attachment',
            source: 'chat-attachment'
          });
          await createProjectRecord({
            title: files.length === 1 ? `Uploaded file: ${files[0].name}` : `Uploaded files: ${files.length} attachments`,
            description: 'Chat attachment',
            kind: 'uploaded-file',
            files: uploadedFiles
          });
          renderLibrary();
        } catch (error) {
          alert(formatDatabaseIssue('Attachment save failed', error));
        }
      }
    };
    fileInput.click();
  });

  // 9. LOADING AND APPPENDING HISTORY CHATS
  async function loadChat(chatId) {
    if (!chatId) return;
    if (!chatDatabase[chatId]) chatDatabase[chatId] = [];

    activeChatId = chatId;
    currentGeneratedProject = null;
    activeConversationPlanCard = null;
    hideConversationPlanTracker();
    activeThinkingBubble = null;
    if (generationInspector && !activeGenerationController) generationInspector.hidden = true;
    chatInputContainer?.classList.add('compact');
    welcomeScreen.style.display = 'none';
    if(templatesScreen) templatesScreen.style.display = 'none';
    if(projectsScreen) projectsScreen.style.display = 'none';
    if(libraryScreen) libraryScreen.style.display = 'none';
    if(settingsScreen) settingsScreen.style.display = 'none';
    if(archiveScreen) archiveScreen.style.display = 'none';
    chatMessages.style.display = 'flex';
    chatMessages.innerHTML = '';
    const conversation = conversationList.find(item => String(item.id) === String(chatId));
    updateWorkspaceShell({ panelOpen: false, title: conversation?.title || 'Website build' });

    document.querySelectorAll('.history-link').forEach(link => {
      link.classList.toggle('active', link.getAttribute('data-chat-id') === chatId);
    });

    const cachedMessages = chatDatabase[chatId] || [];
    if (!cachedMessages.length && supabaseClient && !String(chatId).startsWith('local-')) {
      const loading = appendMessageBubble('assistant', 'Loading this conversation...');
      try {
        await loadConversationMessagesFromDatabase(chatId);
      } finally {
        loading.remove();
      }
    }

    chatMessages.innerHTML = '';
    (chatDatabase[chatId] || []).forEach(msg => appendMessageBubble(msg.sender, msg.text));
    persistWorkspace();
    scrollToBottom();
  }

  // Setup click listeners for existing history items
  setupHistoryListeners();

  function setupHistoryListeners() {
    document.querySelectorAll('.history-link').forEach(link => {
      // Remove old listener if any to avoid stacking
      link.replaceWith(link.cloneNode(true));
    });

    document.querySelectorAll('.history-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const chatId = link.getAttribute('data-chat-id');
        loadChat(chatId);
        // Close mobile menu if open
        sidebar.classList.remove('open');
        mobileOverlay.classList.remove('visible');
      });
    });
  }

  // Helper: Append a message bubble to log
  function appendMessageBubble(sender, text = '', responseMeta = null) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', sender);

    if (sender === 'user' && chatMessages.querySelector('.message.assistant')) {
      messageDiv.classList.add('starts-new-turn');
    }

    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('message-avatar');

    if (sender === 'user') {
      avatarDiv.textContent = getUserInitial();
    } else {
      const avatarImg = document.createElement('img');
      avatarImg.src = 'assets/new-dark-mode.webp';
      avatarImg.alt = 'Nexora Logo';
      avatarDiv.appendChild(avatarImg);
    }

    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';

    const bubbleDiv = document.createElement('div');
    bubbleDiv.classList.add('message-bubble');
    bubbleDiv.innerHTML = formatMessageText(text);
    messageContent.appendChild(bubbleDiv);

    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(messageContent);
    chatMessages.appendChild(messageDiv);
    if (sender === 'assistant' && responseMeta) attachAssistantResponseMeta(bubbleDiv, responseMeta);
    scrollToBottom();
    return bubbleDiv;
  }

  function formatResponseDuration(durationMs = 0) {
    const ms = Math.max(0, Number(durationMs) || 0);
    if (ms < 1000) return `${Math.round(ms)} ms`;
    if (ms < 10000) return `${(ms / 1000).toFixed(1)} s`;
    if (ms < 60000) return `${Math.round(ms / 1000)} s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.round((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  function createAssistantResponseMeta(startedAt, text = '', route = {}, extra = {}) {
    const runtime = getAgentRuntimeConfig();
    const started = Number(startedAt);
    const durationMs = Number.isFinite(started) ? Math.max(0, Math.round(performance.now() - started)) : 0;
    return {
      kind: 'nexora.ai-response',
      createdAt: new Date().toISOString(),
      durationMs,
      duration: formatResponseDuration(durationMs),
      action: String(route?.action || 'chat'),
      model: String(runtime.modelId || getSelectedModelLabel() || 'selected-model'),
      thinkingEnabled: Boolean(getReasoningRequestOptions().enableThinking),
      reasoningEffort: String(getReasoningRequestOptions().reasoningEffort || 'none'),
      reasoningTokens: Math.max(0, Number(generationInspectorState.reasoningTokens) || 0),
      outputTokens: Math.max(0, Number(generationInspectorState.outputTokens) || estimateVisibleTokens(text)),
      response: String(text || ''),
      ...extra
    };
  }

  function attachAssistantResponseMeta(bubble, responseMeta = {}) {
    const message = bubble?.closest('.message.assistant');
    const content = bubble?.closest('.message-content');
    if (!message || !content) return;
    content.querySelector('.assistant-response-meta')?.remove();

    const meta = {
      ...responseMeta,
      response: String(responseMeta.response ?? bubble.innerText ?? '')
    };
    const footer = document.createElement('div');
    footer.className = 'assistant-response-meta';

    const duration = document.createElement('span');
    duration.className = 'assistant-response-time';
    duration.textContent = meta.duration || formatResponseDuration(meta.durationMs || 0);
    duration.title = 'AI response time';

    const copyResponse = document.createElement('button');
    copyResponse.type = 'button';
    copyResponse.className = 'assistant-meta-action';
    copyResponse.setAttribute('aria-label', 'Copy AI response');
    copyResponse.title = 'Copy response';
    copyResponse.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg><span>Copy</span>';
    copyResponse.addEventListener('click', async () => {
      const copied = await copyTextToClipboard(String(meta.response || ''));
      copyResponse.classList.toggle('is-copied', copied);
      const label = copyResponse.querySelector('span');
      if (label) label.textContent = copied ? 'Copied' : 'Copy failed';
      setTimeout(() => {
        copyResponse.classList.remove('is-copied');
        if (label) label.textContent = 'Copy';
      }, 1400);
    });

    const copyMeta = document.createElement('button');
    copyMeta.type = 'button';
    copyMeta.className = 'assistant-meta-action assistant-meta-json';
    copyMeta.setAttribute('aria-label', 'Copy AI response metadata');
    copyMeta.title = 'Copy response metadata';
    copyMeta.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3"></path><path d="M16 3h3a2 2 0 0 1 2 2v3"></path><path d="M8 21H5a2 2 0 0 1-2-2v-3"></path><path d="M16 21h3a2 2 0 0 0 2-2v-3"></path><path d="M8 12h8"></path></svg><span>Metadata</span>';
    copyMeta.addEventListener('click', async () => {
      const copied = await copyTextToClipboard(JSON.stringify(meta, null, 2));
      copyMeta.classList.toggle('is-copied', copied);
      const label = copyMeta.querySelector('span');
      if (label) label.textContent = copied ? 'Copied' : 'Copy failed';
      setTimeout(() => {
        copyMeta.classList.remove('is-copied');
        if (label) label.textContent = 'Metadata';
      }, 1400);
    });

    footer.append(duration, copyResponse, copyMeta);
    content.appendChild(footer);
  }

  function escapeHTML(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showNexoraToast(message, type = 'info', timeout = 5200) {
    const text = String(message || '').trim();
    if (!text) return;
    let stack = document.querySelector('.nexora-toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'nexora-toast-stack';
      stack.setAttribute('aria-live', 'polite');
      stack.setAttribute('aria-relevant', 'additions');
      document.body.appendChild(stack);
    }
    const toast = document.createElement('div');
    toast.className = `nexora-toast nexora-toast-${String(type || 'info').replace(/[^a-z0-9_-]/gi, '')}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.innerHTML = `
      <span class="nexora-toast-dot" aria-hidden="true"></span>
      <span class="nexora-toast-message">${escapeHTML(text)}</span>
      <button type="button" class="nexora-toast-close" aria-label="Close notification">×</button>
    `;
    const close = () => {
      toast.classList.add('leaving');
      setTimeout(() => toast.remove(), 180);
    };
    toast.querySelector('.nexora-toast-close')?.addEventListener('click', close);
    stack.appendChild(toast);
    if (timeout > 0) setTimeout(close, timeout);
  }

  function cleanGenerationErrorMessage(error) {
    return String(error?.message || error || 'Unknown generation issue')
      .replace(/^(?:NO_FALLBACK_GENERATION|WEBSITE_BUNDLE_REQUIRED|ATOMIC_BLUEPRINT_REQUIRED):\s*/i, '')
      .replace(/serverless_agent_deadline_reached/gi, 'The hosted build reached its execution window before final verification. Try Low reasoning effort or a smaller first build, then revise it.')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function createGenerationPipelineError(stage, error) {
    const clean = cleanGenerationErrorMessage(error);
    const diagnostic = error?.diagnostic ? ` ${error.diagnostic}` : '';
    const message = `${stage} failed. ${clean}.${diagnostic}`;
    const wrapped = new Error(message);
    wrapped.name = 'NexoraGenerationPipelineError';
    wrapped.stage = stage;
    wrapped.cause = error;
    if (error?.diagnostic) wrapped.diagnostic = error.diagnostic;
    return wrapped;
  }

  // Helper: Simple Markdown Formatter for Code, Bold and List Items
  function formatMessageText(text) {
    let html = escapeHTML(text);

    // Code blocks: ```language ... ```
    const codeBlockRegex = /```(?:python|html|css|javascript|js|json)?([\s\S]*?)```/g;
    html = html.replace(codeBlockRegex, (match, codeSnippet) => {
      return `<pre><code>${codeSnippet.trim()}</code></pre>`;
    });

    // Inline code: `code`
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold text: **text**
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Lists items: * item / - item
    html = html.replace(/^\*\s+(.+)$/gm, '&bull; $1');
    html = html.replace(/^-\s+(.+)$/gm, '&bull; $1');

    // Handle newlines
    html = html.replace(/\n/g, '<br>');

    return html;
  }

  function scrollToBottom() {
    if (!chatMessages) return;
    if (scrollToBottom.frame) return;
    scrollToBottom.frame = requestAnimationFrame(() => {
      scrollToBottom.frame = 0;
      chatMessages.scrollTop = chatMessages.scrollHeight;
    });
  }

  function scrollChatItemToTop(element) {
    if (!element || !chatMessages) return;
    const chatRect = chatMessages.getBoundingClientRect();
    const itemRect = element.getBoundingClientRect();
    const nextTop = chatMessages.scrollTop + itemRect.top - chatRect.top - 12;
    chatMessages.scrollTop = Math.max(0, nextTop);
  }

  function ensureChatMode() {
    chatInputContainer?.classList.add('compact');
    updateWorkspaceShell({ panelOpen: false, title: activeChatId ? (conversationList.find(item => String(item.id) === String(activeChatId))?.title || 'Website build') : 'Website build' });
    if (welcomeScreen.style.display !== 'none') {
      welcomeScreen.style.display = 'none';
      chatMessages.style.display = 'flex';
      chatMessages.innerHTML = '';
    }

    if (templatesScreen && templatesScreen.style.display !== 'none') {
      templatesScreen.style.display = 'none';
      chatMessages.style.display = 'flex';
    }

    if (projectsScreen && projectsScreen.style.display !== 'none') {
      projectsScreen.style.display = 'none';
      chatMessages.style.display = 'flex';
    }

    if (libraryScreen && libraryScreen.style.display !== 'none') {
      libraryScreen.style.display = 'none';
      chatMessages.style.display = 'flex';
    }

    if (settingsScreen && settingsScreen.style.display !== 'none') {
      settingsScreen.style.display = 'none';
      chatMessages.style.display = 'flex';
    }

    if (archiveScreen && archiveScreen.style.display !== 'none') {
      archiveScreen.style.display = 'none';
      chatMessages.style.display = 'flex';
    }
  }

  function getSelectedModelLabel() {
    return selectedOpenRouterModel?.label || selectedModelLabel?.textContent?.trim() || 'Selected provider model';
  }

  
function getWebsiteAgentSystemPrompt() {
    const pipelinePrompt = window.NexoraModularJsonPipeline?.getSystemPrompt?.() || '';
    return `${pipelinePrompt}\nThis legacy direct website mode is deprecated. If called, return a compact Nexora modular JSON module only, not one giant visual document. Prefer the active modular generation flow. Never output raw HTML/CSS/JS.`;
  }

  function getChatSystemPrompt(route = null) {
    const base = [
      'You are Nexora.AI, a conversational AI assistant and website-building copilot.',
      'Respond naturally to the actual user message using the full conversation context. Never substitute canned greeting text or keyword-triggered replies.',
      'Be concise, useful, and context-aware. Do not expose model-provider names, internal routing, infrastructure, hidden reasoning, credentials, or implementation telemetry.',
      'When clarification is genuinely needed before a build, ask only the questions that materially affect the result and make the options easy to choose.'
    ];
    if (route?.assistantDirective) base.push(`Turn-planner directive: ${route.assistantDirective}`);
    if (Array.isArray(route?.questions) && route.questions.length) {
      base.push(`AI-planned clarification options: ${JSON.stringify(route.questions)}`);
    }
    return base.join(' ');
  }

  // Intent ownership lives on the AI turn planner (/api/nexora/route). Legacy
  // compiler/recovery helpers may still request generic metadata, but they do
  // not inspect user wording or decide whether a build should start.
  function inferWebsiteIntentFromText() {
    return {
      intent: 'unknown',
      confidence: 0,
      scale: 'standard',
      pageType: 'custom',
      reason: 'Neutral metadata fallback only; conversational intent is AI-planned.'
    };
  }

  function getOpenRouterOptions() {
    return {
      runtimeConfig: NEXORA_RUNTIME_CONFIG,
      apiUrl: OPENROUTER_API_URL,
      proxyUrl: OPENROUTER_PROXY_URL,
      apiKey: OPENROUTER_API_KEY,
      appTitle: OPENROUTER_APP_TITLE
    };
  }

  function hasBrowserOpenRouterKey() {
    return window.NexoraOpenRouterBridge
      ? window.NexoraOpenRouterBridge.hasBrowserKey(OPENROUTER_API_KEY)
      : Boolean(String(OPENROUTER_API_KEY || '').trim() && String(OPENROUTER_API_KEY || '').trim() !== 'PASTE_YOUR_OPENROUTER_API_KEY_HERE');
  }

  function shouldUseOpenRouterProxy() {
    return window.NexoraOpenRouterBridge
      ? window.NexoraOpenRouterBridge.shouldUseProxy(getOpenRouterOptions())
      : (NEXORA_RUNTIME_CONFIG.FORCE_OPENROUTER_PROXY === true || (NEXORA_RUNTIME_CONFIG.FORCE_OPENROUTER_PROXY !== false && OPENROUTER_PROXY_URL && window.location.protocol !== 'file:' && !hasBrowserOpenRouterKey()));
  }

  function getOpenRouterEndpoint() {
    return window.NexoraOpenRouterBridge
      ? window.NexoraOpenRouterBridge.getEndpoint(getOpenRouterOptions())
      : (shouldUseOpenRouterProxy() ? OPENROUTER_PROXY_URL : OPENROUTER_API_URL);
  }

  function getOpenRouterEndpointLabel() {
    try {
      return new URL(getOpenRouterEndpoint(), window.location.href).href;
    } catch {
      return getOpenRouterEndpoint();
    }
  }

  function getOpenRouterHeaders() {
    return window.NexoraOpenRouterBridge
      ? window.NexoraOpenRouterBridge.getHeaders(getOpenRouterOptions())
      : (() => {
        const headers = { 'Content-Type': 'application/json' };
        if (!shouldUseOpenRouterProxy()) {
          headers.Authorization = `Bearer ${String(OPENROUTER_API_KEY || '').trim()}`;
          headers['X-OpenRouter-Title'] = OPENROUTER_APP_TITLE;
        }
        return headers;
      })();
  }

  function getOpenRouterConnectionHelp() {
    return window.NexoraOpenRouterBridge
      ? window.NexoraOpenRouterBridge.getConnectionHelp(getOpenRouterOptions())
      : (shouldUseOpenRouterProxy()
        ? 'Set OPENROUTER_API_KEY in Vercel Project Settings > Environment Variables, then redeploy. The model is read from config/app.config.js.'
        : 'For local direct testing, set OPENROUTER_API_KEY in config/app.config.js, or run with `vercel dev` so /api/openrouter can use your .env file.');
  }

  async function classifyUserIntent(message, signal = null, currentProject = null) {
    const config = getAgentRuntimeConfig();
    if (!config.modelId) throw new Error('Select an AI model before sending a message.');
    if (config.provider !== 'codex' && !config.apiKey) throw new Error('Configure an AI provider before sending a message.');
    if (config.provider === 'codex' && !codexRuntimeState.connected) throw new Error('Connect ChatGPT Codex before sending a message.');

    const headers = { 'Content-Type': 'application/json' };
    if (config.provider === 'codex') headers.Authorization = `Bearer ${await getNexoraAccessToken()}`;
    const response = await fetch('/api/nexora/route', {
      method: 'POST',
      signal: signal || undefined,
      headers,
      body: JSON.stringify({
        provider: config.provider,
        model_id: config.modelId,
        api_key: config.apiKey,
        base_url: config.baseUrl,
        message,
        system: '',
        history: getActiveConversationHistoryForAi(),
        temperature: 0.12,
        max_tokens: 1200,
        enable_thinking: getReasoningRequestOptions().enableThinking,
        reasoning_effort: getReasoningRequestOptions().reasoningEffort,
        project: {
          name: currentProject?.projectName || '',
          files: Array.isArray(currentProject?.files) ? currentProject.files.map(file => String(file.name || '')).filter(Boolean).slice(0, 40) : [],
          has_existing_project: Boolean(currentProject?.files?.length)
        }
      })
    });
    const text = await response.text();
    if (!response.ok) throw new Error(getConfiguredProviderErrorMessage(text, response.status));
    let route;
    try { route = JSON.parse(text); } catch { throw new Error('The AI turn planner returned an invalid response.'); }
    route.intent = route.action;
    route.confidence = Number(route.confidence || 0);
    route.currentProject = currentProject || null;
    return route;
  }

  function wait(ms, signal = null) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('Generation stopped.', 'AbortError'));
        return;
      }
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('Generation stopped.', 'AbortError'));
      }, { once: true });
    });
  }


  function buildOpenRouterPayload(mode, payload) {
    const isWebsiteAgent = mode === 'website' || mode === 'website_repair';
    const isWebsiteRepair = mode === 'website_repair';
    const requestedScale = payload.intent?.scale || 'standard';
    const richRequest = ['rich', 'full'].includes(requestedScale);
    const userText = isWebsiteAgent
      ? (isWebsiteRepair
        ? [
            'Repair the previous answer into one valid Nexora Visual Document JSON.',
            'Return only JSON using schema "nexora.visual-document" and version "3.0.0".',
            'Do not create or mention a local fallback, generic hero page, predefined clone template, or platform-specific local rule.',
            'The repaired JSON must include document, settings, theme, assets, components, interactions, pages, and complete page.elements.',
            'Do not include a files array as the source of truth; Nexora derives index.html, style.css, and script.js from the visual-document JSON.',
            'All layout, placement, colors, edge radius, typography, imagery/placeholders, animations, transitions, responsive behavior, overflow, and interactions must be explicitly represented inside element objects.',
            'Preserve the user request and infer the correct target interface from your model knowledge.',
            `Intent context from router, for scale only: ${JSON.stringify(payload.intent || {})}`,
            `Original user request: ${payload.prompt}`,
            `Validation issue: ${payload.error || 'Missing or incomplete Nexora Visual Document.'}`,
            `Previous AI response to repair: ${String(payload.previous || '').slice(0, 26000)}`
          ].join('\n')
        : [
            'Create one complete Nexora Visual Document JSON for the user request below.',
            'The JSON is the only source of truth. Do not write a separate visible chat plan.',
            'Do not choose, mention, or adapt predefined templates or platform-specific local rules.',
            'The AI must decide the full page structure, element hierarchy, style objects, color system, spacing, edges, components, imagery/placeholders, animations, transitions, overflow, responsive rules, and interactions based only on the user request and general model knowledge.',
            'Only universal constraints: responsive on mobile/tablet/laptop/desktop, readable contrast, accessible semantics, and derivable preview/export files.',
            'If the request is for a clone, redesign, or inspired-by page, infer the expected interface from your model knowledge and generate a recognizable but original visual-document structure without protected assets.',
            'Return only JSON with schema "nexora.visual-document" and version "3.0.0". Do not include raw file content; Nexora derives index.html, style.css, and script.js.',
            `Intent context from router, for scale only: ${JSON.stringify(payload.intent || {})}`,
            `User request: ${payload.prompt}`
          ].join('\n'))
      : payload.message;

    return {
      model: getSelectedOpenRouterModel(),
      stream: true,
      temperature: isWebsiteAgent ? (richRequest ? 0.62 : 0.54) : 0.65,
      max_tokens: isWebsiteAgent ? (requestedScale === 'full' ? 20000 : richRequest ? 17000 : 13000) : 2200,
      response_format: isWebsiteAgent ? { type: 'json_object' } : undefined,
      messages: [
        { role: 'system', content: isWebsiteAgent ? getWebsiteAgentSystemPrompt() : getChatSystemPrompt() },
        { role: 'user', content: userText }
      ]
    };
  }

  function getConfiguredProviderErrorMessage(text, status) {
    if (!text) return `AI provider request failed with status ${status}.`;
    try {
      const parsed = JSON.parse(text);
      const detail = parsed?.detail;
      if (typeof detail === 'string' && detail.trim()) return detail.trim();
      if (detail && typeof detail === 'object') return detail.message || detail.error || JSON.stringify(detail);
      return parsed?.error?.message || parsed?.error || parsed?.message || text;
    } catch {
      return text;
    }
  }

  function getOpenRouterErrorMessage(text, status) {
    if (!text) return `OpenRouter failed with status ${status}.`;
    return getConfiguredProviderErrorMessage(text, status);
  }

  function extractOpenRouterMessageContent(payload) {
    if (!payload) return '';
    if (['status', 'reasoning', 'usage'].includes(payload.type)) return '';
    const choice = payload.choices?.[0] || {};
    return choice.delta?.content || choice.message?.content || choice.text || payload.output_text || payload.content || '';
  }

  function normalizeStreamText(value) {
    if (Array.isArray(value)) {
      return value.map(part => typeof part === 'string' ? part : (part?.text || part?.content || '')).join('');
    }
    return typeof value === 'string' ? value : '';
  }

  function estimateVisibleTokens(value = '') {
    return Math.max(0, Math.ceil(String(value || '').length / 4));
  }

  function extractReasoningTokenCount(payload = {}) {
    const usage = payload?.usage || payload || {};
    const details = usage.completion_tokens_details || usage.output_tokens_details || {};
    const value = details.reasoning_tokens ?? usage.reasoning_tokens ?? usage.reasoning_output_tokens ?? payload.reasoning_tokens;
    const count = Number(value);
    return Number.isFinite(count) && count >= 0 ? count : null;
  }

  function extractReasoningStreamText(payload = {}) {
    const choice = payload.choices?.[0] || {};
    return normalizeStreamText(
      choice.delta?.reasoning_content ?? choice.delta?.reasoning ??
      choice.message?.reasoning_content ?? choice.message?.reasoning ??
      payload.reasoning_content ?? payload.reasoning ?? ''
    );
  }

  function extractOpenRouterContentFromText(text = '') {
    const clean = String(text || '').trim();
    if (!clean) return '';
    try {
      const parsed = JSON.parse(clean);
      if (parsed?.error) throw new Error(parsed.error.message || 'OpenRouter returned an error.');
      const content = extractOpenRouterMessageContent(parsed);
      if (Array.isArray(content)) return content.map(part => typeof part === 'string' ? part : (part?.text || part?.content || '')).join('');
      return typeof content === 'string' ? content : JSON.stringify(content || '');
    } catch (error) {
      if (error instanceof SyntaxError) return '';
      throw error;
    }
  }

  function processOpenRouterSseChunk(text = '', handlers = {}, state = { fullText: '', reasoningTokens: 0 }) {
    const lines = String(text || '').split('\n');
    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) return;
      const data = trimmed.slice(5).trim();
      if (!data || data === '[DONE]') return;
      try {
        const json = JSON.parse(data);
        if (json.error) throw new Error(json.error.message || 'OpenRouter returned an error.');
        const finishReason = json.choices?.[0]?.finish_reason;
        if (finishReason) state.finishReason = finishReason;
        if (json.type === 'status') {
          handlers.onStatus?.(json.status || json.message || 'Model is working…', json);
          return;
        }
        const explicitReasoningTokens = extractReasoningTokenCount(json);
        const reasoningText = extractReasoningStreamText(json);
        if (json.type === 'reasoning' || reasoningText || explicitReasoningTokens !== null) {
          const nextCount = explicitReasoningTokens !== null
            ? explicitReasoningTokens
            : Number(state.reasoningTokens || 0) + estimateVisibleTokens(reasoningText);
          state.reasoningTokens = Math.max(Number(state.reasoningTokens || 0), nextCount);
          handlers.onReasoning?.({
            tokens: state.reasoningTokens,
            tokenDelta: explicitReasoningTokens === null ? estimateVisibleTokens(reasoningText) : 0,
            estimated: explicitReasoningTokens === null || Boolean(json.estimated),
            status: json.status || 'Model is reasoning…'
          });
        }
        if (json.type === 'usage' || json.usage) handlers.onUsage?.(json.usage || json);
        const token = normalizeStreamText(extractOpenRouterMessageContent(json));
        if (token) {
          state.fullText += token;
          handlers.onToken?.(token, state.fullText);
        }
      } catch (error) {
        if (error instanceof SyntaxError) return;
        throw error;
      }
    });
  }

  async function streamOpenRouterLocal(mode, payload, handlers = {}) {
    if (!shouldUseOpenRouterProxy() && !hasBrowserOpenRouterKey()) {
      throw new Error(`OpenRouter API key is missing. ${getOpenRouterConnectionHelp()}`);
    }

    const requestBody = buildOpenRouterPayload(mode, payload);
    const isWebsiteAgent = mode === 'website' || mode === 'website_repair';
    const isWebsiteRepair = mode === 'website_repair';
    handlers.onStatus?.(isWebsiteAgent ? (isWebsiteRepair ? `Repairing Nexora JSON on ${getSelectedModelLabel()}...` : `Starting local website agent on ${getSelectedModelLabel()}...`) : `Connecting to ${getSelectedModelLabel()}...`);

    let response;

    try {
      response = await fetch(getOpenRouterEndpoint(), {
        method: 'POST',
        signal: handlers.signal || undefined,
        headers: getOpenRouterHeaders(),
        body: JSON.stringify(requestBody)
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      throw new Error(
        `Could not connect to OpenRouter through ${shouldUseOpenRouterProxy() ? 'the Vercel API proxy' : 'the browser direct fallback'}. ${error?.message || 'Failed to fetch'}. ` +
        getOpenRouterConnectionHelp()
      );
    }

    if ((!response.ok || !response.body) && requestBody.response_format) {
      const firstErrorText = await response.text().catch(() => '');
      const retryBody = { ...requestBody };
      delete retryBody.response_format;
      response = await fetch(getOpenRouterEndpoint(), {
        method: 'POST',
        signal: handlers.signal || undefined,
        headers: getOpenRouterHeaders(),
        body: JSON.stringify(retryBody)
      }).catch(error => {
        if (error?.name === 'AbortError') throw error;
        throw new Error(
          `Could not connect to OpenRouter through ${shouldUseOpenRouterProxy() ? 'the Vercel API proxy' : 'the browser direct fallback'}. ${error?.message || 'Failed to fetch'}. ` +
          getOpenRouterConnectionHelp()
        );
      });

      if ((!response.ok || !response.body) && firstErrorText) {
        const retryErrorText = await response.text().catch(() => firstErrorText);
        throw new Error(getOpenRouterErrorMessage(retryErrorText || firstErrorText, response.status));
      }
    }

    if (!response.ok || !response.body) {
      const errorText = await response.text().catch(() => 'OpenRouter request failed.');
      throw new Error(getOpenRouterErrorMessage(errorText, response.status));
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const state = { fullText: '', reasoningTokens: 0 };
    let buffer = '';
    let rawStreamText = '';

    while (true) {
      if (handlers.signal?.aborted) {
        await reader.cancel().catch(() => {});
        throw new DOMException('Generation stopped.', 'AbortError');
      }
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      rawStreamText += chunk;
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      processOpenRouterSseChunk(lines.join('\n'), handlers, state);
    }

    const flushed = decoder.decode();
    if (flushed) {
      rawStreamText += flushed;
      buffer += flushed;
    }
    if (buffer.trim()) processOpenRouterSseChunk(`${buffer}\n`, handlers, state);

    if (!state.fullText.trim()) {
      const jsonContent = extractOpenRouterContentFromText(rawStreamText);
      if (jsonContent) {
        state.fullText = jsonContent;
        handlers.onToken?.(jsonContent, state.fullText);
      } else if (rawStreamText.trim() && !rawStreamText.includes('data:')) {
        state.fullText = rawStreamText.trim();
        handlers.onToken?.(state.fullText, state.fullText);
      }
    }

    if (!state.fullText.trim()) {
      throw new Error('OpenRouter ended before any content was received. Please retry; Nexora kept the editor state safe.');
    }

    handlers.onDone?.({ ok: true, model: getSelectedOpenRouterModel() }, state.fullText);
    return state.fullText;
  }

  const GENERATION_EVENT_LIMIT = 40;
  const generationInspectorState = {
    reasoningTokens: 0,
    reasoningEstimated: false,
    outputTokens: 0,
    seenEvents: new Set()
  };

  function setGenerationInspectorExpanded(expanded) {
    if (!generationInspector || !generationInspectorToggle) return;
    generationInspector.classList.toggle('is-collapsed', !expanded);
    generationInspectorToggle.setAttribute('aria-expanded', String(Boolean(expanded)));
  }

  function mountGenerationInspectorInConversation() {
    if (!generationInspector || !chatMessages) return;
    chatMessages.appendChild(generationInspector);
  }

  function appendGenerationEvent(message, phase = 'SYSTEM', eventId = '') {
    const cleanMessage = String(message || '').trim();
    if (!generationEventLog || !cleanMessage) return;
    const cleanPhase = String(phase || 'SYSTEM').trim().toUpperCase();
    const signature = String(eventId || `${cleanPhase}:${cleanMessage}`);
    if (generationInspectorState.seenEvents.has(signature)) return;
    generationInspectorState.seenEvents.add(signature);

    const row = document.createElement('div');
    row.className = 'generation-event';
    const phaseNode = document.createElement('span');
    phaseNode.className = 'generation-event-phase';
    phaseNode.textContent = cleanPhase;
    const messageNode = document.createElement('span');
    messageNode.className = 'generation-event-message';
    messageNode.textContent = cleanMessage;
    messageNode.title = cleanMessage;
    row.append(phaseNode, messageNode);
    generationEventLog.appendChild(row);
    while (generationEventLog.children.length > GENERATION_EVENT_LIMIT) generationEventLog.firstElementChild?.remove();
    generationEventLog.scrollTop = generationEventLog.scrollHeight;
  }

  function setGenerationInspectorStatus(status, phase = '', progress = null) {
    const cleanStatus = String(status || 'Working…').trim();
    setThinkingBubbleStatus(cleanStatus);
    if (!generationInspector) return;
    if (generationInspectorStatus) generationInspectorStatus.textContent = cleanStatus;
    if (generationInspectorTitle) generationInspectorTitle.textContent = phase ? `${String(phase).toUpperCase()} · Generation activity` : 'Generation activity';
    if (generationProgressBar && progress !== null && Number.isFinite(Number(progress))) {
      generationProgressBar.style.width = `${Math.max(3, Math.min(100, Number(progress) * 100))}%`;
    }
  }

  function setThinkingBubbleStatus(status = '') {
    const statusNode = activeThinkingBubble?.querySelector('[data-thinking-status]');
    if (!statusNode) return;
    statusNode.textContent = thinkingModeEnabled ? 'Thinking' : 'Responding';
  }

  function setGenerationTokenBadges({ reasoningTokens = null, outputTokens = null, reasoningEstimated = null } = {}) {
    if (reasoningTokens !== null && Number.isFinite(Number(reasoningTokens))) {
      generationInspectorState.reasoningTokens = Math.max(0, Math.round(Number(reasoningTokens)));
      if (reasoningEstimated !== null) generationInspectorState.reasoningEstimated = Boolean(reasoningEstimated);
      if (generationThinkingTokens) {
        generationThinkingTokens.hidden = false;
        generationThinkingTokens.textContent = `Thinking ${generationInspectorState.reasoningTokens.toLocaleString()}${generationInspectorState.reasoningEstimated ? ' est.' : ''}`;
      }
    }
    if (outputTokens !== null && Number.isFinite(Number(outputTokens))) {
      generationInspectorState.outputTokens = Math.max(0, Math.round(Number(outputTokens)));
      if (generationOutputTokens) {
        generationOutputTokens.hidden = false;
        generationOutputTokens.textContent = `Output ${generationInspectorState.outputTokens.toLocaleString()}`;
      }
    }
    const tokenNode = activeThinkingBubble?.querySelector('[data-thinking-tokens]');
    if (tokenNode && thinkingModeEnabled && generationInspectorState.reasoningTokens >= 0) {
      tokenNode.hidden = false;
      tokenNode.textContent = `${generationInspectorState.reasoningTokens.toLocaleString()} token${generationInspectorState.reasoningTokens === 1 ? '' : 's'}${generationInspectorState.reasoningEstimated ? ' est.' : ''}`;
    }
    scrollToBottom({ force: true });
  }

  function updateGenerationReasoning(event = {}) {
    const explicit = Number(event.tokens);
    const next = Number.isFinite(explicit)
      ? explicit
      : generationInspectorState.reasoningTokens + Math.max(0, Number(event.tokenDelta) || 0);
    setGenerationTokenBadges({ reasoningTokens: next, reasoningEstimated: Boolean(event.estimated) });
    setGenerationInspectorStatus('Reasoning through the request…', 'THINK', 0.18);
  }

  function updateGenerationUsage(usage = {}) {
    const reasoning = extractReasoningTokenCount({ usage });
    const output = Number(usage.output_tokens ?? usage.completion_tokens ?? usage.completion_tokens_est);
    setGenerationTokenBadges({
      reasoningTokens: reasoning,
      reasoningEstimated: reasoning === null ? generationInspectorState.reasoningEstimated : Boolean(usage.reasoning_tokens_est),
      outputTokens: Number.isFinite(output) ? output : null
    });
  }

  function updateGenerationOutputTokens(text = '') {
    setGenerationTokenBadges({ outputTokens: estimateVisibleTokens(text) });
  }

  function renderGenerationPlan(plan = []) {
    if (!generationPlanBlock || !generationPlanList) return;
    const steps = Array.isArray(plan) ? plan : [];
    generationPlanBlock.hidden = !steps.length;
    generationPlanList.replaceChildren();
    steps.forEach((step, index) => {
      const item = document.createElement('li');
      item.className = 'generation-plan-item';
      item.dataset.status = String(step?.status || 'pending');
      const title = document.createElement('span');
      title.className = 'generation-plan-title';
      title.textContent = `${index + 1}. ${String(step?.title || `Step ${index + 1}`)}`;
      item.appendChild(title);
      const detailText = String(step?.reason || step?.description || '').trim();
      if (detailText) {
        const detail = document.createElement('span');
        detail.className = 'generation-plan-detail';
        detail.textContent = detailText;
        detail.title = detailText;
        item.appendChild(detail);
      }
      generationPlanList.appendChild(item);
    });
  }

  function updateGenerationInspectorFromAgentRun(run = {}) {
    if (!generationInspector || !run) return;
    const plan = Array.isArray(run.plan) ? run.plan : [];
    renderGenerationPlan(plan);
    syncConversationPlanCard(plan);
    const completed = plan.filter(step => ['passed', 'skipped'].includes(step?.status)).length;
    const progress = plan.length ? Math.max(0.2, completed / plan.length) : 0.2;
    const phase = String(run.phase || 'AGENT').toUpperCase();
    const publicPhase = {
      ANALYZE: ['Understanding your request…', 'UNDERSTAND'],
      PLAN: ['Creating the implementation plan…', 'PLAN'],
      INSPECT: ['Reviewing the current website files…', 'INSPECT'],
      ACT: ['Writing website files…', 'WRITE'],
      VERIFY: ['Checking the generated website…', 'VERIFY'],
      REPAIR: ['Fixing a detected issue…', 'REPAIR'],
      REPLAN: ['Updating the implementation plan…', 'PLAN'],
      COMPLETE: ['Website is ready', 'DONE'],
      FAILED: ['Website generation stopped with an issue', 'ERROR']
    }[phase] || ['Working on the website…', phase];
    setGenerationInspectorStatus(publicPhase[0], publicPhase[1], progress);
    appendGenerationEvent(publicPhase[0], publicPhase[1], `agent-phase:${phase}`);
    const reasoning = Number(run.reasoning_tokens_used);
    if (Number.isFinite(reasoning) && reasoning > 0) setGenerationTokenBadges({ reasoningTokens: reasoning, reasoningEstimated: false });
    const output = Number(run.last_completion_tokens_est);
    if (Number.isFinite(output) && output > 0) setGenerationTokenBadges({ outputTokens: output });
  }

  function beginGenerationInspector(status = 'Preparing request…') {
    generationInspectorState.reasoningTokens = 0;
    generationInspectorState.reasoningEstimated = false;
    generationInspectorState.outputTokens = 0;
    generationInspectorState.seenEvents.clear();
    if (!generationInspector) return;
    mountGenerationInspectorInConversation();
    generationInspector.hidden = false;
    generationInspector.dataset.state = 'working';
    setGenerationInspectorExpanded(true);
    setGenerationTokenBadges({ reasoningTokens: 0, outputTokens: 0, reasoningEstimated: false });
    if (generationPlanBlock) generationPlanBlock.hidden = true;
    generationPlanList?.replaceChildren();
    generationEventLog?.replaceChildren();
    setGenerationInspectorStatus(status, 'START', 0.04);
    appendGenerationEvent(status, 'START');
    scrollToBottom({ force: true });
  }

  function finalizeGenerationInspector(status = 'Generation complete', state = 'complete') {
    if (!generationInspector) return;
    generationInspector.dataset.state = state;
    const phase = state === 'complete' ? 'DONE' : state === 'stopped' ? 'STOPPED' : 'ERROR';
    setGenerationInspectorStatus(status, phase, state === 'complete' ? 1 : null);
    appendGenerationEvent(status, phase);
  }

  generationInspectorToggle?.addEventListener('click', () => {
    setGenerationInspectorExpanded(generationInspectorToggle.getAttribute('aria-expanded') !== 'true');
  });

  function createStreamingBubble() {
    const bubble = appendMessageBubble('assistant', '');
    bubble.classList.add('streaming-bubble', 'is-thinking');
    bubble.innerHTML = `
      <span class="thinking-indicator" role="status" aria-live="polite" aria-atomic="true">
        <span class="thinking-label" data-thinking-status>${thinkingModeEnabled ? 'Thinking' : 'Responding'}</span>
        <span class="thinking-wave" aria-hidden="true"><i></i><i></i><i></i></span>
      </span>
    `;
    activeThinkingBubble = bubble;
    return bubble;
  }

  function updateStreamingBubble(bubble, text, status = '') {
    if (!bubble) return;
    bubble.classList.remove('is-thinking');
    bubble.innerHTML = formatMessageText(text || '');
    if (activeThinkingBubble === bubble) activeThinkingBubble = null;
    scrollToBottom();
  }

  function completeStreamingBubble(bubble, text = '', responseMeta = null) {
    if (!bubble) return;
    bubble.classList.remove('streaming-bubble', 'is-thinking');
    bubble.innerHTML = formatMessageText(text);
    if (responseMeta) attachAssistantResponseMeta(bubble, { ...responseMeta, response: String(text || '') });
    if (activeThinkingBubble === bubble) activeThinkingBubble = null;
    scrollToBottom({ force: true });
  }

  function setGenerationButtonState(isGenerating) {
    if (!btnSend) return;
    btnSend.disabled = false;
    btnSend.classList.toggle('is-loading', isGenerating);
    btnSend.classList.toggle('is-stop', isGenerating);
    btnSend.setAttribute('aria-label', isGenerating ? 'Stop generation' : 'Send Message');
    btnSend.innerHTML = isGenerating ? stopButtonMarkup : sendButtonMarkup;
    if (!isGenerating) activeGenerationController = null;
  }

  function setPromptText(value = '') {
    chatInput.value = value;
    resizeChatInput();
  }

  function stopActiveGeneration() {
    if (!activeGenerationController) return;
    activeGenerationStopped = true;
    activeGenerationController.abort();
  }

  function normalizeJsonCandidate(text = '') {
    return String(text || '')
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
  }

  function getJsonObjectSlice(text = '') {
    const clean = normalizeJsonCandidate(text);
    const first = clean.indexOf('{');
    const last = clean.lastIndexOf('}');
    if (first === -1) return clean;
    if (last === -1 || last <= first) return clean.slice(first);
    return clean.slice(first, last + 1);
  }

  function escapeBareNewlinesInsideJsonStrings(text = '') {
    let out = '';
    let inString = false;
    let escaped = false;
    for (const ch of String(text || '')) {
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        out += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        out += ch;
        continue;
      }
      if (inString && (ch === '\n' || ch === '\r')) {
        out += '\\n';
        continue;
      }
      out += ch;
    }
    return out;
  }

  function balanceJsonCandidate(text = '') {
    const candidate = getJsonObjectSlice(text);
    const stack = [];
    let out = '';
    let inString = false;
    let escaped = false;
    for (const ch of String(candidate || '')) {
      out += ch;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === '{') stack.push('}');
      else if (ch === '[') stack.push(']');
      else if (ch === '}' || ch === ']') {
        if (stack[stack.length - 1] === ch) stack.pop();
      }
    }
    if (inString) out += '"';
    while (stack.length) out += stack.pop();
    return out.replace(/,\s*([}\]])/g, '$1');
  }

  function repairJsonCandidate(text = '') {
    return escapeBareNewlinesInsideJsonStrings(getJsonObjectSlice(text))
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/}\s*(?={)/g, '},')
      .replace(/]\s*(?={)/g, '],')
      .replace(/}\s*(?=\[)/g, '},')
      .replace(/]\s*(?=\[)/g, '],')
      .replace(/"\s*(?="[\w-]+"\s*:)/g, '",')
      .replace(/}\s*(?="[\w-]+"\s*:)/g, '},')
      .replace(/]\s*(?="[\w-]+"\s*:)/g, '],')
      .replace(/\b(true|false|null)\s*(?="[\w-]+"\s*:)/g, '$1,')
      .replace(/(-?\d+(?:\.\d+)?)\s*(?="[\w-]+"\s*:)/g, '$1,');
  }

  function extractJsonFromText(text) {
    const raw = String(text || '');
    const repaired = repairJsonCandidate(raw);
    const candidates = [
      normalizeJsonCandidate(raw),
      getJsonObjectSlice(raw),
      escapeBareNewlinesInsideJsonStrings(getJsonObjectSlice(raw)),
      repaired,
      balanceJsonCandidate(repaired),
      balanceJsonCandidate(raw)
    ].filter(Boolean);

    let lastError = null;
    for (const candidate of [...new Set(candidates)]) {
      try {
        return JSON.parse(candidate);
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(`The generated project was not valid JSON (${lastError?.message || 'unknown parse error'}).`);
  }

  function sanitizeGeneratedFileName(name, fallback = 'index.html') {
    return String(name || fallback).split('/').pop().replace(/[^a-zA-Z0-9._-]/g, '') || fallback;
  }

  function getLanguageFromFileName(name) {
    const extension = String(name || '').split('.').pop().toLowerCase();
    return { html: 'html', css: 'css', js: 'javascript' }[extension] || extension || 'text';
  }

  function isGeneratedFileType(file, extension) {
    return String(file?.name || '').toLowerCase().endsWith(extension);
  }

  function localStylesheetLinkPattern() {
    return /<link\b(?=[^>]*\brel=["']?stylesheet["']?)(?=[^>]*\bhref=["'](?!https?:|\/\/|data:|blob:|#)(?:\.\/|\/)?[^"']+\.css(?:\?[^"']*)?["'])[^>]*>/gi;
  }

  function localScriptSrcPattern() {
    return /<script\b(?=[^>]*\bsrc=["'](?!https?:|\/\/|data:|blob:|#)(?:\.\/|\/)?[^"']+\.js(?:\?[^"']*)?["'])[^>]*>\s*<\/script>/gi;
  }

  function combineGeneratedFileContents(files = [], language = 'text') {
    const nonEmptyFiles = files.filter(file => String(file?.content || '').trim());
    return nonEmptyFiles.map(file => {
      const content = String(file.content || '').trim();
      if (language === 'css') return `/* ${file.name} */\n${content}`;
      if (language === 'javascript') return `// ${file.name}\n${content}`;
      return content;
    }).join('\n\n');
  }

  function unwrapGeneratedCodeContent(content = '', language = 'text') {
    let output = String(content || '').trim();
    output = output
      .replace(/^```(?:html|css|javascript|js)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    if (language === 'css') {
      output = output
        .replace(/^<style\b[^>]*>/i, '')
        .replace(/<\/style>\s*$/i, '')
        .trim();
    }

    if (language === 'javascript') {
      output = output
        .replace(/^<script\b[^>]*>/i, '')
        .replace(/<\/script>\s*$/i, '')
        .trim();
    }

    return output;
  }

  function canonicalizeGeneratedWebsiteFiles(files = []) {
    const normalized = files
      .filter(file => file && file.name)
      .map(file => {
        const safeName = sanitizeGeneratedFileName(file.name || file.path || file.filename, 'index.html');
        const language = file.language || getLanguageFromFileName(safeName);
        return {
          ...file,
          name: safeName,
          language,
          content: typeof file.content === 'string' ? unwrapGeneratedCodeContent(file.content, language) : ''
        };
      });

    const htmlFiles = normalized.filter(file => isGeneratedFileType(file, '.html'));
    const cssFiles = normalized.filter(file => isGeneratedFileType(file, '.css'));
    const jsFiles = normalized.filter(file => isGeneratedFileType(file, '.js'));
    const primaryHtml = htmlFiles.find(file => file.name.toLowerCase() === 'index.html') || htmlFiles[0] || null;
    const output = [];

    if (primaryHtml) {
      output.push({ ...primaryHtml, name: 'index.html', language: 'html' });
    }
    htmlFiles
      .filter(file => file !== primaryHtml)
      .forEach(file => output.push(file));

    if (cssFiles.length) {
      const exactStyle = cssFiles.find(file => file.name.toLowerCase() === 'style.css');
      output.push({
        ...(exactStyle || cssFiles[0]),
        name: 'style.css',
        language: 'css',
        content: combineGeneratedFileContents(cssFiles, 'css')
      });
    }

    if (jsFiles.length) {
      const exactScript = jsFiles.find(file => file.name.toLowerCase() === 'script.js');
      output.push({
        ...(exactScript || jsFiles[0]),
        name: 'script.js',
        language: 'javascript',
        content: combineGeneratedFileContents(jsFiles, 'javascript')
      });
    }

    normalized
      .filter(file => !isGeneratedFileType(file, '.html') && !isGeneratedFileType(file, '.css') && !isGeneratedFileType(file, '.js'))
      .forEach(file => output.push(file));

    const seen = new Set();
    return output.filter(file => file.name && !seen.has(file.name) && seen.add(file.name));
  }

  function wireHtmlToCanonicalGeneratedFiles(html = '', { hasCss = false, hasJs = false } = {}) {
    let output = String(html || '');

    if (hasCss) {
      output = output.replace(localStylesheetLinkPattern(), '');
      const link = '  <link rel="stylesheet" href="./style.css">\n';
      output = /<\/head>/i.test(output)
        ? output.replace(/<\/head>/i, `${link}</head>`)
        : `${link}${output}`;
    }

    if (hasJs) {
      output = output.replace(localScriptSrcPattern(), '');
      const script = '  <script src="./script.js"></script>\n';
      output = /<\/body>/i.test(output)
        ? output.replace(/<\/body>/i, `${script}</body>`)
        : `${output}\n${script}`;
    }

    return output;
  }

  function readBlockLine(text, label) {
    const pattern = new RegExp(`^${label}:\\s*(.+)$`, 'im');
    return pattern.exec(text)?.[1]?.trim() || '';
  }

  function parseWebsiteFileBlocks(text) {
    const files = [];
    const startPattern = /(?:^|\n)NEXORA_FILE:\s*([^\|\r\n]+?)\s*(?:\|\s*([^\r\n]+))?\r?\n/g;
    let match;

    while ((match = startPattern.exec(text)) !== null) {
      const contentStart = startPattern.lastIndex;
      const endPattern = /\r?\n?NEXORA_END_FILE/g;
      endPattern.lastIndex = contentStart;
      const endMatch = endPattern.exec(text);
      const rawName = match[1]?.trim() || `file-${files.length + 1}.txt`;
      const name = sanitizeGeneratedFileName(rawName, `file-${files.length + 1}.txt`);
      const language = match[2]?.trim() || getLanguageFromFileName(name);
      const contentEnd = endMatch ? endMatch.index : text.length;
      const content = text.slice(contentStart, contentEnd).replace(/^\r?\n/, '').replace(/\s*$/, '');

      files.push({
        name,
        language,
        content,
        complete: Boolean(endMatch)
      });

      if (endMatch) {
        startPattern.lastIndex = endPattern.lastIndex;
      }
    }

    return {
      projectName: readBlockLine(text, 'NEXORA_PROJECT') || 'Generated Website',
      reply: readBlockLine(text, 'NEXORA_REPLY') || 'Your website is ready. Review the generated files below, then click Preview when you want to inspect it.',
      files
    };
  }

  function decodeJsonStringFragment(fragment = '') {
    let output = '';

    for (let i = 0; i < fragment.length; i += 1) {
      const char = fragment[i];
      if (char !== '\\') {
        output += char;
        continue;
      }

      const next = fragment[i + 1];
      if (!next) break;
      i += 1;

      if (next === 'n') output += '\n';
      else if (next === 'r') output += '\r';
      else if (next === 't') output += '\t';
      else if (next === 'b') output += '\b';
      else if (next === 'f') output += '\f';
      else if (next === 'u') {
        const hex = fragment.slice(i + 1, i + 5);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          output += String.fromCharCode(parseInt(hex, 16));
          i += 4;
        } else {
          break;
        }
      } else {
        output += next;
      }
    }

    return output;
  }

  function readPartialJsonStringValue(objectText, key) {
    const pattern = new RegExp(`"${key}"\\s*:\\s*"`, 'i');
    const match = pattern.exec(objectText);
    if (!match) return '';

    const start = match.index + match[0].length;
    let escaped = false;
    let end = objectText.length;

    for (let i = start; i < objectText.length; i += 1) {
      const char = objectText[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        end = i;
        break;
      }
    }

    return decodeJsonStringFragment(objectText.slice(start, end));
  }

  function extractPartialFileObjects(text) {
    const filesKey = /"files"\s*:/i.exec(text);
    if (!filesKey) return [];

    const arrayStart = text.indexOf('[', filesKey.index);
    if (arrayStart === -1) return [];

    const objects = [];
    let objectStart = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = arrayStart + 1; i < text.length; i += 1) {
      const char = text[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === '{') {
        if (depth === 0) objectStart = i;
        depth += 1;
      } else if (char === '}') {
        if (depth > 0) depth -= 1;
        if (depth === 0 && objectStart !== -1) {
          objects.push({ text: text.slice(objectStart, i + 1), complete: true });
          objectStart = -1;
        }
      } else if (char === ']' && depth === 0) {
        break;
      }
    }

    if (objectStart !== -1 && depth > 0) {
      objects.push({ text: text.slice(objectStart), complete: false });
    }

    return objects;
  }

  function parsePartialWebsiteFiles(streamedJson) {
    const blockProject = parseWebsiteFileBlocks(streamedJson);
    if (blockProject.files.length) {
      return blockProject.files;
    }

    if (streamedJson.includes(`"${VISUAL_BLUEPRINT_SCHEMA}"`) || streamedJson.includes('"structure"') || streamedJson.includes('"sections"')) {
      return [{
        name: 'nexora.blueprint.json',
        language: 'json',
        content: streamedJson,
        complete: streamedJson.trim().endsWith('}')
      }];
    }

    return extractPartialFileObjects(streamedJson)
      .map((entry, index) => {
        const fallbackName = `file-${index + 1}.txt`;
        const name = readPartialJsonStringValue(entry.text, 'name') || fallbackName;
        const language = readPartialJsonStringValue(entry.text, 'language') || name.split('.').pop() || 'file';
        const content = readPartialJsonStringValue(entry.text, 'content');
        return {
          name: String(name).split('/').pop().replace(/[^a-zA-Z0-9._-]/g, '') || fallbackName,
          language,
          content,
          complete: entry.complete
        };
      })
      .filter(file => file.name || file.content);
  }

  function countCodeLines(content = '') {
    const clean = String(content || '').trimEnd();
    if (!clean) return 0;
    return clean.split(/\r\n|\r|\n/).length;
  }

  function buildRecoveredBlueprintFromText(text = '', originalPrompt = '') {
    const blueprint = getLiveBlueprintFromStream(text);
    if (!hasLiveBlueprintSignal(text, blueprint)) return null;
    if (!Array.isArray(blueprint.structure?.nodes) || !blueprint.structure.nodes.length) return null;

    return {
      schema: VISUAL_BLUEPRINT_SCHEMA,
      version: '1.0.0',
      projectName: blueprint.projectName || titleFromText(originalPrompt),
      reply: 'The AI blueprint needed syntax recovery, so Nexora repaired the JSON and generated the website files.',
      intent: {
        kind: 'website',
        pageType: blueprint.pageType || 'custom',
        scale: blueprint.scale || 'standard',
        reasoning: 'Recovered from AI-generated atomic blueprint text.'
      },
      theme: {
        style: blueprint.livePreview?.visualTone || 'premium',
        mode: blueprint.theme?.mode || 'dark',
        colors: {
          background: blueprint.theme?.background,
          surface: blueprint.theme?.surface,
          surfaceAlt: blueprint.theme?.surfaceAlt,
          text: blueprint.theme?.text,
          muted: blueprint.theme?.muted,
          primary: blueprint.theme?.primary,
          accent: blueprint.theme?.accent,
          border: blueprint.theme?.border
        }
      },
      requirements: {
        responsive: ['mobile', 'tablet', 'laptop', 'desktop'],
        notes: ['Recovered from AI atomic output; no extra UI features are forced.']
      },
      navigation: blueprint.navigation || {},
      livePreview: blueprint.livePreview || {},
      structure: blueprint.structure || {},
      sections: blueprint.sections || []
    };
  }

  function buildSafeBlueprintFromPrompt(originalPrompt = '', aiText = '') {
    const title = titleFromText(originalPrompt);
    return {
      schema: VISUAL_BLUEPRINT_SCHEMA,
      version: '1.0.0',
      projectName: title,
      reply: 'The AI returned raw files instead of an editable atomic blueprint.',
      intent: {
        kind: 'website',
        pageType: inferWebsiteIntentFromText(originalPrompt).pageType || 'custom',
        scale: inferWebsiteIntentFromText(originalPrompt).scale || 'standard',
        reasoning: 'Raw file fallback metadata only; Nexora did not synthesize a local layout template.'
      },
      theme: { style: 'custom', mode: 'dark', colors: {} },
      requirements: {
        responsive: ['mobile', 'tablet', 'laptop', 'desktop'],
        notes: ['No local predefined UI was added.']
      },
      navigation: { brand: title, links: [], cta: '' },
      livePreview: {},
      structure: { mode: 'atomic', notes: 'No AI atomic structure was available for this raw-file response.', nodes: [] },
      sections: []
    };
  }


  function isAIWebsiteBundlePayload(value) {
    if (!isPlainObject(value)) return false;
    if (value.schema === AI_WEBSITE_BUNDLE_SCHEMA) return true;
    const hasFiles = Array.isArray(value.files) || isPlainObject(value.files) || Array.isArray(value.generatedFiles) || isPlainObject(value.generatedFiles) || Array.isArray(value.output?.files);
    const hasDesign = isPlainObject(value.design) || isPlainObject(value.designSpec) || isPlainObject(value.editModel) || isPlainObject(value.planning);
    return hasFiles && hasDesign;
  }

  function normalizeBundleFileEntries(bundle = {}) {
    const candidates = bundle.files || bundle.generatedFiles || bundle.output?.files || bundle.code || {};
    let entries = [];

    if (Array.isArray(candidates)) {
      entries = candidates;
    } else if (isPlainObject(candidates)) {
      entries = Object.entries(candidates).map(([name, value]) => {
        if (isPlainObject(value)) return { name, ...value, content: value.content || value.code || value.value || '' };
        return { name, content: String(value ?? '') };
      });
    }

    ['html', 'css', 'js', 'javascript'].forEach(key => {
      if (typeof bundle[key] !== 'string') return;
      const name = key === 'html' ? 'index.html' : key === 'css' ? 'style.css' : 'script.js';
      if (!entries.some(file => String(file.name || '').toLowerCase() === name)) {
        entries.push({ name, content: bundle[key] });
      }
    });

    const seen = new Set();
    return entries
      .filter(file => file && (file.name || file.path || file.filename))
      .map(file => {
        const safeName = sanitizeGeneratedFileName(file.name || file.path || file.filename, 'index.html');
        const content = typeof file.content === 'string'
          ? file.content
          : typeof file.code === 'string'
            ? file.code
            : typeof file.value === 'string'
              ? file.value
              : '';
        return {
          name: safeName,
          language: file.language || getLanguageFromFileName(safeName),
          content
        };
      })
      .filter(file => file.name && !seen.has(file.name) && seen.add(file.name));
  }

  function ensureBundleFilesAreRunnable(files = []) {
    const output = canonicalizeGeneratedWebsiteFiles(files);
    const cssFile = output.find(file => file.name.toLowerCase() === 'style.css');
    const jsFile = output.find(file => file.name.toLowerCase() === 'script.js');

    output
      .filter(file => file.name.toLowerCase().endsWith('.html'))
      .forEach(file => {
        file.content = wireHtmlToCanonicalGeneratedFiles(file.content || '', {
          hasCss: Boolean(cssFile),
          hasJs: Boolean(jsFile)
        });
      });

    return output;
  }

  function websiteBundleValidationIssue(bundle = {}, files = [], originalPrompt = '') {
    const htmlFile = files.find(file => file.name.toLowerCase().endsWith('.html'));
    const cssFile = files.find(file => file.name.toLowerCase().endsWith('.css'));
    const jsFile = files.find(file => file.name.toLowerCase().endsWith('.js'));
    if (!htmlFile || !htmlFile.content.trim()) return 'The AI bundle did not include a complete index.html file.';
    if (!cssFile || !cssFile.content.trim()) return 'The AI bundle did not include a complete style.css file.';
    if (!jsFile) return 'The AI bundle did not include script.js. Use an empty file only if the generated UI has no interactions.';

    const combined = `${htmlFile.content}\n${cssFile.content}\n${jsFile.content || ''}`.toLowerCase();
    const productRequest = isProductUiRequest(originalPrompt, bundle.design?.intent?.pageType || bundle.intent?.pageType || '');
    const repeatedDefault = /a polished, editable page generated by nexora ai|<h1[^>]*>\s*instaclone\s*<\/h1>|>\s*menu\s*<\/|get started/i.test(combined)
      && !/story|stories|feed|post|profile|suggestion|sidebar|reel|likes|comments|direct|search|explore/i.test(combined);
    if (productRequest && repeatedDefault) {
      return 'The generated files look like the old generic repeated layout instead of the requested product/page. The AI must create product-specific HTML/CSS/JS inside the bundle.';
    }

    if (bundle.design?.qualityCheck && bundle.design.qualityCheck.matchesUserRequest === false) {
      return 'The AI qualityCheck says the generated bundle does not match the user request.';
    }

    return '';
  }

  function kebabToCamel(value = '') {
    return String(value).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
  }

  function inlineCssTextToAtomicStyle(styleText = '') {
    const style = {};
    String(styleText || '').split(';').forEach(part => {
      const index = part.indexOf(':');
      if (index === -1) return;
      const key = kebabToCamel(part.slice(0, index).trim());
      const value = part.slice(index + 1).trim();
      if (key && value) style[key] = value;
    });
    return styleFromAtomicStyle(style);
  }

  function classifyDomElementType(node) {
    const tag = String(node?.tagName || 'div').toLowerCase();
    const className = String(node?.getAttribute?.('class') || '').toLowerCase();
    const role = String(node?.getAttribute?.('role') || '').toLowerCase();
    if (tag === 'header') return 'header';
    if (tag === 'nav' || role === 'navigation') return 'navbar';
    if (tag === 'aside') return 'sidebar';
    if (tag === 'main') return 'main';
    if (tag === 'section') return 'section';
    if (tag === 'footer') return 'footer';
    if (/h[1-6]/.test(tag)) return 'heading';
    if (tag === 'p') return 'paragraph';
    if (tag === 'button') return 'button';
    if (tag === 'a') return 'link';
    if (['input', 'textarea', 'select'].includes(tag)) return 'input';
    if (['img', 'picture', 'svg'].includes(tag)) return 'image';
    if (tag === 'video') return 'video';
    if (tag === 'article') return className.includes('post') ? 'post' : 'card';
    if (/card|panel|tile/.test(className)) return 'card';
    if (/feed/.test(className)) return 'feed';
    if (/story|avatar/.test(className)) return className.includes('avatar') ? 'avatar' : 'story';
    if (/toolbar|actions/.test(className)) return 'toolbar';
    if (/search/.test(className)) return 'search';
    return 'container';
  }

  function buildVisualDocumentFromAIBundle(bundle = {}, files = [], originalPrompt = '') {
    const htmlFile = files.find(file => file.name.toLowerCase().endsWith('.html'));
    const cssFile = files.find(file => file.name.toLowerCase().endsWith('.css'));
    const jsFile = files.find(file => file.name.toLowerCase().endsWith('.js'));
    const designTheme = bundle.design?.theme || bundle.theme || {};
    const colors = designTheme.colors || {};
    const theme = normalizeThemeContrast({
      background: colors.background || '#0f1117',
      surface: colors.surface || '#171923',
      surfaceAlt: colors.surfaceAlt || '#222638',
      text: colors.text || '#f8fafc',
      muted: colors.muted || '#a7b0c0',
      primary: colors.primary || '#f9c74f',
      accent: colors.accent || '#7dd3fc',
      border: colors.border || '#303548',
      mode: String(designTheme.mode || 'dark').toLowerCase() === 'light' ? 'light' : 'dark'
    });

    const elements = {};
    let counter = 0;
    const nextId = (base) => `ai_${slugifyId(base || 'element')}_${++counter}`;

    function addElement(options) {
      const element = createVisualElement(options);
      elements[element.id] = element;
      if (element.parent && elements[element.parent] && !elements[element.parent].children.includes(element.id)) {
        elements[element.parent].children.push(element.id);
      }
      return element.id;
    }

    const rootId = addElement({
      id: 'ai_root',
      type: 'root',
      tag: 'div',
      name: 'AI Generated Page Root',
      constraints: { deletable: false, draggable: false, resizable: false },
      data: { source: 'ai-authored-files' },
      style: { base: { layout: { display: 'block', overflow: 'hidden' }, size: { width: '100%', minHeight: '100vh' }, visual: { backgroundColor: 'var(--background)', color: 'var(--text)' } } }
    });

    try {
      const parsedHtml = new DOMParser().parseFromString(htmlFile?.content || '<main></main>', 'text/html');
      const bodyChildren = Array.from(parsedHtml.body?.children || []);
      const walkNode = (domNode, parentId, depth = 0, index = 0) => {
        if (!domNode || domNode.nodeType !== 1 || depth > 16) return null;
        const tag = String(domNode.tagName || 'div').toLowerCase();
        if (['script', 'style', 'link', 'meta', 'title'].includes(tag)) return null;
        const id = nextId(domNode.getAttribute('id') || domNode.getAttribute('class') || tag || `node_${index}`);
        const elementChildren = Array.from(domNode.children || []).filter(child => !['script', 'style', 'link', 'meta'].includes(String(child.tagName || '').toLowerCase()));
        const directText = Array.from(domNode.childNodes || [])
          .filter(child => child.nodeType === 3)
          .map(child => child.textContent.trim())
          .filter(Boolean)
          .join(' ');
        const textContent = elementChildren.length ? directText : (domNode.textContent || '').trim();
        const attrs = {};
        Array.from(domNode.attributes || []).forEach(attr => {
          if (attr.name === 'style') return;
          attrs[attr.name] = attr.value;
        });
        const inlineStyle = inlineCssTextToAtomicStyle(domNode.getAttribute('style') || '');
        const type = classifyDomElementType(domNode);
        const content = {
          text: ['input', 'img', 'video'].includes(tag) ? '' : textContent,
          href: domNode.getAttribute('href') || '',
          src: domNode.getAttribute('src') || '',
          alt: domNode.getAttribute('alt') || '',
          placeholder: domNode.getAttribute('placeholder') || '',
          value: domNode.getAttribute('value') || ''
        };
        addElement({
          id,
          type,
          tag,
          name: domNode.getAttribute('aria-label') || domNode.getAttribute('data-name') || domNode.getAttribute('class') || tag,
          parent: parentId,
          content,
          attributes: attrs,
          style: inlineStyle,
          data: { source: 'ai-html', selector: domNode.getAttribute('id') ? `#${domNode.getAttribute('id')}` : domNode.getAttribute('class') ? `.${String(domNode.getAttribute('class')).trim().split(/\s+/)[0]}` : tag },
          editor: { notes: 'Derived from AI-authored HTML for visual editing.' }
        });
        elementChildren.forEach((child, childIndex) => walkNode(child, id, depth + 1, childIndex));
        return id;
      };

      if (bodyChildren.length) {
        bodyChildren.forEach((child, index) => walkNode(child, rootId, 0, index));
      } else {
        addElement({ id: nextId('body_text'), type: 'paragraph', tag: 'p', name: 'Body Text', parent: rootId, content: { text: parsedHtml.body?.textContent?.trim() || bundle.projectName || titleFromText(originalPrompt) } });
      }
    } catch {
      addElement({ id: nextId('html_source'), type: 'custom', tag: 'main', name: 'AI HTML Source', parent: rootId, content: { text: bundle.projectName || titleFromText(originalPrompt) } });
    }

    return {
      schema: VISUAL_DOCUMENT_SCHEMA,
      version: '2.0.0',
      document: {
        id: `doc_${Date.now()}`,
        name: bundle.projectName || titleFromText(originalPrompt),
        type: 'website',
        source: {
          createdBy: 'nexora-ai-file-bundle',
          prompt: originalPrompt,
          model: getSelectedOpenRouterModel(),
          createdAt: new Date().toISOString(),
          aiBundleSchema: bundle.schema || AI_WEBSITE_BUNDLE_SCHEMA,
          rawFiles: files.map(file => ({ name: file.name, language: file.language, content: file.content }))
        }
      },
      settings: { defaultPage: 'page_home', unit: 'px', grid: { enabled: true, size: 8, snap: true }, breakpoints: { desktop: 1200, laptop: 1024, tablet: 768, mobile: 390 } },
      theme: {
        tokens: {
          colors: { background: theme.background, surface: theme.surface, surfaceAlt: theme.surfaceAlt, text: theme.text, muted: theme.muted, primary: theme.primary, accent: theme.accent, border: theme.border, mode: theme.mode, onPrimary: theme.onPrimary, onSurface: theme.onSurface, onSurfaceAlt: theme.onSurfaceAlt },
          gradients: { primary: `linear-gradient(135deg, ${theme.primary}, ${theme.accent})` },
          fonts: { body: bundle.design?.typography?.fontStack || 'Inter, system-ui, sans-serif', heading: bundle.design?.typography?.fontStack || 'Inter, system-ui, sans-serif' },
          fontSizes: {}, fontWeights: {}, lineHeights: {}, spacing: {}, radii: {}, shadows: { md: theme.shadow || '0 24px 50px rgba(0,0,0,0.24)' }, borders: {}, zIndex: {}, transitions: {}
        },
        modes: { dark: {}, light: {} }
      },
      assets: { images: {}, videos: {}, icons: {}, fonts: {}, files: { html: htmlFile?.name || '', css: cssFile?.name || '', js: jsFile?.name || '' } },
      components: {},
      pages: {
        page_home: {
          id: 'page_home',
          name: 'Home',
          slug: 'index',
          path: 'index.html',
          seo: { title: bundle.projectName || titleFromText(originalPrompt), description: bundle.reply || 'Generated by Nexora AI.', keywords: [], ogImage: null },
          root: rootId,
          elements
        }
      }
    };
  }

  function createPlanningMarkdownFromBundle(bundle = {}, visualDocument = {}, originalPrompt = '') {
    const planning = bundle.planning || {};
    const design = bundle.design || {};
    const summary = isVisualDocumentPayload(visualDocument) ? summarizeVisualDocument(visualDocument) : { pages: 1, elements: 0, sections: 0, breakpoints: 'desktop, laptop, tablet, mobile' };
    const featureMap = valueListToMarkdown(planning.featureMap || design.layoutSystem?.regions?.map(region => `${region.name}: ${region.placement}`) || []);
    const responsivePlan = valueListToMarkdown(planning.responsivePlan || Object.values(design.responsive || {}) || ['Responsive behavior is authored by the AI for mobile, tablet, laptop, and desktop.']);
    const accessibilityPlan = valueListToMarkdown(planning.accessibilityPlan || ['Readable contrast, semantic structure, focus-visible controls, and accessible labels where useful.']);
    const designReasoning = valueListToMarkdown(planning.designReasoning || [design.visualDirection || design.intent?.reasoning || 'The AI selected the structure, styling, and interactions from the user request.']);
    const filePlan = valueListToMarkdown(planning.filePlan || ['planning.md', 'blueprint.json', 'index.html', 'style.css', 'script.js', 'visual-document.json', 'generation-manifest.json']);

    return `# Generation Plan\n\n## User Request\n${originalPrompt}\n\n## Goal\n${planning.goal || bundle.projectName || 'Generate a responsive editable website.'}\n\n## AI Interpretation\n${planning.interpretation || design.intent?.reasoning || 'The AI interpreted the request and authored a complete website bundle.'}\n\n## Feature / Region Map\n${featureMap || '- AI-authored regions are defined in blueprint.json under design.layoutSystem.'}\n\n## File Plan\n${filePlan}\n\n## Responsive Plan\n${responsivePlan}\n\n## Accessibility Plan\n${accessibilityPlan}\n\n## Design Reasoning\n${designReasoning}\n\n## Render Summary\n- Pages: ${summary.pages}\n- Editable elements derived from AI HTML: ${summary.elements}\n- Major regions: ${summary.sections}\n- Breakpoints: ${summary.breakpoints || 'desktop, laptop, tablet, mobile'}\n\n## Guardrails Used\n- No local platform-specific clone routes.\n- No predefined clone templates.\n- The AI authored the HTML, CSS, JavaScript, structure, colors, spacing, edge styling, animations, and interactions in JSON.\n- Nexora only validates, stores, wires files when necessary, and previews the AI-authored output.`;
  }

  function createGenerationManifestFromBundle(bundle = {}, visualDocument = {}, originalPrompt = '') {
    return {
      schema: 'nexora.generation-manifest',
      version: '2.0.0',
      createdAt: new Date().toISOString(),
      model: getSelectedOpenRouterModel(),
      userRequest: originalPrompt,
      projectName: bundle.projectName || visualDocument.document?.name || 'Generated Website',
      pipeline: [
        'intent-routing',
        'single-ai-website-bundle-generation',
        'ai-authored-design-json-validation',
        'ai-repair-if-bundle-is-incomplete',
        'planning-file-export',
        'blueprint-export',
        'ai-file-preview-render',
        'visual-document-derived-from-ai-html',
        'file-progress-from-actual-generated-files'
      ],
      constraints: {
        noPredefinedPlatformRoutes: true,
        noLocalCloneTemplates: true,
        universalResponsiveness: ['mobile', 'tablet', 'laptop', 'desktop'],
        aiDecidesStructure: true,
        aiDecidesHtmlCssJs: true,
        aiDecidesPlacementColorsEdgesAnimationsInteractions: true,
        noLocalSectionComposerFallback: true,
        noDummyFileProgress: true
      },
      outputs: ['planning.md', 'blueprint.json', 'index.html', 'style.css', 'script.js', 'visual-document.json', 'generation-manifest.json'],
      stats: isVisualDocumentPayload(visualDocument) ? summarizeVisualDocument(visualDocument) : {},
      qualityCheck: bundle.design?.qualityCheck || {}
    };
  }

  function normalizeAIWebsiteBundleProject(rawBundle, originalPrompt) {
    const bundle = isPlainObject(rawBundle) ? { ...rawBundle } : {};
    bundle.schema = AI_WEBSITE_BUNDLE_SCHEMA;
    bundle.version = bundle.version || '2.0.0';
    bundle.projectName = bundle.projectName || titleFromText(originalPrompt) || 'Generated Website';
    bundle.reply = bundle.reply || `I created the requested website as AI-authored production files.`;
    bundle.planning = isPlainObject(bundle.planning) ? bundle.planning : {};
    bundle.design = isPlainObject(bundle.design) ? bundle.design : (isPlainObject(bundle.designSpec) ? bundle.designSpec : {});
    bundle.editModel = isPlainObject(bundle.editModel) ? bundle.editModel : { pages: [] };

    let files = normalizeBundleFileEntries(bundle);
    files = ensureBundleFilesAreRunnable(files);
    const validationIssue = websiteBundleValidationIssue(bundle, files, originalPrompt);
    if (validationIssue) {
      throwAtomicBlueprintRequired(validationIssue);
    }

    const visualDocument = buildVisualDocumentFromAIBundle(bundle, files, originalPrompt);
    return {
      projectName: bundle.projectName,
      reply: bundle.reply,
      files,
      visualDocument,
      blueprint: bundle,
      planning: createPlanningMarkdownFromBundle(bundle, visualDocument, originalPrompt),
      manifest: createGenerationManifestFromBundle(bundle, visualDocument, originalPrompt)
    };
  }

  function parseWebsiteProjectFromStream(text, originalPrompt) {
    const blockProject = parseWebsiteFileBlocks(text);
    if (blockProject.files.length) {
      return normalizeWebsiteProject(blockProject, originalPrompt);
    }

    try {
      const parsed = extractJsonFromText(text);
      if (isVisualDocumentPayload(parsed)) {
        return normalizeVisualDocumentProject(parsed, originalPrompt);
      }
      if (isVisualDocumentPayload(parsed.visualDocument)) {
        return normalizeVisualDocumentProject(parsed.visualDocument, originalPrompt);
      }
      if (isAIWebsiteBundlePayload(parsed)) {
        return normalizeAIWebsiteBundleProject(parsed, originalPrompt);
      }
      if (isAIWebsiteBundlePayload(parsed.bundle)) {
        return normalizeAIWebsiteBundleProject(parsed.bundle, originalPrompt);
      }
      if (isAIWebsiteBundlePayload(parsed.website)) {
        return normalizeAIWebsiteBundleProject(parsed.website, originalPrompt);
      }
      if (isAIWebsiteBundlePayload(parsed.project)) {
        return normalizeAIWebsiteBundleProject(parsed.project, originalPrompt);
      }
      if (isBlueprintPayload(parsed)) {
        return normalizeBlueprintProject(parsed, originalPrompt);
      }
      if (isBlueprintPayload(parsed.blueprint)) {
        return normalizeBlueprintProject(parsed.blueprint, originalPrompt);
      }
      if (isVisualDocumentPayload(parsed.visualDocument)) {
        return normalizeVisualDocumentProject(parsed.visualDocument, originalPrompt);
      }
      if (parsed?.schema === VISUAL_BLUEPRINT_SCHEMA) {
        return normalizeBlueprintProject(parsed, originalPrompt);
      }
      if (parsed?.files || parsed?.generatedFiles || parsed?.output?.files) {
        return normalizeWebsiteProject(parsed, originalPrompt);
      }
      throwAtomicBlueprintRequired('The AI returned JSON, but it was not a complete Nexora Visual Document.');
    } catch (jsonError) {
      if (isAtomicBlueprintRequiredError(jsonError)) throw jsonError;

      const partialFiles = parsePartialWebsiteFiles(text).filter(file => file.content.trim());
      if (partialFiles.some(file => file.name.toLowerCase().endsWith('.html'))) {
        return normalizeWebsiteProject({
          projectName: titleFromText(originalPrompt),
          reply: 'The AI response was recovered into runnable website files.',
          files: partialFiles,
          planning: { goal: originalPrompt },
          design: { intent: inferWebsiteIntentFromText(originalPrompt), qualityCheck: { recoveredFromPartialFiles: true } },
          editModel: { pages: [] }
        }, originalPrompt);
      }

      const recoveredBlueprint = buildRecoveredBlueprintFromText(text, originalPrompt);
      if (recoveredBlueprint) {
        return normalizeBlueprintProject(recoveredBlueprint, originalPrompt);
      }

      const hasOnlyInternalBlueprint = partialFiles.length > 0 && partialFiles.every(file => file.name === 'nexora.blueprint.json');
      if (hasOnlyInternalBlueprint) {
        const recoveredFromInternal = buildRecoveredBlueprintFromText(partialFiles[0].content, originalPrompt);
        if (recoveredFromInternal) return normalizeBlueprintProject(recoveredFromInternal, originalPrompt);
      }

      throwAtomicBlueprintRequired(`The AI response could not be parsed into a complete Nexora Visual Document (${jsonError?.message || 'invalid JSON'}).`);
    }
  }

  function isBlueprintPayload(value) {
    return value?.schema === VISUAL_BLUEPRINT_SCHEMA && (
      Array.isArray(value.sections) ||
      (isPlainObject(value.structure) && Array.isArray(value.structure.nodes))
    );
  }

  function slugifyId(value = 'item') {
    return String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 42) || 'item';
  }

  function deepMerge(base, override) {
    const output = { ...(base || {}) };
    Object.entries(override || {}).forEach(([key, value]) => {
      if (isPlainObject(value) && isPlainObject(output[key])) {
        output[key] = deepMerge(output[key], value);
      } else if (value !== undefined && value !== null && value !== '') {
        output[key] = value;
      }
    });
    return output;
  }

  function defaultVisualStyle() {
    return {
      base: {
        layout: { display: 'block', position: 'relative', flexDirection: 'row', justifyContent: '', alignItems: '', gap: '', gridTemplateColumns: '', gridTemplateRows: '', placeItems: '', overflow: 'visible' },
        size: { width: 'auto', height: 'auto', minWidth: '0', maxWidth: '100%', minHeight: '', maxHeight: 'none', aspectRatio: null },
        spacing: { margin: '0', padding: '0' },
        position: { top: null, right: null, bottom: null, left: null, zIndex: 'auto' },
        typography: { fontFamily: 'var(--font-body)', fontSize: '', fontWeight: '', lineHeight: '', letterSpacing: '0', textAlign: '', textTransform: '', textDecoration: '', whiteSpace: '', wordBreak: '', textWrap: '' },
        visual: { color: 'var(--text)', backgroundColor: 'transparent', backgroundImage: '', backgroundSize: 'cover', backgroundPosition: 'center', opacity: 1, visibility: 'visible' },
        border: { width: '0', style: 'solid', color: 'transparent', radius: '0' },
        effects: { boxShadow: '', textShadow: '', filter: '', backdropFilter: '', mixBlendMode: '', isolation: '' },
        transform: { translateX: '0', translateY: '0', scaleX: 1, scaleY: 1, rotate: '0deg', skewX: '0deg', skewY: '0deg', transformOrigin: 'center' },
        shape: { clipPath: '', maskImage: '', borderShape: 'rectangle' },
        media: { objectFit: 'cover', objectPosition: 'center', aspectRatio: null },
        cursor: { type: 'default', pointerEvents: 'auto', userSelect: 'auto' }
      }
    };
  }

  function createVisualElement({ id, type, tag = 'div', name, parent = null, children = [], content = {}, attributes = {}, data = {}, style = {}, responsive = {}, accessibility = {}, constraints = {}, editor = {}, interactions = [], animations = [] }) {
    return {
      id,
      type,
      tag,
      name: name || type,
      parent,
      children,
      component: { isInstance: false, componentId: null, variant: null, overrides: {} },
      content: {
        text: '', html: '', richText: [], src: '', alt: '', href: '', target: '', value: '', placeholder: '', label: '', items: [], form: {}, media: {}, svg: '', customCode: '',
        ...content
      },
      attributes: { 'data-type': type, ...attributes },
      data: { binding: null, collection: null, condition: null, repeat: null, ...data },
      style: deepMerge(defaultVisualStyle(), style),
      responsive: deepMerge({ desktop: {}, laptop: {}, tablet: {}, mobile: {} }, responsive),
      states: { hover: {}, focus: {}, active: {}, disabled: {}, selected: {}, open: {}, checked: {} },
      interactions,
      animations,
      accessibility: { role: '', label: '', hidden: false, tabIndex: null, describedBy: '', controls: '', ...accessibility },
      constraints: { editable: true, draggable: true, resizable: true, deletable: true, lockChildren: false, lockStyle: false, lockContent: false, keepInsideParent: true, preventOverflow: true, preserveAspectRatio: false, ...constraints },
      editor: { collapsed: false, selected: false, hiddenInEditor: false, x: 0, y: 0, width: null, height: null, groupId: null, layerName: name || type, notes: '', ...editor }
    };
  }

  function styleFromAtomicStyle(style = {}) {
    if (!isPlainObject(style)) return {};
    if (style.base) return style;

    const groups = {
      layout: new Set(['display', 'position', 'flex', 'flexBasis', 'flexGrow', 'flexShrink', 'flexDirection', 'justifyContent', 'justifySelf', 'alignItems', 'alignContent', 'alignSelf', 'gap', 'rowGap', 'columnGap', 'gridTemplateColumns', 'gridTemplateRows', 'placeItems', 'overflow', 'overflowX', 'overflowY', 'flexWrap']),
      size: new Set(['width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'aspectRatio']),
      spacing: new Set(['margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']),
      position: new Set(['top', 'right', 'bottom', 'left', 'zIndex']),
      typography: new Set(['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textAlign', 'textTransform', 'textDecoration', 'whiteSpace', 'wordBreak', 'textWrap']),
      visual: new Set(['color', 'background', 'backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition', 'opacity', 'visibility']),
      effects: new Set(['boxShadow', 'textShadow', 'filter', 'backdropFilter', 'mixBlendMode', 'isolation']),
      cursor: new Set(['cursor', 'pointerEvents', 'userSelect'])
    };
    const base = { layout: {}, size: {}, spacing: {}, position: {}, typography: {}, visual: {}, border: {}, effects: {}, transform: {}, cursor: {} };

    Object.entries(style).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      if (isPlainObject(value)) {
        base[key] = value;
        return;
      }
      if (key === 'background') {
        const text = String(value);
        if (/gradient|url\(/i.test(text)) base.visual.backgroundImage = value;
        else base.visual.backgroundColor = value;
      } else if (key === 'backgroundImage') {
        base.visual.backgroundImage = value;
      } else if (key === 'border') {
        base.border.width = value;
      } else if (key === 'borderWidth') {
        base.border.width = value;
      } else if (key === 'borderStyle') {
        base.border.style = value;
      } else if (key === 'borderColor') {
        base.border.color = value;
      } else if (key === 'borderRadius') {
        base.border.radius = value;
      } else if (key === 'transform') {
        base.transform.raw = value;
      } else {
        const groupName = Object.keys(groups).find(name => groups[name].has(key));
        if (groupName) base[groupName][key] = value;
      }
    });

    Object.keys(base).forEach(group => {
      if (!Object.keys(base[group]).length) delete base[group];
    });
    return { base };
  }

  function responsiveFromAtomicResponsive(responsive = {}) {
    if (!isPlainObject(responsive)) return {};
    return Object.fromEntries(Object.entries(responsive).map(([breakpoint, value]) => {
      if (!isPlainObject(value)) return [breakpoint, value];
      return [breakpoint, {
        ...value,
        style: value.style ? styleFromAtomicStyle(value.style) : value.style
      }];
    }));
  }

  function normalizeBlueprintTheme(blueprint) {
    const colors = blueprint.theme?.colors || {};
    const requestedMode = String(blueprint.theme?.mode || '').toLowerCase();
    const mode = requestedMode === 'light' ? 'light' : 'dark';
    const dark = mode !== 'light';
    const initial = {
      background: colors.background || (dark ? '#0b0c10' : '#f7f8fb'),
      surface: colors.surface || (dark ? '#15161c' : '#ffffff'),
      surfaceAlt: colors.surfaceAlt || (dark ? '#1e1f26' : '#eef2f7'),
      text: colors.text || (dark ? '#f8fafc' : '#101827'),
      muted: colors.muted || (dark ? '#94a3b8' : '#64748b'),
      primary: colors.primary || '#c9a86b',
      accent: colors.accent || '#6ee7b7',
      border: colors.border || (dark ? '#2b2d35' : '#dbe3ef'),
      shadow: dark ? '0 24px 50px rgba(0,0,0,0.34)' : '0 20px 45px rgba(15,23,42,0.10)',
      mode
    };

    return normalizeThemeContrast(initial);
  }

  function normalizeThemeContrast(theme = {}) {
    const output = { ...theme };
    const background = resolveColorForContrast(output.background, output, null) || (output.mode === 'light' ? { r: 247, g: 248, b: 251, a: 1 } : { r: 11, g: 12, b: 16, a: 1 });
    const surface = resolveColorForContrast(output.surface, output, background) || background;
    const surfaceAlt = resolveColorForContrast(output.surfaceAlt, output, surface) || surface;
    const primary = resolveColorForContrast(output.primary, output, surface) || { r: 201, g: 168, b: 107, a: 1 };

    output.text = ensureReadableColor(output.text, background, output, 4.5, output.mode === 'light' ? '#101827' : '#f8fafc');
    output.muted = ensureReadableColor(output.muted, surface, output, 3.2, output.mode === 'light' ? '#475569' : '#cbd5e1');
    output.onPrimary = bestAccessibleTextForBackground(primary, output, 4.5);
    output.onSurface = bestAccessibleTextForBackground(surface, output, 4.5);
    output.onSurfaceAlt = bestAccessibleTextForBackground(surfaceAlt, output, 4.5);
    return output;
  }

  function parseHexColor(value = '') {
    const hex = String(value || '').trim();
    if (!/^#[0-9a-fA-F]{3,8}$/.test(hex)) return null;
    let body = hex.slice(1);
    if (body.length === 3 || body.length === 4) body = body.split('').map(char => char + char).join('');
    const hasAlpha = body.length === 8;
    return {
      r: parseInt(body.slice(0, 2), 16),
      g: parseInt(body.slice(2, 4), 16),
      b: parseInt(body.slice(4, 6), 16),
      a: hasAlpha ? parseInt(body.slice(6, 8), 16) / 255 : 1
    };
  }

  function parseRgbColor(value = '') {
    const match = /^rgba?\(([^)]+)\)$/i.exec(String(value || '').trim());
    if (!match) return null;
    const parts = match[1].split(',').map(part => part.trim());
    if (parts.length < 3) return null;
    const numbers = parts.map((part, index) => {
      if (part.endsWith('%') && index < 3) return Math.round((parseFloat(part) / 100) * 255);
      return parseFloat(part);
    });
    if (numbers.slice(0, 3).some(value => Number.isNaN(value))) return null;
    return {
      r: Math.max(0, Math.min(255, numbers[0])),
      g: Math.max(0, Math.min(255, numbers[1])),
      b: Math.max(0, Math.min(255, numbers[2])),
      a: Number.isFinite(numbers[3]) ? Math.max(0, Math.min(1, numbers[3])) : 1
    };
  }

  function blendColorOver(color, background) {
    if (!color) return null;
    if (!background || color.a === undefined || color.a >= 0.98) return { ...color, a: 1 };
    const alpha = Math.max(0, Math.min(1, color.a));
    return {
      r: Math.round(color.r * alpha + background.r * (1 - alpha)),
      g: Math.round(color.g * alpha + background.g * (1 - alpha)),
      b: Math.round(color.b * alpha + background.b * (1 - alpha)),
      a: 1
    };
  }

  function resolveColorForContrast(value, theme = {}, inheritedBackground = null) {
    if (!value) return null;
    let text = String(value).trim();
    if (!text || text === 'transparent' || text === 'none') return null;

    const variableMatch = /^var\(\s*--([\w-]+)\s*(?:,\s*([^)]+))?\)$/i.exec(text);
    if (variableMatch) {
      const key = variableMatch[1];
      const fallback = variableMatch[2];
      const aliases = {
        background: theme.background,
        surface: theme.surface,
        surfaceAlt: theme.surfaceAlt,
        'surface-alt': theme.surfaceAlt,
        text: theme.text,
        muted: theme.muted,
        primary: theme.primary,
        accent: theme.accent,
        border: theme.border,
        onPrimary: theme.onPrimary,
        'on-primary': theme.onPrimary,
        onSurface: theme.onSurface,
        'on-surface': theme.onSurface,
        onSurfaceAlt: theme.onSurfaceAlt,
        'on-surface-alt': theme.onSurfaceAlt
      };
      text = aliases[key] || fallback || '';
      if (!text || text === value) return null;
      return resolveColorForContrast(text, theme, inheritedBackground);
    }

    const named = {
      white: '#ffffff',
      black: '#000000',
      currentcolor: theme.text || '#f8fafc'
    };
    if (named[text.toLowerCase()]) text = named[text.toLowerCase()];

    const parsed = parseHexColor(text) || parseRgbColor(text);
    return blendColorOver(parsed, inheritedBackground);
  }

  function relativeLuminance(color) {
    if (!color) return 0;
    const convert = channel => {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * convert(color.r) + 0.7152 * convert(color.g) + 0.0722 * convert(color.b);
  }

  function contrastRatio(first, second) {
    if (!first || !second) return 1;
    const l1 = relativeLuminance(first);
    const l2 = relativeLuminance(second);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function rgbToHex(color) {
    if (!color) return '#f8fafc';
    const toHex = channel => Math.round(Math.max(0, Math.min(255, channel))).toString(16).padStart(2, '0');
    return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
  }

  function bestAccessibleTextForBackground(background, theme = {}, minRatio = 4.5) {
    const candidates = [
      theme.text,
      theme.onPrimary,
      '#ffffff',
      '#f8fafc',
      '#111827',
      '#0f172a',
      '#000000'
    ];
    let best = { value: '#f8fafc', ratio: 0 };
    candidates.forEach(candidate => {
      const color = resolveColorForContrast(candidate, theme, background);
      const ratio = contrastRatio(color, background);
      if (ratio > best.ratio) best = { value: candidate, ratio };
    });
    if (best.ratio >= minRatio) return best.value;
    return relativeLuminance(background) > 0.45 ? '#0f172a' : '#ffffff';
  }

  function ensureReadableColor(candidate, background, theme = {}, minRatio = 4.5, fallback = '#f8fafc') {
    const color = resolveColorForContrast(candidate, theme, background);
    if (color && contrastRatio(color, background) >= minRatio) return candidate;
    const fallbackColor = resolveColorForContrast(fallback, theme, background);
    if (fallbackColor && contrastRatio(fallbackColor, background) >= minRatio) return fallback;
    return bestAccessibleTextForBackground(background, theme, minRatio);
  }

  function visualStyleBase(element = {}) {
    element.style = element.style || defaultVisualStyle();
    element.style.base = element.style.base || {};
    element.style.base.visual = element.style.base.visual || {};
    element.style.base.typography = element.style.base.typography || {};
    element.style.base.border = element.style.base.border || {};
    return element.style.base;
  }

  function getElementBackgroundValue(element = {}) {
    const base = visualStyleBase(element);
    return base.visual.backgroundColor || base.visual.background || '';
  }

  function setElementTextColor(element = {}, value) {
    const base = visualStyleBase(element);
    base.visual.color = value;
  }

  function setElementBackgroundColor(element = {}, value) {
    const base = visualStyleBase(element);
    base.visual.backgroundColor = value;
  }

  function elementHasReadableText(element = {}) {
    const content = element.content || {};
    const tag = String(element.tag || '').toLowerCase();
    const type = String(element.type || '').toLowerCase();
    return Boolean(content.text || content.label || content.value || content.placeholder)
      || ['a', 'button', 'p', 'span', 'strong', 'small', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'input', 'textarea', 'select'].includes(tag)
      || ['button', 'link', 'text', 'heading', 'paragraph', 'badge', 'input', 'textarea', 'search'].includes(type);
  }

  function hardenVisualDocumentDesignSystem(visualDocument = {}) {
    if (!isVisualDocumentPayload(visualDocument)) return visualDocument;
    const tokens = visualDocument.theme?.tokens || {};
    const colors = tokens.colors || {};
    const theme = normalizeThemeContrast({
      background: colors.background,
      surface: colors.surface,
      surfaceAlt: colors.surfaceAlt,
      text: colors.text,
      muted: colors.muted,
      primary: colors.primary,
      accent: colors.accent,
      border: colors.border,
      shadow: tokens.shadows?.md,
      mode: colors.mode || 'dark'
    });

    visualDocument.theme.tokens.colors = {
      ...colors,
      background: theme.background,
      surface: theme.surface,
      surfaceAlt: theme.surfaceAlt,
      text: theme.text,
      muted: theme.muted,
      primary: theme.primary,
      accent: theme.accent,
      border: theme.border,
      onPrimary: theme.onPrimary,
      onSurface: theme.onSurface,
      onSurfaceAlt: theme.onSurfaceAlt,
      mode: theme.mode
    };
    visualDocument.theme.tokens.shadows = { ...(tokens.shadows || {}), md: theme.shadow || tokens.shadows?.md || '0 24px 50px rgba(0,0,0,0.34)' };

    const page = getVisualDefaultPage(visualDocument);
    if (!page?.elements) return visualDocument;
    const elements = page.elements;
    const rootBackground = resolveColorForContrast(theme.background, theme, null) || { r: 11, g: 12, b: 16, a: 1 };

    function walk(elementId, inheritedBackground = rootBackground) {
      const element = elements[elementId];
      if (!element) return;
      const base = visualStyleBase(element);
      const bgValue = getElementBackgroundValue(element);
      const ownBackground = resolveColorForContrast(bgValue, theme, inheritedBackground);
      const background = ownBackground || inheritedBackground;
      const tag = String(element.tag || '').toLowerCase();
      const type = String(element.type || '').toLowerCase();
      const isInteractive = ['button', 'a', 'input', 'textarea', 'select'].includes(tag) || ['button', 'link', 'input', 'textarea', 'search'].includes(type);

      if (type === 'button' || tag === 'button') {
        if (!bgValue || bgValue === 'transparent') {
          setElementBackgroundColor(element, 'var(--surfaceAlt)');
        }
        const buttonVisualBackground = `${getElementBackgroundValue(element) || ''} ${base.visual.backgroundImage || ''}`;
        const gradientBackground = /gradient/i.test(buttonVisualBackground);
        const buttonBackground = gradientBackground
          ? (resolveColorForContrast(theme.primary, theme, background) || background)
          : (resolveColorForContrast(getElementBackgroundValue(element), theme, background) || background);
        setElementTextColor(element, ensureReadableColor(base.visual.color || 'var(--text)', buttonBackground, theme, 4.5, bestAccessibleTextForBackground(buttonBackground, theme)));
        base.border.color = base.border.color && base.border.color !== 'transparent' ? base.border.color : 'var(--border)';
        base.cursor = base.cursor || {};
        base.cursor.type = 'pointer';
      } else if (tag === 'input' || tag === 'textarea' || type === 'input' || type === 'textarea' || type === 'search') {
        if (!bgValue || bgValue === 'transparent') setElementBackgroundColor(element, 'var(--surface)');
        const inputBackground = resolveColorForContrast(getElementBackgroundValue(element), theme, background) || background;
        setElementTextColor(element, ensureReadableColor(base.visual.color || 'var(--text)', inputBackground, theme, 4.5, theme.text));
        base.border.color = base.border.color && base.border.color !== 'transparent' ? base.border.color : 'var(--border)';
      } else if (elementHasReadableText(element)) {
        const requiredRatio = ['h1', 'h2', 'h3', 'strong'].includes(tag) ? 3.2 : 4.5;
        const current = base.visual.color || (type === 'link' ? 'var(--text)' : 'var(--text)');
        setElementTextColor(element, ensureReadableColor(current, background, theme, requiredRatio, theme.text));
      }

      if (isInteractive) {
        base.typography.fontWeight = base.typography.fontWeight || '700';
      }

      (element.children || []).forEach(childId => walk(childId, background));
    }

    walk(page.root || Object.keys(elements)[0], rootBackground);
    return visualDocument;
  }

  function scaleRank(scale = 'standard') {
    return { sample: 0, simple: 1, standard: 2, rich: 3, full: 4 }[scale] ?? 2;
  }

  function sectionLimitForScale(scale = 'standard') {
    return { sample: 4, simple: 5, standard: 7, rich: 10, full: 12 }[scale] || 7;
  }

  function minimumSectionCountForScale(scale = 'standard') {
    return { sample: 3, simple: 4, standard: 6, rich: 8, full: 10 }[scale] || 6;
  }

  function itemLimitForScale(scale = 'standard', type = '') {
    if (scale === 'sample') return type === 'faq' ? 3 : 2;
    if (scale === 'simple') return type === 'faq' ? 4 : 3;
    if (scale === 'rich' || scale === 'full') return type === 'faq' ? 8 : 6;
    return type === 'faq' ? 6 : 4;
  }

  function defaultSectionsForBlueprint(blueprint, prompt) {
    // AI-only generation policy: do not silently inject a fixed predefined template.
    // This returns no default sections so missing structure becomes a visible generation issue
    // instead of the same generic page appearing for every request.
    return [];
  }

  function completeSectionsForScale(sections, blueprint, prompt) {
    const limit = sectionLimitForScale(blueprint.intent?.scale);
    const seen = new Set();
    return (Array.isArray(sections) ? sections : [])
      .filter(section => section && section.type)
      .filter(section => {
        const key = `${section.type}:${String(section.title || section.eyebrow || '').toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit);
  }

  function countAtomicNodes(nodes = []) {
    if (!Array.isArray(nodes)) return 0;
    return nodes.reduce((total, node) => total + 1 + countAtomicNodes(node?.children), 0);
  }

  function hasUsableAtomicStructure(structure = {}) {
    return structure?.mode === 'atomic' && countAtomicNodes(structure.nodes) >= 8;
  }

  function minimumAtomicNodeCountForScale(scale = 'standard', prompt = '', pageType = '') {
    const base = { sample: 12, simple: 16, standard: 25, rich: 42, full: 55 }[scale] || 25;
    const value = `${prompt || ''} ${pageType || ''}`.toLowerCase();
    const productionDemand = /\b(clone|replica|copy|production|industry|perfect|complete|full|professional|app|dashboard|platform|exact|updated version)\b/.test(value);
    return productionDemand ? Math.max(base, scale === 'sample' || scale === 'simple' ? 24 : 42) : base;
  }

  function atomicValidationIssueForBlueprint(blueprint = {}, prompt = '') {
    const structure = blueprint.structure || {};
    const pageType = blueprint.intent?.pageType || '';
    const scale = blueprint.intent?.scale || inferWebsiteIntentFromText(prompt).scale || 'standard';
    const count = countAtomicNodes(structure.nodes);
    const minimum = minimumAtomicNodeCountForScale(scale, prompt, pageType);

    if (structure.mode !== 'atomic') {
      return 'structure.mode must be atomic so layout comes from the AI JSON tree.';
    }
    if (!Array.isArray(structure.nodes) || !structure.nodes.length) {
      return 'structure.nodes is missing. Nexora will not invent a local template or section layout.';
    }
    if (count < minimum) {
      return `structure.nodes has only ${count} nodes; ${minimum}+ AI-authored nodes are required for this request so placement, regions, and styling are decided by the AI.`;
    }

    const text = atomicStructureText(structure);
    const productRequest = isProductUiRequest(prompt, pageType);
    const genericOnly = /\b(thoughtful structure|visual polish|editor ready|get started|learn more|generated website)\b/i.test(text)
      && !/\b(feed|story|post|sidebar|profile|suggestion|reel|video|player|rail|cart|product|checkout|dashboard|metric|inbox|workspace|timeline|playlist|channel|message|notification|search)\b/i.test(text);
    if (productRequest && genericOnly) {
      return 'The atomic tree looks generic instead of matching the requested product/interface. The AI must decide a recognizable product-specific structure inside JSON.';
    }
    return '';
  }

  function throwAtomicBlueprintRequired(message) {
    const error = new Error(`WEBSITE_BUNDLE_REQUIRED: ${message}`);
    error.name = 'WebsiteBundleRequiredError';
    throw error;
  }

  function isAtomicBlueprintRequiredError(error) {
    return /(?:ATOMIC_BLUEPRINT_REQUIRED|WEBSITE_BUNDLE_REQUIRED)/i.test(error?.message || '') || ['AtomicBlueprintRequiredError', 'WebsiteBundleRequiredError'].includes(error?.name);
  }

  function atomicStructureText(structure = {}) {
    const parts = [];
    function walk(value, depth = 0) {
      if (!value || depth > 16) return;
      if (Array.isArray(value)) {
        value.forEach(item => walk(item, depth + 1));
        return;
      }
      if (!isPlainObject(value)) return;
      ['id', 'type', 'name', 'text', 'label', 'placeholder', 'alt', 'href'].forEach(key => {
        if (value[key]) parts.push(String(value[key]).toLowerCase());
      });
      if (isPlainObject(value.attributes)) {
        Object.entries(value.attributes).forEach(([key, entry]) => {
          parts.push(String(key).toLowerCase());
          if (typeof entry === 'string') parts.push(entry.toLowerCase());
        });
      }
      walk(value.children, depth + 1);
    }
    walk(structure.nodes || []);
    return parts.join(' ');
  }

  function isProductUiRequest(prompt = '', pageType = '') {
    const value = `${prompt || ''} ${pageType || ''}`.toLowerCase();
    return /\b(clone|copy|replica|similar to|inspired by|platform|feed|streaming|social|media app|web app|app shell|dashboard|interface|screen|auth|login|commerce|marketplace)\b/.test(value)
      || ['clone', 'media', 'app', 'dashboard', 'auth', 'ecommerce'].includes(String(pageType || '').toLowerCase());
  }

  function normalizeAtomicStructureGraph(structure = {}) {
    if (!isPlainObject(structure) || !Array.isArray(structure.nodes)) return structure;
    const nodes = structure.nodes.filter(isPlainObject).map(node => ({ ...node }));
    if (!nodes.length) return { ...structure, nodes: [] };
    const byId = new Map();
    nodes.forEach((node, index) => {
      const rawId = node.id || `${slugifyId(node.type || 'node')}_${index + 1}`;
      node.id = String(rawId);
      node.children = Array.isArray(node.children) ? [...node.children] : [];
      byId.set(node.id, node);
    });

    const childRefs = new Set();
    nodes.forEach(node => {
      node.children.forEach(child => {
        if (typeof child === 'string' && byId.has(child)) childRefs.add(child);
        if (isPlainObject(child) && child.id) childRefs.add(String(child.id));
      });
      if (node.parent && byId.has(String(node.parent))) {
        const parent = byId.get(String(node.parent));
        if (!parent.children.some(child => (typeof child === 'string' ? child : child?.id) === node.id)) {
          parent.children.push(node.id);
        }
        childRefs.add(node.id);
      }
    });

    function cloneNested(node, stack = new Set()) {
      if (!node || stack.has(node.id)) return null;
      stack.add(node.id);
      const cloned = { ...node };
      cloned.children = (node.children || [])
        .map(child => {
          if (typeof child === 'string') return byId.has(child) ? cloneNested(byId.get(child), stack) : null;
          if (isPlainObject(child)) {
            if (child.id && byId.has(String(child.id)) && byId.get(String(child.id)) !== child) return cloneNested(byId.get(String(child.id)), stack);
            return cloneNested({ ...child, id: child.id || `${node.id}_child_${Math.random().toString(36).slice(2, 7)}` }, stack);
          }
          return null;
        })
        .filter(Boolean);
      stack.delete(node.id);
      return cloned;
    }

    const explicitRoots = nodes.filter(node => ['page', 'root', 'shell'].includes(String(node.type || '').toLowerCase()) && !node.parent);
    const looseRoots = nodes.filter(node => !childRefs.has(node.id) && !node.parent);
    const rootCandidates = explicitRoots.length ? explicitRoots : looseRoots.length ? looseRoots : [nodes[0]];
    return { ...structure, mode: structure.mode || 'atomic', nodes: rootCandidates.map(node => cloneNested(node)).filter(Boolean) };
  }

  function buildAtomicStructureFromBlueprint() {
    throwAtomicBlueprintRequired('Nexora no longer composes local section layouts. The AI must provide the complete atomic structure.nodes tree.');
  }

  function normalizeBlueprint(blueprint, prompt, options = {}) {
    const fillDefaults = options.fillDefaults !== false;
    const normalized = isPlainObject(blueprint) ? { ...blueprint } : {};
    const inferredIntent = inferWebsiteIntentFromText(prompt);
    normalized.schema = VISUAL_BLUEPRINT_SCHEMA;
    normalized.version = '1.0.0';
    normalized.projectName = normalized.projectName || titleFromText(prompt).replace(/\.+$/, '') || 'Generated Website';
    normalized.reply = normalized.reply || 'Your editable website is ready.';
    normalized.intent = {
      kind: 'website',
      pageType: normalized.intent?.pageType || inferredIntent.pageType || 'landing',
      scale: normalized.intent?.scale || inferredIntent.scale || 'standard',
      reasoning: normalized.intent?.reasoning || 'Inferred from the user request.',
      ...normalized.intent
    };
    if (scaleRank(inferredIntent.scale) > scaleRank(normalized.intent.scale)) {
      normalized.intent.scale = inferredIntent.scale;
      normalized.intent.reasoning = 'Matched the richer quality requested by the user.';
    }
    if ((!normalized.intent.pageType || normalized.intent.pageType === 'custom') && inferredIntent.pageType) {
      normalized.intent.pageType = inferredIntent.pageType;
    }
    normalized.structure = normalizeAtomicStructureGraph(isPlainObject(normalized.structure) ? normalized.structure : {});
    const rawSections = Array.isArray(normalized.sections) ? normalized.sections : [];
    const cleanSections = rawSections
      .filter(section => section && section.type)
      .slice(0, sectionLimitForScale(normalized.intent.scale));
    normalized.sections = fillDefaults ? completeSectionsForScale(cleanSections, normalized, prompt) : cleanSections;

    const atomicIssue = atomicValidationIssueForBlueprint(normalized, prompt);
    if (atomicIssue) {
      throwAtomicBlueprintRequired(atomicIssue);
    }
    return normalized;
  }

  function buildVisualDocumentFromBlueprint(rawBlueprint, originalPrompt, options = {}) {
    const blueprint = normalizeBlueprint(rawBlueprint, originalPrompt, options);
    const includeNavigation = options.includeNavigation !== false;
    const includeFooter = options.includeFooter !== false;
    const theme = normalizeBlueprintTheme(blueprint);
    const livePreview = isPlainObject(blueprint.livePreview) ? blueprint.livePreview : {};
    const navConfig = isPlainObject(blueprint.navigation) ? blueprint.navigation : {};
    const layoutVariant = slugifyId(livePreview.layout || blueprint.intent?.pageType || 'stacked');
    const headerVariant = slugifyId(livePreview.headerStyle || navConfig.layout || (blueprint.intent?.pageType === 'dashboard' ? 'dashboard' : layoutVariant === 'editorial' ? 'centered' : layoutVariant === 'commerce' ? 'minimal' : 'split'));
    const footerVariant = slugifyId(livePreview.footerStyle || (layoutVariant === 'commerce' ? 'newsletter' : layoutVariant === 'editorial' ? 'minimal' : layoutVariant === 'dashboard' ? 'sitemap' : 'columns'));
    const sectionVariant = slugifyId(livePreview.sectionStyle || (layoutVariant === 'dashboard' ? 'dashboard-panels' : layoutVariant === 'editorial' ? 'editorial' : layoutVariant === 'commerce' ? 'showcase' : 'cards'));
    const elements = {};
    const rootChildren = [];
    let counter = 0;
    const nextId = (base) => `el_${slugifyId(base)}_${++counter}`;

    function addElement(options) {
      const element = createVisualElement(options);
      elements[element.id] = element;
      if (element.parent && elements[element.parent]) elements[element.parent].children.push(element.id);
      return element.id;
    }

    function uniqueElementId(base) {
      const clean = slugifyId(base || 'element');
      let candidate = `el_${clean}`;
      let index = 2;
      while (elements[candidate]) {
        candidate = `el_${clean}_${index}`;
        index += 1;
      }
      return candidate;
    }

    const rootId = addElement({
      id: 'el_root',
      type: 'root',
      tag: 'div',
      name: 'Page Root',
      children: rootChildren,
      constraints: { deletable: false, draggable: false, resizable: false },
      style: { base: { layout: { display: 'flex', flexDirection: 'column', overflow: 'hidden' }, size: { width: '100%', minHeight: '100vh' }, visual: { backgroundColor: 'var(--background)', color: 'var(--text)' } } }
    });

    function addText(parent, type, tag, text, style = {}, name = type) {
      return addElement({ id: nextId(name), type, tag, name, parent, content: { text: String(text || '') }, style });
    }

    function addButton(parent, label, variant = 'primary') {
      return addElement({
        id: nextId(`button_${label || variant}`),
        type: 'button',
        tag: 'button',
        name: label || 'Button',
        parent,
        content: { text: label || 'Learn More' },
        attributes: { type: 'button' },
        style: {
          base: {
            layout: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
            spacing: { padding: '12px 22px', margin: '0' },
            typography: { fontWeight: '800', fontSize: '14px' },
            visual: { color: variant === 'primary' ? 'var(--onPrimary, #15110a)' : 'var(--text)', backgroundColor: variant === 'primary' ? 'var(--primary)' : 'transparent' },
            border: { width: '1px', style: 'solid', color: variant === 'primary' ? 'var(--primary)' : 'var(--border)', radius: '10px' },
            cursor: { type: 'pointer', pointerEvents: 'auto', userSelect: 'none' }
          }
        },
        interactions: [{ id: nextId('action'), event: 'click', action: 'navigate', target: '', value: '#', conditions: [] }]
      });
    }

    function atomicTagFor(node = {}) {
      if (node.tag) return node.tag;
      const type = String(node.type || '').toLowerCase();
      if (type === 'header') return 'header';
      if (type === 'nav' || type === 'navbar') return 'nav';
      if (type === 'sidebar') return 'aside';
      if (type === 'main' || type === 'feed') return 'main';
      if (type === 'footer') return 'footer';
      if (type === 'section') return 'section';
      if (type === 'card' || type === 'post' || type === 'video-card') return 'article';
      if (type === 'button' || type === 'theme-toggle' || type === 'menu-button') return 'button';
      if (type === 'link') return 'a';
      if (type === 'heading') return 'h2';
      if (type === 'text' || type === 'paragraph') return 'p';
      if (type === 'image' || type === 'avatar' || type === 'thumbnail') return 'img';
      if (type === 'search') return Array.isArray(node.children) && node.children.length ? 'form' : 'input';
      if (type === 'input') return 'input';
      if (type === 'video') return 'video';
      return 'div';
    }

    function addAtomicNode(node, parent, depth = 0) {
      if (!isPlainObject(node) || depth > 12) return null;
      const type = node.type || 'container';
      const tag = atomicTagFor(node);
      if (type === 'root' || type === 'page') {
        (Array.isArray(node.children) ? node.children : []).forEach(child => addAtomicNode(child, parent, depth + 1));
        return parent;
      }
      const attributes = { ...(node.attributes || {}) };
      if (node.level) attributes['data-atomic-level'] = node.level;
      if (node.href) attributes.href = node.href;
      if (node.src) attributes.src = node.src;
      if (node.alt) attributes.alt = node.alt;
      if (node.placeholder) attributes.placeholder = node.placeholder;
      if (tag === 'button' && !attributes.type) attributes.type = 'button';
      if (type === 'theme-toggle') attributes['data-theme-toggle'] = 'true';
      if (type === 'menu-button') attributes['data-menu-toggle'] = 'true';
      if (node.navTarget) attributes['data-nav-links'] = node.navTarget;

      const id = addElement({
        id: node.id ? uniqueElementId(node.id) : nextId(type),
        type,
        tag,
        name: node.name || node.label || type,
        parent,
        content: {
          text: node.text || node.label || '',
          href: node.href || '',
          src: node.src || '',
          alt: node.alt || '',
          placeholder: node.placeholder || ''
        },
        attributes,
        data: { atomicLevel: node.level || '', atomicSource: 'blueprint', atomicType: type },
        style: styleFromAtomicStyle(node.style || {}),
        responsive: responsiveFromAtomicResponsive(node.responsive || {}),
        accessibility: { role: node.role || '', label: node.ariaLabel || node.label || node.name || '' }
      });

      (Array.isArray(node.children) ? node.children : []).forEach(child => addAtomicNode(child, id, depth + 1));
      return id;
    }

    function hasAtomicStructure() {
      return Array.isArray(blueprint.structure?.nodes) && blueprint.structure.nodes.length;
    }

    function getNavStyle() {
      const centered = headerVariant === 'centered';
      const minimal = headerVariant === 'minimal';
      const overlay = headerVariant === 'overlay';
      const dashboard = headerVariant === 'dashboard' || headerVariant === 'sidebar';
      return {
        layout: {
          display: 'flex',
          flexDirection: centered ? 'column' : 'row',
          alignItems: centered ? 'center' : 'center',
          justifyContent: dashboard ? 'flex-start' : centered ? 'center' : 'space-between',
          gap: centered ? '14px' : dashboard ? '14px' : '18px',
          overflow: 'visible',
          flexWrap: dashboard ? 'wrap' : ''
        },
        size: { width: '100%' },
        spacing: { padding: minimal ? '14px 32px' : overlay ? '22px 34px' : dashboard ? '14px 22px' : '18px 32px' },
        visual: { backgroundColor: overlay ? 'transparent' : dashboard ? 'var(--background)' : 'var(--surface)' },
        border: { width: overlay ? '0' : '0 0 1px 0', style: 'solid', color: 'var(--border)', radius: '0' },
        effects: { boxShadow: overlay ? 'none' : dashboard ? '0 12px 28px rgba(0,0,0,0.16)' : '' }
      };
    }

    function addNav() {
      const nav = addElement({
        id: 'el_navbar',
        type: 'navbar',
        tag: 'nav',
        name: 'Navbar',
        parent: rootId,
        attributes: { 'aria-label': 'Primary navigation', 'data-header-variant': headerVariant },
        constraints: { editable: true, draggable: false, resizable: false, deletable: true, lockChildren: false },
        style: { base: getNavStyle() },
        responsive: { mobile: { style: { base: { layout: { flexDirection: 'column', alignItems: 'stretch' }, spacing: { padding: '16px 18px' } } } } }
      });
      addText(nav, 'heading', 'strong', navConfig.brand || blueprint.projectName, { base: { typography: { fontSize: headerVariant === 'centered' ? '24px' : '20px', fontWeight: '900', textAlign: headerVariant === 'centered' ? 'center' : '' }, visual: { color: 'var(--text)' } } }, 'Brand');
      addElement({
        id: 'el_menu_toggle',
        type: 'button',
        tag: 'button',
        name: 'Menu Button',
        parent: nav,
        content: { text: navConfig.menuLabel || 'Menu' },
        attributes: { type: 'button', 'data-menu-toggle': 'true', 'aria-label': 'Toggle menu', 'aria-expanded': 'false' },
        style: { base: { layout: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }, spacing: { padding: '10px 13px', margin: '0' }, typography: { fontSize: '13px', fontWeight: '900' }, visual: { color: 'var(--text)', backgroundColor: 'var(--surfaceAlt)' }, border: { width: '1px', style: 'solid', color: 'var(--border)', radius: '10px' }, cursor: { type: 'pointer' } } }
      });
      const links = addElement({ id: nextId('nav_links'), type: 'container', tag: 'div', name: 'Navigation Links', parent: nav, attributes: { 'data-nav-links': 'true' }, style: { base: { layout: { display: 'flex', alignItems: 'center', justifyContent: headerVariant === 'centered' ? 'center' : headerVariant === 'dashboard' ? 'flex-start' : 'flex-end', gap: headerVariant === 'minimal' ? '12px' : '18px', flexWrap: 'wrap' }, size: { minWidth: '0' } } }, responsive: { mobile: { style: { base: { layout: { flexWrap: 'wrap', justifyContent: 'center' } } } } } });
      (Array.isArray(navConfig.links) ? navConfig.links : []).slice(0, 5).forEach(link => {
        addElement({ id: nextId(`link_${link}`), type: 'link', tag: 'a', name: link, parent: links, content: { text: link, href: `#${slugifyId(link)}` }, attributes: { href: `#${slugifyId(link)}` }, style: { base: { typography: { fontSize: '14px', fontWeight: '700' }, visual: { color: 'var(--muted)' }, spacing: { margin: '0' } } } });
      });
      if (navConfig.cta) addButton(links, navConfig.cta, 'primary');
    }

    function addSection(section, index) {
      const type = section.type || 'content';
      const editorial = sectionVariant === 'editorial' || layoutVariant === 'editorial';
      const dashboard = sectionVariant === 'dashboard-panels' || layoutVariant === 'dashboard';
      const showcase = sectionVariant === 'showcase' || layoutVariant === 'commerce' || layoutVariant === 'hero-grid';
      const sectionAlign = editorial ? 'flex-start' : 'center';
      const sectionTextAlign = editorial ? 'left' : 'center';
      const sectionId = addElement({
        id: `el_${slugifyId(type)}_${index + 1}`,
        type: type === 'footer' ? 'footer' : (type === 'hero' ? 'hero' : 'section'),
        tag: type === 'footer' ? 'footer' : (type === 'hero' ? 'header' : 'section'),
        name: section.title || type,
        parent: rootId,
        attributes: { id: slugifyId(section.title || type), 'aria-label': section.title || type },
        style: {
          base: {
            layout: { display: 'flex', flexDirection: 'column', alignItems: sectionAlign, justifyContent: type === 'hero' ? 'center' : 'flex-start', gap: dashboard ? '18px' : type === 'hero' ? '24px' : '28px', overflow: 'hidden' },
            size: { width: '100%', minHeight: type === 'hero' ? (showcase ? '620px' : dashboard ? '420px' : '560px') : '' },
            spacing: { padding: type === 'hero' ? (dashboard ? '56px 28px' : '88px 32px') : dashboard ? '42px 28px' : '68px 32px' },
            visual: { backgroundColor: dashboard ? 'var(--background)' : index % 2 === 0 ? 'var(--background)' : 'var(--surface)' }
          }
        },
        responsive: { mobile: { style: { base: { spacing: { padding: type === 'hero' ? '64px 20px' : '48px 20px' }, layout: { gap: '20px' } } } } },
        accessibility: { role: 'region', label: section.title || type }
      });

      if (section.eyebrow) {
        addText(sectionId, 'badge', 'span', section.eyebrow, { base: { layout: { display: 'inline-flex' }, spacing: { padding: '6px 12px' }, typography: { fontSize: '12px', fontWeight: '900', textTransform: 'uppercase' }, visual: { color: 'var(--primary)', backgroundColor: 'rgba(201,168,107,0.12)' }, border: { width: '1px', style: 'solid', color: 'rgba(201,168,107,0.30)', radius: '999px' } } }, 'Eyebrow');
      }
      if (section.title) {
        addText(sectionId, type === 'hero' ? 'heading' : 'heading', type === 'hero' ? 'h1' : 'h2', section.title, { base: { typography: { fontSize: type === 'hero' ? 'clamp(38px,6vw,72px)' : 'clamp(28px,4vw,44px)', fontWeight: '900', lineHeight: '1.05', textAlign: sectionTextAlign, textWrap: 'balance' }, size: { maxWidth: type === 'hero' ? '860px' : '760px' }, visual: { color: 'var(--text)' }, spacing: { margin: '0' } } }, 'Section Title');
      }
      if (section.subtitle || section.body) {
        addText(sectionId, 'paragraph', 'p', section.subtitle || section.body, { base: { typography: { fontSize: '17px', lineHeight: '1.75', textAlign: sectionTextAlign }, size: { maxWidth: '680px' }, visual: { color: 'var(--muted)' }, spacing: { margin: '0' } } }, 'Section Copy');
      }

      const items = Array.isArray(section.items) ? section.items.filter(Boolean) : [];
      if (type === 'stats') {
        const grid = addGrid(sectionId, 'Stats Grid', 'repeat(auto-fit, minmax(150px, 1fr))');
        (items.length ? items : [{ value: '99%', label: 'Satisfied users' }, { value: '24/7', label: 'Support' }, { value: '10x', label: 'Faster launch' }]).slice(0, itemLimitForScale(blueprint.intent.scale, type)).forEach(item => {
          const card = addCard(grid, item.label || item.title || 'Metric');
          addText(card, 'heading', 'h3', item.value || item.title || '100%', { base: { typography: { fontSize: '38px', fontWeight: '900', textAlign: 'center' }, visual: { color: 'var(--primary)' } } }, 'Metric Value');
          addText(card, 'paragraph', 'p', item.label || item.body || 'Metric label', { base: { typography: { fontSize: '13px', fontWeight: '800', textAlign: 'center', textTransform: 'uppercase' }, visual: { color: 'var(--muted)' } } }, 'Metric Label');
        });
      } else if (type === 'contact') {
        const form = addElement({ id: nextId('contact_form'), type: 'form', tag: 'form', name: 'Contact Form', parent: sectionId, style: { base: { layout: { display: 'grid', gap: '12px' }, size: { width: '100%', maxWidth: '520px' }, spacing: { padding: '24px' }, visual: { backgroundColor: 'var(--surfaceAlt)' }, border: { width: '1px', style: 'solid', color: 'var(--border)', radius: '14px' } } } });
        ['Name', 'Email'].forEach(label => addElement({ id: nextId(`input_${label}`), type: 'input', tag: 'input', name: label, parent: form, content: { placeholder: label }, attributes: { placeholder: label, type: label === 'Email' ? 'email' : 'text' }, style: inputStyle() }));
        addElement({ id: nextId('message'), type: 'textarea', tag: 'textarea', name: 'Message', parent: form, content: { placeholder: 'Tell us what you want to build' }, attributes: { placeholder: 'Tell us what you want to build', rows: '4' }, style: inputStyle() });
        if (section.primaryCta) addButton(form, section.primaryCta, 'primary');
      } else if (type === 'hero' || type === 'cta') {
        const actions = addElement({ id: nextId('actions'), type: 'container', tag: 'div', name: 'Actions', parent: sectionId, style: { base: { layout: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', flexWrap: 'wrap' } } } });
        if (section.primaryCta) addButton(actions, section.primaryCta, 'primary');
        if (section.secondaryCta) addButton(actions, section.secondaryCta, 'secondary');
      } else {
        const gridColumns = dashboard
          ? 'repeat(auto-fit, minmax(180px, 1fr))'
          : showcase
            ? 'repeat(auto-fit, minmax(280px, 1fr))'
            : type === 'pricing' ? 'repeat(auto-fit, minmax(260px, 1fr))' : 'repeat(auto-fit, minmax(230px, 1fr))';
        const grid = addGrid(sectionId, `${type} Grid`, gridColumns);
        items.slice(0, itemLimitForScale(blueprint.intent.scale, type)).forEach(item => {
          const card = addCard(grid, item.title || item.label || type);
          addText(card, 'heading', 'h3', item.title || item.label || item.value || 'Item', { base: { typography: { fontSize: '19px', fontWeight: '900', lineHeight: '1.2' }, visual: { color: 'var(--text)' } } }, 'Card Title');
          if (item.price) addText(card, 'heading', 'strong', item.price, { base: { typography: { fontSize: '36px', fontWeight: '900' }, visual: { color: 'var(--primary)' } } }, 'Price');
          addText(card, 'paragraph', 'p', item.body || item.meta || (Array.isArray(item.features) ? item.features.join(', ') : ''), { base: { typography: { fontSize: '14px', lineHeight: '1.7' }, visual: { color: 'var(--muted)' } } }, 'Card Copy');
        });
      }
    }

    function addGrid(parent, name, columns) {
      return addElement({ id: nextId(name), type: 'grid', tag: 'div', name, parent, style: { base: { layout: { display: 'grid', gridTemplateColumns: columns, gap: '18px' }, size: { width: '100%', maxWidth: '1040px' } } }, responsive: { mobile: { style: { base: { layout: { gridTemplateColumns: '1fr' } } } } } });
    }

    function addCard(parent, name) {
      return addElement({ id: nextId(name), type: 'card', tag: 'article', name, parent, style: { base: { layout: { display: 'flex', flexDirection: 'column', gap: '12px' }, spacing: { padding: '24px' }, visual: { backgroundColor: 'var(--surfaceAlt)' }, border: { width: '1px', style: 'solid', color: 'var(--border)', radius: '14px' }, effects: { boxShadow: 'var(--shadow-md)' } } } });
    }

    function inputStyle() {
      return { base: { size: { width: '100%' }, spacing: { padding: '12px 14px' }, visual: { color: 'var(--text)', backgroundColor: 'var(--surface)' }, border: { width: '1px', style: 'solid', color: 'var(--border)', radius: '10px' }, typography: { fontSize: '14px' } } };
    }

    function addFooter() {
      const year = new Date().getFullYear();
      const columns = footerVariant === 'columns' || footerVariant === 'newsletter' || footerVariant === 'sitemap';
      const footer = addElement({ id: 'el_footer', type: 'footer', tag: 'footer', name: 'Footer', parent: rootId, attributes: { 'data-footer-variant': footerVariant }, style: { base: { layout: { display: 'flex', flexDirection: columns ? 'row' : 'column', alignItems: columns ? 'flex-start' : 'center', justifyContent: columns ? 'space-between' : 'center', gap: '22px', flexWrap: 'wrap' }, size: { width: '100%' }, spacing: { padding: footerVariant === 'minimal' ? '30px 24px' : '52px 32px' }, visual: { backgroundColor: 'var(--surface)', color: 'var(--muted)' }, border: { width: '1px 0 0 0', style: 'solid', color: 'var(--border)', radius: '0' } } } });
      const brandBlock = addElement({ id: nextId('footer_brand_block'), type: 'container', tag: 'div', name: 'Footer Brand Block', parent: footer, style: { base: { layout: { display: 'flex', flexDirection: 'column', gap: '8px' }, size: { maxWidth: '360px' } } } });
      addText(brandBlock, 'heading', 'strong', navConfig.brand || blueprint.projectName, { base: { typography: { fontSize: '18px', fontWeight: '900', textAlign: columns ? 'left' : 'center' }, visual: { color: 'var(--text)' } } }, 'Footer Brand');
      addText(brandBlock, 'paragraph', 'p', `Copyright ${year} ${blueprint.projectName}. All rights reserved.`, { base: { typography: { fontSize: '13px', textAlign: columns ? 'left' : 'center', lineHeight: '1.6' }, visual: { color: 'var(--muted)' } } }, 'Copyright Text');
      const footerLinks = addElement({ id: nextId('footer_links'), type: 'container', tag: 'div', name: 'Footer Menu', parent: footer, style: { base: { layout: { display: 'flex', alignItems: columns ? 'flex-start' : 'center', justifyContent: columns ? 'flex-start' : 'center', gap: footerVariant === 'sitemap' ? '10px' : '16px', flexDirection: footerVariant === 'sitemap' ? 'column' : 'row', flexWrap: 'wrap' } } } });
      (Array.isArray(navConfig.links) ? navConfig.links : []).slice(0, 5).forEach(link => {
        addElement({ id: nextId(`footer_link_${link}`), type: 'link', tag: 'a', name: link, parent: footerLinks, content: { text: link, href: `#${slugifyId(link)}` }, attributes: { href: `#${slugifyId(link)}` }, style: { base: { typography: { fontSize: '13px', fontWeight: '800' }, visual: { color: 'var(--muted)' } } } });
      });
      if (footerVariant === 'newsletter') {
        const signup = addElement({ id: nextId('footer_signup'), type: 'form', tag: 'form', name: 'Footer Signup', parent: footer, style: { base: { layout: { display: 'flex', gap: '10px', flexWrap: 'wrap' }, size: { maxWidth: '420px' } } } });
        addElement({ id: nextId('footer_email'), type: 'input', tag: 'input', name: 'Email Signup', parent: signup, content: { placeholder: 'Email address' }, attributes: { placeholder: 'Email address', type: 'email' }, style: inputStyle() });
        addButton(signup, 'Join', 'primary');
      }
    }

    if (hasAtomicStructure()) {
      blueprint.structure.nodes.forEach(node => addAtomicNode(node, rootId));
    } else {
      if (includeNavigation) addNav();
      blueprint.sections
        .filter(section => section?.type !== 'footer')
        .forEach((section, index) => addSection(section, index));
      if (includeFooter) addFooter();
    }

    const page = {
      id: 'page_home',
      name: 'Home',
      slug: 'index',
      path: 'index.html',
      seo: { title: blueprint.projectName, description: blueprint.sections[0]?.subtitle || blueprint.reply || 'Generated by Nexora AI.', keywords: [], ogImage: null },
      root: rootId,
      elements
    };

    return {
      schema: VISUAL_DOCUMENT_SCHEMA,
      version: '2.0.0',
      document: {
        id: `doc_${Date.now()}`,
        name: blueprint.projectName,
        type: 'website',
        source: { createdBy: 'nexora-ai', prompt: originalPrompt, model: getSelectedOpenRouterModel(), createdAt: new Date().toISOString() }
      },
      settings: { defaultPage: 'page_home', unit: 'px', grid: { enabled: true, size: 8, snap: true }, breakpoints: { desktop: 1200, laptop: 1024, tablet: 768, mobile: 390 } },
      theme: {
        tokens: {
          colors: { background: theme.background, surface: theme.surface, surfaceAlt: theme.surfaceAlt, text: theme.text, muted: theme.muted, primary: theme.primary, accent: theme.accent, border: theme.border },
          gradients: { primary: `linear-gradient(135deg, ${theme.primary}, ${theme.accent})` },
          fonts: { body: 'Inter, system-ui, sans-serif', heading: 'Inter, system-ui, sans-serif' },
          fontSizes: {}, fontWeights: {}, lineHeights: {}, spacing: {}, radii: {}, shadows: { md: theme.shadow }, borders: {}, zIndex: {}, transitions: {}
        },
        modes: { dark: {}, light: {} }
      },
      assets: { images: {}, videos: {}, icons: {}, fonts: {}, files: {} },
      components: {},
      pages: { page_home: page }
    };
  }

  function valueListToMarkdown(items = []) {
    return (Array.isArray(items) ? items : [])
      .map(item => `- ${String(item || '').trim()}`)
      .filter(line => line !== '- ')
      .join('\n');
  }

  function summarizeVisualDocument(visualDocument) {
    const page = getVisualDefaultPage(visualDocument);
    const elements = page?.elements || {};
    const elementList = Object.values(elements);
    return {
      pages: Object.keys(visualDocument.pages || {}).length,
      elements: elementList.length,
      sections: elementList.filter(element => ['hero', 'section', 'navbar', 'footer', 'sidebar', 'main'].includes(element.type)).length,
      breakpoints: Object.keys(visualDocument.settings?.breakpoints || {}).join(', ')
    };
  }

  function createPlanningMarkdown(blueprint = {}, visualDocument = {}, originalPrompt = '') {
    const planning = blueprint.planning || {};
    const summary = summarizeVisualDocument(visualDocument);
    const featureMap = valueListToMarkdown(planning.featureMap || blueprint.livePreview?.sectionOrder || (blueprint.sections || []).map(section => section.title || section.type));
    const responsivePlan = valueListToMarkdown(planning.responsivePlan || ['Mobile, tablet, laptop, and desktop responsive rendering is enforced by the Nexora renderer.']);
    const accessibilityPlan = valueListToMarkdown(planning.accessibilityPlan || ['Semantic tags, readable contrast, focus-safe controls, and scalable spacing.']);
    const designReasoning = valueListToMarkdown(planning.designReasoning || [blueprint.intent?.reasoning || 'The AI selected the layout and structure from the user request.']);
    const filePlan = valueListToMarkdown(planning.filePlan || ['planning.md', 'blueprint.json', 'index.html', 'style.css', 'script.js', 'visual-document.json', 'generation-manifest.json']);

    return `# Generation Plan\n\n## User Request\n${originalPrompt}\n\n## Goal\n${planning.goal || blueprint.projectName || 'Generate a responsive editable website.'}\n\n## AI Interpretation\n${planning.interpretation || blueprint.intent?.reasoning || 'The AI interpreted the request and selected the page structure without predefined platform routes.'}\n\n## Feature / Region Map\n${featureMap || '- AI-authored page regions were generated from the request.'}\n\n## File Plan\n${filePlan}\n\n## Responsive Plan\n${responsivePlan}\n\n## Accessibility Plan\n${accessibilityPlan}\n\n## Design Reasoning\n${designReasoning}\n\n## Render Summary\n- Pages: ${summary.pages}\n- Editable elements: ${summary.elements}\n- Major regions: ${summary.sections}\n- Breakpoints: ${summary.breakpoints || 'desktop, laptop, tablet, mobile'}\n\n## Guardrails Used\n- No local platform-specific clone routes.\n- No predefined clone templates.\n- The AI decides structure, content depth, visual style, and layout from the prompt.\n- Nexora only validates, repairs when needed, and renders the editable output files.`;
  }

  function createGenerationManifest(blueprint = {}, visualDocument = {}, originalPrompt = '') {
    return {
      schema: 'nexora.generation-manifest',
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      model: getSelectedOpenRouterModel(),
      userRequest: originalPrompt,
      projectName: blueprint.projectName || visualDocument.document?.name || 'Generated Website',
      pipeline: [
        'intent-routing',
        'single-ai-atomic-blueprint-generation',
        'ai-atomic-layout-validation',
        'ai-repair-if-atomic-layout-is-incomplete',
        'planning-file-export',
        'blueprint-export',
        'visual-document-render',
        'design-system-contrast-hardening',
        'preview-file-render'
      ],
      constraints: {
        noPredefinedPlatformRoutes: true,
        noLocalCloneTemplates: true,
        universalResponsiveness: ['mobile', 'tablet', 'laptop', 'desktop'],
        aiDecidesStructure: true,
        aiDecidesPlacementAndStylingInJson: true,
        noLocalSectionComposerFallback: true,
        contrastHardening: true,
        noDummyFileProgress: true
      },
      outputs: ['planning.md', 'blueprint.json', 'index.html', 'style.css', 'script.js', 'visual-document.json', 'generation-manifest.json'],
      stats: summarizeVisualDocument(visualDocument)
    };
  }

  function normalizeBlueprintProject(blueprint, originalPrompt) {
    const visualDocument = buildVisualDocumentFromBlueprint(blueprint, originalPrompt);
    const files = renderVisualDocumentToFiles(visualDocument);
    return {
      projectName: visualDocument.document.name,
      reply: blueprint.reply || `I created an editable, responsive website for: "${originalPrompt}".`,
      files,
      visualDocument,
      blueprint,
      planning: createPlanningMarkdown(blueprint, visualDocument, originalPrompt),
      manifest: createGenerationManifest(blueprint, visualDocument, originalPrompt)
    };
  }

  function normalizeWebsiteProject(rawProject, originalPrompt) {
    if (rawProject?.schema === VISUAL_DOCUMENT_SCHEMA || rawProject?.visualDocument?.schema === VISUAL_DOCUMENT_SCHEMA) {
      return normalizeVisualDocumentProject(rawProject.schema === VISUAL_DOCUMENT_SCHEMA ? rawProject : rawProject.visualDocument, originalPrompt);
    }
    if (isAIWebsiteBundlePayload(rawProject)) {
      return normalizeAIWebsiteBundleProject(rawProject, originalPrompt);
    }
    if (isBlueprintPayload(rawProject)) {
      return normalizeBlueprintProject(rawProject, originalPrompt);
    }

    const project = rawProject || {};
    let files = Array.isArray(project.files) ? project.files : [];

    if (!files.length && project.files && typeof project.files === 'object') {
      files = Object.entries(project.files).map(([name, content]) => ({ name, content }));
    }

    files = files
      .filter(file => file && file.name && typeof file.content === 'string')
      .map(file => {
        const safeName = sanitizeGeneratedFileName(file.name, 'index.html');
        const language = file.language || getLanguageFromFileName(safeName);
        return { name: safeName, language, content: file.content };
      });
    files = ensureBundleFilesAreRunnable(files);

    const hasHtml = files.some(file => file.name.toLowerCase().endsWith('.html'));
    if (!hasHtml) {
      throwAtomicBlueprintRequired('The AI returned raw files without index.html and without a complete AI website bundle.');
    }

    const fallbackBundle = {
      schema: AI_WEBSITE_BUNDLE_SCHEMA,
      version: '2.0.0',
      projectName: project.projectName || project.title || titleFromText(originalPrompt) || 'Generated Website',
      reply: project.reply || `I created a responsive website for: "${originalPrompt}". Review the generated files below, then click Preview when you want to inspect it.`,
      planning: project.planning || { goal: originalPrompt, interpretation: 'Recovered from AI-authored raw files.' },
      design: project.design || project.designSpec || { intent: inferWebsiteIntentFromText(originalPrompt), qualityCheck: { recoveredFromRawFiles: true } },
      editModel: project.editModel || { pages: [] },
      files
    };

    const fallbackVisualDocument = project.visualDocument || buildVisualDocumentFromAIBundle(fallbackBundle, files, originalPrompt);
    return {
      projectName: fallbackBundle.projectName,
      reply: fallbackBundle.reply,
      files,
      visualDocument: fallbackVisualDocument,
      blueprint: project.blueprint || fallbackBundle,
      planning: project.planningMarkdown || createPlanningMarkdownFromBundle(project.blueprint || fallbackBundle, fallbackVisualDocument, originalPrompt),
      manifest: project.manifest || createGenerationManifestFromBundle(project.blueprint || fallbackBundle, fallbackVisualDocument, originalPrompt)
    };
  }

  function isPlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
  }

  function isVisualDocumentPayload(value) {
    return value?.schema === VISUAL_DOCUMENT_SCHEMA && (isPlainObject(value.pages) || Array.isArray(value.pages));
  }

  function toKebabCase(value = '') {
    return String(value).replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
  }

  function flattenVisualStyleForCss(style = {}) {
    const source = isPlainObject(style.base) ? style.base : style;
    const flat = {};

    function assign(key, value) {
      if (value === null || value === undefined || value === '') return;
      flat[key] = String(value);
    }

    function walk(group, prefix = '') {
      if (!isPlainObject(group)) return;
      Object.entries(group).forEach(([key, value]) => {
        if (isPlainObject(value)) {
          walk(value, key);
          return;
        }
        if (prefix === 'border') {
          if (key === 'width') assign('borderWidth', value);
          else if (key === 'style') assign('borderStyle', value);
          else if (key === 'color') assign('borderColor', value);
          else if (key === 'radius') assign('borderRadius', value);
          else assign(key, value);
          return;
        }
        if (prefix === 'transform') return;
        if (prefix === 'cursor' && key === 'type') {
          assign('cursor', value);
          return;
        }
        assign(key, value);
      });
    }

    walk(source);

    const transform = source.transform;
    if (isPlainObject(transform)) {
      const parts = [];
      if (transform.raw) parts.push(transform.raw);
      if (transform.translateX || transform.translateY) parts.push(`translate(${transform.translateX || '0'}, ${transform.translateY || '0'})`);
      if (transform.rotate) parts.push(`rotate(${transform.rotate})`);
      if (transform.scaleX || transform.scaleY) parts.push(`scale(${transform.scaleX || 1}, ${transform.scaleY || 1})`);
      if (transform.skewX || transform.skewY) parts.push(`skew(${transform.skewX || '0deg'}, ${transform.skewY || '0deg'})`);
      if (parts.length) flat.transform = parts.join(' ');
      if (transform.transformOrigin) flat.transformOrigin = transform.transformOrigin;
    }

    return flat;
  }

  function cssTextFromVisualStyle(style = {}) {
    return Object.entries(flattenVisualStyleForCss(style))
      .map(([key, value]) => `${toKebabCase(key)}:${value}`)
      .join(';');
  }

  function getVisualDefaultPage(visualDocument) {
    const pages = visualDocument.pages || {};
    const defaultId = visualDocument.settings?.defaultPage;
    return pages[defaultId] || Object.values(pages)[0] || null;
  }

  function getVisualContent(element = {}) {
    const content = element.content || {};
    if (content.svg || content.html || content.customCode) return content.svg || content.html || content.customCode;
    return escapeHTML(content.text || content.label || content.value || '');
  }

  function renderVisualNodeToHTML(elementId, elements = {}) {
    const element = elements[elementId];
    if (!element) return '';

    const tag = element.tag || 'div';
    const attrs = { ...(element.attributes || {}) };
    const content = element.content || {};
    if (content.src) attrs.src = content.src;
    if (content.alt) attrs.alt = content.alt;
    if (content.href) attrs.href = content.href;
    if (content.target) attrs.target = content.target;
    if (content.placeholder) attrs.placeholder = content.placeholder;
    if (content.value && ['input', 'textarea', 'select'].includes(tag)) attrs.value = content.value;
    attrs['data-nx-id'] = element.id || elementId;
    attrs['data-type'] = element.type || attrs['data-type'] || tag;

    const styleText = cssTextFromVisualStyle(element.style || {});
    if (styleText) attrs.style = styleText;

    const attrText = Object.entries(attrs)
      .filter(([key, value]) => key !== 'id' && value !== null && value !== undefined && value !== '')
      .map(([key, value]) => `${key}="${escapeHTML(String(value))}"`)
      .join(' ');
    const openTag = attrText ? `<${tag} ${attrText}>` : `<${tag}>`;
    const voidTags = new Set(['img', 'input', 'br', 'hr', 'meta', 'link', 'source', 'track', 'area', 'base', 'col', 'embed', 'param', 'wbr']);

    if (voidTags.has(tag)) return openTag;

    const childHtml = (element.children || []).map(childId => renderVisualNodeToHTML(childId, elements)).join('');
    return `${openTag}${childHtml || getVisualContent(element)}</${tag}>`;
  }

  function buildVisualThemeCss(visualDocument) {
    const tokens = visualDocument.theme?.tokens || {};
    const colors = tokens.colors || {};
    const themeForCss = normalizeThemeContrast({
      background: colors.background,
      surface: colors.surface,
      surfaceAlt: colors.surfaceAlt,
      text: colors.text,
      muted: colors.muted,
      primary: colors.primary,
      accent: colors.accent,
      border: colors.border,
      mode: colors.mode || 'dark'
    });
    tokens.colors = { ...colors, onPrimary: themeForCss.onPrimary, onSurface: themeForCss.onSurface, onSurfaceAlt: themeForCss.onSurfaceAlt };
    const declarations = [];

    Object.entries(tokens).forEach(([category, values]) => {
      if (!isPlainObject(values)) return;
      Object.entries(values).forEach(([key, value]) => {
        if (value === null || value === undefined || isPlainObject(value)) return;
        declarations.push(`--${key}:${value}`);
        declarations.push(`--${category}-${key}:${value}`);
        if (category.endsWith('s')) declarations.push(`--${category.slice(0, -1)}-${key}:${value}`);
      });
    });

    return `
      :root { ${declarations.join(';')} }
      *, *::before, *::after { box-sizing: border-box; }
      html, body { margin:0; min-height:100%; max-width:100%; overflow-x:hidden; }
      html { color-scheme: dark; }
      html[data-theme="light"] { color-scheme: light; }
      body { position:relative; font-family: var(--body, var(--font-body, Inter, system-ui, sans-serif)); background: var(--background, #0b0c10); color: var(--text, #f8fafc); transition: background-color .22s ease, color .22s ease; }
      img, svg, video, canvas, iframe { max-width:100%; }
      a { color: inherit; }
      button, input, textarea, select { font: inherit; }
      button[data-nx-id], a[data-nx-id], input[data-nx-id], textarea[data-nx-id], select[data-nx-id] { min-height: 40px; }
      input[data-nx-id], textarea[data-nx-id], select[data-nx-id] { color: var(--text); background-color: var(--surface); }
      input::placeholder, textarea::placeholder { color: color-mix(in srgb, var(--text) 62%, transparent); opacity: 1; }
      [data-type="button"][style*="var(--primary"], button[style*="var(--primary"] { color: var(--onPrimary, #15110a) !important; }
      [data-theme-toggle], [data-menu-toggle] { touch-action: manipulation; }
      [data-theme-toggle]:focus-visible, [data-menu-toggle]:focus-visible, a:focus-visible, button:focus-visible { outline:2px solid var(--primary); outline-offset:3px; }
      button, a { transition: transform .2s ease, border-color .2s ease, background-color .2s ease, color .2s ease, opacity .2s ease; }
      button:hover, a:hover { transform: translateY(-1px); }
      [data-nav-links] { transition: opacity .22s ease, transform .22s ease; }
      [data-nx-id] { min-width: 0; position: relative; z-index: 1; }
      [data-nx-id] > * { min-width: 0; }
      header[data-nx-id], section[data-nx-id], footer[data-nx-id], article[data-nx-id], form[data-nx-id] {
        opacity:0;
        transform: translateY(18px);
        transition: opacity .58s cubic-bezier(.22,1,.36,1), transform .58s cubic-bezier(.22,1,.36,1);
      }
      header[data-nx-id].is-visible, section[data-nx-id].is-visible, footer[data-nx-id].is-visible, article[data-nx-id].is-visible, form[data-nx-id].is-visible {
        opacity:1;
        transform:none;
      }
      h1, h2, h3, p { overflow-wrap: anywhere; }
      @media (max-width:1024px) {
        nav[data-nx-id], header[data-nx-id], section[data-nx-id], footer[data-nx-id] { padding-left:24px !important; padding-right:24px !important; }
        [style*="grid-template-columns"] { grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)) !important; }
      }
      @media (max-width:768px) {
        section[data-nx-id], header[data-nx-id] { padding-top:48px !important; padding-bottom:48px !important; }
        [style*="grid-template-columns"] { grid-template-columns:1fr !important; }
        [style*="display:flex"] { flex-wrap:wrap; }
        h1 { font-size: clamp(34px, 12vw, 48px) !important; }
        h2 { font-size: clamp(26px, 9vw, 36px) !important; }
      }
      @media (max-width:430px) {
        nav[data-nx-id], header[data-nx-id], section[data-nx-id], footer[data-nx-id] { padding-left:18px !important; padding-right:18px !important; }
        button, a, input, textarea { max-width:100%; }
      }
      @media (max-width:1024px), (pointer:coarse) {
        header[data-nx-id], section[data-nx-id], footer[data-nx-id], article[data-nx-id], form[data-nx-id] {
          opacity:1 !important;
          transform:none !important;
          transition-duration:.12s !important;
        }
        [style*="animation"] { animation:none !important; }
        [style*="backdrop-filter"] { backdrop-filter:none !important; -webkit-backdrop-filter:none !important; }
      }
      @keyframes nexoraMenuIn {
        from { opacity:0; transform: translateY(-8px); }
        to { opacity:1; transform:none; }
      }
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after { animation:none !important; transition:none !important; scroll-behavior:auto !important; }
        header[data-nx-id], section[data-nx-id], footer[data-nx-id], article[data-nx-id], form[data-nx-id] { opacity:1 !important; transform:none !important; }
      }
    `;
  }

  function buildVisualResponsiveCss(visualDocument) {
    const page = getVisualDefaultPage(visualDocument);
    if (!page) return '';
    const breakpoints = visualDocument.settings?.breakpoints || { laptop: 1024, tablet: 768, mobile: 390 };
    const order = ['laptop', 'tablet', 'mobile'];

    return order.map(name => {
      const max = breakpoints[name];
      if (!max) return '';
      const rules = Object.values(page.elements || {}).map(element => {
        const override = element.responsive?.[name];
        if (!override || !Object.keys(override).length) return '';
        const css = cssTextFromVisualStyle(override.style ? override.style : { base: override })
          .split(';')
          .filter(Boolean)
          .map(rule => `${rule}!important`)
          .join(';');
        return css ? `[data-nx-id="${element.id}"]{${css}}` : '';
      }).filter(Boolean).join('\n');
      return rules ? `@media (max-width:${max}px){${rules}}` : '';
    }).filter(Boolean).join('\n');
  }

  function renderVisualDocumentToFiles(visualDocument) {
    if (NEXORA_VISUAL_DOCUMENT?.renderToFiles) {
      return NEXORA_VISUAL_DOCUMENT.renderToFiles(visualDocument);
    }
    hardenVisualDocumentDesignSystem(visualDocument);
    const page = getVisualDefaultPage(visualDocument);
    if (!page) {
      return [{
        name: 'index.html',
        language: 'html',
        content: '<!DOCTYPE html><html><body><main><h1>Generated document has no page.</h1></main></body></html>'
      }];
    }

    const htmlBody = renderVisualNodeToHTML(page.root || 'el_root', page.elements || {});
    const css = `${buildVisualThemeCss(visualDocument)}\n${buildVisualResponsiveCss(visualDocument)}`;
    const generatedThemeMode = visualDocument.theme?.tokens?.colors?.mode === 'light' ? 'light' : 'dark';
    const js = `(() => {
  if (window.NexoraGeneratedPage?.initialized) {
    window.NexoraGeneratedPage.init();
    return;
  }

  const root = document.documentElement;
  const storageKey = 'nexora-theme';
  const safeStorage = {
    get(key) {
      try { return localStorage.getItem(key); } catch { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch {}
    }
  };
  const savedTheme = safeStorage.get(storageKey);
  const generatedThemeMode = '${generatedThemeMode}';
  const hasThemeToggle = Boolean(document.querySelector('[data-theme-toggle]'));
  const initialTheme = hasThemeToggle && (savedTheme === 'light' || savedTheme === 'dark') ? savedTheme : generatedThemeMode;
  let revealObserver = null;

  function setTheme(theme) {
    root.setAttribute('data-theme', theme);
    safeStorage.set(storageKey, theme);
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      button.textContent = theme === 'light' ? 'Dark' : 'Light';
      button.setAttribute('aria-label', theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
    });
  }

  function initReveals() {
    const nodes = document.querySelectorAll('header[data-nx-id], section[data-nx-id], footer[data-nx-id], article[data-nx-id], form[data-nx-id]');
    if (!('IntersectionObserver' in window)) {
      nodes.forEach(node => node.classList.add('is-visible'));
      return;
    }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    }
    nodes.forEach(node => {
      if (!node.classList.contains('is-visible')) revealObserver.observe(node);
    });
  }

  function init() {
    setTheme(root.getAttribute('data-theme') === 'light' ? 'light' : initialTheme);
    initReveals();
  }

  window.NexoraGeneratedPage = { initialized: true, init, setTheme };

  document.addEventListener('click', event => {
    const themeToggle = event.target.closest('[data-theme-toggle]');
    if (themeToggle) {
      setTheme(root.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
      return;
    }

    const menuToggle = event.target.closest('[data-menu-toggle]');
    if (menuToggle) {
      const nav = document.querySelector('[data-nav-links]');
      const open = !nav?.classList.contains('is-open');
      nav?.classList.toggle('is-open', open);
      menuToggle.setAttribute('aria-expanded', String(open));
    }
  });

  init();
})();`;
    const title = page.seo?.title || visualDocument.document?.name || page.name || 'Generated Website';
    const description = page.seo?.description || 'Generated by Nexora AI.';

    return [
      {
        name: 'index.html',
        language: 'html',
        content: `<!DOCTYPE html>
<html lang="en" data-theme="${generatedThemeMode}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${escapeHTML(description)}">
  <title>${escapeHTML(title)}</title>
  <link rel="stylesheet" href="./style.css">
</head>
<body>
${htmlBody}
<script src="./script.js"></script>
</body>
</html>`
      },
      {
        name: 'style.css',
        language: 'css',
        content: css
      },
      {
        name: 'script.js',
        language: 'javascript',
        content: js
      }
    ];
  }

  function normalizeVisualDocumentProject(visualDocument, originalPrompt) {
    if (!isVisualDocumentPayload(visualDocument)) {
      throw new Error('The generated document was not a valid Nexora Visual Document.');
    }

    const normalizedVisualDocument = NEXORA_VISUAL_DOCUMENT?.normalizeDocument
      ? NEXORA_VISUAL_DOCUMENT.normalizeDocument(visualDocument, { prompt: originalPrompt, projectName: visualDocument.document?.name })
      : visualDocument;
    const files = renderVisualDocumentToFiles(normalizedVisualDocument);
    return {
      projectName: normalizedVisualDocument.document?.name || 'Generated Website',
      reply: `Created a JSON-first editable website for "${originalPrompt}". The Nexora Visual Document is the source of truth; index.html, style.css, and script.js are derived from it.`,
      files,
      visualDocument: normalizedVisualDocument,
      manifest: createGenerationManifest({ projectName: normalizedVisualDocument.document?.name }, normalizedVisualDocument, originalPrompt)
    };
  }

  function findProjectFile(project, extensions) {
    return project.files.find(file => extensions.some(ext => file.name.toLowerCase().endsWith(ext))) || null;
  }

  function composePreviewDocument(project) {
    const htmlFile = findProjectFile(project, ['.html']);
    const cssFiles = project.files.filter(file => file.name.toLowerCase().endsWith('.css'));
    const jsFiles = project.files.filter(file => file.name.toLowerCase().endsWith('.js'));

    let html = htmlFile?.content || '<!DOCTYPE html><html><head><title>Preview</title></head><body></body></html>';

    html = html
      .replace(localStylesheetLinkPattern(), '')
      .replace(localScriptSrcPattern(), '');

    const css = cssFiles.map(file => `\n/* ${file.name} */\n${file.content}`).join('\n');
    const js = jsFiles.map(file => `\n// ${file.name}\n${file.content}`).join('\n');
    const previewGuardCss = `
      *, *::before, *::after { box-sizing: border-box; }
      html, body { min-height: 100%; height: auto; max-width: 100%; overflow-x: hidden; overflow-y: auto; }
      body { margin: 0; min-height: 100vh; }
      img, svg, video, canvas, iframe { max-width: 100%; height: auto; }
      button, input, textarea, select { font: inherit; max-width: 100%; }
      [data-nx-id] { min-width: 0; max-width: 100%; overflow-wrap: anywhere; }
      [data-nx-id] > * { min-width: 0; }
      h1, h2, h3, h4, h5, h6, p { overflow-wrap: anywhere; }
      @media (max-width: 768px) {
        [style*="grid-template-columns"] { grid-template-columns: 1fr !important; }
        [style*="display:flex"] { flex-wrap: wrap; }
      }
    `;

    if (css || previewGuardCss) {
      html = /<\/head>/i.test(html)
        ? html.replace(/<\/head>/i, `<style>${previewGuardCss}\n${css}</style></head>`)
        : `<style>${previewGuardCss}\n${css}</style>${html}`;
    }

    if (js) {
      const safeJs = js.replace(/<\/script/gi, '<\\/script');
      html = /<\/body>/i.test(html)
        ? html.replace(/<\/body>/i, `<script>${safeJs}</script></body>`)
        : `${html}<script>${safeJs}</script>`;
    }

    return html;
  }

  function enablePreviewIframeScrolling(iframe, options = {}) {
    if (!iframe) return;
    iframe.__onPreviewUserScroll = options.onUserScroll || iframe.__onPreviewUserScroll || null;
    if (options.onReady) iframe.__onPreviewReady = options.onReady;
    iframe.setAttribute('scrolling', 'yes');
    if (iframe.__previewScrollEnabled) return;
    iframe.__previewScrollEnabled = true;
    iframe.addEventListener('load', () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc) return;
        const scroller = doc.scrollingElement || doc.documentElement;
        doc.documentElement.style.minHeight = '100%';
        doc.documentElement.style.overflowY = 'auto';
        doc.body.style.minHeight = '100%';
        doc.body.style.overflowY = 'auto';
        const markUserScroll = () => iframe.__onPreviewUserScroll?.();
        doc.addEventListener('wheel', markUserScroll, { passive: true });
        doc.addEventListener('touchmove', markUserScroll, { passive: true });
        doc.addEventListener('pointerdown', markUserScroll, { passive: true });
        iframe.__previewDocumentReady = true;

        const restore = iframe.__pendingScrollRestore;
        if (restore && scroller) {
          requestAnimationFrame(() => {
            scroller.scrollTop = restore.follow ? scroller.scrollHeight : restore.top;
            iframe.__pendingScrollRestore = null;
          });
        }
        iframe.__onPreviewReady?.();
      } catch {
        /* Keep previews working even if a browser blocks iframe document access. */
      }
    });
  }

  function applyPreviewDocumentInPlace(iframe, html, options = {}) {
    if (!iframe) return;
    enablePreviewIframeScrolling(iframe, options);

    const snapshot = getIframeScrollSnapshot(iframe);
    const shouldFollow = options.follow ?? snapshot.nearBottom;
    iframe.__pendingScrollRestore = { top: snapshot.top, follow: shouldFollow };

    try {
      const doc = iframe.contentDocument;
      if (!doc || !doc.body || !doc.head || !iframe.__previewDocumentReady) {
        iframe.srcdoc = html;
        return;
      }

      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const nextHead = parsed.head?.innerHTML || '';
      const nextBody = parsed.body?.innerHTML || '';
      const nextLang = parsed.documentElement?.getAttribute('lang') || 'en';

      doc.documentElement.setAttribute('lang', nextLang);
      if (doc.head.innerHTML !== nextHead) doc.head.innerHTML = nextHead;
      if (doc.body.innerHTML !== nextBody) doc.body.innerHTML = nextBody;
      doc.defaultView?.NexoraGeneratedPage?.init?.();

      const scroller = doc.scrollingElement || doc.documentElement;
      requestAnimationFrame(() => {
        scroller.scrollTop = shouldFollow ? scroller.scrollHeight : snapshot.top;
        iframe.__pendingScrollRestore = null;
      });
    } catch {
      iframe.srcdoc = html;
    }
  }

  function normalizeWebsiteBuildPlan(plan, prompt = '') {
    const items = Array.isArray(plan?.items)
      ? plan.items.map(item => String(item || '').trim()).filter(Boolean).slice(0, 10)
      : [];
    return {
      title: String(plan?.title || titleFromText(prompt) || 'AI website structure').trim(),
      items: items.length ? items : ['The AI structure plan is being recovered from the final generated blueprint.']
    };
  }

  function createWebsiteBuildCard(prompt, buildPlan = null) {
    const workspace = document.createElement('section');
    workspace.className = 'agent-build-output is-building';
    workspace.__activeStreamFileIndex = 0;
    workspace.__generationPrompt = prompt;
    workspace.innerHTML = `
      <div class="agent-build-status" role="status" aria-live="polite">
        <span class="agent-build-spinner" aria-hidden="true"></span>
        <span class="agent-build-title" data-build-meter>Building website…</span>
      </div>
      <div class="agent-build-files" data-file-list></div>
    `;
    setGenerationFileProgress(workspace, [], { replace: true });
    chatMessages.appendChild(workspace);
    scrollToBottom({ force: true });
    return workspace;
  }


  function getBlueprintStreamSummary(streamedJson = '') {
    const projectName = /"projectName"\s*:\s*"([^"]*)"/.exec(streamedJson)?.[1] || 'Website';
    const scale = /"scale"\s*:\s*"([^"]*)"/.exec(streamedJson)?.[1] || 'planning';
    const sections = (streamedJson.match(/"type"\s*:\s*"/g) || []).length;
    return { projectName, scale, sections };
  }

  function tryParseBlueprintFromStream(streamedJson = '') {
    try {
      const parsed = extractJsonFromText(streamedJson);
      return isPlainObject(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  function getPartialBlueprintObjectText(streamedJson = '', key = '') {
    const keyMatch = new RegExp(`"${key}"\\s*:\\s*\\{`, 'i').exec(streamedJson);
    if (!keyMatch) return '';

    const start = streamedJson.indexOf('{', keyMatch.index);
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < streamedJson.length; index += 1) {
      const char = streamedJson[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === '{') depth += 1;
      if (char === '}') {
        depth -= 1;
        if (depth === 0) return streamedJson.slice(start, index + 1);
      }
    }

    return streamedJson.slice(start);
  }

  function getPartialStringArray(streamedJson = '', key = '') {
    const keyMatch = new RegExp(`"${key}"\\s*:\\s*\\[`, 'i').exec(streamedJson);
    if (!keyMatch) return [];
    const start = streamedJson.indexOf('[', keyMatch.index);
    const end = streamedJson.indexOf(']', start);
    const text = streamedJson.slice(start, end === -1 ? streamedJson.length : end + 1);
    return [...text.matchAll(/"((?:\\.|[^"\\])*)"/g)].map(match => decodeJsonStringFragment(match[1])).filter(Boolean);
  }

  function getLiveBlueprintFromStream(streamedJson = '') {
    const parsed = tryParseBlueprintFromStream(streamedJson);
    const summary = getBlueprintStreamSummary(streamedJson);
    const intentText = getPartialBlueprintObjectText(streamedJson, 'intent');
    const themeText = getPartialBlueprintObjectText(streamedJson, 'theme');
    const colorsText = getPartialBlueprintObjectText(streamedJson, 'colors') || themeText;
    const navigationText = getPartialBlueprintObjectText(streamedJson, 'navigation');
    const livePreviewText = getPartialBlueprintObjectText(streamedJson, 'livePreview');

    if (parsed) {
      return {
        projectName: parsed.projectName || summary.projectName,
        scale: parsed.intent?.scale || summary.scale,
        pageType: parsed.intent?.pageType || 'landing',
        theme: normalizeBlueprintTheme(parsed),
        navigation: {
          brand: parsed.navigation?.brand || parsed.projectName || summary.projectName,
          links: Array.isArray(parsed.navigation?.links) ? parsed.navigation.links.slice(0, 4) : []
        },
        livePreview: isPlainObject(parsed.livePreview) ? parsed.livePreview : {},
        structure: isPlainObject(parsed.structure) ? parsed.structure : {},
        sections: Array.isArray(parsed.sections) ? parsed.sections.filter(section => section?.type).slice(0, 12) : []
      };
    }

    const mode = readPartialJsonStringValue(themeText, 'mode') || (/dark/i.test(themeText) ? 'dark' : 'dark');
    const dark = mode !== 'light';
    const readColor = (key, fallback) => {
      const value = readPartialJsonStringValue(colorsText, key);
      return /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|[a-zA-Z]+)$/.test(value) ? value : fallback;
    };

    return {
      projectName: readPartialJsonStringValue(streamedJson, 'projectName') || summary.projectName,
      scale: readPartialJsonStringValue(intentText, 'scale') || summary.scale,
      pageType: readPartialJsonStringValue(intentText, 'pageType') || 'landing',
      theme: {
        background: readColor('background', dark ? '#0b0c10' : '#f7f8fb'),
        surface: readColor('surface', dark ? '#15161c' : '#ffffff'),
        surfaceAlt: readColor('surfaceAlt', dark ? '#1e1f26' : '#eef2f7'),
        text: readColor('text', dark ? '#f8fafc' : '#101827'),
        muted: readColor('muted', dark ? '#94a3b8' : '#64748b'),
        primary: readColor('primary', '#c9a86b'),
        accent: readColor('accent', '#6ee7b7'),
        border: readColor('border', dark ? '#2b2d35' : '#dbe3ef'),
        mode
      },
      navigation: {
        brand: readPartialJsonStringValue(navigationText, 'brand') || readPartialJsonStringValue(streamedJson, 'projectName') || summary.projectName,
        links: getPartialStringArray(navigationText, 'links').slice(0, 4)
      },
      livePreview: {
        layout: readPartialJsonStringValue(livePreviewText, 'layout') || '',
        density: readPartialJsonStringValue(livePreviewText, 'density') || '',
        visualTone: readPartialJsonStringValue(livePreviewText, 'visualTone') || '',
        animationStyle: readPartialJsonStringValue(livePreviewText, 'animationStyle') || '',
        headerStyle: readPartialJsonStringValue(livePreviewText, 'headerStyle') || '',
        footerStyle: readPartialJsonStringValue(livePreviewText, 'footerStyle') || '',
        sectionStyle: readPartialJsonStringValue(livePreviewText, 'sectionStyle') || ''
      },
      structure: {},
      sections: extractBlueprintSectionsFromStream(streamedJson)
    };
  }

  function extractBlueprintSectionsFromStream(streamedJson = '') {
    const sections = [];
    const objectPattern = /\{[\s\S]{0,900}?\}/g;
    let match;
    while ((match = objectPattern.exec(streamedJson)) !== null && sections.length < 10) {
      const text = match[0];
      const type = /"type"\s*:\s*"([^"]+)"/.exec(text)?.[1];
      if (!type || ['website', 'landing', 'portfolio', 'dark', 'light'].includes(type)) continue;
      const title = readPartialJsonStringValue(text, 'title') || type.replace(/[-_]/g, ' ');
      const subtitle = readPartialJsonStringValue(text, 'subtitle') || readPartialJsonStringValue(text, 'body') || '';
      if (!sections.some(section => section.type === type && section.title === title)) {
        sections.push({ type, title, subtitle });
      }
    }

    const sectionsKey = /"sections"\s*:\s*\[/i.exec(streamedJson);
    if (sectionsKey && sections.length < 12) {
      const sectionText = streamedJson.slice(sectionsKey.index);
      const typeMatches = [...sectionText.matchAll(/"type"\s*:\s*"([^"]+)"/g)];
      typeMatches.forEach((typeMatch, index) => {
        if (sections.length >= 12) return;
        const type = typeMatch[1];
        if (!type || ['website', 'landing', 'portfolio', 'dark', 'light'].includes(type)) return;
        const nextIndex = typeMatches[index + 1]?.index ?? sectionText.length;
        const chunkStart = Math.max(0, typeMatch.index - 80);
        const chunk = sectionText.slice(chunkStart, nextIndex);
        const title = readPartialJsonStringValue(chunk, 'title') || type.replace(/[-_]/g, ' ');
        const subtitle = readPartialJsonStringValue(chunk, 'subtitle') || readPartialJsonStringValue(chunk, 'body') || '';
        if (!sections.some(section => section.type === type && section.title === title)) {
          sections.push({ type, title, subtitle });
        }
      });
    }
    return sections;
  }

  function hasLiveBlueprintSignal(streamedJson = '', blueprint = null) {
    return Boolean(
      streamedJson.trim() &&
      (
        /"theme"\s*:/i.test(streamedJson) ||
        /"navigation"\s*:/i.test(streamedJson) ||
        /"structure"\s*:/i.test(streamedJson) ||
        /"sections"\s*:/i.test(streamedJson) ||
        (blueprint && blueprint.structure?.nodes && blueprint.structure.nodes.length) ||
        (blueprint && blueprint.sections && blueprint.sections.length)
      )
    );
  }

  function buildLivePreviewProjectFromStream(streamedJson = '', originalPrompt = '') {
    const blueprint = getLiveBlueprintFromStream(streamedJson);
    if (!hasLiveBlueprintSignal(streamedJson, blueprint)) return null;
    const atomicIntent = /"mode"\s*:\s*"atomic"/i.test(streamedJson) || blueprint.structure?.mode === 'atomic' || (Array.isArray(blueprint.structure?.nodes) && blueprint.structure.nodes.length);
    if (atomicIntent && !(Array.isArray(blueprint.structure?.nodes) && blueprint.structure.nodes.length)) {
      return null;
    }

    const rawBlueprint = {
      schema: VISUAL_BLUEPRINT_SCHEMA,
      version: '1.0.0',
      projectName: blueprint.projectName || titleFromText(originalPrompt),
      reply: 'Website files are being prepared from the streamed blueprint.',
      intent: {
        kind: 'website',
        pageType: blueprint.pageType || 'landing',
        scale: blueprint.scale || 'standard',
        reasoning: 'Partial planning data from streamed JSON.'
      },
      theme: {
        style: blueprint.livePreview?.visualTone || 'premium',
        mode: blueprint.theme?.mode || 'dark',
        colors: {
          background: blueprint.theme?.background,
          surface: blueprint.theme?.surface,
          surfaceAlt: blueprint.theme?.surfaceAlt,
          text: blueprint.theme?.text,
          muted: blueprint.theme?.muted,
          primary: blueprint.theme?.primary,
          accent: blueprint.theme?.accent,
          border: blueprint.theme?.border
        }
      },
      requirements: {
        responsive: ['mobile', 'tablet', 'laptop', 'desktop'],
        notes: ['Recovered from AI output; no extra UI features are forced.']
      },
      navigation: {
        brand: blueprint.navigation?.brand || blueprint.projectName || titleFromText(originalPrompt),
        links: blueprint.navigation?.links?.length ? blueprint.navigation.links : [],
        cta: blueprint.navigation?.cta || ''
      },
      structure: blueprint.structure || {},
      sections: blueprint.sections || []
    };

    const visualDocument = buildVisualDocumentFromBlueprint(rawBlueprint, originalPrompt, {
      fillDefaults: !atomicIntent,
      includeNavigation: true,
      includeFooter: true
    });
    return {
      projectName: visualDocument.document?.name || rawBlueprint.projectName,
      reply: rawBlueprint.reply,
      files: renderVisualDocumentToFiles(visualDocument),
      visualDocument
    };
  }

  function getIframeScrollSnapshot(iframe) {
    try {
      const doc = iframe?.contentDocument;
      const scroller = doc?.scrollingElement || doc?.documentElement;
      if (!scroller) return { top: 0, nearBottom: true };
      return {
        top: scroller.scrollTop,
        nearBottom: scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 36
      };
    } catch {
      return { top: 0, nearBottom: true };
    }
  }

  function renderLiveCompositionMarkup(streamedJson = '') {
    const blueprint = getLiveBlueprintFromStream(streamedJson);
    const theme = blueprint.theme;
    const visibleSections = blueprint.sections;
    const links = blueprint.navigation.links?.length ? blueprint.navigation.links : [];
    const layout = slugifyId(blueprint.livePreview.layout || blueprint.pageType || 'stacked');
    const density = slugifyId(blueprint.livePreview.density || blueprint.scale || 'balanced');

    return `
      <div class="agent-live-page layout-${escapeHTML(layout)} density-${escapeHTML(density)}" style="--live-bg:${escapeHTML(theme.background)};--live-surface:${escapeHTML(theme.surface)};--live-surface-alt:${escapeHTML(theme.surfaceAlt)};--live-text:${escapeHTML(theme.text)};--live-muted:${escapeHTML(theme.muted)};--live-primary:${escapeHTML(theme.primary)};--live-accent:${escapeHTML(theme.accent)};--live-border:${escapeHTML(theme.border)};">
        <div class="agent-live-nav">
          <span>${escapeHTML(blueprint.navigation.brand || blueprint.projectName)}</span>
          ${links.slice(0, 4).map(link => `<i>${escapeHTML(link)}</i>`).join('')}
        </div>
        ${visibleSections.map((section, index) => `
          <article class="agent-live-section ${index === visibleSections.length - 1 ? 'preparing' : 'ready'} ${section.type === 'hero' ? 'hero' : ''}">
            <div class="agent-live-section-type">${escapeHTML(section.type)}</div>
            <h3>${escapeHTML(section.title)}</h3>
            <p>${escapeHTML(section.subtitle || 'Preparing editable elements, spacing, responsive rules, and styles.')}</p>
            <div class="agent-live-element-row">
              ${Array.from({ length: section.type === 'hero' ? 2 : 3 }).map(() => '<span></span>').join('')}
            </div>
          </article>
        `).join('')}
      </div>
    `;
  }

  function getGenerationPipelineFileNames() {
    return ['index.html', 'style.css', 'script.js'];
  }

  function isInternalWebsiteArtifact(fileName = '') {
    return new Set([
      'planning.md',
      'blueprint.json',
      'visual-document.json',
      'generation-manifest.json',
      'nexora.web-project.json',
      'nexora.page-document.json',
      'nexora.universal-page.raw.json'
    ]).has(String(fileName || '').toLowerCase());
  }

  function getUserVisibleWebsiteFiles(files = []) {
    return (Array.isArray(files) ? files : []).filter(file => {
      const name = String(file?.name || '').toLowerCase();
      return !isInternalWebsiteArtifact(name) && !name.startsWith('nexora/');
    });
  }

  function estimateStreamingLines(text = '', divisor = 68) {
    const normalized = String(text || '');
    const explicitLines = normalized.split(/\r?\n/).length;
    const estimated = Math.ceil(normalized.length / divisor);
    return Math.max(1, explicitLines, estimated);
  }

  function getPartialGeneratedFileContent(streamedJson = '', fileName = '') {
    if (!fileName) return '';
    const compactName = streamedJson.indexOf(`"name":"${fileName}"`);
    const spacedName = compactName === -1 ? streamedJson.indexOf(`"name": "${fileName}"`) : compactName;
    if (spacedName === -1) return '';
    const contentMatch = /"content"\s*:\s*"((?:\\.|[^"\\])*)/i.exec(streamedJson.slice(spacedName));
    return contentMatch ? decodeJsonStringFragment(contentMatch[1]) : '';
  }

  function getStreamFileLineEstimate(streamedJson = '', fileName = '') {
    if (fileName === 'planning.md') return estimateStreamingLines(getPartialBlueprintObjectText(streamedJson, 'planning') || streamedJson.slice(0, 900), 80);
    if (fileName === 'blueprint.json') return estimateStreamingLines(streamedJson.slice(0, Math.min(streamedJson.length, 9000)), 82);
    if (fileName === 'visual-document.json') return estimateStreamingLines(getPartialBlueprintObjectText(streamedJson, 'editModel') || streamedJson.slice(0, Math.min(streamedJson.length, 7000)), 82);
    if (fileName === 'generation-manifest.json') return estimateStreamingLines(getPartialBlueprintObjectText(streamedJson, 'manifest') || streamedJson.slice(0, Math.min(streamedJson.length, 5000)), 90);
    const partialContent = getPartialGeneratedFileContent(streamedJson, fileName);
    if (partialContent) return estimateStreamingLines(partialContent, 62);
    return Math.max(1, Math.floor(streamedJson.length / 1400));
  }

  function getFileTypeIconMarkup(fileName = '') {
    const ext = String(fileName || '').split('.').pop().toLowerCase();
    const iconClass = ['html', 'htm'].includes(ext) ? 'html'
      : ext === 'css' ? 'css'
      : ['js', 'mjs', 'cjs'].includes(ext) ? 'js'
      : ext === 'json' ? 'json'
      : ['md', 'markdown'].includes(ext) ? 'md'
      : ['svg', 'png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext) ? 'image'
      : 'file';

    const icons = {
      html: '<svg viewBox="0 0 24 24" focusable="false"><path d="M4.3 2h15.4l-1.4 17.1L12 22 5.7 19.1 4.3 2Z" fill="currentColor" opacity=".28"/><path d="M7.2 6.1h9.7l-.2 2H9.4l.2 2.1h6.9l-.6 6.2-3.9 1.7-3.9-1.7-.3-3.2h2l.2 1.8 2 .8 2-.8.2-2.7H7.9l-.7-6.2Z" fill="currentColor"/></svg>',
      css: '<svg viewBox="0 0 24 24" focusable="false"><path d="M4.3 2h15.4l-1.4 17.1L12 22 5.7 19.1 4.3 2Z" fill="currentColor" opacity=".28"/><path d="M7 6.2h10l-.2 2.1-6.8 2.8h6.5l-.6 5.4-3.9 1.6-3.8-1.6-.3-2.9h2l.2 1.6 1.9.7 2-.7.2-2.1H8l-.2-1.9 6.8-2.9H7.2L7 6.2Z" fill="currentColor"/></svg>',
      js: '<svg viewBox="0 0 24 24" focusable="false"><rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor" opacity=".24"/><path d="M11.4 8h1.9v6.2c0 2.1-1.1 3.1-3 3.1-1.1 0-2-.4-2.6-1.1l1-1.4c.4.4.9.7 1.5.7.8 0 1.2-.4 1.2-1.4V8Zm5.2 9.3c-1.4 0-2.5-.6-3.2-1.5l1.1-1.3c.6.7 1.3 1 2.1 1 .7 0 1.1-.3 1.1-.8 0-.5-.4-.7-1.4-1.1-1.5-.5-2.5-1.2-2.5-2.8 0-1.6 1.3-2.8 3.2-2.8 1.2 0 2.2.4 3 1.2l-1 1.4c-.6-.5-1.2-.8-1.9-.8-.7 0-1.1.3-1.1.8 0 .5.5.7 1.5 1.1 1.6.6 2.4 1.3 2.4 2.8 0 1.7-1.3 2.8-3.3 2.8Z" fill="currentColor"/></svg>',
      json: '<svg viewBox="0 0 24 24" focusable="false"><path d="M9.2 3.5c-2 0-3 1.1-3 3.2v2.1c0 1.5-.5 2.2-1.7 2.2v2c1.2 0 1.7.7 1.7 2.2v2.1c0 2.1 1 3.2 3 3.2h1v-2h-.6c-.9 0-1.3-.5-1.3-1.6v-2.3c0-1.3-.4-2.2-1.3-2.6.9-.4 1.3-1.3 1.3-2.6V7.1c0-1.1.4-1.6 1.3-1.6h.6v-2h-1Zm5.6 0v2h.6c.9 0 1.3.5 1.3 1.6v2.3c0 1.3.4 2.2 1.3 2.6-.9.4-1.3 1.3-1.3 2.6v2.3c0 1.1-.4 1.6-1.3 1.6h-.6v2h1c2 0 3-1.1 3-3.2v-2.1c0-1.5.5-2.2 1.7-2.2v-2c-1.2 0-1.7-.7-1.7-2.2V6.7c0-2.1-1-3.2-3-3.2h-1Z" fill="currentColor"/></svg>',
      md: '<svg viewBox="0 0 24 24" focusable="false"><rect x="2.5" y="5" width="19" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5.5 15V9h2l2 2.4L11.5 9h2v6h-1.8v-3.4l-2.2 2.5-2.2-2.5V15H5.5Zm11-6v3h-1.8l2.8 3.1 2.8-3.1h-1.8V9h-2Z" fill="currentColor"/></svg>',
      image: '<svg viewBox="0 0 24 24" focusable="false"><rect x="3" y="4" width="18" height="16" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="8.2" cy="9" r="1.7" fill="currentColor"/><path d="m5.5 17 4.1-4.1 2.8 2.6 2.1-2 4 3.5H5.5Z" fill="currentColor"/></svg>',
      file: '<svg viewBox="0 0 24 24" focusable="false"><path d="M6 2.8h7l5 5V21H6V2.8Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M13 3v5h5M9 12h6M9 15.5h6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
    };
    return `<span class="agent-file-type-icon is-${iconClass}" aria-hidden="true">${icons[iconClass] || icons.file}</span>`;
  }

  function renderGenerationFileChip(entry = {}) {
    const status = entry.status || 'writing';
    const file = entry.file || { name: entry.name || 'file.txt', content: '' };
    const rawLines = entry.lines || (file.content ? countCodeLines(file.content) : 1);
    const lineText = typeof rawLines === 'number' ? `+${rawLines} lines` : String(rawLines);
    const statusText = status === 'ready' ? 'Ready' : status === 'queued' ? 'Queued' : 'Writing';
    return `
      <div class="agent-file-progress-row ${status === 'writing' ? 'active' : ''}" data-progress-file="${escapeHTML(file.name)}">
        ${getFileTypeIconMarkup(file.name)}
        <span class="agent-file-name">${escapeHTML(file.name)}</span>
        <span class="agent-file-lines">${escapeHTML(lineText)}</span>
        <span class="agent-file-open">${escapeHTML(statusText)}</span>
      </div>
    `;
  }

  function statusRank(status = 'queued') {
    return { queued: 0, writing: 1, ready: 2 }[status] ?? 0;
  }

  function mergeGenerationFileEntries(workspace, incoming = [], { replace = false } = {}) {
    const previous = replace ? [] : (Array.isArray(workspace?.__fileProgressEntries) ? workspace.__fileProgressEntries : []);
    const byName = new Map(previous.map(entry => [entry.file?.name || entry.name, entry]));

    incoming.forEach(entry => {
      const file = entry.file || { name: entry.name || 'file.txt', content: '' };
      const name = file.name || entry.name;
      if (!name) return;
      const existing = byName.get(name);
      if (!existing || statusRank(entry.status) >= statusRank(existing.status)) {
        byName.set(name, { ...existing, ...entry, file: { ...(existing?.file || {}), ...file, name } });
      } else if (entry.lines && !existing.lines) {
        byName.set(name, { ...existing, lines: entry.lines });
      }
    });

    const pipeline = getGenerationPipelineFileNames();
    return [...byName.values()].sort((a, b) => {
      const an = a.file?.name || a.name;
      const bn = b.file?.name || b.name;
      const ai = pipeline.indexOf(an);
      const bi = pipeline.indexOf(bn);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return 0;
    });
  }

  function setGenerationFileProgress(workspace, entries = [], options = {}) {
    const fileList = workspace?.querySelector('[data-file-list]');
    if (!fileList) return;
    const merged = mergeGenerationFileEntries(workspace, entries, options);
    workspace.__fileProgressEntries = merged;
    const previous = fileList.innerHTML;
    const next = merged.map(renderGenerationFileChip).join('');
    if (previous !== next) fileList.innerHTML = next;
    updateComposerPlanFileStats(merged);
  }

  function getActualOutputFilesInPipelineOrder(project) {
    const files = getUserVisibleWebsiteFiles(getProjectOutputFiles(project));
    const byName = new Map(files.map(file => [file.name, file]));
    const ordered = getGenerationPipelineFileNames()
      .map(name => byName.get(name))
      .filter(Boolean);
    const remaining = files.filter(file => !getGenerationPipelineFileNames().includes(file.name));
    return [...ordered, ...remaining];
  }

  async function showActualFileGenerationProgress(workspace, project, signal = null) {
    if (!workspace) return;
    const files = getActualOutputFilesInPipelineOrder(project);
    const buildMeter = workspace.querySelector('[data-build-meter]');
    const rendered = [];
    for (const file of files) {
      if (buildMeter) buildMeter.textContent = `Writing ${file.name}`;
      const entries = rendered.map(doneFile => ({ file: doneFile, status: 'ready' }))
        .concat([{ file, status: 'writing', lines: countCodeLines(file.content) }]);
      setGenerationFileProgress(workspace, entries);
      await wait(90, signal);
      rendered.push(file);
    }
    if (buildMeter) buildMeter.textContent = 'Files ready';
    setGenerationFileProgress(workspace, rendered.map(file => ({ file, status: 'ready' })));
  }

  function updateWebsiteBuildCard(workspace, streamedJson, tokenCount = 0) {
    const fileList = workspace.querySelector('[data-file-list]');
    const buildMeter = workspace.querySelector('[data-build-meter]');
    workspace.__lastStreamedJson = streamedJson;
    workspace.__lastTokenCount = tokenCount;

    if (buildMeter) {
      const summary = getBlueprintStreamSummary(streamedJson || '');
      buildMeter.textContent = tokenCount
        ? `Nexora JSON ${tokenCount} tokens${summary.projectName && summary.projectName !== 'Website' ? ` - ${summary.projectName}` : ''}`
        : 'Starting';
    }

    if (fileList && tokenCount > 0) {
      const entries = [];
      if (/"pages"\s*:/i.test(streamedJson)) entries.push({ name: 'index.html', status: 'queued', lines: 1 });
      if (/"theme"\s*:|"style"\s*:/i.test(streamedJson)) entries.push({ name: 'style.css', status: 'queued', lines: 1 });
      if (/"interactions"\s*:|"animations"\s*:/i.test(streamedJson)) entries.push({ name: 'script.js', status: 'queued', lines: 1 });
      setGenerationFileProgress(workspace, entries);
    }

    scrollToBottom();
  }

  async function parseWebsiteProjectWithAiLayoutRepair(streamedText, originalPrompt, route, buildCard, signal = null) {
    try {
      return parseWebsiteProjectFromStream(streamedText, originalPrompt);
    } catch (error) {
      const firstIssue = error?.message || 'The AI did not return a complete Nexora Visual Document.';
      const buildMeter = buildCard?.querySelector('[data-build-meter]');
      if (buildMeter) buildMeter.textContent = 'Refining Nexora JSON';

      let repairText = '';
      let repairTokens = 0;
      repairText = await streamOpenRouterLocal('website_repair', {
        prompt: originalPrompt,
        intent: route,
        previous: streamedText,
        error: firstIssue
      }, {
        signal,
        onStatus: () => {
          if (buildMeter) buildMeter.textContent = 'AI repairing Nexora JSON';
        },
        onToken: (token, fullText) => {
          repairText = fullText;
          repairTokens += 1;
          if (buildMeter) buildMeter.textContent = `AI repairing Nexora JSON ${repairTokens} tokens`;
          updateWebsiteBuildCard(buildCard, repairText, repairTokens);
        }
      });

      try {
        return parseWebsiteProjectFromStream(repairText, originalPrompt);
      } catch (repairError) {
        const cleanFirst = firstIssue.replace(/^(?:ATOMIC_BLUEPRINT_REQUIRED|WEBSITE_BUNDLE_REQUIRED):\s*/i, '');
        const cleanSecond = (repairError?.message || '').replace(/^(?:ATOMIC_BLUEPRINT_REQUIRED|WEBSITE_BUNDLE_REQUIRED):\s*/i, '');
        throw new Error(`The AI still did not return a complete Nexora Visual Document JSON. First issue: ${cleanFirst}. Repair issue: ${cleanSecond}`);
      }
    }
  }

  function markWebsiteBuildError(workspace, message) {
    if (!workspace) return;
    workspace.classList.add('agent-build-error');
    const buildMeter = workspace.querySelector('[data-build-meter]');
    if (buildMeter) {
      const streamStop = String(message || '').match(/Token receiving stopped[^.]*\./i)?.[0];
      const noTokens = String(message || '').match(/No usable tokens were received[^.]*\./i)?.[0];
      buildMeter.textContent = streamStop || noTokens || 'Build stopped';
    }
    workspace.dataset.error = cleanGenerationErrorMessage(message);
    workspace.classList.add('open');
  }

  function openWebsitePreviewModal(project) {
    document.querySelectorAll('.agent-preview-modal').forEach(modal => modal.remove());

    const modal = document.createElement('div');
    modal.className = 'agent-preview-modal';
    modal.innerHTML = `
      <div class="agent-preview-dialog" role="dialog" aria-modal="true" aria-label="${escapeHTML(project.projectName || 'Generated website')} preview">
        <div class="agent-preview-dialog-toolbar">
          <div>
            <span class="agent-badge">Preview</span>
            <strong>${escapeHTML(project.projectName || 'Generated Website')}</strong>
          </div>
          <div class="agent-preview-controls" role="group" aria-label="Preview viewport">
            <button type="button" class="agent-preview-size-btn" data-preview-size="mobile">Mobile</button>
            <button type="button" class="agent-preview-size-btn" data-preview-size="tablet">Tablet</button>
            <button type="button" class="agent-preview-size-btn" data-preview-size="laptop">Laptop</button>
            <button type="button" class="agent-preview-size-btn active" data-preview-size="desktop">Desktop</button>
          </div>
          <button type="button" class="agent-preview-close" data-close-preview>Close</button>
        </div>
        <div class="agent-preview-stage" data-preview-stage data-size="desktop">
          <iframe title="Generated website preview" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"></iframe>
        </div>
      </div>
    `;

    function closePreviewDialog() {
      document.removeEventListener('keydown', handlePreviewKeydown);
      modal.remove();
    }

    function handlePreviewKeydown(event) {
      if (event.key === 'Escape') closePreviewDialog();
    }

    modal.addEventListener('click', event => {
      if (event.target === modal || event.target.closest('[data-close-preview]')) {
        closePreviewDialog();
        return;
      }

      const sizeButton = event.target.closest('[data-preview-size]');
      if (sizeButton) {
        const size = sizeButton.getAttribute('data-preview-size') || 'desktop';
        modal.querySelector('[data-preview-stage]')?.setAttribute('data-size', size);
        modal.querySelectorAll('[data-preview-size]').forEach(button => {
          button.classList.toggle('active', button === sizeButton);
        });
      }
    });

    document.addEventListener('keydown', handlePreviewKeydown);
    document.body.appendChild(modal);

    const iframe = modal.querySelector('iframe');
    enablePreviewIframeScrolling(iframe);
    if (project.agentic && project.previewUrl) {
      iframe.src = project.previewUrl;
    } else {
      applyPreviewDocumentInPlace(iframe, composePreviewDocument(project), { follow: true });
    }
  }

  function openWebsitePreviewDialog(project) {
    ensureChatMode();
    const workspace = document.createElement('section');
    workspace.className = 'agent-build-compact agent-build-complete';
    workspace.innerHTML = `
      <div class="agent-build-complete-bar">
        <div class="agent-build-complete-title">
          <span class="agent-build-chevron done">ok</span>
          <span>
            <strong>Saved website preview</strong>
            <small>${escapeHTML(project.projectName || 'Generated Website')}</small>
          </span>
        </div>
        <div class="agent-code-dialog-actions">
          ${project.visualDocument || (project.files || []).some(file => String(file.name || '').toLowerCase().endsWith('.html')) ? '<button type="button" class="agent-preview-pill primary" data-open-editor>Edit it</button>' : ''}
          ${(project.files || []).length ? '<button type="button" class="agent-preview-pill" data-download-agent>Download ZIP</button>' : ''}
          <button type="button" class="agent-preview-pill" data-open-preview aria-expanded="false">Preview</button>
        </div>
      </div>
    `;
    chatMessages.appendChild(workspace);
    workspace.querySelector('[data-open-preview]')?.addEventListener('click', () => openWebsitePreviewModal(project));
    workspace.querySelector('[data-open-editor]')?.addEventListener('click', () => openGeneratedProjectInEditor(project));
    workspace.querySelector('[data-download-agent]')?.addEventListener('click', () => downloadAgentArtifact(project));
    openWebsitePreviewModal(project);
  }

  async function copyTextToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      return copied;
    }
  }

  function openCodeFileDialog(file) {
    document.querySelectorAll('.agent-code-modal').forEach(modal => modal.remove());

    const modal = document.createElement('div');
    modal.className = 'agent-code-modal';
    modal.innerHTML = `
      <div class="agent-code-dialog" role="dialog" aria-modal="true" aria-label="${escapeHTML(file.name)} code">
        <div class="agent-code-dialog-toolbar">
          <div>
            <span class="agent-badge">${escapeHTML(file.language || 'file')}</span>
            <strong>${escapeHTML(file.name)}</strong>
          </div>
          <div class="agent-code-dialog-actions">
            <button type="button" class="agent-action-btn primary" data-copy-code>Copy code</button>
            <button type="button" class="agent-action-btn" data-close-code>Close</button>
          </div>
        </div>
        <pre class="agent-code-dialog-body"><code></code></pre>
      </div>
    `;

    modal.querySelector('code').textContent = file.content;

    function closeCodeDialog() {
      document.removeEventListener('keydown', handleCodeKeydown);
      modal.remove();
    }

    function handleCodeKeydown(event) {
      if (event.key === 'Escape') closeCodeDialog();
    }

    modal.addEventListener('click', async event => {
      if (event.target === modal || event.target.closest('[data-close-code]')) {
        closeCodeDialog();
        return;
      }

      const copyButton = event.target.closest('[data-copy-code]');
      if (copyButton) {
        const copied = await copyTextToClipboard(file.content);
        copyButton.textContent = copied ? 'Copied' : 'Copy failed';
        setTimeout(() => (copyButton.textContent = 'Copy code'), 1200);
      }
    });

    document.addEventListener('keydown', handleCodeKeydown);
    document.body.appendChild(modal);
  }

  function getEditorUrl(handoffId = '') {
    // Production deployments expose the editor through the canonical /editor rewrite.
    // The old ../editor/index.html path resolves to /editor/index.html from /chat, which is
    // not a configured Vercel route and was a source of broken deployed handoffs.
    const url = window.location.protocol === 'file:'
      ? new URL('../editor/index.html', window.location.href)
      : new URL('/editor', window.location.origin);
    if (handoffId) url.searchParams.set('handoff', handoffId);
    return url.href;
  }

  function safeJsonStringify(value) {
    try { return JSON.stringify(value); } catch { return ''; }
  }

  function compactEditorHandoffPayload(payload = {}) {
    const project = payload.project || {};
    const webProject = payload.webProject || project.webProject || null;
    const pageDocument = payload.pageDocument || project.pageDocument || null;
    const universalPage = payload.universalPage || project.universalPage || null;
    const visualDocument = payload.visualDocument || project.visualDocument || null;
    const projectName = payload.projectName || project.projectName || webProject?.project?.name || pageDocument?.meta?.title || visualDocument?.document?.name || universalPage?.page?.title || 'Generated Website';
    const compactProject = {
      projectName,
      reply: project.reply || payload.reply || '',
      webProject,
      pageDocument,
      universalPage,
      visualDocument: webProject || pageDocument || universalPage ? null : visualDocument,
      files: Array.isArray(project.files) ? project.files : (Array.isArray(payload.files) ? payload.files : []),
      agentic: Boolean(project.agentic || payload.agentic),
      agentProjectId: project.agentProjectId || payload.agentProjectId || null,
      agentRunId: project.agentRunId || payload.agentRunId || null,
      previewUrl: project.previewUrl || payload.previewUrl || null,
      manifest: project.manifest || payload.manifest || null,
      planning: project.planning || payload.planning || ''
    };
    return {
      schema: 'nexora.editor-handoff',
      version: '5.0.0',
      projectName,
      webProject,
      pageDocument,
      universalPage,
      visualDocument: webProject || pageDocument || universalPage ? null : visualDocument,
      project: compactProject,
      source: payload.source || 'chat-open-generated-project',
      savedAt: new Date().toISOString()
    };
  }

  function setStorageItemVerified(store, key, value) {
    try {
      store.removeItem(key);
      store.setItem(key, value);
      return store.getItem(key) === value;
    } catch {
      return false;
    }
  }

  async function writeEditorHandoffPayload(payload) {
    const compactPayload = compactEditorHandoffPayload(payload);
    const json = safeJsonStringify(compactPayload);
    if (!json) return { ok: false, reason: 'serialize' };

    // Prefer IndexedDB: generated websites routinely exceed Web Storage quotas once the
    // canonical project, preview metadata and files grow. A short token travels in the URL;
    // the structured project itself remains same-origin and never enters the query string.
    try {
      if (window.NexoraEditorHandoff?.save) {
        const saved = await window.NexoraEditorHandoff.save(compactPayload);
        if (saved?.id) return { ok: true, handoffId: saved.id, transport: saved.transport || 'indexeddb', byteLength: saved.byteLength || json.length };
      }
    } catch (error) {
      console.warn('[Nexora] IndexedDB editor handoff unavailable; using Web Storage fallback.', error);
    }

    // Compatibility fallback for private browsing / restricted IndexedDB environments.
    // Clear only old handoff aliases after the IndexedDB attempt so a failed large write
    // never destroys a still-valid pending payload before a replacement exists.
    [EDITOR_HANDOFF_STORAGE_KEY, GENERATED_PROJECT_STORAGE_KEY, WEB_PROJECT_STORAGE_KEY, PAGE_DOCUMENT_STORAGE_KEY, UNIVERSAL_PAGE_STORAGE_KEY, VISUAL_DOCUMENT_STORAGE_KEY].forEach(key => {
      try { window.sessionStorage?.removeItem(key); } catch {}
      try { window.localStorage?.removeItem(key); } catch {}
    });

    try {
      if (window.sessionStorage && setStorageItemVerified(window.sessionStorage, EDITOR_HANDOFF_STORAGE_KEY, json)) return { ok: true, handoffId: '', transport: 'sessionStorage', byteLength: json.length };
    } catch {}
    try {
      if (window.localStorage && setStorageItemVerified(window.localStorage, EDITOR_HANDOFF_STORAGE_KEY, json)) return { ok: true, handoffId: '', transport: 'localStorage', byteLength: json.length };
    } catch {}

    // Last-resort canonical-source-only fallback. This is deliberately smaller than the full
    // bundle and preserves editability even when legacy payload duplication would overflow.
    if (compactPayload.webProject) {
      const webProjectJson = safeJsonStringify(compactPayload.webProject);
      try { if (window.sessionStorage && setStorageItemVerified(window.sessionStorage, WEB_PROJECT_STORAGE_KEY, webProjectJson)) return { ok: true, handoffId: '', transport: 'sessionStorage:webProject', byteLength: webProjectJson.length }; } catch {}
      try { if (window.localStorage && setStorageItemVerified(window.localStorage, WEB_PROJECT_STORAGE_KEY, webProjectJson)) return { ok: true, handoffId: '', transport: 'localStorage:webProject', byteLength: webProjectJson.length }; } catch {}
    }

    return { ok: false, reason: 'storage-full' };
  }

  async function openVisualDocumentInEditor(visualDocument) {
    if (!isVisualDocumentPayload(visualDocument)) return;
    const handoff = await writeEditorHandoffPayload({
      schema: 'nexora.editor-handoff',
      version: '5.0.0',
      projectName: visualDocument.document?.name || 'Generated Website',
      visualDocument,
      universalPage: null,
      source: 'chat-open-visual-document'
    });
    if (!handoff.ok) {
      showNexoraToast('Editor handoff failed because browser storage is unavailable or full. Export the ZIP as a fallback.', 'error', 8000);
      return;
    }
    window.location.assign(getEditorUrl(handoff.handoffId));
  }

  async function openGeneratedProjectInEditor(project) {
    if (!project) return;
    const compactProject = {
      projectName: project.projectName || project.title || 'Generated Website',
      reply: project.reply || project.description || '',
      webProject: project.webProject || null,
      pageDocument: project.pageDocument || null,
      universalPage: project.universalPage || null,
      visualDocument: project.visualDocument || null,
      files: Array.isArray(project.files) ? project.files : [],
      agentic: Boolean(project.agentic),
      agentProjectId: project.agentProjectId || null,
      agentRunId: project.agentRunId || null,
      previewUrl: project.previewUrl || null,
      manifest: project.manifest || null,
      planning: project.planning || ''
    };
    const handoff = await writeEditorHandoffPayload({
      schema: 'nexora.editor-handoff',
      version: '5.0.0',
      projectName: compactProject.projectName,
      webProject: compactProject.webProject,
      pageDocument: compactProject.pageDocument,
      universalPage: compactProject.universalPage,
      visualDocument: compactProject.visualDocument,
      project: compactProject,
      source: 'chat-open-generated-project'
    });

    if (!handoff.ok) {
      showNexoraToast('Editor handoff failed because browser storage is unavailable or full. Export the ZIP as a fallback.', 'error', 8000);
      return;
    }
    window.location.assign(getEditorUrl(handoff.handoffId));
  }

  function createStoredZipBlob(files = []) {
    const encoder = new TextEncoder();
    const crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      crcTable[n] = c >>> 0;
    }
    const crc32 = bytes => {
      let c = 0xFFFFFFFF;
      for (const byte of bytes) c = crcTable[(c ^ byte) & 0xFF] ^ (c >>> 8);
      return (c ^ 0xFFFFFFFF) >>> 0;
    };
    const u16 = value => new Uint8Array([value & 0xFF, (value >>> 8) & 0xFF]);
    const u32 = value => new Uint8Array([value & 0xFF, (value >>> 8) & 0xFF, (value >>> 16) & 0xFF, (value >>> 24) & 0xFF]);
    const chunks = [];
    const central = [];
    let offset = 0;
    const add = (target, ...parts) => { parts.forEach(part => target.push(part)); };
    for (const file of files) {
      const safeName = String(file.name || 'file.txt').replace(/\\/g, '/').replace(/^\/+/, '') || 'file.txt';
      const nameBytes = encoder.encode(safeName);
      const data = encoder.encode(String(file.content || ''));
      const crc = crc32(data);
      const localHeader = [];
      add(localHeader,
        u32(0x04034B50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), nameBytes
      );
      const localLength = localHeader.reduce((sum, part) => sum + part.length, 0);
      chunks.push(...localHeader, data);
      const centralHeader = [];
      add(centralHeader,
        u32(0x02014B50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0),
        u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes
      );
      central.push(...centralHeader);
      offset += localLength + data.length;
    }
    const centralSize = central.reduce((sum, part) => sum + part.length, 0);
    const centralOffset = offset;
    chunks.push(...central);
    chunks.push(
      u32(0x06054B50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(centralSize), u32(centralOffset), u16(0)
    );
    return new Blob(chunks, { type: 'application/zip' });
  }

  async function downloadAgentArtifact(project) {
    const files = getProjectOutputFiles(project);
    if (!files.length) {
      showNexoraToast('No generated files are available to package.', 'error', 5000);
      return;
    }
    try {
      const blob = createStoredZipBlob(files);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${String(project?.projectName || 'nexora-project').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'nexora-project'}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (error) {
      showNexoraToast(`ZIP export failed: ${error?.message || error}`, 'error', 6000);
    }
  }

  function getVisualDocumentSummary(visualDocument) {
    const page = isVisualDocumentPayload(visualDocument) ? getVisualDefaultPage(visualDocument) : null;
    const elements = page?.elements || {};
    const elementList = Object.values(elements);
    return {
      sections: elementList.filter(element => ['hero', 'section', 'navbar', 'footer'].includes(element.type)).length,
      elements: elementList.length,
      pageName: page?.name || 'Home'
    };
  }

  function getProjectOutputFiles(project) {
    const files = Array.isArray(project.files) ? [...project.files] : [];
    const prepend = [];

    if (project.planning && !files.some(file => file.name === 'planning.md')) {
      prepend.push({ name: 'planning.md', language: 'markdown', content: project.planning });
    }

    if (project.blueprint && !files.some(file => file.name === 'blueprint.json')) {
      prepend.push({ name: 'blueprint.json', language: 'json', content: JSON.stringify(project.blueprint, null, 2) });
    }

    if (project.webProject && !files.some(file => file.name === 'nexora.web-project.json')) {
      prepend.push({ name: 'nexora.web-project.json', language: 'json', content: JSON.stringify(project.webProject, null, 2) });
    }

    if (project.universalPage && !files.some(file => file.name === 'nexora.universal-page.raw.json')) {
      prepend.push({ name: 'nexora.universal-page.raw.json', language: 'json', content: JSON.stringify(project.universalPage, null, 2) });
    }

    if (project.pageDocument && !files.some(file => file.name === 'nexora.page-document.json')) {
      prepend.push({ name: 'nexora.page-document.json', language: 'json', content: JSON.stringify(project.pageDocument, null, 2) });
    }

    if (project.visualDocument && !project.pageDocument && !files.some(file => file.name === 'visual-document.json')) {
      files.push({
        name: 'visual-document.json',
        language: 'json',
        content: JSON.stringify(project.visualDocument, null, 2)
      });
    }

    if (project.manifest && !files.some(file => file.name === 'generation-manifest.json')) {
      files.push({ name: 'generation-manifest.json', language: 'json', content: JSON.stringify(project.manifest, null, 2) });
    }

    return [...prepend, ...files];
  }

  function persistGeneratedWebsiteProject(project, outputFiles = getProjectOutputFiles(project)) {
    return createProjectRecord({
      title: project.projectName || 'Generated Website',
      description: project.reply || 'Generated by Nexora Website Agent',
      files: outputFiles,
      webProject: project.webProject || null,
      pageDocument: project.pageDocument || null,
      visualDocument: project.webProject || project.pageDocument ? null : (project.visualDocument || null),
      generatedProject: {
        projectName: project.projectName || 'Generated Website',
        reply: project.reply || '',
        files: project.files || [],
        webProject: project.webProject || null,
        pageDocument: project.pageDocument || null,
        universalPage: project.universalPage || null,
        visualDocument: project.webProject || project.pageDocument ? null : (project.visualDocument || null),
        blueprint: project.blueprint || null,
        modules: project.modules || null,
        planning: project.planning || '',
        manifest: project.manifest || null,
        agentic: Boolean(project.agentic),
        agentProjectId: project.agentProjectId || null,
        agentRunId: project.agentRunId || null,
        previewUrl: project.previewUrl || null
      },
      kind: 'generated-website'
    }).then((savedProject) => {
      if (savedProject?.id) {
        if (activeChatId) linkActiveConversationToProject(savedProject.id);
        else pendingProjectLinkId = savedProject.id;
      }
      renderProjects();
      renderLibrary();
      return savedProject;
    }).catch(error => {
      alert(formatDatabaseIssue('Generated project save failed', error));
      return null;
    });
  }

  function renderWebsiteWorkspace(project, existingWorkspace = null) {
    currentGeneratedProject = project;
    const workspace = existingWorkspace || document.createElement('section');
    workspace.className = 'agent-build-output is-complete';
    const outputFiles = getProjectOutputFiles(project);
    const visibleOutputFiles = getUserVisibleWebsiteFiles(outputFiles);

    workspace.innerHTML = `
      <div class="agent-output-actions" aria-label="Website actions">
        <span><strong>${escapeHTML(project.projectName || 'Generated Website')}</strong> · ${visibleOutputFiles.length} files</span>
        <div class="agent-code-dialog-actions">
          ${project.webProject || project.pageDocument || project.visualDocument || outputFiles.some(file => String(file.name || '').toLowerCase().endsWith('.html')) ? '<button type="button" class="agent-preview-pill primary" data-open-editor>Edit it</button>' : ''}
          ${(project.files || []).length ? '<button type="button" class="agent-preview-pill" data-download-agent>Download ZIP</button>' : ''}
          <button type="button" class="agent-preview-pill" data-open-preview aria-expanded="false">Preview</button>
        </div>
      </div>
      <div class="agent-build-files" data-file-list>
      </div>
    `;

    if (!existingWorkspace) chatMessages.appendChild(workspace);

    const fileList = workspace.querySelector('[data-file-list]');
    const aggregatedChanges = aggregateFileChanges(project.manifest?.changes);

    visibleOutputFiles.forEach((file) => {
      const change = aggregatedChanges.find(item => String(item?.path || item?.name || '') === String(file.name || '')) || null;
      const diffText = change && (Number(change.lines_added ?? change.added_lines ?? 0) || Number(change.lines_removed ?? change.removed_lines ?? 0))
        ? `+${Number(change.lines_added ?? change.added_lines ?? 0)} −${Number(change.lines_removed ?? change.removed_lines ?? 0)}`
        : `+${countCodeLines(file.content)} lines`;
      const output = document.createElement('article');
      output.className = 'agent-inline-file-output';
      output.innerHTML = `
        <header>
          <span>${getFileTypeIconMarkup(file.name)}<strong>${escapeHTML(file.name)}</strong><small>${escapeHTML(diffText)}</small></span>
          <span class="agent-inline-file-actions">
            <button type="button" data-toggle-inline-file aria-expanded="false">View code</button>
            <button type="button" data-copy-inline-file>Copy</button>
          </span>
        </header>
        <pre hidden tabindex="0" aria-label="${escapeHTML(file.name)} code"><code></code></pre>
      `;
      output.querySelector('code').textContent = String(file.content || '');
      output.querySelector('[data-toggle-inline-file]').addEventListener('click', event => {
        const pre = output.querySelector('pre');
        const opening = pre.hasAttribute('hidden');
        pre.toggleAttribute('hidden', !opening);
        event.currentTarget.setAttribute('aria-expanded', String(opening));
        event.currentTarget.textContent = opening ? 'Hide code' : 'View code';
        if (opening) pre.focus({ preventScroll: true });
      });
      output.querySelector('[data-copy-inline-file]').addEventListener('click', async event => {
        const copied = await copyTextToClipboard(String(file.content || ''));
        event.currentTarget.textContent = copied ? 'Copied' : 'Copy failed';
        setTimeout(() => { if (event.currentTarget) event.currentTarget.textContent = 'Copy'; }, 1400);
      });
      fileList.appendChild(output);
    });

    workspace.querySelector('[data-open-preview]').addEventListener('click', () => {
      openWebsitePreviewModal(project);
    });

    workspace.querySelector('[data-open-editor]')?.addEventListener('click', () => {
      openGeneratedProjectInEditor(project);
    });

    workspace.querySelector('[data-download-agent]')?.addEventListener('click', () => {
      downloadAgentArtifact(project);
    });

    const visibleChanges = aggregatedChanges.filter(change => !isInternalWebsiteArtifact(change?.path || change?.name));
    updateComposerPlanFileStats(visibleOutputFiles.map(file => ({ file, status: 'ready', lines: countCodeLines(file.content) })), visibleChanges);
    if (composerPlanTracker?.__plan?.length) {
      syncConversationPlanCard(composerPlanTracker.__plan.map(step => ({ ...step, status: 'passed' })));
    }

    persistGeneratedWebsiteProject(project, outputFiles);

    scrollToBottom();
  }

  async function rememberChatTurn(userText, assistantText) {
    let conversationId = activeChatId;
    const chatTitle = titleFromText(userText);

    if (!conversationId) {
      if (supabaseClient && appState.user?.id) {
        const { data, error } = await supabaseClient
          .from('conversations')
          .insert({ user_id: appState.user.id, title: chatTitle, updated_at: new Date().toISOString() })
          .select()
          .maybeSingle();
        if (error || !data) {
          const issue = error || new Error('Conversation insert did not return a row.');
          recordDatabaseError('conversations.insert', issue);
          throw issue;
        }
        conversationId = data?.id;
        if (data) conversationList.unshift(data);
      }

      if (!conversationId && !supabaseClient) {
        conversationId = `local-chat-${Date.now()}`;
        conversationList.unshift({ id: conversationId, title: chatTitle, created_at: new Date().toISOString() });
      }

      if (!conversationId) return;

      activeChatId = conversationId;
      chatDatabase[conversationId] = [];
    }

    const turn = [
      { sender: 'user', role: 'user', text: userText },
      { sender: 'assistant', role: 'assistant', text: assistantText }
    ];

    chatDatabase[conversationId] = chatDatabase[conversationId] || [];
    chatDatabase[conversationId].push(...turn.map(item => ({ sender: item.sender, text: item.text })));

    if (supabaseClient && !String(conversationId).startsWith('local-')) {
      const { error } = await supabaseClient.from('messages').insert(turn.map(item => ({
        conversation_id: conversationId,
        role: item.role,
        content: item.text
      })));
      if (error) {
        recordDatabaseError('messages.insert', error);
        throw error;
      }

      const now = new Date().toISOString();
      const { data: updatedConversation, error: conversationUpdateError } = await supabaseClient
        .from('conversations')
        .update({ updated_at: now })
        .eq('id', conversationId)
        .eq('user_id', appState.user.id)
        .select('id,user_id,project_id,title,created_at,updated_at')
        .maybeSingle();
      if (conversationUpdateError) {
        recordDatabaseError('conversations.update_timestamp', conversationUpdateError);
      }
      const listIndex = conversationList.findIndex(item => item.id === conversationId);
      if (listIndex >= 0) {
        conversationList[listIndex] = { ...(conversationList[listIndex] || {}), ...(updatedConversation || {}), updated_at: updatedConversation?.updated_at || now };
        const [item] = conversationList.splice(listIndex, 1);
        conversationList.unshift(item);
      }

      if (pendingProjectLinkId) {
        const projectId = pendingProjectLinkId;
        pendingProjectLinkId = null;
        await linkActiveConversationToProject(projectId);
      }
    } else {
      const listIndex = conversationList.findIndex(item => item.id === conversationId);
      if (listIndex >= 0) {
        conversationList[listIndex].updated_at = new Date().toISOString();
        const [item] = conversationList.splice(listIndex, 1);
        conversationList.unshift(item);
      }
    }

    renderHistoryList();
    persistWorkspace();
  }


  // 10. MODULAR JSON WEBSITE GENERATION PIPELINE
  function requireModularPipeline() {
    if (!NEXORA_MODULAR_PIPELINE) {
      throw new Error('Nexora modular JSON pipeline is missing. Make sure shared/nexora-modular-json-pipeline.js is loaded before app.js.');
    }
    return NEXORA_MODULAR_PIPELINE;
  }

  function getModularGenerationPipelineFileNames() {
    return ['index.html', 'style.css', 'script.js'];
  }

  function setModularBuildProgress(workspace, activeName, readyNames = [], details = '') {
    if (!workspace) return;
    const buildMeter = workspace.querySelector('[data-build-meter]');
    if (buildMeter) buildMeter.textContent = details || activeName || 'Preparing modular JSON';
    const entries = getModularGenerationPipelineFileNames().map(name => ({
      name,
      status: readyNames.includes(name) ? 'ready' : (name === activeName ? 'writing' : 'queued'),
      lines: readyNames.includes(name) ? 'validated' : (name === activeName ? 'generating' : 'queued')
    }));
    setGenerationFileProgress(workspace, entries, { replace: true });
  }

  function sanitizeOpenRouterJsonPayload(payload = {}) {
    const clean = { ...payload };
    Object.keys(clean).forEach(key => clean[key] === undefined && delete clean[key]);
    return clean;
  }

  async function callOpenRouterJsonModule(kind, context = {}, { signal = null, maxTokens = 4500, temperature = 0.34, retries = 1 } = {}) {
    const pipeline = requireModularPipeline();
    if (!shouldUseOpenRouterProxy() && !hasBrowserOpenRouterKey()) {
      throw new Error(`OpenRouter API key is missing. ${getOpenRouterConnectionHelp()}`);
    }

    let previousText = '';
    let previousError = '';

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const repairMode = attempt > 0;
      const prompt = repairMode
        ? [
            'Repair this failed Nexora JSON module. Return only one valid JSON object.',
            `Target module kind: ${kind}`,
            `Validation or parse error: ${previousError}`,
            `Original module prompt: ${pipeline.getModulePrompt(kind, context)}`,
            `Previous invalid response: ${String(previousText || '').slice(0, 18000)}`
          ].join('\n')
        : pipeline.getModulePrompt(kind, context);

      const body = sanitizeOpenRouterJsonPayload({
        model: getSelectedOpenRouterModel(),
        stream: false,
        temperature: repairMode ? 0.08 : temperature,
        max_tokens: repairMode ? Math.min(maxTokens + 900, 6500) : maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: pipeline.getSystemPrompt() },
          { role: 'user', content: prompt }
        ]
      });

      const response = await fetch(getOpenRouterEndpoint(), {
        method: 'POST',
        signal: signal || undefined,
        headers: getOpenRouterHeaders(),
        body: JSON.stringify(body)
      }).catch(error => {
        if (error?.name === 'AbortError') throw error;
        throw new Error(`Could not connect to OpenRouter. ${error?.message || 'Failed to fetch'}. ${getOpenRouterConnectionHelp()}`);
      });

      const text = await response.text();
      if (!response.ok) {
        throw new Error(getOpenRouterErrorMessage(text, response.status));
      }

      let content = '';
      try {
        const apiPayload = JSON.parse(text);
        content = apiPayload.choices?.[0]?.message?.content || apiPayload.choices?.[0]?.delta?.content || '';
      } catch {
        content = text;
      }
      previousText = content;

      try {
        const parsed = pipeline.extractJson(content);
        const issue = pipeline.validateModule(kind, parsed);
        if (issue) throw new Error(issue);
        return parsed;
      } catch (error) {
        previousError = error?.message || 'Module JSON parse failed.';
        if (attempt >= retries) throw new Error(`${kind} module failed validation: ${previousError}`);
      }
    }

    throw new Error(`${kind} module failed validation.`);
  }

  function buildProjectManifestModule(prompt, route = {}) {
    const pipeline = requireModularPipeline();
    const projectName = pipeline.titleFromPrompt(prompt);
    return {
      schema: pipeline.schemas.manifest,
      version: pipeline.version,
      project: {
        id: pipeline.makeId('project', projectName),
        name: projectName,
        type: 'website',
        description: `Generated from: ${prompt}`,
        createdBy: 'nexora-ai',
        sourcePrompt: prompt
      },
      output: {
        finalDocument: 'nexora.visual-document.json',
        html: 'index.html',
        css: 'style.css',
        js: 'script.js'
      },
      generation: {
        mode: 'modular-json',
        schemaVersion: pipeline.version,
        route,
        requiresValidation: true,
        requiresCompilation: true,
        allowRawHtml: false,
        allowRawCss: false,
        allowRawJs: false
      },
      metadata: {
        language: 'en',
        direction: 'ltr',
        defaultPage: 'page_home',
        createdAt: new Date().toISOString()
      }
    };
  }

  function readFirstPlannedPage(plan = {}) {
    const pages = Array.isArray(plan.pages) ? plan.pages : (Array.isArray(plan.plan?.pages) ? plan.plan.pages : []);
    return pages[0] || null;
  }

  function readSectionSpecsFromPlan(plan = {}, route = {}) {
    const page = readFirstPlannedPage(plan);
    const sections = Array.isArray(page?.sections) ? page.sections : [];
    if (sections.length) return sections;
    throw new Error('generation.plan.json did not include any page sections. Nexora cannot continue without AI-authored structure.');
  }

  function summarizeSectionBundle(bundle = {}) {
    const section = bundle.section || {};
    return {
      id: section.id || '',
      name: section.name || section.type || '',
      type: section.type || '',
      children: Array.isArray(section.children) ? section.children.length : 0,
      elements: Array.isArray(bundle.elements) ? bundle.elements.length : 0
    };
  }

  function createGenerationMarkdownFromModules(modules = {}, visualDocument = {}, originalPrompt = '') {
    const sectionNames = (modules.sections || []).map(sectionDoc => sectionDoc.section?.name || sectionDoc.section?.id).filter(Boolean);
    return `# Nexora Modular JSON Generation\n\n## User Request\n${originalPrompt}\n\n## Source of Truth\nThe website was generated as modular JSON files and compiled into \`nexora.visual-document.json\`. The HTML, CSS, and JavaScript files are derived artifacts only.\n\n## Modules Generated\n- project.manifest.json\n- generation.plan.json\n- theme.tokens.json\n- site.map.json\n- page.<id>.json\n- section.<id>.json\n- element.<id>.json\n- interactions.json\n- assets.json\n- data.sources.json\n- compile.map.json\n\n## Sections\n${sectionNames.map(name => `- ${name}`).join('\n') || '- Sections were compiled from the generated plan.'}\n\n## Final Document\n- Schema: ${visualDocument.schema || 'nexora.visual-document'}\n- Version: ${visualDocument.version || '4.0.0'}\n- Pages: ${Object.keys(visualDocument.pages || {}).length}\n- Editable elements: ${Object.values(visualDocument.pages || {}).reduce((sum, page) => sum + Object.keys(page.elements || {}).length, 0)}\n`;
  }

  function createModularGenerationManifest(modules = {}, visualDocument = {}, originalPrompt = '') {
    return {
      schema: 'nexora.modular-generation.manifest',
      version: '4.0.0',
      generatedAt: new Date().toISOString(),
      sourceOfTruth: 'nexora.visual-document.json',
      moduleMode: 'small-json-files',
      rawHtmlAsSource: false,
      rawCssAsSource: false,
      rawJsAsSource: false,
      prompt: originalPrompt,
      projectName: visualDocument.document?.name || modules.manifest?.project?.name || 'Generated Website',
      modules: {
        pages: (modules.pages || []).length,
        sections: (modules.sections || []).length,
        elements: (modules.elements || []).length,
        interactions: (modules.interactions?.interactions || []).length
      },
      pipeline: [
        'generation.plan.json',
        'theme.tokens.json',
        'site.map.json',
        'page.<id>.json',
        'section.bundle per section',
        'module split and validation',
        'compile.map.json',
        'nexora.visual-document.json',
        'derived index.html/style.css/script.js'
      ]
    };
  }

  function getVisualGenerationTokenBudget(route = {}, prompt = '') {
    const scale = route.scale || 'standard';
    // Keep enough completion headroom for atomic nodes + structured styling/motion without
    // encouraging runaway JSON. The repair pass gets additional room below.
    const budgets = { sample: 3600, simple: 5000, standard: 7000, rich: 9600, full: 12400 };
    const base = budgets[scale] || budgets.standard;
    if (isProductUiRequest(prompt, route.pageType)) return Math.min(base + 1800, 14200);
    return base;
  }

  function recommendedElementRangeForRoute(route = {}, prompt = '') {
    const scale = route.scale || 'standard';
    const product = isProductUiRequest(prompt, route.pageType);
    const ranges = {
      sample: [6, 12],
      simple: [10, 20],
      standard: [18, 34],
      rich: [26, 52],
      full: [32, 64]
    };
    const base = ranges[scale] || ranges.standard;
    if (!product) return base;
    return [Math.max(base[0], scale === 'full' ? 30 : 22), Math.max(base[1], scale === 'full' ? 64 : 44)];
  }

  function hardMinimumElementsForRoute(route = {}, prompt = '') {
    const scale = route.scale || 'standard';
    const product = isProductUiRequest(prompt, route.pageType);
    const base = { sample: 3, simple: 4, standard: 5, rich: 6, full: 8 }[scale] || 5;
    return product ? Math.max(base, 8) : base;
  }

  function minElementsForRoute(route = {}, prompt = '') {
    // Legacy display helper. This is no longer a hard build blocker.
    return recommendedElementRangeForRoute(route, prompt)[0];
  }

  function visualDocumentTextIndex(visualDocument = {}) {
    const parts = [];
    Object.values(visualDocument.pages || {}).forEach(page => {
      Object.values(page.elements || {}).forEach(element => {
        if (!element) return;
        parts.push(element.id, element.type, element.name, element.tag, element.text);
        const content = element.content || {};
        ['text', 'label', 'placeholder', 'alt', 'href', 'icon'].forEach(key => content[key] && parts.push(content[key]));
      });
    });
    return parts.filter(Boolean).join(' ').toLowerCase();
  }

  function containsGeneratedMarkupText(value = '') {
    const text = String(value || '');
    return /<\s*\/?\s*(?:a|article|aside|blockquote|button|div|em|form|h[1-6]|header|img|input|label|li|main|nav|ol|option|p|section|select|span|strong|table|td|th|tr|ul)\b[^>]*>/i.test(text)
      || /&lt;\s*\/?\s*(?:a|button|div|h[1-6]|img|li|option|p|section|select|span|strong)\b[^&]*&gt;/i.test(text);
  }

  function generationMotionExpectation(originalPrompt = '', route = {}) {
    const text = `${String(route.buildBrief || '')} ${String(originalPrompt || '')}`.toLowerCase();
    if (/\b(?:no|without|disable|disabled|avoid)\s+(?:animations?|motion|transitions?)\b|\bstatic\s+(?:only|design|page)\b/.test(text)) return 'none';
    if (/\b(?:animations?|motion|transition|3d|parallax|fade|slide|reveal|microinteraction|micro-interaction|hover effect|scroll effect)\b/.test(text)) return 'explicit';
    return 'baseline';
  }

  function visualTreeDepth(page = {}) {
    const elements = page.elements || {};
    const visit = (id, seen = new Set()) => {
      if (!id || seen.has(id) || !elements[id]) return 0;
      const next = new Set(seen); next.add(id);
      const children = Array.isArray(elements[id].children) ? elements[id].children : [];
      return 1 + Math.max(0, ...children.map(child => visit(typeof child === 'string' ? child : child?.id, next)));
    };
    return visit(page.root);
  }

  function collectVisualDocumentQualityWarnings(visualDocument = {}, originalPrompt = '', route = {}) {
    const warnings = [];
    const page = getVisualDefaultPage(visualDocument);
    const elements = Object.values(page?.elements || {});
    const [recommendedMin, recommendedMax] = recommendedElementRangeForRoute(route, originalPrompt);
    if (elements.length && elements.length < recommendedMin) {
      warnings.push(`Generated ${elements.length} editable elements; recommended range starts around ${recommendedMin} for this request. Rendering still continues because the JSON is usable.`);
    }
    if (elements.length > recommendedMax + 18) {
      warnings.push(`Generated ${elements.length} editable elements; this is rich but may consume more tokens than necessary.`);
    }
    const styled = elements.filter(element => element?.style && JSON.stringify(element.style).length > 36).length;
    if (elements.length && styled < Math.ceil(elements.length * 0.42)) {
      warnings.push('Some elements have light styling. Nexora will still render them, but stronger styles in the prompt can improve visual polish.');
    }
    const textIndex = visualDocumentTextIndex(visualDocument);
    if (isProductUiRequest(originalPrompt, route.pageType)) {
      const hasProductAnatomy = /feed|story|post|sidebar|profile|suggestion|reel|video|player|rail|cart|product|checkout|dashboard|metric|chart|table|inbox|workspace|timeline|playlist|channel|message|notification|search|nav|menu|auth|form/.test(textIndex);
      const genericOnly = /hero|features|pricing|testimonial|cta|get started|learn more/.test(textIndex) && !hasProductAnatomy;
      if (!hasProductAnatomy || genericOnly) warnings.push('The generated structure may be too generic for a clone/interface request, but it was not blocked.');
    }
    const responsive = elements.filter(element => element?.responsive && Object.keys(element.responsive).length).length;
    if (elements.length >= 12 && responsive < 2) warnings.push('Only a small number of nodes contain explicit responsive overrides; Nexora generation fallbacks will cover common grids/flex layouts, but authored responsive rules are preferable.');
    const motion = elements.filter(element => Array.isArray(element?.animations) && element.animations.length).length;
    if (generationMotionExpectation(originalPrompt, route) !== 'none' && motion < 2) warnings.push('The model authored little motion; Nexora generation defaults will add restrained entrance motion to major sections.');
    return warnings;
  }

  function visualDocumentQualityIssue(visualDocument = {}, originalPrompt = '', route = {}) {
    if (!isVisualDocumentPayload(visualDocument)) return 'The response is not a Nexora Visual Document with editable pages.';
    const page = getVisualDefaultPage(visualDocument);
    if (!page || !page.root || !isPlainObject(page.elements)) return 'The visual document has no renderable default page/root/elements.';
    const elements = Object.values(page.elements || {});
    const hardMinimum = hardMinimumElementsForRoute(route, originalPrompt);
    if (elements.length < hardMinimum) return `Only ${elements.length} editable elements were generated; ${hardMinimum}+ are required to safely render this request.`;

    const markupText = elements.filter(element => containsGeneratedMarkupText(element?.text || element?.content?.text || ''));
    if (markupText.length) {
      const ids = markupText.slice(0, 4).map(element => element.id || element.name || 'unknown').join(', ');
      return `The model embedded HTML-like markup inside ordinary text nodes (${ids}). Every heading, paragraph, strong/span, option, button, image, card field and list item must be a real editable JSON node.`;
    }
    const markdownText = elements.filter(element => /(?:^|\s)\*\*[^*\n]{1,180}\*\*(?:\s|$)|(?:^|\s)#{1,6}\s+\S/.test(String(element?.text || '')));
    if (markdownText.length) return 'The model embedded markdown formatting inside visible text. Rich emphasis/headings must be semantic editable nodes, not markdown strings.';
    const oversizedText = elements.filter(element => String(element?.text || '').length > 900 && !['pre','code'].includes(String(element?.tag || '').toLowerCase()));
    if (oversizedText.length) return `The generated page collapsed multiple semantic blocks into oversized text on ${oversizedText[0].id || 'a node'}. Split distinct content into atomic child nodes.`;

    const depth = visualTreeDepth(page);
    if (elements.length >= 12 && depth < 3) return 'The generated page is too flat. Visible sections, cards, form controls and content groups must be represented as a nested editable node hierarchy.';

    const styled = elements.filter(element => element?.style && JSON.stringify(element.style).length > 18).length;
    if (styled < Math.max(2, Math.ceil(elements.length * 0.24))) return 'The generated page has almost no element-level styling, so the preview would be unstyled.';
    const responsive = elements.filter(element => element?.responsive && Object.keys(element.responsive).length).length;
    if (elements.length >= 16 && responsive === 0) return 'The generated page contains no editable responsive rules. Major layout containers must define tablet/mobile behavior.';

    const motionExpectation = generationMotionExpectation(originalPrompt, route);
    const motion = elements.filter(element => Array.isArray(element?.animations) && element.animations.length).length;
    if (motionExpectation === 'explicit' && motion < 2) return 'The build brief explicitly requires motion/animation/3D effects, but the generated project does not contain enough editable motion definitions.';
    if (motionExpectation === 'baseline' && elements.length >= 12 && motion === 0) return 'The generated project contains no editable motion at all. Nexora websites require restrained section motion unless the brief explicitly requests a static page.';

    const files = renderVisualDocumentToFiles(visualDocument);
    const html = files.find(file => file.name === 'index.html')?.content || '';
    const css = files.find(file => file.name === 'style.css')?.content || '';
    if (!html.includes('data-nx-id')) return 'The derived preview does not contain editable render nodes.';
    if (!/style=|--background|grid|flex|padding|border-radius|background|color/i.test(`${html}
${css}`)) {
      return 'The derived preview does not contain enough styling/positioning CSS to render a complete website.';
    }
    return '';
  }

  function buildUniversalVisualDocumentPrompt(originalPrompt, route = {}, repairContext = null) {
    const [targetMin, targetMax] = recommendedElementRangeForRoute(route, originalPrompt);
    const scale = route.scale || 'standard';
    const pageType = route.pageType || 'custom';
    const compactSchema = `{
  "schema": "nexora.universal-page",
  "version": "4.5.0",
  "page": {
    "title": "Generated website title",
    "language": "en",
    "description": "SEO description",
    "styles": {
      "body": { "margin": "0", "background": "#...", "color": "#..." },
      ":root": { "--primary": "#...", "--surface": "#..." },
      "@keyframes fadeUp": { "0%": { "opacity": "0", "transform": "translateY(18px)" }, "100%": { "opacity": "1", "transform": "none" } },
      "@media (max-width: 768px)": { "[data-nx-id='root_page_home']": { "padding": "12px" } }
    },
    "elements": [
      {
        "id": "stable_snake_case_id",
        "tag": "section",
        "type": "section",
        "name": "Editable layer name",
        "attrs": { "aria-label": "..." },
        "styles": { "display": "grid", "position": "relative", "width": "100%", "minHeight": "100vh", "padding": "24px", "background": "#fff", "overflow": "hidden", "transition": "all .25s ease" },
        "text": "optional text",
        "children": []
      }
    ]
  }
}`;
    const rules = [
      'Return exactly one COMPLETE JSON object only. No markdown, no comments, no code fences, no explanation.',
      'The JSON must be parseable by JSON.parse. Use double quotes for every key/string. No trailing commas. No incomplete arrays. No JavaScript expressions. No comments.',
      'Use the universal atomic JSON shape above: page.styles + recursive page.elements. This is the only source of truth.',
      'Do NOT output the older pages/elements object-map schema. Do NOT output files, HTML, CSS, or JavaScript as source of truth.',
      'Nexora will derive exactly three runnable files from this JSON: index.html links ./style.css in the head and ./script.js before body close. Your JSON must contain enough styles, content, hierarchy, and interactions for those derived files to render without missing connections.',
      'Keep the JSON compact enough to finish. Target the requested interface with useful density, not unnecessary repetition.',
      `Recommended editable element range: ${targetMin}-${targetMax}. This is a target range, not a reason to add filler or duplicate elements.`,
      'Every visible node must be an object in page.elements or nested children. Use stable lowercase snake_case ids so the editor can persist, select, drag, resize, and reorder every atomic layer.',
      'Children must be full child element objects nested in children arrays, not orphaned id strings, class names, selector strings, or prose. A parent container must include the children that should visibly render inside it.',
      'Every visible node must include its own styles object. Text nodes need typography/color/spacing. Containers need layout/size/spacing/visual/position/overflow when useful.',
      'Do not rely on disconnected class selectors or JavaScript-created primary content. Global selectors in page.styles are allowed only for body, :root, keyframes, media queries, and small helper behavior; visible layout must be represented on the element objects.',
      'Use simple CSS property names in styles: display, gridTemplateColumns, flexDirection, position, top, left, width, height, minHeight, padding, margin, background, color, border, borderRadius, boxShadow, fontSize, fontWeight, lineHeight, transition, animation, transform, overflow, zIndex, etc.',
      'Use children arrays for nested structure. Do not require parent ids; Nexora will add editor parent/child links automatically.',
      'Use page.styles only for body, :root variables, keyframes, media queries, and cross-page global helpers. Do not rely on class names for visible styling.',
      'Images must never use broken local filenames. For avatars, stories, thumbnails, reels, dashboards, charts, and product previews, prefer styled divs, gradients, emoji/icon text, inline SVG, or safe absolute/data URLs when truly needed.',
      'For clone/similar requests, build recognizable interface anatomy from the requested product/category. Never return a generic landing page for a clone request.',
      'Instagram/social clone anatomy should include app shell/sidebar or mobile nav, search, story rail, feed posts, media blocks, action rows, captions, profile/suggestions, and responsive adaptation.',
      'Dashboard anatomy should include sidebar/header/metric cards/charts/tables/activity. Ecommerce should include filters/product grid/prices/badges/cart CTA. Portfolio should include hero/work/about/skills/contact.',
      'Use realistic copy and component density. Avoid lorem ipsum.',
      'Include animations/transitions only when useful using CSS strings in element.styles and @keyframes in page.styles.',
      'For tablet, mobile, pointer: coarse, and prefers-reduced-motion, disable nonessential animation, heavy filters, long transitions, parallax, and looping decorative motion.',
      'Make the result desktop-polished and responsive; add mobile-friendly layout with @media rules or responsive-friendly CSS values.',
      'No predefined Nexora template, no fallback hero/features/pricing unless the user explicitly requested that kind of landing page.'
    ];
    if (repairContext) {
      rules.unshift('This is a repair pass. Return a fresh COMPLETE valid JSON object, not a patch, not a continuation, and not a summary.');
      rules.push(`Validation/parse issue to fix: ${repairContext.issue}`);
      rules.push(`Previous invalid response head/tail for context: ${String(repairContext.previous || '').slice(0, 6000)}\n---TAIL---\n${String(repairContext.previous || '').slice(-6000)}`);
    }
    return [
      `User request: ${originalPrompt}`,
      `Detected page type: ${pageType}`,
      `Requested scale: ${scale}`,
      `Target JSON shape: ${compactSchema}`,
      ...rules
    ].join('\n');
  }

  function getWebsiteGenerationHistory(route = {}) {
    const history = getActiveConversationHistoryForAi();
    return history.map(item => ({ role: item.role, content: item.content }));
  }

  function buildCanonicalGenerationContext(originalPrompt = '', route = {}) {
    return {
      contractVersion: NEXORA_WEB_PROJECT?.AI_CONTRACT_VERSION || 'unknown',
      action: route.action || 'build_website',
      goal: route.goal || '',
      projectName: route.projectName || '',
      pageType: route.pageType || 'custom',
      scale: route.scale || 'standard',
      latestUserMessage: String(originalPrompt || ''),
      resolvedBuildBrief: String(route.buildBrief || originalPrompt || ''),
      briefCoverage: Array.isArray(route.briefCoverage) ? route.briefCoverage : [],
      plan: Array.isArray(route.plan) ? route.plan : [],
      qualityPolicy: {
        sourceOfTruth: WEB_PROJECT_SCHEMA,
        atomicNodeTree: true,
        textFieldsPlainTextOnly: true,
        embeddedHtmlInTextForbidden: true,
        markdownInTextForbidden: true,
        semanticFormOptionsAsNodes: true,
        semanticEmphasisAsNodes: true,
        responsiveMajorLayoutsRequired: true,
        motionPolicy: generationMotionExpectation(originalPrompt, route),
        structuredMotionEffects: true,
        motionTriggerTargetEffectModel: true,
        waapiRuntimeCompilation: true,
        arbitraryStandardsCss: true,
        gradientsFiltersMasksAnd3D: true,
        reducedMotionRequired: true,
        compilerMustSucceedBeforeAccept: true
      },
      existingProject: route.currentProject ? {
        projectName: route.currentProject.projectName || route.currentProject.webProject?.project?.name || '',
        sourceOfTruth: route.currentProject.sourceOfTruth || route.currentProject.manifest?.sourceOfTruth || '',
        revision: route.currentProject.webProject?.project?.revision || '',
        hasCanonicalWebProject: Boolean(route.currentProject.webProject?.schema === WEB_PROJECT_SCHEMA)
      } : null
    };
  }

  function stampCanonicalProjectContext(webProject, latestUserMessage = '', route = {}, mode = 'build') {
    if (!webProject?.project) return webProject;
    const existingMetadata = isPlainObject(webProject.project.metadata) ? webProject.project.metadata : {};
    const existingNexora = isPlainObject(existingMetadata.nexora) ? existingMetadata.nexora : {};
    webProject.project.metadata = {
      ...existingMetadata,
      nexora: {
        ...existingNexora,
        sourceOfTruth: WEB_PROJECT_SCHEMA,
        contractVersion: NEXORA_WEB_PROJECT?.AI_CONTRACT_VERSION || null,
        buildBriefVersion: route.buildBriefVersion || 'nexora.build-brief/1.0',
        mode,
        latestUserMessage: String(latestUserMessage || '').slice(0, 16000),
        buildBrief: String(route.buildBrief || latestUserMessage || '').slice(0, 64000),
        briefCoverage: Array.isArray(route.briefCoverage) ? route.briefCoverage.slice(0, 12) : [],
        plan: Array.isArray(route.plan) ? route.plan.slice(0, 16) : [],
        model: getActiveProviderModelId(),
        updatedAt: new Date().toISOString()
      }
    };
    webProject.project.updatedAt = new Date().toISOString();
    return webProject;
  }

  function buildPageDocumentPrompt(originalPrompt, route = {}, repairContext = null) {
    const [targetMin, targetMax] = recommendedElementRangeForRoute(route, originalPrompt);
    const model = getActiveProviderModelId();
    if (!NEXORA_WEB_PROJECT?.getAuthoringContract) {
      throw new Error('Nexora Web Project AI authoring contract is unavailable. Reload the application and try again.');
    }
    const contract = NEXORA_WEB_PROJECT.getAuthoringContract({
      model,
      pageType: route.pageType || 'custom',
      targetMin,
      targetMax
    });
    const generationContext = buildCanonicalGenerationContext(originalPrompt, route);
    const rules = [
      'Return exactly one COMPLETE JSON object only. No markdown, comments, code fences, prose, or trailing text.',
      `The schema/version must be exactly ${WEB_PROJECT_SCHEMA} ${NEXORA_WEB_PROJECT.VERSION || '1.0.0'} and must follow authoring contract ${contract.contractVersion}.`,
      'The JSON must parse with JSON.parse: double quotes only, no trailing commas, comments, undefined, NaN, functions, or JavaScript expressions.',
      'Treat RESOLVED BUILD BRIEF as authoritative. Conversation history is supporting context; never discard an explicit decision already captured in the brief.',
      'Prefer recursive pages[].nodes with complete child objects. Nexora owns normalization into the indexed node graph.',
      'For element-local behavior, PREFER inline node.interactions. Do not manually write targetNodeId for an inline interaction; Nexora binds it to the owning node and adds the canonical backlink.',
      'For state.toggle/state.increment/state.set, always provide a semantic stateId. Prefer stateType/stateDefault or state:{id,type,default} on first use. Nexora deterministically creates a missing state declaration.',
      'Use global logic.interactions only for genuinely shared/cross-node behavior. Cross-reference ids must exactly match generated ids.',
      'Prefer navigate.path for simple static navigation. Use routeId only when route identity is important. Never invent undeclared route ids.',
      'Do not reference assets/components/functions you did not define. Prefer safe direct URLs/placeholders when no project asset is supplied.',
      'Every visible node must remain property-editable: arbitrary kebab-case CSS strings, responsive rules, motion, accessibility metadata and semantic content.',
      'CRITICAL ATOMICITY RULE: text is PLAIN TEXT ONLY. Never put <p>, <strong>, <span>, <option>, <img>, <button>, <div>, any escaped HTML, markdown **bold**, or a sequence of semantic blocks into text. Create real child node objects for each distinct element.',
      'Select controls must own individual option child nodes. Statistics must use separate value/label nodes. Cards must own image/action/content child nodes. Rich emphasis uses strong/em/span child nodes, never markup strings.',
      'Do not collapse an entire section into one text field. The node hierarchy must be deep enough that the visual editor can select and restyle every meaningful part independently.',
      'Unless the brief explicitly says no animation/motion, major sections must use restrained motion.enter and interactive elements should use motion.hover and/or motion.effects. For advanced motion use declarative trigger → target → keyframes → timing effects; use scroll/view effects for parallax/reveal/progress behavior and project motion.timelines for coordinated sequences. Do not build animation systems inside custom JavaScript.',
      'Major grids, row layouts, navigation/content groups and hero regions must contain explicit tablet/mobile responsive overrides. Do not rely only on desktop CSS.',
      'Represent complete visual styling in JSON: solid/linear/radial/conic gradients, color variables, shadows, masks/clip-path, filters/backdrop-filter, blend modes, transitions, transforms, perspective/preserve-3d, grid/flex/container layout, pseudo states, keyframes and responsive/support/container/layer conditions. Arbitrary standards CSS declarations are valid data.',
      'Use reduced-motion-safe behavior. Animation must never be required to access information or controls.',
      'Use declarative actions before scripts.customBlocks/logic.functions. Custom JavaScript is an escape hatch only and must never construct primary layout/content.',
      'Keep ids stable, semantic, lowercase snake_case, unique across the project, and reuse exact ids for unavoidable cross-references.',
      'Build the complete expected product anatomy for the requested interface, never a generic fallback landing page.',
      `Aim for ${targetMin}-${targetMax} meaningful editable nodes unless the actual product requires a different density.`
    ];
    if (repairContext) {
      rules.unshift('REPAIR PASS: Return a fresh COMPLETE corrected nexora.web-project object, not a patch, continuation, diff, explanation, or partial fragment.');
      rules.push(`STRICT VALIDATION DIAGNOSTIC: ${String(repairContext.issue || 'Invalid canonical project')}`);
      if (Array.isArray(repairContext.diagnostics) && repairContext.diagnostics.length) {
        rules.push(`DETERMINISTIC RECONCILIATION DIAGNOSTICS: ${JSON.stringify(repairContext.diagnostics.slice(0, 40))}`);
      }
      rules.push(`PREVIOUS INVALID RESPONSE EXCERPT:\n${String(repairContext.previous || '').slice(0, 7000)}\n---TAIL---\n${String(repairContext.previous || '').slice(-7000)}`);
    }
    return [
      'NEXORA CANONICAL GENERATION CONTEXT:',
      JSON.stringify(generationContext, null, 2),
      '',
      'RESOLVED BUILD BRIEF:',
      String(route.buildBrief || originalPrompt || ''),
      '',
      'NEXORA AI AUTHORING CONTRACT (runtime-owned; this is the accepted structure):',
      JSON.stringify(contract, null, 2),
      '',
      'GENERATION RULES:',
      ...rules.map((rule, index) => `${index + 1}. ${rule}`)
    ].join('\n');
  }

  async function callConfiguredProviderWebProject(originalPrompt, route = {}, { signal = null, repairContext = null, onProgress = null } = {}) {
    const config = getAgentRuntimeConfig();
    if (!config.modelId) {
      throw new Error('AI model is not configured. Open Settings → Agentic AI Runtime and select a model.');
    }
    if (config.provider !== 'codex' && !config.apiKey) {
      throw new Error(`AI provider is not configured. Open Settings → Agentic AI Runtime and add the required API key for ${providerLabel(config.provider)}.`);
    }
    if (config.provider === 'codex' && !codexRuntimeState.connected) {
      throw new Error('ChatGPT Codex is not connected. Open Settings → Agentic AI Runtime → Connect ChatGPT.');
    }

    const maxTokens = Math.min(getVisualGenerationTokenBudget(route, originalPrompt) + (repairContext ? 1600 : 0), 15800);
    const system = `You are Nexora's canonical structured-website generator operating under AI authoring contract ${NEXORA_WEB_PROJECT?.AI_CONTRACT_VERSION || 'current'}. Return one complete strict nexora.web-project JSON object only. The JSON is the editable website AST/IR and persistence source of truth, never a container for HTML snippets or precompiled files. Every meaningful visible piece must be a real recursive node and ordinary text must stay plain. Nexora owns graph normalization, referential reconciliation, validation, context-preserving revisions, editor derivation, and deterministic HTML/CSS/JavaScript compilation. Author production-quality semantic structure, cohesive design tokens, arbitrary standards-based CSS, explicit responsive behavior, accessibility, declarative state/interactions, and structured trigger-target-effect/timeline motion that can compile to CSS and the Web Animations API. Use gradients, filters, masks, 3D transforms and scroll/view motion only when they serve the brief; always preserve usable reduced-motion behavior. Never output markdown, legacy Nexora schemas, opaque layout/animation scripts, raw website files as source, secrets, protected brand assets, or generic fallback pages.`;
    const prompt = buildPageDocumentPrompt(originalPrompt, route, repairContext);
    let contentTokenCount = 0;
    let reasoningTokens = 0;
    let latestStatus = '';
    const startedAt = Date.now();

    const text = await streamConfiguredProviderChat(prompt, {
      signal,
      system,
      history: [], // The resolved brief and canonical context are authoritative; avoid duplicate generated artifacts.
      jsonMode: true,
      route,
      temperature: repairContext ? 0.08 : (['rich', 'full'].includes(route.scale) ? 0.34 : 0.28),
      maxTokens,
      onStatus: (status, detail = {}) => {
        latestStatus = String(status || 'Generating canonical web project…');
        onProgress?.({
          status: latestStatus,
          phase: detail?.phase || 'GENERATE',
          provider: config.provider,
          model: config.modelId
        });
      },
      onReasoning: info => {
        reasoningTokens = Math.max(reasoningTokens, Number(info?.tokens || 0));
        onProgress?.({
          status: info?.status || latestStatus || 'Reasoning…',
          reasoningTokens,
          provider: config.provider,
          model: config.modelId
        });
      },
      onUsage: usage => {
        onProgress?.({ usage, reasoningTokens, provider: config.provider, model: config.modelId });
      },
      onToken: (token, fullText) => {
        contentTokenCount += 1;
        onProgress?.({
          token,
          fullText,
          contentTokenCount,
          rawLength: String(fullText || '').length,
          provider: config.provider,
          model: config.modelId
        });
      }
    });

    const cleanText = String(text || '').trim();
    const diagnostic = cleanText
      ? `Configured-provider stream completed in ${Math.max(0, Date.now() - startedAt)}ms; received ${contentTokenCount} streamed content event(s), ${reasoningTokens} reasoning token(s), and ${cleanText.length} content characters.`
      : 'Configured-provider stream completed without usable JSON content.';
    onProgress?.({
      done: true,
      fullText: cleanText,
      contentTokenCount,
      reasoningTokens,
      rawLength: cleanText.length,
      provider: config.provider,
      model: config.modelId,
      diagnostic
    });
    if (!cleanText) {
      const error = new Error('The selected AI model ended before any usable nexora.web-project JSON was received.');
      error.diagnostic = diagnostic;
      throw error;
    }
    return { text: cleanText, raw: cleanText, diagnostic, provider: config.provider, model: config.modelId };
  }

  function looksLikeUniversalPagePayload(value = {}) {
    if (!isPlainObject(value)) return false;
    const page = value.page || value.website || value.document || value;
    if (value.schema === 'nexora.universal-page') return true;
    return isPlainObject(page) && (
      Array.isArray(page.elements) ||
      isPlainObject(page.elements) ||
      Array.isArray(page.children) ||
      Array.isArray(page.sections) ||
      Array.isArray(page.body) ||
      Array.isArray(page.content)
    );
  }

  function universalElementList(source = {}) {
    if (!isPlainObject(source)) return [];
    const candidates = [source.elements, source.children, source.sections, source.body, source.content];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate;
      if (isPlainObject(candidate)) return Object.entries(candidate).map(([key, value]) => ({
        id: value?.id || key,
        ...(isPlainObject(value) ? value : { text: String(value || '') })
      }));
    }
    return [];
  }

  function universalPageToVisualDocument(universalPage = {}, originalPrompt = '') {
    const source = universalPage.page || universalPage.website || universalPage.document || universalPage;
    const pageTitle = source.title || source.name || universalPage.title || titleFromText(originalPrompt) || 'Generated Website';
    const pageId = 'page_home';
    const rootId = 'root_page_home';
    const elements = {};
    const usedIds = new Set();

    function stableElementId(rawId, type, index) {
      const base = String(rawId || `${type || 'element'}_${index + 1}`)
        .toLowerCase()
        .replace(/[^a-z0-9_ -]+/g, '')
        .trim()
        .replace(/[\s-]+/g, '_') || `element_${index + 1}`;
      let next = base;
      let suffix = 2;
      while (usedIds.has(next)) {
        next = `${base}_${suffix}`;
        suffix += 1;
      }
      usedIds.add(next);
      return next;
    }

    function normalizeTag(tag = '', type = '') {
      const lower = String(tag || type || 'div').toLowerCase();
      if (['main', 'section', 'article', 'aside', 'header', 'footer', 'nav', 'form', 'button', 'a', 'img', 'video', 'input', 'textarea', 'select', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'p', 'span', 'strong', 'small'].includes(lower)) return lower;
      if (lower === 'navbar' || lower === 'menu') return 'nav';
      if (lower === 'image' || lower === 'avatar' || lower === 'thumbnail') return 'img';
      if (lower === 'heading' || lower === 'hero-title') return 'h2';
      if (lower === 'text' || lower === 'paragraph' || lower === 'caption') return 'p';
      return 'div';
    }

    function normalizeType(type = '', tag = '') {
      const lower = String(type || tag || 'container').toLowerCase();
      if (lower === 'nav') return 'navbar';
      if (lower === 'img') return 'image';
      if (lower === 'h1' || lower === 'h2' || lower === 'h3') return 'heading';
      if (lower === 'p' || lower === 'span') return 'text';
      return lower.replace(/[^a-z0-9]+/g, '') || 'container';
    }

    function normalizeContent(node = {}, tag = '') {
      const content = isPlainObject(node.content) ? { ...node.content } : {};
      const text = node.text ?? node.label ?? node.value ?? node.title ?? '';
      if (text && !content.text && !['img', 'input'].includes(tag)) content.text = String(text);
      if (node.placeholder && !content.placeholder) content.placeholder = String(node.placeholder);
      if (node.src && !content.src) content.src = String(node.src);
      if (node.alt && !content.alt) content.alt = String(node.alt);
      if (node.href && !content.href) content.href = String(node.href);
      return content;
    }

    function normalizeAttributes(node = {}, content = {}) {
      const attrs = isPlainObject(node.attrs) ? { ...node.attrs } : (isPlainObject(node.attributes) ? { ...node.attributes } : {});
      ['placeholder', 'src', 'alt', 'href', 'target', 'type', 'aria-label'].forEach(key => {
        if (node[key] && !attrs[key]) attrs[key] = node[key];
        if (content[key] && !attrs[key]) attrs[key] = content[key];
      });
      return attrs;
    }

    function normalizeStyle(node = {}, fallback = {}) {
      const style = isPlainObject(node.style) ? node.style : (isPlainObject(node.styles) ? node.styles : {});
      return Object.keys(style).length ? style : fallback;
    }

    function walk(node = {}, parentId = rootId, index = 0) {
      const type = normalizeType(node.type, node.tag);
      const tag = normalizeTag(node.tag, node.type);
      const id = stableElementId(node.id || node.name, type, index);
      const content = normalizeContent(node, tag);
      const childNodes = universalElementList(node);
      const childIds = childNodes.map((child, childIndex) => walk(child, id, childIndex)).filter(Boolean);
      elements[id] = {
        id,
        type,
        tag,
        name: node.name || content.text || type,
        parent: parentId,
        children: childIds,
        content,
        attributes: normalizeAttributes(node, content),
        style: normalizeStyle(node, {
          display: childIds.length ? 'block' : 'inline-block',
          padding: tag === 'section' ? '48px 24px' : '0',
          color: 'var(--text)'
        }),
        responsive: isPlainObject(node.responsive) ? node.responsive : {}
      };
      return id;
    }

    usedIds.add(rootId);
    const topLevelNodes = universalElementList(source);
    const rootChildren = topLevelNodes.map((node, index) => walk(node, rootId, index)).filter(Boolean);
    elements[rootId] = {
      id: rootId,
      type: 'root',
      tag: 'main',
      name: pageTitle,
      parent: null,
      children: rootChildren,
      content: {},
      attributes: { 'aria-label': pageTitle },
      style: {
        display: 'block',
        minHeight: '100vh',
        width: '100%',
        overflow: 'hidden',
        ...(isPlainObject(source.styles?.body) ? source.styles.body : {})
      }
    };

    return {
      schema: VISUAL_DOCUMENT_SCHEMA,
      version: NEXORA_CHAT_CONFIG.schemas?.visualDocumentVersion || '4.4.0',
      document: {
        id: `doc_${Date.now()}`,
        name: pageTitle,
        type: 'website',
        source: { createdBy: 'nexora-ai', prompt: originalPrompt }
      },
      settings: {
        defaultPage: pageId,
        breakpoints: { desktop: 1440, laptop: 1024, tablet: 768, mobile: 390 }
      },
      theme: {
        mode: 'dark',
        tokens: {
          colors: {
            mode: 'dark',
            background: source.styles?.body?.background || '#0b0c10',
            surface: '#111827',
            surfaceAlt: '#1f2937',
            text: source.styles?.body?.color || '#f8fafc',
            muted: '#9ca3af',
            primary: '#fbb03b',
            accent: '#38bdf8',
            border: 'rgba(255,255,255,.14)'
          },
          fonts: { body: 'Inter, system-ui, sans-serif', heading: 'Outfit, Inter, system-ui, sans-serif' }
        }
      },
      assets: [],
      components: {},
      interactions: isPlainObject(universalPage.interactions) ? universalPage.interactions : {},
      pages: {
        [pageId]: {
          id: pageId,
          name: pageTitle,
          path: 'index.html',
          root: rootId,
          seo: {
            title: pageTitle,
            description: source.description || universalPage.description || 'Generated by Nexora AI.'
          },
          elements
        }
      }
    };
  }

  function isTokenTransportFailure(error = {}) {
    const text = `${error?.message || ''} ${error?.diagnostic || ''}`;
    return /Token receiving stopped|No usable tokens|Connection failed|Could not connect|HTTP\s+\d+|OpenRouter request failed|API key|401|403|429|AbortError/i.test(text);
  }

  function createRescueUniversalPage(originalPrompt = '', route = {}, reason = '') {
    throw new Error('Local rescue fallback pages have been removed. Regenerate a valid nexora.web-project or show the generation error.');
    const title = titleFromText(originalPrompt) || 'Generated Website';
    const typeLabel = route.pageType && route.pageType !== 'custom' ? route.pageType : 'web experience';
    return {
      schema: 'nexora.universal-page',
      version: '4.8.1',
      page: {
        title,
        language: 'en',
        description: `Responsive editable ${typeLabel} generated by Nexora AI.`,
        styles: {
          body: {
            margin: '0',
            background: '#090b10',
            color: '#f8fafc',
            fontFamily: 'Inter, system-ui, sans-serif',
            overflowX: 'hidden'
          },
          ':root': {
            '--nx-bg': '#090b10',
            '--nx-surface': 'rgba(16, 20, 30, 0.82)',
            '--nx-border': 'rgba(255, 184, 76, 0.22)',
            '--nx-gold': '#f6b950',
            '--nx-text': '#f8fafc',
            '--nx-muted': '#a6adba'
          },
          '@media (max-width: 900px)': {
            "[data-nx-id='hero_grid']": { gridTemplateColumns: '1fr' },
            "[data-nx-id='feature_grid']": { gridTemplateColumns: '1fr' },
            "[data-nx-id='root_page_home']": { padding: '18px' }
          },
          '@media (max-width: 640px), (pointer: coarse)': {
            '*': { animation: 'none', transitionDuration: '0.01ms' },
            "[data-nx-id='hero_title']": { fontSize: 'clamp(34px, 11vw, 52px)' },
            "[data-nx-id='hero_section']": { minHeight: '100svh', padding: '28px 18px' }
          }
        },
        elements: [
          {
            id: 'hero_section',
            tag: 'section',
            type: 'section',
            name: 'Responsive Hero',
            styles: {
              minHeight: '100vh',
              padding: '42px',
              display: 'flex',
              alignItems: 'center',
              background: 'radial-gradient(circle at 20% 20%, rgba(246,185,80,.20), transparent 32%), linear-gradient(135deg, #090b10, #141821 55%, #090b10)',
              overflow: 'hidden'
            },
            children: [
              {
                id: 'hero_grid',
                tag: 'div',
                type: 'container',
                styles: { width: '100%', maxWidth: '1180px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1.05fr .95fr', gap: '28px', alignItems: 'center' },
                children: [
                  {
                    id: 'hero_copy',
                    tag: 'div',
                    type: 'container',
                    styles: { display: 'flex', flexDirection: 'column', gap: '18px', minWidth: '0' },
                    children: [
                      { id: 'eyebrow', tag: 'p', type: 'text', text: 'Nexora AI', styles: { margin: '0', color: 'var(--nx-gold)', fontWeight: '800', letterSpacing: '.08em', textTransform: 'uppercase' } },
                      { id: 'hero_title', tag: 'h1', type: 'heading', text: title, styles: { margin: '0', color: 'var(--nx-text)', fontSize: 'clamp(44px, 7vw, 84px)', lineHeight: '.95', fontWeight: '900', letterSpacing: '0' } },
                      { id: 'hero_body', tag: 'p', type: 'text', text: String(originalPrompt || 'A responsive, editable website generated by Nexora AI.').slice(0, 220), styles: { margin: '0', maxWidth: '680px', color: 'var(--nx-muted)', fontSize: 'clamp(16px, 2vw, 20px)', lineHeight: '1.7' } },
                      { id: 'primary_action', tag: 'a', type: 'button', text: 'Explore', attrs: { href: '#content' }, styles: { width: 'fit-content', minHeight: '46px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 22px', borderRadius: '8px', background: 'var(--nx-gold)', color: '#111827', fontWeight: '800', textDecoration: 'none' } }
                    ]
                  },
                  {
                    id: 'visual_panel',
                    tag: 'div',
                    type: 'container',
                    styles: { minHeight: '360px', border: '1px solid var(--nx-border)', borderRadius: '18px', background: 'linear-gradient(160deg, rgba(255,255,255,.12), rgba(255,255,255,.03))', boxShadow: '0 24px 80px rgba(0,0,0,.38)', display: 'grid', placeItems: 'center', overflow: 'hidden' },
                    children: [
                      { id: 'visual_mark', tag: 'div', type: 'container', text: 'N', styles: { width: '168px', height: '168px', borderRadius: '50%', display: 'grid', placeItems: 'center', border: '1px solid rgba(246,185,80,.42)', color: 'var(--nx-gold)', fontSize: '88px', fontWeight: '900', boxShadow: '0 0 52px rgba(246,185,80,.22)' } }
                    ]
                  }
                ]
              }
            ]
          },
          {
            id: 'content',
            tag: 'section',
            type: 'section',
            styles: { padding: '58px 42px', background: '#0d1118' },
            children: [
              { id: 'content_title', tag: 'h2', type: 'heading', text: 'Built for every screen', styles: { margin: '0 auto 18px', maxWidth: '920px', color: 'var(--nx-text)', fontSize: 'clamp(28px, 4vw, 46px)', lineHeight: '1.05', textAlign: 'center' } },
              {
                id: 'feature_grid',
                tag: 'div',
                type: 'container',
                styles: { maxWidth: '1020px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '16px' },
                children: ['Responsive layout', 'Editable styling', 'Production preview'].map((text, index) => ({
                  id: `feature_${index + 1}`,
                  tag: 'article',
                  type: 'card',
                  text,
                  styles: { minHeight: '132px', padding: '20px', display: 'flex', alignItems: 'end', borderRadius: '12px', border: '1px solid rgba(255,255,255,.10)', background: 'rgba(255,255,255,.045)', color: 'var(--nx-text)', fontSize: '18px', fontWeight: '800' }
                }))
              }
            ]
          }
        ]
      },
      metadata: {
        rescueReason: cleanGenerationErrorMessage(reason),
        sourceOfTruth: 'nexora.universal-page',
        generatedAfterModelJsonFailure: true
      }
    };
  }

  function parseAndNormalizeUniversalPageText(text = '', originalPrompt = '', route = {}) {
    const parsed = extractJsonFromText(text);
    const rawDoc = isVisualDocumentPayload(parsed) ? parsed : (isVisualDocumentPayload(parsed.visualDocument) ? parsed.visualDocument : parsed);
    let visualDocument = NEXORA_VISUAL_DOCUMENT?.normalizeDocument
      ? NEXORA_VISUAL_DOCUMENT.normalizeDocument(rawDoc, { prompt: originalPrompt, projectName: rawDoc.document?.name || rawDoc.page?.title })
      : rawDoc;
    let issue = visualDocumentQualityIssue(visualDocument, originalPrompt, route);
    if (issue && looksLikeUniversalPagePayload(parsed)) {
      const converted = universalPageToVisualDocument(parsed, originalPrompt);
      visualDocument = NEXORA_VISUAL_DOCUMENT?.normalizeDocument
        ? NEXORA_VISUAL_DOCUMENT.normalizeDocument(converted, { prompt: originalPrompt, projectName: converted.document?.name })
        : converted;
      issue = visualDocumentQualityIssue(visualDocument, originalPrompt, route);
    }
    if (issue) {
      const error = new Error(issue);
      error.diagnostic = `Parser received ${String(text || '').length} content characters from ${getOpenRouterEndpointLabel()}. The JSON parsed, but it did not normalize into editable pages.`;
      throw error;
    }
    return { parsed, rawDoc, visualDocument };
  }

  function parseAndNormalizePageDocumentText(text = '', originalPrompt = '', route = {}) {
    const parsed = NEXORA_WEB_PROJECT.parseJsonDocument(text);
    if (!NEXORA_WEB_PROJECT?.normalizeProject || !NEXORA_WEB_PROJECT?.compileToFiles) {
      throw new Error('Nexora Web Project engine is not loaded.');
    }
    if (!isPlainObject(parsed) || parsed.schema !== WEB_PROJECT_SCHEMA) {
      throw new Error(`The model returned "${parsed?.schema || 'unknown'}"; expected "${WEB_PROJECT_SCHEMA}" only.`);
    }
    const prepared = NEXORA_WEB_PROJECT.reconcileProject({
      ...parsed,
      project: {
        ...(parsed.project || {}),
        generator: {
          ...(parsed.project?.generator || {}),
          type: 'ai',
          prompt: originalPrompt,
          model: getActiveProviderModelId(),
          contractVersion: NEXORA_WEB_PROJECT.AI_CONTRACT_VERSION || null
        }
      }
    }, { prompt: originalPrompt, mode: 'generation' });
    const webProject = stampCanonicalProjectContext(prepared.project, originalPrompt, route, 'build');
    const reconciliationDiagnostics = Array.isArray(prepared.diagnostics) ? prepared.diagnostics : [];
    const validationIssues = Array.isArray(prepared.issues) ? prepared.issues : NEXORA_WEB_PROJECT.validateProject(webProject);
    if (validationIssues.length) {
      const error = new Error(validationIssues.slice(0, 8).join(' '));
      error.diagnostic = `Web-project validation failed with ${validationIssues.length} issue(s) after deterministic reconciliation.`;
      error.reconciliationDiagnostics = reconciliationDiagnostics;
      throw error;
    }
    const visualDocument = NEXORA_WEB_PROJECT.webProjectToVisualDocument(webProject);
    const qualityIssue = visualDocumentQualityIssue(visualDocument, originalPrompt, route);
    if (qualityIssue) {
      const error = new Error(qualityIssue);
      error.diagnostic = 'The canonical web project parsed, but its derived editable render document failed quality validation.';
      throw error;
    }
    // A compile pass here makes the compiler part of generation validation, not merely export.
    NEXORA_WEB_PROJECT.compileToFiles(webProject);
    return { parsed, webProject, visualDocument, reconciliationDiagnostics };
  }

  function getCanonicalWebProjectFromGeneratedProject(project = null) {
    if (!project || !NEXORA_WEB_PROJECT?.normalizeProject) return null;
    if (project.webProject?.schema === WEB_PROJECT_SCHEMA) {
      try { return NEXORA_WEB_PROJECT.resolveEditorDraft(project.webProject, { mode: 'revision-source' }); } catch {}
    }
    const candidates = Array.isArray(project.files) ? project.files : [];
    const canonicalFile = candidates.find(file => String(file?.name || '').toLowerCase() === 'nexora.web-project.json');
    if (canonicalFile?.content) {
      try {
        const parsed = JSON.parse(String(canonicalFile.content));
        if (parsed?.schema === WEB_PROJECT_SCHEMA) return NEXORA_WEB_PROJECT.normalizeProject(parsed, { mode: 'revision-source' });
      } catch {}
    }
    try {
      if (project.pageDocument && NEXORA_WEB_PROJECT.legacyPageDocumentToWebProject) return NEXORA_WEB_PROJECT.legacyPageDocumentToWebProject(project.pageDocument, { mode: 'revision-source' });
      if (project.universalPage && NEXORA_WEB_PROJECT.universalPageToWebProject) return NEXORA_WEB_PROJECT.universalPageToWebProject(project.universalPage, { mode: 'revision-source' });
      if (project.visualDocument && NEXORA_WEB_PROJECT.visualDocumentToWebProject) return NEXORA_WEB_PROJECT.visualDocumentToWebProject(project.visualDocument, { mode: 'revision-source' });
    } catch {}
    return null;
  }

  function buildRevisionProjectContext(webProject, route = {}, maxChars = 42000) {
    return NEXORA_WEB_PROJECT.buildRevisionContext(webProject, String(route.buildBrief || route.goal || ''), maxChars);
  }

  function buildCanonicalPatchPrompt(originalPrompt, route, currentWebProject, repairContext = null) {
    const patchContract = NEXORA_WEB_PROJECT?.getPatchContract?.();
    if (!patchContract) throw new Error('Nexora patch contract is unavailable. Reload and try again.');
    const sourceContext = buildRevisionProjectContext(currentWebProject, route, repairContext ? 26000 : 42000);
    const rules = [
      'Return exactly one strict JSON object only using schema nexora.patch version 1.0.0.',
      `baseRevision must be exactly ${currentWebProject.project?.revision || 'rev_1'}.`,
      'Make the smallest transaction that fully satisfies the revision. Preserve every unrelated page, node, ID, interaction, token, asset and component.',
      'Prefer text.set/style.set/style.merge/responsive.merge/motion.set/token.set for local changes. motion.set may update entrance, hover, structured effects, timeline references and reduced-motion policy without replacing page structure.',
      'Use page.replace only when the requested change actually modifies hierarchy or adds/removes visible structural content. A page.replace page must be complete and use recursive AI-authoring nodes.',
      'Never use page.replace merely to recolor, rename, resize, animate, or restyle an existing element.',
      'When referencing a node/page/route/state, copy the exact canonical ID from CURRENT PROJECT CONTEXT. Never invent a replacement ID for an element that already exists.',
      'For new interactions/state introduced by page.replace, prefer inline node.interactions and state hints exactly as defined by the web-project authoring contract.',
      'Do not output HTML, CSS, JavaScript, markdown, explanations, diffs, or the full project. Nexora applies the patch to the canonical source and recompiles.',
      'Do not alter unrelated content merely to improve it. User revision scope is authoritative.'
    ];
    if (repairContext) {
      rules.unshift('REPAIR PASS: return a fresh complete corrected nexora.patch transaction only.');
      rules.push(`PATCH/APPLY DIAGNOSTIC: ${String(repairContext.issue || '')}`);
      rules.push(`PREVIOUS PATCH EXCERPT:\n${String(repairContext.previous || '').slice(0, 7000)}\n---TAIL---\n${String(repairContext.previous || '').slice(-7000)}`);
    }
    return [
      'REVISION BUILD BRIEF:',
      String(route.buildBrief || originalPrompt || ''),
      '',
      'LATEST USER REVISION REQUEST:',
      String(originalPrompt || ''),
      '',
      'PATCH CONTRACT:',
      JSON.stringify(patchContract, null, 2),
      '',
      'CURRENT PROJECT CONTEXT:',
      JSON.stringify(sourceContext),
      '',
      'RULES:',
      ...rules.map((rule, index) => `${index + 1}. ${rule}`)
    ].join('\n');
  }

  async function callConfiguredProviderPatch(originalPrompt, route, currentWebProject, { signal = null, repairContext = null, onProgress = null } = {}) {
    const config = getAgentRuntimeConfig();
    if (!config.modelId) throw new Error('AI model is not configured.');
    if (config.provider !== 'codex' && !config.apiKey) throw new Error(`AI provider is not configured for ${providerLabel(config.provider)}.`);
    if (config.provider === 'codex' && !codexRuntimeState.connected) throw new Error('ChatGPT Codex is not connected.');
    const prompt = buildCanonicalPatchPrompt(originalPrompt, route, currentWebProject, repairContext);
    const system = `You are Nexora's canonical revision engine. Return only a valid nexora.patch JSON transaction under contract ${NEXORA_WEB_PROJECT.AI_CONTRACT_VERSION || 'current'}. Preserve all canonical project state outside the user's requested edit. Prefer small semantic operations and exact existing IDs. Nexora applies, reconciles, validates, compiles and opens the result in the same visual editor.`;
    const text = await streamConfiguredProviderChat(prompt, {
      signal,
      system,
      history: [], // The resolved brief and canonical context are authoritative; avoid duplicate generated artifacts.
      jsonMode: true,
      route,
      temperature: repairContext ? 0.05 : 0.14,
      maxTokens: repairContext ? 7000 : 6000,
      onStatus: status => onProgress?.({ status, provider: config.provider, model: config.modelId }),
      onToken: (token, fullText) => onProgress?.({ token, fullText, provider: config.provider, model: config.modelId })
    });
    const clean = String(text || '').trim();
    if (!clean) throw new Error('The selected model returned no Nexora patch JSON.');
    return { text: clean, provider: config.provider, model: config.modelId };
  }

  function parseAndApplyCanonicalPatchText(text, currentWebProject, originalPrompt, route = {}) {
    const parsed = NEXORA_WEB_PROJECT.parseJsonDocument(text);
    if (!isPlainObject(parsed) || parsed.schema !== 'nexora.patch') throw new Error(`The model returned patch schema "${parsed?.schema || 'unknown'}"; expected "nexora.patch".`);
    const patchIssues = NEXORA_WEB_PROJECT.validatePatch(parsed, currentWebProject);
    if (patchIssues.length) throw new Error(patchIssues.slice(0, 8).join(' '));
    const applied = NEXORA_WEB_PROJECT.applyPatch(currentWebProject, parsed);
    const webProject = applied.project;
    const validationIssues = NEXORA_WEB_PROJECT.validateProject(webProject);
    if (validationIssues.length) {
      const error = new Error(validationIssues.slice(0, 8).join(' '));
      error.reconciliationDiagnostics = applied.diagnostics || [];
      throw error;
    }
    NEXORA_WEB_PROJECT.compileToFiles(webProject);
    const visualDocument = NEXORA_WEB_PROJECT.webProjectToVisualDocument(webProject);
    const qualityIssue = visualDocumentQualityIssue(visualDocument, originalPrompt, route);
    if (qualityIssue) throw new Error(qualityIssue);
    return { patch: parsed, webProject, visualDocument, reconciliationDiagnostics: applied.diagnostics || [] };
  }

  async function generateCanonicalRevisionProject(originalPrompt, route = {}, buildCard = null, signal = null) {
    const currentProject = route.currentProject || await resolveActiveGeneratedProject();
    const currentWebProject = getCanonicalWebProjectFromGeneratedProject(currentProject);
    if (!currentWebProject) return generatePageDocumentProject(originalPrompt, route, buildCard, signal);
    const ready = [];
    const buildMeter = buildCard?.querySelector('[data-build-meter]');
    setModularBuildProgress(buildCard, 'nexora.patch.json', ready, 'Generating canonical revision patch');
    const onProgress = event => { if (buildMeter && event?.status) buildMeter.textContent = String(event.status); };
    let result;
    let patchText = '';
    let usedRepairPass = false;
    try {
      const first = await callConfiguredProviderPatch(originalPrompt, route, currentWebProject, { signal, onProgress });
      patchText = first.text;
      try {
        result = parseAndApplyCanonicalPatchText(first.text, currentWebProject, originalPrompt, route);
      } catch (firstError) {
        setModularBuildProgress(buildCard, 'nexora.patch.json', ready, `Repairing revision patch - ${cleanGenerationErrorMessage(firstError)}`);
        const repaired = await callConfiguredProviderPatch(originalPrompt, route, currentWebProject, { signal, repairContext: { issue: firstError?.message || 'Invalid patch', previous: first.text || '' }, onProgress });
        patchText = repaired.text;
        result = parseAndApplyCanonicalPatchText(repaired.text, currentWebProject, originalPrompt, route);
        usedRepairPass = true;
      }
    } catch (error) {
      throw createGenerationPipelineError('nexora.patch.json', error);
    }
    const webProject = stampCanonicalProjectContext(result.webProject, originalPrompt, route, 'revision');
    ready.push('nexora.patch.json');
    setModularBuildProgress(buildCard, 'index.html', ready, 'Recompiling canonical project');
    const derivedFiles = NEXORA_WEB_PROJECT.compileToFiles(webProject);
    const moduleFiles = NEXORA_WEB_PROJECT.toModuleFiles(webProject);
    derivedFiles.forEach(file => ready.push(file.name));
    setModularBuildProgress(buildCard, '', ready, 'Website revision ready');
    const manifestOut = {
      schema: 'nexora.generation-manifest', version: '6.1.0', createdAt: new Date().toISOString(), model: getActiveProviderModelId(), mode: 'canonical-web-project-revision',
      userRequest: originalPrompt, buildBrief: String(route.buildBrief || originalPrompt || ''), route, usedRepairPass,
      patch: { baseRevision: result.patch.baseRevision || currentWebProject.project.revision, newRevision: webProject.project.revision, operations: result.patch.operations.length },
      reconciliation: { contractVersion: NEXORA_WEB_PROJECT.AI_CONTRACT_VERSION || null, diagnostics: (result.reconciliationDiagnostics || []).slice(0, 80) },
      constraints: { sourceOfTruth: WEB_PROJECT_SCHEMA, transactionalRevision: true, preserveUnchangedCanonicalState: true, deterministicReferenceReconciliation: true, deterministicCompiler: true },
      outputs: ['nexora.web-project.json', 'nexora.patch.json', ...derivedFiles.map(file => file.name)], modules: moduleFiles.map(file => file.name)
    };
    const projectName = webProject.project?.name || currentProject?.projectName || route.projectName || 'Generated Website';
    const planning = `# Nexora Revision Plan\n\n## Request\n${originalPrompt}\n\n## Resolved brief\n${String(route.buildBrief || originalPrompt || '')}\n\n## Transaction\nApplied ${result.patch.operations.length} canonical patch operation(s) to ${result.patch.baseRevision || currentWebProject.project.revision} and produced ${webProject.project.revision}.\n\n## Repair\nUsed repair pass: ${usedRepairPass ? 'yes' : 'no'}\n`;
    return {
      schema:'nexora.generated-web-project', version:'6.1.0', projectName, reply:'', sourceOfTruth:'nexora.web-project.json',
      files:[...derivedFiles,{name:'nexora.web-project.json',language:'json',content:JSON.stringify(webProject,null,2)},{name:'nexora.patch.json',language:'json',content:JSON.stringify(result.patch,null,2)},...moduleFiles,{name:'generation-manifest.json',language:'json',content:JSON.stringify(manifestOut,null,2)},{name:'planning.md',language:'markdown',content:planning}],
      webProject, pageDocument:null, universalPage:null, visualDocument:result.visualDocument, modules:moduleFiles, manifest:manifestOut, planning
    };
  }

  async function generatePageDocumentProject(originalPrompt, route = {}, buildCard = null, signal = null) {
    const generationPrompt = String(route.buildBrief || originalPrompt || '').trim() || String(originalPrompt || '').trim();
    const ready = [];
    setModularBuildProgress(buildCard, 'nexora.web-project.json', ready, 'Generating canonical web project');
    const buildMeter = buildCard?.querySelector('[data-build-meter]');

    function handleWebProjectStreamProgress(phase = 'Receiving web project') {
      return (event = {}) => {
        if (!buildMeter) return;
        if (event.status) { buildMeter.textContent = event.status; return; }
        if (event.done) { buildMeter.textContent = `${phase} complete`; return; }
        buildMeter.textContent = phase;
      };
    }

    let first;
    try {
      first = await callConfiguredProviderWebProject(generationPrompt, route, {
        signal,
        onProgress: handleWebProjectStreamProgress('Receiving web project')
      });
    } catch (error) {
      throw createGenerationPipelineError('nexora.web-project.json', error);
    }

    let parsedText = first.text;
    let usedRepairPass = false;
    let repairPasses = 0;
    let webProject;
    let visualDocument;
    let reconciliationDiagnostics = [];
    let currentText = first.text;
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const normalized = parseAndNormalizePageDocumentText(currentText, generationPrompt, route);
        parsedText = currentText;
        webProject = normalized.webProject;
        visualDocument = normalized.visualDocument;
        reconciliationDiagnostics = normalized.reconciliationDiagnostics || [];
        break;
      } catch (error) {
        lastError = error;
        if (attempt >= 2) {
          throw createGenerationPipelineError('nexora.web-project.json', error);
        }
        repairPasses += 1;
        usedRepairPass = true;
        setModularBuildProgress(buildCard, 'nexora.web-project.json', ready, `Repair pass ${repairPasses}/2 - ${cleanGenerationErrorMessage(error)}`);
        try {
          const repaired = await callConfiguredProviderWebProject(generationPrompt, route, {
            signal,
            repairContext: {
              attempt: repairPasses,
              issue: error?.message || 'Invalid canonical web project',
              previous: currentText || '',
              diagnostics: error?.reconciliationDiagnostics || []
            },
            onProgress: handleWebProjectStreamProgress(`Receiving repair ${repairPasses}/2`)
          });
          currentText = repaired.text;
        } catch (repairCallError) {
          if (!repairCallError.diagnostic && lastError?.diagnostic) repairCallError.diagnostic = lastError.diagnostic;
          throw createGenerationPipelineError('nexora.web-project.json', repairCallError);
        }
      }
    }
    if (!webProject || !visualDocument) throw createGenerationPipelineError('nexora.web-project.json', lastError || new Error('Canonical project generation did not converge.'));

    ready.push('nexora.web-project.json');
    setModularBuildProgress(buildCard, 'index.html', ready, 'Compiling web project to HTML/CSS/JS');
    const derivedFiles = NEXORA_WEB_PROJECT.compileToFiles(webProject);
    const moduleFiles = NEXORA_WEB_PROJECT.toModuleFiles(webProject);
    const qualityWarnings = collectVisualDocumentQualityWarnings(visualDocument, generationPrompt, route);
    derivedFiles.forEach(file => ready.push(file.name));
    setModularBuildProgress(buildCard, '', ready, 'Website ready');

    const manifestOut = {
      schema: 'nexora.generation-manifest',
      version: '6.0.0',
      createdAt: new Date().toISOString(),
      model: getActiveProviderModelId(),
      mode: 'canonical-web-project',
      tokenBudget: getVisualGenerationTokenBudget(route, generationPrompt),
      userRequest: originalPrompt,
      buildBrief: generationPrompt,
      route,
      qualityWarnings,
      usedRepairPass,
      repairPasses,
      reconciliation: {
        contractVersion: NEXORA_WEB_PROJECT.AI_CONTRACT_VERSION || null,
        applied: reconciliationDiagnostics.length,
        diagnostics: reconciliationDiagnostics.slice(0, 80)
      },
      constraints: {
        sourceOfTruth: WEB_PROJECT_SCHEMA,
        normalizedGraphStorage: true,
        modularShardingAvailable: true,
        noLegacyGenerationSchemas: true,
        noLocalRescueFallback: true,
        derivedFilesOnly: true,
        deterministicCompiler: true,
        deterministicReferenceReconciliation: true,
        inlineInteractionAuthoring: true,
        inferredStateDeclarations: true,
        sharedRuntimeOwnedAiContract: true,
        showErrorsInsteadOfFallbackPages: true
      },
      outputs: ['nexora.web-project.json', ...derivedFiles.map(file => file.name)],
      modules: moduleFiles.map(file => file.name)
    };

    const projectName = webProject.project?.name || route.projectName || titleFromText(generationPrompt) || titleFromText(originalPrompt) || 'Generated Website';
    const planningText = `# Nexora Generation Plan\n\n## Latest User Message\n${originalPrompt}\n\n## Resolved Build Brief\n${generationPrompt}\n\n## Pipeline\nAI-generated nexora.web-project -> JSON parse -> recursive normalization -> deterministic graph/reference reconciliation -> strict validation -> deterministic compiler -> editable runtime -> HTML/CSS/JavaScript. Safe missing state declarations and inline interaction targets are repaired locally; one model repair pass is reserved for unresolved semantic/structural failures.\n\n## Source of Truth\n- nexora.web-project.json\n\n## Storage\nThe canonical snapshot can be decomposed into module files under nexora/ without changing its semantics. HTML/CSS/JavaScript are derived artifacts and are never parsed back as the normal editing source.\n\n## Repair\nUsed repair pass: ${usedRepairPass ? 'yes' : 'no'}\n\n## Raw Model Characters\n${parsedText.length}${qualityWarnings.length ? `\n\n## Warnings\n${qualityWarnings.map(item => `- ${item}`).join('\n')}` : ''}\n`;

    return {
      schema: 'nexora.generated-web-project',
      version: '6.0.0',
      projectName,
      reply: '',
      sourceOfTruth: 'nexora.web-project.json',
      files: [
        ...derivedFiles,
        { name: 'nexora.web-project.json', language: 'json', content: JSON.stringify(webProject, null, 2) },
        ...moduleFiles,
        { name: 'generation-manifest.json', language: 'json', content: JSON.stringify(manifestOut, null, 2) },
        { name: 'planning.md', language: 'markdown', content: planningText }
      ],
      webProject,
      pageDocument: null,
      universalPage: null,
      visualDocument,
      modules: moduleFiles,
      manifest: manifestOut,
      planning: planningText
    };
  }

  async function generateUniversalVisualDocumentProject(originalPrompt, route = {}, buildCard = null, signal = null) {
    throw new Error('Legacy universal/visual-document generation has been removed. Use the canonical nexora.web-project pipeline.');
  }

  function getAgentRunFailureReason(run = {}) {
    const failure = run.final_verification?.failed?.[0]?.reason
      || run.final_verification?.uncertain?.[0]?.reason
      || run.trace?.slice(-1)?.[0]?.message;
    return failure || 'The agent stopped before producing a verified website.';
  }

  function updateAgentBuildFileTargets(workspace, files = [], { final = false } = {}) {
    if (!workspace) return;
    workspace.__agentLatestFiles = workspace.__agentLatestFiles || new Map();
    (files || []).forEach(file => {
      const previous = workspace.__agentLatestFiles.get(file.name) || {};
      workspace.__agentLatestFiles.set(file.name, { ...previous, ...file, content: file.content || previous.content || '' });
    });
    const entries = getUserVisibleWebsiteFiles([...workspace.__agentLatestFiles.values()]).map(file => ({
      file: { name: file.name, language: file.language, content: file.content || '' },
      status: final ? 'ready' : 'writing',
      lines: Math.max(0, Number(file.lines ?? file.line_count ?? countCodeLines(file.content || '')) || 0)
    }));
    setGenerationFileProgress(workspace, entries, { replace: true });
  }

  async function stopAgentRunQuietly(runId) {
    // Production Vercel builds are request-bound. Aborting the active fetch is
    // the cancellation signal; there is intentionally no cross-invocation stop
    // endpoint that depends on warm-instance memory.
    return Boolean(runId);
  }

  async function generateAgenticWebsiteProject(originalPrompt, route = {}, buildCard = null, signal = null) {
    const config = getAgentRuntimeConfig();
    if (config.provider !== 'codex' && !config.apiKey) {
      throw new Error('Website generation needs an AI provider credential. Open Settings → Agentic AI Runtime and configure the selected provider.');
    }
    if (config.provider === 'codex' && !codexRuntimeState.connected) {
      throw new Error('ChatGPT Codex is not connected. Open Settings → Agentic AI Runtime → Connect ChatGPT first.');
    }
    if (!config.modelId) {
      throw new Error('No AI model is selected. Open Settings → Agentic AI Runtime and select a model.');
    }

    const buildMeter = buildCard?.querySelector('[data-build-meter]');
    if (buildMeter) buildMeter.textContent = 'Preparing build…';

    const currentProject = route.currentProject || await resolveActiveGeneratedProject();
    const isRevision = route.action === 'revise_website' && Boolean(currentProject?.files?.length);
    const templateRef = !isRevision && appState.selectedTemplate?.id ? { ...appState.selectedTemplate } : null;
    const resolvedPrompt = String(route.buildBrief || originalPrompt || '').trim();
    const projectName = String(
      route.projectName || currentProject?.projectName || titleFromText(originalPrompt) || 'Nexora Project'
    ).trim();
    const existingFiles = isRevision
      ? getProjectOutputFiles(currentProject)
        .filter(file => /\.(?:html?|css|js|mjs|cjs|json|md|txt|svg)$/i.test(String(file.name || '')))
        .map(file => ({
          name: String(file.name || ''),
          language: String(file.language || 'text'),
          content: String(file.content || '')
        }))
        .filter(file => file.name && file.content.length <= 1_000_000)
        .slice(0, 24)
      : [];

    const requestHeaders = { 'Content-Type': 'application/json' };
    if (config.provider === 'codex' || templateRef) requestHeaders.Authorization = `Bearer ${await getNexoraAccessToken()}`;

    let response;
    try {
      response = await fetch('/api/agent/build', {
        method: 'POST',
        signal,
        headers: requestHeaders,
        body: JSON.stringify({
          prompt: resolvedPrompt,
          project_name: projectName,
          provider: config.provider,
          model_id: config.modelId,
          api_key: config.apiKey,
          base_url: config.baseUrl,
          enable_thinking: getReasoningRequestOptions().enableThinking,
          reasoning_effort: getReasoningRequestOptions().reasoningEffort,
          existing_files: existingFiles,
          template_id: templateRef?.id || null,
          template_version: templateRef?.version || null
        })
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      throw new Error(`Could not reach the website-generation service. ${error?.message || ''}`.trim());
    }
    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      let detail = text;
      try {
        const parsed = text ? JSON.parse(text) : null;
        detail = String(parsed?.detail || parsed?.error || text || '').trim();
      } catch {}
      throw new Error(detail || `Website-generation service returned HTTP ${response.status}.`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let eventName = 'message';
    let latestRun = null;
    let latestFiles = [];
    let completePayload = null;
    const visibleFileNames = new Set();

    const processEvent = (name, rawData) => {
      if (!rawData) return;
      let payload;
      try { payload = JSON.parse(rawData); } catch { return; }

      if (name === 'connected') {
        if (buildMeter) buildMeter.textContent = 'Building website…';
        setGenerationInspectorStatus('Creating the implementation plan…', 'PLAN', 0.1);
        appendGenerationEvent('Creating the implementation plan…', 'PLAN', 'build-connected');
        return;
      }

      if (name === 'model_stream') {
        const streamedFiles = Array.isArray(payload.files) ? payload.files : [];
        if (streamedFiles.length) updateAgentBuildFileTargets(buildCard, streamedFiles, { final: false });
        if (buildMeter) buildMeter.textContent = 'Writing website files…';
        setGenerationInspectorStatus('Writing website files…', 'WRITE', 0.55);
        return;
      }

      if (name === 'progress') {
        if (payload.run) latestRun = payload.run;
        updateGenerationInspectorFromAgentRun(latestRun || {});
        if (Array.isArray(payload.files)) {
          latestFiles = payload.files;
          updateAgentBuildFileTargets(buildCard, latestFiles, { final: false });
          latestFiles.forEach(file => {
            const fileName = String(file?.name || '').trim();
            if (fileName && !visibleFileNames.has(fileName)) {
              visibleFileNames.add(fileName);
              appendGenerationEvent(`Writing ${fileName}`, 'WRITE', `file:${fileName}`);
            }
          });
        }
        const phase = String(latestRun?.phase || '').toUpperCase();
        const meterText = {
          ANALYZE: 'Understanding request…',
          PLAN: 'Planning implementation…',
          INSPECT: 'Inspecting current files…',
          ACT: 'Writing website files…',
          VERIFY: 'Checking website…',
          REPAIR: 'Fixing detected issue…',
          REPLAN: 'Updating plan…',
          COMPLETE: 'Website ready'
        }[phase] || 'Building website…';
        if (buildMeter) buildMeter.textContent = meterText;
        return;
      }

      if (name === 'complete' || name === 'failed') {
        completePayload = { ...payload, __event: name };
        if (payload.run) latestRun = payload.run;
        updateGenerationInspectorFromAgentRun(latestRun || {});
        if (Array.isArray(payload.files)) latestFiles = payload.files;
        updateAgentBuildFileTargets(buildCard, latestFiles, { final: true });
        if (buildMeter) buildMeter.textContent = name === 'complete' ? 'Website ready' : 'Build stopped';
        setGenerationInspectorStatus(
          name === 'complete' ? 'Website generated and checked' : 'Website generation failed',
          name === 'complete' ? 'VERIFY' : 'ERROR',
          name === 'complete' ? 1 : null
        );
      }
    };

    const processSseBlock = block => {
      if (!block || block.startsWith(':')) return;
      eventName = 'message';
      const dataLines = [];
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
      }
      processEvent(eventName, dataLines.join('\n'));
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || '';
      blocks.forEach(processSseBlock);
    }
    buffer += decoder.decode();
    if (buffer.trim()) processSseBlock(buffer.trim());

    if (!completePayload) {
      throw new Error('The website-generation stream ended before returning a final result.');
    }
    if (completePayload.__event === 'failed' || latestRun?.status === 'failed') {
      throw new Error(completePayload.error || getAgentRunFailureReason(latestRun || {}));
    }

    const files = latestFiles.map(file => ({ name: file.name, language: file.language || 'text', content: file.content || '' }));
    if (!files.some(file => String(file.name || '').toLowerCase().endsWith('.html'))) {
      throw new Error('The build completed without an HTML entry page, so Nexora rejected the incomplete result.');
    }
    const verification = latestRun?.final_verification || {};
    if (verification.satisfied === false || (verification.failed || []).length) {
      throw new Error(getAgentRunFailureReason(latestRun));
    }

    const resolvedTemplate = completePayload?.template || templateRef || null;
    if (templateRef) {
      appState.selectedTemplate = null;
      try { sessionStorage.removeItem('nexora:selected-template'); } catch {}
    }
    activeAgentProjectId = latestRun?.project_id || activeAgentProjectId;
    activeAgentRunId = latestRun?.run_id || activeAgentRunId;
    const agentPlan = Array.isArray(latestRun?.plan) ? latestRun.plan : [];
    const visiblePlan = (Array.isArray(route.plan) && route.plan.length ? route.plan : agentPlan).map((step, index) => ({
      ...step,
      id: step.id || `S${index + 1}`,
      status: 'passed'
    }));
    syncConversationPlanCard(visiblePlan);
    const changes = aggregateFileChanges(latestRun?.changes);
    const planning = [
      `# ${isRevision ? 'Website Update Plan' : 'Website Build Plan'}`,
      '',
      '## Goal',
      String(route.goal || resolvedPrompt || originalPrompt),
      '',
      '## Plan',
      ...visiblePlan.map(step => `- [x] ${step.title}${step.description || step.reason ? ` — ${step.description || step.reason}` : ''}`),
      ...(changes.length ? [
        '',
        '## File Changes',
        ...changes.map(change => `- ${change.path || change.name || 'file'}: +${Number(change.lines_added ?? change.added_lines ?? 0)} / -${Number(change.lines_removed ?? change.removed_lines ?? 0)} lines`)
      ] : [])
    ].join('\n');

    return {
      projectName,
      reply: '',
      files,
      pageDocument: null,
      universalPage: null,
      visualDocument: null,
      planning,
      agentic: true,
      agentProjectId: activeAgentProjectId,
      agentRunId: activeAgentRunId,
      previewUrl: null,
      manifest: {
        schema: 'nexora.agentic-run',
        version: '3.0.0',
        mode: isRevision ? 'revision' : 'build',
        verification,
        changes,
        iterations: latestRun?.iteration_count || 0,
        selfRepairs: latestRun?.self_repair_count || 0,
        contextCompactions: latestRun?.context_compaction_count || 0,
        template: resolvedTemplate ? {
          id: resolvedTemplate.template_id || resolvedTemplate.id || null,
          name: resolvedTemplate.name || templateRef?.name || null,
          version: resolvedTemplate.version || templateRef?.version || null,
          tier: resolvedTemplate.tier || templateRef?.tier || null,
          category: resolvedTemplate.category || templateRef?.category || null
        } : null,
        generatedAt: new Date().toISOString()
      }
    };
  }

  async function generateModularWebsiteProject(originalPrompt, route = {}, buildCard = null, signal = null) {
    if (route.action === 'revise_website') return generateCanonicalRevisionProject(originalPrompt, route, buildCard, signal);
    return generatePageDocumentProject(originalPrompt, route, buildCard, signal);
  }

  function getWebsiteCompletionSystemPrompt() {
    return [
      'You are Nexora.AI reporting the result of a completed agentic website build.',
      'Use only the supplied build metadata and the original request.',
      'Write a concise, natural user-facing completion message that names the project, summarizes the verified outcome, and points out that Preview, Edit, file opening, and ZIP download actions are available.',
      'Do not invent files, verification results, links, providers, hidden reasoning, or implementation telemetry.'
    ].join(' ');
  }

  function buildWebsiteCompletionPrompt(originalPrompt, project, route = {}) {
    const files = getProjectOutputFiles(project).map(file => ({
      name: file.name,
      lines: countCodeLines(file.content || '')
    }));
    return [
      'ORIGINAL USER REQUEST:',
      originalPrompt,
      '',
      'COMPLETED BUILD METADATA:',
      JSON.stringify({
        projectName: project.projectName,
        action: route.action,
        goal: route.goal,
        files,
        verification: project.manifest?.verification || {},
        changes: project.manifest?.changes || []
      })
    ].join('\n');
  }

  // 10. SEND MESSAGE TRANSACTION FLOW WITH THE CONFIGURED AI PROVIDER
  async function handleSendMessage() {
    if (activeGenerationController) return;
    const rawText = chatInput.value.trim();
    if (!rawText) return;
    const responseStartedAt = performance.now();

    activeGenerationController = new AbortController();
    activeGenerationStopped = false;
    const generationSignal = activeGenerationController.signal;
    const priorHistory = getActiveConversationHistoryForAi();

    ensureChatMode();
    appendMessageBubble('user', rawText);
    scrollToBottom({ force: true });
    chatInput.value = '';
    resizeChatInput();
    setGenerationButtonState(true);

    beginGenerationInspector('Understanding your request…');
    let bubble = createStreamingBubble('Thinking…');
    let route = { action: 'chat', goal: '', plan: [], questions: [] };
    let websiteRequest = false;
    let websiteBuildCompleted = false;
    let buildCard = null;
    let streamedText = '';
    let finalAssistantText = '';

    try {
      const currentProject = await resolveActiveGeneratedProject();
      setGenerationInspectorStatus('Understanding your request…', 'UNDERSTAND', 0.08);
      appendGenerationEvent('Understanding your request…', 'UNDERSTAND', 'turn-understand');

      try {
        route = await classifyUserIntent(rawText, generationSignal, currentProject);
      } catch (plannerError) {
        // Fail open to the selected conversational model. This is a technical
        // resilience path only; no local keywords or canned user-intent rules.
        route = {
          action: 'chat',
          goal: '',
          plan: [],
          questions: [],
          currentProject,
          assistantDirective: 'Respond directly and naturally to the latest user message using the full conversation context.'
        };
        console.warn('AI turn planning unavailable; continuing with direct conversational inference.', plannerError);
      }

      websiteRequest = ['build_website', 'revise_website'].includes(route.action);

      if (websiteRequest) {
        const initialThinkingMessage = bubble?.closest('.message');
        if (initialThinkingMessage) initialThinkingMessage.remove();
        if (activeThinkingBubble === bubble) activeThinkingBubble = null;
        bubble = null;

        createConversationPlanCard(route);
        buildCard = createWebsiteBuildCard(rawText, {
          title: route.goal,
          items: Array.isArray(route.plan) ? route.plan.map(step => step.title) : []
        });
        const project = await generateModularWebsiteProject(rawText, route, buildCard, generationSignal);
        currentGeneratedProject = project;
        renderWebsiteWorkspace(project, buildCard);
        websiteBuildCompleted = true;
        streamedText = await streamConfiguredProviderChat(buildWebsiteCompletionPrompt(rawText, project, route), {
          signal: generationSignal,
          history: priorHistory,
          route,
          system: getWebsiteCompletionSystemPrompt(),
          onStatus: (status, event = {}) => {
            const phase = String(event.phase || 'THINK').toUpperCase();
            setGenerationInspectorStatus(status || 'Preparing the build summary…', phase, 0.92);
          },
          onReasoning: updateGenerationReasoning,
          onUsage: updateGenerationUsage,
          onToken: (token, fullText) => {
            streamedText = fullText;
            updateGenerationOutputTokens(fullText);
          }
        });
        if (!streamedText.trim()) throw new Error('The AI completed the website build but returned no completion message.');
        finalAssistantText = streamedText;
        project.reply = finalAssistantText;
        appendMessageBubble('assistant', finalAssistantText, createAssistantResponseMeta(responseStartedAt, finalAssistantText, route, {
          websiteBuild: true,
          filesChanged: aggregateFileChanges(project.manifest?.changes)
            .filter(change => !isInternalWebsiteArtifact(change?.path || change?.name)).length
            || getUserVisibleWebsiteFiles(getProjectOutputFiles(project)).length,
          selfRepairs: Number(project.manifest?.selfRepairs || 0)
        }));
      } else if (route.action === 'clarify') {
        const clarificationQuestions = getClarificationQuestions(route);
        if (!clarificationQuestions.length) {
          throw new Error('The AI planner returned an incomplete clarification. Please try again.');
        }
        setGenerationInspectorStatus('Ready for your choice', 'CLARIFY', 0.72);
        finalAssistantText = clarificationQuestions.length === 1
          ? clarificationQuestions[0].question
          : `Before I build it, choose these ${clarificationQuestions.length} website preferences so I can match the theme, structure, content, and responsive behavior you want.`;
        updateGenerationOutputTokens(finalAssistantText);
        completeStreamingBubble(bubble, finalAssistantText, createAssistantResponseMeta(responseStartedAt, finalAssistantText, route, { clarification: true }));
        renderClarificationChoices(route);
      } else {
        setGenerationInspectorStatus(
          'Thinking…',
          'THINK',
          0.18
        );
        streamedText = await streamConfiguredProviderChat(rawText, {
          signal: generationSignal,
          history: priorHistory,
          route,
          system: getChatSystemPrompt(route),
          onStatus: (status, event = {}) => {
            const phase = String(event.phase || 'THINK').toUpperCase();
            setGenerationInspectorStatus(status || 'Thinking…', phase, 0.2);
            if (phase === 'REASONING') {
              setGenerationTokenBadges({ reasoningTokens: generationInspectorState.reasoningTokens, reasoningEstimated: true });
            }
          },
          onReasoning: updateGenerationReasoning,
          onUsage: updateGenerationUsage,
          onToken: (token, fullText) => {
            streamedText = fullText;
            updateStreamingBubble(bubble, streamedText, 'Writing response…');
            updateGenerationOutputTokens(fullText);
            setGenerationInspectorStatus('Writing the response…', 'GENERATE', 0.72);
          }
        });

        finalAssistantText = streamedText || 'I could not generate a response. Please try again.';
        completeStreamingBubble(bubble, finalAssistantText, createAssistantResponseMeta(responseStartedAt, finalAssistantText, route));
      }

      finalizeGenerationInspector(websiteRequest ? 'Website generated and checked' : 'Response complete', 'complete');

      await rememberChatTurn(rawText, finalAssistantText).catch(error => {
        alert(formatDatabaseIssue('Chat save failed', error));
      });
    } catch (error) {
      const stopped = activeGenerationStopped || error?.name === 'AbortError';
      if (stopped) {
        finalAssistantText = 'Generation stopped.';
        finalizeGenerationInspector('Generation stopped by user', 'stopped');
        if (buildCard && !websiteBuildCompleted) {
          const buildMeter = buildCard.querySelector('[data-build-meter]');
          if (buildMeter) buildMeter.textContent = 'Stopped';
          buildCard.classList.add('agent-build-stopped');
          if (composerPlanTracker) composerPlanTracker.dataset.state = 'stopped';
        }
        const stoppedMeta = createAssistantResponseMeta(responseStartedAt, finalAssistantText, route, { stopped: true });
        if (bubble) completeStreamingBubble(bubble, finalAssistantText, stoppedMeta);
        else appendMessageBubble('assistant', finalAssistantText, stoppedMeta);
        return;
      }

      const message = cleanGenerationErrorMessage(error?.message || 'Something went wrong while contacting the AI service.');
      finalizeGenerationInspector(cleanGenerationErrorMessage(message), 'error');
      const needsConfiguration = /api key|credential|unauthorized|401|403|connect|model is not|not configured/i.test(message);
      finalAssistantText = needsConfiguration
        ? `I could not complete the request.\n\n**Issue:** ${message}\n\n**Fix:** check the AI runtime connection and model settings.`
        : `I could not complete the request.\n\n**Issue:** ${message}\n\nPlease try again.`;
      if (buildCard && !websiteBuildCompleted) {
        markWebsiteBuildError(buildCard, message);
        if (composerPlanTracker) composerPlanTracker.dataset.state = 'error';
      }
      const errorMeta = createAssistantResponseMeta(responseStartedAt, finalAssistantText, route, { error: cleanGenerationErrorMessage(message) });
      if (bubble) completeStreamingBubble(bubble, finalAssistantText, errorMeta);
      else {
        appendMessageBubble('assistant', finalAssistantText, errorMeta);
        showNexoraToast(cleanGenerationErrorMessage(message), 'error', 8000);
      }
      await rememberChatTurn(rawText, finalAssistantText).catch(error => {
        alert(formatDatabaseIssue('Chat save failed', error));
      });
    } finally {
      setGenerationButtonState(false);
      chatInput.focus();
      scrollToBottom();
    }
  }

});
