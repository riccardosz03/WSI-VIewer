from flask import Flask, send_file, request, render_template, redirect, url_for, jsonify, Response
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
TILE_SIZE = 256
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
        return redirect(url_for('view_file', filename=file.filename))
    return 'Formato file non supportato', 400


# CREA UN OGGETTO DEEPZOOMGENERATOR
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
        dz = DeepZoomGenerator(slide, tile_size=TILE_SIZE, overlap=0, limit_bounds=False)
        DEEPZOOM_CACHE[filename] = dz
    return DEEPZOOM_CACHE[filename]



# RESTITUISCE UN OGGETTO JSON CON LE INFORMAZIONI DELLA SLIDE
@app.route('/slide/<filename>/info')
def slide_info(filename):
    slide = get_slide(filename)
    dz = get_deepzoom(filename)
    
    level_dimensions = dz.level_dimensions
    level_downsamples = []
    try:
        full_width = slide.dimensions[0]
        for (w, h) in level_dimensions:
            ds = float(full_width) / float(w) if w != 0 else 1.0
            level_downsamples.append(ds)
    except Exception:
        level_downsamples = list(getattr(slide, 'level_downsamples', []))

    return jsonify({
        'dimensions': slide.dimensions,
        'level_count': dz.level_count,
        'level_dimensions': level_dimensions,
        'level_downsamples': level_downsamples,
        'tile_size': TILE_SIZE,
        'properties': dict(slide.properties)
    })



# DATO UN LIVELLO, UNA ROW E UNA COLUMN, RITORNA IL TILE CORRISPONDENTE
@app.route('/slide/<filename>/tile')
def slide_tile(filename):
    try:
        level = int(request.args.get('level', 0))
    except ValueError:
        return 'Parametro level non valido', 400

    col_arg = request.args.get('col') 
    row_arg = request.args.get('row')

    if col_arg is None or row_arg is None:
        col = 0
        row = 0
    else:
        try:
            col = int(col_arg)
            row = int(row_arg)
        except ValueError:
            return 'Parametri col/row non validi', 400

    dz = get_deepzoom(filename)
    if level < 0 or level >= dz.level_count:
        return 'Level non valido', 400

    w, h = dz.level_dimensions[level]
    max_col = (w + TILE_SIZE - 1) // TILE_SIZE
    max_row = (h + TILE_SIZE - 1) // TILE_SIZE
    if col < 0 or col >= max_col or row < 0 or row >= max_row:
        return 'Col/Row non validi', 400
    try:
        tile = dz.get_tile(level, (col, row)).convert('RGBA')
    except IndexError:
        return 'Tile non disponibile', 404
    except Exception as e:
        return f'Errore nel recupero del tile: {str(e)}', 500

    buf = io.BytesIO()
    tile.save(buf, format='PNG', compress_level=6, optimize=False)
    buf.seek(0)
    
    return Response(buf.getvalue(), mimetype='image/png', headers={'Cache-Control': 'public, max-age=31536000, immutable'})
    


# MOSTRA UNA THUMBNAIL DELLA SLIDE, SERVE PER LA MAPPATURA DELLA SLIDE IN TEMPO REALE
@app.route('/slide/<filename>/thumbnail')
def slide_thumbnail(filename):
    width = int(request.args.get('width', 1024)) 
    slide = get_slide(filename)
    w0, h0 = slide.level_dimensions[0]
    
    height = int((width / w0) * h0)
    
    thumb = slide.get_thumbnail((width, height)).convert('RGB')
    
    buf = io.BytesIO()
    thumb.save(buf, format='PNG', compress_level=9)
    
    #TODO, eliminare questa parte di codice una volta testato
    try:
        thumb.save(f'tmp/thumbnails/thumbnail_{filename}_{width}x{height}.png', format='PNG', compress_level=9)
    except:
        pass  
    buf.seek(0)
    return send_file(buf, mimetype='image/png')





if __name__ == '__main__':
    app.run(debug=True)