(async function (){
    console.log('[INIT] Script caricato');
    const canvas = document.getElementById('canvas');
    if (!canvas) {
        console.error('[INIT] ERRORE: Canvas non trovato!');
        return;
    }
    console.log('[INIT] Canvas trovato:', canvas);
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('[INIT] ERRORE: Impossibile ottenere il contesto 2D del canvas!');
        return;
    }
    console.log('[INIT] Canvas context ottenuto');
    
    const filename = window.VIEWER_FILENAME;
    if (!filename) {
        console.error('[INIT] ERRORE: VIEWER_FILENAME non definito!');
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
    const tileCache = new Map();
    let isRendering = false;
    let pendingRequests = 0; // Contatore delle richieste attive
    let prefetchTimer = null; // Timer per prefetch ritardato

    // Riferimento allo spinner
    const loadingSpinner = document.getElementById('loadingSpinner');

    // Funzioni per gestire lo spinner
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

    // MAPPA-THUMBNAIL con scaling corretto
    const thumbCanvas = document.getElementById('thumbCanvas');
    const thumbCtx = thumbCanvas ? thumbCanvas.getContext('2d') : null;
    const thumbImg = new Image();
    let thumbDrawX = 0, thumbDrawY = 0, thumbDrawW = 0, thumbDrawH = 0;
    
    thumbImg.onload = () => {
        if (!thumbCtx || !thumbCanvas) return;
        // Calcola le proporzioni mantenendo l'aspect ratio
        const aspectRatio = fullImageW / fullImageH;
        const canvasAspectRatio = thumbCanvas.width / thumbCanvas.height;
        
        if (aspectRatio > canvasAspectRatio) {
            // Immagine più larga: limitata dalla larghezza del canvas
            thumbDrawW = thumbCanvas.width;
            thumbDrawH = thumbCanvas.width / aspectRatio;
            thumbDrawX = 0;
            thumbDrawY = (thumbCanvas.height - thumbDrawH) / 2;
        } else {
            // Immagine più alta: limitata dall'altezza del canvas
            thumbDrawH = thumbCanvas.height;
            thumbDrawW = thumbCanvas.height * aspectRatio;
            thumbDrawX = (thumbCanvas.width - thumbDrawW) / 2;
            thumbDrawY = 0;
        }
        
        // Riempi il canvas con bianco, poi disegna l'immagine
        thumbCtx.fillStyle = '#ffffff';
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
        
        // Riempi il canvas con bianco prima di disegnare l'immagine
        thumbCtx.fillStyle = '#ffffff';
        thumbCtx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);
        thumbCtx.drawImage(thumbImg, thumbDrawX, thumbDrawY, thumbDrawW, thumbDrawH);
        
        // Disegna il rettangolo della vista corrente
        const scaleX = thumbDrawW / fullImageW;
        const scaleY = thumbDrawH / fullImageH;
        const rectX = thumbDrawX + offsetX * scaleX;
        const rectY = thumbDrawY + offsetY * scaleY;
        const rectW = (canvas.width / currentZoom) * scaleX;
        const rectH = (canvas.height / currentZoom) * scaleY;
        
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
        
        showSpinner(); // Mostra lo spinner
        
        const img = new Image();
        const promise = new Promise((resolve, reject) => {
            img.onload = () => {
                console.debug(`[TILE] Caricato: L${level} C${col} R${row}`);
                hideSpinner(); // Nascondi lo spinner
                resolve(img);
            };
            img.onerror = () => {
                console.error(`[TILE] Errore nel caricamento: L${level} C${col} R${row}`);
                hideSpinner(); // Nascondi lo spinner anche in caso di errore
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
        console.debug(`[ZOOM] Zoom: ${zoomFactor.toFixed(2)} --> Level = ${best}`);
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
        const lev_1_bottomright_X = offsetX + canvas.width / currentZoom;
        const lev_1_bottomright_Y = offsetY + canvas.height / currentZoom;
        console.log(`[META] Canvas width=${canvas.width} ; height=${canvas.height}`)

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
        // Precarica il livello successivo (zoom out) in background
        const nextLevel = currentLevel + 1;
        if (nextLevel >= metadata.level_downsamples.length) return;

        const nextTiles = computeVisibleLevelTiles(nextLevel);
        console.debug(`[PREFETCH] Precaricamento livello ${nextLevel}: ${nextTiles.length} tile`);
        
        // Avvia il caricamento in background senza bloccare
        nextTiles.forEach(tile => {
            requestTile(tile.level, tile.col, tile.row).catch(err => {
                console.debug(`[PREFETCH] Errore prefetch L${tile.level} C${tile.col} R${tile.row}`);
            });
        });
    }

    // Schedula il prefetch solo dopo che l'utente ha smesso di interagire
    function schedulePrefetch(level) {
        // Cancella il timer precedente
        if (prefetchTimer) {
            clearTimeout(prefetchTimer);
        }
        
        // Avvia un nuovo timer: prefetch dopo 500ms di inattività
        prefetchTimer = setTimeout(() => {
            console.debug(`[PREFETCH] Utente inattivo, avvio prefetch per livello ${level}`);
            prefetchNextLevel(level);
        }, 500);
    }

    // ORDINA I TILE PER DISTANZA DAL CENTRO DEL CANVAS
    function sortTilesByDistanceFromCenter(tiles, level) {
        const downsample = metadata.level_downsamples[level];
        
        // Calcola il centro del viewport in coordinate immagine
        const centerImgX = offsetX + (canvas.width / currentZoom) / 2;
        const centerImgY = offsetY + (canvas.height / currentZoom) / 2;
        
        // Calcola il centro in coordinate tile
        const centerTileX = centerImgX / (TILE_SIZE * downsample);
        const centerTileY = centerImgY / (TILE_SIZE * downsample);
        
        // Aggiungi distanza a ogni tile e ordina
        return tiles.map(tile => {
            const tileCenterX = tile.col + 0.5;
            const tileCenterY = tile.row + 0.5;
            const dx = tileCenterX - centerTileX;
            const dy = tileCenterY - centerTileY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            return { ...tile, distance };
        }).sort((a, b) => a.distance - b.distance);
    }

    // RENDERING
    async function render() {
        if (isRendering) return;
        isRendering = true;

        try {
            const level = chooseLevel(currentZoom);
            const downsample = metadata.level_downsamples[level];
            const tiles = computeVisibleLevelTiles(level);

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Ordina i tile per distanza dal centro
            const sortedTiles = sortTilesByDistanceFromCenter(tiles, level);
            console.debug(`[RENDER] Tile ordinati per distanza dal centro`);

            // Carica e disegna i tile in ordine (dal centro verso l'esterno)
            for (const tile of sortedTiles) {
                try {
                    const img = await requestTile(tile.level, tile.col, tile.row);
                    const t_orig_X = tile.col * TILE_SIZE * downsample;
                    const t_orig_Y = tile.row * TILE_SIZE * downsample;

                    const t_pos_X = (t_orig_X - offsetX) * currentZoom;
                    const t_pos_Y = (t_orig_Y - offsetY) * currentZoom;

                    const t_weight = TILE_SIZE * downsample * currentZoom;
                    const t_height = TILE_SIZE * downsample * currentZoom;

                    ctx.drawImage(img, t_pos_X, t_pos_Y, t_weight, t_height);
                } catch(error) {
                    console.error('[RENDER] Errore nel rendering del tile:', error);
                }
            }

            // Schedula il prefetch SOLO DOPO che tutti i tile sono stati caricati
            schedulePrefetch(level);

            document.getElementById('info-current-level').textContent = level;
            document.getElementById('info-current-level-dims').textContent = `${metadata.level_dimensions[level][0]} × ${metadata.level_dimensions[level][1]}`;
            document.getElementById('info-current-level-downs').textContent = `${metadata.level_downsamples[level].toFixed(1)}`;
            document.getElementById('info-visible-tiles').textContent = tiles.length;
            document.getElementById('info-tile-size').textContent = TILE_SIZE;
            document.getElementById('info-offset-display').textContent = `${offsetX}, ${offsetY}`;

            console.debug(`[RENDER] Frame completo - zoom=${currentZoom.toFixed(3)}, offset=(${offsetX},${offsetY})`);
        } catch (err) {
            console.error('[RENDER] Errore:', err);
        } finally {
            isRendering = false;
        }
        updateMap();
    }


    function constrainOffset() {
        const maxOffsetX = Math.max(0, fullImageW - canvas.width / currentZoom);
        const maxOffsetY = Math.max(0, fullImageH - canvas.height / currentZoom);

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

    function zoomBy(factor, centerX = canvas.width/2, centerY = canvas.height/2) {
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
        offsetX = Math.max(0, (fullImageW - canvas.width / currentZoom) / 2);
        offsetY = Math.max(0, (fullImageH - canvas.height / currentZoom) / 2);
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

    


    const viewportW = window.innerWidth * 0.9;
    const viewportH = window.innerHeight * 0.9;
    const scaleW = viewportW / fullImageW;
    const scaleH = viewportH / fullImageH;
    currentZoom = Math.min(scaleW, scaleH, 1.0);
    window.__INITIAL_FIT_ZOOM__ = currentZoom;

   

    // NON FONDAMENTALE
    const deviceRatio = window.devicePixelRatio || 1;

    const canvasW = Math.round(fullImageW * currentZoom);
    const canvasH = Math.round(fullImageH * currentZoom);
    canvas.width = canvasW * deviceRatio;
    canvas.height = canvasH * deviceRatio;

    offsetX = Math.max(0, (fullImageW - canvas.width / currentZoom) / 2);
    offsetY = Math.max(0, (fullImageH - canvas.height / currentZoom) / 2);

    console.log(`[INIT] Canvas: ${canvasW}x${canvasH}, zoom iniziale: ${currentZoom.toFixed(3)}`);

    console.log('[INIT] Primo rendering...');
    await render();
    console.log('[INIT] Script pronto!');

})();