from flask import Flask, send_file, request, render_template, redirect, url_for, jsonify
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


def slide_path(filename):
    safe = os.path.basename(filename)
    return os.path.join(app.config['UPLOAD_FOLDER'], safe)


def print_log(dz):
    print("DeepZoomGenerator creato con i seguenti parametri:")
    print(f"  Number of levels in this object: {dz.level_count}")
    print(f"Dimensions per level: {dz.level_dimensions}")
    print(f"Total number of tiles : {dz.tile_count}")



# HOME PAGE
@app.route('/')
def home():
    return render_template('index.html')



# RICEVE FILE WSI DAL SERVER
@app.route('/upload', methods=['POST'])
def upload_file():
    file = request.files['file']
    if file and file.filename.endswith('.svs'):
        filepath = slide_path(file.filename)
        file.save(filepath)
        print(f"File {filepath} caricato con successo.")
        return redirect(url_for('view_file', filename=file.filename))
    return 'Formato file non supportato', 400
    


# VISUALIZZA FILE WSI
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



# PROPRIETA' DELLA SLIDE
@app.route('/slide/<filename>/info')
def slide_info(filename):
    print(f"\n[INFO] Richiesta info per file: {filename}")
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

    print(f"  Dimensioni immagine: {slide.dimensions}")
    print(f"  Numero livelli: {dz.level_count}")
    print(f"  Downsamples per livello: {level_downsamples}")
    
    return jsonify({
        'dimensions': slide.dimensions,
        'level_count': dz.level_count,
        'level_dimensions': level_dimensions,
        'level_downsamples': level_downsamples,
        'tile_size': getattr(dz, 'tile_size', 256),
        'properties': dict(slide.properties)
    })



# FORNISCE I TILE PER OGNI LIVELLO
@app.route('/slide/<filename>/tile')
def slide_tile(filename):
    try:
        level = int(request.args.get('level', 0))
    except ValueError:
        return 'Parametro level non valido', 400

    col_arg = request.args.get('col') if request.args.get('col') is not None else request.args.get('x')
    row_arg = request.args.get('row') if request.args.get('row') is not None else request.args.get('y')

    if col_arg is None or row_arg is None:
        print(f"[TILE] Parametri col/row mancanti per file={filename}, defaulting to 0,0")
        col = 0
        row = 0
    else:
        try:
            col = int(col_arg)
            row = int(row_arg)
        except ValueError:
            return 'Parametri col/row non validi', 400

    print(f"[TILE] Richiesta tile: file={filename} level={level} col={col} row={row}")
    dz = get_deepzoom(filename)
    w, h = dz.level_dimensions[level]
    max_col = (w + TILE_SIZE - 1) // TILE_SIZE
    max_row = (h + TILE_SIZE - 1) // TILE_SIZE
    print(f"[TILE] Livello {level} dimensioni: {w}x{h}, max_col={max_col}, max_row={max_row}")
    if col < 0 or col >= max_col or row < 0 or row >= max_row:
        print(f"[TILE] ERRORE: coordinate tile non valide: col={col} (max {max_col}), row={row} (max {max_row})")

    try:
        tile = dz.get_tile(level, (col, row)).convert('RGB')
        print(f"[TILE] Tile ottenuto con successo: {filename} L{level} C{col} R{row}")
    except IndexError:
        print(f"[TILE] ERRORE IndexError: file={filename} level={level} col={col} row={row}")
        return 'Tile non disponibile', 404
    except Exception as e:
        print(f"[TILE] ERRORE Exception: file={filename} level={level} col={col} row={row} - {str(e)}")
        return f'Errore nel recupero del tile: {str(e)}', 500

    buf = io.BytesIO()
    tile.save(buf, format='PNG')
    buf.seek(0)
    print(f"[TILE] PNG salvato su buffer, dimensioni: {buf.getbuffer().nbytes} bytes")
    return send_file(buf, mimetype='image/png')



# GENERA UNA MINIATURA DELL'IMMAGINE
@app.route('/slide/<filename>/thumbnail')
def slide_thumbnail(filename):
    width = int(request.args.get('width', 1024))
    slide = get_slide(filename)
    w0, h0 = slide.level_dimensions[0]
    
    height = int((width / w0) * h0)
    
    thumb = slide.get_thumbnail((width, height)).convert('RGB')
    
    buf = io.BytesIO()
    thumb.save(buf, format='PNG', compress_level=9)
    
    try:
        thumb.save(f'tmp/thumbnails/thumbnail_{filename}_{width}x{height}.png', format='PNG', compress_level=9)
    except:
        pass
    buf.seek(0)
    print(f"[THUMBNAIL] Generata miniatura per {filename} con dimensioni {width}x{height}")
    return send_file(buf, mimetype='image/png')


if __name__ == '__main__':
    app.run(debug=True)