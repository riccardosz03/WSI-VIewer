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

    // MAPPA-THUMBNAIL
    const thumbCanvas = document.getElementById('thumbCanvas');
    const thumbCtx = thumbCanvas.getContext('2d');
    const thumbImg = new Image();
    thumbImg.onload = () => {
        thumbCtx.drawImage(thumbImg, 0, 0, thumbCanvas.width, thumbCanvas.height);
    };
    thumbImg.src = `/slide/${filename}/thumbnail`;

    // AGGIORNA LA MAPPA-THUMBNAIL
    function updateMap() {
        thumbCtx.clearRect(0, 0, thumbCanvas.width, thumbCanvas.height);
        thumbCtx.drawImage(thumbImg, 0, 0, thumbCanvas.width, thumbCanvas.height);

        const viewX = offsetX;
        const viewY = offsetY;
        const viewW = canvas.width / currentZoom;
        const viewH = canvas.height / currentZoom;

        const scaleX = thumbCanvas.width / fullImageW;
        const scaleY = thumbCanvas.height / fullImageH;

        const rectX = viewX * scaleX;
        const rectY = viewY * scaleY;
        const rectW = viewW * scaleX;
        const rectH = viewH * scaleY;

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
        
        const img = new Image();
        const promise = new Promise((resolve, reject) => {
            img.onload = () => {
                console.debug(`[TILE] Caricato: L${level} C${col} R${row}`);
                resolve(img);
            };
            img.onerror = () => {
                console.error(`[TILE] Errore nel caricamento: L${level} C${col} R${row}`);
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
    function computeVisibleTiles(level) {
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



    // RENDERING
    async function render() {
        if (isRendering) return;
        isRendering = true;

        try {
            const level = chooseLevel(currentZoom);
            const downsample = metadata.level_downsamples[level];
            const tiles = computeVisibleTiles(level);

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // VERSIONE CICLO FOR, LENTA
            //for (const tile of tiles) {
                //try {
                    //const img = await requestTile(tile.level, tile.col, tile.row);
                    
                    //const tileX = tile.col * TILE_SIZE * downsample;
                    //const tileY = tile.row * TILE_SIZE * downsample;

                    //const drawX = (tileX - offsetX) * currentZoom;
                    //const drawY = (tileY - offsetY) * currentZoom;
                    //const drawW = TILE_SIZE * downsample * currentZoom;
                    //const drawH = TILE_SIZE * downsample * currentZoom;

                    //ctx.drawImage(img, drawX, drawY, drawW, drawH);
                //} catch (err) {
                    //console.error('[RENDER] Errore nel rendering del tile:', err);
                //}
            //}

            // VERSIONE PARALLELIZZATA
            const tilePromeses = tiles.map(async (tile) => {
                try{
                    const img = await requestTile(tile.level, tile.col, tile.row);
                    const t_orig_X = tile.col * TILE_SIZE * downsample;
                    const t_orig_Y = tile.row * TILE_SIZE * downsample;

                    const t_pos_X = (t_orig_X - offsetX) * currentZoom;
                    const t_pos_Y = (t_orig_Y - offsetY) * currentZoom;

                    const t_weight = TILE_SIZE * downsample * currentZoom;
                    const t_height = TILE_SIZE * downsample * currentZoom

                    ctx.drawImage(img, t_pos_X, t_pos_Y, t_weight, t_height);
                } catch(error) {
                    console.error('[RENDER] Errore nel renderng del tile:', error)
                }
            });

            await Promise.all(tilePromeses)

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
        const initialFit = Math.min(1.0, Math.max((window.__INITIAL_FIT_ZOOM__ || 0.2), MIN_ZOOM));
        const minAllowed = Math.max(MIN_ZOOM, initialFit);
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