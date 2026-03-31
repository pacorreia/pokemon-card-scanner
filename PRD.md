# Planning Guide

A mobile-first Pokémon card collection manager that uses AI vision to scan and recognize cards, automatically cataloging them into a searchable inventory with duplicate detection.

**Experience Qualities**: 
1. **Effortless** - Scanning and adding cards should feel instant and magical, with minimal user input required.
2. **Organized** - The collection should be easy to browse, search, and understand at a glance with clear visual hierarchy.
3. **Delightful** - Interactions should feel playful and rewarding, celebrating the joy of collecting with satisfying animations and vibrant colors.

**Complexity Level**: Complex Application (advanced functionality, likely with multiple views)
- This app requires AI vision integration for card recognition, persistent data storage for collections, search functionality, duplicate detection algorithms, and multiple views (scan, inventory, card details, duplicates).

## Essential Features

### Card Scanning & Recognition
- **Functionality**: Uses device camera to capture Pokémon card images and AI vision to identify card details (name, set, number, rarity), then automatically matches and fetches official card artwork from a local database downloaded from the Pokemon TCG Data GitHub repository
- **Purpose**: Eliminates manual data entry and provides professional card images for collection display using cached data for offline functionality
- **Trigger**: User taps the "Scan Card" button from the main inventory view
- **Progression**: Tap scan button → Camera opens → Point at card → Capture photo → AI recognizes card details → Local database lookup for official artwork → Card added to inventory with database image and success feedback
- **Success criteria**: Card is correctly identified with 90%+ accuracy, matched with local database artwork, and added to inventory within 5 seconds

### Database Management
- **Functionality**: Downloads and caches the complete Pokemon TCG card database from GitHub releases (ZIP file) on-demand with progress tracking, storing all card images and metadata locally using JSZip for extraction
- **Purpose**: Enables offline card recognition and provides accurate, up-to-date card information without relying on external APIs or individual file downloads
- **Trigger**: Automatic on first launch if no database exists, or manual via database button in header
- **Progression**: Click database icon → View database status → Tap refresh → Fetch latest release → Download ZIP file → Extract and parse JSON files → Database cached locally → Success notification
- **Success criteria**: Full database downloads successfully from GitHub releases (10-20MB ZIP), extracts all sets and cards, all cards searchable, and lookup performs within 100ms

### Inventory Management
- **Functionality**: Displays all collected cards in a grid/list view with card images, names, and quantities
- **Purpose**: Provides a comprehensive overview of the user's collection
- **Trigger**: Default view on app launch
- **Progression**: App opens → Inventory grid displays → Scroll to browse → Tap card for details
- **Success criteria**: Inventory loads instantly with smooth scrolling and clear card visibility

### Search & Filter
- **Functionality**: Search by card name, set, type, or rarity; filter by various attributes
- **Purpose**: Helps users quickly find specific cards in large collections
- **Trigger**: User taps search bar or filter button
- **Progression**: Tap search → Type query or select filters → Results update in real-time → Tap to view card
- **Success criteria**: Search returns results within 100ms with accurate matching

### Duplicate Detection
- **Functionality**: Automatically identifies and groups duplicate cards, showing quantity counts
- **Purpose**: Helps collectors identify trading opportunities and collection gaps
- **Trigger**: Automatic on card add; manual via "View Duplicates" button
- **Progression**: View inventory → Tap "Duplicates" → See grouped duplicates with counts → Tap to view all copies
- **Success criteria**: Duplicates are accurately identified and grouped with clear quantity indicators

### Card Details View
- **Functionality**: Shows comprehensive information about a selected card including image, stats, set info, and quantity owned
- **Purpose**: Provides detailed reference for individual cards
- **Trigger**: User taps any card from inventory or search results
- **Progression**: Tap card → Details slide up → View full info → Option to adjust quantity or remove → Close or navigate back
- **Success criteria**: Details display smoothly with all relevant information clearly organized

## Edge Case Handling

- **Poor Lighting Conditions**: Guide user with on-screen tips to improve lighting; allow manual retry
- **Unrecognized Cards**: Fall back to manual entry form with autofill suggestions
- **TCG API Match Failure**: If no match found in database, use placeholder image with card details; allow user to add custom image URL
- **Duplicate Scans**: Detect if card already exists and prompt to increase quantity instead of creating duplicate entry
- **Empty Collection**: Show welcoming empty state with clear call-to-action to scan first card
- **Offline Usage**: Core functionality (viewing inventory, search) works offline; scanning queues for when online
- **Slow AI Response**: Show loading indicator with estimated time; allow cancellation

## Design Direction

The design should evoke the excitement and nostalgia of opening a fresh pack of Pokémon cards - vibrant, energetic, and playful. It should feel modern and polished while celebrating the colorful world of Pokémon. The interface should be tactile and responsive, with satisfying interactions that make managing a collection feel like an engaging experience rather than a chore.

## Color Selection

