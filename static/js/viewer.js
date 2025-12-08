(async function (){
    console.log('[INIT] Script caricato');
    const canvas = document.getElementById('tileCanvas');
    if (!canvas) {
        console.error('[INIT] ERRORE: Canvas non trovato');
        return;
    }
    console.log('[INIT] Canvas trovato:', canvas);
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('[INIT] ERRORE: Impossibile ottenere il contesto 2D del canvas');
        return;
    }
    console.log('[INIT] Canvas context ottenuto');
    
    const filename = window.VIEWER_FILENAME;
    if (!filename) {
        console.error('[INIT] ERRORE: VIEWER_FILENAME non definito');
        return;
    }
    console.log('[INIT] Filename:', filename);

    // COSTANTI
    const DEFAULT_TILE_SIZE = 256;
  
    let TILE_SIZE = DEFAULT_TILE_SIZE;
    let metadata = null;
    let currentZoom = 1.0;  
    let offsetX = 0;
    let offsetY = 0;
    let fullImageW = 0;
    let fullImageH = 0;
    let canvasW = 0;  // Dimensioni logiche del canvas
    let canvasH = 0;  // Dimensioni logiche del canvas
    const tileCache = new Map();
    let isRendering = false;
    let pendingRequests = 0;
    let prefetchTimer = null; 

    const loadingSpinner = document.getElementById('loadingSpinner');

    // GESTIONE DELLO SPINNER
    function showSpinner() {
        pendingRequests++;
        if (loadingSpinner && pendingRequests > 0) {
            loadingSpinner.style.display = 'inline-flex';
        }
    }

    function hideSpinner() {
        pendingRequests--;
        if (loadingSpinner && pendingRequests <= 0) {
            pendingRequests = 0;
            loadingSpinner.style.display = 'none';
        }
    }


    // MAPPA-THUMBNAIL
    const thumbCanvas = document.getElementById('thumbCanvas');
    const thumbCtx = thumbCanvas ? thumbCanvas.getContext('2d') : null;
    const thumbImg = new Image();
    let thumbDrawX = 0, thumbDrawY = 0, thumbDrawW = 0, thumbDrawH = 0;
    const backgroundColor = '#ffffff';
    
    thumbImg.onload = () => {
        if (!thumbCtx || !thumbCanvas) return;
        const aspectRatio = fullImageW / fullImageH;
        const canvasAspectRatio = thumbCanvas.width / thumbCanvas.height;
        console.log(`[MAP] fullImageW=${fullImageW}, fullImageH=${fullImageH}, aspectRatio=${aspectRatio.toFixed(3)}`);
        console.log(`[MAP] canvasAspectRatio=${canvasAspectRatio.toFixed(3)}`);
        
        
        if (aspectRatio > canvasAspectRatio) {
            // Immagine più larga del canvas
            thumbDrawW = thumbCanvas.width;
            thumbDrawH = thumbCanvas.width / aspectRatio;
            thumbDrawX = 0;
            thumbDrawY = (thumbCanvas.height - thumbDrawH) / 2;
        } else {
            // Immagine più alta del canvas
            thumbDrawH = thumbCanvas.height;
            thumbDrawW = thumbCanvas.height * aspectRatio;
            thumbDrawX = (thumbCanvas.width - thumbDrawW) / 2;
            thumbDrawY = 0;
        }
        
        const viewerContainer = document.getElementById('viewer-container');
        if (viewerContainer) {
            viewerContainer.style.backgroundColor = backgroundColor;
        }
        
        thumbCtx.fillStyle = backgroundColor;
        thumbCtx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);
        thumbCtx.drawImage(thumbImg, thumbDrawX, thumbDrawY, thumbDrawW, thumbDrawH);
    };
    thumbImg.src = `/slide/${filename}/thumbnail`;


    // AGGIORNA LA MAPPA-THUMBNAIL
    function updateMap() {
        if (!thumbCtx || !thumbCanvas) return;
        // Ridisegna la thumbnail con scaling corretto
        const aspectRatio = fullImageW / fullImageH;
        const canvasAspectRatio = thumbCanvas.width / thumbCanvas.height;
        
        if (aspectRatio > canvasAspectRatio) {
            thumbDrawW = thumbCanvas.width;
            thumbDrawH = thumbCanvas.width / aspectRatio;
            thumbDrawX = 0;
            thumbDrawY = (thumbCanvas.height - thumbDrawH) / 2;
        } else {
            thumbDrawH = thumbCanvas.height;
            thumbDrawW = thumbCanvas.height * aspectRatio;
            thumbDrawX = (thumbCanvas.width - thumbDrawW) / 2;
            thumbDrawY = 0;
        }
        
        // Riempi il canvas con il colore di sfondo rilevato prima di disegnare l'immagine
        thumbCtx.fillStyle = backgroundColor;
        thumbCtx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);
        thumbCtx.drawImage(thumbImg, thumbDrawX, thumbDrawY, thumbDrawW, thumbDrawH);
        
        // Disegna il rettangolo della vista corrente
        const scaleX = thumbDrawW / fullImageW;
        const scaleY = thumbDrawH / fullImageH;
        const rectX = thumbDrawX + offsetX * scaleX;
        const rectY = thumbDrawY + offsetY * scaleY;
        const rectW = (canvasW / currentZoom) * scaleX;
        const rectH = (canvasH / currentZoom) * scaleY;
        
        thumbCtx.strokeStyle = 'red';
        thumbCtx.lineWidth = 2;
        thumbCtx.strokeRect(rectX, rectY, rectW, rectH);
    }


    // RECUPERARE I METADATI
    async function fetchMetadata() {
        console.log('[FETCH] Fetching metadata...');
        const resp = await fetch(`/slide/${filename}/info`);
        if (!resp.ok) throw new Error(`Metadata fetch failed: ${resp.status}`);
        const data = await resp.json();
        console.log('[FETCH] Received:', data);
        return data;
    }


    // RICHIEDERE UN TILE AL SERVER
    async function requestTile(level, col, row) {
        const key = `${level}_${col}_${row}`;
        
        if (tileCache.has(key)) {
            console.debug(`[TILE] Cache hit: L${level} C${col} R${row}`);
            return tileCache.get(key);
        }

        console.debug(`[TILE] Richiedo: L${level} C${col} R${row}`);
        const url = `/slide/${filename}/tile?level=${level}&col=${col}&row=${row}`;
        
        // mostro lo spinner durante il caricamento del tile
        showSpinner();
        
        const img = new Image();
        const promise = new Promise((resolve, reject) => {
            img.onload = () => {
                console.debug(`[TILE] Caricato: L${level} C${col} R${row}`);
                // nascondo lo spinner quando il tile è stato caricato
                hideSpinner();
                resolve(img);
            };
            img.onerror = () => {
                console.error(`[TILE] Errore nel caricamento del tile: L${level} C${col} R${row}`);
                // nascondo lo spinner in caso di errore
                hideSpinner();
                reject(new Error(`Tile load failed: L${level} C${col} R${row}`));
            };
            img.src = url;
        });

        tileCache.set(key, promise);
        return promise;
    }


    // SCELTA DEL LIVELLO DI ZOOM APPROPRIATO --> min(|level - 1/zoomFactor|)
    function chooseLevel(zoomFactor) {
        if (!metadata) return 0;
        const ds = metadata.level_downsamples;
        let best = 0;
        let bestDiff = Infinity;

        for (let i = 0; i < ds.length; i++) {
            const diff = Math.abs(ds[i] - (1.0 / zoomFactor));
            if (diff < bestDiff) {
                bestDiff = diff;
                best = i;
            }
        }
        console.debug(`[ZOOM] Zoom: ${zoomFactor.toFixed(2)} --> Livello della slide = ${best}`);
        return best;
    }


    // CALCOLO DEI TILE VISIBILI
    function computeVisibleLevelTiles(level) {
        const downsample = metadata.level_downsamples[level];
        const levelDims = metadata.level_dimensions[level];
        const [levelW, levelH] = levelDims;
        console.log("[META] Level:", level);
        console.log("[META] Level dims:", metadata.level_dimensions[level]);

        // COORDINATE IN LIVELLO BASE
        const lev_1_topleft_X = offsetX;
        const lev_1_topleft_Y = offsetY;
        const lev_1_bottomright_X = offsetX + canvasW / currentZoom;
        const lev_1_bottomright_Y = offsetY + canvasH / currentZoom;
        console.log(`[META] Canvas logical width=${canvasW} ; height=${canvasH}`)

        // COORDINATE IN LIVELLO CORRENTE
        const cur_lev_topleft_X = Math.floor(lev_1_topleft_X / downsample);
        const cur_lev_topleft_Y = Math.floor(lev_1_topleft_Y / downsample);
        const cur_lev_bottomright__X = Math.ceil(lev_1_bottomright_X / downsample);
        const cur_lev_bottomright__Y = Math.ceil(lev_1_bottomright_Y / downsample);
        console.log(`[META] downsample: ${downsample}`)
        console.log(`[META] lev_1_top_left: ${lev_1_topleft_X}, ${lev_1_topleft_Y}; lev_1_bottom_right: ${lev_1_bottomright_X}, ${lev_1_bottomright_Y}`)
        console.log(`[META] cur_lev_top_left: ${cur_lev_topleft_X}, ${cur_lev_topleft_Y}; cur_lev_bottom_right: ${cur_lev_bottomright__X}, ${cur_lev_bottomright__Y}` )

        const topleft_tile_X = Math.floor(cur_lev_topleft_X / TILE_SIZE);
        const topleft_tile_Y = Math.floor(cur_lev_topleft_Y / TILE_SIZE);
        const bottomright_tile_X = Math.floor(cur_lev_bottomright__X / TILE_SIZE);
        const bottomright_tile_Y = Math.floor(cur_lev_bottomright__Y / TILE_SIZE);
        console.log(`[META] tile_topleft: (${topleft_tile_X}, ${topleft_tile_Y})`)
        console.log(`[META] tile_bottom_right: (${bottomright_tile_X}, ${bottomright_tile_Y})`)

        const maxTileCol = Math.ceil(levelW / TILE_SIZE) - 1;
        const maxTileRow = Math.ceil(levelH / TILE_SIZE) - 1;
        console.log(`[META] maxTileCol: ${maxTileCol}, maxTileRow: ${maxTileRow}`)

        const tiles = [];
        for (let col = Math.max(0, topleft_tile_X); col <= Math.min(bottomright_tile_X, maxTileCol); col++) {
            for (let row = Math.max(0, topleft_tile_Y); row <= Math.min(bottomright_tile_Y, maxTileRow); row++) {
                tiles.push({ level, col, row });
            }
        }
        console.debug(`[META] Level ${level}: ${tiles.length} tile visibili`);
        return tiles;
    }


    // PRECARICAMENTO PROGRESSIVO DEI LIVELLI SUCCESSIVI
    function prefetchNextLevel(currentLevel) {
        const nextLevel = currentLevel + 1;
        if (nextLevel >= metadata.level_downsamples.length) return;

        const nextTiles = computeVisibleLevelTiles(nextLevel);
        console.debug(`[PREFETCH] Precaricamento livello ${nextLevel}: ${nextTiles.length} tile`);
        
        nextTiles.forEach(tile => {
            requestTile(tile.level, tile.col, tile.row).catch(err => {
                console.debug(`[PREFETCH] Errore nel prefetch del tile L${tile.level} C${tile.col} R${tile.row}`);
            });
        });
    }


    // PER EVITARE PREFETCH MULTIPLI DURANTE LO SCROLL/ZOOM, SCHEDULA IL PREFETCH DOPO 500ms DI INATTIVITÀ
    function schedulePrefetch(level) {
        // Cancella il timer precedente
        if (prefetchTimer) {
            clearTimeout(prefetchTimer);
        }
        
        prefetchTimer = setTimeout(() => {
            console.debug(`[PREFETCH] Utente inattivo, avvio prefetch per livello ${level}`);
            prefetchNextLevel(level);
        }, 500);
    }


    // ORDINA I TILE PER DISTANZA DAL CENTRO DEL CANVAS
    function sortTilesByDistanceFromCenter(tiles, level) {
        const downsample = metadata.level_downsamples[level];
        
        const centerImgX = offsetX + (canvasW / currentZoom) / 2;
        const centerImgY = offsetY + (canvasH / currentZoom) / 2;
        
        const centerTileX = centerImgX / (TILE_SIZE * downsample);
        const centerTileY = centerImgY / (TILE_SIZE * downsample);
        
        return tiles.map(tile => {
            const tileCenterX = tile.col + 0.5;
            const tileCenterY = tile.row + 0.5;
            const dx = tileCenterX - centerTileX;
            const dy = tileCenterY - centerTileY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            return { ...tile, distance };
        }).sort((a, b) => a.distance - b.distance);
    }


    // RENDERING NON-BLOCCANTE
    function render() {
        if (isRendering) return;
        isRendering = true;

        const level = chooseLevel(currentZoom);
        const downsample = metadata.level_downsamples[level];
        const tiles = computeVisibleLevelTiles(level);

        // FASE 1: Disegna IMMEDIATAMENTE la thumbnail del livello più vicino (non bloccante)
        ctx.clearRect(0, 0, canvasW, canvasH);
        
        // Cerca tile già in cache dal livello corrente o livelli vicini come fallback
        let fallbackDrawn = false;
        
        // Prova prima con i livelli più bassi (meno dettaglio) già in cache
        for (let checkLevel = level + 1; checkLevel < metadata.level_downsamples.length && !fallbackDrawn; checkLevel++) {
            const checkDownsample = metadata.level_downsamples[checkLevel];
            const checkTiles = computeVisibleLevelTiles(checkLevel);
            
            // Disegna i tile già in cache di questo livello
            for (const tile of checkTiles) {
                const key = `${tile.level}_${tile.col}_${tile.row}`;
                const cached = tileCache.get(key);
                
                if (cached && cached instanceof HTMLImageElement) {
                    const t_orig_X = tile.col * TILE_SIZE * checkDownsample;
                    const t_orig_Y = tile.row * TILE_SIZE * checkDownsample;
                    const t_pos_X = (t_orig_X - offsetX) * currentZoom;
                    const t_pos_Y = (t_orig_Y - offsetY) * currentZoom;
                    const t_weight = TILE_SIZE * checkDownsample * currentZoom;
                    const t_height = TILE_SIZE * checkDownsample * currentZoom;
                    
                    ctx.drawImage(cached, t_pos_X, t_pos_Y, t_weight, t_height);
                    fallbackDrawn = true;
                }
            }
        }
        
        // Se non ci sono tile in cache, usa la thumbnail generale
        if (!fallbackDrawn && thumbImg.complete && thumbImg.naturalWidth > 0) {
            const srcX = (offsetX / fullImageW) * thumbImg.width;
            const srcY = (offsetY / fullImageH) * thumbImg.height;
            const srcW = ((canvasW / currentZoom) / fullImageW) * thumbImg.width;
            const srcH = ((canvasH / currentZoom) / fullImageH) * thumbImg.height;
            
            ctx.drawImage(
                thumbImg,
                srcX, srcY, srcW, srcH,
                0, 0, canvasW, canvasH
            );
        }

        // FASE 2: Aggiorna subito le info e rilascia il lock
        document.getElementById('info-current-level').textContent = level;
        document.getElementById('info-current-level-dims').textContent = `${metadata.level_dimensions[level][0]} × ${metadata.level_dimensions[level][1]}`;
        document.getElementById('info-current-level-downs').textContent = `${metadata.level_downsamples[level].toFixed(1)}`;
        document.getElementById('info-visible-tiles').textContent = tiles.length;
        document.getElementById('info-tile-size').textContent = TILE_SIZE;
        document.getElementById('info-offset-display').textContent = `${offsetX}, ${offsetY}`;
        
        isRendering = false; // Rilascia il lock SUBITO, lo zoom non deve aspettare
        updateMap();

        // FASE 3: Carica e disegna i tile in BACKGROUND (non bloccante)
        // Durante lo zoom iniziale (fit-to-view), usa ordine naturale per evitare sovrapposizioni
        let sortedTiles;
        const isInitialZoom = Math.abs(currentZoom - window.__INITIAL_FIT_ZOOM__) < 0.0001;
        
        if (isInitialZoom) {
            // Zoom iniziale: ordine naturale (left-to-right, top-to-bottom)
            sortedTiles = tiles;
            console.debug(`[RENDER] Zoom iniziale, uso ordine naturale per ${tiles.length} tile`);
        } else {
            // Zoom/pan dell'utente: ordina dal centro
            sortedTiles = sortTilesByDistanceFromCenter(tiles, level);
            console.debug(`[RENDER] Zoom utente, ordino ${tiles.length} tile dal centro`);
        }
        
        // Carica i tile in background senza bloccare
        loadTilesInBackground(sortedTiles, level, downsample);
    }


    // CARICARE E DISEGNARE I TILE IN BACKGROUND
    async function loadTilesInBackground(sortedTiles, level, downsample) {
        let tilesLoaded = 0;
        
        // Cattura i valori correnti di offset e zoom per questo rendering
        const renderOffsetX = offsetX;
        const renderOffsetY = offsetY;
        const renderZoom = currentZoom;
        
        for (const tile of sortedTiles) {
            try {
                const img = await requestTile(tile.level, tile.col, tile.row);
                
                // Verifica che l'utente non abbia già cambiato zoom/pan significativamente
                const currentLevel = chooseLevel(currentZoom);
                if (currentLevel !== level) {
                    console.debug(`[TILE] Livello cambiato da ${level} a ${currentLevel}, tile ignorato`);
                    break;
                }
                
                // Controlla se offset o zoom sono cambiati significativamente
                const offsetDeltaX = Math.abs(offsetX - renderOffsetX);
                const offsetDeltaY = Math.abs(offsetY - renderOffsetY);
                const zoomDelta = Math.abs(currentZoom - renderZoom);
                
                if (offsetDeltaX > 100 || offsetDeltaY > 100 || zoomDelta > 0.1) {
                    console.debug(`[TILE] Vista cambiata significativamente, tile ignorato`);
                    break;
                }
                
                const t_orig_X = tile.col * TILE_SIZE * downsample;
                const t_orig_Y = tile.row * TILE_SIZE * downsample;

                // Usa le coordinate catturate all'inizio del rendering
                const t_pos_X = (t_orig_X - renderOffsetX) * renderZoom;
                const t_pos_Y = (t_orig_Y - renderOffsetY) * renderZoom;

                // Usa le dimensioni EFFETTIVE del tile (non assumere 256x256)
                // Alcuni tile sui bordi possono essere più piccoli
                const actualTileW = img.width;
                const actualTileH = img.height;
                const t_weight = actualTileW * downsample * renderZoom;
                const t_height = actualTileH * downsample * renderZoom;

                // DEBUG: Log coordinate e dimensioni tile
                console.log(`[TILE] Disegno L${level} C${tile.col}R${tile.row}:`);
                console.log(`  Tile img: ${img.width}x${img.height}`);
                console.log(`  Canvas pos: (${t_pos_X.toFixed(1)}, ${t_pos_Y.toFixed(1)})`);
                console.log(`  Canvas size: ${t_weight.toFixed(1)}x${t_height.toFixed(1)}`);

                // Disegna il tile sopra la thumbnail
                ctx.drawImage(img, t_pos_X, t_pos_Y, t_weight, t_height);
                
                
                tilesLoaded++;
            } catch(error) {
                console.error('[TILE] Errore nel caricamento:', error);
            }
        }

        console.debug(`[RENDER] Caricati ${tilesLoaded}/${sortedTiles.length} tile per livello ${level}`);
        
        // Schedula il prefetch SOLO DOPO che tutti i tile sono stati caricati
        schedulePrefetch(level);
    }


    function constrainOffset() {
        const maxOffsetX = Math.max(0, fullImageW - canvasW / currentZoom);
        const maxOffsetY = Math.max(0, fullImageH - canvasH / currentZoom);

        offsetX = Math.max(0, Math.min(offsetX, maxOffsetX));
        offsetY = Math.max(0, Math.min(offsetY, maxOffsetY));
    }


    // FUNZIONI PER LO ZOOM
    const MIN_ZOOM = 0.05; 
    const MAX_ZOOM = 16.0; 

    function clampZoom(z) {
        const initialFit = window.__INITIAL_FIT_ZOOM__ || 1.0;
        const minAllowed = initialFit
        const maxAllowed = MAX_ZOOM;
        return Math.max(minAllowed, Math.min(z, maxAllowed));
    }

    function zoomBy(factor, centerX = canvasW/2, centerY = canvasH/2) {
        const orig_imgX = offsetX + centerX / currentZoom;
        const orig_imgY = offsetY + centerY / currentZoom;

        let newZoom = currentZoom * factor;
        newZoom = clampZoom(newZoom);

        offsetX = orig_imgX - centerX / newZoom;
        offsetY = orig_imgY - centerY / newZoom;
        currentZoom = newZoom;
        constrainOffset();
        console.log(`[ZOOM] zoomBy factor=${factor.toFixed(3)} -> zoom=${currentZoom.toFixed(3)}`);
        render();
    }

    function zoomIn() {
        zoomBy(1.25);
    }

    function zoomOut() {
        zoomBy(1/1.25);
    }

    function zoomReset() {
        console.log('[ZOOM] Reset');
        const initial = window.__INITIAL_FIT_ZOOM__ || 1.0;
        currentZoom = initial;
        offsetX = Math.max(0, (fullImageW - canvasW / currentZoom) / 2);
        offsetY = Math.max(0, (fullImageH - canvasH / currentZoom) / 2);
        constrainOffset();
        render();
    }

    // BOTTONI: ZOOMIN, ZOOMOUT, ZOOMRESET
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const homeBtn = document.getElementById('homeBtn');

    if (zoomInBtn) zoomInBtn.addEventListener('click', zoomIn);
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', zoomOut);
    if (homeBtn) homeBtn.addEventListener('click', zoomReset);

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const factor = Math.exp(-e.deltaY * 0.001);
        zoomBy(factor, mouseX, mouseY);
    }, { passive: false });



    // FUNZIONI PER IL PANNING
    let isDragging = false;
    let lastX = 0, lastY = 0;

    canvas.addEventListener('pointerdown', (e) => {
        isDragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        const deltaX = (e.clientX - lastX) / currentZoom;
        const deltaY = (e.clientY - lastY) / currentZoom;
        offsetX -= deltaX;
        offsetY -= deltaY;
        lastX = e.clientX;
        lastY = e.clientY;
        constrainOffset();
        render();
    });

    canvas.addEventListener('pointerup', (e) => {
        isDragging = false;
        canvas.releasePointerCapture(e.pointerId);
    });

   

    // INIZIALIZZAZIONE
    console.log('[INIT] Caricamento metadati...');
    try {
        metadata = await fetchMetadata();
        [fullImageW, fullImageH] = metadata.dimensions;
        console.log(`[INIT] Immagine: ${fullImageW}x${fullImageH}`);
    } catch (err) {
        console.error('[INIT] Errore caricamento metadati:', err);
        return;
    }


    if (metadata && metadata.properties) {
        const vendor = metadata.properties["openslide.vendor"] || "N.D";
        document.getElementById('info-producer').textContent = vendor
    }
    document.getElementById('info-size').textContent = `${metadata.dimensions[0]} × ${metadata.dimensions[1]}`;
    document.getElementById('info-levels').textContent = metadata.level_downsamples.length;
    document.getElementById('info-dims').textContent = metadata.level_dimensions.map(d => `(${d[0]}×${d[1]})`).join(', ');
    document.getElementById('info-downsamples').textContent = metadata.level_downsamples.map(d => d.toFixed(1)).join(', ');

    // Calcola le dimensioni corrette del canvas mantenendo l'aspect ratio
    const container = document.getElementById('viewer-container');
    const containerW = container.clientWidth;
    const containerH = container.clientHeight;
    const imageAspectRatio = fullImageW / fullImageH;
    const containerAspectRatio = containerW / containerH;
    
    if (imageAspectRatio > containerAspectRatio) {
        // Immagine più larga: limita per larghezza
        canvasW = containerW;
        canvasH = containerW / imageAspectRatio;
    } else {
        // Immagine più alta: limita per altezza
        canvasH = containerH;
        canvasW = containerH * imageAspectRatio;
    }
    
    // Imposta le dimensioni del canvas
    const deviceRatio = window.devicePixelRatio || 1;
    canvas.width = Math.round(canvasW * deviceRatio);
    canvas.height = Math.round(canvasH * deviceRatio);
    canvas.style.width = canvasW + 'px';
    canvas.style.height = canvasH + 'px';
    ctx.scale(deviceRatio, deviceRatio);
    
    // Calcola lo zoom iniziale per fit-to-view
    const scaleW = canvasW / fullImageW;
    const scaleH = canvasH / fullImageH;
    currentZoom = Math.min(scaleW, scaleH);
    window.__INITIAL_FIT_ZOOM__ = currentZoom;

    offsetX = Math.max(0, (fullImageW - canvasW / currentZoom) / 2);
    offsetY = Math.max(0, (fullImageH - canvasH / currentZoom) / 2);

    console.log(`[INIT] Canvas: ${canvasW}x${canvasH}, zoom iniziale: ${currentZoom.toFixed(6)}`);
    console.log(`[INIT] Image: ${fullImageW}x${fullImageH}, aspect ratio: ${imageAspectRatio.toFixed(3)}`);
    console.log(`[INIT] Offset iniziale: offsetX=${offsetX}, offsetY=${offsetY}`);
    console.log(`[INIT] Viewport size in image coords: ${canvasW / currentZoom} x ${canvasH / currentZoom}`);

    console.log('[INIT] Primo rendering...');
    render();
    console.log('[INIT] Script pronto!');

})();