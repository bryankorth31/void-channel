# VOIDtv

**A Netflix/YouTube-style app for public domain media from the Internet Archive.**

VOIDtv treats the Internet Archive's 44M+ video library the way YouTube treats its content library — discovery, engagement, personalization — combined with Wikipedia-style community curation. The Archive provides free hosting and content; VOIDtv builds the discovery, social, and curation layers on top.

- **Live site:** [voidtv.net](https://voidtv.net)
- **API:** [api.voidtv.net](https://api.voidtv.net/health)
- **Source:** [github.com/bryankorth31/void-channel](https://github.com/bryankorth31/void-channel)

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Backend](#backend)
  - [Server & Middleware](#server--middleware)
  - [Archive.js — Content Engine](#archivejs--content-engine)
  - [Cache — L1 + L2 Dual Layer](#cache--l1--l2-dual-layer)
  - [API Routes](#api-routes)
  - [Auth & Sync](#auth--sync)
  - [Social Features](#social-features)
  - [Backend File Reference](#backend-file-reference)
- [Frontend (Mobile)](#frontend-mobile)
  - [Screens](#screens)
  - [Components](#components)
  - [Context Providers](#context-providers)
  - [API Client](#api-client)
  - [Navigation](#navigation)
  - [Theme & Design System](#theme--design-system)
  - [Generation System](#generation-system)
  - [Gamification](#gamification)
  - [Frontend File Reference](#frontend-file-reference)
- [Infrastructure & Deployment](#infrastructure--deployment)
  - [Services & Credentials](#services--credentials)
  - [Environment Variables](#environment-variables)
  - [DNS & CDN](#dns--cdn)
  - [Cache Strategy](#cache-strategy)
- [Categories](#categories)
- [Content Policy](#content-policy)
- [Development](#development)
- [Roadmap](#roadmap)

---

## Architecture Overview

```
                        voidtv.net (Vercel)
                              |
                         React Native
                         Expo SDK 54
                              |
                    https://api.voidtv.net
                              |
                     Cloudflare CDN (edge)
                     Cache-Control headers
                     SSL/TLS Full (Strict)
                              |
                     Render (Standard tier)
                        Express.js
                              |
              +---------+-----+------+---------+
              |         |            |         |
         archive.org  Supabase   Upstash    JSON files
         (content)    (Postgres   Redis     (hearts.json
                       + Auth)    (L2)      views.json)
                                   |
                              In-memory Map
                                 (L1)
```

**Data flow:** App --> Cloudflare CDN (edge cache) --> Render (Express) --> Archive.org / Supabase / Redis

The app **never talks to archive.org directly**. All content requests go through the Express proxy, which normalizes responses, caches aggressively, and serves the mobile/web clients.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Frontend framework** | React Native + Expo | SDK 54, React 19 |
| **Web rendering** | react-native-web | via Expo |
| **Video player** | expo-video | SDK 54 |
| **Navigation** | React Navigation | Bottom tabs + native stack |
| **Backend** | Express.js | 4.18 |
| **Database** | Supabase (PostgreSQL) | Hosted |
| **Auth** | Supabase Auth | Email + anonymous sessions |
| **Cache L1** | In-memory Map | Built-in |
| **Cache L2** | Upstash Redis | REST API |
| **CDN** | Cloudflare | Proxied, edge caching |
| **Backend hosting** | Render | Standard tier |
| **Web hosting** | Vercel | Free tier |
| **Domain** | voidtv.net | Cloudflare Registrar |
| **Fonts** | Space Mono + DM Sans | expo-google-fonts |

---

## Project Structure

```
void-channel/
|-- backend/                    # Express.js API proxy
|   |-- server.js               # Main server: routes, middleware, CDN headers
|   |-- archive.js              # Internet Archive integration: 47 categories, search, metadata
|   |-- cache.js                # Dual-layer cache: L1 (Map) + L2 (Upstash Redis)
|   |-- auth.js                 # Auth routes: register, login, anonymous, profile
|   |-- sync.js                 # Cloud sync: history, watchlist, hearts, game state
|   |-- supabase.js             # Supabase client init + auth middleware
|   |-- hearts.js               # Global heart counts: JSON file persistence
|   |-- views.js                # View counter: JSON file persistence
|   |-- playlists.js            # User playlists: CRUD, reorder, public/private
|   |-- subscriptions.js        # Category subscriptions + feed
|   |-- trending.js             # Trending + recommendations (watch events)
|   |-- comments.js             # Threaded comments: CRUD, voting, moderation
|   |-- contributions.js        # X-Ray community metadata: cast, trivia, tags
|   |-- admin.js                # Admin dashboard: stats, flush, moderation
|   |-- embed.js                # OG meta tags for social sharing / link previews
|   |-- _migrate.js             # One-time database migration helper
|   |-- hearts.json             # Heart count data (auto-generated)
|   |-- data/views.json         # View count data (auto-generated)
|   +-- package.json            # Dependencies
|
|-- mobile/                     # React Native / Expo app
|   |-- App.js                  # Root: font loading, provider tree
|   |-- app.json                # Expo config: slug, bundle IDs, plugins
|   |-- src/
|   |   |-- api/
|   |   |   +-- client.js       # API client: all endpoint functions, auth token injection
|   |   |-- screens/
|   |   |   |-- HomeScreen.js       # Main browse: hero, filter chips, category rows
|   |   |   |-- SearchScreen.js     # Full-text search with category/duration filters
|   |   |   |-- SignalScreen.js     # Discovery feed: trending, subscriptions, For You
|   |   |   |-- WatchlistScreen.js  # Saved items, hearts, history
|   |   |   |-- PlayerScreen.js     # Video player: metadata, related, comments, X-Ray
|   |   |   |-- AuthScreen.js       # Sign in / sign up / anonymous
|   |   |   |-- PlaylistScreen.js   # Single playlist view + playback
|   |   |   |-- PlaylistsListScreen.js  # All user playlists
|   |   |   +-- AdminScreen.js      # Admin panel: stats, flush, user management
|   |   |-- components/
|   |   |   |-- VideoPlayer.js      # Custom video player: controls, progress, fullscreen
|   |   |   |-- MediaCard.js        # Thumbnail card: title, year, creator
|   |   |   |-- CategoryRow.js      # Horizontal scrolling row of MediaCards
|   |   |   |-- DesktopSidebar.js   # Collapsible left nav (desktop web only)
|   |   |   |-- SearchBar.js        # Header search input
|   |   |   |-- SkeletonCard.js     # Loading placeholder wireframe
|   |   |   |-- FastImage.js        # Cross-platform image with web fallback
|   |   |   |-- AddToPlaylistModal.js   # Bottom sheet: add item to playlist
|   |   |   |-- AvatarPickerModal.js    # Avatar selection modal
|   |   |   |-- WaveAvatar.js       # Animated wave-effect avatar
|   |   |   |-- DailyBountyCard.js  # Daily challenge/bounty display
|   |   |   +-- index.js           # Component barrel export
|   |   |-- context/
|   |   |   |-- SidebarContext.js   # Collapsible sidebar state (expanded/collapsed width)
|   |   |   |-- GenerationContext.js  # Generation theme (Boomer/Millennial/GenZ)
|   |   |   |-- AuthContext.js      # User session, token refresh, cloud sync
|   |   |   +-- GameContext.js      # XP, ranks, bounties, contribution tracking
|   |   |-- navigation/
|   |   |   +-- index.js           # Tab navigator + stack navigator, URL routing
|   |   |-- theme/
|   |   |   +-- index.js           # Colors, fonts, spacing, radius, shadows, card sizes
|   |   |-- data/
|   |   |   |-- generations.js     # 3 generation themes + ranks + daily bounties
|   |   |   +-- avatars.js         # Avatar options
|   |   |-- store/
|   |   |   |-- cache.js           # AsyncStorage persistence layer
|   |   |   +-- gameStore.js       # Game state persistence (XP, watched, bounties)
|   |   +-- shims/
|   |       |-- reanimated-web.js  # Web shim for react-native-reanimated
|   |       +-- worklets-web.js    # Web shim for worklets
|   |-- assets/                 # App icons, splash, favicon
|   +-- package.json            # Expo SDK 54, React 19, dependencies
|
+-- README.md                   # This file
```

---

## Backend

### Server & Middleware

**`backend/server.js`** is the main Express server. Key middleware stack:

1. **CORS** -- open (all origins)
2. **Cloudflare CDN edge-cache headers** -- middleware that sets `Cache-Control` with `s-maxage` + `stale-while-revalidate` per route:

| Route | Edge TTL | Stale-While-Revalidate |
|-------|----------|----------------------|
| `/api/item/:id` | 6 hours | 1 hour |
| `/api/categories`, `/api/category/:id` | 20 min | 10 min |
| `/api/search` | 30 min | 10 min |
| `/api/shorts` | 30 min | 10 min |
| `/api/related/:id` | 1 hour | 10 min |
| `/api/trending` | 5 min | 2 min |
| `/api/hearts/top`, `/api/views/top` | 5 min | 2 min |
| `/api/banner` | 1 min | -- |
| `/api/random` | no-store | -- |

3. **Request logging** -- method, path, status, latency, cache hit/miss
4. **Optional auth** -- reads JWT from Authorization header if present, does not require it

### Archive.js -- Content Engine

**`backend/archive.js`** is the heart of the content system. Contains:

- **47 content categories** organized into groups:
  - `type` -- Main genres (Lost Reels, The Projection Room, The Animation Vault, Feature Films, etc.)
  - `deep` -- Deep cuts / rabbit holes (Blood on the Highway, Are You Popular?, The Red Scare Reel, etc.)
  - `show` -- Specific series (Betty Boop, Popeye, Looney Tunes, Three Stooges, etc.)
  - `decade` -- By era (1930s through 2020s)
  - `mature` -- Adult content (The Talk, Behind Closed Doors)

- **NSFW exclusion filter** -- `NSFW_EXCLUDE` constant strips adult content from all regular queries. Mature content is isolated in its own categories, never excluded from the app entirely.

- **News/politics filter** -- `NEWS_POLITICS_EXCLUDE` keeps current events out of entertainment categories.

- **Blended search** -- 40% mainstream (sorted by downloads) + 60% obscure (random sort from deeper pages). Creates variety instead of always surfacing the same popular items.

- **Video quality tiers** -- Resolves the best available MP4 stream from Archive.org metadata files.

- **Key functions:**
  - `getAllCategories(perCategory, shuffle)` -- Fetches items for all 47 categories
  - `getCategoryItems(id, rows, page)` -- Single category with pagination
  - `search(query, rows, page, sort)` -- Full-text Lucene search on archive.org
  - `getItem(identifier)` -- Full item metadata including resolved video URL
  - `getRelated(identifier, limit)` -- Rabbit hole recommendations based on subjects + collection

### Cache -- L1 + L2 Dual Layer

**`backend/cache.js`** implements a two-layer caching system:

| Layer | Storage | Speed | Survives Restart | Shared Across Instances |
|-------|---------|-------|-----------------|------------------------|
| **L1** | In-memory Map | Instant (~0ms) | No | No |
| **L2** | Upstash Redis (REST) | ~50ms | Yes | Yes |

**Behavior:**
- `get(key)` -- **Async.** Checks L1 first. On miss, checks L2 (Redis). On L2 hit, warms L1 for next request.
- `set(key, data, ttl)` -- Writes L1 immediately (sync). Writes L2 in background (fire-and-forget).
- `delete(key)` -- Removes from both layers.
- `flush()` -- Clears L1 Map + Redis `FLUSHDB`.
- `sweep()` -- Background job every 5 min clears expired L1 entries.

**Graceful degradation:** If `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` env vars are not set, falls back to L1-only mode (identical to original behavior).

Default TTL: 1200 seconds (20 minutes).

### API Routes

#### Content (public, no auth required)

| Method | Endpoint | Description | Cache TTL |
|--------|----------|-------------|-----------|
| `GET` | `/api/categories` | All 47 categories with items (the big payload) | 20 min |
| `GET` | `/api/categories?shuffle=true` | Randomized item selection, bypasses cache | no-store |
| `GET` | `/api/category/:id?page=N&rows=N` | Single category, paginated (max 50 rows) | 20 min |
| `GET` | `/api/search?q=...&category=...&collection=...&creator=...` | Full-text search with optional filters | 30 min |
| `GET` | `/api/search?minDuration=N&maxDuration=N` | Duration filtering (seconds) | 30 min |
| `GET` | `/api/search?mature=true` | Include NSFW results | 30 min |
| `GET` | `/api/shorts?limit=N` | Short-form content under 2 min | 30 min |
| `GET` | `/api/item/:identifier` | Full item details + resolved video URL | 6 hours |
| `GET` | `/api/related/:identifier?limit=N` | Rabbit hole: similar items | 1 hour |
| `GET` | `/api/random` | Random item from random category | no-store |
| `GET` | `/api/banner` | Current site-wide banner message | 1 min |
| `GET` | `/health` | Server health check | -- |
| `GET` | `/api/cache/stats` | Cache diagnostic info | -- |

#### Hearts (anonymous, no auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/hearts/:id` | Heart an item (body: `{ title, thumbnail, creator?, year? }`) |
| `DELETE` | `/api/hearts/:id` | Un-heart |
| `GET` | `/api/hearts/top?limit=N` | Community most-hearted (max 100) |
| `GET` | `/api/hearts/count/:id` | Heart count for single item |

#### Views (anonymous, no auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/views/:id` | Record a view (fire-and-forget from player) |
| `GET` | `/api/views/count/:id` | View count for single item |
| `GET` | `/api/views/top?limit=N` | Most-viewed items (max 100) |
| `GET` | `/api/views/stats` | Total views across all items |

### Auth & Sync

#### Auth Routes (`/api/auth/`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Email + password signup (auto-generates `void_XXXXXXXX` username) |
| `POST` | `/api/auth/login` | Email + password login |
| `POST` | `/api/auth/anonymous` | Create anonymous session (upgradeable later) |
| `POST` | `/api/auth/refresh` | Refresh JWT token |
| `GET` | `/api/auth/profile` | Get current user profile (requires auth) |
| `PATCH` | `/api/auth/profile` | Update username, display_name, avatar, generation |

#### Sync Routes (`/api/sync/`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/sync/history` | Bulk upsert watch history from device |
| `POST` | `/api/sync/watchlist` | Bulk upsert watchlist from device |
| `POST` | `/api/sync/hearts` | Bulk upsert hearts from device |
| `POST` | `/api/sync/game` | Sync XP / game state |
| `GET` | `/api/sync/pull` | Pull all user data (new device login) |

### Social Features

#### Playlists (`/api/playlists/`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/playlists` | List user's playlists |
| `POST` | `/api/playlists` | Create playlist |
| `GET` | `/api/playlists/:id` | Get playlist with items |
| `PATCH` | `/api/playlists/:id` | Update title/description/visibility |
| `DELETE` | `/api/playlists/:id` | Delete playlist |
| `POST` | `/api/playlists/:id/items` | Add item to playlist |
| `DELETE` | `/api/playlists/:id/items/:itemId` | Remove item |
| `POST` | `/api/playlists/:id/reorder` | Reorder items |

#### Subscriptions (`/api/subscriptions/`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/subscriptions` | List user's subscriptions |
| `POST` | `/api/subscriptions` | Subscribe to category |
| `DELETE` | `/api/subscriptions/:categoryId` | Unsubscribe |
| `GET` | `/api/subscriptions/feed?page=N&rows=N` | Subscription feed |

#### Comments (`/api/items/:itemId/comments`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/items/:itemId/comments?page=N&sort=newest` | Get comments (public) |
| `POST` | `/api/items/:itemId/comments` | Post comment (requires auth) |
| `PATCH` | `/api/comments/:id` | Edit own comment |
| `DELETE` | `/api/comments/:id` | Soft-delete own comment |
| `GET` | `/api/comments/:id/replies` | Get thread replies |

#### X-Ray / Contributions (`/api/xray/`)

Community-contributed metadata (cast, director, trivia, tags, content warnings).

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/xray/:itemId` | Get all contributions for an item |
| `POST` | `/api/xray/:itemId` | Submit a contribution |
| `GET` | `/api/xray/user/stats` | Current user's contribution stats |

#### Trending & Recommendations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/watch-events` | Fire watch event (start/progress/complete/skip) |
| `GET` | `/api/trending?limit=N` | Most-watched in last 48h |
| `GET` | `/api/recommendations?limit=N` | Personalized "For You" (requires auth) |

#### Admin (`/api/admin/`)

All admin routes require auth + admin email verification.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/dashboard` | Platform stats |
| `DELETE` | `/api/admin/views` | Wipe all view data |
| `DELETE` | `/api/admin/hearts` | Wipe all heart data |
| `DELETE` | `/api/admin/cache` | Flush L1 + Redis cache |
| `GET` | `/api/admin/users` | List registered users |
| `GET` | `/api/admin/contributions?status=pending` | Pending contributions |
| `POST` | `/api/admin/contributions/:id/approve` | Approve contribution |
| `POST` | `/api/admin/contributions/:id/reject` | Reject contribution |
| `POST` | `/api/admin/broadcast` | Set site-wide banner |
| `DELETE` | `/api/admin/broadcast` | Clear banner |

**Admin emails:** `bryankorth31@gmail.com`, `preacherb@cashvalues.org`

### Backend File Reference

| File | Purpose |
|------|---------|
| `server.js` | Main server, all route mounting, CDN headers |
| `archive.js` | 47 categories, search, item resolution, NSFW filter |
| `cache.js` | Dual-layer L1 (Map) + L2 (Redis) cache |
| `auth.js` | Register, login, anonymous, profile |
| `sync.js` | Cloud sync (history, watchlist, hearts, game) |
| `supabase.js` | Supabase client init, auth middleware |
| `hearts.js` | Global heart tally, JSON file persistence |
| `views.js` | View counter, JSON file persistence |
| `playlists.js` | Playlist CRUD |
| `subscriptions.js` | Category subscriptions + feed |
| `trending.js` | Trending + recommendations |
| `comments.js` | Threaded comments |
| `contributions.js` | X-Ray community metadata |
| `admin.js` | Admin dashboard + moderation |
| `embed.js` | OG meta tags for social sharing |

---

## Frontend (Mobile)

### Screens

#### HomeScreen (`HomeScreen.js`)
The main browse experience. Contains:
- **Hero card** -- featured item, full-width, auto-rotates
- **YouTube-style filter chips** -- horizontal scroll of genre tabs ("All", "Horror", "Sci-Fi", etc.)
- **Category rows** -- horizontal scrolling rows of MediaCards, one per active category
- **Progressive loading waterfall** -- Tier 1 (immediate), Tier 2 (1.5s), Tier 3 (3.5s) for staggered content load
- Dynamic content width based on sidebar state: `SCREEN_W - sidebarWidth`

#### SearchScreen (`SearchScreen.js`)
Full-text search with:
- Category filter (narrow to genre)
- Duration filters (min/max)
- Collection and creator search
- Paginated results

#### SignalScreen (`SignalScreen.js`)
Discovery/social feed:
- Trending (most-watched last 48h)
- Subscription feed (from followed categories)
- Personalized "For You" recommendations

#### WatchlistScreen (`WatchlistScreen.js`)
User's personal library:
- Saved/bookmarked items
- Hearted items
- Watch history
- Cloud sync status indicator

#### PlayerScreen (`PlayerScreen.js`)
The video playback experience (~2000+ lines). Contains:
- Custom video player with controls overlay
- Item metadata (title, year, creator, description)
- Rabbit hole -- related items horizontal scroll
- Comments section
- X-Ray community metadata
- "More from this collection" and "More by this creator" sections
- Add to playlist, heart, share actions
- Watch event tracking (start/25%/50%/75%/100%)
- Dynamic layout: `AVAILABLE_W = SCREEN_W - sidebarWidth - detailsSidebar`

#### AuthScreen (`AuthScreen.js`)
Sign in / sign up form:
- Email + password
- Anonymous session (one-tap, upgradeable later)
- Generation selection during signup

#### PlaylistScreen / PlaylistsListScreen
- Single playlist view with drag-to-reorder
- Play as channel (auto-advance through items)
- All user playlists grid with create button

#### AdminScreen (`AdminScreen.js`)
Admin panel (restricted to admin emails):
- Platform stats (users, views, hearts, contributions)
- Cache flush button
- User list
- Pending contribution moderation queue
- Site-wide banner management

### Components

| Component | Purpose |
|-----------|---------|
| `VideoPlayer.js` | Custom video player: play/pause, progress bar, volume, fullscreen, keyboard shortcuts (Space, arrows, M, F) |
| `MediaCard.js` | Thumbnail card with title, year, creator overlay. Press navigates to PlayerScreen |
| `CategoryRow.js` | Horizontal scroll row of MediaCards with category header. Supports subscription button |
| `DesktopSidebar.js` | Collapsible left navigation (desktop web only). Expanded: 150px with icons + labels. Collapsed: 56px icon rail. Contains Browse, Signal, My Void nav + You section + Explore + Support |
| `SearchBar.js` | Persistent search input in header. Always visible on desktop |
| `SkeletonCard.js` | Loading wireframe placeholder matching MediaCard dimensions |
| `FastImage.js` | Cross-platform image: native Image on mobile, standard img on web |
| `AddToPlaylistModal.js` | Bottom sheet modal to add current item to playlist or create new |
| `AvatarPickerModal.js` | Grid of avatar options for profile customization |
| `WaveAvatar.js` | Animated wave-effect avatar display |
| `DailyBountyCard.js` | Displays current daily challenges with progress |

### Context Providers

Provider tree (outermost to innermost):

```
GestureHandlerRootView
  SafeAreaProvider
    SidebarProvider          <-- sidebar collapsed/expanded state
      GenerationProvider     <-- theme (Boomer/Millennial/GenZ)
        AuthProvider         <-- user session, cloud sync
          GameProvider       <-- XP, ranks, bounties
            Navigation
```

#### SidebarContext
- `collapsed` -- boolean
- `sidebarWidth` -- 150 (expanded) or 56 (collapsed)
- `toggleSidebar()` -- toggle function
- Only active on desktop web (`Platform.OS === 'web' && width > 900`)

#### GenerationContext
- `generationId` -- 'boomer' | 'millennial' | 'genz'
- `gen` -- current generation config (accent color, category names, taglines, loading messages, search hints, vibes)
- `chooseGeneration(id)` -- persists to AsyncStorage
- Default: 'millennial'

#### AuthContext
- `user` -- profile object or null
- `session` -- `{ access_token, refresh_token, expires_at }`
- `isAuthenticated`, `isAnonymous` -- derived booleans
- `loading`, `syncing` -- loading states
- Auto token refresh via timer
- Triggers cloud sync on sign-in

#### GameContext
- `xp` -- total experience points
- `totalWatched` -- videos viewed
- `totalContributions` -- X-Ray submissions
- `rank` -- current rank object
- `daysExploring` -- streak counter
- `recentContributions` -- last N contributions
- XP rewards for contributions (cast: 10, trivia: 15, context: 20, etc.)

### API Client

**`mobile/src/api/client.js`** -- All API communication in one file.

- **Base URL:** `http://localhost:3001` (dev) / `https://api.voidtv.net` (production)
- **Auth injection:** `setAuthToken(token)` injects `Authorization: Bearer` header on all requests
- **Timeouts:** 30s default, 90s for cold starts, 180s for full category fetch
- **Abort controller:** All requests are cancellable

Exports 50+ functions covering every API endpoint:
- Content: `getCategories`, `getCategoryItems`, `searchItems`, `searchCollection`, `searchCreator`, `getItem`, `getShorts`, `getRandomItem`, `getRelated`
- Hearts: `heartItem`, `unheartItem`, `getTopHearts`
- Views: `recordView`, `getViewCount`, `getTopViewed`, `getViewStats`
- Auth: `register`, `login`, `loginAnonymous`, `refreshToken`, `getProfile`, `updateProfile`
- Sync: `syncHistory`, `syncWatchlist`, `syncHearts`, `syncGame`, `syncPull`
- X-Ray: `getXRay`, `contribute`, `getContributionStats`
- Playlists: full CRUD + `addToPlaylist`, `removeFromPlaylist`, `reorderPlaylist`
- Subscriptions: `getSubscriptions`, `subscribe`, `unsubscribe`, `getSubscriptionFeed`
- Social: `sendWatchEvent`, `getTrending`, `getRecommendations`, `getComments`, `postComment`, `editComment`, `deleteComment`, `getCommentReplies`
- Admin: `adminDashboard`, `adminWipeViews`, `adminWipeHearts`, `adminFlushCache`, `adminUsers`, `adminContributions`, `adminApproveContribution`, `adminRejectContribution`, `adminSetBanner`, `adminClearBanner`

### Navigation

**`mobile/src/navigation/index.js`**

**Tab Navigator** (bottom tabs on mobile, sidebar on desktop):

| Tab | Screen | Color | Icon |
|-----|--------|-------|------|
| Browse | HomeScreen | `#5cb8ff` (brand blue) | tv |
| Search | SearchScreen | `#b566ff` (violet) | search |
| Signal | SignalScreen | `#4ade80` (emerald) | compass |
| My Void | WatchlistScreen | `#f5a623` (amber) | bookmark |

**Stack Navigator** (over tabs):
- Player: `/watch/:id`
- Auth: `/auth`
- Playlists: `/playlists`
- Playlist: `/playlist/:playlistId`
- Admin: `/admin`

**Desktop detection:** `IS_DESKTOP = Platform.OS === 'web' && Dimensions.get('window').width > 900`

When desktop: bottom tabs are replaced by `DesktopSidebar`, scene container gets `marginLeft: sidebarWidth`.

**Web URL routing** via React Navigation linking config.

**Lazy loading:** All screens except HomeScreen use `React.lazy()` for code splitting.

### Theme & Design System

**`mobile/src/theme/index.js`**

#### Colors
| Token | Value | Usage |
|-------|-------|-------|
| `bg` | `#0c0c0f` | Near-black background |
| `surface` | `#141418` | Card background |
| `card` | `#18181e` | Elevated card |
| `amber` | `#f5a623` | Primary accent (Millennial) |
| `textPrimary` | `#e4e2dc` | Main text |
| `textSecondary` | `#8a8a92` | Labels |
| `textMuted` | `#5a5a62` | Hints |
| `textGhost` | `#34343c` | Barely visible |

**Brand blue:** `#5cb8ff` -- used for Browse tab, donate CTA, sidebar highlights.

#### Fonts
- **Space Mono** (400, 700) -- monospace, titles, labels, category names
- **DM Sans** (400, 500, 600) -- humanist sans, body text, descriptions

#### Responsive
- Card size: 300x169 (desktop) / 198x124 (mobile) -- 16:9 aspect ratio
- Breakpoint: `768px` width for card size switch
- Desktop sidebar: `900px` width for sidebar activation

### Generation System

Three generation themes that change the entire UI voice:

| Generation | Accent Color | Vibe |
|-----------|-------------|------|
| **Boomer** (1946-1964) | `#d4a843` (warm gold) | Respectful, archival. "Before sound ruined everything." |
| **Millennial** (1981-1996) | `#f5a623` (amber) | Ironic, nostalgic. "No algorithm would have recommended this." |
| **Gen Z** (1997-2012) | `#b2ff3e` (neon green) | Casual, chaotic. "literally what even is this" |

Each generation defines:
- `accentColor` -- UI accent throughout the app
- `categoryPriority` -- ordering of categories on home screen
- `taglines` -- rotating taglines
- `loadingMessages` -- loading spinner text
- `heroEyebrow` -- text above hero card
- `searchTitle`, `searchPlaceholder`, `searchHints` -- search UX copy
- `categories` -- per-category name + subtitle overrides (same content, different voice)
- `vibes` -- vibe tag labels

### Gamification

**Rank System:**

| Rank | XP Range | Perks |
|------|----------|-------|
| Wanderer | 0 - 99 | Basic access |
| Explorer | 100 - 299 | -- |
| Digger | 300 - 699 | -- |
| Archivist | 700 - 1,499 | Tags + links auto-approved |
| Curator | 1,500 - 2,999 | All edits auto-approved |
| Keeper of Records | 3,000+ | Can review/approve others' edits |

**XP Sources:**
- Watching videos, completing bounties
- X-Ray contributions: cast (10 XP), director (10), trivia (15), context (20), tag (5), warning (5)

**Daily Bounties** -- Three challenges per day, deterministic from date seed:
1. Watch something from a specific decade (50 XP)
2. Find a film about a specific topic (50 XP)
3. Unearth a hidden gem with < 5,000 views (50 XP)

### Frontend File Reference

| File | Purpose |
|------|---------|
| `App.js` | Root: fonts, provider tree |
| `HomeScreen.js` | Browse: hero, chips, category rows |
| `PlayerScreen.js` | Video player + all metadata |
| `SearchScreen.js` | Search + filters |
| `SignalScreen.js` | Discovery feed |
| `WatchlistScreen.js` | Personal library |
| `AuthScreen.js` | Sign in/up |
| `AdminScreen.js` | Admin panel |
| `client.js` | API client (50+ functions) |
| `VideoPlayer.js` | Custom player controls |
| `DesktopSidebar.js` | Collapsible left nav |
| `generations.js` | 3 themes + ranks + bounties |
| `navigation/index.js` | Tab + stack nav, URL routing |
| `theme/index.js` | Design tokens |
| `SidebarContext.js` | Sidebar state |
| `GenerationContext.js` | Theme state |
| `AuthContext.js` | User session |
| `GameContext.js` | XP + ranks |

---

## Infrastructure & Deployment

### Services & Credentials

| Service | Purpose | Tier | Endpoint |
|---------|---------|------|----------|
| **Render** | Backend hosting | Standard | void-channel.onrender.com |
| **Vercel** | Web (frontend) hosting | Free | voidtv.net |
| **Supabase** | PostgreSQL + Auth | Free | sawuxdquewomjrgtmgtb.supabase.co |
| **Upstash Redis** | L2 cache (REST API) | Free | daring-lamprey-145377.upstash.io |
| **Cloudflare** | DNS, CDN, SSL | Free | Registrar for voidtv.net |
| **GitHub** | Source control | Free | github.com/bryankorth31/void-channel |
| **Square** | Donations | -- | square.link/u/dJioBmlW |

### Environment Variables

**On Render (backend):**

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (bypasses RLS) |
| `SUPABASE_ANON_KEY` | Supabase anon key (for user-scoped queries) |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis auth token |
| `PORT` | Server port (default: 3001, Render sets automatically) |

**On Vercel (frontend):** None required. `BASE_URL` is hardcoded in `client.js`.

### DNS & CDN

**Domain:** `voidtv.net` (registered on Cloudflare Registrar)

**DNS Records (Cloudflare):**

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | `api` | `void-channel.onrender.com` | Proxied (orange) |
| CNAME | `@` | `cname.vercel-dns.com` | Proxied (orange) |
| CNAME | `www` | `cname.vercel-dns.com` | Proxied (orange) |

**Cloudflare SSL/TLS:** Full (Strict)

**Traffic flow:**
```
Browser --> Cloudflare (edge cache check)
  --> HIT: serve from nearest PoP (~20ms)
  --> MISS: forward to origin (Render/Vercel)
    --> Origin responds with Cache-Control headers
    --> Cloudflare caches response at edge for s-maxage duration
    --> Response returned to browser
```

### Cache Strategy

**Three-layer caching:**

1. **Cloudflare CDN edge** -- `s-maxage` headers, serves cached responses from nearest PoP globally. `stale-while-revalidate` lets Cloudflare serve stale content while refreshing in background.

2. **Upstash Redis (L2)** -- Survives Render restarts. ~50ms reads via REST API. Shared across instances if scaled.

3. **In-memory Map (L1)** -- Instant reads (~0ms). Lost on restart but refilled from L2 on first access.

**TTLs by content type:**

| Content | Server Cache | CDN Edge | Rationale |
|---------|-------------|----------|-----------|
| Item metadata | 6 hours | 6 hours | Static once ingested |
| Related items | 1 hour | 1 hour | Semi-static |
| Categories | 20 min | 20 min | Content rotation |
| Search results | 30 min | 30 min | Balance freshness vs load |
| Shorts | 30 min | 30 min | Rotates via time bucket |
| Trending | -- | 5 min | Fast-changing |
| Hearts/Views counts | -- | 5 min | Moderately dynamic |
| Banner | -- | 1 min | Admin-controlled |
| Random | -- | no-store | Always fresh |
| Shuffled categories | -- | no-store | Always randomized |

---

## Categories

### Main Channels (47 total)

**By Type:** Lost Reels, The Projection Room, The Weird Shelf, Sunday Morning Reel, The Operating Theater, Garage Cinema, Duck & Cover, Dead Brands & Sold Dreams, Before Google Maps, The Computer Chronicles, The Animation Vault, Most Popular, Feature Films, The Drive-In, Futures That Never Happened, Smoke & Shadows, The Evening Report, The TV Cart, Anime & Manga, Saturday Morning, After School Special, The Classroom, How To, World Cinema, Art House, Stage & Theatre, Abstract & Visual, Down the Rabbit Hole, Public Access, Home Shopping, Action & Violence, Music Videos & Concerts, Classic Sports, Nature & Wildlife, Comedy Gold, The Western, Love Stories, The Documentary, Game Shows, The Silent Era, War Footage, Blaxploitation

**Mature (isolated):** The Talk, Behind Closed Doors

**Deep Cuts:** Blood on the Highway, Are You Popular?, How to Behave, Wash Your Hands, The Red Scare Reel, The Bomb, Please Hold, Amber Waves, Doctor Recommended, Jello Molds & TV Dinners, It Came From the Swamp, So Bad It's Perfect, Rockets & Saucers, Before Television, Children of the Night, Christmas Morning 1963

**Shows/Series:** Betty Boop, Popeye the Sailor, Looney Tunes, Woody Woodpecker, Classic Disney, Felix the Cat, Three Stooges, The Fifth Dimension

**By Decade:** The Thirties through The 2020s

---

## Content Policy

- **NSFW content is NOT excluded** -- it is isolated in its own mature categories ("The Talk" and "Behind Closed Doors")
- All regular category and search queries apply `NSFW_EXCLUDE` filter automatically
- Users can opt into mature content via `?mature=true` search parameter
- News/politics content is filtered out of entertainment categories via `NEWS_POLITICS_EXCLUDE`

---

## Development

### Prerequisites
- Node.js 18+
- npm

### Backend
```bash
cd backend
npm install
# Create .env with SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY,
# UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
npm run dev             # Starts with --watch on port 3001
```

### Frontend
```bash
cd mobile
npm install
npx expo start --web    # Web development
npx expo start          # Native (iOS/Android via Expo Go)
```

### Key Conventions
- `var` at module scope in some files to prevent TDZ crashes in production bundles
- `Platform.OS === 'web'` checks throughout for web-specific behavior
- `IS_DESKTOP = Platform.OS === 'web' && SCREEN_W > 900` for desktop layout
- `position: 'fixed'` on web for sidebar (via Platform check)
- Dynamic `sceneContainerStyle: { marginLeft: sidebarWidth }` via SidebarContext

### Expo Config (`app.json`)
- **Slug:** `void-channel`
- **Version:** `0.3.0`
- **Bundle ID:** `org.cash.voidchannel` (iOS + Android)
- **Plugins:** `expo-video`, `expo-font`
- **Web bundler:** Metro, single-page output

---

## Roadmap

### Completed
- [x] Backend proxy with 47 categories + blended search
- [x] Video player with custom controls
- [x] Generation theming system (Boomer/Millennial/GenZ)
- [x] Gamification (XP, ranks, daily bounties)
- [x] User accounts (Supabase Auth: email + anonymous)
- [x] Cloud sync (history, watchlist, hearts, game state)
- [x] Playlists (CRUD, reorder, public/private)
- [x] Subscriptions + feed
- [x] Trending + recommendations
- [x] Comments (threaded, voting)
- [x] X-Ray community contributions
- [x] Admin panel
- [x] Cloudflare CDN + custom domain (api.voidtv.net)
- [x] Upstash Redis L2 cache
- [x] Collapsible desktop sidebar
- [x] Progressive loading waterfall
- [x] YouTube-style filter chips
- [x] OG meta tags for social sharing

### Planned
- [ ] AI search/recommendations (Claude Haiku)
- [ ] Video player web bug fixes (progress bar scrubbing + double controls)
- [ ] Vector similarity search (pgvector)
- [ ] Auto-curated channels
- [ ] TV platform support (Android TV, Apple TV, Fire TV)
- [ ] Service worker for offline web

---

## Monthly Budget

| Service | Current Cost | Paid Tier | Upgrade Trigger |
|---------|-------------|-----------|-----------------|
| Render (Standard) | ~$7/mo | -- | Current |
| Supabase | Free | $25/mo | 500+ DAU |
| Upstash Redis | Free | $10/mo | 1000+ DAU |
| Vercel | Free | $20/mo | 100K+ monthly views |
| Cloudflare | Free | Free | Always free |
| **Current total** | **~$7/mo** | **$62/mo max** | -- |

---

**DONATE_URL:** [square.link/u/dJioBmlW](https://square.link/u/dJioBmlW)

*Before AI slop, there was human creativity. Generating since 1895.*
