# Database Download & Persistence Fixes

## Issues Fixed

1. **"Failed to save sets data: Failed to set key"** - Sets data was too large to save as a single KV entry
2. **Incomplete downloads causing subsequent failures** - Old/partial data wasn't being cleaned up before new downloads
3. **No rollback mechanism** - Failed downloads would leave corrupted partial data

## Changes Made

### 1. Chunked Sets Data (Same as Cards)
- **Before**: Sets were saved as a single KV entry, which could exceed size limits
- **After**: Sets are now split into chunks of 50 sets each (similar to card chunks)
- New keys: `tcg-database-sets-chunk-0`, `tcg-database-sets-chunk-1`, etc.
- New metadata: `tcg-database-sets-chunk-count` tracks how many set chunks exist

### 2. Complete Cleanup Before Download
- **Before**: Only cleaned up card chunks (`tcg-database-cards-chunk-*`)
- **After**: Cleans up ALL database-related keys before starting a new download:
  - Card chunks: `tcg-database-cards-chunk-*`
  - Set chunks: `tcg-database-sets-chunk-*`
  - Old single keys: `tcg-database-sets`, `tcg-database-cards`
  - Metadata: `tcg-database-metadata`, `tcg-database-chunk-count`, `tcg-database-sets-chunk-count`

### 3. Rollback on Failure
- **Before**: If download failed partway through, corrupted data remained
- **After**: Tracks all successfully saved keys during download
- If any error occurs, automatically deletes all saved keys (rollback)
- Ensures database is either fully updated or remains in its previous state

### 4. Improved Retry Logic
- Increased retry delay: 200ms instead of 100ms (better for rate-limited services)
- Reduced parallel limit: 8 instead of 10 (reduces chance of overwhelming KV store)
- Sequential set chunk saving: Sets are saved one at a time to ensure reliability

### 5. Better Loading from Chunks
- **Before**: Only loaded cards from chunks on app start
- **After**: Loads both cards AND sets from chunks when metadata exists but data is empty
- Ensures data persists correctly across page reloads

## Technical Details

### Chunk Sizes
- **Cards**: 25 cards per chunk (~500KB each)
- **Sets**: 50 sets per chunk (~50KB each)

### Save Strategy
1. Clean up all old database keys
2. Save set chunks sequentially (more reliable for smaller data)
3. Save card chunks in parallel batches of 8 (faster for large data)
4. Save metadata last (indicates successful completion)

### Error Handling
- Each chunk save has 3 retry attempts with exponential backoff
- Failed chunks are tracked and reported
- On any failure, all saved keys are rolled back
- Clear error messages indicate which step failed

## Testing Recommendations

1. **Fresh Install**: Download database on a fresh install (no existing data)
2. **Update**: Download database when one already exists (tests cleanup)
3. **Interrupted Download**: Cancel download midway, then try again (tests rollback)
4. **Page Reload**: Reload page after successful download (tests persistence)

## Files Modified

- `src/lib/tcg-database.ts`: Main database logic with all improvements
