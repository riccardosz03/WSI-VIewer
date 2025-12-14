from flask import Flask, send_file, request, render_template, redirect, url_for, jsonify
from PIL import Image
import io, os
from openslide import open_slide
from openslide.deepzoom import DeepZoomGenerator


app = Flask(__name__)
UPLOAD_FOLDER = 'data/'
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

SLIDE_CACHE = {}
DEEPZOOM_CACHE = {}
TILE_SIZE = 254  # OpenSeadragon funziona meglio con 254
OVERLAP = 1      # Overlap di 1 pixel per evitare artefatti
ALLOWED_EXTENSIONS = ['.svs', '.tif', '.dcm', '.vms', '.vmu', '.ndpi', '.scn', '.mrcs', '.tiff', '.svslide', '.bif', '.czi']

def slide_path(filename):
    safe = os.path.basename(filename)
    return os.path.join(app.config['UPLOAD_FOLDER'], safe)


# ROUTE HOME PAGE
@app.route('/')
def home():
    return render_template('index.html')


# RICEVE IL FILE DAL FORM
@app.route('/upload', methods=['POST'])
def upload_file():
    file = request.files['file']
    filename = file.filename.lower()

    if file and any(filename.endswith(ext) for ext in ALLOWED_EXTENSIONS):
        filepath = slide_path(file.filename)
        file.save(filepath)
        print(f"File {filepath} caricato con successo.")
        return redirect(url_for('view_file', filename=file.filename))
    return 'Formato file non supportato', 400


# VISUALIZZA LA SLIDE
@app.route('/view_image/<filename>')
def view_file(filename):
    path = slide_path(filename)
    if not os.path.exists(path):
        return 'File non trovato', 404
    return render_template('view_image.html', filename=filename)


def get_slide(filename):
    if filename not in SLIDE_CACHE: 
        SLIDE_CACHE[filename] = open_slide(slide_path(filename))
    return SLIDE_CACHE[filename]


def get_deepzoom(filename):
    if filename not in DEEPZOOM_CACHE: 
        slide = get_slide(filename)
        dz = DeepZoomGenerator(slide, tile_size=TILE_SIZE, overlap=OVERLAP, limit_bounds=False)
        DEEPZOOM_CACHE[filename] = dz
        print(f"[DEEPZOOM] Creato oggetto DeepZoomGenerator per {filename}")
    return DEEPZOOM_CACHE[filename]


# ENDPOINT PER IL FILE .dzi (Deep Zoom Image descriptor)
@app.route('/slide/<filename>.dzi')
def dzi_descriptor(filename):
    dz = get_deepzoom(filename)
    slide = get_slide(filename)
    
    # Formato DZI XML richiesto da OpenSeadragon
    dzi_xml = f'''<?xml version="1.0" encoding="UTF-8"?>
<Image xmlns="http://schemas.microsoft.com/deepzoom/2008"
       Format="jpeg"
       Overlap="{OVERLAP}"
       TileSize="{TILE_SIZE}">
    <Size Width="{slide.dimensions[0]}" Height="{slide.dimensions[1]}"/>
</Image>'''
    
    return dzi_xml, 200, {'Content-Type': 'application/xml'}


# ENDPOINT PER I TILES IN FORMATO DZI
@app.route('/slide/<filename>_files/<int:level>/<int:col>_<int:row>.jpeg')
def dzi_tile(filename, level, col, row):
    dz = get_deepzoom(filename)
    
    # OpenSeadragon usa un sistema di livelli invertito rispetto a DeepZoomGenerator
    # Livello 0 in OpenSeadragon = livello più basso di dettaglio
    # Dobbiamo convertire il livello
    osd_level = level
    
    try:
        tile = dz.get_tile(osd_level, (col, row))
        
        # Converti in JPEG per migliori performance
        buf = io.BytesIO()
        tile.convert('RGB').save(buf, 'JPEG', quality=90)
        buf.seek(0)
        
        return send_file(buf, mimetype='image/jpeg')
    except Exception as e:
        print(f"[TILE ERROR] Level={level}, Col={col}, Row={row}: {str(e)}")
        return 'Tile non disponibile', 404


# INFO DELLA SLIDE (opzionale, per debugging)
@app.route('/slide/<filename>/info')
def slide_info(filename):
    slide = get_slide(filename)
    dz = get_deepzoom(filename)
    
    return jsonify({
        'dimensions': slide.dimensions,
        'level_count': dz.level_count,
        'level_dimensions': dz.level_dimensions,
        'tile_size': TILE_SIZE,
        'overlap': OVERLAP,
        'properties': dict(slide.properties)
    })


if __name__ == '__main__':
    app.run(debug=True)