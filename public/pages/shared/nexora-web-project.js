(function initNexoraWebProject(global) {
  'use strict';

  const SCHEMA = 'nexora.web-project';
  const VERSION = '1.0.0';
  const AI_CONTRACT_VERSION = '2026-09-07.2';
  const PATCH_SCHEMA = 'nexora.patch';
  const PATCH_VERSION = '1.0.0';
  const SUPPORTED_PATCH_OPS = Object.freeze([
    'project.update','seo.update','text.set','attribute.set','attribute.unset','class.add','class.remove',
    'scripts.set','styles.set','function.upsert','function.remove','style.set','style.unset','style.merge','responsive.merge','style.rule.upsert','style.rule.remove','motion.set','node.move',
    'token.set','token.unset','state.upsert','state.remove','interaction.upsert','interaction.remove',
    'route.upsert','route.remove','page.replace','page.remove','component.upsert','component.remove','asset.upsert','asset.remove'
  ]);
  const LEGACY_PAGE_SCHEMA = 'nexora.page-document';
  const SUPPORTED_ACTION_TYPES = Object.freeze([
    'state.set','state.toggle','state.increment',
    'class.add','class.remove','class.toggle',
    'style.set','attribute.set','text.set',
    'visibility.show','visibility.hide','navigate','url.open','scroll.to','focus',
    'form.submit','form.reset','media.play','media.pause','clipboard.write','function.call','event.emit'
  ]);
  const STATE_ACTION_TYPES = new Set(['state.set','state.toggle','state.increment']);
  const NODE_TARGET_ACTION_TYPES = new Set(['class.add','class.remove','class.toggle','style.set','attribute.set','text.set','visibility.show','visibility.hide','scroll.to','focus','form.submit','form.reset','media.play','media.pause']);
  const UNIVERSAL_SCHEMA = 'nexora.universal-page';
  const VISUAL_SCHEMA = 'nexora.visual-document';
  const VOID_TAGS = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  const RAW_TEXT_TAGS = new Set(['script','style']);
  const SAFE_TAG_RE = /^[a-z][a-z0-9-]*$/i;
  const SAFE_ATTR_RE = /^(?:[a-z_:][-a-z0-9_:.]*|data-[\w.-]+|aria-[\w.-]+)$/i;
  const DEFAULT_BREAKPOINTS = Object.freeze({ laptop: 1200, tablet: 900, mobile: 640 });
  const DEFAULT_CONDITIONS = Object.freeze({
    laptop: { type: 'media', query: '(max-width: 1200px)' },
    tablet: { type: 'media', query: '(max-width: 900px)' },
    mobile: { type: 'media', query: '(max-width: 640px)' },
    reduced_motion: { type: 'media', query: '(prefers-reduced-motion: reduce)' },
    dark_scheme: { type: 'media', query: '(prefers-color-scheme: dark)' },
    coarse_pointer: { type: 'media', query: '(pointer: coarse)' }
  });
  const BUILTIN_MOTION_PRESETS = Object.freeze({
    fade_in: { id:'fade_in', name:'Fade In', keyframes:{ '0%':{opacity:'0'}, '100%':{opacity:'1'} } },
    fade_out: { id:'fade_out', name:'Fade Out', keyframes:{ '0%':{opacity:'1'}, '100%':{opacity:'0'} } },
    fade_up: { id:'fade_up', name:'Fade Up', keyframes:{ '0%':{opacity:'0',transform:'translate3d(0, 32px, 0)'}, '100%':{opacity:'1',transform:'translate3d(0, 0, 0)'} } },
    fade_down: { id:'fade_down', name:'Fade Down', keyframes:{ '0%':{opacity:'0',transform:'translate3d(0, -32px, 0)'}, '100%':{opacity:'1',transform:'translate3d(0, 0, 0)'} } },
    slide_left: { id:'slide_left', name:'Slide From Left', keyframes:{ '0%':{opacity:'0',transform:'translate3d(-48px, 0, 0)'}, '100%':{opacity:'1',transform:'translate3d(0, 0, 0)'} } },
    slide_right: { id:'slide_right', name:'Slide From Right', keyframes:{ '0%':{opacity:'0',transform:'translate3d(48px, 0, 0)'}, '100%':{opacity:'1',transform:'translate3d(0, 0, 0)'} } },
    zoom_in: { id:'zoom_in', name:'Zoom In', keyframes:{ '0%':{opacity:'0',transform:'scale3d(.9,.9,.9)'}, '100%':{opacity:'1',transform:'scale3d(1,1,1)'} } },
    flip_3d: { id:'flip_3d', name:'3D Flip', keyframes:{ '0%':{opacity:'0',transform:'perspective(900px) rotateX(-24deg) translate3d(0,24px,-80px)'}, '100%':{opacity:'1',transform:'perspective(900px) rotateX(0deg) translate3d(0,0,0)'} } },
    tilt_in_3d: { id:'tilt_in_3d', name:'3D Tilt In', keyframes:{ '0%':{opacity:'0',transform:'perspective(1000px) rotateY(-18deg) rotateX(8deg) translate3d(-24px,20px,-90px)'}, '100%':{opacity:'1',transform:'perspective(1000px) rotateY(0deg) rotateX(0deg) translate3d(0,0,0)'} } },
    rise_3d: { id:'rise_3d', name:'3D Rise', keyframes:{ '0%':{opacity:'0',transform:'perspective(1000px) translate3d(0,46px,-120px) rotateX(10deg)'}, '100%':{opacity:'1',transform:'perspective(1000px) translate3d(0,0,0) rotateX(0deg)'} } }
  });

  function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
  // Never repair punctuation inside source strings or invent a missing document tail.
  function parseJsonDocument(text) {
    let source = String(text || '').replace(/^\uFEFF/, '').trim();
    const fence = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(source);
    if (fence) source = fence[1].trim();
    try {
      const value = JSON.parse(source);
      if (!isObject(value)) throw new Error('Expected a JSON object.');
      assertSafeKeys(value);
      return value;
    } catch (cause) {
      const error = new Error(`Invalid JSON document: ${cause.message}. Return a complete JSON object; escape quotes, backslashes and newlines in CSS/JavaScript strings.`);
      error.code = 'INVALID_JSON_DOCUMENT';
      throw error;
    }
  }
  function assertSafeKeys(value, path = '$') {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (['__proto__','prototype','constructor'].includes(key)) throw new Error(`Unsafe key at ${path}.${key}`);
      assertSafeKeys(child, `${path}.${key}`);
    }
  }
  function clone(value) {
    if (typeof structuredClone === 'function') {
      try { return structuredClone(value); } catch {}
    }
    return JSON.parse(JSON.stringify(value ?? null));
  }
  function array(value) { return Array.isArray(value) ? value : (value == null ? [] : [value]); }
  function object(value) { return isObject(value) ? value : {}; }
  function cleanString(value, fallback = '') { return typeof value === 'string' ? value : (value == null ? fallback : String(value)); }
  function safeId(value, fallback = 'node') {
    let id = cleanString(value, fallback).trim().toLowerCase().replace(/[^a-z0-9_.:-]+/g, '_').replace(/^_+|_+$/g, '');
    if (!id) id = fallback;
    if (!/^[a-z_]/.test(id)) id = `n_${id}`;
    return id.slice(0, 160);
  }
  function normalizeStateId(value, fallback = '') {
    const raw = cleanString(value || fallback).trim().replace(/^state[.:]/i, '');
    return raw ? safeId(raw, fallback || 'state') : '';
  }
  function inferStateType(value, fallback = 'string') {
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number' && Number.isFinite(value)) return 'number';
    if (Array.isArray(value)) return 'array';
    if (isObject(value)) return 'object';
    if (value == null) return fallback;
    return 'string';
  }
  function defaultForStateType(type) {
    if (type === 'boolean') return false;
    if (type === 'number') return 0;
    if (type === 'array') return [];
    if (type === 'object') return {};
    return '';
  }

  const STRUCTURAL_HTML_RE = /<\s*\/?\s*(?:a|article|aside|blockquote|br|button|div|em|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|img|input|label|li|main|nav|ol|option|p|picture|section|select|small|source|span|strong|table|tbody|td|textarea|th|thead|tr|ul|video)\b[^>]*>/i;
  const ESCAPED_STRUCTURAL_HTML_RE = /&lt;\s*\/?\s*(?:a|article|aside|blockquote|button|div|em|h[1-6]|img|input|label|li|option|p|section|select|span|strong|table|td|th|tr|ul)\b[^&]*&gt;/i;
  function containsStructuralMarkup(value) {
    const text = cleanString(value);
    return Boolean(text && (STRUCTURAL_HTML_RE.test(text) || ESCAPED_STRUCTURAL_HTML_RE.test(text)));
  }
  function containsMarkdownFormatting(value) {
    const text = cleanString(value);
    return /(?:^|\s)\*\*[^*\n]{1,180}\*\*(?:\s|$)/.test(text) || /(?:^|\s)#{1,6}\s+\S/.test(text);
  }
  function motionPreferenceFromPrompt(value = '') {
    const text = cleanString(value).toLowerCase();
    if (/\b(?:no|without|disable|disabled|avoid)\s+(?:animations?|motion|transitions?)\b|\bstatic\s+(?:only|design|page)\b/.test(text)) return 'none';
    if (/\b(?:animations?|motion|transition|3d|parallax|fade|slide|reveal|microinteraction|micro-interaction|hover effect|scroll effect)\b/.test(text)) return 'explicit';
    return 'baseline';
  }
  function isMotionCandidate(node) {
    if (!node || node.kind !== 'element') return false;
    const type = cleanString(node.type).toLowerCase();
    const tag = cleanString(node.tag).toLowerCase();
    if (['root','input','textarea','option','source','script','style'].includes(type) || ['main','input','textarea','option','source','script','style'].includes(tag)) return false;
    return ['section','hero','card','article','heading','title','image','figure','blockquote','form','footer','header'].includes(type) || ['section','article','figure','blockquote','form','footer','header','h1','h2','h3'].includes(tag);
  }
  function ensureGenerationMotion(project, options, note) {
    if (cleanString(options.mode).toLowerCase() !== 'generation') return;
    const preference = motionPreferenceFromPrompt(options.prompt || '');
    if (preference === 'none') return;
    Object.values(project.pages || {}).forEach(page => {
      const candidates = Object.values(page.nodes || {}).filter(isMotionCandidate);
      const existing = candidates.filter(node => node.motion?.enter).length;
      const target = Math.min(preference === 'explicit' ? 8 : 5, Math.max(preference === 'explicit' ? 3 : 2, Math.ceil(candidates.length * (preference === 'explicit' ? 0.30 : 0.16))));
      let remaining = Math.max(0, target - existing);
      let stagger = 0;
      for (const node of candidates) {
        if (!remaining) break;
        if (node.motion?.enter) continue;
        const isHero = cleanString(node.type).toLowerCase() === 'hero' || /hero/.test(cleanString(node.semanticKey || node.id));
        const preset = preference === 'explicit' && isHero ? 'rise_3d' : 'fade_up';
        node.motion = object(node.motion);
        node.motion.enter = {
          preset,
          trigger: 'in-view',
          duration: isHero ? '820ms' : '680ms',
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          delay: `${Math.min(stagger * 70, 280)}ms`,
          iterationCount: '1', fillMode: 'both', once: true
        };
        stagger += 1;
        remaining -= 1;
        note('motion.generation-default-added', `Added restrained ${preset} entrance motion to ${node.id} because the generated page did not provide enough editable motion.`);
      }
      Object.values(page.nodes || {}).forEach(node => {
        if (node.kind !== 'element') return;
        const tag = cleanString(node.tag).toLowerCase();
        const type = cleanString(node.type).toLowerCase();
        if (!['button','a'].includes(tag) && !['button','link','card'].includes(type)) return;
        if (node.motion?.hover?.declarations && Object.keys(node.motion.hover.declarations).length) return;
        node.motion = object(node.motion);
        node.motion.hover = {
          declarations: { transform: ['button','a'].includes(tag) || ['button','link'].includes(type) ? 'translate3d(0,-2px,0)' : 'translate3d(0,-4px,0)' },
          transition: 'transform 180ms ease, box-shadow 180ms ease, filter 180ms ease'
        };
      });
    });
  }
  function ensureGenerationResponsiveFallbacks(project, options, note) {
    if (cleanString(options.mode).toLowerCase() !== 'generation') return;
    Object.values(project.pages || {}).forEach(page => Object.values(page.nodes || {}).forEach(node => {
      if (node.kind !== 'element') return;
      const base = object(node.style?.base);
      const responsive = node.style.responsive = object(node.style?.responsive);
      const mobile = { ...object(responsive.mobile) };
      let mobileChanged = false;
      const display = cleanString(base.display).toLowerCase();
      if (display === 'grid' && !mobile['grid-template-columns']) {
        const columns = cleanString(base['grid-template-columns']);
        if (/repeat\(|\s+/.test(columns) && columns !== '1fr') {
          mobile['grid-template-columns'] = '1fr';
          mobileChanged = true;
          note('responsive.mobile-grid-fallback', `Added one-column mobile fallback to ${node.id}.`);
        }
      }
      if (display === 'flex' && cleanString(base['flex-direction'] || 'row').toLowerCase() === 'row' && array(node.children).length >= 2) {
        const type = cleanString(node.type).toLowerCase();
        const tag = cleanString(node.tag).toLowerCase();
        if (!['nav','navbar'].includes(type) && tag !== 'nav' && !mobile['flex-direction']) {
          mobile['flex-direction'] = 'column';
          mobileChanged = true;
          note('responsive.mobile-flex-fallback', `Added stacked mobile fallback to ${node.id}.`);
        }
      }
      if (mobileChanged || Object.keys(mobile).length) responsive.mobile = mobile;
      if (cleanString(node.tag).toLowerCase() === 'img') {
        if (!base['max-width']) base['max-width'] = '100%';
        if (!base.height) base.height = 'auto';
        if (!base.display) base.display = 'block';
      }
    }));
  }

  function uniqueId(base, used) {
    const stem = safeId(base || 'node');
    let value = stem;
    let index = 2;
    while (used.has(value)) value = `${stem}_${index++}`;
    used.add(value);
    return value;
  }
  function escapeHtml(value) {
    return cleanString(value).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  }
  function escapeAttr(value) { return escapeHtml(value).replace(/`/g, '&#96;'); }
  function escapeCssAttr(value) { return cleanString(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }
  function camelToKebab(prop = '') {
    if (prop.startsWith('--')) return prop;
    return cleanString(prop).replace(/[A-Z]/g, ch => `-${ch.toLowerCase()}`).replace(/^ms-/, '-ms-');
  }
  function kebabToCamel(prop = '') { return cleanString(prop).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase()); }
  function normalizeDeclarations(input = {}) {
    const out = {};
    Object.entries(object(input)).forEach(([key, value]) => {
      if (value == null || value === '') return;
      if (isObject(value)) return;
      out[camelToKebab(key)] = Array.isArray(value) ? value.filter(v => typeof v === 'string' || typeof v === 'number').map(String) : String(value);
    });
    return out;
  }
  function declarationsToCamel(input = {}) {
    const out = {};
    Object.entries(normalizeDeclarations(input)).forEach(([key, value]) => { out[kebabToCamel(key)] = value; });
    return out;
  }
  function cssDeclarations(input = {}) {
    return Object.entries(normalizeDeclarations(input)).flatMap(([key, value]) => array(value).map(v => `${key}:${replaceTokenRefs(v)};`)).join('');
  }
  function flattenTokens(tokens, prefix = [], out = {}) {
    Object.entries(object(tokens)).forEach(([key, value]) => {
      const path = [...prefix, key];
      if (isObject(value) && Object.prototype.hasOwnProperty.call(value, 'value')) {
        if (value.value != null && !isObject(value.value) && !Array.isArray(value.value)) out[path.join('.')] = String(value.value);
        return;
      }
      if (isObject(value)) flattenTokens(value, path, out);
      else if (value != null && !Array.isArray(value)) out[path.join('.')] = String(value);
    });
    return out;
  }
  function tokenCssVar(path) { return `--nx-${cleanString(path).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase()}`; }
  function replaceTokenRefs(value) {
    if (typeof value !== 'string') return value;
    return value.replace(/token\(([^)]+)\)/g, (_, raw) => `var(${tokenCssVar(raw.trim())})`);
  }
  function normalizeStyle(style = {}) {
    const src = object(style);
    const base = normalizeDeclarations(src.base || src.styles || src.style || (src.rules || src.responsive || src.states ? {} : src));
    const responsive = {};
    Object.entries(object(src.responsive)).forEach(([key, value]) => {
      const decl = normalizeDeclarations(value?.declarations || value?.style || value?.styles || value);
      if (Object.keys(decl).length) responsive[key] = decl;
    });
    const rules = array(src.rules).filter(isObject).map((rule, index) => ({
      id: safeId(rule.id || `style_rule_${index + 1}`),
      selector: cleanString(rule.selector || '&'),
      conditionIds: array(rule.conditionIds || rule.conditions).map(String),
      declarations: normalizeDeclarations(rule.declarations || rule.style || rule.styles),
      order: Number.isFinite(Number(rule.order)) ? Number(rule.order) : index
    })).filter(rule => Object.keys(rule.declarations).length);
    Object.entries(object(src.states)).forEach(([state, value]) => {
      const declarations = normalizeDeclarations(value?.declarations || value?.style || value);
      if (Object.keys(declarations).length) rules.push({ id: safeId(`state_${state}_${rules.length}`), selector: `&:${state}`, conditionIds: [], declarations, order: rules.length });
    });
    return { base, responsive, rules };
  }
  function normalizeMotionKeyframes(value) {
    if (Array.isArray(value)) {
      return value.filter(isObject).map(frame => {
        const out = {};
        Object.entries(frame).forEach(([key, item]) => {
          if (['offset','easing','composite'].includes(key)) out[key] = item;
          else if (item != null && !isObject(item) && !Array.isArray(item)) out[camelToKebab(key)] = replaceTokenRefs(String(item));
        });
        return out;
      });
    }
    const frames = {};
    Object.entries(object(value)).forEach(([step, declarations]) => {
      const normalized = normalizeDeclarations(declarations);
      if (Object.keys(normalized).length) frames[step] = normalized;
    });
    return frames;
  }
  function normalizeMotionTiming(timing = {}, fallback = {}) {
    const src = { ...object(fallback), ...object(timing) };
    const iterations = src.iterations ?? src.iterationCount ?? 1;
    return {
      duration: src.duration ?? '650ms',
      delay: src.delay ?? '0ms',
      easing: cleanString(src.easing || 'cubic-bezier(0.22, 1, 0.36, 1)'),
      iterations: iterations === 'infinite' ? 'infinite' : (Number.isFinite(Number(iterations)) ? Number(iterations) : 1),
      direction: ['normal','reverse','alternate','alternate-reverse'].includes(src.direction) ? src.direction : 'normal',
      fill: ['none','forwards','backwards','both','auto'].includes(src.fill || src.fillMode) ? (src.fill || src.fillMode) : 'both',
      playbackRate: Number.isFinite(Number(src.playbackRate)) ? Number(src.playbackRate) : 1,
      composite: ['replace','add','accumulate'].includes(src.composite) ? src.composite : 'replace',
      iterationComposite: ['replace','accumulate'].includes(src.iterationComposite) ? src.iterationComposite : 'replace'
    };
  }
  function normalizeMotionTrigger(trigger = {}, fallbackType = 'load') {
    const src = typeof trigger === 'string' ? { type:trigger } : object(trigger);
    const allowed = ['load','in-view','hover','focus','click','pointer-enter','pointer-leave','scroll','view','custom'];
    const type = allowed.includes(src.type) ? src.type : (allowed.includes(fallbackType) ? fallbackType : 'load');
    const threshold = Array.isArray(src.threshold) ? src.threshold.map(Number).filter(Number.isFinite) : (Number.isFinite(Number(src.threshold)) ? Number(src.threshold) : 0.12);
    return {
      type,
      event: cleanString(src.event || src.name || ''),
      once: src.once !== false,
      threshold,
      rootMargin: cleanString(src.rootMargin || '0px 0px -6% 0px'),
      sourceNodeId: src.sourceNodeId ? safeId(src.sourceNodeId) : null,
      axis: ['block','inline','x','y'].includes(src.axis) ? src.axis : 'y',
      start: src.start ?? 0,
      end: src.end ?? 1,
      scrub: src.scrub ?? true,
      reverseOnExit: Boolean(src.reverseOnExit)
    };
  }
  function normalizeMotionEffect(effect = {}, index = 0, ownerNodeId = '') {
    if (!isObject(effect)) return null;
    const id = safeId(effect.id || `${ownerNodeId || 'motion'}_effect_${index + 1}`);
    const keyframes = normalizeMotionKeyframes(effect.keyframes || effect.frames || {});
    const preset = effect.preset ? safeId(effect.preset) : '';
    if (!preset && !(Array.isArray(keyframes) ? keyframes.length : Object.keys(keyframes).length)) return null;
    return {
      ...clone(effect), id, name: cleanString(effect.name || id), targetNodeId: effect.targetNodeId ? safeId(effect.targetNodeId) : null, preset,
      keyframes, timing: normalizeMotionTiming(effect.timing || effect.options || effect), trigger: normalizeMotionTrigger(effect.trigger || effect.on || 'load'),
      reducedMotion: ['skip','final-frame','allow'].includes(effect.reducedMotion) ? effect.reducedMotion : 'skip',
      transformOrigin: cleanString(effect.transformOrigin || ''), perspective: cleanString(effect.perspective || ''), willChange: cleanString(effect.willChange || ''), enabled: effect.enabled !== false
    };
  }
  function normalizeMotionTimeline(timeline = {}, index = 0) {
    if (!isObject(timeline)) return null;
    const id = safeId(timeline.id || `timeline_${index + 1}`);
    return {
      ...clone(timeline), id, name: cleanString(timeline.name || id), trigger: normalizeMotionTrigger(timeline.trigger || 'load'),
      steps: array(timeline.steps).filter(isObject).map(step => ({...clone(step),effectId:safeId(step.effectId || step.motionId || ''),nodeId:step.nodeId?safeId(step.nodeId):null,at:step.at ?? null,delay:step.delay ?? 0})).filter(step=>step.effectId),
      repeat: timeline.repeat ?? 0, yoyo:Boolean(timeline.yoyo), reducedMotion:['skip','final-frame','allow'].includes(timeline.reducedMotion)?timeline.reducedMotion:'skip'
    };
  }
  function normalizeMotion(motion = {}) {
    if (!isObject(motion)) return {};
    const out = clone(motion);
    if (out.enter && isObject(out.enter)) {
      const enterFrames = normalizeMotionKeyframes(out.enter.keyframes || {});
      const normalizedEnter = {
        preset: safeId(out.enter.preset || out.enter.animation || 'fade_in'),
        trigger: ['load','in-view'].includes(out.enter.trigger) ? out.enter.trigger : 'load',
        duration: cleanString(out.enter.duration || '700ms'),
        easing: cleanString(out.enter.easing || 'cubic-bezier(0.22, 1, 0.36, 1)'),
        delay: cleanString(out.enter.delay || '0ms'),
        iterationCount: cleanString(out.enter.iterationCount || out.enter.iterations || '1'),
        fillMode: cleanString(out.enter.fillMode || out.enter.fill || 'both'),
        direction: ['normal','reverse','alternate','alternate-reverse'].includes(out.enter.direction) ? out.enter.direction : 'normal',
        once: out.enter.once !== false
      };
      const hasEnterFrames = Array.isArray(enterFrames) ? enterFrames.length > 0 : Object.keys(enterFrames || {}).length > 0;
      if (hasEnterFrames) normalizedEnter.keyframes = enterFrames;
      out.enter = normalizedEnter;
    }
    if (out.hover && isObject(out.hover)) out.hover = { declarations: normalizeDeclarations(out.hover.declarations || out.hover.style || out.hover), transition: cleanString(out.hover.transition || '') };
    const ownerNodeId = cleanString(out.ownerNodeId || '');
    out.effects = array(out.effects).map((effect,index)=>normalizeMotionEffect(effect,index,ownerNodeId)).filter(Boolean);
    out.timelineIds = array(out.timelineIds || out.timelines).map(value=>safeId(typeof value==='string'?value:value?.id||'')).filter(Boolean);
    out.reducedMotion = ['skip','final-frame','allow'].includes(out.reducedMotion) ? out.reducedMotion : 'skip';
    delete out.ownerNodeId;
    return out;
  }

  function normalizeAccessibility(node = {}) {
    const a11y = object(node.accessibility);
    const aria = { ...object(a11y.aria) };
    Object.entries(object(node.attributes)).forEach(([key, value]) => { if (key.startsWith('aria-') && aria[key.slice(5)] == null) aria[key.slice(5)] = value; });
    return {
      role: a11y.role ?? node.role ?? null,
      label: a11y.label ?? null,
      labelledBy: a11y.labelledBy ?? null,
      describedBy: a11y.describedBy ?? null,
      tabIndex: a11y.tabIndex ?? null,
      aria
    };
  }
  function normalizeEditor(node = {}) {
    const editor = object(node.editor);
    const constraints = object(node.constraints);
    const bool = (key, fallback) => editor[key] ?? constraints[key] ?? fallback;
    return {
      selectable: bool('selectable', true), editable: bool('editable', true), draggable: bool('draggable', true), droppable: bool('droppable', true),
      resizable: bool('resizable', true), deletable: bool('deletable', true), locked: bool('locked', false), hiddenInLayers: bool('hiddenInLayers', false),
      layoutBehavior: cleanString(editor.layoutBehavior || 'flow'), allowedChildren: array(editor.allowedChildren || ['*']), allowedParents: array(editor.allowedParents || ['*']),
      resize: { horizontal: editor.resize?.horizontal !== false, vertical: editor.resize?.vertical !== false, preserveAspectRatio: Boolean(editor.resize?.preserveAspectRatio) },
      snap: { enabled: editor.snap?.enabled !== false, grid: editor.snap?.grid !== false, siblings: editor.snap?.siblings !== false },
      constraints: clone(editor.constraints || constraints || {}), label: cleanString(editor.label ?? node.name ?? '')
    };
  }
  function defaultTagForType(type) {
    const map = { root:'main', section:'section', hero:'section', navbar:'nav', nav:'nav', header:'header', footer:'footer', sidebar:'aside', card:'article', article:'article', heading:'h2', title:'h2', paragraph:'p', text:'span', strong:'strong', emphasis:'em', em:'em', small:'small', label:'label', button:'button', link:'a', image:'img', figure:'figure', figcaption:'figcaption', blockquote:'blockquote', input:'input', select:'select', option:'option', textarea:'textarea', form:'form', list:'ul', ordered_list:'ol', item:'li', badge:'span', video:'video', audio:'audio', canvas:'canvas', iframe:'iframe', svg:'svg', path:'path' };
    return map[cleanString(type).toLowerCase()] || 'div';
  }

  function normalizePage(pageInput, pageIndex, projectContext) {
    const page = object(pageInput);
    const used = projectContext.usedNodeIds;
    const nodes = {};
    const localOriginalToCanonical = new Map();
    function walk(rawInput, parentId = null, suggestedId = '') {
      if (rawInput == null) return null;
      if (typeof rawInput === 'string' || typeof rawInput === 'number') {
        const id = uniqueId(suggestedId || `text_${Object.keys(nodes).length + 1}`, used);
        nodes[id] = { id, kind:'text', type:'text', tag:null, namespace:'html', name:'Text', text:String(rawInput), classes:[], attributes:{}, properties:{}, dataset:{}, style:{base:{},responsive:{},rules:[]}, motion:{}, children:[], bindings:[], interactionIds:[], accessibility:{role:null,label:null,labelledBy:null,describedBy:null,tabIndex:null,aria:{}}, editor:normalizeEditor({ name:'Text' }), extensions:{} };
        return id;
      }
      const raw = object(rawInput);
      const nxMeta = object(raw.nxMeta);
      const originalId = cleanString(raw.id || raw.key || nxMeta.semanticKey || suggestedId || `node_${Object.keys(nodes).length + 1}`);
      const id = uniqueId(originalId, used);
      localOriginalToCanonical.set(originalId, id);
      const kind = ['element','text','component-instance','raw-html'].includes(raw.kind) ? raw.kind : (raw.type === 'text-node' ? 'text' : 'element');
      const type = cleanString(raw.type || raw.kind || 'container');
      const tagCandidate = cleanString(raw.tag || defaultTagForType(type));
      const tag = kind === 'text' ? null : (SAFE_TAG_RE.test(tagCandidate) ? tagCandidate : defaultTagForType(type));
      const attributes = { ...object(raw.attrs), ...object(raw.attributes) };
      const classes = [...new Set([...(Array.isArray(raw.classes) ? raw.classes : []), ...cleanString(raw.className || attributes.class || '').split(/\s+/)].filter(Boolean))];
      delete attributes.class;
      const text = cleanString(raw.text ?? raw.content?.text ?? (typeof raw.content === 'string' ? raw.content : ''));
      const explicitInteractionIds = array(raw.interactionIds).map(item => typeof item === 'string' ? item : item?.id).filter(Boolean).map(safeId);
      const inlineInteractionInputs = Array.isArray(raw.interactions)
        ? raw.interactions.filter(isObject)
        : Object.values(object(raw.interactions)).filter(isObject);
      const node = {
        id, semanticKey: cleanString(raw.semanticKey || nxMeta.semanticKey || originalId), kind: cleanString(nxMeta.kind || kind), type, namespace: cleanString(raw.namespace || nxMeta.namespace || 'html'), tag,
        name: cleanString(raw.name || raw.label || type || tag || 'Element'), text,
        html: kind === 'raw-html' ? cleanString(raw.html || raw.content?.html || '') : undefined,
        classes, attributes, properties: clone(object(raw.properties || nxMeta.properties)), dataset: clone(object(raw.dataset || nxMeta.dataset)), assetRef: (raw.assetRef || raw.assetId || nxMeta.assetRef) ? safeId(raw.assetRef || raw.assetId || nxMeta.assetRef) : null,
        componentId: (raw.componentId || nxMeta.componentId) ? safeId(raw.componentId || nxMeta.componentId) : null, props: clone(object(raw.props || nxMeta.props)), slots: clone(object(raw.slots || nxMeta.slots)), overrides: clone(object(raw.overrides || nxMeta.overrides)),
        style: normalizeStyle(raw.style || { base: raw.styles || {}, responsive: raw.responsive || {}, states: raw.states || {}, rules: raw.styleRules || [] }),
        motion: normalizeMotion({ ownerNodeId:id, ...(raw.motion || (Array.isArray(raw.animations) && raw.animations.length ? { enter: raw.animations[0] } : {})) }),
        bindings: array(raw.bindings).filter(isObject).map(clone), interactionIds: explicitInteractionIds,
        accessibility: normalizeAccessibility(raw), editor: normalizeEditor(raw), children: [], extensions: clone(object(raw.extensions || nxMeta.extensions))
      };
      nodes[id] = node;
      inlineInteractionInputs.forEach((candidate, interactionIndex) => {
        const eventType = safeId(candidate.event?.type || candidate.type || 'click');
        const interactionId = uniqueId(candidate.id || `${id}_${eventType}_${interactionIndex + 1}`, projectContext.usedInteractionIds);
        const interaction = clone(candidate);
        interaction.id = interactionId;
        interaction.targetNodeId = interaction.targetNodeId ? safeId(interaction.targetNodeId) : id;
        interaction.event = isObject(interaction.event) ? interaction.event : { type: cleanString(candidate.event || candidate.type || 'click') };
        interaction.actions = array(interaction.actions).filter(isObject).map(clone);
        projectContext.inlineInteractions.push(interaction);
        node.interactionIds.push(interactionId);
      });
      node.interactionIds = [...new Set(node.interactionIds)];
      const childInputs = Array.isArray(raw.children) ? raw.children : (Array.isArray(raw.nodes) ? raw.nodes : []);
      childInputs.forEach((child, childIndex) => {
        const childId = walk(child, id, `${id}_child_${childIndex + 1}`);
        if (childId) node.children.push(childId);
      });
      return id;
    }

    const pageId = safeId(page.id || `page_${pageIndex + 1}`);
    let rootNodeId = null;
    if (isObject(page.nodes)) {
      const rawMap = page.nodes;
      Object.entries(rawMap).forEach(([rawId, rawNode]) => {
        if (isObject(rawNode)) walk({ ...rawNode, id: rawNode.id || rawId, children: [] }, null, rawId);
      });
      // Rebuild child references for map-form documents after all ids are assigned.
      Object.entries(rawMap).forEach(([rawId, rawNode]) => {
        const canonicalId = localOriginalToCanonical.get(cleanString(rawNode?.id || rawId));
        if (!canonicalId || !nodes[canonicalId]) return;
        const rawChildren = Array.isArray(rawNode?.children) ? rawNode.children : [];
        if (rawChildren.every(child => typeof child === 'string')) nodes[canonicalId].children = rawChildren.map(child => localOriginalToCanonical.get(String(child)) || safeId(child)).filter(childId => nodes[childId]);
      });
      rootNodeId = localOriginalToCanonical.get(cleanString(page.rootNodeId || page.root || '')) || null;
    } else {
      const sourceNodes = Array.isArray(page.nodes) ? page.nodes : (Array.isArray(page.elements) ? page.elements : []);
      if (sourceNodes.length === 1 && (sourceNodes[0]?.type === 'root' || sourceNodes[0]?.kind === 'root')) rootNodeId = walk(sourceNodes[0], null, `${pageId}_root`);
      else {
        rootNodeId = uniqueId(`${pageId}_root`, used);
        nodes[rootNodeId] = {
          id: rootNodeId, semanticKey:'root', kind:'element', type:'root', namespace:'html', tag:'main', name:'Page Root', text:'', classes:[], attributes:{}, properties:{}, dataset:{}, assetRef:null,
          style: normalizeStyle({ base: page.layout || { display:'flex', flexDirection:'column', minHeight:'100vh', width:'100%' } }), motion:{}, bindings:[], interactionIds:[], accessibility:normalizeAccessibility({}), editor:normalizeEditor({ name:'Page Root', constraints:{ deletable:false } }), children:[], extensions:{}
        };
        sourceNodes.forEach((child, childIndex) => { const childId = walk(child, rootNodeId, `${pageId}_section_${childIndex + 1}`); if (childId) nodes[rootNodeId].children.push(childId); });
      }
    }
    if (!rootNodeId || !nodes[rootNodeId]) {
      const candidates = Object.values(nodes);
      const referenced = new Set(candidates.flatMap(node => node.children));
      rootNodeId = candidates.find(node => !referenced.has(node.id))?.id || candidates[0]?.id || uniqueId(`${pageId}_root`, used);
      if (!nodes[rootNodeId]) nodes[rootNodeId] = { id:rootNodeId, semanticKey:'root', kind:'element', type:'root', namespace:'html', tag:'main', name:'Page Root', text:'', classes:[], attributes:{}, properties:{}, dataset:{}, assetRef:null, style:normalizeStyle({base:{display:'flex',flexDirection:'column',minHeight:'100vh',width:'100%'}}), motion:{}, bindings:[], interactionIds:[], accessibility:normalizeAccessibility({}), editor:normalizeEditor({name:'Page Root',constraints:{deletable:false}}), children:[], extensions:{} };
    }
    return {
      id: pageId, name: cleanString(page.name || page.title || `Page ${pageIndex + 1}`), slug: cleanString(page.slug || (pageIndex === 0 ? 'index' : pageId.replace(/^page_/,''))), type: cleanString(page.type || 'page'),
      routeId: page.routeId || null, language: cleanString(page.language || page.lang || 'en'), seo: clone(object(page.seo)), canvas: clone(object(page.canvas)), rootNodeId, nodes,
      globalStyles: clone(object(page.globalStyles || page.styles)), metadata: clone(object(page.metadata)), extensions: clone(object(page.extensions))
    };
  }

  function migrateLegacyPageDocument(input = {}) {
    const src = object(input);
    return {
      schema: SCHEMA, version: VERSION,
      project: { id: safeId(src.meta?.id || 'project_generated'), name: src.meta?.title || 'Generated Website', description: src.meta?.description || '', kind:'website', language:src.meta?.language || 'en', generator:clone(src.meta?.generator || {}), metadata:{ migratedFrom:LEGACY_PAGE_SCHEMA } },
      intent: clone(src.intent || {}),
      tokens: clone(src.tokens || {}), conditions: {}, routes: clone(src.routes || []), assets: clone(src.assets || []), components: clone(src.components || []),
      pages: clone(src.pages || []), styles: clone(src.styles || {}), motion: clone(src.motion || {}), logic: { state: clone(src.state || {}), interactions: clone(src.interactions || []), functions:{} },
      data: clone(src.data || {}), scripts: clone(src.scripts || {}), editor: clone(src.editor || {}), compiler: clone(src.compiler || {}), extensions: clone(src.extensions || {})
    };
  }

  function migrateUniversalPage(input = {}) {
    const src = object(input);
    const page = object(src.page || src.website || src.document || src);
    return {
      schema:SCHEMA, version:VERSION, project:{id:'project_imported',name:page.title || page.name || 'Imported Website',description:page.description || '',kind:'website',language:page.language || 'en',metadata:{migratedFrom:UNIVERSAL_SCHEMA}},
      tokens: clone(page.theme || src.theme || {}), conditions:{}, routes:[{id:'route_home',path:'/',pageId:'page_home',title:page.title || 'Home'}], assets:clone(page.assets || src.assets || {}), components:{},
      pages:[{id:'page_home',name:page.name || 'Home',slug:page.slug || 'index',language:page.language || 'en',seo:{title:page.title || 'Home',description:page.description || ''},layout:page.rootStyles || page.rootStyle || {display:'flex',flexDirection:'column',minHeight:'100vh'},nodes:clone(page.elements || page.children || page.sections || []) ,globalStyles:clone(page.styles || {})}],
      styles:clone(page.styles || {}),motion:{},logic:{state:{},interactions:clone(page.interactions || src.interactions || []),functions:{}},data:{},scripts:{customBlocks:clone(page.scripts || src.scripts || [])},editor:{},compiler:{},extensions:{}
    };
  }

  function migrateVisualDocument(input = {}) {
    const src = object(input);
    const pages = Object.values(object(src.pages)).map((page, index) => {
      const elements = object(page.elements);
      const build = (id, seen = new Set()) => {
        if (!elements[id] || seen.has(id)) return null;
        seen.add(id);
        const el = elements[id];
        return { id:el.id || id, type:el.type || 'container', tag:el.tag || defaultTagForType(el.type), name:el.name || el.type || id, text:el.text || el.content?.text || '', attributes:clone(el.attributes || el.attrs || {}), styles:clone(el.style || el.styles || {}), responsive:clone(el.responsive || {}), states:clone(el.states || {}), interactions:clone(el.interactions || []), animations:clone(el.animations || []), accessibility:clone(el.accessibility || {}), editor:clone(el.editor || el.constraints || {}), children:array(el.children).map(childId => build(childId, new Set(seen))).filter(Boolean) };
      };
      const root = build(page.root) || { id:`page_${index}_root`,type:'root',tag:'main',children:Object.keys(elements).filter(id => id !== page.root).map(id => build(id)).filter(Boolean) };
      return { id:safeId(page.id || `page_${index+1}`),name:page.name || `Page ${index+1}`,slug:page.path?.replace(/\.html$/,'') || (index===0?'index':`page-${index+1}`),seo:clone(page.seo || {}),nodes:[root] };
    });
    return { schema:SCHEMA,version:VERSION,project:{id:safeId(src.document?.id || 'project_imported'),name:src.document?.name || 'Imported Website',kind:'website',metadata:{migratedFrom:VISUAL_SCHEMA}},tokens:clone(src.theme?.tokens || {}),conditions:{},routes:pages.map((p,i)=>({id:`route_${p.id}`,path:i===0?'/':`/${p.slug}`,pageId:p.id,title:p.name})),assets:clone(src.assets||{}),components:clone(src.components||{}),pages,styles:{},motion:{},logic:{state:{},interactions:clone(src.interactions||[]),functions:{}},data:{sources:clone(src.dataSources||{})},scripts:{},editor:{},compiler:clone(src.compiler||{}),extensions:{} };
  }

  function normalizeProject(input = {}, options = {}) {
    assertSafeKeys(input);
    if (input.schema === SCHEMA && input.version !== VERSION) throw new Error(`Unsupported web-project version ${input.version}. Expected ${VERSION}.`);
    let source = clone(input || {});
    if (source.schema === LEGACY_PAGE_SCHEMA) source = migrateLegacyPageDocument(source);
    else if (source.schema === UNIVERSAL_SCHEMA || source.page?.elements) source = migrateUniversalPage(source);
    else if (source.schema === VISUAL_SCHEMA) source = migrateVisualDocument(source);
    else if (source.webProject?.schema === SCHEMA) source = clone(source.webProject);
    if (source.schema !== SCHEMA) source = { ...source, schema:SCHEMA, version:VERSION };

    const usedNodeIds = new Set();
    const declaredInteractionInput = source.logic?.interactions || source.interactions || [];
    const declaredInteractionItems = Array.isArray(declaredInteractionInput)
      ? declaredInteractionInput
      : Object.entries(object(declaredInteractionInput)).map(([id, value]) => ({ ...object(value), id: value?.id || id }));
    const usedInteractionIds = new Set(declaredInteractionItems.map(item => safeId(item?.id || '')).filter(Boolean));
    const inlineInteractions = [];
    const projectInput = object(source.project);
    const projectId = safeId(projectInput.id || options.projectId || 'project_generated');
    const project = {
      id:projectId, revision:cleanString(projectInput.revision || 'rev_1'), name:cleanString(projectInput.name || source.meta?.title || options.projectName || 'Generated Website'), description:cleanString(projectInput.description || source.meta?.description || ''),
      kind:cleanString(projectInput.kind || 'website'), language:cleanString(projectInput.language || source.meta?.language || 'en'), direction:cleanString(projectInput.direction || 'ltr'),
      createdAt:projectInput.createdAt || null, updatedAt:projectInput.updatedAt || null, generator:clone(object(projectInput.generator || source.meta?.generator)), compatibility:clone(object(projectInput.compatibility)), metadata:clone(object(projectInput.metadata))
    };
    const pagesInput = Array.isArray(source.pages) ? source.pages : Object.entries(object(source.pages)).map(([id, page]) => ({ ...object(page), id:page?.id || id }));
    const pages = {};
    (pagesInput.length ? pagesInput : [{id:'page_home',name:'Home',slug:'index',nodes:[]}]).forEach((pageInput, index) => {
      const page = normalizePage(pageInput, index, { usedNodeIds, usedInteractionIds, inlineInteractions });
      let id = page.id;
      if (pages[id]) id = safeId(`${id}_${index+1}`);
      page.id = id;
      pages[id] = page;
    });
    // Synthesized roots and primitive text nodes must have the same shape as authored nodes.
    Object.values(pages).forEach(page=>Object.values(page.nodes).forEach(node=>{
      for(const [key,value] of Object.entries({semanticKey:node.id,assetRef:null,componentId:null,props:{},slots:{},overrides:{},properties:{},dataset:{}})) {
        if(node[key]===undefined)node[key]=value;
      }
    }));
    const firstPageId = Object.keys(pages)[0];
    const routesInput = Array.isArray(source.routes) ? source.routes : Object.values(object(source.routes));
    const routes = {};
    (routesInput.length ? routesInput : [{id:'route_home',path:'/',pageId:firstPageId,title:pages[firstPageId]?.name || 'Home'}]).forEach((route,index)=>{
      const id = safeId(route.id || `route_${index+1}`);
      routes[id] = { id, path:cleanString(route.path || (index===0?'/':`/${pages[route.pageId]?.slug || index+1}`)), pageId:safeId(route.pageId || firstPageId), title:cleanString(route.title || pages[route.pageId]?.name || 'Page'), output:cleanString(route.output || (index===0?'index.html':`${pages[route.pageId]?.slug || `page-${index+1}`}.html`)), seo:clone(object(route.seo)), redirectTo:route.redirectTo || null, metadata:clone(object(route.metadata)) };
    });
    const conditions = { ...clone(DEFAULT_CONDITIONS), ...clone(object(source.conditions)) };
    const breakpointTokens = object(source.tokens?.breakpoints);
    Object.entries({ ...DEFAULT_BREAKPOINTS, ...breakpointTokens }).forEach(([key,value]) => {
      const numeric = Number(isObject(value) ? value.value : value);
      if (Number.isFinite(numeric) && numeric > 0) conditions[key] = { type:'media', query:`(max-width: ${numeric}px)` };
    });
    const normalizeNamedMap = (value, prefix) => {
      const out = {};
      const items = Array.isArray(value) ? value : Object.entries(object(value)).map(([id,v])=>({ ...object(v), id:v?.id || id }));
      items.forEach((item,index)=>{ const id=safeId(item.id || `${prefix}_${index+1}`); out[id]={...clone(item),id}; });
      return out;
    };
    const interactions = normalizeNamedMap(source.logic?.interactions || source.interactions || [], 'interaction');
    inlineInteractions.forEach(candidate => { interactions[candidate.id] = { ...clone(candidate), id: candidate.id }; });
    Object.values(interactions).forEach(interaction => {
      if (interaction.targetNodeId) interaction.targetNodeId = safeId(interaction.targetNodeId);
      interaction.actions = array(interaction.actions).filter(isObject).map(action => {
        const next = clone(action);
        ['functionId','routeId','nodeId','targetNodeId'].forEach(key => { if (next[key]) next[key] = safeId(next[key]); });
        const stateRef = next.stateId || next.stateKey || next.state?.id || (STATE_ACTION_TYPES.has(next.type) ? next.path : '');
        if (stateRef) next.stateId = normalizeStateId(stateRef);
        if (isObject(next.state)) {
          next.state = { ...clone(next.state), id: normalizeStateId(next.state.id || next.stateId), type: cleanString(next.state.type || ''), default: next.state.default };
        }
        return next;
      });
    });
    const functions = normalizeNamedMap(source.logic?.functions || source.functions || [], 'function');
    const stateRaw = normalizeNamedMap(source.logic?.state || source.state || {}, 'state');
    const state = {};
    Object.values(stateRaw).forEach(item => {
      const id = normalizeStateId(item.id || item.key || 'state');
      const type = cleanString(item.type || inferStateType(item.default ?? item.value, 'string'));
      state[id] = { ...clone(item), id, type, default: item.default ?? item.value ?? defaultForStateType(type) };
    });
    const components = normalizeNamedMap(source.components || {}, 'component');
    const assets = normalizeNamedMap(source.assets || {}, 'asset');
    const data = clone(object(source.data));
    data.sources = normalizeNamedMap(data.sources || source.dataSources || {}, 'source');
    data.queries = normalizeNamedMap(data.queries || {}, 'query');
    data.forms = normalizeNamedMap(data.forms || {}, 'form');
    const styles = clone(object(source.styles));
    styles.rules = normalizeNamedMap(styles.rules || {}, 'global_rule');
    styles.keyframes = normalizeNamedMap(styles.keyframes || source.motion?.keyframes || {}, 'keyframes');
    styles.fontFaces = array(styles.fontFaces).filter(isObject).map(clone);
    styles.customProperties = clone(object(styles.customProperties));
    styles.atRules = array(styles.atRules).filter(isObject).map(clone);
    const motion = clone(object(source.motion));
    motion.presets = normalizeNamedMap({ ...clone(BUILTIN_MOTION_PRESETS), ...object(motion.presets) }, 'motion');
    Object.values(motion.presets).forEach(preset => {
      preset.keyframes = normalizeMotionKeyframes(preset.keyframes || preset.frames || styles.keyframes[preset.id]?.frames || {});
      if (Array.isArray(preset.keyframes)) {
        // Reusable CSS entrance presets use percentage frames; WAAPI effects may remain arrays.
        const cssFrames = {};
        preset.keyframes.forEach((frame,index)=>{
          const offset = Number.isFinite(Number(frame.offset)) ? Math.max(0,Math.min(1,Number(frame.offset))) : (preset.keyframes.length<=1?1:index/(preset.keyframes.length-1));
          const declarations = {...frame}; delete declarations.offset; delete declarations.easing; delete declarations.composite;
          cssFrames[`${Math.round(offset*10000)/100}%`] = declarations;
        });
        preset.keyframes = cssFrames;
      }
      if (Object.keys(object(preset.keyframes)).length) styles.keyframes[preset.id] = { id:preset.id, name:preset.name || preset.id, frames:clone(preset.keyframes) };
    });
    motion.effects = normalizeNamedMap(motion.effects || {}, 'motion_effect');
    Object.entries(motion.effects).forEach(([id,effect],index)=>{
      const normalizedEffect = normalizeMotionEffect({...effect,id},index);
      if (normalizedEffect) motion.effects[id] = normalizedEffect; else delete motion.effects[id];
    });
    motion.timelines = normalizeNamedMap(motion.timelines || {}, 'timeline');
    Object.entries(motion.timelines).forEach(([id,timeline],index)=>{
      const normalizedTimeline = normalizeMotionTimeline({...timeline,id},index);
      if (normalizedTimeline) motion.timelines[id] = normalizedTimeline; else delete motion.timelines[id];
    });
    motion.defaults = normalizeMotionTiming(motion.defaults || {});
    motion.reducedMotion = ['skip','final-frame','allow'].includes(motion.reducedMotion) ? motion.reducedMotion : 'skip';
    const normalized = {
      schema:SCHEMA, version:VERSION, project, intent:clone(object(source.intent)), settings:clone(object(source.settings)), capabilities:{html:true,css:true,javascript:true,svg:true,mathml:true,routing:true,forms:true,components:true,animations:true,responsiveDesign:true,dataBinding:true,customCode:true,...clone(object(source.capabilities))},
      conditions, tokens:clone(object(source.tokens)), routes, assets, components, pages, styles, motion, logic:{state,interactions,functions,computed:clone(object(source.logic?.computed))}, data, i18n:clone(object(source.i18n)), scripts:clone(object(source.scripts)), editor:clone(object(source.editor)),
      compiler:{target:'static-web',html:{doctype:'html5',pretty:true,includeNodeIds:true},css:{strategy:'external',filename:'style.css',tokensAsCustomProperties:true,minify:false},javascript:{strategy:'generated-runtime',filename:'script.js',module:false,minify:false},assets:{directory:'assets',hashFilenames:false},validation:{failOnStructuralError:true,failOnBrokenReference:true},security:{sanitizeRawHtml:true,allowInlineScripts:false},sourceMaps:{enabled:true},...clone(object(source.compiler))},
      modules:clone(object(source.modules)), extensions:clone(object(source.extensions))
    };
    return options.reconcile === false ? normalized : reconcileNormalizedProject(normalized, { mode: options.mode || 'normalize' }).project;
  }

  function reconcileNormalizedProject(projectInput, options = {}) {
    const project = clone(projectInput);
    const diagnostics = [];
    const reconciliationMode = cleanString(options.mode || 'normalize').toLowerCase();
    const editorMode = reconciliationMode === 'editor' || reconciliationMode === 'editor-export';
    const note = (code, message, repaired = true, severity = 'info') => diagnostics.push({ code, message, repaired, severity });
    const nodeIndex = new Map();
    const semanticIndex = new Map();
    const interactionOwners = new Map();

    Object.values(project.pages || {}).forEach(page => {
      const parentOf = new Map();
      Object.values(page.nodes || {}).forEach(node => {
        nodeIndex.set(node.id, { node, page });
        [node.id, node.semanticKey, safeId(node.semanticKey || '')].filter(Boolean).forEach(alias => {
          const key = String(alias);
          if (!semanticIndex.has(key)) semanticIndex.set(key, []);
          semanticIndex.get(key).push(node.id);
        });
        node.children = array(node.children).filter(childId => childId !== node.id && page.nodes?.[childId]);
        node.interactionIds = [...new Set(array(node.interactionIds).map(safeId).filter(Boolean))];
        node.interactionIds.forEach(interactionId => {
          if (!interactionOwners.has(interactionId)) interactionOwners.set(interactionId, []);
          interactionOwners.get(interactionId).push(node.id);
        });
      });
      const root = page.nodes?.[page.rootNodeId];
      if (!root) return;
      const visiting = new Set();
      const walk = id => {
        if (visiting.has(id)) return;
        visiting.add(id);
        const node = page.nodes[id];
        if (!node) { visiting.delete(id); return; }
        node.children = node.children.filter(childId => {
          if (visiting.has(childId)) { note('graph.cycle-edge-removed', `Removed cyclic child edge ${id} -> ${childId}.`); return false; }
          const existing = parentOf.get(childId);
          if (existing && existing !== id) { note('graph.multi-parent-edge-removed', `Removed duplicate parent edge ${id} -> ${childId}; ${existing} already owns the child.`); return false; }
          parentOf.set(childId, id); return true;
        });
        node.children.forEach(walk);
        visiting.delete(id);
      };
      walk(page.rootNodeId);
      Object.keys(page.nodes).forEach(nodeId => {
        if (nodeId === page.rootNodeId) return;
        if (!parentOf.has(nodeId)) {
          root.children.push(nodeId);
          parentOf.set(nodeId, page.rootNodeId);
          note('graph.orphan-attached', `Attached orphan node ${nodeId} to ${page.rootNodeId}.`);
        }
      });
      root.children = [...new Set(root.children)];
    });

    const resolveNodeRef = raw => {
      const id = safeId(raw || '');
      if (!id) return '';
      if (nodeIndex.has(id)) return id;
      const matches = semanticIndex.get(String(raw)) || semanticIndex.get(id) || [];
      return matches.length === 1 ? matches[0] : '';
    };

    const state = project.logic.state = object(project.logic?.state);
    const ensureState = (action, interactionId) => {
      if (!STATE_ACTION_TYPES.has(action.type)) return;
      let stateId = normalizeStateId(action.stateId || action.stateKey || action.state?.id || action.path || '');
      if (!stateId) return;
      action.stateId = stateId;
      if (state[stateId]) return;
      let type = cleanString(action.state?.type || action.stateType || '');
      if (!type) type = action.type === 'state.toggle' ? 'boolean' : action.type === 'state.increment' ? 'number' : inferStateType(action.value, 'string');
      const fallback = action.type === 'state.toggle' ? false : action.type === 'state.increment' ? 0 : defaultForStateType(type);
      const initial = action.state?.default ?? action.stateDefault ?? action.initialValue ?? fallback;
      state[stateId] = { id: stateId, type, default: initial, metadata: { inferredBy: 'nexora-reconciler', interactionId } };
      note('logic.state-inferred', `Created missing state ${stateId} for interaction ${interactionId}.`);
    };

    Object.entries(project.logic?.interactions || {}).forEach(([interactionKey, interaction]) => {
      const owners = interactionOwners.get(interaction.id) || [];
      const resolvedTarget = resolveNodeRef(interaction.targetNodeId);
      if (resolvedTarget) interaction.targetNodeId = resolvedTarget;
      else if (owners.length === 1) {
        interaction.targetNodeId = owners[0];
        note('logic.interaction-target-inferred', `Assigned interaction ${interaction.id} to its owning node ${owners[0]}.`);
      } else if (editorMode && interaction.targetNodeId) {
        delete project.logic.interactions[interactionKey];
        note('editor.interaction-pruned', `Removed interaction ${interaction.id} because its target node was deleted in the editor.`);
        return;
      }
      if (interaction.targetNodeId && nodeIndex.has(interaction.targetNodeId)) {
        const node = nodeIndex.get(interaction.targetNodeId).node;
        if (!node.interactionIds.includes(interaction.id)) {
          node.interactionIds.push(interaction.id);
          note('logic.interaction-backlink-added', `Connected interaction ${interaction.id} back to node ${interaction.targetNodeId}.`);
        }
      }
      interaction.event = isObject(interaction.event) ? interaction.event : { type: cleanString(interaction.event || interaction.type || 'click') };
      if (!interaction.event.type) interaction.event.type = 'click';
      interaction.actions = array(interaction.actions).filter(isObject).map(actionInput => {
        const action = clone(actionInput);
        ensureState(action, interaction.id);
        if (action.nodeId) {
          const resolved = resolveNodeRef(action.nodeId);
          if (resolved) action.nodeId = resolved;
          else if (editorMode) { note('editor.action-pruned', `Removed ${action.type || 'action'} from ${interaction.id} because node ${action.nodeId} was deleted.`); return null; }
        }
        if (action.targetNodeId) {
          const resolved = resolveNodeRef(action.targetNodeId);
          if (resolved) action.targetNodeId = resolved;
          else if (editorMode) { note('editor.action-pruned', `Removed ${action.type || 'action'} from ${interaction.id} because target node ${action.targetNodeId} was deleted.`); return null; }
        }
        if (action.type === 'navigate' && action.routeId && !project.routes?.[action.routeId]) {
          const route = Object.values(project.routes || {}).find(item => item.path === action.path || item.output === action.path || item.path === action.url || item.output === action.url);
          if (route) { action.routeId = route.id; note('logic.route-reference-repaired', `Resolved navigation action in ${interaction.id} to route ${route.id}.`); }
          else if (editorMode && !(action.path || action.url)) { note('editor.action-pruned', `Removed navigation action from ${interaction.id} because route ${action.routeId} was deleted.`); return null; }
        }
        if (action.type === 'function.call' && !action.functionId && isObject(action.function) && (action.function.source || action.function.code)) {
          const fnId = safeId(action.function.id || `${interaction.id}_function`);
          project.logic.functions[fnId] = { ...clone(action.function), id: fnId, language: action.function.language || 'javascript' };
          action.functionId = fnId;
          delete action.function;
          note('logic.inline-function-extracted', `Extracted inline function ${fnId} from interaction ${interaction.id}.`);
        }
        return action;
      }).filter(Boolean);
      if (editorMode && !interaction.actions.length) {
        delete project.logic.interactions[interactionKey];
        note('editor.interaction-pruned', `Removed interaction ${interaction.id} because no executable actions remain after editor reconciliation.`);
      }
    });

    if (editorMode) {
      Object.values(project.pages || {}).forEach(page => Object.values(page.nodes || {}).forEach(node => {
        node.interactionIds = array(node.interactionIds).filter(interactionId => Boolean(project.logic?.interactions?.[interactionId]));
      }));
    }

    Object.values(project.pages || {}).forEach(page => Object.values(page.nodes || {}).forEach(node => {
      if (node.assetRef && !project.assets?.[node.assetRef] && (node.attributes?.src || node.attributes?.href)) {
        note('asset.stale-reference-cleared', `Cleared missing asset reference ${node.assetRef} on ${node.id}; a direct URL/path is present.`);
        node.assetRef = null;
      }
      if (node.motion?.enter && (Array.isArray(node.motion.enter.keyframes) ? node.motion.enter.keyframes.length : Object.keys(object(node.motion.enter.keyframes)).length)) {
        const requestedId = safeId(node.motion.enter.preset || '');
        const existing = requestedId ? resolveMotionPreset(project, requestedId) : null;
        const builtIn = requestedId && BUILTIN_MOTION_PRESETS[requestedId];
        const presetId = (!requestedId || builtIn || (existing && JSON.stringify(existing.keyframes || {}) !== JSON.stringify(node.motion.enter.keyframes || {})))
          ? safeId(`${node.id}_motion`)
          : requestedId;
        let registeredFrames = clone(node.motion.enter.keyframes);
        if (Array.isArray(registeredFrames)) {
          const cssFrames = {};
          registeredFrames.forEach((frame,index)=>{
            const offset = Number.isFinite(Number(frame.offset)) ? Math.max(0,Math.min(1,Number(frame.offset))) : (registeredFrames.length<=1?1:index/(registeredFrames.length-1));
            const declarations = {...frame}; delete declarations.offset; delete declarations.easing; delete declarations.composite;
            cssFrames[`${Math.round(offset*10000)/100}%`] = declarations;
          });
          registeredFrames = cssFrames;
        }
        project.motion.presets[presetId] = { id: presetId, name: presetId, keyframes: registeredFrames };
        project.styles.keyframes[presetId] = { id: presetId, name:presetId, frames:clone(registeredFrames) };
        node.motion.enter.preset = presetId;
        note('motion.inline-keyframes-registered', `Registered inline motion preset ${presetId} for ${node.id}.`);
      }
    }));

    ensureGenerationResponsiveFallbacks(project, options, note);
    ensureGenerationMotion(project, options, note);

    return { project, diagnostics };
  }

  function reconcileProject(input = {}, options = {}) {
    const inputIssues = validateAuthoringShape(input);
    const normalized = normalizeProject(input, { ...options, reconcile: false });
    const result = reconcileNormalizedProject(normalized, options);
    result.issues = [...inputIssues, ...validateProject(result.project)];
    return result;
  }

  function validateAuthoringShape(input) {
    const issues=[]; const ids=new Set();
    if (input?.schema !== SCHEMA) return issues; // Legacy import has its own migration path.
    const pages=Array.isArray(input.pages)?input.pages:Object.values(object(input.pages));
    if (!pages.length) issues.push('pages must contain at least one complete page.');
    const walk=(node,path)=>{
      if(typeof node==='string' || typeof node==='number')return;
      if(!isObject(node)){issues.push(`${path}: expected a node object.`);return;}
      if(node.id){const id=safeId(node.id);if(ids.has(id))issues.push(`${path}: duplicate node id ${node.id}.`);ids.add(id);}
      if(node.children!=null && !Array.isArray(node.children))issues.push(`${path}.children must be an array.`);
      array(node.children).forEach((child,i)=>walk(child,`${path}.children[${i}]`));
    };
    pages.forEach((page,index)=>{
      if (!isObject(page)){issues.push(`pages[${index}] must be an object.`);return;}
      if (isObject(page.nodes)) {
        const map=page.nodes;
        if (!map[page.rootNodeId]) issues.push(`pages[${index}].rootNodeId references a missing node.`);
        Object.entries(map).forEach(([id,node])=>{
          walk({...node,id:node.id||id,children:[]},`pages[${index}].nodes.${id}`);
          array(node.children).forEach(child=>{if(typeof child!=='string'||!map[child])issues.push(`Node ${id} has a missing/non-ID child ${child}.`);});
        });
      } else if (!Array.isArray(page.nodes) || !page.nodes.length) issues.push(`pages[${index}].nodes must be a nonempty tree or indexed map.`);
      else page.nodes.forEach((node,i)=>walk(node,`pages[${index}].nodes[${i}]`));
    });
    return issues;
  }

  function validateProject(projectInput = {}) {
    const project = projectInput.schema === SCHEMA && isObject(projectInput.pages) ? projectInput : normalizeProject(projectInput);
    const issues = [];
    const nodeOwners = new Map();
    const outputs = new Set();
    const checkOutput = (path, label) => {
      if (typeof path !== 'string' || !path || path.startsWith('/') || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..') || /[?#:]/.test(path)) issues.push(`${label}: invalid relative output path ${path}.`);
      if (outputs.has(path)) issues.push(`${label}: duplicate output path ${path}.`);
      outputs.add(path);
    };
    Object.values(project.routes || {}).forEach(route => checkOutput(route.output, `Route ${route.id}`));
    checkOutput(project.compiler?.css?.filename || 'style.css', 'CSS');
    checkOutput(project.compiler?.javascript?.filename || 'script.js', 'JavaScript');
    const checkScript = (source, label, parameters = [], async = false) => {
      try {
        const Constructor = async ? Object.getPrototypeOf(async function(){}).constructor : Function;
        // Parse only. Generated code is never invoked in the application host.
        new Constructor(...parameters, String(source || ''));
      } catch (error) { issues.push(`${label}: invalid JavaScript (${error.message}).`); }
    };
    Object.values(project.logic?.functions || {}).forEach(fn => {
      const parameters = array(fn.parameters).map(p => typeof p === 'string' ? p : p?.name);
      if (parameters.some(p => !/^[A-Za-z_$][\w$]*$/.test(p))) issues.push(`Function ${fn.id}: parameters must be JavaScript identifiers.`);
      checkScript(fn.source || fn.code, `Function ${fn.id}`, parameters, fn.async);
    });
    array(project.scripts?.customBlocks).forEach((block,index) => checkScript(typeof block === 'string' ? block : block?.source, `scripts.customBlocks[${index}]`));
    checkScript(compileJavascript(project), 'Compiled runtime');
    array(project.scripts?.external).forEach((entry,index) => {
      if (!isObject(entry) || typeof entry.src !== 'string' || !entry.src || /^\s*(?:javascript|data):/i.test(entry.src)) issues.push(`scripts.external[${index}]: expected a script src URL.`);
    });
    if (project.schema !== SCHEMA) issues.push(`schema must be ${SCHEMA}.`);
    if (project.version !== VERSION) issues.push(`version must be ${VERSION}.`);
    if (!Object.keys(project.pages || {}).length) issues.push('At least one page is required.');
    Object.values(project.routes || {}).forEach(route => { if (!project.pages[route.pageId]) issues.push(`Route ${route.id} references missing page ${route.pageId}.`); });
    Object.values(project.pages || {}).forEach(page => {
      if (!page.nodes?.[page.rootNodeId]) issues.push(`Page ${page.id} rootNodeId ${page.rootNodeId} is missing.`);
      const visiting = new Set(); const visited = new Set(); const parents = new Map();
      const visit = id => {
        if (visiting.has(id)) { issues.push(`Page ${page.id} contains a node cycle at ${id}.`); return; }
        if (visited.has(id)) return;
        const node = page.nodes[id]; if (!node) { issues.push(`Page ${page.id} references missing child ${id}.`); return; }
        visiting.add(id); visited.add(id);
        const nodeTag = cleanString(node.tag).toLowerCase();
        const textualContent = cleanString(node.text);
        const isLiteralCode = ['code','pre','script','style','textarea'].includes(nodeTag);
        if (!isLiteralCode && node.kind !== 'raw-html' && containsStructuralMarkup(textualContent)) issues.push(`Node ${id} contains HTML-like markup inside text. Represent each tag/content item as real child nodes instead of text.`);
        if (!isLiteralCode && node.kind !== 'raw-html' && containsMarkdownFormatting(textualContent)) issues.push(`Node ${id} contains markdown formatting inside text. Represent emphasis/headings as semantic child nodes instead of markdown.`);
        if (node.kind === 'text' && array(node.children).length) issues.push(`Text node ${id} cannot contain child nodes.`);
        if (VOID_TAGS.has(nodeTag) && (array(node.children).length || textualContent)) issues.push(`Void element ${id} <${nodeTag}> cannot contain text or children.`);
        if (node.motion?.enter) {
          if (!resolveMotionPreset(project, node.motion.enter.preset)) issues.push(`Node ${id} references missing motion preset ${node.motion.enter.preset}.`);
          if (!['load','in-view'].includes(node.motion.enter.trigger)) issues.push(`Node ${id} uses unsupported motion trigger ${node.motion.enter.trigger}.`);
        }
        array(node.motion?.effects).forEach((effect,index) => {
          const triggerType = effect.trigger?.type || 'load';
          if (!['load','in-view','hover','focus','click','pointer-enter','pointer-leave','scroll','view','custom'].includes(triggerType)) issues.push(`Node ${id} motion effect ${effect.id || index+1} uses unsupported trigger ${triggerType}.`);
          const hasFrames = Array.isArray(effect.keyframes) ? effect.keyframes.length >= 2 : Object.keys(object(effect.keyframes)).length >= 1;
          if (!hasFrames && !(effect.preset && resolveMotionPreset(project,effect.preset))) issues.push(`Node ${id} motion effect ${effect.id || index+1} has no keyframes or valid preset.`);
          if (effect.targetNodeId && !page.nodes[effect.targetNodeId]) issues.push(`Node ${id} motion effect ${effect.id || index+1} targets missing node ${effect.targetNodeId}.`);
          if (triggerType === 'custom' && !effect.trigger?.event) issues.push(`Node ${id} motion effect ${effect.id || index+1} custom trigger is missing event.`);
        });
        array(node.motion?.timelineIds).forEach(timelineId => { if (!project.motion?.timelines?.[timelineId]) issues.push(`Node ${id} references missing motion timeline ${timelineId}.`); });
        if (project.project?.generator?.type === 'ai') {
          if (nodeTag === 'select') {
            const optionChildren = array(node.children).filter(childId => ['option','optgroup'].includes(cleanString(page.nodes?.[childId]?.tag).toLowerCase()));
            if (!optionChildren.length) issues.push(`AI-generated select ${id} has no option child nodes. Each option must be its own editable node.`);
          }
          if (nodeTag === 'img' && !(node.assetRef || node.attributes?.src || array(node.bindings).some(binding => /(?:attribute\.)?src$/i.test(binding?.target?.property || binding?.property || '')))) issues.push(`AI-generated image ${id} has no assetRef/src binding or source.`);
          if (nodeTag === 'button' && !textualContent && !array(node.children).length && !node.accessibility?.label) issues.push(`AI-generated button ${id} has no visible content or accessible label.`);
        }
        if (nodeOwners.has(id) && nodeOwners.get(id) !== page.id) issues.push(`Node id ${id} is duplicated across pages.`); else nodeOwners.set(id,page.id);
        array(node.children).forEach(childId => { if (parents.has(childId)) issues.push(`Node ${childId} has multiple parent edges.`); parents.set(childId,id); if (!page.nodes[childId]) issues.push(`Node ${id} references missing child ${childId}.`); else visit(childId); });
        array(node.interactionIds).forEach(interactionId => { if (!project.logic?.interactions?.[interactionId]) issues.push(`Node ${id} references missing interaction ${interactionId}.`); });
        if (node.componentId && !project.components?.[node.componentId]) issues.push(`Node ${id} references missing component ${node.componentId}.`);
        if (node.assetRef && !project.assets?.[node.assetRef]) issues.push(`Node ${id} references missing asset ${node.assetRef}.`);
        Object.keys(node.style?.responsive || {}).forEach(conditionId => { if (!project.conditions?.[conditionId] && !/^\d+$/.test(conditionId)) issues.push(`Node ${id} uses unknown responsive condition ${conditionId}.`); });
        array(node.style?.rules).forEach(rule => array(rule.conditionIds).forEach(conditionId => { if (!project.conditions?.[conditionId]) issues.push(`Node ${id} style rule ${rule.id} uses unknown condition ${conditionId}.`); }));
        if (node.motion?.enter?.preset && !resolveMotionPreset(project,node.motion.enter.preset)) issues.push(`Node ${id} uses unknown motion preset ${node.motion.enter.preset}.`);
        visiting.delete(id);
      };
      if (page.rootNodeId) visit(page.rootNodeId);
      Object.keys(page.nodes || {}).forEach(nodeId => { if (!visited.has(nodeId)) issues.push(`Page ${page.id} contains unreachable node ${nodeId}.`); });
    });
    const motionEffectIds = new Set(Object.keys(project.motion?.effects || {}));
    Object.values(project.pages || {}).forEach(page=>Object.values(page.nodes || {}).forEach(node=>array(node.motion?.effects).forEach(effect=>motionEffectIds.add(effect.id))));
    Object.values(project.motion?.effects || {}).forEach(effect => {
      const triggerType = effect.trigger?.type || 'load';
      if (!['load','in-view','hover','focus','click','pointer-enter','pointer-leave','scroll','view','custom'].includes(triggerType)) issues.push(`Motion effect ${effect.id} uses unsupported trigger ${triggerType}.`);
      const hasFrames = Array.isArray(effect.keyframes) ? effect.keyframes.length >= 2 : Object.keys(object(effect.keyframes)).length >= 1;
      if (!hasFrames && !(effect.preset && resolveMotionPreset(project,effect.preset))) issues.push(`Motion effect ${effect.id} has no keyframes or valid preset.`);
      if (effect.targetNodeId && !nodeOwners.has(effect.targetNodeId)) issues.push(`Motion effect ${effect.id} targets missing node ${effect.targetNodeId}.`);
      if (triggerType === 'custom' && !effect.trigger?.event) issues.push(`Motion effect ${effect.id} custom trigger is missing event.`);
    });
    Object.values(project.motion?.timelines || {}).forEach(timeline => {
      if (!array(timeline.steps).length) issues.push(`Motion timeline ${timeline.id} has no steps.`);
      if (timeline.trigger?.type === 'custom' && !timeline.trigger?.event) issues.push(`Motion timeline ${timeline.id} custom trigger is missing event.`);
      array(timeline.steps).forEach((step,index)=>{
        if (!motionEffectIds.has(step.effectId)) issues.push(`Motion timeline ${timeline.id} step ${index+1} references missing effect ${step.effectId}.`);
        if (step.nodeId && !nodeOwners.has(step.nodeId)) issues.push(`Motion timeline ${timeline.id} step ${index+1} references missing node ${step.nodeId}.`);
      });
    });

    Object.values(project.logic?.interactions || {}).forEach(interaction => {
      if (!interaction.targetNodeId) issues.push(`Interaction ${interaction.id} is missing targetNodeId.`);
      else if (!nodeOwners.has(interaction.targetNodeId)) issues.push(`Interaction ${interaction.id} targets missing node ${interaction.targetNodeId}.`);
      if (!interaction.event?.type) issues.push(`Interaction ${interaction.id} is missing an event type.`);
      if (!array(interaction.actions).length) issues.push(`Interaction ${interaction.id} has no actions.`);
      array(interaction.actions).forEach((action,index)=>{
        if (!SUPPORTED_ACTION_TYPES.includes(action.type)) issues.push(`Interaction ${interaction.id} action ${index+1} uses unsupported action type ${action.type || 'empty'}.`);
        if (STATE_ACTION_TYPES.has(action.type) && !(action.stateId || action.path)) issues.push(`Interaction ${interaction.id} action ${index+1} is missing a stateId/path.`);
        if (['class.add','class.remove','class.toggle'].includes(action.type) && !action.className) issues.push(`Interaction ${interaction.id} action ${index+1} is missing className.`);
        if (action.type === 'style.set' && !action.property) issues.push(`Interaction ${interaction.id} action ${index+1} is missing style property.`);
        if (action.type === 'attribute.set' && !action.name) issues.push(`Interaction ${interaction.id} action ${index+1} is missing attribute name.`);
        if (action.type === 'navigate' && !(action.routeId || action.path || action.url)) issues.push(`Interaction ${interaction.id} action ${index+1} is missing routeId/path.`);
        if (action.type === 'url.open' && !action.url) issues.push(`Interaction ${interaction.id} action ${index+1} is missing url.`);
        if (action.type === 'function.call' && !action.functionId) issues.push(`Interaction ${interaction.id} action ${index+1} is missing functionId.`);
        if (action.type === 'event.emit' && !action.name) issues.push(`Interaction ${interaction.id} action ${index+1} is missing event name.`);
        if (action.stateId && !project.logic?.state?.[action.stateId]) issues.push(`Interaction ${interaction.id} action ${index+1} references missing state ${action.stateId}.`);
        if (action.functionId && !project.logic?.functions?.[action.functionId]) issues.push(`Interaction ${interaction.id} action ${index+1} references missing function ${action.functionId}.`);
        if (action.routeId && !project.routes?.[action.routeId]) issues.push(`Interaction ${interaction.id} action ${index+1} references missing route ${action.routeId}.`);
        if (action.nodeId && !nodeOwners.has(action.nodeId)) issues.push(`Interaction ${interaction.id} action ${index+1} references missing node ${action.nodeId}.`);
        if (action.targetNodeId && !nodeOwners.has(action.targetNodeId)) issues.push(`Interaction ${interaction.id} action ${index+1} references missing target node ${action.targetNodeId}.`);
      });
    });
    return [...new Set(issues)];
  }

  function conditionToCss(condition) {
    if (!condition) return null;
    if (condition.type === 'media') return `@media ${condition.query}`;
    if (condition.type === 'supports') return `@supports ${condition.query}`;
    if (condition.type === 'container') return `@container${condition.name ? ` ${condition.name}` : ''} ${condition.query}`;
    if (condition.type === 'layer') return `@layer ${condition.name || condition.query}`;
    return null;
  }
  function wrapConditions(css, conditionIds, project) {
    let result = css;
    array(conditionIds).slice().reverse().forEach(id => {
      const wrapper = conditionToCss(project.conditions?.[id]);
      if (wrapper) result = `${wrapper}{${result}}`;
    });
    return result;
  }
  function keyframeCss(name, frames = {}) {
    const body = Object.entries(object(frames)).map(([step, declarations]) => `${step}{${cssDeclarations(declarations)}}`).join('');
    return body ? `@keyframes ${safeId(name)}{${body}}` : '';
  }
  function tokenCss(project) {
    const declarations = flattenTokens(project.tokens || {});
    const custom = Object.entries(project.styles?.customProperties || {}).map(([key,value]) => `${key.startsWith('--') ? key : '--'+key}:${replaceTokenRefs(value)};`).join('');
    const body = Object.entries(declarations).map(([path,value])=>`${tokenCssVar(path)}:${replaceTokenRefs(value)};`).join('');
    return body || custom ? `:root{${body}${custom}}` : '';
  }
  function globalStyleCss(project) {
    const blocks = [];
    Object.values(project.styles?.fontFaces || {}).forEach(face => { const css = cssDeclarations(face); if (css) blocks.push(`@font-face{${css}}`); });
    Object.values(project.styles?.keyframes || {}).forEach(item => { const css = keyframeCss(item.id || item.name, item.frames || item.keyframes); if (css) blocks.push(css); });
    Object.values(project.styles?.rules || {}).sort((a,b)=>(a.order||0)-(b.order||0)).forEach(rule => {
      if (!rule.selector) return;
      const css = `${rule.selector}{${cssDeclarations(rule.declarations || rule.style)}}`;
      blocks.push(wrapConditions(css, rule.conditionIds, project));
    });
    array(project.styles?.atRules).forEach(rule => { if (rule.css) blocks.push(String(rule.css)); else if (rule.prelude && rule.declarations) blocks.push(`${rule.prelude}{${cssDeclarations(rule.declarations)}}`); });
    blocks.push(cleanString(project.styles?.rawCss));
    return blocks.join('\n');
  }
  function resolveMotionPreset(project, id) {
    const preset = project.motion?.presets?.[id];
    if (preset) return preset;
    const keyframes = project.styles?.keyframes?.[id];
    return keyframes ? { id, keyframes:keyframes.frames || keyframes.keyframes } : null;
  }
  function firstKeyframeDeclarations(project, presetId) {
    const preset = resolveMotionPreset(project,presetId);
    const frames = preset?.keyframes || project.styles?.keyframes?.[presetId]?.frames || {};
    return normalizeDeclarations(frames.from || frames['0%'] || {});
  }
  function nodeCss(project) {
    const blocks = [];
    Object.values(project.pages || {}).forEach(page => {
      Object.values(page.nodes || {}).forEach(node => {
        if (node.kind === 'text' && !Object.keys(node.style?.base || {}).length && !node.motion?.enter && !node.motion?.effects?.length) return;
        const selector = `[data-nx-id="${escapeCssAttr(node.id)}"]`;
        const base = Object.fromEntries(Object.entries(node.style?.base || {}).map(([k,v])=>[k,replaceTokenRefs(v)]));
        if (node.motion?.enter?.trigger === 'load') {
          const enter = node.motion.enter; base['animation-name'] = safeId(enter.preset); base['animation-duration'] = enter.duration; base['animation-timing-function'] = enter.easing; base['animation-delay'] = enter.delay; base['animation-iteration-count'] = enter.iterationCount; base['animation-fill-mode'] = enter.fillMode; base['animation-direction'] = enter.direction || 'normal';
        }
        // Content remains visible before JS and for reduced-motion users; keyframes own the starting state.
        if (Object.keys(base).length) blocks.push(`${selector}{${cssDeclarations(base)}}`);
        Object.entries(node.style?.responsive || {}).forEach(([conditionId,declarations]) => {
          const condition = project.conditions?.[conditionId] || (/^\d+$/.test(conditionId) ? {type:'media',query:`(max-width: ${conditionId}px)`}:null);
          if (!condition) return;
          const css = `${selector}{${cssDeclarations(Object.fromEntries(Object.entries(declarations).map(([k,v])=>[k,replaceTokenRefs(v)])))}}`;
          const wrapper = conditionToCss(condition); if (wrapper) blocks.push(`${wrapper}{${css}}`);
        });
        array(node.style?.rules).sort((a,b)=>(a.order||0)-(b.order||0)).forEach(rule => {
          const scoped = cleanString(rule.selector || '&').split(',').map(part => part.trim().replace(/&/g,selector)).join(',');
          if (!scoped) return;
          const css = `${scoped}{${cssDeclarations(Object.fromEntries(Object.entries(rule.declarations||{}).map(([k,v])=>[k,replaceTokenRefs(v)])))}}`;
          blocks.push(wrapConditions(css,rule.conditionIds,project));
        });
        if (node.motion?.hover?.declarations && Object.keys(node.motion.hover.declarations).length) {
          const transition = node.motion.hover.transition;
          if (transition && !base.transition) blocks.push(`${selector}{transition:${transition};}`);
          blocks.push(`${selector}:hover{${cssDeclarations(node.motion.hover.declarations)}}`);
        }
        if (node.motion?.enter?.trigger === 'in-view') {
          const e=node.motion.enter;
          blocks.push(`${selector}.nx-motion-in{animation-name:${safeId(e.preset)};animation-duration:${e.duration};animation-timing-function:${e.easing};animation-delay:${e.delay};animation-iteration-count:${e.iterationCount};animation-fill-mode:${e.fillMode};animation-direction:${e.direction || 'normal'};}`);
        }
      });
    });
    blocks.push('@media (prefers-reduced-motion: reduce){[data-nx-id]{animation:none!important;transition-duration:.001ms!important;scroll-behavior:auto!important;}}');
    return blocks.join('\n');
  }
  function pageGlobalCss(project) {
    return Object.values(project.pages || {}).map(page => {
      const blocks=[];
      Object.entries(object(page.globalStyles)).forEach(([selector,styles])=>{
        if (selector.startsWith('@media') || selector.startsWith('@supports') || selector.startsWith('@container')) {
          const inner=Object.entries(object(styles)).map(([s,d])=>`${s}{${cssDeclarations(d)}}`).join(''); if(inner) blocks.push(`${selector}{${inner}}`);
        } else if (selector.startsWith('@keyframes')) {
          const name=selector.replace(/^@keyframes\s+/,'').trim(); blocks.push(keyframeCss(name,styles));
        } else if (selector.startsWith('@')) { blocks.push(`${selector}{${cssDeclarations(styles)}}`); }
        else { const decl=cssDeclarations(styles); if(decl) blocks.push(`${selector}{${decl}}`); }
      });
      return blocks.join('\n');
    }).join('\n');
  }
  function compileCss(project) {
    return [tokenCss(project),globalStyleCss(project),pageGlobalCss(project),nodeCss(project)].filter(Boolean).join('\n\n');
  }

  function assetUrl(project, node) {
    const asset = node.assetRef ? project.assets?.[node.assetRef] : null;
    return asset?.path || asset?.url || node.attributes?.src || '';
  }
  function renderNode(project, page, nodeId, stack = new Set(), propContext = {}) {
    const node = page.nodes?.[nodeId];
    if (!node || stack.has(nodeId)) return '';
    stack.add(nodeId);
    if (node.kind === 'text') return escapeHtml(interpolate(node.text,propContext));
    if (node.kind === 'component-instance') {
      const component = project.components?.[node.componentId];
      if (!component) return '';
      const componentProject = normalizeComponentForRender(project,component,node);
      const componentPage = componentProject.page;
      return renderNode(project,componentPage,componentPage.rootNodeId,new Set(stack),{...object(component.props),...object(node.props)});
    }
    if (node.kind === 'raw-html') {
      const html=interpolate(node.html || '',propContext);
      return project.compiler?.security?.sanitizeRawHtml !== false ? sanitizeRawHtml(html) : html;
    }
    const tag = SAFE_TAG_RE.test(node.tag || '') ? node.tag : defaultTagForType(node.type);
    const attrs = { ...object(node.attributes) };
    if (project.compiler?.html?.includeNodeIds !== false) attrs['data-nx-id'] = node.id;
    if (node.classes?.length) attrs.class = node.classes.join(' ');
    Object.entries(object(node.dataset)).forEach(([key,value])=>{ attrs[`data-${key.replace(/[A-Z]/g,ch=>`-${ch.toLowerCase()}`)}`]=value; });
    if (node.accessibility?.role) attrs.role = node.accessibility.role;
    if (node.accessibility?.label) attrs['aria-label'] = node.accessibility.label;
    if (node.accessibility?.labelledBy) attrs['aria-labelledby'] = node.accessibility.labelledBy;
    if (node.accessibility?.describedBy) attrs['aria-describedby'] = node.accessibility.describedBy;
    if (node.accessibility?.tabIndex != null) attrs.tabindex = node.accessibility.tabIndex;
    Object.entries(object(node.accessibility?.aria)).forEach(([key,value])=>{ attrs[`aria-${key}`]=value; });
    if (node.motion?.enter?.trigger === 'in-view') { attrs['data-nx-motion-enter']=node.motion.enter.preset; attrs['data-nx-motion-once']=node.motion.enter.once ? 'true':'false'; }
    if ((tag === 'img' || tag === 'source' || tag === 'video' || tag === 'audio') && !attrs.src) { const src=assetUrl(project,node); if(src) attrs.src=src; }
    if (tag === 'img' && attrs.alt == null) attrs.alt = node.accessibility?.label || project.assets?.[node.assetRef]?.alt || '';
    const attrText = Object.entries(attrs).filter(([key,value])=>value !== false && value != null && SAFE_ATTR_RE.test(key)).map(([key,value])=> value === true ? ` ${key}` : ` ${key}="${escapeAttr(interpolate(value,propContext))}"`).join('');
    if (VOID_TAGS.has(tag)) { stack.delete(nodeId); return `<${tag}${attrText}>`; }
    let body = '';
    if (node.text) body += RAW_TEXT_TAGS.has(tag) ? interpolate(node.text,propContext) : escapeHtml(interpolate(node.text,propContext));
    array(node.children).forEach(childId => { body += renderNode(project,page,childId,new Set(stack),propContext); });
    stack.delete(nodeId);
    return `<${tag}${attrText}>${body}</${tag}>`;
  }
  function interpolate(value,ctx={}) { return cleanString(value).replace(/\{\{\s*([\w.-]+)\s*\}\}/g,(_,path)=>{ const parts=path.split('.'); let v=ctx; for(const p of parts) v=v?.[p]; return v==null?`{{${path}}}`:String(v); }); }
  function sanitizeRawHtml(html='') { return cleanString(html).replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'').replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,'').replace(/javascript\s*:/gi,''); }
  function normalizeComponentForRender(project,component,instance) {
    // Never mutate the canonical component with compiler caches. Canonical JSON must remain stable/serializable.
    const temp=normalizeProject({schema:SCHEMA,version:VERSION,project:{name:'Component'},pages:[{id:`component_${component.id}`,name:component.name||component.id,slug:'component',nodes:component.nodes || component.elements || [],rootNodeId:component.rootNodeId}],routes:[],tokens:project.tokens,conditions:project.conditions,components:{},styles:{},logic:{}});
    return {page:Object.values(temp.pages)[0]};
  }
  function routeForPage(project,pageId) { return Object.values(project.routes||{}).find(route=>route.pageId===pageId) || null; }
  function compilePageHtml(project,pageId,{inlineCss=false,inlineScript=false,css='',js=''}={}) {
    const page=project.pages?.[pageId] || Object.values(project.pages||{})[0]; if(!page) return '';
    const route=routeForPage(project,page.id);
    const title=page.seo?.title || route?.seo?.title || page.name || project.project.name;
    const description=page.seo?.description || route?.seo?.description || project.project.description || '';
    const lang=page.language || project.project.language || 'en';
    const body=renderNode(project,page,page.rootNodeId);
    const prefix='../'.repeat(Math.max(0,(route?.output || 'index.html').split('/').length-1)) || './';
    const headCss=inlineCss ? `<style>${css.replace(/<\/style/gi,'<\\/style')}</style>` : `<link rel="stylesheet" href="${prefix}${escapeAttr(project.compiler?.css?.filename || 'style.css')}">`;
    const externalScripts=array(project.scripts?.external).map(entry=>`<script src="${escapeAttr(entry.src)}"${entry.type==='module'?' type="module"':''}${entry.defer===true?' defer':''}${entry.integrity?` integrity="${escapeAttr(entry.integrity)}" crossorigin="anonymous"`:''}></script>`).join('\n');
    const scriptTag=inlineScript ? `<script>${js.replace(/<\/script/gi,'<\\/script')}<\/script>` : `<script src="${prefix}${escapeAttr(project.compiler?.javascript?.filename || 'script.js')}" defer><\/script>`;
    return `<!doctype html>\n<html lang="${escapeAttr(lang)}" dir="${escapeAttr(project.project.direction || 'ltr')}">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${escapeHtml(title)}</title>\n${description?`<meta name="description" content="${escapeAttr(description)}">\n`:''}${headCss}\n</head>\n<body data-nx-project="${escapeAttr(project.project.id)}" data-nx-page="${escapeAttr(page.id)}">\n${body}\n${externalScripts}\n${scriptTag}\n</body>\n</html>`;
  }

  function jsString(value) { return JSON.stringify(value); }
  function runtimeMotionKeyframes(project, effect = {}) {
    let frames = effect.keyframes;
    if (!(Array.isArray(frames) ? frames.length : Object.keys(object(frames)).length) && effect.preset) {
      frames = resolveMotionPreset(project,effect.preset)?.keyframes || {};
    }
    const replaceFrameValues = frame => Object.fromEntries(Object.entries(object(frame)).map(([key,value])=>[
      key,
      ['offset','easing','composite'].includes(key) ? value : replaceTokenRefs(value)
    ]));
    if (Array.isArray(frames)) return frames.map(replaceFrameValues);
    return Object.fromEntries(Object.entries(object(frames)).map(([step,frame])=>[step,replaceFrameValues(frame)]));
  }
  function runtimeData(project) {
    const state={}; Object.values(project.logic?.state||{}).forEach(item=>{ state[item.id]=item.default ?? item.value ?? null; });
    const interactions=Object.values(project.logic?.interactions||{}).map(item=>({id:item.id,targetNodeId:item.targetNodeId,event:item.event||{type:item.type||'click'},when:item.when||null,actions:array(item.actions)}));
    const bindings=[];
    const motions=[];
    const effects=[];
    Object.values(project.pages||{}).forEach(page=>Object.values(page.nodes||{}).forEach(node=>{
      array(node.bindings).forEach(binding=>bindings.push({...binding,nodeId:binding.nodeId||node.id}));
      if(node.motion?.enter?.trigger==='in-view') motions.push({nodeId:node.id,...node.motion.enter});
      array(node.motion?.effects).forEach(effect=>effects.push({...clone(effect),nodeId:node.id,targetNodeId:effect.targetNodeId||node.id,keyframes:runtimeMotionKeyframes(project,effect)}));
    }));
    Object.values(project.motion?.effects||{}).forEach(effect=>effects.push({...clone(effect),keyframes:runtimeMotionKeyframes(project,effect)}));
    const timelines=Object.values(project.motion?.timelines||{}).map(clone);
    const routes=Object.fromEntries(Object.values(project.routes||{}).map(route=>[route.id,{path:route.path,output:route.output,pageId:route.pageId}]));
    return {state,interactions,bindings,motions,effects,timelines,routes,motionDefaults:clone(project.motion?.defaults||{}),reducedMotion:project.motion?.reducedMotion||'skip'};
  }
  function compileJavascript(project) {
    const data=runtimeData(project);
    const customBlocks=array(project.scripts?.customBlocks).map(block=>typeof block==='string'?block:block?.source).filter(Boolean).join('\n\n');
    const functionBlocks=Object.values(project.logic?.functions||{}).map(fn=>{
      if (fn.language && fn.language!=='javascript') return '';
      const name=safeId(fn.name||fn.id).replace(/[^a-z0-9_$]/gi,'_'); const params=array(fn.parameters).map(p=>cleanString(typeof p==='string'?p:p?.name||'arg')).join(',');
      return `NX.functions[${jsString(fn.id)}]=${fn.async?'async ':''}function ${name}(${params}){${cleanString(fn.source||fn.code||'')}};`;
    }).filter(Boolean).join('\n');
    return `(function(){'use strict';
const NX=window.NexoraRuntime=window.NexoraRuntime||{state:{},functions:{},events:new EventTarget(),animations:new Map()};
const CONFIG=${JSON.stringify(data)};
Object.assign(NX.state,CONFIG.state);
${functionBlocks}
function getNode(id){if(!id)return null;const key=String(id);NX.nodes=NX.nodes||new Map();const cached=NX.nodes.get(key);if(cached&&cached.isConnected)return cached;let found=null;for(const node of document.querySelectorAll('[data-nx-id]')){if(node.dataset.nxId===key){found=node;break;}}if(found)NX.nodes.set(key,found);return found;}
function readPath(path){const parts=String(path||'').replace(/^state\\./,'').split('.').filter(Boolean);let value=NX.state;for(const part of parts)value=value==null?undefined:value[part];return value;}
function writePath(path,value){const parts=String(path||'').replace(/^state\\./,'').split('.').filter(Boolean);if(!parts.length)return;let target=NX.state;for(let i=0;i<parts.length-1;i++){if(!target[parts[i]]||typeof target[parts[i]]!=='object')target[parts[i]]={};target=target[parts[i]];}target[parts[parts.length-1]]=value;renderBindings();NX.events.dispatchEvent(new CustomEvent('state:change',{detail:{path:String(path),value:value}}));}
function evalExpr(expr){if(expr==null)return true;if(typeof expr!=='object')return Boolean(expr);if(expr.type==='literal')return expr.value;if(expr.type==='path')return readPath(expr.path);if(expr.type==='not')return !evalExpr(expr.argument);if(expr.type==='logical'){const args=expr.arguments||[];return expr.operator==='or'?args.some(evalExpr):args.every(evalExpr);}if(expr.type==='binary'){const l=evalExpr(expr.left),r=evalExpr(expr.right);switch(expr.operator){case '==':return l==r;case '===':return l===r;case '!=':return l!=r;case '!==':return l!==r;case '>':return l>r;case '>=':return l>=r;case '<':return l<r;case '<=':return l<=r;case '+':return l+r;case '-':return l-r;case '*':return l*r;case '/':return r?l/r:0;case 'includes':return l?.includes?.(r)||false;default:return false;}}return false;}
async function runAction(action,event){const target=getNode(action.targetNodeId||event?.currentTarget?.dataset?.nxId);switch(action.type){case 'state.set':writePath(action.stateId||action.path,action.valueExpression?evalExpr(action.valueExpression):action.value);break;case 'state.toggle':writePath(action.stateId||action.path,!readPath(action.stateId||action.path));break;case 'state.increment':writePath(action.stateId||action.path,Number(readPath(action.stateId||action.path)||0)+Number(action.by??1));break;case 'class.add':(getNode(action.nodeId)||target)?.classList.add(action.className);break;case 'class.remove':(getNode(action.nodeId)||target)?.classList.remove(action.className);break;case 'class.toggle':(getNode(action.nodeId)||target)?.classList.toggle(action.className);break;case 'style.set':{const n=getNode(action.nodeId)||target;if(n)n.style.setProperty(action.property,String(action.value??''));break;}case 'attribute.set':(getNode(action.nodeId)||target)?.setAttribute(action.name,String(action.value??''));break;case 'text.set':{const n=getNode(action.nodeId)||target;if(n)n.textContent=String(action.value??'');break;}case 'visibility.show':{const n=getNode(action.nodeId)||target;if(n)n.hidden=false;break;}case 'visibility.hide':{const n=getNode(action.nodeId)||target;if(n)n.hidden=true;break;}case 'navigate':{const r=CONFIG.routes[action.routeId];const destination=r?.output||r?.path||action.path||action.url;if(destination)location.href=destination;break;}case 'url.open':window.open(action.url,action.target||'_self',action.features||'');break;case 'scroll.to':(getNode(action.nodeId)||document.querySelector(action.selector||'body'))?.scrollIntoView({behavior:action.behavior||'smooth',block:action.block||'start'});break;case 'focus':(getNode(action.nodeId)||target)?.focus?.();break;case 'form.submit':(getNode(action.nodeId)||target?.closest?.('form'))?.requestSubmit?.();break;case 'form.reset':(getNode(action.nodeId)||target?.closest?.('form'))?.reset?.();break;case 'media.play':await (getNode(action.nodeId)||target)?.play?.();break;case 'media.pause':(getNode(action.nodeId)||target)?.pause?.();break;case 'clipboard.write':if(navigator.clipboard)await navigator.clipboard.writeText(String(action.value??''));break;case 'function.call':if(NX.functions[action.functionId])await NX.functions[action.functionId](...(action.arguments||[]).map(v=>v&&v.expression?evalExpr(v.expression):v));break;case 'event.emit':NX.events.dispatchEvent(new CustomEvent(action.name,{detail:action.detail||{}}));break;}}
function renderBindings(){for(const b of CONFIG.bindings){const n=getNode(b.nodeId||b.target?.nodeId);if(!n)continue;const value=b.expression?evalExpr(b.expression):readPath(b.path);const prop=b.target?.property||b.property||'text';if(prop==='text')n.textContent=value??'';else if(prop==='html')n.innerHTML=String(value??'');else if(prop==='visibility')n.hidden=!value;else if(prop.startsWith('attribute.'))n.setAttribute(prop.slice(10),String(value??''));else if(prop.startsWith('style.'))n.style.setProperty(prop.slice(6),String(value??''));else if(prop.startsWith('class.'))n.classList.toggle(prop.slice(6),Boolean(value));}}
function initInteractions(){for(const interaction of CONFIG.interactions){const node=getNode(interaction.targetNodeId);if(!node)continue;const evt=interaction.event||{};node.addEventListener(evt.type||'click',async event=>{if(interaction.when&&!evalExpr(interaction.when))return;if(evt.preventDefault)event.preventDefault();if(evt.stopPropagation)event.stopPropagation();for(const action of interaction.actions||[])await runAction({...action,targetNodeId:action.targetNodeId||interaction.targetNodeId},event);},{once:Boolean(evt.once),passive:Boolean(evt.passive),capture:Boolean(evt.capture)});}}
function cssValue(value){return typeof value==='string'?value.replace(/token\\(([^)]+)\\)/g,function(_,raw){return 'var(--nx-'+raw.trim().replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'').toLowerCase()+')';}):value;}
function camelProp(key){if(key.startsWith('--'))return key;return key.replace(/-([a-z])/g,function(_,ch){return ch.toUpperCase();});}
function parseTime(value,fallback){if(typeof value==='number'&&Number.isFinite(value))return Math.max(0,value);const text=String(value??'').trim();const number=parseFloat(text);if(!Number.isFinite(number))return fallback||0;if(/ms$/i.test(text))return Math.max(0,number);if(/s$/i.test(text))return Math.max(0,number*1000);return Math.max(0,number);}
function frameArray(source){if(Array.isArray(source))return source.map(function(frame){const out={};for(const key in frame){out[['offset','easing','composite'].includes(key)?key:camelProp(key)]=['offset','easing','composite'].includes(key)?frame[key]:cssValue(frame[key]);}return out;});const entries=Object.entries(source||{}).map(function(pair,index){let step=String(pair[0]).toLowerCase(),offset;if(step==='from')offset=0;else if(step==='to')offset=1;else if(step.endsWith('%'))offset=Math.max(0,Math.min(1,parseFloat(step)/100));else offset=NaN;return {step:step,frame:pair[1],offset:Number.isFinite(offset)?offset:index};}).sort(function(a,b){return a.offset-b.offset;});return entries.map(function(item,index){const out={offset:Number.isFinite(item.offset)&&item.offset<=1?item.offset:(entries.length<=1?1:index/(entries.length-1))};for(const key in (item.frame||{}))out[camelProp(key)]=cssValue(item.frame[key]);return out;});}
function motionOptions(effect){const timing=Object.assign({},CONFIG.motionDefaults||{},effect.timing||{});const iterations=timing.iterations==='infinite'?Infinity:Number(timing.iterations??1);const options={duration:parseTime(timing.duration,650),delay:parseTime(timing.delay,0),easing:timing.easing||'cubic-bezier(0.22, 1, 0.36, 1)',iterations:Number.isFinite(iterations)?Math.max(0,iterations):Infinity,direction:timing.direction||'normal',fill:timing.fill||'both',composite:timing.composite||'replace'};if(timing.iterationComposite)options.iterationComposite=timing.iterationComposite;return options;}
function applyFinalFrame(node,frames){const list=frameArray(frames);const final=list[list.length-1]||{};for(const key in final){if(['offset','easing','composite'].includes(key))continue;const cssKey=key.startsWith('--')?key:key.replace(/[A-Z]/g,function(ch){return '-'+ch.toLowerCase();});node.style.setProperty(cssKey,String(final[key]??''));}}
function playEffect(effect,nodeOverride,optionsOverride){if(!effect||effect.enabled===false)return null;const node=getNode(nodeOverride||effect.targetNodeId||effect.nodeId);if(!node)return null;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;const policy=effect.reducedMotion||CONFIG.reducedMotion||'skip';const frames=frameArray(effect.keyframes||{});if(!frames.length)return null;if(reduced&&policy!=='allow'){if(policy==='final-frame')applyFinalFrame(node,frames);return null;}if(effect.transformOrigin)node.style.transformOrigin=effect.transformOrigin;if(effect.perspective)node.style.perspective=effect.perspective;if(effect.willChange)node.style.willChange=effect.willChange;if(typeof node.animate!=='function'){applyFinalFrame(node,frames);return null;}const options=Object.assign(motionOptions(effect),optionsOverride||{});const animation=node.animate(frames,options);const rate=Number(effect.timing?.playbackRate||1);if(Number.isFinite(rate)&&rate!==1)animation.playbackRate=rate;const key=String(effect.id||'effect')+':'+String(node.dataset.nxId||'node');const previous=NX.animations.get(key);if(previous&&previous!==animation&&effect.cancelPrevious!==false)try{previous.cancel();}catch{}NX.animations.set(key,animation);animation.finished?.finally?.(function(){if(NX.animations.get(key)===animation)NX.animations.delete(key);}).catch?.(function(){});return animation;}
function reverseEffect(effect,nodeId){const frames=frameArray(effect.keyframes||{}).slice().reverse().map(function(frame,index,list){const copy=Object.assign({},frame);copy.offset=list.length<=1?1:index/(list.length-1);return copy;});return playEffect(Object.assign({},effect,{keyframes:frames}),nodeId);}
function bindInView(trigger,node,callback){if(!('IntersectionObserver'in window)){callback();return function(){};}const observer=new IntersectionObserver(function(items){items.forEach(function(item){if(item.isIntersecting){callback(item);if(trigger.once!==false)observer.unobserve(item.target);}else if(trigger.reverseOnExit)callback(item,true);});},{threshold:trigger.threshold??0.12,rootMargin:trigger.rootMargin||'0px 0px -6% 0px'});observer.observe(node);return function(){observer.disconnect();};}
function bindScrollEffect(effect){const trigger=effect.trigger||{};const node=getNode(effect.targetNodeId||effect.nodeId);const source=getNode(trigger.sourceNodeId)||node;if(!node||!source)return;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;if(reduced&&(effect.reducedMotion||CONFIG.reducedMotion||'skip')!=='allow'){if((effect.reducedMotion||CONFIG.reducedMotion)==='final-frame')applyFinalFrame(node,effect.keyframes);return;}if(typeof node.animate!=='function'){applyFinalFrame(node,effect.keyframes);return;}const animation=node.animate(frameArray(effect.keyframes),Object.assign(motionOptions(effect),{duration:1000,delay:0,iterations:1,fill:'both'}));animation.pause();let queued=false;function update(){queued=false;let progress=0;if(trigger.type==='scroll'&&!trigger.sourceNodeId){const max=Math.max(1,document.documentElement.scrollHeight-innerHeight);progress=scrollY/max;}else{const rect=source.getBoundingClientRect();const viewport=Math.max(1,innerHeight);const start=typeof trigger.start==='number'?trigger.start:0;const end=typeof trigger.end==='number'?trigger.end:1;const raw=(viewport*(1-start)-rect.top)/Math.max(1,viewport+rect.height);const normalized=(raw-start)/Math.max(.0001,end-start);progress=Math.max(0,Math.min(1,normalized));}animation.currentTime=progress*1000;}function schedule(){if(queued)return;queued=true;requestAnimationFrame(update);}addEventListener('scroll',schedule,{passive:true});addEventListener('resize',schedule,{passive:true});schedule();}
function bindEffect(effect){const trigger=effect.trigger||{type:'load'};const node=getNode(trigger.sourceNodeId||effect.targetNodeId||effect.nodeId);if(!node&&trigger.type!=='custom')return;if(trigger.type==='scroll'||trigger.type==='view'){bindScrollEffect(effect);return;}if(trigger.type==='load'){playEffect(effect);return;}if(trigger.type==='in-view'){bindInView(trigger,node,function(_,reverse){if(reverse)reverseEffect(effect);else playEffect(effect);});return;}if(trigger.type==='hover'||trigger.type==='pointer-enter'){node.addEventListener('pointerenter',function(){playEffect(effect);});if(trigger.reverseOnExit)node.addEventListener('pointerleave',function(){reverseEffect(effect);});return;}if(trigger.type==='pointer-leave'){node.addEventListener('pointerleave',function(){playEffect(effect);});return;}if(trigger.type==='focus'){node.addEventListener('focusin',function(){playEffect(effect);});if(trigger.reverseOnExit)node.addEventListener('focusout',function(){reverseEffect(effect);});return;}if(trigger.type==='click'){node.addEventListener('click',function(){playEffect(effect);});return;}if(trigger.type==='custom'&&trigger.event){NX.events.addEventListener(trigger.event,function(event){playEffect(effect,event?.detail?.nodeId);});}}
function effectDuration(effect){const options=motionOptions(effect);const iterations=options.iterations===Infinity?1:Math.max(1,Number(options.iterations)||1);return Number(options.delay||0)+Number(options.duration||0)*iterations;}
function timelineStart(at,cursor,lastStart){if(typeof at==='number'&&Number.isFinite(at))return Math.max(0,at);const text=String(at??'').trim();if(!text)return cursor;if(text==='<')return lastStart;if(text==='>')return cursor;if(/^\\+=/.test(text))return Math.max(0,cursor+parseTime(text.slice(2),0));if(/^-=/ .test(text))return Math.max(0,cursor-parseTime(text.slice(2),0));const numeric=parseTime(text,NaN);return Number.isFinite(numeric)?numeric:cursor;}
function runTimeline(timeline,ownerNodeId){if(!timeline)return;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;if(reduced&&(timeline.reducedMotion||CONFIG.reducedMotion||'skip')==='skip')return;const effectMap=new Map((CONFIG.effects||[]).map(function(effect){return [effect.id,effect];}));let cursor=0,lastStart=0;const schedule=[];for(const step of timeline.steps||[]){const effect=effectMap.get(step.effectId);if(!effect)continue;const start=timelineStart(step.at,cursor,lastStart)+parseTime(step.delay,0);schedule.push({effect:effect,nodeId:step.nodeId||ownerNodeId||effect.targetNodeId||effect.nodeId,start:start});lastStart=start;cursor=Math.max(cursor,start+effectDuration(effect));}const repeats=timeline.repeat==='infinite'?0:Math.max(0,Math.min(20,Number(timeline.repeat)||0));for(let cycle=0;cycle<=repeats;cycle++){const base=cycle*cursor;for(const item of schedule)setTimeout(function(){const e=timeline.yoyo&&cycle%2?Object.assign({},item.effect,{keyframes:frameArray(item.effect.keyframes).slice().reverse()}):item.effect;playEffect(e,item.nodeId);},base+item.start);}}
function bindTimeline(timeline){const trigger=timeline.trigger||{type:'load'};const owner=trigger.sourceNodeId||null;if(trigger.type==='load'){runTimeline(timeline,owner);return;}const node=getNode(owner)||document.body;if(trigger.type==='in-view'){bindInView(trigger,node,function(){runTimeline(timeline,owner);});return;}if(trigger.type==='custom'&&trigger.event){NX.events.addEventListener(trigger.event,function(event){runTimeline(timeline,event?.detail?.nodeId||owner);});return;}const evt=trigger.type==='hover'?'pointerenter':trigger.type==='focus'?'focusin':trigger.type==='pointer-enter'?'pointerenter':trigger.type==='pointer-leave'?'pointerleave':trigger.type==='click'?'click':trigger.event;if(evt)node.addEventListener(evt,function(){runTimeline(timeline,owner);});}
function initEntranceMotion(){const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;if(reduced)return;const entries=CONFIG.motions||[];if(!entries.length)return;if(!('IntersectionObserver'in window)){entries.forEach(function(m){getNode(m.nodeId)?.classList.add('nx-motion-in');});return;}const observer=new IntersectionObserver(function(items){items.forEach(function(item){if(!item.isIntersecting)return;item.target.classList.add('nx-motion-in');if(item.target.dataset.nxMotionOnce!=='false')observer.unobserve(item.target);});},{threshold:.12,rootMargin:'0px 0px -6% 0px'});entries.forEach(function(m){const n=getNode(m.nodeId);if(n)observer.observe(n);});}
function initStructuredMotion(){(CONFIG.effects||[]).forEach(bindEffect);(CONFIG.timelines||[]).forEach(bindTimeline);}
NX.getNode=getNode;NX.setState=writePath;NX.getState=readPath;NX.render=renderBindings;NX.playMotion=function(id,nodeId){const effect=(CONFIG.effects||[]).find(function(item){return item.id===id;});return effect?playEffect(effect,nodeId):null;};NX.runTimeline=function(id,nodeId){const timeline=(CONFIG.timelines||[]).find(function(item){return item.id===id;});if(timeline)runTimeline(timeline,nodeId);};
function ready(){initInteractions();renderBindings();initEntranceMotion();initStructuredMotion();NX.events.dispatchEvent(new CustomEvent('runtime:ready'));}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
${customBlocks}
})();`;
  }

  function compileToFiles(input, options = {}) {
    const project=normalizeProject(input,options);
    const issues=[...validateAuthoringShape(input),...validateProject(project)];
    if (issues.length && project.compiler?.validation?.failOnStructuralError !== false) { const error=new Error(`Nexora Web Project validation failed: ${issues.slice(0,8).join(' ')}`); error.issues=issues; throw error; }
    const css=compileCss(project); const js=compileJavascript(project); const files=[];
    Object.values(project.pages).forEach((page,index)=>{ const route=routeForPage(project,page.id); const filename=route?.output || (index===0?'index.html':`${page.slug||page.id}.html`); files.push({name:filename,language:'html',content:compilePageHtml(project,page.id,{css,js})}); });
    files.push({name:project.compiler?.css?.filename || 'style.css',language:'css',content:css});
    files.push({name:project.compiler?.javascript?.filename || 'script.js',language:'javascript',content:js});
    return files;
  }
  function compilePreviewHtml(input,pageId) { const project=normalizeProject(input); const css=compileCss(project); const js=compileJavascript(project); return compilePageHtml(project,pageId,{inlineCss:true,inlineScript:true,css,js}); }

  function pageToUniversalPage(input,pageId) {
    const project=normalizeProject(input); const page=project.pages?.[pageId] || Object.values(project.pages)[0]; if(!page)return null;
    const build=id=>{const n=page.nodes[id];if(!n)return null;const nxMeta={kind:n.kind,semanticKey:n.semanticKey,assetRef:n.assetRef,componentId:n.componentId,props:clone(n.props||{}),slots:clone(n.slots||{}),overrides:clone(n.overrides||{}),properties:clone(n.properties||{}),dataset:clone(n.dataset||{}),bindings:clone(n.bindings||[]),extensions:clone(n.extensions||{})};if(n.kind==='text')return {id:n.id,tag:'span',type:'text',name:n.name,text:n.text,attrs:{},styles:declarationsToCamel(n.style?.base),responsive:Object.fromEntries(Object.entries(n.style?.responsive||{}).map(([k,v])=>[k,declarationsToCamel(v)])),styleRules:clone(n.style?.rules||[]),motion:clone(n.motion||{}),bindings:clone(n.bindings||[]),nxMeta,children:[]};const attrs={...clone(n.attributes)};if(n.classes?.length)attrs.class=n.classes.join(' ');return {id:n.id,tag:n.tag||defaultTagForType(n.type),type:n.type,name:n.name,text:n.text,attrs,classes:clone(n.classes),styles:declarationsToCamel(n.style?.base),responsive:Object.fromEntries(Object.entries(n.style?.responsive||{}).map(([k,v])=>[k,declarationsToCamel(v)])),styleRules:clone(n.style?.rules||[]),motion:clone(n.motion||{}),bindings:clone(n.bindings||[]),nxMeta,states:Object.fromEntries(array(n.style?.rules).filter(r=>/^&:/.test(r.selector)&&!r.conditionIds?.length).map(r=>[r.selector.slice(2),declarationsToCamel(r.declarations)])),interactions:clone(n.interactionIds),animations:[...(n.motion?.enter?[clone(n.motion.enter)]:[]),...array(n.motion?.effects).map(clone)],accessibility:clone(n.accessibility),constraints:clone(n.editor),children:array(n.children).map(build).filter(Boolean)};};
    const root=page.nodes[page.rootNodeId];
    return {schema:UNIVERSAL_SCHEMA,version:'5.0.0',page:{id:page.id,title:page.seo?.title||page.name,name:page.name,slug:page.slug,path:routeForPage(project,page.id)?.output||`${page.slug}.html`,language:page.language,description:page.seo?.description||'',styles:clone(page.globalStyles),rootStyles:declarationsToCamel(root?.style?.base||{}),theme:clone(project.tokens),assets:clone(project.assets),interactions:Object.values(project.logic?.interactions||{}),scripts:array(project.scripts?.customBlocks),elements:array(root?.children).map(build).filter(Boolean)},metadata:{sourceOfTruth:SCHEMA,webProjectId:project.project.id,pageId:page.id}};
  }
  function webProjectToUniversalPage(input,options={}) { return pageToUniversalPage(input,options.pageId); }
  function webProjectToVisualDocument(input) {
    const project=normalizeProject(input); const pages={};
    Object.values(project.pages).forEach(page=>{const elements={};Object.values(page.nodes).forEach(n=>{elements[n.id]={id:n.id,tag:n.tag||defaultTagForType(n.type),type:n.type,name:n.name,text:n.text,style:declarationsToCamel(n.style?.base),responsive:Object.fromEntries(Object.entries(n.style?.responsive||{}).map(([k,v])=>[k,{style:declarationsToCamel(v)}])),states:{},attributes:{...n.attributes,'data-nx-id':n.id},children:clone(n.children),interactions:clone(n.interactionIds),animations:[...(n.motion?.enter?[clone(n.motion.enter)]:[]),...array(n.motion?.effects).map(clone)],accessibility:clone(n.accessibility),constraints:clone(n.editor),editor:clone(n.editor),generatedEditable:true};});const route=routeForPage(project,page.id);pages[page.id]={id:page.id,name:page.name,path:route?.output||`${page.slug}.html`,seo:clone(page.seo),root:page.rootNodeId,elements};});
    const breakpoints={};Object.entries(project.conditions||{}).forEach(([id,c])=>{const m=/max-width:\s*(\d+)px/.exec(c.query||'');if(m)breakpoints[id]=Number(m[1]);});
    return {schema:VISUAL_SCHEMA,version:'5.0.0',document:{id:project.project.id,name:project.project.name,type:'website',source:{sourceOfTruth:SCHEMA}},settings:{defaultPage:Object.keys(pages)[0],unit:'px',direction:project.project.direction,breakpoints:{...DEFAULT_BREAKPOINTS,...breakpoints},export:{html:'index.html',css:project.compiler?.css?.filename||'style.css',js:project.compiler?.javascript?.filename||'script.js'}},theme:{tokens:clone(project.tokens),modes:{}},assets:clone(project.assets),components:clone(project.components),dataSources:clone(project.data?.sources),interactions:Object.values(project.logic?.interactions||{}),pages,compiler:{sourceMode:SCHEMA,output:{html:'index.html',css:project.compiler?.css?.filename||'style.css',js:project.compiler?.javascript?.filename||'script.js'}}};
  }
  function universalPageToWebProject(input,options={}) { return normalizeProject(migrateUniversalPage(input),options); }
  function visualDocumentToWebProject(input,options={}) { return normalizeProject(migrateVisualDocument(input),options); }
  function legacyPageDocumentToWebProject(input,options={}) { return normalizeProject(migrateLegacyPageDocument(input),options); }

  function webProjectToLegacyPageDocument(input) {
    const project=normalizeProject(input);const pages=Object.values(project.pages).map(page=>{const build=id=>{const n=page.nodes[id];if(!n)return null;return {id:n.id,type:n.type,tag:n.tag,name:n.name,role:n.accessibility?.role||null,content:n.text?{text:n.text}:{},attributes:clone(n.attributes),style:{base:declarationsToCamel(n.style?.base),responsive:Object.fromEntries(Object.entries(n.style?.responsive||{}).map(([k,v])=>[k,declarationsToCamel(v)])),rules:clone(n.style?.rules)},motion:clone(n.motion),children:array(n.children).map(build).filter(Boolean)};};const root=page.nodes[page.rootNodeId];return{id:page.id,name:page.name,type:page.type,slug:page.slug,seo:clone(page.seo),canvas:clone(page.canvas),layout:declarationsToCamel(root?.style?.base||{}),nodes:array(root?.children).map(build).filter(Boolean)};});return{schema:LEGACY_PAGE_SCHEMA,version:'1.0.0',meta:{title:project.project.name,description:project.project.description,language:project.project.language,generator:clone(project.project.generator)},intent:clone(project.intent),routes:Object.values(project.routes),tokens:clone(project.tokens),assets:Object.values(project.assets),data:clone(project.data),components:Object.values(project.components),pages,interactions:Object.values(project.logic?.interactions),scripts:clone(project.scripts),editor:{sourceOfTruth:'document'},compiler:{targets:['html','css','js','editor-state']}};
  }

  function getAuthoringContract(options = {}) {
    const pageType = cleanString(options.pageType || 'custom');
    const model = cleanString(options.model || 'selected-model');
    const targetMin = Number(options.targetMin || 24);
    const targetMax = Number(options.targetMax || 80);
    return {
      schema: SCHEMA,
      version: VERSION,
      contractVersion: AI_CONTRACT_VERSION,
      authoringProfile: 'recursive-ai-v4-motion-ir',
      guarantees: [
        'Recursive node trees are normalized into an indexed graph by Nexora.',
        'Inline node interactions are extracted and targeted to their owning node.',
        'Missing state declarations referenced by state actions are deterministically inferred with safe defaults.',
        'Node/interaction backlinks, graph orphans and safe semantic references are reconciled before strict validation.',
        'HTML/CSS/JavaScript are derived artifacts; the JSON project remains the editable source of truth.',
        'Normal text fields contain plain text only. Semantic markup is represented by real child nodes, never embedded HTML/markdown strings.',
        'Generation mode adds conservative responsive and entrance-motion fallbacks when a model omits them, without overriding explicit authored values.',
        'Structured motion effects use a trigger-target-keyframes-timing model and compile to browser-native animation runtime behavior with reduced-motion handling.'
      ],
      supportedActions: clone(SUPPORTED_ACTION_TYPES),
      preferredPatterns: {
        interactions: 'Prefer node.interactions with complete inline interaction objects for element-local behavior. Do not manually repeat targetNodeId; Nexora assigns it to the owning node.',
        state: 'For state actions supply stateId. Optionally include stateType/stateDefault or state:{id,type,default}. Nexora creates a missing declaration deterministically.',
        navigation: 'Prefer path for simple static navigation; routeId is optional when a path is supplied.',
        styles: 'Use arbitrary kebab-case standards CSS strings or ordered fallback arrays in style.base/style.responsive/style.rules: gradients, color-mix, masks, clip-path, filters, backdrop-filter, blend modes, transforms/3D, typography, grid/flex, container properties, logical properties, CSS variables, calc/min/max/clamp and modern values are all valid data. Use conditions for media/support/container/layer wrappers and styles.rawCss only for syntax not represented structurally, including complex nested at-rules, imports, property registrations and future CSS. scripts.customBlocks are an escape hatch, never the layout/style persistence layer.',
        motion: 'Use motion.enter for simple entrance animation and motion.hover for CSS micro-interactions. Use motion.effects for arbitrary WAAPI-compatible keyframes with load, in-view, hover, focus, click, pointer-enter, pointer-leave, custom, scroll or view triggers. Use project motion.effects + motion.timelines for reusable coordinated sequences. Keep animation declarative in JSON; custom JavaScript is not the animation authoring model. Always define a reduced-motion-safe outcome.',
        content: 'text is plain text only. Never put <strong>, <span>, <option>, <p>, markdown **bold**, or any other markup inside text. Create semantic child node objects instead.',
        structure: 'Every distinct visible/interactive item is its own node: headings, paragraphs, strong/span emphasis, select/options, buttons, statistics, images, cards, labels and list items.',
        ids: 'Use semantic stable lowercase snake_case ids. References must reuse the exact id when a cross-reference is genuinely required.'
      },
      forbiddenPatterns: [
        'HTML tags or escaped HTML inside text.',
        'Markdown formatting such as **bold** or # headings inside visible text.',
        'Multiple form options concatenated into one string.',
        'A whole card, statistic row, testimonial, navigation list or section collapsed into one text field.',
        'Primary layout/content created from custom JavaScript or raw-html.',
        'Desktop-only layouts with no responsive strategy for major multi-column/row containers.'
      ],
      atomicExamples: {
        select: {
          id:'property_type', kind:'element', type:'select', tag:'select', name:'Property Type', attributes:{name:'property_type','aria-label':'Property type'}, style:{base:{padding:'0.85rem 1rem','border-radius':'999px'}},
          children:[
            {id:'type_any',kind:'element',type:'option',tag:'option',text:'Any type',attributes:{value:''},children:[]},
            {id:'type_cabin',kind:'element',type:'option',tag:'option',text:'Cabin',attributes:{value:'cabin'},children:[]}
          ]
        },
        statistic: {
          id:'stat_sold',kind:'element',type:'stat',tag:'div',style:{base:{display:'grid',gap:'0.25rem'}},children:[
            {id:'stat_sold_value',kind:'element',type:'strong',tag:'strong',text:'400+',style:{base:{'font-size':'1.8rem'}},children:[]},
            {id:'stat_sold_label',kind:'element',type:'text',tag:'span',text:'small places sold',style:{base:{'font-size':'0.85rem'}},children:[]}
          ]
        },
        card: {
          id:'listing_card',kind:'element',type:'card',tag:'article',style:{base:{display:'grid',overflow:'hidden','border-radius':'1.25rem'},responsive:{mobile:{'grid-template-columns':'1fr'}}},motion:{enter:{preset:'fade_up',trigger:'in-view',duration:'680ms'},hover:{transition:'transform 180ms ease',declarations:{transform:'translate3d(0,-4px,0)'}}},children:[
            {id:'listing_image',kind:'element',type:'image',tag:'img',attributes:{src:'https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=900&q=80',alt:'Wood cabin among trees'},style:{base:{width:'100%','aspect-ratio':'4 / 3','object-fit':'cover'}},children:[]},
            {id:'listing_title',kind:'element',type:'heading',tag:'h3',text:'Oak Hollow Cabin',children:[]},
            {id:'listing_price',kind:'element',type:'strong',tag:'strong',text:'$349,000',children:[]}
          ]
        },
        richText: {
          id:'quote_line',kind:'element',type:'paragraph',tag:'p',children:[
            {id:'quote_plain_1',kind:'text',type:'text',text:'Less square footage can mean '},
            {id:'quote_emphasis',kind:'element',type:'strong',tag:'strong',text:'more living',children:[]},
            {id:'quote_plain_2',kind:'text',type:'text',text:'.'}
          ]
        }
      },
      template: {
        schema: SCHEMA,
        version: VERSION,
        project: { id:'project_generated', revision:'rev_1', name:'Website name', description:'Project/SEO description', kind:'website', language:'en', direction:'ltr', generator:{type:'ai',model} },
        intent: { userGoal:'...', audience:'...', tone:'...', visualDirection:'...' },
        tokens: { color:{background:'#0b0c10',surface:'#151821',text:'#f8fafc',muted:'#a6adbb',primary:'#3b82f6',accent:'#10b981'}, typography:{body:'Inter, system-ui, sans-serif',heading:'Inter, system-ui, sans-serif'}, spacing:{sm:'0.5rem',md:'1rem',lg:'1.5rem',xl:'2rem'}, radius:{sm:'8px',md:'12px',lg:'18px'}, breakpoints:{laptop:1200,tablet:900,mobile:640} },
        conditions: { mobile:{type:'media',query:'(max-width: 640px)'}, tablet:{type:'media',query:'(max-width: 900px)'}, reduced_motion:{type:'media',query:'(prefers-reduced-motion: reduce)'} },
        routes: [{id:'route_home',path:'/',pageId:'page_home',title:'Home',output:'index.html'}],
        assets: [], components: [],
        styles: { rules:[], keyframes:{} },
        motion: { presets:{}, effects:{}, timelines:{}, defaults:{duration:'650ms',easing:'cubic-bezier(0.22, 1, 0.36, 1)'}, reducedMotion:'skip' },
        logic: { state:[], interactions:[], functions:[] },
        data: { sources:[], queries:[], forms:[] },
        pages: [{
          id:'page_home', name:'Home', slug:'index', type:pageType,
          seo:{title:'Page title',description:'Page description'},
          layout:{display:'flex','flex-direction':'column','min-height':'100vh',width:'100%'},
          nodes:[{
            id:'hero_section',kind:'element',type:'section',tag:'section',name:'Hero',attributes:{'aria-label':'Hero'},
            style:{base:{position:'relative',display:'grid','min-height':'86vh',overflow:'hidden',perspective:'1200px',padding:'clamp(4rem, 8vw, 7rem) clamp(1rem, 4vw, 4rem)'},responsive:{tablet:{'min-height':'auto'},mobile:{padding:'5rem 1rem 3rem'}},rules:[{id:'hero_hover',selector:'&:hover',conditionIds:[],declarations:{transform:'translateZ(0)'}}]},
            motion:{enter:{preset:'fade_up',trigger:'in-view',duration:'700ms',easing:'cubic-bezier(0.22, 1, 0.36, 1)',delay:'0ms',once:true},effects:[{id:'hero_scroll_depth',trigger:{type:'view',start:0,end:1},keyframes:[{offset:0,transform:'translate3d(0,0,0) scale(1)',opacity:'1'},{offset:1,transform:'translate3d(0,-28px,0) scale(.985)',opacity:'.92'}],timing:{duration:1000,fill:'both'},reducedMotion:'skip'}]},
            editor:{selectable:true,editable:true,draggable:true,droppable:true,resizable:true,deletable:true,layoutBehavior:'flow'},
            children:[
              {id:'hero_eyebrow',kind:'element',type:'text',tag:'p',name:'Eyebrow',text:'SMALL SPACES. BIG POSSIBILITIES.',style:{base:{margin:'0 0 1rem','font-size':'0.78rem','font-weight':'700','letter-spacing':'0.14em','text-transform':'uppercase',color:'token(color.primary)'}},children:[]},
              {id:'hero_title',kind:'element',type:'heading',tag:'h1',name:'Hero Title',text:'Find a place that leaves room for life.',style:{base:{margin:'0','font-size':'clamp(2.8rem, 7vw, 6.5rem)','line-height':'0.96','letter-spacing':'-0.055em',color:'token(color.text)'}},motion:{enter:{preset:'fade_up',trigger:'in-view',duration:'760ms',delay:'80ms'}},children:[]},
              {id:'hero_copy',kind:'element',type:'paragraph',tag:'p',name:'Hero Copy',text:'Thoughtfully selected places chosen for the way you want to live.',style:{base:{margin:'1.5rem 0 0','max-width':'44rem','font-size':'clamp(1rem, 2vw, 1.25rem)','line-height':'1.65',color:'token(color.muted)'}},children:[]},
              {id:'hero_cta',kind:'element',type:'button',tag:'button',name:'Primary CTA',text:'Search homes',attributes:{type:'button'},style:{base:{margin:'2rem 0 0',padding:'0.9rem 1.25rem','border-radius':'999px',border:'0',background:'token(color.primary)',color:'#111','font-weight':'700',cursor:'pointer'}},motion:{hover:{transition:'transform 180ms ease',declarations:{transform:'translate3d(0,-2px,0)'}}},interactions:[{id:'hero_cta_click',event:{type:'click'},actions:[{type:'state.toggle',stateId:'search_open',stateType:'boolean',stateDefault:false}]}],children:[]}
            ]
          }]
        }],
        scripts:{customBlocks:[]}, editor:{sourceOfTruth:SCHEMA,grid:{enabled:true,size:8}},
        compiler:{target:'static-web',security:{sanitizeRawHtml:true,allowInlineScripts:false},validation:{failOnStructuralError:true,failOnBrokenReference:true}},extensions:{}
      },
      hardRules: [
        'Return exactly one complete strict JSON object and nothing else.',
        `Use schema ${SCHEMA} version ${VERSION}.`,
        'Prefer recursive page nodes and inline node interactions so the model does not have to maintain graph/backlink targets manually.',
        'Every visible element needs semantic HTML, stable id, editable metadata, element-level styling and responsive behavior appropriate to the design.',
        'A text property is plain text only. Never embed HTML tags, escaped HTML, markdown formatting, multiple form options, or multiple semantic blocks inside one text property.',
        'Create atomic child nodes for formatted content: <strong> becomes a strong node, each <option> becomes an option node, each statistic label/value becomes separate nodes, and each card owns image/action/content children.',
        'Use tokens for repeated design values; arbitrary CSS remains allowed at node/global rule level.',
        'Use declarative actions before custom JavaScript. Never place credentials or secrets in project JSON.',
        'Animations/transitions/3D effects must be stored as editable CSS/motion properties, never baked into opaque generated code.',
        'Unless the brief explicitly requests no motion, give major sections restrained in-view entrance motion and interactive cards/buttons editable hover transitions. For explicit 3D/motion requests, use perspective/transform-style/3D presets on meaningful elements.',
        `Recommended editable node range: ${targetMin}-${targetMax}; prioritize meaningful completeness over filler.`
      ]
    };
  }

  function toModuleFiles(input) {
    const project=normalizeProject(input); const files=[];
    const manifest={schema:SCHEMA,version:VERSION,storage:'modular',project:clone(project.project),modules:{tokens:{ref:'nexora/tokens/design.tokens.json'},conditions:{ref:'nexora/conditions.json'},routes:{ref:'nexora/routes/routes.json'},assets:{ref:'nexora/assets/assets.json'},styles:{ref:'nexora/styles/global.styles.json'},motion:{ref:'nexora/motion/motion.json'},logic:{ref:'nexora/logic/logic.json'},data:{ref:'nexora/data/data.json'},compiler:{ref:'nexora/build/compiler.json'}},pages:{},components:{}};
    Object.values(project.pages).forEach(page=>{const ref=`nexora/pages/${page.slug||page.id}.page.json`;manifest.pages[page.id]={ref};files.push({name:ref,language:'json',content:JSON.stringify(page,null,2)});});
    Object.values(project.components).forEach(component=>{const ref=`nexora/components/${component.id}.component.json`;manifest.components[component.id]={ref};files.push({name:ref,language:'json',content:JSON.stringify(component,null,2)});});
    const add=(name,value)=>files.push({name,language:'json',content:JSON.stringify(value,null,2)});
    add('nexora/project.json',manifest);add('nexora/tokens/design.tokens.json',project.tokens);add('nexora/conditions.json',project.conditions);add('nexora/routes/routes.json',project.routes);add('nexora/assets/assets.json',project.assets);add('nexora/styles/global.styles.json',project.styles);add('nexora/motion/motion.json',project.motion);add('nexora/logic/logic.json',project.logic);add('nexora/data/data.json',project.data);add('nexora/build/compiler.json',project.compiler);
    return files;
  }

  function toEditorPages(input) {
    const project = normalizeProject(input);
    const pages = {};
    Object.values(project.pages).forEach(page => {
      const elements = {};
      const localId = id => id === page.rootNodeId ? 'root' : (id === 'root' ? 'nx_authored_root' : id);
      Object.values(page.nodes).forEach(node => {
        const id = localId(node.id);
        elements[id] = {
          id, tag:node.tag || 'span', type:node.type, name:node.name, text:node.text,
          style:declarationsToCamel(node.style.base), responsive:clone(node.style.responsive), states:{},
          attributes:{...clone(node.attributes),'data-nx-id':node.id,...(node.classes.length?{class:node.classes.join(' ')}:{})},
          children:node.children.map(localId), interactions:clone(node.interactionIds), accessibility:clone(node.accessibility),
          constraints:clone(node.editor), editor:{...clone(node.editor),__nexora:{canonicalId:node.id,styleRules:clone(node.style.rules),motion:clone(node.motion),bindings:clone(node.bindings)}}
        };
      });
      const key = page.slug && !pages[page.slug] ? page.slug : page.id;
      pages[key] = {name:page.name,webProjectPageId:page.id,isWebProject:true,isGeneratedProject:true,elements,seo:clone(page.seo),globalStyles:clone(page.globalStyles),history:[],historyIdx:-1};
    });
    return pages;
  }

  function fromEditorPages(input, editorPages) {
    const project = normalizeProject(input);
    const previousPages = project.pages;
    project.pages = {};
    Object.entries(editorPages).forEach(([key,page]) => {
      const source = previousPages[page.webProjectPageId];
      const pageId = source?.id || safeId(`page_${key}`);
      const nodes = {};
      const canonicalId = id => page.elements[id]?.editor?.__nexora?.canonicalId || (id==='root' ? source?.rootNodeId || `${pageId}_root` : id);
      const reachable=new Set();
      const visit=id=>{if(reachable.has(id))return;reachable.add(id);array(page.elements[id]?.children).forEach(visit);};visit('root');
      Object.entries(page.elements).forEach(([id,element]) => {
        if (!reachable.has(id)) return;
        const nodeId=canonicalId(id); const old=source?.nodes[nodeId] || {};
        const attributes=clone(element.attributes || {}); delete attributes['data-nx-id'];
        const classes=cleanString(attributes.class).split(/\s+/).filter(Boolean);delete attributes.class;
        nodes[nodeId]={...clone(old),id:nodeId,kind:old.kind || 'element',tag:old.kind==='text'?null:element.tag,type:element.type,name:element.name,text:element.text ?? '',attributes,classes,
          children:array(element.children).map(canonicalId),
          style:{base:normalizeDeclarations(element.style),responsive:normalizeStyle({responsive:element.responsive}).responsive,rules:clone(element.editor?.__nexora?.styleRules || old.style?.rules || [])},
          motion:clone(element.editor?.__nexora?.motion || old.motion || {}),bindings:clone(element.editor?.__nexora?.bindings || old.bindings || []),
          accessibility:clone(element.accessibility || old.accessibility || {}),editor:{...clone(old.editor || {}),...clone(element.constraints || {})},interactionIds:clone(element.interactions || old.interactionIds || [])};
      });
      project.pages[pageId]={...clone(source || {}),id:pageId,name:page.name,slug:source?.slug || key,rootNodeId:canonicalId('root'),nodes,seo:clone(page.seo || source?.seo || {}),globalStyles:clone(page.globalStyles || source?.globalStyles || {})};
    });
    Object.keys(project.routes).forEach(id=>{if(!project.pages[project.routes[id].pageId])delete project.routes[id];});
    Object.values(project.pages).forEach((page,index)=>{if(!Object.values(project.routes).some(r=>r.pageId===page.id))project.routes[`route_${page.id}`]={id:`route_${page.id}`,path:index===0?'/':`/${page.slug}`,pageId:page.id,output:index===0?'index.html':`${page.slug}.html`};});
    const remaining = new Set(Object.values(project.pages).flatMap(page=>Object.keys(page.nodes)));
    Object.keys(project.logic.interactions).forEach(id=>{if(!remaining.has(project.logic.interactions[id].targetNodeId))delete project.logic.interactions[id];});
    project.project.revision = `rev_${global.crypto?.randomUUID?.() || Date.now()}`;
    project.project.updatedAt = new Date().toISOString();
    const issues=validateProject(project);
    if(issues.length)throw new Error(`Editor export rejected: ${issues.join(' ')}`);
    return project;
  }

  function resolveEditorDraft(input) {
    const project=normalizeProject(input);
    try {
      const draft=JSON.parse(global.localStorage?.getItem('nexora_editor_draft_v1') || 'null');
      if(draft?.base===editorSnapshot(project) && !validateProject(draft.project).length) return draft.project;
    } catch {}
    return project;
  }
  function editorSnapshot(input) {
    const stable=value=>Array.isArray(value)?value.map(stable):isObject(value)?Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,stable(value[key])])):value;
    return JSON.stringify(stable(normalizeProject(input)));
  }

  function buildRevisionContext(input, request = '', maxChars = 42000) {
    const project = normalizeProject(input);
    const compact = clone(project);
    delete compact.project.generator;
    delete compact.project.metadata;
    Object.values(compact.pages).forEach(page => Object.values(page.nodes).forEach(node => {
      delete node.editor;
      Object.keys(node).forEach(key => { const v=node[key]; if(v==null || v==='' || (typeof v==='object' && !Array.isArray(v) && !Object.keys(v).length)) delete node[key]; });
    }));
    if (JSON.stringify(compact).length < maxChars - 100) return {mode:'full', project:compact};

    const words = [...new Set(String(request).toLowerCase().split(/[^a-z0-9_:-]+/).filter(word => word.length > 2))];
    const parentByPage = new Map();
    const records = [];
    Object.values(compact.pages).forEach(page => {
      const parents = new Map();
      Object.values(page.nodes).forEach(node => array(node.children).forEach(childId=>parents.set(childId,node.id)));
      parentByPage.set(page.id, parents);
      Object.values(page.nodes).forEach(node => {
        const haystack = [page.name,page.slug,page.id,node.id,node.semanticKey,node.name,node.type,node.tag,node.text,...array(node.classes)].filter(Boolean).join(' ').toLowerCase();
        const exactIdBoost = words.some(word=>node.id.includes(word)||cleanString(node.semanticKey).toLowerCase().includes(word)) ? 5 : 0;
        const score = exactIdBoost + words.reduce((sum,w)=>sum+(haystack.includes(w)?2:0),0) + (node.interactionIds?.length?0.25:0) + (node.motion?.effects?.length?0.15:0);
        records.push({pageId:page.id,node,score});
      });
    });
    records.sort((a,b)=>b.score-a.score || cleanString(a.node.id).localeCompare(cleanString(b.node.id)));

    const selected = new Map();
    const addNode = (pageId,nodeId,reason) => {
      const page=compact.pages[pageId]; const node=page?.nodes?.[nodeId]; if(!node)return;
      const key=`${pageId}:${nodeId}`; if(!selected.has(key))selected.set(key,{pageId,node,reason});
    };
    // Always include roots, then highest-relevance records. For each seed, preserve the structural
    // path to root and one level of children so patch generation has local hierarchy context.
    Object.values(compact.pages).forEach(page=>addNode(page.id,page.rootNodeId,'page-root'));
    const seedLimit=Math.max(8,Math.min(28,Math.ceil(records.length*.18)));
    records.slice(0,seedLimit).forEach(record=>{
      addNode(record.pageId,record.node.id,'request-match');
      let current=record.node.id; const parents=parentByPage.get(record.pageId); let hops=0;
      while(parents?.has(current)&&hops<8){current=parents.get(current);addNode(record.pageId,current,'ancestor');hops+=1;}
      array(record.node.children).slice(0,8).forEach(child=>addNode(record.pageId,child,'direct-child'));
    });

    const context = {
      mode:'focused-v2',
      project:{id:project.project.id,revision:project.project.revision,name:project.project.name,description:project.project.description,language:project.project.language},
      pageIndex:Object.values(project.pages).map(p=>({id:p.id,name:p.name,slug:p.slug,rootNodeId:p.rootNodeId,route:Object.values(project.routes||{}).find(r=>r.pageId===p.id)?.path||null,nodeCount:Object.keys(p.nodes||{}).length})),
      nodes:[], modules:{}, omittedModules:[], omittedNodeCount:records.length,
      note:'Node records are canonical context selected by semantic relevance plus ancestors/direct children. Very large ancestor child-ID lists may be context-compacted and report contextOmittedChildCount; omitted source still exists. Prefer targeted patch operations; never page.replace or replace a module unless its complete contents are present.'
    };
    const selectedKeys = new Set(selected.keys());
    for (const item of selected.values()) {
      const contextNode = clone(item.node);
      const childIds = array(contextNode.children);
      let contextOmittedChildCount = 0;
      if (childIds.length > 24 && (item.reason === 'page-root' || item.reason === 'ancestor')) {
        const relevant = childIds.filter(childId=>selectedKeys.has(`${item.pageId}:${childId}`));
        const filler = childIds.filter(childId=>!selectedKeys.has(`${item.pageId}:${childId}`)).slice(0,Math.max(0,12-relevant.length));
        contextNode.children = [...new Set([...relevant,...filler])].slice(0,24);
        contextOmittedChildCount = Math.max(0,childIds.length-contextNode.children.length);
      }
      context.nodes.push({pageId:item.pageId,contextReason:item.reason,...contextNode,...(contextOmittedChildCount?{contextOmittedChildCount}:{})});
      if (JSON.stringify(context).length > maxChars * 0.80) { context.nodes.pop(); break; }
    }
    context.omittedNodeCount=Math.max(0,records.length-context.nodes.length);

    // Cross-reference only the modules needed to keep revisions referentially safe. Motion is kept
    // with logic/tokens/conditions because animation and interaction edits often span these modules.
    for (const key of ['tokens','conditions','routes','logic','motion','styles','scripts','assets','components']) {
      context.modules[key]=compact[key];
      if (JSON.stringify(context).length > maxChars - 900) { delete context.modules[key]; context.omittedModules.push(key); }
    }
    if (JSON.stringify(context).length > maxChars) throw new Error('Project index exceeds the revision context budget. Split this project into smaller projects.');
    return context;
  }

  function getPatchContract() {
    return {
      schema: PATCH_SCHEMA,
      version: PATCH_VERSION,
      contractVersion: AI_CONTRACT_VERSION,
      rule: 'Return the smallest complete transaction that satisfies the revision. Preserve everything not explicitly changed.',
      operations: {
        'scripts.set': {required:['scripts'], purpose:'Replace complete scripts configuration (customBlocks and external).'},
        'styles.set': {required:['styles'], purpose:'Replace complete global styles including rawCss, rules, keyframes and fontFaces.'},
        'function.upsert': {required:['function'], purpose:'Create or replace a JavaScript function preserving parameter case.'},
        'function.remove': {required:['functionId'], purpose:'Remove an unused function.'},
        'project.update': { required:['values'], purpose:'Merge project metadata such as name/description/language.' },
        'seo.update': { required:['pageId','values'], purpose:'Merge page SEO metadata.' },
        'text.set': { required:['pageId','nodeId','value'], purpose:'Replace editable node text.' },
        'attribute.set': { required:['pageId','nodeId','name','value'], purpose:'Set one HTML/SVG attribute.' },
        'attribute.unset': { required:['pageId','nodeId','name'], purpose:'Remove one attribute.' },
        'class.add': { required:['pageId','nodeId','className'], purpose:'Add one class.' },
        'class.remove': { required:['pageId','nodeId','className'], purpose:'Remove one class.' },
        'style.set': { required:['pageId','nodeId','property','value'], purpose:'Set one base CSS property.' },
        'style.unset': { required:['pageId','nodeId','property'], purpose:'Remove one base CSS property.' },
        'style.merge': { required:['pageId','nodeId','declarations'], purpose:'Merge multiple base CSS declarations.' },
        'responsive.merge': { required:['pageId','nodeId','conditionId','declarations'], purpose:'Merge responsive CSS declarations.' },
        'style.rule.upsert': { required:['pageId','nodeId','rule'], purpose:'Add/replace a scoped pseudo/advanced CSS rule.' },
        'style.rule.remove': { required:['pageId','nodeId','ruleId'], purpose:'Remove a scoped CSS rule.' },
        'motion.set': { required:['pageId','nodeId','motion'], purpose:'Replace/merge node motion including animation, transition or 3D keyframes.' },
        'node.move': { required:['pageId','nodeId','toParentId'], purpose:'Move an existing node within the same page.' },
        'token.set': { required:['tokenId','value'], purpose:'Set a design token by dot path.' },
        'token.unset': { required:['tokenId'], purpose:'Remove a design token.' },
        'state.upsert': { required:['state'], purpose:'Create/replace a canonical state definition.' },
        'state.remove': { required:['stateId'], purpose:'Remove an unused state definition.' },
        'interaction.upsert': { required:['interaction'], purpose:'Create/replace a global interaction. Prefer exact existing node IDs.' },
        'interaction.remove': { required:['interactionId'], purpose:'Remove an interaction and backlinks.' },
        'route.upsert': { required:['route'], purpose:'Create/replace a route.' },
        'route.remove': { required:['routeId'], purpose:'Remove a route.' },
        'page.replace': { required:['page'], purpose:'Replace/add one complete page using recursive AI-authoring nodes; use only for structural edits.' },
        'page.remove': { required:['pageId'], purpose:'Remove a page and its routes/node-targeted interactions.' },
        'component.upsert': { required:['component'], purpose:'Create/replace a component definition.' },
        'component.remove': { required:['componentId'], purpose:'Remove an unused component.' },
        'asset.upsert': { required:['asset'], purpose:'Create/replace an asset record.' },
        'asset.remove': { required:['assetId'], purpose:'Remove an unused asset record.' }
      },
      invariants: [
        'baseRevision must equal the current project revision when supplied.',
        'Use fine-grained operations for text/style/token/motion changes.',
        'Use page.replace only when hierarchy/content structure actually changes.',
        'Do not delete or recreate unrelated pages/nodes.',
        'Preserve existing IDs whenever the same semantic element survives the edit.',
        'Resulting project must still pass the same reconciliation, validation and compiler pipeline as a fresh generation.'
      ]
    };
  }

  function validatePatch(patch = {}, project = null) {
    const issues = [];
    if (!isObject(patch)) return ['Patch must be an object.'];
    assertSafeKeys(patch);
    if (project && !patch.baseRevision) issues.push('baseRevision is required for an edit transaction.');
    if (patch.schema !== PATCH_SCHEMA) issues.push(`patch schema must be ${PATCH_SCHEMA}.`);
    if (patch.version !== PATCH_VERSION) issues.push(`patch version must be ${PATCH_VERSION}.`);
    if (!Array.isArray(patch.operations) || !patch.operations.length) issues.push('Patch must contain at least one operation.');
    if (project?.project?.revision && patch.baseRevision && patch.baseRevision !== project.project.revision) issues.push(`Patch baseRevision ${patch.baseRevision} does not match current revision ${project.project.revision}.`);
    array(patch.operations).forEach((op,index) => {
      const label = `Patch operation ${index + 1}`;
      if (!isObject(op) || !SUPPORTED_PATCH_OPS.includes(op.op)) { issues.push(`${label} uses unsupported op ${op?.op || 'empty'}.`); return; }
      if (op.tokenId && String(op.tokenId).split('.').some(key=>['__proto__','constructor','prototype'].includes(key))) issues.push(`${label}: unsafe token path.`);
      if (op.op==='function.upsert' && !op.function?.id) issues.push(`${label}: function.id is required.`);
      const requires = getPatchContract().operations[op.op]?.required || [];
      requires.forEach(key => { if (op[key] == null || op[key] === '') issues.push(`${label} (${op.op}) is missing ${key}.`); });
    });
    return [...new Set(issues)];
  }

  function deleteTokenPath(tokens, tokenId) {
    const parts = String(tokenId || '').split('.').filter(Boolean);
    if (!parts.length) return;
    let target = tokens;
    for (let i=0;i<parts.length-1;i++) {
      if (!isObject(target?.[parts[i]])) return;
      target = target[parts[i]];
    }
    delete target[parts.at(-1)];
  }

  function applyPatch(input, patch = {}) {
    let project = normalizeProject(input);
    const patchIssues = validatePatch(patch, project);
    if (patchIssues.length) { const error = new Error(`Invalid Nexora patch: ${patchIssues.slice(0,8).join(' ')}`); error.issues = patchIssues; throw error; }
    const diagnostics = [];
    const nodeAt = op => project.pages?.[safeId(op.pageId || '')]?.nodes?.[safeId(op.nodeId || '')] || null;
    const pageAt = pageId => project.pages?.[safeId(pageId || '')] || null;

    for (const rawOp of patch.operations) {
      const op = clone(rawOp);
      if (op.nodeId && !nodeAt(op)) throw new Error(`Patch ${op.op}: missing node ${op.pageId}/${op.nodeId}.`);
      if (op.pageId && op.op !== 'page.replace' && !pageAt(op.pageId)) throw new Error(`Patch ${op.op}: missing page ${op.pageId}.`);
      if (op.op === 'node.move') {
        const page=pageAt(op.pageId); const descendants=new Set();
        const visit=id=>{if(descendants.has(id))return;descendants.add(id);array(page.nodes[id]?.children).forEach(visit);};visit(op.nodeId);
        if (!page.nodes[op.toParentId] || descendants.has(op.toParentId) || op.nodeId===page.rootNodeId) throw new Error('Invalid node.move: destination missing, root move, or cycle.');
      }
      if (op.op === 'scripts.set') project.scripts=clone(op.scripts);
      else if (op.op === 'styles.set') project.styles=clone(op.styles);
      else if (op.op === 'function.upsert') project.logic.functions[safeId(op.function.id)] = clone(op.function);
      else if (op.op === 'function.remove') delete project.logic.functions[safeId(op.functionId)];
      else if (op.op === 'project.update') Object.assign(project.project, clone(object(op.values)));
      else if (op.op === 'seo.update') { const page=pageAt(op.pageId); if(page) page.seo={...page.seo,...clone(object(op.values))}; }
      else if (op.op === 'text.set') { const node=nodeAt(op); if(node) node.text=String(op.value??''); }
      else if (op.op === 'attribute.set') { const node=nodeAt(op); if(node) node.attributes[op.name]=op.value; }
      else if (op.op === 'attribute.unset') { const node=nodeAt(op); if(node) delete node.attributes[op.name]; }
      else if (op.op === 'class.add') { const node=nodeAt(op); if(node&&!node.classes.includes(op.className)) node.classes.push(String(op.className)); }
      else if (op.op === 'class.remove') { const node=nodeAt(op); if(node) node.classes=node.classes.filter(value=>value!==op.className); }
      else if (op.op === 'style.set') { const node=nodeAt(op); if(node) node.style.base[camelToKebab(op.property)]=String(op.value??''); }
      else if (op.op === 'style.unset') { const node=nodeAt(op); if(node) delete node.style.base[camelToKebab(op.property)]; }
      else if (op.op === 'style.merge') { const node=nodeAt(op); if(node) Object.assign(node.style.base,normalizeDeclarations(op.declarations)); }
      else if (op.op === 'responsive.merge') { const node=nodeAt(op); if(node){const id=safeId(op.conditionId);node.style.responsive[id]={...object(node.style.responsive[id]),...normalizeDeclarations(op.declarations)};} }
      else if (op.op === 'style.rule.upsert') { const node=nodeAt(op); if(node){const rule=normalizeStyle({rules:[op.rule]}).rules[0];if(rule){const idx=node.style.rules.findIndex(item=>item.id===rule.id);if(idx>=0)node.style.rules[idx]=rule;else node.style.rules.push(rule);}} }
      else if (op.op === 'style.rule.remove') { const node=nodeAt(op); if(node) node.style.rules=node.style.rules.filter(rule=>rule.id!==safeId(op.ruleId)); }
      else if (op.op === 'motion.set') { const node=nodeAt(op); if(node) node.motion=normalizeMotion({ownerNodeId:node.id,...node.motion,...object(op.motion)}); }
      else if (op.op === 'node.move') { const page=pageAt(op.pageId);const nodeId=safeId(op.nodeId);const parentId=safeId(op.toParentId);if(!page?.nodes?.[nodeId]||!page?.nodes?.[parentId]||nodeId===page.rootNodeId)continue;Object.values(page.nodes).forEach(n=>{n.children=n.children.filter(id=>id!==nodeId);});const target=page.nodes[parentId].children;const idx=Math.max(0,Math.min(Number(op.toIndex??target.length),target.length));target.splice(idx,0,nodeId); }
      else if (op.op === 'token.set') { const parts=String(op.tokenId||'').split('.').filter(Boolean);if(!parts.length)continue;let target=project.tokens;for(let i=0;i<parts.length-1;i++){if(!isObject(target[parts[i]]))target[parts[i]]={};target=target[parts[i]];}target[parts.at(-1)]=op.value; }
      else if (op.op === 'token.unset') deleteTokenPath(project.tokens, op.tokenId);
      else if (op.op === 'state.upsert') { const value=clone(object(op.state));const id=normalizeStateId(value.id||op.stateId);if(id){const type=cleanString(value.type||inferStateType(value.default??value.value,'string'));project.logic.state[id]={...value,id,type,default:value.default??value.value??defaultForStateType(type)};} }
      else if (op.op === 'state.remove') delete project.logic.state[normalizeStateId(op.stateId)];
      else if (op.op === 'interaction.upsert') { const value=clone(object(op.interaction));const id=safeId(value.id||op.interactionId||'interaction');project.logic.interactions[id]={...value,id}; }
      else if (op.op === 'interaction.remove') { const id=safeId(op.interactionId);delete project.logic.interactions[id];Object.values(project.pages).forEach(page=>Object.values(page.nodes).forEach(node=>{node.interactionIds=node.interactionIds.filter(value=>value!==id);})); }
      else if (op.op === 'route.upsert') { const value=clone(object(op.route));const id=safeId(value.id||op.routeId||'route');project.routes[id]={...value,id,pageId:safeId(value.pageId||'')}; }
      else if (op.op === 'route.remove') delete project.routes[safeId(op.routeId)];
      else if (op.op === 'page.remove') { const id=safeId(op.pageId);const page=project.pages[id];if(page){const nodeIds=new Set(Object.keys(page.nodes||{}));delete project.pages[id];Object.keys(project.routes).forEach(routeId=>{if(project.routes[routeId].pageId===id)delete project.routes[routeId];});Object.keys(project.logic.interactions).forEach(interactionId=>{if(nodeIds.has(project.logic.interactions[interactionId].targetNodeId))delete project.logic.interactions[interactionId];});} }
      else if (op.op === 'page.replace') {
        const rawPage=clone(object(op.page)); const requestedId=safeId(rawPage.id||op.pageId||'page'); rawPage.id=requestedId;
        const oldPage=project.pages[requestedId]; const oldNodeIds=new Set(Object.keys(oldPage?.nodes||{}));
        const temp=normalizeProject({schema:SCHEMA,version:VERSION,project:{name:project.project.name},tokens:project.tokens,conditions:project.conditions,pages:[rawPage],routes:[],styles:project.styles,motion:project.motion,logic:{state:{},interactions:{},functions:{}}});
        const replacement=Object.values(temp.pages)[0]; replacement.id=requestedId; project.pages[requestedId]=replacement;
        Object.keys(project.logic.interactions).forEach(interactionId=>{if(oldNodeIds.has(project.logic.interactions[interactionId].targetNodeId)&&!replacement.nodes[project.logic.interactions[interactionId].targetNodeId])delete project.logic.interactions[interactionId];});
        Object.assign(project.logic.state,temp.logic.state);Object.assign(project.logic.functions,temp.logic.functions);Object.assign(project.logic.interactions,temp.logic.interactions);
        diagnostics.push({code:'patch.page-replaced',pageId:requestedId});
      }
      else if (op.op === 'component.upsert') { const value=clone(object(op.component));const id=safeId(value.id||op.componentId||'component');project.components[id]={...value,id}; }
      else if (op.op === 'component.remove') delete project.components[safeId(op.componentId)];
      else if (op.op === 'asset.upsert') { const value=clone(object(op.asset));const id=safeId(value.id||op.assetId||'asset');project.assets[id]={...value,id}; }
      else if (op.op === 'asset.remove') delete project.assets[safeId(op.assetId)];
    }

    project.project.revision = patch.revision || `rev_${global.crypto?.randomUUID?.() || Date.now()}`;
    if (project.project.revision===input.project?.revision) throw new Error('Patch must produce a new revision.');
    const structuralIssues = validateProject(project);
    if (structuralIssues.length) throw new Error(`Patch transaction rejected: ${structuralIssues.join(' ')}`);
    const prepared = reconcileProject(project, { mode:'patch' });
    if (prepared.issues.length) { const error=new Error(`Patched project failed validation: ${prepared.issues.slice(0,8).join(' ')}`);error.issues=prepared.issues;error.reconciliationDiagnostics=prepared.diagnostics;throw error; }
    return { project: prepared.project, diagnostics:[...diagnostics,...prepared.diagnostics] };
  }

  const api={editorSnapshot,resolveEditorDraft,toEditorPages,fromEditorPages,parseJsonDocument,buildRevisionContext,SCHEMA,VERSION,AI_CONTRACT_VERSION,PATCH_SCHEMA,PATCH_VERSION,SUPPORTED_ACTION_TYPES:clone(SUPPORTED_ACTION_TYPES),SUPPORTED_PATCH_OPS:clone(SUPPORTED_PATCH_OPS),BUILTIN_MOTION_PRESETS:clone(BUILTIN_MOTION_PRESETS),getAuthoringContract,getPatchContract,normalizeProject,reconcileProject,validateProject,validatePatch,compileToFiles,compilePreviewHtml,compileCss,compileJavascript,pageToUniversalPage,webProjectToUniversalPage,webProjectToVisualDocument,universalPageToWebProject,visualDocumentToWebProject,legacyPageDocumentToWebProject,webProjectToLegacyPageDocument,toModuleFiles,applyPatch,migrateLegacyPageDocument,migrateUniversalPage,migrateVisualDocument};
  global.NexoraWebProject=Object.freeze(api);

  // Compatibility adapters are deliberately import/export shims. New projects use nexora.web-project.
  global.NexoraPageDocument=global.NexoraPageDocument||Object.freeze({
    normalizePageDocument(input,options={}){return api.webProjectToLegacyPageDocument(api.legacyPageDocumentToWebProject(input,options));},
    validatePageDocument(input){return api.validateProject(api.legacyPageDocumentToWebProject(input));},
    pageDocumentToUniversalPage(input,options={}){return api.webProjectToUniversalPage(api.legacyPageDocumentToWebProject(input,options),options);},
    pageDocumentToVisualDocument(input,options={}){return api.webProjectToVisualDocument(api.legacyPageDocumentToWebProject(input,options));},
    universalPageToPageDocument(input,options={}){return api.webProjectToLegacyPageDocument(api.universalPageToWebProject(input,options));}
  });
  global.NexoraVisualDocument=global.NexoraVisualDocument||Object.freeze({
    styleModel:{layout:['display','position','width','height','minHeight','maxWidth','padding','margin','gap','overflow'],typography:['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','textAlign','color'],appearance:['background','backgroundColor','backgroundImage','border','borderRadius','boxShadow','opacity','filter','backdropFilter'],transform:['transform','transformOrigin','perspective','perspectiveOrigin','transformStyle','backfaceVisibility'],motion:['transition','animation']},
    normalizeDocument(input){return api.webProjectToVisualDocument(api.visualDocumentToWebProject(input));},
    renderToFiles(input){return api.compileToFiles(api.visualDocumentToWebProject(input));},
    convertUniversalPageToVisualDocument(input,options={}){return api.webProjectToVisualDocument(api.universalPageToWebProject(input,options));}
  });
})(typeof window!=='undefined'?window:globalThis);