A bold, energetic palette inspired by classic Pokémon card aesthetics with bright primary colors and strong contrasts.

- **Primary Color**: Electric Blue (oklch(0.55 0.18 240)) - Evokes Pokémon's iconic blue logo and communicates trust and technology
- **Secondary Colors**: 
  - Deep Slate (oklch(0.25 0.02 250)) - Provides grounding contrast for text and UI elements
  - Soft Cream (oklch(0.96 0.01 80)) - Warm neutral for cards and backgrounds
- **Accent Color**: Vibrant Yellow (oklch(0.88 0.18 95)) - The signature Pokémon yellow for CTAs, highlights, and energy
- **Foreground/Background Pairings**: 
  - Primary Blue (oklch(0.55 0.18 240)): White text (oklch(0.99 0 0)) - Ratio 7.2:1 ✓
  - Accent Yellow (oklch(0.88 0.18 95)): Deep Slate text (oklch(0.25 0.02 250)) - Ratio 12.4:1 ✓
  - Soft Cream Background (oklch(0.96 0.01 80)): Deep Slate text (oklch(0.25 0.02 250)) - Ratio 11.8:1 ✓
  - Card Background (oklch(0.99 0 0)): Deep Slate text (oklch(0.25 0.02 250)) - Ratio 14.1:1 ✓

## Font Selection

Typography should be modern and highly legible for mobile scanning while having a hint of playfulness to match the Pokémon theme.

- **Primary Font**: Space Grotesk - A geometric sans-serif with slightly quirky proportions that feels both technical (for the scanning feature) and friendly
- **Secondary Font**: Inter - For body text and UI labels where maximum readability is critical

- **Typographic Hierarchy**: 
  - H1 (Screen Titles): Space Grotesk Bold / 32px / -0.02em letter spacing / line-height 1.1
  - H2 (Card Names): Space Grotesk Semibold / 20px / -0.01em letter spacing / line-height 1.2
  - H3 (Section Headers): Space Grotesk Medium / 16px / normal spacing / line-height 1.3
  - Body (Card Details): Inter Regular / 15px / normal spacing / line-height 1.5
  - Caption (Set Info, Metadata): Inter Medium / 13px / normal spacing / line-height 1.4
  - Button Text: Space Grotesk Semibold / 16px / normal spacing

## Animations

Animations should emphasize the excitement of discovery and the satisfaction of organization. Card scanning should feel magical with a subtle flash effect. Card additions should have a celebratory bounce. Navigation transitions should be smooth and maintain spatial context with slide animations. Micro-interactions on buttons should provide tactile feedback with gentle scale and brightness changes.

## Component Selection

- **Components**: 
  - Dialog: For card scanning interface and detailed card views
  - Card: Primary container for individual card displays in grid
  - Input: Search bar with icon integration
  - Button: Scan action (primary), filters, and secondary actions
  - Badge: For rarity indicators, set badges, and quantity counts
  - Tabs: Switch between "All Cards", "Duplicates", and potentially "Sets" views
  - ScrollArea: Smooth scrolling for long lists
  - Separator: Visual breaks between sections
  - Sheet: Bottom drawer for filters on mobile
  
- **Customizations**: 
  - Custom camera interface component (not provided by Shadcn)
  - Card grid component with responsive columns and lazy loading
  - Floating Action Button (FAB) for quick scan access, styled with rounded-full and shadow-lg
  - Custom quantity badge with +/- controls overlay
  
- **States**: 
  - Scan Button: Default (vibrant yellow with subtle shadow), Hover (slight lift + brightness increase), Active (scale down 0.95), Loading (pulsing animation with spinner)
  - Card Items: Default (clean white card), Hover (subtle lift + shadow increase), Selected (border highlight in primary blue)
  - Search Input: Empty (light gray with search icon), Focused (blue ring + lifted), Filled (darker text)
  
- **Icon Selection**: 
  - Camera (scanning action)
  - MagnifyingGlass (search)
  - Funnel (filters)
  - Copy (duplicates)
  - Plus/Minus (quantity adjustment)
  - X (close/remove)
  - CardsThree (inventory/collection)
  - Stack (sets/groups)
  
- **Spacing**: 
  - Card grid gap: gap-4 (16px)
  - Section padding: p-6 (24px) on desktop, p-4 (16px) on mobile
  - Content margins: mb-6 (24px) between major sections
  - Button padding: px-6 py-3 for primary actions
  - Card internal padding: p-4 (16px)
  
- **Mobile**: 
  - Single column card grid on mobile (<640px), 2 columns on tablet (640-1024px), 3-4 columns on desktop
  - FAB positioned fixed bottom-right with safe area consideration
  - Bottom sheet instead of side panel for filters
  - Touch-optimized hit areas (minimum 44x44px)
  - Swipe gestures: swipe down to dismiss dialogs, swipe left on card for quick delete
  - Simplified header with hamburger menu for settings on mobile
