class WSIViewer {
    constructor(canvasId, filename) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.filename = filename;
        this.scale = 1.0;
        this.offsetX = 0;
        this.offsetY = 0;
        this.isDragging = false;
        this.lastX = 0;
        this.lastY = 0;
        this.tileSize = 256;
        this.tiles = new Map();
        this.visibleTiles = new Set();
        
        // Impostazione dimensioni canvas
        this.canvas.width = this.canvas.clientWidth;
        this.canvas.height = this.canvas.clientHeight;
        
        this.initializeViewer();
        this.setupEventListeners();
    }

    async initializeViewer() {
        // Carica le informazioni dell'immagine
        const response = await fetch(`/slide/${this.filename}/info`);
        const info = await response.json();
        
        this.imageWidth = info.dimensions[0];
        this.imageHeight = info.dimensions[1];
        this.levels = info.level_count;
        
        // Calcola il livello iniziale per mostrare l'intera immagine
        const scaleX = this.canvas.width / this.imageWidth;
        const scaleY = this.canvas.height / this.imageHeight;
        this.scale = Math.min(scaleX, scaleY);
        
        this.render();
    }

    setupEventListeners() {
        // Gestione del dragging
        this.canvas.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.lastX = e.clientX;
            this.lastY = e.clientY;
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            
            const deltaX = e.clientX - this.lastX;
            const deltaY = e.clientY - this.lastY;
            
            this.offsetX += deltaX;
            this.offsetY += deltaY;
            
            this.lastX = e.clientX;
            this.lastY = e.clientY;
            
            this.render();
        });

        this.canvas.addEventListener('mouseup', () => {
            this.isDragging = false;
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.isDragging = false;
        });

        // Gestione dello zoom con la rotella del mouse
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            // Punto nel sistema di coordinate dell'immagine prima dello zoom
            const beforeX = (mouseX - this.offsetX) / this.scale;
            const beforeY = (mouseY - this.offsetY) / this.scale;
            
            // Aggiorna la scala
            if (e.deltaY < 0) {
                this.scale *= 1.1; // Zoom in
            } else {
                this.scale /= 1.1; // Zoom out
            }
            
            // Limita lo zoom
            this.scale = Math.max(0.1, Math.min(5.0, this.scale));
            
            // Punto nel sistema di coordinate dell'immagine dopo lo zoom
            const afterX = (mouseX - this.offsetX) / this.scale;
            const afterY = (mouseY - this.offsetY) / this.scale;
            
            // Aggiusta l'offset per mantenere il punto sotto il mouse
            this.offsetX += (afterX - beforeX) * this.scale;
            this.offsetY += (afterY - beforeY) * this.scale;
            
            this.render();
        });

        // Gestione del ridimensionamento della finestra
        window.addEventListener('resize', () => {
            this.canvas.width = this.canvas.clientWidth;
            this.canvas.height = this.canvas.clientHeight;
            this.render();
        });
    }

    async loadTile(x, y, level) {
        const key = `${level}-${x}-${y}`;
        if (this.tiles.has(key)) {
            return this.tiles.get(key);
        }

        try {
            const response = await fetch(`/slide/${this.filename}/tile?x=${x}&y=${y}&level=${level}&size=${this.tileSize}`);
            const blob = await response.blob();
            const bitmap = await createImageBitmap(blob);
            this.tiles.set(key, bitmap);
            return bitmap;
        } catch (error) {
            console.error('Errore nel caricamento del tile:', error);
            return null;
        }
    }

    getVisibleTiles() {
        const tiles = new Set();
        
        // Calcola l'area visibile nell'immagine
        const viewportLeft = -this.offsetX / this.scale;
        const viewportTop = -this.offsetY / this.scale;
        const viewportWidth = this.canvas.width / this.scale;
        const viewportHeight = this.canvas.height / this.scale;
        
        // Calcola i tile visibili
        const startTileX = Math.floor(viewportLeft / this.tileSize);
        const startTileY = Math.floor(viewportTop / this.tileSize);
        const endTileX = Math.ceil((viewportLeft + viewportWidth) / this.tileSize);
        const endTileY = Math.ceil((viewportTop + viewportHeight) / this.tileSize);
        
        for (let x = startTileX; x <= endTileX; x++) {
            for (let y = startTileY; y <= endTileY; y++) {
                if (x >= 0 && y >= 0 && x * this.tileSize < this.imageWidth && y * this.tileSize < this.imageHeight) {
                    tiles.add(`0-${x}-${y}`); // Per ora usiamo solo il livello 0
                }
            }
        }
        
        return tiles;
    }

    async render() {
        // Pulisci il canvas
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Applica le trasformazioni
        this.ctx.save();
        this.ctx.translate(this.offsetX, this.offsetY);
        this.ctx.scale(this.scale, this.scale);
        
        // Determina i tile visibili
        const visibleTiles = this.getVisibleTiles();
        
        // Carica e renderizza i tile
        for (const tileKey of visibleTiles) {
            const [level, x, y] = tileKey.split('-').map(Number);
            const tile = await this.loadTile(x, y, level);
            
            if (tile) {
                this.ctx.drawImage(
                    tile,
                    x * this.tileSize,
                    y * this.tileSize,
                    this.tileSize,
                    this.tileSize
                );
            }
        }
        
        this.ctx.restore();
        
        // Aggiorna la lista dei tile visibili
        this.visibleTiles = visibleTiles;
    }
}

// Inizializzazione del viewer quando il DOM è caricato
document.addEventListener('DOMContentLoaded', () => {
    const viewer = new WSIViewer('canvas', VIEWER_FILENAME);
    
    // Gestione dei pulsanti
    document.getElementById('zoomInBtn').addEventListener('click', () => {
        viewer.scale *= 1.5;
        viewer.render();
    });
    
    document.getElementById('zoomOutBtn').addEventListener('click', () => {
        viewer.scale /= 1.5;
        viewer.render();
    });
    
    document.getElementById('homeBtn').addEventListener('click', () => {
        const scaleX = viewer.canvas.width / viewer.imageWidth;
        const scaleY = viewer.canvas.height / viewer.imageHeight;
        viewer.scale = Math.min(scaleX, scaleY);
        viewer.offsetX = 0;
        viewer.offsetY = 0;
        viewer.render();
    });
});