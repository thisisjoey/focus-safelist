/*
 * Everything that depends on YouTube's page structure lives here. YouTube
 * changes its markup often; when something stops being hidden, this is the
 * file to fix. The few selectors page-world.js needs are handed to it via
 * SEL.pageWorld (see main.js).
 */
(function (root) {
  'use strict';

  const HOME = 'ytd-browse[page-subtype="home"]';
  const SUBS = 'ytd-browse[page-subtype="subscriptions"]';
  const SIDEBAR = 'ytd-watch-next-secondary-results-renderer';
  const SEARCH = 'ytd-search';

  const within = (scope, tags) => tags.map((t) => `${scope} ${t}`);
  const list = (items) => items.join(',\n');

  const SIDEBAR_TILES = [
    'ytd-compact-video-renderer',
    'ytd-compact-radio-renderer',
    'ytd-compact-playlist-renderer',
    'ytd-compact-movie-renderer',
    'yt-lockup-view-model',
    'ytd-rich-item-renderer',
  ];

  const SEL = {
    // Which container holds the tiles we count for each page.
    scopes: { home: HOME, subscriptions: SUBS, watch: SIDEBAR, search: SEARCH },

    // Hidden unless the channel is safelisted.
    filterTiles: list([
      ...within(HOME, ['ytd-rich-item-renderer']),
      ...within(SUBS, ['ytd-rich-item-renderer', 'ytd-video-renderer', 'ytd-grid-video-renderer']),
      ...within(SIDEBAR, SIDEBAR_TILES),
    ]),

    // Blurred (or hidden) in search results unless safelisted.
    searchTiles: list(
      within(SEARCH, ['ytd-video-renderer', 'yt-lockup-view-model', 'ytd-playlist-renderer', 'ytd-radio-renderer'])
    ),

    // Always hidden while Focus is on: shelves, promos and posts in feeds.
    // The "load more" markers go too: with most tiles hidden they'd stay on
    // screen and make YouTube fetch recommendations endlessly.
    clutter: list([
      ...within(HOME, [
        'ytd-rich-section-renderer',
        'ytd-ad-slot-renderer',
        'ytd-statement-banner-renderer',
        'ytd-continuation-item-renderer',
      ]),
      ...within(SUBS, ['ytd-rich-section-renderer']),
      ...within(SIDEBAR, ['ytd-ad-slot-renderer', 'ytd-continuation-item-renderer']),
      ...within(SEARCH, ['ytd-ad-slot-renderer']),
    ]),

    homeGrid: `${HOME} ytd-rich-grid-renderer`,
    homePrimary: `${HOME} #primary`,
    // The masthead's frosted backdrop grows to cover the (now hidden) chip bar.
    chipbarBackdrop: '#frosted-glass.with-chipbar',

    shorts: list([
      'ytd-rich-shelf-renderer[is-shorts]',
      'ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts])',
      'ytd-reel-shelf-renderer',
      'ytd-rich-item-renderer:has(a[href^="/shorts/"])',
      'ytd-video-renderer:has(a[href^="/shorts/"])',
      'ytd-grid-video-renderer:has(a[href^="/shorts/"])',
      'ytd-compact-video-renderer:has(a[href^="/shorts/"])',
      'yt-lockup-view-model:has(a[href^="/shorts/"])',
      'ytm-shorts-lockup-view-model',
      'ytm-shorts-lockup-view-model-v2',
      'grid-shelf-view-model:has(a[href^="/shorts/"])',
      'ytd-guide-entry-renderer:has(a[title="Shorts"])',
      'ytd-guide-entry-renderer:has(a[href^="/shorts"])',
      'ytd-mini-guide-entry-renderer[aria-label="Shorts"]',
      'ytd-mini-guide-entry-renderer:has(a[title="Shorts"])',
      'ytd-mini-guide-entry-renderer:has(a[href^="/shorts"])',
      'yt-tab-shape[tab-title="Shorts"]',
      'ytd-notification-renderer:has(a[href^="/shorts/"])',
      '[data-yf-short-chip]',
    ]),
    // Filter chips (search, channel pages); ones labelled "Shorts" get marked.
    chips: 'yt-chip-cloud-chip-renderer, chip-shape',

    endscreen: list([
      '.ytp-endscreen-content',
      '.html5-endscreen',
      '.ytp-ce-element',
      '.ytp-autonav-endscreen-countdown-overlay',
      '.ytp-autonav-endscreen-upnext-container',
      '.ytp-fullscreen-grid',
      '.ytp-fullerscreen-edu-button',
      '.ytp-pause-overlay',
    ]),

    comments: list([
      'ytd-watch-flexy #comments',
      'ytd-comments#comments',
      'ytd-comments-entry-point-header-renderer',
      'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-comments-section"]',
    ]),

    explore: list([
      'ytd-guide-section-renderer:has(a[href="/feed/trending"])',
      'ytd-guide-section-renderer:has(a[href^="/feed/explore"])',
      'ytd-guide-section-renderer:has(a[href^="/feed/storefront"])',
      'ytd-guide-section-renderer:has(a[href^="/gaming"])',
      'ytd-guide-section-renderer:has(a[href^="/podcasts"])',
      'ytd-guide-section-renderer:has(a[href*="_destination"])',
      'ytd-guide-section-renderer:has(a[href="/channel/UC-9-kyTW8ZkZNDHQJ6FgpwQ"])', // Music
      'ytd-guide-section-renderer:has(a[href="/channel/UC4R8DWoMoI7CAwX8_LjQHig"])', // Live
      'ytd-guide-entry-renderer:has(a[href="/feed/trending"])',
      'ytd-mini-guide-entry-renderer:has(a[href="/feed/explore"])',
      'ytd-mini-guide-entry-renderer:has(a[href="/feed/trending"])',
    ]),

    bell: list(['ytd-notification-topbar-button-renderer', 'ytd-notification-topbar-button-shape-renderer']),

    // Links inside a tile that point at its channel.
    channelLink: 'a[href^="/@"], a[href^="/channel/UC"], a[href^="https://www.youtube.com/@"], a[href^="https://www.youtube.com/channel/"]',

    // Where a tile shows its channel name, most specific first.
    channelNameSpots: [
      'ytd-channel-name #text',
      'ytd-channel-name a',
      '#channel-name #text',
      'yt-content-metadata-view-model [class*="MetadataRow"]',
      'yt-content-metadata-view-model [class*="metadata-row"]',
    ],

    // Watch page.
    watchOwnerRow: 'ytd-watch-metadata #owner',
    watchSubscribe: '#subscribe-button',
    watchOwnerLink: 'ytd-watch-metadata ytd-video-owner-renderer a[href]',
    watchOwnerName: 'ytd-watch-metadata ytd-video-owner-renderer #channel-name #text',
    watchOwnerAvatar: 'ytd-watch-metadata ytd-video-owner-renderer #avatar img',
    ownerRenderer: 'ytd-watch-metadata ytd-video-owner-renderer',
    video: '#movie_player video',
    player: '#movie_player',
    autoplayOn: '.ytp-autonav-toggle-button[aria-checked="true"]',
    autoplayOff: '.ytp-autonav-toggle-button[aria-checked="false"]',

    // Channel page.
    channelBrowse: 'ytd-browse[page-subtype="channels"]:not([hidden])',
    channelActions: list([
      '#page-header yt-flexible-actions-view-model',
      'ytd-c4-tabbed-header-renderer #buttons',
      '#channel-header #buttons',
    ]),
    channelTitle: list([
      '#page-header h1',
      'ytd-c4-tabbed-header-renderer #channel-name #text',
      '#channel-header #channel-name #text',
    ]),
    channelAvatar: list(['#page-header yt-avatar-shape img', '#channel-header #avatar img']),
  };

  SEL.allTiles = list([SEL.filterTiles, SEL.searchTiles]);

  SEL.pageWorld = { player: SEL.player, owner: SEL.ownerRenderer, channelBrowse: SEL.channelBrowse };

  // Identifies what a tile currently shows. YouTube recycles tile elements,
  // so this is how we notice that one now holds a different video.
  SEL.tileKey = function (tile) {
    const a = tile.querySelector('a[href*="watch?v="], a[href^="/shorts/"], a[href*="list="]');
    if (!a) return '';
    const href = a.getAttribute('href') || '';
    try {
      const u = new URL(href, 'https://www.youtube.com');
      if (u.pathname.startsWith('/shorts/')) return 's:' + (u.pathname.split('/')[2] || '');
      return u.searchParams.get('v') || 'l:' + (u.searchParams.get('list') || '');
    } catch (_) {
      return href;
    }
  };

  SEL.channelName = function (tile) {
    for (const spot of SEL.channelNameSpots) {
      const el = tile.querySelector(spot);
      const text = el && el.textContent.split('•')[0].trim();
      if (text) return text;
    }
    return '';
  };

  root.__YF_SEL = SEL;
})(globalThis);
